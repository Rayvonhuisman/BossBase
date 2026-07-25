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
    throw new Error(`SnelStart ${res.status} op ${path}: ${body.substring(0, 200)}`)
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
export async function ensureRelatie(
  supabase: any, clientKey: string, customer: any, bekendeRelaties?: any[],
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
    if (customer.address || customer.city) {
      body.vestigingsAdres = {
        straat: customer.address || undefined,
        plaats: customer.city || undefined,
      }
    }
    const created = await ssFetch(clientKey, '/relaties', { method: 'POST', body: JSON.stringify(body) })
    relatieId = created?.id ?? null
  }

  if (relatieId) {
    await supabase.from('customers').update({ snelstart_id: String(relatieId) }).eq('id', customer.id)
  }
  return relatieId
}

const round2 = (n: number) => Math.round(n * 100) / 100

// btw_pct → btwSoort op de boekingsregel (enum: Geen|Laag|Hoog|Overig)
function regelBtwSoort(pct: number): string {
  if (pct === 21) return 'Hoog'
  if (pct === 9) return 'Laag'
  if (pct === 0) return 'Geen'
  return 'Overig'
}

// btw_pct → btwSoort in de btw-collectie (af te dragen btw per tarief)
function afdrachtBtwSoort(pct: number): string {
  if (pct === 21) return 'VerkopenHoog'
  if (pct === 9) return 'VerkopenLaag'
  return 'VerkopenOverig'
}

