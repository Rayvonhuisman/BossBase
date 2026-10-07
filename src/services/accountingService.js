import { supabase } from '../lib/supabase'
import { getCompanyId } from '../lib/currentCompany'

export async function getConnection(provider = 'moneybird') {
  const companyId = await getCompanyId()
  if (!companyId) return null
  // Status via de SECURITY DEFINER-RPC: nooit tokens, alleen een `connected`-vlag.
  const { data, error } = await supabase.rpc('get_accounting_status')
  if (error) throw error
  const row = (data || []).find(r => r.provider === provider)
  if (!row) return null
  return {
    provider: row.provider,
    administrationId: row.administration_id || '',
    afasEnvironmentId: row.afas_environment_id || '',
    afasIsConnected: !!row.connected,
    connected: !!row.connected,
    lastSyncedAt: row.last_synced_at || null,
  }
}

// Opslaan loopt via de SECURITY DEFINER-RPC: een directe upsert faalt sinds de
// token-afscherming (EXCLUDED.<geheime kolom> vereist SELECT-recht). De RPC
// geeft dezelfde niet-geheime statusrij terug als get_accounting_status.
const rpcRowToStatus = (data) => {
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    provider: row.provider,
    administrationId: row.administration_id || '',
    afasEnvironmentId: row.afas_environment_id || '',
    afasIsConnected: !!row.connected,
    connected: !!row.connected,
    lastSyncedAt: row.last_synced_at || null,
  }
}
// Hier stonden apiToken/subscriptionKey/secondaryKey/afasToken als lege
// tekenreeksen. Niemand las ze, en ze wekten precies de verkeerde indruk: dat
// een statusrij het token zou kunnen bevatten. Dat kan niet — `authenticated`
// heeft niet eens SELECT-recht op die kolommen, en subscription_key en
// secondary_key bestaan al langer niet meer.

export async function saveConnection({ apiToken, administrationId, provider = 'moneybird' }) {
  const { data, error } = await supabase.rpc('save_accounting_connection', {
    p_provider: provider,
    p_secret: apiToken,
    p_administration_id: administrationId,
  })
  if (error) throw error
  vergeetKoppelStatus(provider)
  return rpcRowToStatus(data)
}

// ── Moneybird: koppelen via OAuth ───────────────────────────────────────────
// Geen token plakken meer: de klant logt in bij Moneybird en kiest een
// administratie. De tokens blijven server-side (edge function moneybird-oauth).

// Een fout uit een edge function staat in de body; supabase-js geeft dan alleen
// "non-2xx status code". Haal de echte melding eruit.
async function moneybirdActie(body) {
  const { data, error } = await supabase.functions.invoke('moneybird-oauth', { body })
  if (error) {
    let melding = error.message
    try { melding = (await error.context?.json?.())?.error || melding } catch { /* geen json */ }
    throw new Error(melding)
  }
  if (data?.success === false) throw new Error(data.error || 'Er ging iets mis met de Moneybird-koppeling')
  return data
}

/** Status van de Moneybird-koppeling, zonder geheimen. */
export async function getMoneybirdKoppeling() {
  const { data, error } = await supabase.rpc('get_moneybird_koppeling')
  if (error) throw error
  const r = (data || [])[0]
  if (!r) return { gekoppeld: false }
  return {
    gekoppeld: !!r.gekoppeld,
    administrationId: r.administration_id || '',
    administratieNaam: r.administratie_naam || '',
    fout: r.koppeling_fout || null,
    lastSyncedAt: r.last_synced_at || null,
    volledigGesynctOp: r.volledig_gesynct_op || null,
    webhookActief: !!r.webhook_actief,
  }
}

/** Geeft de inlog-URL van Moneybird; de aanroeper stuurt de browser erheen. */
export async function startMoneybirdKoppeling() {
  const r = await moneybirdActie({ actie: 'start' })
  return r.url
}

/** Verwerkt de terugkeer van Moneybird. Geeft { klaar } of { administraties, state }. */
export async function verwerkMoneybirdTerug({ code, state, fout }) {
  const r = await moneybirdActie({ actie: 'terug', code, state, fout })
  vergeetKoppelStatus('moneybird')
  return r
}

