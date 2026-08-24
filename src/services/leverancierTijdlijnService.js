import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'
import { sanitizeNoteHtml, htmlToPlain } from '../lib/noteFormat'

// Notities + tijdlijn per leverancier. Eén op één het patroon van
// klantTijdlijnService, zodat NotitieLog en de tijdlijn-render ongewijzigd
// herbruikbaar zijn. Notities zijn rijen met type 'notitie_toegevoegd'.

const toEntry = row => ({
  id: row.id,
  leverancierId: row.leverancier_id,
  companyId: row.company_id,
  type: row.type,
  omschrijving: row.omschrijving || '',
  meta: row.meta || null,
  aangemaaktop: row.aangemaakt_op,
  createdBy: row.created_by || null,
})

export async function getTijdlijnByLeverancier(leverancierId) {
  if (!leverancierId) return []
  const { data, error } = await supabase
    .from('leverancier_tijdlijn')
    .select('*')
    .eq('leverancier_id', leverancierId)
    .order('aangemaakt_op', { ascending: false })
  if (error) throw error
  return (data || []).map(toEntry)
}

export async function getLeverancierNotities(leverancierId) {
  if (!leverancierId) return []
  const { data, error } = await supabase
    .from('leverancier_tijdlijn')
    .select('*')
    .eq('leverancier_id', leverancierId)
    .eq('type', 'notitie_toegevoegd')
    .order('aangemaakt_op', { ascending: false })
  if (error) throw error
  return (data || []).map(toEntry)
}

export async function addLeverancierNotitie(leverancierId, tekst) {
  if (!leverancierId) throw new Error('leverancierId is verplicht')
  const clean = sanitizeNoteHtml(tekst || '')
  if (!htmlToPlain(clean) && !/bb-mention/.test(clean)) throw new Error('Notitie mag niet leeg zijn')

  const base = {
    leverancier_id: leverancierId,
    type: 'notitie_toegevoegd',
    omschrijving: clean,
    aangemaakt_op: new Date().toISOString(),
  }
  try {
    const { data: u } = await supabase.auth.getUser()
    if (u?.user?.id) base.created_by = u.user.id
  } catch { /* ignore */ }

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('leverancier_tijdlijn').insert(payload).select().single()
  if (error) throw error
  return toEntry(data)
}

// Gebeurtenis loggen (bijv. email_verstuurd). Faalt stil: een mislukte log mag
// nooit de handeling zelf blokkeren.
export async function logLeverancierTijdlijnSafe(leverancierId, type, omschrijving, meta = null) {
  if (!leverancierId) return
  try {
    const base = { leverancier_id: leverancierId, type, omschrijving, meta, aangemaakt_op: new Date().toISOString() }
    const { data: u } = await supabase.auth.getUser()
    if (u?.user?.id) base.created_by = u.user.id
    const payload = await withCompanyId(base)
    await supabase.from('leverancier_tijdlijn').insert(payload)
  } catch { /* bewust stil */ }
}
