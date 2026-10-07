// ─────────────────────────────────────────────────────────────────────────────
// Moneybird API v2 — gedeelde client voor de edge functions.
//
// Bron: https://developer.moneybird.com en de OpenAPI-spec
// (github.com/moneybird/openapi, versie van 2026-10-05).
//
// Inloggen: OAuth2 met een app van BossBase (secrets MONEYBIRD_CLIENT_ID en
// MONEYBIRD_CLIENT_SECRET). Per bedrijf staan in accounting_connections een
// access-token (api_token), een refresh-token en de gekozen administratie. Het
// access-token verloopt volgens Moneybird "op dit moment" niet, maar dat kan
// veranderen; bij een 401 vernieuwen we het daarom één keer met het
// refresh-token. Lukt dat niet, dan is de toegang ingetrokken: koppeling_fout
// wordt gezet zodat de klant ziet dat hij opnieuw moet koppelen.
//
// Limiet: 150 verzoeken per 5 minuten, PER IP-ADRES. Al onze edge functions
// delen één uitgaand adres, dus die 150 gelden voor alle klanten samen. Daarom:
//   * we lezen RateLimit-Remaining/-Reset uit elk antwoord en wachten vóórdat
//     we tegen de muur lopen;
//   * is het wachten langer dan een run zich kan veroorloven, dan stopt de run
//     netjes (MoneybirdLimiet) en gaat de volgende run verder. Alle stappen zijn
//     daarop gebouwd: wat klaar is, is teruggeschreven, de rest volgt.
//   * een sync werkt binnen een Tijdsbudget, zodat een grote eerste import over
//     meerdere runs wordt verdeeld in plaats van op de wandkloklimiet van de
//     edge function te sneuvelen (dan is er niets vastgelegd).
//
// Synchroniseren: Moneybird heeft per soort record een /synchronization-
// endpoint dat van álle records alleen id + versie teruggeeft (één verzoek), en
// een POST om er tot 100 tegelijk volledig op te halen. Zo kost "is er iets
// veranderd?" één verzoek in plaats van een volledige lijst.
// ─────────────────────────────────────────────────────────────────────────────

export const MB_API = 'https://moneybird.com/api/v2'
export const MB_OAUTH = 'https://moneybird.com/oauth'
// Moet exact overeenkomen met de terugkeer-URL van de app op moneybird.com.
export const MB_REDIRECT_URI = 'https://www.bossbase.nl/dashboard/koppelen/moneybird'
// sales_invoices: (externe) verkoopfacturen en betalingen; documents: inkoop-
// facturen en bonnetjes; settings: grootboek, btw-tarieven, webhooks;
// bank: financiële rekeningen. Contacten vallen onder elk van deze.
export const MB_SCOPES = 'sales_invoices documents settings bank'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function clientGegevens() {
  const id = Deno.env.get('MONEYBIRD_CLIENT_ID') ?? ''
  const secret = Deno.env.get('MONEYBIRD_CLIENT_SECRET') ?? ''
  if (!id || !secret) throw new Error('De Moneybird-koppeling is niet ingericht (MONEYBIRD_CLIENT_ID/SECRET ontbreekt).')
  return { id, secret }
}

export function autoriseerUrl(state: string): string {
  const { id } = clientGegevens()
  const u = new URL(`${MB_OAUTH}/authorize`)
  u.searchParams.set('client_id', id)
  u.searchParams.set('redirect_uri', MB_REDIRECT_URI)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', MB_SCOPES)
  u.searchParams.set('state', state)
  return u.toString()
}

type Tokens = { access_token: string; refresh_token: string | null }