export async function kiesMoneybirdAdministratie(state, administrationId) {
  const r = await moneybirdActie({ actie: 'kies', state, administration_id: administrationId })
  vergeetKoppelStatus('moneybird')
  return r
}

export async function testMoneybirdKoppeling() {
  return moneybirdActie({ actie: 'test' })
}

export async function loskoppelenMoneybird() {
  const r = await moneybirdActie({ actie: 'los' })
  vergeetKoppelStatus('moneybird')
  return r
}

// Koppelstatus kort cachen, zodat de guards hieronder geen extra verkeer geven.
const koppelCache = new Map() // provider → { waarde, tot }
const KOPPEL_TTL_MS = 60_000

async function isGekoppeld(provider) {
  const nu = Date.now()
  const c = koppelCache.get(provider)
  if (c && c.tot > nu) return c.waarde
  try {
    const conn = await getConnection(provider)
    const waarde = Boolean(conn?.connected)
    koppelCache.set(provider, { waarde, tot: nu + KOPPEL_TTL_MS })
    return waarde
  } catch {
    koppelCache.set(provider, { waarde: false, tot: nu + KOPPEL_TTL_MS })
    return false
  }
}

/** Wist de cache — aanroepen na (ont)koppelen. */
export function vergeetKoppelStatus(provider) {
  if (provider) koppelCache.delete(provider); else koppelCache.clear()
}

/**
 * Stuurt een factuur naar de gekoppelde boekhouding. Doet niets — en maakt geen
 * netwerkaanroep — als de provider niet gekoppeld is. Zonder deze guard gaf elke
 * "factuur op betaald"-actie een 400 in de console voor de provider die de klant
 * niet gebruikt.
 */
export async function syncFactuurNaarBoekhouding(factuurId) {
  const [mb, ss] = await Promise.all([isGekoppeld('moneybird'), isGekoppeld('snelstart')])
  const taken = []
  if (mb) taken.push(syncFactuurNaarMoneybird(factuurId))
  if (ss) taken.push(syncFactuurNaarSnelStart(factuurId))
  if (!taken.length) return { skipped: true }
  return Promise.allSettled(taken)
}

export async function syncFactuurNaarMoneybird(factuurId) {
  const { data, error } = await supabase.functions.invoke('moneybird-sync-factuur', {
    body: { factuur_id: factuurId },
  })
  if (error) throw error
  return data
}

/**
 * Alles in één keer, in de juiste volgorde: eerst facturen en kosten (daarmee
 * komen leveranciers binnen via hun facturen), dan klanten en leveranciers.
 * Geeft per onderdeel wat er gebeurde.
 */
export async function syncMoneybird() {
  const data = await moneybirdSync('alles')
  const b = data?.['kosten-facturen'] || {}
  const c = data?.contacten || {}
  // Btw-overzicht voor de btw-kaart bijwerken; fouten hier falen stil.
  supabase.functions.invoke('moneybird-sync-btw', { body: {} }).catch(() => {})
  return {
    facturen: { geboekt: b.exported?.facturen || 0, betalingen: b.exported?.betalingen || 0, verrekend: b.exported?.verrekend || 0, pdfs: b.exported?.pdfs || 0, betaaldUitMoneybird: b.betaaldUitMoneybird || 0 },
    kosten: { geboekt: b.exported?.kosten || 0, bonnen: b.exported?.bonnen || 0, resterend: b.kostenResterend || 0 },
    opgehaald: { inkoopfacturen: b.imported?.inkoopfacturen || 0, verkoopfacturen: b.imported?.verkoopfacturen || 0 },
    // Nieuw in Moneybird: bij het boeken (facturen, kosten) én door de contactensync.
    klanten: {
      naarMoneybird: (b.contacten?.klanten || 0) + (c.klanten?.geexporteerd || 0),
      opgehaald: (b.contactenOpgehaald?.klanten || 0) + (c.klanten?.geimporteerd || 0),
      bijgewerkt: (c.klanten?.bijgewerkt || 0) + (c.klanten?.doorgestuurd || 0),
    },
    leveranciers: {
      naarMoneybird: b.contacten?.leveranciers || 0,
      opgehaald: (b.contactenOpgehaald?.leveranciers || 0) + (c.leveranciers?.geimporteerd || 0),
      bijgewerkt: (c.leveranciers?.bijgewerkt || 0) + (c.leveranciers?.doorgestuurd || 0),
    },
    overgeslagenUitPrullenbak: (b.overgeslagenUitPrullenbak || 0) + (c.overgeslagenUitPrullenbak || 0),
    fouten: [...(b.fouten || []), ...(c.fouten || [])],
    meldingen: [...(b.meldingen || []), ...(c.meldingen || [])],
    adresWaarschuwingen: c.adresWaarschuwingen || [],
    rest: !!data?.rest,
  }
}

