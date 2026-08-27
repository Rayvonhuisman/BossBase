import { negeerBijImport } from './accountingService.js'
import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'
import { valideerRelatieVelden } from '../lib/validatie'

// Leveranciers. Spiegel van customerService, maar met één harde regel: alleen
// `naam` is verplicht. SnelStart stelt bij een relatie formeel geen enkel veld
// verplicht (RelatieWriteModel required: none), dus wij ook niet.

export const toLeverancier = row => ({
  id: row.id,
  companyId: row.company_id || null,
  naam: (row.naam || '').trim() || 'Naamloos',
  contactpersoon: row.contactpersoon || '',
  email: row.email || '',
  telefoon: row.telefoon || '',
  mobiel: row.mobiel || '',
  website: row.website || '',
  address: row.address || '',
  postcode: row.postcode || '',
  city: row.city || '',
  kvkNumber: row.kvk_number || '',
  btwNumber: row.btw_number || '',
  iban: row.iban || '',
  betaaltermijnDagen: row.betaaltermijn_dagen ?? null,
  notities: row.notities || '',
  actief: row.actief !== false,
  snelstartId: row.snelstart_id || null,
  moneybirdId: row.moneybird_id || null,
  createdAt: row.created_at || null,
  raw: row,
})

// Formulier → databasekolommen. Lege strings worden null, zodat een leeg
// optioneel veld geen spookwaarde achterlaat.
export function mapLeverancierFormToPayload(form = {}) {
  const tekst = v => {
    const s = typeof v === 'string' ? v.trim() : v
    return s === '' || s === undefined ? null : s
  }
  return {
    naam: (form.naam || '').trim(),
    contactpersoon: tekst(form.contactpersoon),
    email: tekst(form.email),
    telefoon: tekst(form.telefoon),
    mobiel: tekst(form.mobiel),
    website: tekst(form.website),
    address: tekst(form.address),
    postcode: tekst(form.postcode),
    city: tekst(form.city),
    kvk_number: tekst(form.kvkNumber ?? form.kvk_number),
    btw_number: tekst(form.btwNumber ?? form.btw_number),
    iban: tekst(form.iban),
    betaaltermijn_dagen: form.betaaltermijnDagen === '' || form.betaaltermijnDagen == null
      ? null : Number(form.betaaltermijnDagen),
    notities: tekst(form.notities),
    actief: form.actief !== false,
  }
}

// SnelStart wijst een ongeldig btw-nummer of IBAN af en laat dan de hele
// relatie mislukken. Hier afvangen scheelt een onverklaarbaar mislukte sync.
function keurZakelijkeVelden(form) {
  const fouten = valideerRelatieVelden(form)
  const eerste = Object.values(fouten)[0]
  if (eerste) throw new Error(eerste)
}

export async function listLeveranciers({ inclusiefInactief = true } = {}) {
  let q = supabase.from('leveranciers').select('*').order('naam', { ascending: true })
  if (!inclusiefInactief) q = q.eq('actief', true)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(toLeverancier)
}

export async function getLeverancier(id) {
  const { data, error } = await supabase.from('leveranciers').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toLeverancier(data) : null
}

export async function createLeverancier(form) {
  const base = mapLeverancierFormToPayload(form)
  if (!base.naam) throw new Error('Naam is verplicht')
  keurZakelijkeVelden(form)
  const payload = await withCompanyId(base)
  const { data, error } = await supabase.from('leveranciers').insert(payload).select().single()
  if (error) throw error
  return toLeverancier(data)
}

export async function updateLeverancier(id, form) {
  const payload = mapLeverancierFormToPayload(form)
  if (payload.naam === '') throw new Error('Naam is verplicht')
  keurZakelijkeVelden(form)
  const { data, error } = await supabase.from('leveranciers').update(payload).eq('id', id).select().single()
  if (error) throw error
  return toLeverancier(data)
}

export async function deleteLeverancier(id) {
  // job_costs.leverancier_id staat op ON DELETE RESTRICT: een leverancier met
  // kosten kan niet weg — die kosten zouden onboekbaar worden. Zet hem inactief.
  const { data: bestaand } = await supabase
    .from('leveranciers').select('snelstart_id').eq('id', id).maybeSingle()

  const { error } = await supabase.from('leveranciers').delete().eq('id', id)
  if (error) throw error

// Onthouden dat dit record hier bewust weg is, zodat de import het niet
// terughaalt. Zonder deze regel komt alles wat je verwijdert bij de volgende
// sync gewoon terug — de import kijkt naar wat er in SnelStart staat, niet naar
// wat jij hebt besloten.
  if (bestaand?.snelstart_id) {
    await negeerBijImport('leverancier', bestaand.snelstart_id, 'verwijderd in BossBase').catch(() => {})
  }
}

// Hoeveel kosten hangen er aan deze leveranciers? Voedt de kolom "kosten" in het
// overzicht en de waarschuwing bij verwijderen. Eén query voor de hele lijst.
export async function getLeverancierKostenTotalen() {
  const { data, error } = await supabase
    .from('job_costs')
    .select('leverancier_id, amount')
    .not('leverancier_id', 'is', null)
  if (error) return {}
  const totalen = {}
  for (const r of (data || [])) {
    const id = r.leverancier_id
    if (!totalen[id]) totalen[id] = { aantal: 0, bedrag: 0 }
    totalen[id].aantal += 1
    totalen[id].bedrag += Number(r.amount) || 0
  }
  return totalen
}
