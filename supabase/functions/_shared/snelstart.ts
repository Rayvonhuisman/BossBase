import { kiesOmzetGrootboek, kiesInkoopGrootboek } from "./grootboekKeuze.ts"

// Gedeelde SnelStart B2B-Api v2 client voor edge functions.
//
// Auth-model (docs/snelstart-b2b-api-v2-openapi.json + developer portal):
//   * Token:  POST https://auth.snelstart.nl/b2b/token
//             Content-Type: application/x-www-form-urlencoded
//             body: grant_type=clientkey&clientkey={koppelsleutel}
//             → { access_token, token_type: "bearer", expires_in: 3599 }
//             GEEN subscription key op dit endpoint, GEEN refresh token:
//             ~1 uur geldig → cachen en daarna gewoon opnieuw opvragen.
//   * API:    https://b2bapi.snelstart.nl/v2 met TWEE headers:
//             Authorization: Bearer {token}
//             Ocp-Apim-Subscription-Key: {platform subscription key}
//
// Multi-tenant model: de subscription key is ÉÉN BossBase platform-secret
// (SNELSTART_SUBSCRIPTION_KEY, edge-function secret) — nooit per tenant. Per
// bedrijf is er alleen een koppelsleutel (accounting_connections.client_key);
// die bepaalt de administratie, een apart administratie-ID bestaat niet.

const AUTH_URL = 'https://auth.snelstart.nl/b2b/token'
export const SNELSTART_API_BASE = 'https://b2bapi.snelstart.nl/v2'

export function getSubscriptionKey(): string {
  const key = Deno.env.get('SNELSTART_SUBSCRIPTION_KEY') ?? ''
  if (!key) throw new Error('SNELSTART_SUBSCRIPTION_KEY ontbreekt (edge-function secret)')
  return key
}

// In-memory token cache per koppelsleutel: warme edge-instances hergebruiken zo
// het ~1u geldige token. 60s marge vóór expiry; 401 op de API leegt de cache.
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getSnelStartToken(clientKey: string): Promise<string> {
  const cached = tokenCache.get(clientKey)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'clientkey', clientkey: clientKey }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`SnelStart auth ${res.status}: ${body.substring(0, 300)}`)
    if (res.status === 400 || res.status === 401) {
      throw new Error('SnelStart-koppelsleutel ongeldig of ingetrokken')
    }
    throw new Error(`SnelStart auth mislukt (${res.status})`)
  }
  const json = await res.json()
  if (!json.access_token) throw new Error('Geen access_token in SnelStart auth-response')

  const ttlMs = Math.max(60, (Number(json.expires_in) || 3599) - 60) * 1000
  tokenCache.set(clientKey, { token: json.access_token, expiresAt: Date.now() + ttlMs })
  return json.access_token
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Fetch-helper: zet beide vereiste headers, hernieuwt het token één keer bij een
// 401 en vertaalt 403 (ontbrekende scope in de sleutel) naar een duidelijke fout.
export async function ssFetch(clientKey: string, path: string, options: RequestInit = {}) {
  await sleep(150) // rustig aan i.v.m. de (ongepubliceerde) API-limieten
  const doFetch = async () => fetch(`${SNELSTART_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${await getSnelStartToken(clientKey)}`,
      'Ocp-Apim-Subscription-Key': getSubscriptionKey(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })

  let res = await doFetch()
  if (res.status === 401) {
    tokenCache.delete(clientKey)
    res = await doFetch()
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`SnelStart API ${res.status} op ${path}: ${body.substring(0, 300)}`)
    if (res.status === 401) throw new Error('SnelStart-koppelsleutel ongeldig of ingetrokken')
    if (res.status === 403) throw new Error(`SnelStart weigert toegang (403) op ${path}: de koppelsleutel mist de benodigde scope`)
    const fout: any = new Error(`SnelStart ${res.status} op ${path}: ${body.substring(0, 200)}`)
    // Gestructureerde foutcodes meegeven, zodat een aanroeper kan reageren op
    // een specifiek geweigerd veld i.p.v. de tekst te moeten uitlezen.
    fout.status = res.status
    try {
      const geparsed = JSON.parse(body)
      fout.snelstartFouten = Array.isArray(geparsed) ? geparsed : [geparsed]
    } catch { fout.snelstartFouten = [] }
    throw fout
  }
  if (res.status === 204) return null
  return res.json()
}

// OData-paginering: veel GET-endpoints (o.a. /relaties, /inkoopfacturen) geven
// een platte array terug; doorbladeren met $top/$skip tot een niet-volle pagina.
export async function ssFetchAll(clientKey: string, path: string, pageSize = 500): Promise<any[]> {
  const sep = path.includes('?') ? '&' : '?'
  const all: any[] = []
  for (let skip = 0; ; skip += pageSize) {
    const page = await ssFetch(clientKey, `${path}${sep}$top=${pageSize}&$skip=${skip}`)
    const items = Array.isArray(page) ? page : []
    all.push(...items)
    if (items.length < pageSize) break
  }
  return all
}

// Enkele quote escapen voor OData string-literals ('  →  '')
export const odataQuote = (s: string) => `'${String(s).replace(/'/g, "''")}'`

// Zoekt de relatie voor een BossBase-klant, of maakt hem aan; schrijft
// customers.snelstart_id terug. Gebruikt door contacten-sync én factuur-push.
// Scopes: relaties:read + relaties:write.
// LET OP: SnelStart's OData-schema op /relaties kent geen $filter op naam
// (400 "Could not find a property named 'naam'"), dus het matchen gebeurt
// client-side. Geef bij bulk-gebruik `bekendeRelaties` mee (één keer opgehaald)
// om niet per klant de hele relatielijst te hoeven laden.
// Welke adresvelden ontbreken er bij een klant? SnelStart accepteert relaties
// zonder adres zonder te klagen, dus zonder deze controle sijpelt onvolledige
// data ongemerkt de boekhouding in.
export function ontbrekendeAdresvelden(customer: any): string[] {
  const mist: string[] = []
  if (!String(customer?.address || '').trim()) mist.push('adres')
  if (!String(customer?.postcode || '').trim()) mist.push('postcode')
  if (!String(customer?.city || '').trim()) mist.push('plaats')
  return mist
}