async function tokenVerzoek(velden: Record<string, string>): Promise<Tokens> {
  const { id, secret } = clientGegevens()
  const res = await fetch(`${MB_OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...velden }),
  })
  // Geen responsebody in de log: die kan tokens bevatten.
  if (!res.ok) {
    await res.text().catch(() => '')
    console.error(`Moneybird token-verzoek mislukt met status ${res.status}`)
    const fout: any = new Error(res.status === 400 || res.status === 401
      ? 'Moneybird heeft de toegang geweigerd. Koppel opnieuw.'
      : `Moneybird is niet bereikbaar (${res.status}). Probeer het later opnieuw.`)
    fout.status = res.status
    throw fout
  }
  const json = await res.json()
  if (!json?.access_token) throw new Error('Moneybird gaf geen toegangstoken terug.')
  return { access_token: String(json.access_token), refresh_token: json.refresh_token ? String(json.refresh_token) : null }
}

/** Wisselt de autorisatiecode uit de terugkeer-URL in voor tokens. */
export const wisselCodeIn = (code: string) =>
  tokenVerzoek({ grant_type: 'authorization_code', code, redirect_uri: MB_REDIRECT_URI })

/** Trekt een token in bij Moneybird (best-effort: loskoppelen gaat hoe dan ook door). */
export async function trekTokenIn(token: string): Promise<void> {
  try {
    const { id, secret } = clientGegevens()
    await fetch(`${MB_OAUTH}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, token }),
    })
  } catch (e: any) {
    console.warn('Token intrekken bij Moneybird mislukt:', e?.message)
  }
}

// ── Koppeling ────────────────────────────────────────────────────────────────
export type MbKoppeling = {
  admin: any            // service-role client
  companyId: string
  administratieId: string
  accessToken: string
  refreshToken: string | null
  budget?: Tijdsbudget
}

/** De koppeling van één bedrijf, of null als er geen (werkende) is. */
export async function laadKoppeling(admin: any, companyId: string): Promise<MbKoppeling | null> {
  const { data } = await admin
    .from('accounting_connections')
    .select('api_token, refresh_token, administration_id')
    .eq('company_id', companyId)
    .eq('provider', 'moneybird')
    .maybeSingle()
  if (!data?.api_token || !data?.administration_id) return null
  return {
    admin, companyId,
    administratieId: String(data.administration_id),
    accessToken: data.api_token,
    refreshToken: data.refresh_token ?? null,
  }
}

async function vernieuwToken(k: MbKoppeling): Promise<boolean> {
  if (!k.refreshToken) return false
  try {
    const t = await tokenVerzoek({ grant_type: 'refresh_token', refresh_token: k.refreshToken })
    k.accessToken = t.access_token
    if (t.refresh_token) k.refreshToken = t.refresh_token
    await k.admin.from('accounting_connections')
      .update({ api_token: k.accessToken, refresh_token: k.refreshToken, koppeling_fout: null, updated_at: new Date().toISOString() })
      .eq('company_id', k.companyId).eq('provider', 'moneybird')
    return true
  } catch {
    return false
  }
}

const TOEGANG_KWIJT = 'De toegang tot Moneybird is ingetrokken of verlopen. Koppel Moneybird opnieuw onder Instellingen › Integraties.'

async function markeerToegangKwijt(k: MbKoppeling) {
  await k.admin.from('accounting_connections')
    .update({ koppeling_fout: TOEGANG_KWIJT, updated_at: new Date().toISOString() })
    .eq('company_id', k.companyId).eq('provider', 'moneybird')
}

// ── Tijd en limiet ──────────────────────────────────────────────────────────
/**
 * Hoeveel tijd een run nog heeft. Een edge function wordt na een paar minuten
 * afgekapt; wat dan halverwege was, is niet vastgelegd. Daarom stoppen de
 * stappen zelf ruim daarvoor en gaat de volgende run verder.
 */
export class Tijdsbudget {
  private eind: number
  constructor(ms: number) { this.eind = Date.now() + ms }
  over(): number { return Math.max(0, this.eind - Date.now()) }
  op(margeMs = 0): boolean { return this.over() <= margeMs }
}

/** Herkenbare fout: de limiet is bereikt, de run stopt en de volgende gaat verder. */
export class MoneybirdLimiet extends Error {
  rateLimited = true
  constructor(public wachtMs: number) {
    super('Moneybird geeft aan dat er te veel verzoeken zijn gedaan. De synchronisatie is gestopt en gaat bij de volgende ronde verder.')
  }
}
export const isLimiet = (e: unknown) => Boolean((e as any)?.rateLimited)

