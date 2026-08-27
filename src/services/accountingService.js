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
    importCosts: !!row.import_costs,
    syncPaidOnly: !!row.sync_paid_only,
    lastSyncedAt: row.last_synced_at || null,
    apiToken: '', subscriptionKey: '', secondaryKey: '', afasToken: '',
  }
}

// Welke boekhoudkoppelingen staan er actief? Eén RPC voor alle providers, zodat
// een scherm niet drie losse vragen stelt. Wordt gebruikt om de sync-indicator
// alleen te tonen als er echt een koppeling is: zonder deze controle bleef een
// oud moneybird_id/snelstart_id een vinkje geven nadat de koppeling was
// losgekoppeld.
export async function getActieveKoppelingen() {
  const companyId = await getCompanyId()
  if (!companyId) return {}
  const { data, error } = await supabase.rpc('get_accounting_status')
  if (error) return {}
  const actief = {}
  for (const row of (data || [])) {
    if (row?.provider) actief[row.provider] = !!row.connected
  }
  return actief
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
    importCosts: !!row.import_costs,
    syncPaidOnly: !!row.sync_paid_only,
    lastSyncedAt: row.last_synced_at || null,
    apiToken: '', subscriptionKey: '', secondaryKey: '', afasToken: '',
  }
}

export async function saveConnection({ apiToken, administrationId, provider = 'moneybird' }) {
  const { data, error } = await supabase.rpc('save_accounting_connection', {
    p_provider: provider,
    p_secret: apiToken,
    p_administration_id: administrationId,
  })
  if (error) throw error
  return rpcRowToStatus(data)
}

