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