// De nieuwe Moneybird-sync (edge function moneybird-sync). Fouten staan in de
// body; zie moneybirdActie.
async function moneybirdSync(onderdeel) {
  const { data, error } = await supabase.functions.invoke('moneybird-sync', { body: { onderdeel } })
  if (error) {
    let melding = error.message
    try { melding = (await error.context?.json?.())?.error || melding } catch { /* geen json */ }
    throw new Error(melding)
  }
  if (data?.success === false) throw new Error(data.error || 'Synchroniseren met Moneybird mislukt')
  return data
}

// Testfase: de klant voert zijn koppelsleutel handmatig in. Na certificering
// komt de sleutel binnen via de oAuth-activatielink + snelstart-webhook en
// vervalt deze handmatige invoer. De subscription key is een platform-secret
// van BossBase (edge functions) en hoort hier dus nooit thuis.
export async function saveSnelStartConnection({ clientKey }) {
  const { data, error } = await supabase.rpc('save_accounting_connection', {
    p_provider: 'snelstart',
    p_secret: clientKey,
  })
  if (error) throw error
  // Zonder dit blijft de gecachete koppelstatus een minuut lang op de oude
  // waarde staan, en slaat de eerstvolgende factuur-sync de export over.
  vergeetKoppelStatus('snelstart')
  return rpcRowToStatus(data)
}

// De referentiesleutel voor de SnelStart-activatielink. Per bedrijf vast en
// alleen voor admins; de webhook koppelt de binnenkomende sleutel hieraan aan
// het bedrijf. Zie migratie 20260918140000.
export async function getSnelStartReferentie() {
  const { data, error } = await supabase.rpc('snelstart_referentie')
  if (error) throw error
  return data
}

// Loskoppelen: wist de sleutel van dít bedrijf bij deze provider. Bewust een
// eigen RPC en niet saveConnection met een lege waarde — die doet met opzet een
// coalesce, zodat "geen secret meegegeven" nooit per ongeluk een sleutel wist.
// Zie migratie 20260911120000.
export async function disconnectConnection(provider = 'snelstart') {
  const { data, error } = await supabase.rpc('disconnect_accounting_connection', { p_provider: provider })
  if (error) throw error
  const row = (data || [])[0]
  return {
    provider,
    administrationId: row?.administration_id || '',
    connected: !!row?.connected,
    lastSyncedAt: row?.last_synced_at || null,
  }
}

export async function testSnelStartConnection(clientKey) {
  const { data, error } = await supabase.functions.invoke('snelstart-test', {
    body: clientKey ? { client_key: clientKey } : {},
  })
  if (error) throw error
  return data
}

// De schakelaars `import_costs` en `sync_paid_only` zijn vervallen: kosten gaan
// altijd mee en alle facturen behalve concepten worden geboekt. De kolommen
// staan er nog (zie migratie 20260828140000) maar worden nergens meer gelezen.

/**
 * De laatste synchronisatie van deze provider. Standaard die van de cron: dat
 * is de run die niemand heeft zien gebeuren. Voedt twee dingen in de
 * integratiedrawer: de regel "laatste automatische sync" en de meldingen van
 * die run. Geef `{ bron: null }` mee voor de laatste run ongeacht herkomst.
 *
 * Zonder dit was een nachtelijke run alleen in de functielogs terug te vinden,
 * en dan blijft een mislukte boeking onzichtbaar tot iemand zijn boekhouding
 * naloopt.
 */