export async function ensureRelatie(
  supabase: any, clientKey: string, customer: any, bekendeRelaties?: any[],
  meldingen?: string[],
): Promise<string | null> {
  if (customer.snelstart_id) return customer.snelstart_id
  const naam = (customer.name || '').trim()
  if (!naam) return null

  const relaties = bekendeRelaties ?? await ssFetchAll(clientKey, '/relaties')
  const match = relaties.find((r: any) => (r?.naam || '').trim().toLowerCase() === naam.toLowerCase())
  let relatieId: string | null = match?.id ?? null

  if (!relatieId) {
    // Velden volgens RelatieWriteModel: adres heet vestigingsAdres, huisnummer
    // zit ín straat, relatiesoort is een array.
    const body: Record<string, unknown> = {
      relatiesoort: ['Klant'],
      naam,
      email: customer.email || undefined,
      telefoon: customer.phone || undefined,
    }
    if (customer.address || customer.city || customer.postcode) {
      body.vestigingsAdres = {
        straat: customer.address || undefined,
        postcode: customer.postcode || undefined,
        plaats: customer.city || undefined,
      }
    }
    const { id, overgeslagen } = await maakRelatie(clientKey, body)
    relatieId = id
    if (overgeslagen.length && meldingen) {
      meldingen.push(
        `Klant "${naam}" is aangemaakt zonder ${overgeslagen.map(relatieVeldLabel).join(' en ')} — `
        + `SnelStart wees ${overgeslagen.length === 1 ? 'die waarde' : 'die waarden'} af als ongeldig.`,
      )
    }
  }

  if (relatieId) {
    await supabase.from('customers').update({ snelstart_id: String(relatieId) }).eq('id', customer.id)
  }
  return relatieId
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ── BTW-regime ───────────────────────────────────────────────────────────────
// factuur_regels.btw_regime: 'normaal' | 'verlaagd' | 'verlegd' (migratie
// 20260821120000_btw_regime.sql). Vóór die migratie bestond alleen btw_pct en
// moest hier geraden worden wat 0% betekende — dat ging mis. Regels zonder
// regime (oude data, andere schrijvers) vallen terug op het percentage.
export type BtwRegime = 'normaal' | 'verlaagd' | 'vrijgesteld' | 'verlegd'

export function regimeVanRegel(r: any): BtwRegime {
  const opgeslagen = String(r?.btw_regime || '')
  if (opgeslagen === 'normaal' || opgeslagen === 'verlaagd'
      || opgeslagen === 'vrijgesteld' || opgeslagen === 'verlegd') {
    return opgeslagen
  }
  // Regels zonder regime (van vóór btw_regime): 0% valt terug op vrijgesteld.
  // Dat is de onschuldigste aanname — vrijgesteld mag naast belaste regels
  // staan, verlegd niet (SnelStart weigert die combinatie met BOE-0062).
  const pct = Number(r?.btw_pct ?? 21)
  if (pct === 9) return 'verlaagd'
  if (pct === 0) return 'vrijgesteld'
  return 'normaal'
}

// Regime → btwSoort op de boekingsregel (enum: Geen|Laag|Hoog|Overig).
// Verlegd staat op de regel als 'Geen' — de verlegging zelf wordt vastgelegd in
// de btw-collectie met VerkopenVerlegd.
function regelBtwSoort(regime: BtwRegime, pct: number): string {
  if (regime === 'verlaagd') return 'Laag'
  // Zowel vrijgesteld als verlegd staan op de REGEL als 'Geen' — de enum op
  // regelniveau kent alleen Geen/Laag/Hoog/Overig. Het onderscheid zit in het
  // grootboek en, bij verlegd, in de btw-collectie.
  if (regime === 'verlegd' || regime === 'vrijgesteld') return 'Geen'
  if (pct === 21) return 'Hoog'
  if (pct === 0) return 'Geen'
  return 'Overig'
}

// Regime → btwSoort in de btw-collectie (VerkoopBoekingBtwRegelModel).
function afdrachtBtwSoort(regime: BtwRegime, pct: number): string {
  if (regime === 'verlegd') return 'VerkopenVerlegd'
  if (regime === 'verlaagd') return 'VerkopenLaag'
  if (pct === 21) return 'VerkopenHoog'
  return 'VerkopenOverig'
}

// Vrijgesteld krijgt GEEN regel in de btw-collectie: er is niets af te dragen
// en niets aan te geven. Beide komen op de aangifte in rubriek 1e; alleen de
// btw-collectie onderscheidt ze in de boekhouding.

// Regime → gewenste grootboekfunctie voor de omzetregel.
// Vrijgesteld én verlegd gaan naar hetzelfde grootboek. Dat is geen compromis:
// SnelStart's eigen standaardschema doet het ook zo — 8240 "Omzet nultarief" en
// 8250 "Omzet verlegd" delen de functie VerkopenOmzetOnbelastVerlegd, en beide
// komen op de aangifte in rubriek 1e. Het onderscheid zit in de btw-collectie:
// verlegd krijgt een VerkopenVerlegd-regel, vrijgesteld niet.
//
// VerkopenBtwVrij bestaat wél in de API-enum maar in geen enkele standaard-
// administratie (0 van 233 grootboeken), en aanmaken via POST /grootboeken
// geeft een 500. Daarom niet gebruikt.
// De keuze van de rekening zelf staat in _shared/grootboekKeuze.ts: op nummer,
// met de functie als controle. Zoeken op functie alléén wees geen rekening aan
// maar een groep van tientallen, waaruit willekeurig geplukt werd.
const REGIME_LABEL: Record<BtwRegime, string> = {
  normaal: 'normaal (21%)',
  verlaagd: 'verlaagd (9%)',
  vrijgesteld: 'vrijgesteld (0%)',
  verlegd: 'btw verlegd (0%)',
}

// Per bedrijf ingestelde grootboekrekeningen (laag 2). Sleutel is
// 'kosten:<categorie>' of 'omzet:<regime>', waarde het rekeningnummer.
export type Voorkeuren = Record<string, number | null | undefined>

// Leest de instellingen van één bedrijf. Leeg als er niets is ingesteld — dan
// gelden de standaard voorkeursnummers uit grootboekKeuze.ts.
export async function getGrootboekVoorkeuren(admin: any, companyId: string): Promise<Voorkeuren> {
  const { data, error } = await admin
    .from('grootboek_voorkeuren')
    .select('sleutel, grootboek_nummer')
    .eq('company_id', companyId)
    .eq('provider', 'snelstart')
  // Bestaat de tabel nog niet (migratie niet gedraaid), dan gewoon door met de
  // standaardmapping in plaats van de hele sync laten klappen.
  if (error) { console.warn('Grootboekvoorkeuren niet gelezen:', error.message); return {} }
  const uit: Voorkeuren = {}
  for (const r of (data || [])) uit[r.sleutel] = Number(r.grootboek_nummer) || null
  return uit
}

export async function getActieveGrootboeken(clientKey: string): Promise<any[]> {
  // Geen OData-$filter op nonactief: dat veld zit wel in het JSON-model maar
  // niet in SnelStart's OData-schema (400 "Could not find a property named
  // 'nonactief'"). Daarom alles ophalen en hier filteren.
  const alle = await ssFetchAll(clientKey, '/grootboeken')
  return alle.filter((g: any) => g?.nonactief !== true)
}

// Pusht ÉÉN BossBase-factuur als verkoopboeking naar SnelStart
// (POST /v2/verkoopboekingen, scope boekhouden:write). VerkoopBoekingModel:
// required factuurnummer + klant {id} + boekingsregels; regelbedragen EXCLUSIEF
// btw; btw apart per tarief; elke regel een grootboek-id op grootboekfunctie;
// factuurbedrag = som regels + btw. Idempotent via facturen.snelstart_id.
// `grootboeken` mag voorgeladen worden (getActieveGrootboeken) bij bulk-runs.
export async function pushVerkoopboeking(
  admin: any, clientKey: string, companyId: string, factuur: any, regels: any[],
  grootboeken?: any[], bekendeRelaties?: any[], meldingen?: string[],
  voorkeuren?: Voorkeuren,
) {
  if (factuur.snelstart_id) {
    return { snelstart_id: factuur.snelstart_id, already_synced: true }
  }
  if (!regels.length) throw new Error('Factuur heeft geen regels')

  const customer = factuur.customers
  if (!customer) throw new Error('Factuur heeft geen klant')
  const relatieId = await ensureRelatie(admin, clientKey, { ...customer, id: factuur.customer_id }, bekendeRelaties, meldingen)
  if (!relatieId) throw new Error('Kon geen SnelStart-relatie bepalen voor de klant')

  const gbs = grootboeken ?? await getActieveGrootboeken(clientKey)
  // Waarschuwingen over teruggevallen rekeningen één keer per factuur melden,
  // niet één keer per regel: drie regels van hetzelfde regime gaven anders drie
  // identieke meldingen.
  const gemeld = new Set<string>()
  const grootboekVoorRegime = (regime: BtwRegime, pct: number): string => {
    const eigen: string[] = []
    const keuze = kiesOmzetGrootboek(gbs, regime, pct, voorkeuren?.[`omzet:${regime}`], eigen)
    for (const m of eigen) if (!gemeld.has(m)) { gemeld.add(m); meldingen?.push(m) }
    return keuze.id
  }

  const regelExcl = (r: any) =>
    Number(r.regelprijs) || (r.type === 'vast' ? 1 : Number(r.aantal || 1)) * Number(r.eenheidsprijs || 0)

  const boekingsregels = regels.map((r: any) => {
    const pct = Number(r.btw_pct ?? 21)
    const regime = regimeVanRegel(r)
    return {
      omschrijving: r.omschrijving || factuur.nummer,
      grootboek: { id: grootboekVoorRegime(regime, pct) },
      bedrag: round2(regelExcl(r)),
      btwSoort: regelBtwSoort(regime, pct),
    }
  })

  // BTW-collectie. Verlegde regels hebben géén btw-bedrag maar moeten wél
  // gemeld worden: daarom een VerkopenVerlegd-regel met btwBedrag 0 zodra er
  // verlegde omzet op de factuur staat. Dat stuurt de boeking naar de
  // balansrekeningen 1673/1674 — het verschil met vrijgestelde omzet, die
  // dezelfde grootboekfunctie gebruikt maar geen btw-regel krijgt.
  const btwPerSoort = new Map<string, number>()
  for (const r of regels) {
    const pct = Number(r.btw_pct ?? 21)
    const regime = regimeVanRegel(r)
    const soort = afdrachtBtwSoort(regime, pct)
    // Vrijgesteld levert geen btw-regel op; verlegd wél (bedrag 0) omdat
    // de verlegging anders nergens uit blijkt.
    if (regime === 'vrijgesteld') continue
    const bedrag = regime === 'verlegd' ? 0 : regelExcl(r) * pct / 100
    if (regime !== 'verlegd' && pct === 0) continue
    btwPerSoort.set(soort, (btwPerSoort.get(soort) || 0) + bedrag)
  }
  const btw = [...btwPerSoort.entries()].map(([btwSoort, bedrag]) => ({ btwSoort, btwBedrag: round2(bedrag) }))

  const sumExcl = boekingsregels.reduce((s, r) => s + r.bedrag, 0)
  const sumBtw = btw.reduce((s, b) => s + b.btwBedrag, 0)

  const body = {
    factuurnummer: factuur.nummer,
    factuurdatum: factuur.factuurdatum || new Date().toISOString().slice(0, 10),
    klant: { id: relatieId },
    omschrijving: `BossBase factuur ${factuur.nummer}`,
    factuurbedrag: round2(sumExcl + sumBtw),
    betalingstermijn: Number(factuur.betaaltermijn_dagen ?? 14),
    boekingsregels,
    btw,
  }
  const created = await ssFetch(clientKey, '/verkoopboekingen', { method: 'POST', body: JSON.stringify(body) })
  const snelstartId = created?.id ? String(created.id) : null

  if (snelstartId) {
    // Terugschrijven → volgende aanroep maakt geen dubbele boeking aan.
    await admin.from('facturen').update({ snelstart_id: snelstartId }).eq('id', factuur.id)
  }
  return { snelstart_id: snelstartId, already_synced: false }
}

// ── Relaties aanmaken met terugval op geweigerde velden ─────────────────────
// SnelStart valideert optionele velden streng: één ongeldig btw-nummer of IBAN
// laat de HELE relatie mislukken, en daarmee elke factuur of kostenpost die
// eraan hangt. Voor de gebruiker ziet dat eruit als "de sync doet niets".
//
// Daarom: weigert SnelStart op een optioneel veld, dan laten we dat veld weg en
// proberen we opnieuw. De relatie ontstaat dan wél; welk veld is overgeslagen
// melden we terug zodat de gebruiker het kan corrigeren.
//
// De foutcodes staan niet in de OpenAPI-spec; deze twee zijn waargenomen in de
// praktijk. Onbekende codes vallen in het vangnet hieronder.
const REL_FOUT_VELD: Record<string, string> = {
  'REL-0088': 'btwNummer',
  'REL-0011': 'iban',
}

// Velden die we in het uiterste geval allemaal weglaten. Alles wat SnelStart
// kán valideren en dat niet essentieel is voor de boeking.
const RISICOVELDEN = ['btwNummer', 'iban', 'kvkNummer', 'email', 'websiteUrl']

const VELD_LABEL: Record<string, string> = {
  btwNummer: 'btw-nummer', iban: 'IBAN', kvkNummer: 'KvK-nummer',
  email: 'e-mailadres', websiteUrl: 'website',
}

/**
 * POST /relaties met terugval. Geeft { id, overgeslagen } terug — overgeslagen
 * bevat de veldnamen die we hebben moeten weglaten.
 */
async function maakRelatie(
  clientKey: string, body: Record<string, unknown>,
): Promise<{ id: string | null; overgeslagen: string[] }> {
  const post = async (b: Record<string, unknown>) =>
    ssFetch(clientKey, '/relaties', { method: 'POST', body: JSON.stringify(b) })

  try {
    const created = await post(body)
    return { id: created?.id ? String(created.id) : null, overgeslagen: [] }
  } catch (err: any) {
    if (err?.status !== 400) throw err

    // Stap 1: alleen de velden weglaten die SnelStart bij naam noemt.
    const codes: string[] = (err.snelstartFouten ?? [])
      .map((f: any) => String(f?.errorCode || ''))
      .filter(Boolean)
    const gericht = codes.map(c => REL_FOUT_VELD[c]).filter(Boolean) as string[]

    if (gericht.length) {
      const zonder = { ...body }
      for (const v of gericht) delete zonder[v]
      try {
        const created = await post(zonder)
        return { id: created?.id ? String(created.id) : null, overgeslagen: gericht }
      } catch (err2: any) {
        if (err2?.status !== 400) throw err2
      }
    }

    // Stap 2 (vangnet): onbekende code, of het lukte nog steeds niet. Laat alle
    // valideerbare optionele velden weg — de relatie moet er komen.
    const kaal = { ...body }
    const weggelaten: string[] = []
    for (const v of RISICOVELDEN) {
      if (kaal[v] !== undefined) { delete kaal[v]; weggelaten.push(v) }
    }
    if (!weggelaten.length) throw err
    const created = await post(kaal)
    return { id: created?.id ? String(created.id) : null, overgeslagen: weggelaten }
  }
}

export const relatieVeldLabel = (veld: string) => VELD_LABEL[veld] ?? veld

// Zoekt of maakt de SnelStart-relatie voor een BossBase-leverancier.
// Spiegel van ensureRelatie, maar met relatiesoort ['Leverancier'] en met
// terugschrijven naar leveranciers.snelstart_id, zodat een volgende sync hem
// hergebruikt in plaats van een duplicaat aan te maken.
export async function ensureLeverancier(
  admin: any, clientKey: string, leverancier: any, bekendeRelaties?: any[],
  meldingen?: string[],
): Promise<string | null> {
  if (leverancier?.snelstart_id) return String(leverancier.snelstart_id)
  const naam = String(leverancier?.naam || '').trim()
  if (!naam) return null

  const relaties = bekendeRelaties ?? await ssFetchAll(clientKey, '/relaties')
  const match = relaties.find((r: any) => (r?.naam || '').trim().toLowerCase() === naam.toLowerCase())
  let relatieId: string | null = match?.id ? String(match.id) : null

  if (!relatieId) {
    const body: Record<string, unknown> = {
      relatiesoort: ['Leverancier'],
      naam,
      email: leverancier.email || undefined,
      telefoon: leverancier.telefoon || undefined,
      mobieleTelefoon: leverancier.mobiel || undefined,
      kvkNummer: leverancier.kvk_number || undefined,
      btwNummer: leverancier.btw_number || undefined,
      iban: leverancier.iban || undefined,
      websiteUrl: leverancier.website || undefined,
      memo: leverancier.notities || undefined,
      krediettermijn: leverancier.betaaltermijn_dagen ?? undefined,
      nonactief: leverancier.actief === false ? true : undefined,
    }
    if (leverancier.address || leverancier.city || leverancier.postcode || leverancier.contactpersoon) {
      body.vestigingsAdres = {
        contactpersoon: leverancier.contactpersoon || undefined,
        straat: leverancier.address || undefined,
        postcode: leverancier.postcode || undefined,
        plaats: leverancier.city || undefined,
      }
    }
    const { id, overgeslagen } = await maakRelatie(clientKey, body)
    relatieId = id
    if (overgeslagen.length && meldingen) {
      meldingen.push(
        `Leverancier "${naam}" is aangemaakt zonder ${overgeslagen.map(relatieVeldLabel).join(' en ')} — `
        + `SnelStart wees ${overgeslagen.length === 1 ? 'die waarde' : 'die waarden'} af als ongeldig. Corrigeer het en synchroniseer opnieuw.`,
      )
    }
    if (relatieId && bekendeRelaties) bekendeRelaties.push({ id: relatieId, naam })
  }

  if (relatieId && leverancier.id) {
    await admin.from('leveranciers').update({ snelstart_id: relatieId }).eq('id', leverancier.id)
  }
  return relatieId
}

// ── Bijlagen ────────────────────────────────────────────────────────────────
// Een boeking zonder bon is voor de boekhouding weinig waard. job_costs.bijlage_url
// bevat een JSON-array met paden in de PRIVÉ bucket kosten-bijlagen; die halen we
// met de service-role op en hangen we als document aan de inkoopboeking.
//
// POST /documenten/Inkoopboekingen met DocumentContentModel
// { parentIdentifier, fileName, content(base64) }. Scopes: boekhouden:write
// én documenten:write — die tweede zit mogelijk niet in oudere koppelsleutels.
//
// De spec noemt alleen bij CreateFromAttachment een harde grens van 5 MB; voor
// /documenten staat er niets. We houden dezelfde grens aan: liever overslaan met
// een melding dan een onbegrijpelijke fout.
const MAX_BIJLAGE_BYTES = 5 * 1024 * 1024

function naarBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  // In blokken, anders knalt String.fromCharCode op grote bestanden.
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(bin)
}