// Gedeeld door alle aanroepen binnen deze instantie: de limiet geldt per IP.
let resterend: number | null = null
let resetOp = 0
const BASIS_PAUZE_MS = 120
// Langer wachten dan dit doen we niet binnen één run; dan liever stoppen.
const MAX_WACHT_MS = 15_000

function leesLimiet(res: Response) {
  // Let op: bij Moneybird is RateLimit-Remaining het aantal SECONDEN tot de
  // reset, niet het aantal verzoeken. Het aantal staat in
  // RateLimit-RequestsRemaining (gemeten 2026-10-07: remaining 15,
  // requestsremaining 138). Wie Remaining als aantal leest, remt af en wacht aan
  // het eind van elk venster — dat maakte een gewone sync tientallen seconden trager.
  const kop = res.headers.has('RateLimit-RequestsRemaining') ? 'RateLimit-RequestsRemaining' : null
  const r = kop ? Number(res.headers.get(kop)) : NaN
  const reset = Number(res.headers.get('RateLimit-Reset'))
  if (Number.isFinite(r)) resterend = r
  if (Number.isFinite(reset) && res.headers.has('RateLimit-Reset')) {
    // Seconden tot de reset, of een tijdstempel in seconden. Beide komen voor in
    // de wereld van RateLimit-headers; de documentatie zegt het niet precies.
    resetOp = reset > 1e9 ? reset * 1000 : Date.now() + reset * 1000
  }
}

async function wachtOpLimiet(budget?: Tijdsbudget) {
  // Alleen afremmen als de limiet in zicht komt. Een vaste pauze voor elk
  // verzoek maakte een gewone handmatige sync (±25 verzoeken) seconden trager
  // zonder dat het nodig was: de headers zeggen zelf hoeveel er nog over is.
  if (resterend !== null && resterend <= 20) await sleep(BASIS_PAUZE_MS)
  if (resterend === null || resterend > 3) return
  const wacht = resetOp - Date.now()
  if (wacht <= 0) { resterend = null; return }
  if (wacht > MAX_WACHT_MS || (budget && budget.over() < wacht + 5000)) throw new MoneybirdLimiet(wacht)
  console.warn(`Moneybird-limiet bijna bereikt; ${Math.round(wacht / 1000)} s wachten`)
  await sleep(wacht)
  resterend = null
}

function wachtNa429(res: Response): number {
  const h = res.headers.get('Retry-After')
  const s = Number(h)
  if (h && Number.isFinite(s)) return s * 1000
  const d = h ? Date.parse(h) : NaN
  return Number.isNaN(d) ? 5000 : Math.max(0, d - Date.now())
}

// ── Fouten ──────────────────────────────────────────────────────────────────
// Moneybird geeft fouten als {"error": "tekst"}, {"error": {"veld": ["melding"]}}
// of {"details": {...}}. Dat maken we leesbaar; de ruwe body gaat naar de log.
function leesbareFout(status: number, body: string, pad: string): string {
  let detail = ''
  try {
    const j = JSON.parse(body)
    const e = j?.error ?? j?.details ?? j
    if (typeof e === 'string') detail = e
    else if (e && typeof e === 'object') {
      detail = Object.entries(e)
        .map(([veld, m]) => `${veld}: ${Array.isArray(m) ? m.join(', ') : typeof m === 'object' ? JSON.stringify(m) : m}`)
        .join('; ')
    }
  } catch { detail = body.slice(0, 160) }
  if (status === 402) return 'Je Moneybird-abonnement staat dit niet toe (bijvoorbeeld de limiet van het gratis pakket is bereikt).'
  if (status === 403) return 'BossBase heeft geen toegang tot dit onderdeel van Moneybird. Koppel opnieuw en geef alle gevraagde rechten.'
  if (status === 404) return `Niet gevonden in Moneybird${detail ? `: ${detail}` : ''}.`
  return `Moneybird weigert dit (${status})${detail ? `: ${detail}` : ''}.`
}

