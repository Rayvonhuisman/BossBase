import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'

// Materialenbibliotheek.
//
// De inkoopprijs staat in een aparte tabel (materiaal_inkoop) met eigen RLS:
// zonder het recht 'inkoopprijzen' geeft de database die rij niet terug. De UI
// hoeft dus niets te verbergen — er komt simpelweg geen waarde binnen.
//
// De prijsrij wordt door een trigger op materialen aangemaakt, dus hij bestaat
// altijd. Het bijwerken van de prijs is daarom een gewone update; er kan nooit
// een materiaal zonder prijsrij achterblijven.

export const EENHEDEN = ['stuk', 'm', 'm²', 'liter', 'uur']

// Inbedding: materiaal_inkoop hangt met zijn primaire sleutel aan materialen,
// dus PostgREST levert één object. Oudere versies gaven een array — beide
// afgehandeld zodat een schemacache-verschil niets breekt.
const SELECT = '*, materiaal_inkoop(inkoopprijs)'

const inkoopUit = row => {
  const k = Array.isArray(row?.materiaal_inkoop) ? row.materiaal_inkoop[0] : row?.materiaal_inkoop
  return k?.inkoopprijs != null ? Number(k.inkoopprijs) : null
}

export const toMateriaal = row => ({
  id: row.id,
  companyId: row.company_id || null,
  naam: row.naam || '',
  eenheid: row.eenheid || 'stuk',
  // null betekent óf "niet ingevuld" óf "geen recht om te zien" — de UI leest
  // dat laatste af aan het recht, niet aan de waarde.
  inkoopprijs: inkoopUit(row),
  verkoopprijs: row.verkoopprijs != null ? Number(row.verkoopprijs) : null,
  leverancierId: row.leverancier_id || null,
  btwPct: row.btw_pct != null ? Number(row.btw_pct) : 21,
  artikelnummer: row.artikelnummer || '',
  actief: row.actief !== false,
  createdAt: row.created_at || null,
})

// Marge in euro's en procenten. Null zodra een van beide prijzen ontbreekt —
// en zonder het inkooprecht is de inkoopprijs altijd null, dus toont de UI
// vanzelf niets.
export function marge(materiaal) {
  const in_ = materiaal?.inkoopprijs
  const uit = materiaal?.verkoopprijs
  if (in_ == null || uit == null) return null
  const bedrag = Math.round((uit - in_) * 100) / 100
  const pct = uit > 0 ? Math.round((bedrag / uit) * 1000) / 10 : null
  return { bedrag, pct }
}

const getal = v => (v === '' || v == null ? null : Number(v))

// Alles behalve de inkoopprijs: die hoort niet in de materialen-tabel.
function naarPayload(form = {}) {
  const tekst = v => {
    const s = typeof v === 'string' ? v.trim() : v
    return s === '' || s === undefined ? null : s
  }
  return {
    naam: (form.naam || '').trim(),
    eenheid: form.eenheid || 'stuk',
    verkoopprijs: getal(form.verkoopprijs),
    leverancier_id: form.leverancierId || form.leverancier_id || null,
    btw_pct: form.btwPct === '' || form.btwPct == null ? 21 : Number(form.btwPct),
    artikelnummer: tekst(form.artikelnummer),
    actief: form.actief !== false,
  }
}

// Prijs wegschrijven. De rij bestaat al (trigger), dus dit is altijd een update.
// Zonder het recht weigert RLS de update stil — vandaar dat we alleen schrijven
// als er daadwerkelijk een waarde is meegegeven.
async function bewaarInkoop(materiaalId, form) {
  if (!('inkoopprijs' in form)) return
  const { error } = await supabase
    .from('materiaal_inkoop')
    .update({ inkoopprijs: getal(form.inkoopprijs), updated_at: new Date().toISOString() })
    .eq('materiaal_id', materiaalId)
  if (error) throw error
}

export async function listMaterialen({ inclusiefInactief = true } = {}) {
  let q = supabase.from('materialen').select(SELECT).order('naam', { ascending: true })
  if (!inclusiefInactief) q = q.eq('actief', true)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(toMateriaal)
}

export async function getMateriaal(id) {
  const { data, error } = await supabase.from('materialen').select(SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toMateriaal(data) : null
}

export async function createMateriaal(form) {
  const base = naarPayload(form)
  if (!base.naam) throw new Error('Naam is verplicht')
  const payload = await withCompanyId(base)
  const { data, error } = await supabase.from('materialen').insert(payload).select('id').single()
  if (error) throw error
  await bewaarInkoop(data.id, form)
  return getMateriaal(data.id)
}

export async function updateMateriaal(id, form) {
  const payload = naarPayload(form)
  if (!payload.naam) throw new Error('Naam is verplicht')
  const { error } = await supabase.from('materialen').update(payload).eq('id', id)
  if (error) throw error
  await bewaarInkoop(id, form)
  return getMateriaal(id)
}

export async function deleteMateriaal(id) {
  // materiaal_inkoop hangt met ON DELETE CASCADE aan dit materiaal.
  const { error } = await supabase.from('materialen').delete().eq('id', id)
  if (error) throw error
}