// Hangt de bijlage(n) van een kostenpost als document aan een bestaande
// inkoopboeking. Geeft terug hoeveel er gelukt zijn; gooit niet — een mislukte
// bijlage mag de boeking niet ongedaan maken.
export async function pushKostenBijlagen(
  admin: any, clientKey: string, cost: any, inkoopboekingId: string,
): Promise<{ gelukt: number; overgeslagen: string[] }> {
  const overgeslagen: string[] = []
  let gelukt = 0
  if (!cost?.bijlage_url || !inkoopboekingId) return { gelukt, overgeslagen }

  let paden: string[]
  try {
    const parsed = JSON.parse(cost.bijlage_url)
    paden = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    paden = [cost.bijlage_url]
  }

  for (const pad of paden) {
    const naam = String(pad || '').split('/').pop() || 'bon'
    try {
      // Legacy: een enkele rij bewaarde een publieke http-URL i.p.v. een pad.
      if (String(pad).startsWith('http')) { overgeslagen.push(`${naam} (externe URL)`); continue }

      const { data: blob, error } = await admin.storage.from('kosten-bijlagen').download(pad)
      if (error || !blob) { overgeslagen.push(`${naam} (niet gevonden)`); continue }

      const buf = await blob.arrayBuffer()
      if (buf.byteLength > MAX_BIJLAGE_BYTES) {
        overgeslagen.push(`${naam} (groter dan 5 MB)`)
        continue
      }

      await ssFetch(clientKey, '/documenten/Inkoopboekingen', {
        method: 'POST',
        body: JSON.stringify({
          parentIdentifier: inkoopboekingId,
          fileName: naam,
          content: naarBase64(buf),
        }),
      })
      gelukt++
    } catch (err: any) {
      console.error(`Bijlage ${naam} naar SnelStart mislukt:`, err?.message)
      overgeslagen.push(`${naam} (${err?.message ?? 'fout'})`)
    }
  }
  return { gelukt, overgeslagen }
}