export type MbFout = Error & { status?: number; velden?: unknown }

/**
 * Eén verzoek aan de API van de gekozen administratie. `pad` begint met '/'
 * en zonder '.json' (bijv. '/contacts/123'). Met `{ zonderAdministratie: true }`
 * gaat het naar /api/v2 zelf (voor /administrations).
 */
export async function mbFetch(
  k: MbKoppeling, pad: string, opties: RequestInit & { zonderAdministratie?: boolean } = {},
): Promise<any> {
  const basis = opties.zonderAdministratie ? MB_API : `${MB_API}/${k.administratieId}`
  const [p, q] = pad.split('?')
  const url = `${basis}${p}.json${q ? `?${q}` : ''}`

  const doe = () => fetch(url, {
    ...opties,
    headers: {
      'Authorization': `Bearer ${k.accessToken}`,
      'Accept': 'application/json',
      ...(opties.body && typeof opties.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(opties.headers || {}),
    },
  })

  await wachtOpLimiet(k.budget)
  let res = await doe()
  leesLimiet(res)

  if (res.status === 401) {
    await res.text().catch(() => '')
    if (await vernieuwToken(k)) {
      res = await doe()
      leesLimiet(res)
    }
    if (res.status === 401) {
      await markeerToegangKwijt(k)
      const f: MbFout = new Error(TOEGANG_KWIJT); f.status = 401; throw f
    }
  }

  for (let poging = 0; res.status === 429 && poging < 2; poging++) {
    const wacht = wachtNa429(res)
    await res.text().catch(() => '')
    if (wacht > MAX_WACHT_MS || (k.budget && k.budget.over() < wacht + 5000)) throw new MoneybirdLimiet(wacht)
    console.warn(`Moneybird 429 op ${p}; ${Math.round(wacht / 1000)} s wachten`)
    await sleep(wacht)
    res = await doe()
    leesLimiet(res)
  }
  if (res.status === 429) throw new MoneybirdLimiet(wachtNa429(res))

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`Moneybird ${res.status} op ${opties.method || 'GET'} ${p}: ${body.slice(0, 400)}`)
    const f: MbFout = new Error(leesbareFout(res.status, body, p))
    f.status = res.status
    try { f.velden = JSON.parse(body)?.error } catch { /* geen json */ }
    throw f
  }
  if (res.status === 204) return null
  const tekst = await res.text()
  return tekst ? JSON.parse(tekst) : null
}

/** Alle pagina's van een lijst (max. 100 per pagina, volgens de API). */
export async function mbAlles(k: MbKoppeling, pad: string): Promise<any[]> {
  const sep = pad.includes('?') ? '&' : '?'
  const alle: any[] = []
  for (let pagina = 1; ; pagina++) {
    const lijst = await mbFetch(k, `${pad}${sep}per_page=100&page=${pagina}`)
    const items = Array.isArray(lijst) ? lijst : []
    alle.push(...items)
    if (items.length < 100) break
  }
  return alle
}

/** Van álle records van deze soort alleen id en versie, in één verzoek. */
export async function mbSyncLijst(k: MbKoppeling, soort: string, filter?: string): Promise<{ id: string; version: number }[]> {
  const q = filter ? `?filter=${encodeURIComponent(filter)}` : ''
  const lijst = await mbFetch(k, `/${soort}/synchronization${q}`)
  return (Array.isArray(lijst) ? lijst : []).map((r: any) => ({ id: String(r.id), version: Number(r.version) }))
}

/** Volledige records ophalen, 100 per verzoek. Stopt netjes als het budget op is. */
export async function mbSyncOphalen(k: MbKoppeling, soort: string, ids: string[]): Promise<any[]> {
  const uit: any[] = []
  for (let i = 0; i < ids.length; i += 100) {
    if (k.budget?.op(10_000)) break
    const deel = await mbFetch(k, `/${soort}/synchronization`, {
      method: 'POST',
      body: JSON.stringify({ ids: ids.slice(i, i + 100) }),
    })
    if (Array.isArray(deel)) uit.push(...deel)
  }
  return uit
}

