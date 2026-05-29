import { supabase } from '../lib/supabase'
import { withCompanyId, getCompanyId } from '../lib/currentCompany'

const toConnection = row => row ? ({
  id: row.id,
  provider: row.provider,
  apiToken: row.api_token || '',
  administrationId: row.administration_id || '',
  subscriptionKey: row.subscription_key || '',
  secondaryKey: row.secondary_key || '',
  afasEnvironmentId: row.afas_environment_id || '',
  afasToken: row.afas_token || '',
  afasSubdomain: row.afas_subdomain || '',
  lastSyncedAt: row.last_synced_at || null,
}) : null

export async function getConnection(provider = 'moneybird') {
  const companyId = await getCompanyId()
  if (!companyId) return null
  const { data, error } = await supabase
    .from('accounting_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw error
  return toConnection(data)
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
    .select()
    .maybeSingle()
  if (error) throw error
  return toConnection(data)
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
    .select()
    .maybeSingle()
  if (error) throw error
  return toConnection(data)
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

export async function saveAfasConnection({ environmentId, token, subdomain }) {
  const payload = await withCompanyId({
    provider: 'afas',
    afas_environment_id: environmentId,
    afas_token: token,
    afas_subdomain: subdomain || null,
    updated_at: new Date().toISOString(),
  })
  const { data, error } = await supabase
    .from('accounting_connections')
    .upsert(payload, { onConflict: 'company_id,provider' })
    .select()
    .maybeSingle()
  if (error) throw error
  return toConnection(data)
}

export async function testAfasConnection(environmentId, token, subdomain) {
  const { data, error } = await supabase.functions.invoke('afas-test', {
    body: { environment_id: environmentId, token, subdomain },
  })
  if (error) throw error
  return data
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