// Hangt de factuur-PDF als document aan een bestaande verkoopboeking. De PDF
// staat in de privé-bucket factuur-pdfs op {company_id}/{factuur_id}.pdf; die
// wordt bij het versturen van de factuur weggeschreven vanuit de browser (de
// opmaak zit in jsPDF, dus hier valt niets te genereren).
//
// Staat er geen PDF, dan geeft dit `ontbreekt` terug in plaats van een fout: de
// boeking zelf is dan al gelukt en mag niet sneuvelen op een ontbrekend bestand.
// De aanroeper meldt het en probeert het bij een volgende sync opnieuw.
export async function pushFactuurPdf(
  admin: any, clientKey: string, companyId: string, factuur: any, verkoopboekingId: string,
): Promise<{ gelukt: boolean; reden?: string }> {
  if (!verkoopboekingId) return { gelukt: false, reden: 'geen boeking' }

  const pad = `${companyId}/${factuur.id}.pdf`
  try {
    const { data: blob, error } = await admin.storage.from('factuur-pdfs').download(pad)
    if (error || !blob) return { gelukt: false, reden: 'ontbreekt' }

    const buf = await blob.arrayBuffer()
    if (buf.byteLength > MAX_BIJLAGE_BYTES) return { gelukt: false, reden: 'groter dan 5 MB' }

    // Het type staat in de bestandsnaam zodat een boekhouder in SnelStart meteen
    // ziet of het een factuur of een creditnota is.
    const soort = factuur.is_credit ? 'Creditfactuur' : 'Factuur'
    await ssFetch(clientKey, '/documenten/Verkoopboekingen', {
      method: 'POST',
      body: JSON.stringify({
        parentIdentifier: verkoopboekingId,
        fileName: `${soort}-${factuur.nummer || factuur.id}.pdf`,
        content: naarBase64(buf),
      }),
    })
    await admin.from('facturen').update({ snelstart_bijlage_gesynct: true }).eq('id', factuur.id)
    return { gelukt: true }
  } catch (err: any) {
    console.error(`Factuur-PDF ${factuur.nummer} naar SnelStart mislukt:`, err?.message)
    return { gelukt: false, reden: err?.message ?? 'fout' }
  }
}