export async function testMoneybirdConnection(apiToken, administrationId) {
  const { data, error } = await supabase.functions.invoke('moneybird-test', {
    body: { api_token: apiToken, administration_id: administrationId },
  })
  if (error) throw error
  return data
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

export async function importKostenVanuitMoneybird() {
  const { data, error } = await supabase.functions.invoke('moneybird-import-kosten', {
    body: {},
  })
  if (error) throw error
  // BTW data syncen voor beide periode types (fouten hier falen stil)
  await Promise.allSettled([
    supabase.functions.invoke('moneybird-sync-btw', { body: { periode_type: 'kwartaal' } }),
    supabase.functions.invoke('moneybird-sync-btw', { body: { periode_type: 'maand' } }),
  ])
  return data
}

export async function syncContactenMetMoneybird() {
  const { data, error } = await supabase.functions.invoke('moneybird-sync-contacten', {
    body: {},
  })
  if (error) throw error
  return data
}

// Testfase: de klant voert zijn koppelsleutel handmatig in. Na certificering
// komt de sleutel binnen via de oAuth-activatielink + snelstart-webhook en
// vervalt deze handmatige invoer. De subscription key is een platform-secret
// van BossBase (edge functions) en hoort hier dus nooit thuis.
// Alle snelstart_id-verwijzingen van het eigen bedrijf wissen, zodat een
// volgende sync opnieuw boekt. Nodig na het intrekken van een sleutel of het
// wisselen van administratie: zonder reset ziet de export alles als "al
// gesynchroniseerd" en meldt hij overal 0.
export async function resetSnelStartKoppeling() {
  const { data, error } = await supabase.rpc('reset_snelstart_koppeling')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  vergeetKoppelStatus('snelstart')
  return {
    klanten: row?.klanten ?? 0,
    leveranciers: row?.leveranciers ?? 0,
    facturen: row?.facturen ?? 0,
    kosten: row?.kosten ?? 0,
  }
}

export async function saveSnelStartConnection({ clientKey }) {
  const { data, error } = await supabase.rpc('save_accounting_connection', {
    p_provider: 'snelstart',
    p_secret: clientKey,
  })
  if (error) throw error
  return rpcRowToStatus(data)
}

export async function testSnelStartConnection(clientKey) {
  const { data, error } = await supabase.functions.invoke('snelstart-test', {
    body: clientKey ? { client_key: clientKey } : {},
  })
  if (error) throw error
  return data
}

// Kosten-import aan/uit (standaard uit). Alleen het vinkje — de import zelf
// draait via importKostenVanuitSnelStart of de scheduled-modus.
export async function setSnelStartImportCosts(enabled) {
  const companyId = await getCompanyId()
  if (!companyId) return
  const { error } = await supabase
    .from('accounting_connections')
    .update({ import_costs: !!enabled, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('provider', 'snelstart')
  if (error) throw error
}

// "Alleen betaalde facturen synchroniseren" aan/uit (standaard uit); geldt per
// provider (moneybird/snelstart) en wordt server-side gelezen door de
// sync-functies.
export async function setSyncPaidOnly(provider, enabled) {
  const companyId = await getCompanyId()
  if (!companyId) return
  const { error } = await supabase
    .from('accounting_connections')
    .update({ sync_paid_only: !!enabled, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('provider', provider)
  if (error) throw error
}

export async function importKostenVanuitSnelStart() {
  const { data, error } = await supabase.functions.invoke('snelstart-import-kosten', {
    body: {},
  })
  if (error) throw error
  // Btw-overzicht bijwerken vanuit de echte SnelStart-aangiftes (faalt stil,
  // bijv. zolang de btwaangiftes:read-scope ontbreekt op de sleutel).
  await supabase.functions.invoke('snelstart-sync-btw', { body: {} }).catch(() => {})
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

export async function updateContactInMoneybird(customerId) {
  const { data, error } = await supabase.functions.invoke('moneybird-update-contact', {
    body: { customer_id: customerId },
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
export async function getGrootboekrekeningen() {
  const { data, error } = await supabase.functions.invoke('snelstart-grootboek-setup', {
    body: { lijst: true },
  })
  if (error) throw error
  return { grootboeken: data?.grootboeken || [], standaarden: data?.standaarden || {} }
}

export async function getGrootboekVoorkeuren() {
  const { data, error } = await supabase
    .from('grootboek_voorkeuren')
    .select('sleutel, grootboek_nummer, omschrijving')
    .eq('provider', 'snelstart')
  if (error) throw error
  const uit = {}
  for (const r of (data || [])) uit[r.sleutel] = { nummer: r.grootboek_nummer, omschrijving: r.omschrijving }
  return uit
}

/**
 * Legt één keuze vast, of wist hem als `grootboek` leeg is — dan valt de
 * koppeling terug op de standaardindeling.
 */
export async function setGrootboekVoorkeur(sleutel, grootboek) {
  const companyId = await getCompanyId()
  if (!grootboek?.nummer) {
    const { error } = await supabase.from('grootboek_voorkeuren')
      .delete().eq('company_id', companyId).eq('provider', 'snelstart').eq('sleutel', sleutel)
    if (error) throw error
    return null
  }
  const rij = {
    company_id: companyId,
    provider: 'snelstart',
    sleutel,
    grootboek_nummer: Number(grootboek.nummer),
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
 * Leegt de prullenbak met genegeerde importrecords, zodat alles wat in SnelStart
 * staat opnieuw opgehaald wordt — ook wat hier ooit is weggegooid.
 */
export async function haalAllesOpnieuwOp() {
  const companyId = await getCompanyId()
  const { error } = await supabase
    .from('import_genegeerd')
    .delete()
    .eq('company_id', companyId)
    .eq('provider', 'snelstart')
  if (error) throw error
  return importKostenVanuitSnelStart()
}

/**
 * Onthoudt dat een geïmporteerd record hier bewust is verwijderd. Zonder dit
 * komt het bij elke sync terug: de import kijkt naar wat er in SnelStart staat,
 * niet naar wat de gebruiker hier heeft besloten.
 *
 * @param soort  'klant' | 'leverancier' | 'factuur' | 'kost'
 */
export async function negeerBijImport(soort, externeReferentie, reden) {
  if (!externeReferentie) return
  const externeId = String(externeReferentie).replace(/^snelstart_/, '').split('_')[0]
  if (!externeId) return
  const companyId = await getCompanyId()
  await supabase.from('import_genegeerd')
    .upsert({ company_id: companyId, provider: 'snelstart', soort, externe_id: externeId, reden: reden || null },
            { onConflict: 'company_id,provider,soort,externe_id' })
}
