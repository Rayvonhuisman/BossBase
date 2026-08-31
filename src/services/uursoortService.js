import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'

// Uursoorten: het label op een urenregel — Normaal, Overwerk, Reisuren, en wat
// een bedrijf er zelf bij zet.
//
// Bewust GEEN tarief. De prijs van een uur staat op één plek
// (bedrijfsinstellingen.uurtarief) en blijft daar; een tweede getal dat
// hetzelfde zou moeten zijn, loopt vroeg of laat uit elkaar.
//
// Zelfde opzet als kostenCategorieService: standaardrijen komen uit de migratie,
// bijzetten mag, standaardrijen zijn niet te verwijderen en wat in gebruik is
// zet je inactief in plaats van weg.

const toUursoort = row => ({
  id: row.id,
  naam: row.naam,
  standaard: !!row.standaard,
  actief: !!row.actief,
  volgorde: Number(row.volgorde ?? 100),
})

/**
 * Alle uursoorten van het bedrijf, op volgorde.
 * @param {object} opties
 * @param {boolean} opties.inclusiefInactief  ook uitgezette soorten meenemen
 *   (voor het beheerscherm; de keuzelijsten willen alleen de actieve).
 */
export async function listUursoorten({ inclusiefInactief = false } = {}) {
  let query = supabase
    .from('uursoorten')
    .select('*')
    .order('volgorde', { ascending: true })
    .order('naam', { ascending: true })
  if (!inclusiefInactief) query = query.eq('actief', true)

  const { data, error } = await query
  // De tabel bestaat pas na migratie 20260831120000. Tot die tijd hoort een
  // urenformulier gewoon te werken, alleen zonder soortkeuze.
  if (error) return []
  return (data || []).map(toUursoort)
}

export async function createUursoort(naam) {
  const schoon = String(naam || '').trim()
  if (!schoon) throw new Error('Naam is verplicht')

  // Achteraan in de lijst: standaardsoorten houden hun vaste volgorde vooraan.
  const { data: bestaand } = await supabase
    .from('uursoorten').select('volgorde').order('volgorde', { ascending: false }).limit(1)
  const volgorde = Number(bestaand?.[0]?.volgorde ?? 0) + 10

  const payload = await withCompanyId({ naam: schoon, standaard: false, actief: true, volgorde })
  const { data, error } = await supabase.from('uursoorten').insert(payload).select().single()
  if (error) {
    if (error.code === '23505') throw new Error(`"${schoon}" bestaat al`)
    throw error
  }
  return toUursoort(data)
}

export async function updateUursoort(id, velden) {
  const updates = {}
  if (velden.naam !== undefined) {
    const schoon = String(velden.naam).trim()
    if (!schoon) throw new Error('Naam is verplicht')
    updates.naam = schoon
  }
  if (velden.actief !== undefined) updates.actief = !!velden.actief
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('uursoorten').update(updates).eq('id', id).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('Die naam is al in gebruik')
    throw error
  }
  return toUursoort(data)
}

/**
 * Verwijderen kan alleen bij een zelf toegevoegde soort die nergens op een
 * urenregel staat. Staat hij er wel op, dan is inactief zetten het antwoord —
 * anders zou een bestaande regel zijn label kwijtraken.
 */
export async function deleteUursoort(id) {
  const { count } = await supabase
    .from('urenregistratie')
    .select('id', { count: 'exact', head: true })
    .eq('uursoort_id', id)
  if (count) {
    throw new Error(
      `Deze soort staat op ${count} ${count === 1 ? 'urenregel' : 'urenregels'} en kan niet verwijderd worden. `
      + 'Zet hem op inactief, dan verdwijnt hij uit de keuzelijst.',
    )
  }
  const { error } = await supabase.from('uursoorten').delete().eq('id', id)
  if (error) throw error
}

/** Hoeveel urenregels hangen er aan elke soort? Voedt het beheerscherm. */
export async function getUursoortGebruik() {
  const { data, error } = await supabase
    .from('urenregistratie').select('uursoort_id').not('uursoort_id', 'is', null)
  if (error) return {}
  const telling = {}
  for (const r of (data || [])) telling[r.uursoort_id] = (telling[r.uursoort_id] || 0) + 1
  return telling
}