// Boekt ÉÉN handmatige BossBase-kostenregel als inkoopboeking in SnelStart
// (POST /v2/inkoopboekingen, scope boekhouden:write). De kostencategorie
// bepaalt het grootboek; belandt de boeking alsnog op de vraagpost (categorie
// onbekend of grootboek ontbreekt), dan blijft de markering + "controleren"
// staan zodat de boekhouder hem herverdeelt. Idempotent via job_costs.snelstart_id.
//
// Een leverancier is verplicht. Vroeger viel een kost zonder leverancier terug
// op een verzamelrelatie; dat leverde een fictieve relatie in de boekhouding op
// en verplaatste het uitzoekwerk naar de boekhouder. Nu weigert de boeking, zodat
// het bij de bron wordt opgelost.
export async function pushInkoopboeking(
  admin: any, clientKey: string, cost: any, grootboeken: any[],
  bekendeRelaties?: any[], meldingen?: string[], voorkeuren?: Voorkeuren,
) {
  if (cost.snelstart_id) return { snelstart_id: cost.snelstart_id, already_synced: true }

  // cost.leveranciers komt uit de join op de export-query.
  if (!cost.leveranciers?.naam) {
    throw new Error('Geen leverancier ingevuld — vul die aan bij de kostenpost en synchroniseer opnieuw')
  }
  const relatieId = await ensureLeverancier(admin, clientKey, cost.leveranciers, bekendeRelaties, meldingen)
  if (!relatieId) {
    throw new Error(`Leverancier "${cost.leveranciers.naam}" kon niet in de boekhouding worden aangemaakt`)
  }

  const pct = Number(cost.btw_percentage ?? 21)
  const categorie = String(cost.category || '').trim()
  const bedrag = Math.abs(Number(cost.amount || 0))
  // job_costs.amount is excl. of incl. btw afhankelijk van btw_inclusief.
  const excl = round2(cost.btw_inclusief ? bedrag / (1 + pct / 100) : bedrag)
  const btwBedrag = round2(excl * pct / 100)

  const keuze = kiesInkoopGrootboek(grootboeken, categorie, pct, voorkeuren?.[`kosten:${categorie}`], meldingen)
  const grootboekId = keuze.id
  const viaVraagpost = keuze.bron === 'vraagpost'
  const basisOmschrijving = cost.description || categorie || 'Kostenregel'
  // Alleen nog "controleren" als de boeking daadwerkelijk op de vraagpost
  // eindigt; een correct ingedeelde kostenpost hoeft niet nagelopen te worden.
  const omschrijving = viaVraagpost
    ? `${basisOmschrijving} (via BossBase — controleren)`
    : `${basisOmschrijving} (via BossBase)`

  const inkoopBtwSoort = pct === 9 ? 'InkopenLaag' : pct === 21 ? 'InkopenHoog' : 'InkopenOverig'

  const body: Record<string, unknown> = {
    factuurnummer: `BB-KST-${String(cost.id).slice(0, 8)}`,
    factuurdatum: cost.cost_date || new Date().toISOString().slice(0, 10),
    leverancier: { id: relatieId },
    omschrijving,
    factuurbedrag: round2(excl + btwBedrag),
    markering: viaVraagpost,
    boekingsregels: [{
      omschrijving: basisOmschrijving,
      grootboek: { id: grootboekId },
      bedrag: excl,
      btwSoort: pct === 21 ? 'Hoog' : pct === 9 ? 'Laag' : pct === 0 ? 'Geen' : 'Overig',
    }],
    btw: pct > 0 ? [{ btwSoort: inkoopBtwSoort, btwBedrag }] : [],
  }

  const created = await ssFetch(clientKey, '/inkoopboekingen', { method: 'POST', body: JSON.stringify(body) })
  const snelstartId = created?.id ? String(created.id) : null
  if (snelstartId) {
    const patch: Record<string, unknown> = { snelstart_id: snelstartId }
    // Bon meesturen. Zonder bijlage is er niets na te sturen, dus meteen op
    // gesynct; met bijlage alleen als het gelukt is — anders pikt de volgende
    // run hem op.
    if (cost.bijlage_url) {
      const r = await pushKostenBijlagen(admin, clientKey, cost, snelstartId)
      if (r.overgeslagen.length) {
        console.warn(`Kostenregel ${cost.id}: bijlagen overgeslagen — ${r.overgeslagen.join(', ')}`)
      }
      if (r.gelukt > 0 || r.overgeslagen.length === 0) patch.snelstart_bijlage_gesynct = true
    } else {
      patch.snelstart_bijlage_gesynct = true
    }
    await admin.from('job_costs').update(patch).eq('id', cost.id)
  }
  return { snelstart_id: snelstartId, already_synced: false }
}