// btw_pct → gewenste grootboekfunctie voor de omzetregel
function omzetGrootboekfunctie(pct: number): string {
  if (pct === 21) return 'VerkopenOmzetHoog'
  if (pct === 9) return 'VerkopenOmzetLaag'
  if (pct === 0) return 'VerkopenBtwVrij'
  return 'VerkopenOmzetOverig'
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
  grootboeken?: any[], bekendeRelaties?: any[],
) {
  if (factuur.snelstart_id) {
    return { snelstart_id: factuur.snelstart_id, already_synced: true }
  }
  if (!regels.length) throw new Error('Factuur heeft geen regels')

  const customer = factuur.customers
  if (!customer) throw new Error('Factuur heeft geen klant')
  const relatieId = await ensureRelatie(admin, clientKey, { ...customer, id: factuur.customer_id }, bekendeRelaties)
  if (!relatieId) throw new Error('Kon geen SnelStart-relatie bepalen voor de klant')

  const gbs = grootboeken ?? await getActieveGrootboeken(clientKey)
  const grootboekVoorPct = (pct: number): string => {
    const functie = omzetGrootboekfunctie(pct)
    // Voorkeur: het grootboek met de exacte omzetfunctie voor dit tarief.
    let gb = gbs.find((g: any) => g.grootboekfunctie === functie)
    // Fallback: niet elke administratie heeft alle omzet-grootboeken (bijv.
    // geen VerkopenBtwVrij). Het GrootboekModel geeft per grootboek de
    // toegestane btw-soorten (btwSoort-lijst); pak dan een ander
    // Verkopen-omzetgrootboek dat deze btw-soort accepteert.
    if (!gb) {
      const soort = regelBtwSoort(pct)
      gb = gbs.find((g: any) =>
        String(g.grootboekfunctie || '').startsWith('Verkopen')
        && Array.isArray(g.btwSoort) && g.btwSoort.includes(soort))
    }
    if (!gb?.id) {
      const beschikbaar = [...new Set(gbs.map((g: any) => g.grootboekfunctie).filter((f: any) => String(f || '').startsWith('Verkopen')))].join(', ')
      throw new Error(`Geen actief omzet-grootboek voor ${pct}% btw (functie ${functie}) in de administratie; beschikbare verkoopfuncties: ${beschikbaar || 'geen'}`)
    }
    return gb.id
  }

  const regelExcl = (r: any) =>
    Number(r.regelprijs) || (r.type === 'vast' ? 1 : Number(r.aantal || 1)) * Number(r.eenheidsprijs || 0)

  const boekingsregels = regels.map((r: any) => {
    const pct = Number(r.btw_pct ?? 21)
    return {
      omschrijving: r.omschrijving || factuur.nummer,
      grootboek: { id: grootboekVoorPct(pct) },
      bedrag: round2(regelExcl(r)),
      btwSoort: regelBtwSoort(pct),
    }
  })

  const btwPerSoort = new Map<string, number>()
  for (const r of regels) {
    const pct = Number(r.btw_pct ?? 21)
    if (pct === 0) continue
    const soort = afdrachtBtwSoort(pct)
    btwPerSoort.set(soort, (btwPerSoort.get(soort) || 0) + regelExcl(r) * pct / 100)
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

// Vaste verzamelleverancier waaronder handmatige BossBase-kosten in SnelStart
// worden geboekt. De boekingen staan op vraagposten + markering, dus de
// boekhouder herverdeelt ze in SnelStart naar de echte leverancier/kostenpost.
const DIVERSEN_LEVERANCIER = 'BossBase kosten (controleren)'

export async function ensureDiversenLeverancier(clientKey: string, relaties?: any[]): Promise<string> {
  const lijst = relaties ?? await ssFetchAll(clientKey, '/relaties')
  const match = lijst.find((r: any) => (r?.naam || '').trim().toLowerCase() === DIVERSEN_LEVERANCIER.toLowerCase())
  if (match?.id) return match.id
  const created = await ssFetch(clientKey, '/relaties', {
    method: 'POST',
    body: JSON.stringify({ relatiesoort: ['Leverancier'], naam: DIVERSEN_LEVERANCIER }),
  })
  if (!created?.id) throw new Error('Kon verzamelleverancier voor kosten niet aanmaken')
  return created.id
}

// Grootboek voor een kosten-export: bij voorkeur het vraagposten-grootboek
// ("nog uit te zoeken" — precies de bedoeling: de boekhouder verdeelt het zelf),
// anders een inkoop/kosten-grootboek dat de btw-soort accepteert.
function inkoopGrootboekVoorPct(gbs: any[], pct: number): string {
  const soort = regelBtwSoort(pct)
  const kandidaten = [
    gbs.find((g: any) => g.grootboekfunctie === 'InkopenVraagPosten'),
    gbs.find((g: any) => g.grootboekfunctie === 'InkopenKostenAlleBtwTarieven'),
    gbs.find((g: any) => String(g.grootboekfunctie || '').startsWith('Inkopen')
      && Array.isArray(g.btwSoort) && g.btwSoort.includes(soort)),
  ]
  const gb = kandidaten.find(Boolean)
  if (!gb?.id) {
    const beschikbaar = [...new Set(gbs.map((g: any) => g.grootboekfunctie).filter((f: any) => String(f || '').startsWith('Inkopen')))].join(', ')
    throw new Error(`Geen actief inkoop-grootboek voor ${pct}% btw in de administratie; beschikbare inkoopfuncties: ${beschikbaar || 'geen'}`)
  }
  return gb.id
}

// Boekt ÉÉN handmatige BossBase-kostenregel als inkoopboeking in SnelStart
// (POST /v2/inkoopboekingen, scope boekhouden:write). Bewust als "open"
// mutatie: vraagposten-grootboek + markering=true, zodat de gebruiker/boekhouder
// hem in SnelStart nog controleert en definitief wegboekt. Idempotent via
// job_costs.snelstart_id.
export async function pushInkoopboeking(
  admin: any, clientKey: string, cost: any, leverancierId: string, grootboeken: any[],
) {
  if (cost.snelstart_id) return { snelstart_id: cost.snelstart_id, already_synced: true }

  const pct = Number(cost.btw_percentage ?? 21)
  const bedrag = Math.abs(Number(cost.amount || 0))
  // job_costs.amount is excl. of incl. btw afhankelijk van btw_inclusief.
  const excl = round2(cost.btw_inclusief ? bedrag / (1 + pct / 100) : bedrag)
  const btwBedrag = round2(excl * pct / 100)

  const body: Record<string, unknown> = {
    factuurnummer: `BB-KST-${String(cost.id).slice(0, 8)}`,
    factuurdatum: cost.cost_date || new Date().toISOString().slice(0, 10),
    leverancier: { id: leverancierId },
    omschrijving: `${cost.description || 'Kostenregel'} (via BossBase — controleren)`,
    factuurbedrag: round2(excl + btwBedrag),
    markering: true,
    boekingsregels: [{
      omschrijving: cost.description || 'Kostenregel',
      grootboek: { id: inkoopGrootboekVoorPct(grootboeken, pct) },
      bedrag: excl,
      btwSoort: regelBtwSoort(pct),
    }],
    btw: pct > 0 ? [{ btwSoort: pct === 9 ? 'InkopenLaag' : 'InkopenHoog', btwBedrag }] : [],
  }

  const created = await ssFetch(clientKey, '/inkoopboekingen', { method: 'POST', body: JSON.stringify(body) })
  const snelstartId = created?.id ? String(created.id) : null
  if (snelstartId) {
    await admin.from('job_costs').update({ snelstart_id: snelstartId }).eq('id', cost.id)
  }
  return { snelstart_id: snelstartId, already_synced: false }
}

// Loopt over alle bedrijven met een SnelStart-koppelsleutel (scheduled-modus).
// Doelen komen UITSLUITEND uit de afgebakende SECURITY DEFINER-functie
// get_snelstart_sync_targets() (alleen service_role). Zelfde patroon als
// forEachMoneybirdCompany in scheduledSync.ts.
export async function forEachSnelStartCompany(
  admin: any,
  perCompany: (companyId: string, clientKey: string, importCosts: boolean, syncPaidOnly: boolean) => Promise<Record<string, unknown>>,
  betweenMs = 500,
) {
  const { data: targets, error } = await admin.rpc('get_snelstart_sync_targets')
  if (error) throw error

  const list = targets ?? []
  const results: Record<string, unknown>[] = []
  const errors: { company_id: string; error: string }[] = []

  for (const c of list) {
    try {
      const r = await perCompany(c.company_id, c.client_key, Boolean(c.import_costs), Boolean(c.sync_paid_only))
      results.push({ company_id: c.company_id, ...r })
    } catch (e: any) {
      console.error(`[snelstart-cron] bedrijf ${c.company_id} mislukt:`, e?.message)
      errors.push({ company_id: c.company_id, error: e?.message ?? String(e) })
    }
    if (betweenMs) await sleep(betweenMs)
  }

  return { scheduled: true, companies: list.length, ok: results.length, failed: errors.length, results, errors }
}
