import { supabase } from '../lib/supabase'
import { withCompanyId, getCompanyId } from '../lib/currentCompany'

const toConnection = row => row ? ({
  id: row.id,
  provider: row.provider,
  apiToken: row.api_token || '',
  administrationId: row.administration_id || '',
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
    .single()
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
