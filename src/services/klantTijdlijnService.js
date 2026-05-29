import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'

const toEntry = row => ({
  id: row.id,
  customerId: row.customer_id,
  companyId: row.company_id,
  type: row.type,
  omschrijving: row.omschrijving || '',
  meta: row.meta || null,
  aangemaaktop: row.aangemaakt_op,
  createdBy: row.created_by || null,
})

export async function getTijdlijnByCustomer(customerId) {
  if (!customerId) return []
  const { data, error } = await supabase
    .from('klant_tijdlijn')
    .select('*')
    .eq('customer_id', customerId)
    .order('aangemaakt_op', { ascending: false })
  if (error) throw error
  return (data || []).map(toEntry)
}

export async function getKlantNotities(customerId) {
  if (!customerId) return []
  const { data, error } = await supabase
    .from('klant_tijdlijn')
    .select('*')
    .eq('customer_id', customerId)
    .eq('type', 'notitie_toegevoegd')
    .order('aangemaakt_op', { ascending: false })
  if (error) throw error
  return (data || []).map(toEntry)
}

export async function addKlantNotitie(customerId, tekst) {
  if (!customerId) throw new Error('customerId is verplicht')
  const trimmed = (tekst || '').replace(/<[^>]*>/g, '').trim()
  if (!trimmed) throw new Error('Notitie mag niet leeg zijn')

  const base = {
    customer_id: customerId,
    type: 'notitie_toegevoegd',
    omschrijving: trimmed,
    aangemaakt_op: new Date().toISOString(),
  }

  try {
    const { data: u } = await supabase.auth.getUser()
    if (u?.user?.id) base.created_by = u.user.id
  } catch { /* ignore */ }

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('klant_tijdlijn')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toEntry(data)
}

export async function logTijdlijn(customerId, type, omschrijving, meta = null) {
  if (!customerId) return
  const base = {
    customer_id: customerId,
    type,
    omschrijving: omschrijving || type,
    aangemaakt_op: new Date().toISOString(),
  }
  if (meta) base.meta = meta
  try {
    const { data: u } = await supabase.auth.getUser()
    if (u?.user?.id) base.created_by = u.user.id
  } catch { /* ignore */ }
  const payload = await withCompanyId(base)
  const { error } = await supabase.from('klant_tijdlijn').insert(payload)
  if (error) throw error
}

export const logTijdlijnSafe = (customerId, type, omschrijving, meta) =>
  logTijdlijn(customerId, type, omschrijving, meta).catch(() => {})
