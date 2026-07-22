import { supabase } from '../lib/supabase'
import { withCompanyId, getCompanyId } from '../lib/currentCompany'

// Status-object voor de UI. Bevat NOOIT de tokenwaarde zelf — die is server-side
// afgeschermd (RLS/kolomrechten) en alleen leesbaar voor de edge functions.
// `connected` komt server-side uit get_accounting_status(). De lege token-velden
// blijven bestaan zodat oudere consumers die er (per ongeluk) naar kijken een
// falsy waarde zien i.p.v. een crash — nooit een echt token.
const toStatus = (row, { connected } = {}) => row ? ({
  provider: row.provider,
  administrationId: row.administration_id || '',
  afasEnvironmentId: row.afas_environment_id || '',
  afasIsConnected: connected ?? (row.is_connected || false),
  connected: connected ?? (row.is_connected || false),
  lastSyncedAt: row.last_synced_at || null,
  apiToken: '', subscriptionKey: '', secondaryKey: '', afasToken: '',
}) : null

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
    apiToken: '', subscriptionKey: '', secondaryKey: '', afasToken: '',
  }
}

export async function saveConnection({ apiToken, administrationId, provider = 'moneybird' }) {
  const payload = await withCompanyId({
    provider,
    api_token: apiToken,
    administration_id: administrationId,
    updated_at: new Date().toISOString(),
  })
  const { data, error } = await supabase
    .from('accounting_connections')
    .upsert(payload, { onConflict: 'company_id,provider' })
    .select('provider, administration_id, afas_environment_id, is_connected, last_synced_at')
    .maybeSingle()
  if (error) throw error
  // Net een geldig token geschreven → moneybird is verbonden.
  return toStatus(data, { connected: true })
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

export async function saveSnelStartConnection({ subscriptionKey, secondaryKey, administrationId }) {
  const payload = await withCompanyId({
    provider: 'snelstart',
    subscription_key: subscriptionKey,
    secondary_key: secondaryKey,
    administration_id: administrationId || null,
    updated_at: new Date().toISOString(),
  })
  const { data, error } = await supabase
    .from('accounting_connections')
    .upsert(payload, { onConflict: 'company_id,provider' })
    .select('provider, administration_id, afas_environment_id, is_connected, last_synced_at')
    .maybeSingle()
  if (error) throw error
  // Net geldige sleutels geschreven → snelstart is verbonden.
  return toStatus(data, { connected: true })
}

export async function testSnelStartConnection(subscriptionKey, secondaryKey) {
  const { data, error } = await supabase.functions.invoke('snelstart-test', {
    body: { subscription_key: subscriptionKey, secondary_key: secondaryKey },
  })
  if (error) throw error
  return data
}

export async function importKostenVanuitSnelStart() {
  const { data, error } = await supabase.functions.invoke('snelstart-import-kosten', {
    body: {},
  })
  if (error) throw error
  return data
}

export async function syncContactenMetSnelStart() {
  const { data, error } = await supabase.functions.invoke('snelstart-sync-contacten', {
    body: {},
  })
  if (error) throw error
  return data
}

export async function saveAfasConnection({ environmentId, token }) {
  const payload = await withCompanyId({
    provider: 'afas',
    afas_environment_id: environmentId,
    afas_token: token,
    is_connected: false,
    updated_at: new Date().toISOString(),
  })
  const { data, error } = await supabase
    .from('accounting_connections')
    .upsert(payload, { onConflict: 'company_id,provider' })
    .select('provider, administration_id, afas_environment_id, is_connected, last_synced_at')
    .maybeSingle()
  if (error) throw error
  // AFAS is pas "connected" na een geslaagde test (setAfasConnected) → volg is_connected.
  return toStatus(data)
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