// Loopt over alle bedrijven met een SnelStart-koppelsleutel (scheduled-modus).
// Doelen komen UITSLUITEND uit de afgebakende SECURITY DEFINER-functie
// get_snelstart_sync_targets() (alleen service_role). Zelfde patroon als
// forEachMoneybirdCompany in scheduledSync.ts.
export async function forEachSnelStartCompany(
  admin: any,
  perCompany: (companyId: string, clientKey: string) => Promise<Record<string, unknown>>,
  betweenMs = 500,
) {
  const { data: targets, error } = await admin.rpc('get_snelstart_sync_targets')
  if (error) throw error

  const list = targets ?? []
  const results: Record<string, unknown>[] = []
  const errors: { company_id: string; error: string }[] = []

  for (const c of list) {
    try {
      const r = await perCompany(c.company_id, c.client_key)
      results.push({ company_id: c.company_id, ...r })
    } catch (e: any) {
      console.error(`[snelstart-cron] bedrijf ${c.company_id} mislukt:`, e?.message)
      errors.push({ company_id: c.company_id, error: e?.message ?? String(e) })
    }
    if (betweenMs) await sleep(betweenMs)
  }

  return { scheduled: true, companies: list.length, ok: results.length, failed: errors.length, results, errors }
}

// ── Import: relaties uit SnelStart ──────────────────────────────────────────
// BossBase moet het volledige financiële beeld tonen, ook wat de boekhouder
// buiten BossBase om heeft geboekt. Daarvoor moet er méér binnenkomen dan naam,
// e-mail en plaats — dat was alles wat de contactensync las.
//
// Contactpersoon zit in het ADRESOBJECT (AdresModel.contactpersoon), niet op de
// relatie zelf; daar zocht ik hem eerst tevergeefs.
// SnelStart bewaart een Nederlands btw-nummer ZONDER landcode: NL123456782B01
// komt terug als 123456782B01. Dat is geen fout van ons, maar het heeft drie
// gevolgen: het nummer ontsnapt aan onze elfproef (valideerBtwNummer laat alles
// zonder NL-prefix ongemoeid — "buitenlands, niet ons oordeel"), hetzelfde
// bedrijf staat er anders in naargelang je het typte of ophaalde, en bij een
// volgende export sturen we de prefixloze vorm terug.
//
// Alleen aanvullen als het verder exact de Nederlandse vorm heeft: 9 cijfers,
// een B, 2 cijfers. Een buitenlands nummer draagt zijn eigen landcode en blijft
// letterlijk staan zoals het binnenkwam.
export function metNlPrefix(waarde: unknown): string | null {
  const ruw = String(waarde ?? '').trim()
  if (!ruw) return null
  const kaal = ruw.replace(/[\s.\-]/g, '').toUpperCase()
  return /^\d{9}B\d{2}$/.test(kaal) ? `NL${kaal}` : ruw
}