/** Een bestand uploaden als bijlage (multipart, veld `file`). */
export async function mbUpload(k: MbKoppeling, pad: string, bytes: Uint8Array, bestandsnaam: string, type = 'application/pdf') {
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart], { type }), bestandsnaam)
  return mbFetch(k, pad, { method: 'POST', body: form })
}

/** Een bijlage downloaden. Moneybird antwoordt met een redirect naar een tijdelijke URL. */
export async function mbDownload(k: MbKoppeling, pad: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  await wachtOpLimiet(k.budget)
  const res = await fetch(`${MB_API}/${k.administratieId}${pad}.json`, {
    headers: { 'Authorization': `Bearer ${k.accessToken}` },
    redirect: 'follow',
  })
  leesLimiet(res)
  if (!res.ok) { await res.text().catch(() => ''); return null }
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('Content-Type') || 'application/octet-stream' }
}

/** De administraties waar dit token bij kan. */
export async function haalAdministraties(accessToken: string): Promise<{ id: string; naam: string; opgeschort: boolean }[]> {
  const k: MbKoppeling = { admin: null, companyId: '', administratieId: '', accessToken, refreshToken: null }
  const lijst = await mbFetch(k, '/administrations', { zonderAdministratie: true })
  return (Array.isArray(lijst) ? lijst : []).map((a: any) => ({
    id: String(a.id), naam: String(a.name || a.id), opgeschort: a.suspended === true,
  }))
}

// Lijsten en synchronisatie van documenten en facturen filteren standaard op
// "dit jaar", en een filter vervangt álle standaardwaarden. Een vaste naam voor
// "alles" bestaat niet (period:all is ongeldig), en een eigen bereik mag hooguit
// 10 jaar beslaan ("Period is invalid", gemeten 2026-10-06). Daarom: 8 jaar
// terug tot en met volgend jaar. Dat dekt de wettelijke bewaartermijn van 7 jaar.
const ditJaar = new Date().getUTCFullYear()
export const MB_HELE_PERIODE = `period:${ditJaar - 8}0101..${ditJaar + 1}1231`

// ── Eén sync tegelijk per bedrijf ───────────────────────────────────────────
// Twee runs tegelijk (twee knoppen kort na elkaar, of "betaald" tijdens een
// sync) maakten elk een contact aan voor dezelfde nieuwe klant: Moneybird's
// zoekfunctie ziet een net aangemaakt contact niet. accounting_connections.
// sync_bezig_sinds is het slot (migratie 20261007140314). Pakken gaat met één
// atomaire update; een slot ouder dan 5 minuten is van een afgekapte run en
// mag worden overgenomen.
const SLOT_VERLOOPT_MS = 5 * 60 * 1000

export async function pakSlot(admin: any, companyId: string, { wachtMs = 0 } = {}): Promise<boolean> {
  const tot = Date.now() + wachtMs
  for (;;) {
    const verlopen = new Date(Date.now() - SLOT_VERLOOPT_MS).toISOString()
    const { data } = await admin.from('accounting_connections')
      .update({ sync_bezig_sinds: new Date().toISOString() })
      .eq('company_id', companyId).eq('provider', 'moneybird')
      .or(`sync_bezig_sinds.is.null,sync_bezig_sinds.lt.${verlopen}`)
      .select('id')
    if (data?.length) return true
    if (Date.now() + 2000 > tot) return false
    await sleep(2000)
  }
}

export async function geefSlot(admin: any, companyId: string): Promise<void> {
  await admin.from('accounting_connections')
    .update({ sync_bezig_sinds: null })
    .eq('company_id', companyId).eq('provider', 'moneybird')
}

export const SYNC_BEZIG = 'Er loopt al een synchronisatie met Moneybird. Wacht tot die klaar is en probeer het dan opnieuw.'

/** Bedragen gaan als string met punt naar Moneybird, afgerond op centen. */
export const mbBedrag = (n: number) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2)