export async function getLaatsteSyncRun(provider = 'snelstart', { bron = 'cron' } = {}) {
  let query = supabase
    .from('accounting_sync_runs')
    .select('*')
    .eq('provider', provider)
  if (bron) query = query.eq('bron', bron)
  const { data, error } = await query
    .order('gestart_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  // De tabel bestaat pas na migratie 20260828150000; tot die tijd hoort de
  // drawer gewoon te werken, alleen zonder deze regel.
  if (error) return null
  if (!data) return null
  return {
    id: data.id,
    onderdeel: data.onderdeel,
    bron: data.bron,
    gestartOp: data.gestart_op,
    klaarOp: data.klaar_op,
    // klaar_op leeg = halverwege afgekapt. Dat is geen "geslaagd" en geen
    // "mislukt", maar wel iets om te tonen.
    afgebroken: !data.klaar_op,
    gelukt: data.gelukt === true,
    fout: data.fout || null,
    fouten: Array.isArray(data.fouten) ? data.fouten : [],
    meldingen: Array.isArray(data.meldingen) ? data.meldingen : [],
  }
}

export async function importKostenVanuitSnelStart() {
  const { data, error } = await supabase.functions.invoke('snelstart-import-kosten', {
    body: {},
  })
  if (error) throw error
  // Hier stond een aanroep van snelstart-sync-btw, om het btw-overzicht bij te
  // werken uit de echte aangiftes. Die is eruit: de scope btwaangiftes:read komt
  // er niet, dus SnelStart antwoordde gegarandeerd met 403 — bij elke syncronde
  // een foutmelding in de console voor iets dat nooit kon slagen. De
  // BTW-indicatie op Financiën rekent met onze eigen facturen en kosten en heeft
  // deze aanroep niet nodig.
  return data
}

export async function syncContactenMetSnelStart() {
  const { data, error } = await supabase.functions.invoke('snelstart-sync-contacten', {
    body: {},
  })
  if (error) throw error
  return data
}

export async function syncFactuurNaarSnelStart(factuurId) {
  const { data, error } = await supabase.functions.invoke('snelstart-sync-factuur', {
    body: { factuur_id: factuurId },
  })
  if (error) throw error
  return data
}

export async function saveAfasConnection({ environmentId, token }) {
  // AFAS is pas "connected" na een geslaagde test (setAfasConnected); de RPC
  // zet is_connected zelf op false bij het opslaan van een nieuw token.
  const { data, error } = await supabase.rpc('save_accounting_connection', {
    p_provider: 'afas',
    p_secret: token,
    p_afas_environment_id: environmentId,
  })
  if (error) throw error
  vergeetKoppelStatus('afas')
  return rpcRowToStatus(data)
}

export async function testAfasConnection(environmentId, token) {
  const afasUrl = `https://sb20.afasfocus.nl/${environmentId}/profitrestservices/metainfo`
  if (import.meta.env.DEV) console.log('[afas] testAfasConnection URL:', afasUrl)
  const { data, error } = await supabase.functions.invoke('afas-test', {
    body: { environment_id: environmentId, token },
  })
  if (error) throw error
  if (import.meta.env.DEV && data?.url) console.log('[afas] Edge function gebruikte URL:', data.url)
  return data
}

export async function setAfasConnected(connected) {
  const companyId = await getCompanyId()
  if (!companyId) return
  await supabase
    .from('accounting_connections')
    .update({ is_connected: connected, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('provider', 'afas')
}

export async function importKostenVanuitAfas() {
  const { data, error } = await supabase.functions.invoke('afas-import-kosten', {
    body: {},
  })
  if (error) throw error
  return data
}

export async function syncContactenMetAfas() {
  const { data, error } = await supabase.functions.invoke('afas-sync-contacten', {
    body: {},
  })
  if (error) throw error
  return data
}

// ── Grootboekindeling per bedrijf ───────────────────────────────────────────
// Welke rekening krijgt een kostencategorie of omzetsoort in de boekhouding?
//
// Standaard kiest de koppeling zelf, op voorkeursnummers uit het gangbare
// Nederlandse rekeningschema. Dat gaat mis zodra een administratie anders is
// ingericht: een grootboekFUNCTIE wijst geen rekening aan maar een groep van
// tientallen, en dan werd er willekeurig geplukt. Hier kan de klant het
// vastleggen.

/**
 * Alle actieve grootboekrekeningen uit de administratie van de klant, plus welke
 * rekening de standaardindeling in díé administratie zou kiezen.
 *
 * Die standaarden komen van de server en worden niet in de UI nagebouwd: twee
 * lijsten die uit elkaar lopen geeft een scherm dat iets anders belooft dan de
 * sync doet.
 */
// Per provider de functie die de rekeningen (en bij Moneybird de btw-tarieven)
// uit de administratie van de klant ophaalt.
const INSTELLINGEN_FUNCTIE = {
  snelstart: 'snelstart-grootboek-setup',
  moneybird: 'moneybird-instellingen',
}

export async function getGrootboekrekeningen(provider = 'snelstart') {
  const { data, error } = await supabase.functions.invoke(INSTELLINGEN_FUNCTIE[provider], {
    body: { lijst: true },
  })
  if (error) throw error
  return {
    grootboeken: data?.grootboeken || [],
    standaarden: data?.standaarden || {},
    // Alleen Moneybird: btw-tarieven bestaan daar per administratie en moeten
    // gekoppeld worden. SnelStart kent vaste btw-soorten.
    btwTarieven: data?.btwTarieven || [],
    // Checklist na het koppelen: wat moet er in de administratie staan.
    controle: data?.controle || [],
  }
}

/** Knop "Aanmaken" in de Moneybird-checklist: de inkoopcategorie aanmaken. Geeft de verse lijst. */
export async function maakMoneybirdInkoopRekening() {
  const { data, error } = await supabase.functions.invoke('moneybird-instellingen', {
    body: { lijst: true, actie: 'aanmaken', wat: 'inkoop' },
  })
  if (error) {
    let melding = error.message
    try { melding = (await error.context?.json?.())?.error || melding } catch { /* geen json */ }
    throw new Error(melding)
  }
  if (data?.success === false) throw new Error(data.error || 'Aanmaken in Moneybird mislukt')
  return data
}

export async function getGrootboekVoorkeuren(provider = 'snelstart') {
  const { data, error } = await supabase
    .from('grootboek_voorkeuren')
    .select('sleutel, grootboek_nummer, grootboek_id, omschrijving')
    .eq('provider', provider)
  if (error) throw error
  const uit = {}
  for (const r of (data || [])) {
    uit[r.sleutel] = { nummer: r.grootboek_nummer, id: r.grootboek_id, omschrijving: r.omschrijving }
  }
  return uit
}

/**
 * Legt één keuze vast, of wist hem als `grootboek` leeg is — dan valt de
 * koppeling terug op de standaardindeling.
 */
export async function setGrootboekVoorkeur(sleutel, grootboek, provider = 'snelstart') {
  const companyId = await getCompanyId()
  // SnelStart kiest op nummer, Moneybird op id: zonder een van beide is er
  // niets gekozen en valt de koppeling terug op de standaard.
  if (!grootboek?.nummer && !grootboek?.id) {
    const { error } = await supabase.from('grootboek_voorkeuren')
      .delete().eq('company_id', companyId).eq('provider', provider).eq('sleutel', sleutel)
    if (error) throw error
    return null
  }
  const rij = {
    company_id: companyId,
    provider,
    sleutel,
    grootboek_nummer: Number(grootboek.nummer) || null,
    grootboek_id: grootboek.id || null,
    omschrijving: grootboek.omschrijving || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('grootboek_voorkeuren')
    .upsert(rij, { onConflict: 'company_id,provider,sleutel' })
  if (error) throw error
  return rij
}

/**
 * Controleert of de opgeslagen koppelsleutel naar een andere administratie
 * wijst dan de vorige keer, en zet de verwijzingen dan gericht terug.
 *
 * Vervangt de knop "Koppeling opnieuw opbouwen": die was te makkelijk per
 * ongeluk te raken en leverde zonder opruimen in SnelStart dubbele boekingen op.
 */
export async function controleerSnelStartAdministratie() {
  const { data, error } = await supabase.functions.invoke('snelstart-administratie-check', { body: {} })
  if (error) throw error
  return data
}

/**
 * Leegt de prullenbak met genegeerde importrecords en haalt daarna alles op wat
 * in SnelStart staat — ook wat hier ooit is weggegooid.
 *
 * Draait BEIDE syncs. Eerst deed hij alleen kosten en facturen, waardoor er geen
 * enkele leverancier terugkwam en alleen de klanten die toevallig aan een
 * geïmporteerde factuur hingen. Relaties eerst, zodat de facturen en kosten
 * daarna aan een bestaande klant of leverancier gekoppeld kunnen worden.
 */
export async function haalAllesOpnieuwOp(provider = 'snelstart') {
  const companyId = await getCompanyId()
  const { error } = await supabase
    .from('import_genegeerd')
    .delete()
    .eq('company_id', companyId)
    .eq('provider', provider)
  if (error) throw error

  if (provider === 'moneybird') {
    // Dezelfde volledige sync als de knop Synchroniseren, maar nu zonder prullenbak.
    const r = await syncMoneybird()
    return {
      contacten: { imported: r.klanten.opgehaald, leveranciers: { geimporteerd: r.leveranciers.opgehaald } },
      imported: r.opgehaald,
    }
  }
  const contacten = await syncContactenMetSnelStart()
  const boekingen = await importKostenVanuitSnelStart()
  return { contacten, ...boekingen }
}

const PRULLENBAK_LABEL = {
  klant: 'De klant',
  leverancier: 'De leverancier',
  factuur: 'De factuur',
  kost: 'De kostenpost',
}

/**
 * Onthoudt dat een geïmporteerd record hier bewust is verwijderd. Zonder dit
 * komt het bij elke sync terug: de import kijkt naar wat er in SnelStart staat,
 * niet naar wat de gebruiker hier heeft besloten.
 *
 * Mislukt dat schrijven, dan is het record hier wél weg maar staat het niet in
 * de prullenbak — bij de volgende sync komt het gewoon terug. Dat is geen
 * detail voor de logs: eerder werd de fout niet eens uitgelezen en stond er
 * "Verwijderd" op het scherm terwijl het record de volgende sync terugkwam.
 * Daarom geeft deze functie een zin terug die de aanroeper moet tonen.
 *
 * De rauwe databasefout gaat naar de console en niet naar de gebruiker: bij een
 * policy-fout bevat die de tekst "row-level security", en toast.error vertaalt
 * zo'n melding via nettePlanFout naar het abonnementsverhaal — dan zou de
 * eigenlijke waarschuwing van het scherm verdwijnen.
 *
 * @param soort  'klant' | 'leverancier' | 'factuur' | 'kost'
 * @returns {Promise<string|null>} null als het goed ging, anders de melding
 *   voor de gebruiker.
 */
export async function negeerBijImport(soort, externeReferentie, reden, provider = null) {
  if (!externeReferentie) return null
  // De provider volgt uit het voorvoegsel van de referentie ('snelstart_…',
  // 'moneybird_…'). Een kaal id (customers.snelstart_id, leveranciers.moneybird_id)
  // heeft dat niet; dan geeft de aanroeper hem mee. Zonder beide: SnelStart, zoals
  // het altijd was.
  const ref = String(externeReferentie)
  const uitRef = ref.startsWith('moneybird_') ? 'moneybird' : ref.startsWith('snelstart_') ? 'snelstart' : null
  const bron = provider || uitRef || 'snelstart'
  const externeId = ref.replace(new RegExp(`^${bron}_`), '').split('_')[0]
  if (!externeId) return null

  const melding = `${PRULLENBAK_LABEL[soort] || 'Het record'} is verwijderd, maar kon niet in de `
    + 'prullenbak worden gezet. Bij de volgende synchronisatie met de boekhouding komt hij terug.'

  try {
    const companyId = await getCompanyId()
    const { error } = await supabase.from('import_genegeerd')
      .upsert({ company_id: companyId, provider: bron, soort, externe_id: externeId, reden: reden || null },
              { onConflict: 'company_id,provider,soort,externe_id' })
    if (error) {
      console.error('Prullenbak niet bijgewerkt:', error.message)
      return melding
    }
    return null
  } catch (err) {
    // getCompanyId() kan ook omvallen (geen sessie meer). Zelfde gevolg voor de
    // gebruiker, dus zelfde melding.
    console.error('Prullenbak niet bijgewerkt:', err?.message || err)
    return melding
  }
}