export function relatieNaarVelden(relatie: any): Record<string, unknown> {
  const adres = relatie?.vestigingsAdres || relatie?.correspondentieAdres || null
  return {
    naam: String(relatie?.naam || '').trim(),
    email: relatie?.email || null,
    telefoon: relatie?.telefoon || null,
    mobiel: relatie?.mobieleTelefoon || null,
    address: adres?.straat || null,
    postcode: adres?.postcode || null,
    city: adres?.plaats || null,
    contactpersoon: adres?.contactpersoon || null,
    kvk_number: relatie?.kvkNummer || null,
    btw_number: metNlPrefix(relatie?.btwNummer),
    iban: relatie?.iban || null,
    website: relatie?.websiteUrl || null,
    notities: relatie?.memo || null,
    betaaltermijn_dagen: Number.isFinite(Number(relatie?.krediettermijn)) && Number(relatie.krediettermijn) > 0
      ? Number(relatie.krediettermijn)
      : null,
  }
}

// Systeemrelaties dragen een negatief relatienummer ("Klant onbekend" = -2,
// "Leverancier onbekend" = -1). Op het nummer filteren en niet op de naam: de
// naam is taalafhankelijk, het nummer niet.
export const isSysteemrelatie = (relatie: any): boolean => {
  const code = Number(relatie?.relatiecode)
  return Number.isFinite(code) && code < 0
}

/** Alles wat de gebruiker bewust heeft weggegooid; die halen we niet terug. */
export async function getGenegeerd(admin: any, companyId: string, soort: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('import_genegeerd')
    .select('externe_id')
    .eq('company_id', companyId)
    .eq('provider', 'snelstart')
    .eq('soort', soort)
  if (error) { console.warn('Prullenbak niet gelezen:', error.message); return new Set() }
  return new Set((data || []).map((r: any) => String(r.externe_id)))
}

/**
 * Haalt één relatie op en zet hem als leverancier in BossBase, of geeft de
 * bestaande terug. Gebruikt bij het importeren van inkoopfacturen: die kwamen
 * binnen als losse kostenregels zonder leverancier, waardoor je in BossBase niet
 * kon zien bij wie er was ingekocht.
 */
export async function importeerLeverancier(
  admin: any, clientKey: string, companyId: string, relatieId: string,
  cache?: Map<string, string>,
): Promise<string | null> {
  if (!relatieId) return null
  const sleutel = String(relatieId)
  if (cache?.has(sleutel)) return cache.get(sleutel) ?? null

  const { data: bestaand } = await admin
    .from('leveranciers').select('id').eq('company_id', companyId).eq('snelstart_id', sleutel).maybeSingle()
  if (bestaand?.id) { cache?.set(sleutel, bestaand.id); return bestaand.id }

  try {
    const relatie = await ssFetch(clientKey, `/relaties/${sleutel}`)
    const velden = relatieNaarVelden(relatie)
    if (!velden.naam) return null

    // Bestaat hij al op naam (bijvoorbeeld handmatig aangemaakt), dan koppelen
    // in plaats van een tweede rij maken.
    const { data: opNaam } = await admin
      .from('leveranciers').select('id').eq('company_id', companyId).ilike('naam', String(velden.naam)).maybeSingle()
    if (opNaam?.id) {
      await admin.from('leveranciers').update({ snelstart_id: sleutel }).eq('id', opNaam.id)
      cache?.set(sleutel, opNaam.id)
      return opNaam.id
    }

    const { data: nieuw } = await admin
      .from('leveranciers').insert({ company_id: companyId, snelstart_id: sleutel, actief: true, ...velden })
      .select('id').single()
    if (nieuw?.id) { cache?.set(sleutel, nieuw.id); return nieuw.id }
  } catch (err: any) {
    console.error(`Leverancier ${sleutel} ophalen mislukt:`, err?.message)
  }
  return null
}

// ── Import: verkoopfacturen ─────────────────────────────────────────────────
// Zodat het omzetbeeld compleet is, inclusief facturen die de boekhouder zelf
// heeft geboekt.
//
// Twee endpoints nodig. GET /verkoopfacturen geeft nummer, datum, klant, bedrag
// en openstaand saldo — maar GEEN regels en GEEN btw-uitsplitsing. Die zitten in
// de onderliggende boeking: GET /verkoopboekingen/{id} levert boekingsregels en
// btw per soort.
//
// Het btw-REGIME per regel is niet als veld beschikbaar, maar wel af te leiden
// uit de grootboekfunctie van de regel — dat is precies de indeling die wij bij
// het exporteren aanbrengen, teruggelezen. Vrijgesteld en verlegd delen die
// functie; ze zijn uit elkaar te houden aan de aanwezigheid van een
// VerkopenVerlegd-btwregel op de boeking.
export function regimeUitGrootboekfunctie(functie: string, boekingHeeftVerlegd: boolean): BtwRegime {
  if (functie === 'VerkopenOmzetLaag') return 'verlaagd'
  if (functie === 'VerkopenOmzetOnbelastVerlegd') return boekingHeeftVerlegd ? 'verlegd' : 'vrijgesteld'
  return 'normaal'
}

export const btwPctVoorRegime = (regime: BtwRegime): number =>
  regime === 'verlaagd' ? 9 : regime === 'normaal' ? 21 : 0

// Dezelfde relatie, maar naar de kolomnamen van `customers`. Die tabel heet
// zijn velden anders (name/phone i.p.v. naam/telefoon) en kent geen apart
// mobiel nummer; dat valt terug op het vaste nummer.
export function relatieNaarKlantVelden(relatie: any): Record<string, unknown> {
  const v = relatieNaarVelden(relatie)
  return {
    name: v.naam,
    email: v.email,
    phone: v.telefoon || v.mobiel,
    address: v.address,
    postcode: v.postcode,
    city: v.city,
    contactpersoon: v.contactpersoon,
    kvk_number: v.kvk_number,
    btw_number: v.btw_number,
    iban: v.iban,
    website: v.website,
    notities: v.notities,
    betaaltermijn_dagen: v.betaaltermijn_dagen,
  }
}

// Alleen velden die iets bevatten. Bij het bijwerken van een bestaande relatie
// mag een leeg veld uit SnelStart niet iets overschrijven dat hier wél is
// ingevuld — de klant kan gegevens hebben aangevuld die daar ontbreken.
export const alleenGevuld = (velden: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(velden).filter(([, w]) => w !== null && w !== undefined && w !== ''))

// ── Import: documenten ophalen ──────────────────────────────────────────────
// Een boeking in SnelStart kan documenten dragen (de bon, de factuur-PDF). Bij
// het exporteren sturen wij die mee; bij het importeren hoorden ze ook terug te
// komen — anders is een opgehaalde kostenpost een bedrag zonder bewijsstuk.
//
// GET /documenten/{id} geeft een DocumentContentModel met base64-inhoud.
async function haalDocument(clientKey: string, documentId: string): Promise<{ naam: string; bytes: Uint8Array } | null> {
  try {
    const doc = await ssFetch(clientKey, `/documenten/${documentId}`)
    if (!doc?.content) return null
    const bin = atob(String(doc.content))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { naam: String(doc.fileName || `${documentId}.pdf`), bytes }
  } catch (err: any) {
    console.error(`Document ${documentId} ophalen mislukt:`, err?.message)
    return null
  }
}

/**
 * Zet de documenten van een boeking in de bonnen-bucket en geeft de paden terug
 * voor job_costs.bijlage_url.
 */
export async function importeerKostenBijlagen(
  admin: any, clientKey: string, companyId: string, documenten: any[],
): Promise<string[]> {
  const paden: string[] = []
  for (const d of (documenten || [])) {
    const id = d?.id ?? d
    if (!id) continue
    const doc = await haalDocument(clientKey, String(id))
    if (!doc) continue
    const ext = doc.naam.includes('.') ? doc.naam.split('.').pop() : 'pdf'
    const pad = `${companyId}/import-${String(id).slice(0, 8)}.${ext}`
    const { error } = await admin.storage.from('kosten-bijlagen')
      .upload(pad, doc.bytes, { contentType: 'application/octet-stream', upsert: true })
    if (!error) paden.push(pad)
    else console.error(`Bon ${doc.naam} opslaan mislukt:`, error.message)
  }
  return paden
}

/**
 * Zet het eerste document van een verkoopboeking op het vaste factuurpad, zodat
 * het brondocument van een geïmporteerde factuur op dezelfde plek staat als de
 * PDF van een eigen factuur.
 */
export async function importeerFactuurDocument(
  admin: any, clientKey: string, companyId: string, factuurId: string, documenten: any[],
): Promise<boolean> {
  const eerste = (documenten || [])[0]
  const id = eerste?.id ?? eerste
  if (!id) return false
  const doc = await haalDocument(clientKey, String(id))
  if (!doc) return false
  const { error } = await admin.storage.from('factuur-pdfs')
    .upload(`${companyId}/${factuurId}.pdf`, doc.bytes, { contentType: 'application/pdf', upsert: true })
  if (error) { console.error(`Factuurdocument opslaan mislukt:`, error.message); return false }
  return true
}
