import { supabase } from '../lib/supabase'
import { getCompanyId } from '../lib/currentCompany'

// Kostencategorieën per bedrijf.
//
// De zes standaardcategorieën staan als rijen in de database (gezet bij het
// aanmaken van het bedrijf), zodat er één bron is. Ze zijn herkenbaar aan
// standaard = true: die naam is de sleutel naar de ingebouwde grootboekmapping,
// dus hernoemen mag niet en een grootboekrekening kiezen hoeft niet.

const toCategorie = row => ({
  id: row.id,
  naam: row.naam,
  standaard: !!row.standaard,
  actief: row.actief !== false,
  bonVerplicht: row.bon_verplicht !== false,
  volgorde: Number(row.volgorde ?? 100),
})

/** @param inclusiefInactief ook categorieën die uit de keuzelijsten zijn gehaald */
export async function listKostenCategorieen({ inclusiefInactief = false } = {}) {
  let q = supabase
    .from('kosten_categorieen')
    .select('*')
    .order('volgorde', { ascending: true })
    .order('naam', { ascending: true })
  if (!inclusiefInactief) q = q.eq('actief', true)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(toCategorie)
}

export async function createKostenCategorie({ naam, bonVerplicht = true }) {
  const schoon = String(naam || '').trim()
  if (!schoon) throw new Error('Geef de categorie een naam')
  const companyId = await getCompanyId()
  const { data, error } = await supabase
    .from('kosten_categorieen')
    .insert({ company_id: companyId, naam: schoon, standaard: false, bon_verplicht: bonVerplicht })
    .select()
    .single()
  // 23505 = unique violation op (company_id, naam).
  if (error?.code === '23505') throw new Error(`"${schoon}" bestaat al`)
  if (error) throw error
  return toCategorie(data)
}

export async function updateKostenCategorie(id, input) {
  const payload = { updated_at: new Date().toISOString() }
  if (input.naam !== undefined) payload.naam = String(input.naam).trim()
  if (input.actief !== undefined) payload.actief = !!input.actief
  if (input.bonVerplicht !== undefined) payload.bon_verplicht = !!input.bonVerplicht
  const { data, error } = await supabase
    .from('kosten_categorieen').update(payload).eq('id', id).select().single()
  if (error?.code === '23505') throw new Error('Er bestaat al een categorie met die naam')
  if (error) throw error
  return toCategorie(data)
}

/** Hoeveel kostenposten gebruiken deze categorieën? Eén query voor de hele lijst. */
export async function getCategorieGebruik() {
  const { data, error } = await supabase.from('job_costs').select('category')
  if (error) return {}
  const uit = {}
  for (const r of (data || [])) {
    if (!r.category) continue
    uit[r.category] = (uit[r.category] || 0) + 1
  }
  return uit
}

/**
 * Verwijderen kan alleen als de categorie nergens gebruikt wordt en niet
 * standaard is. Zelfde afweging als bij leveranciers: bestaande kosten mogen hun
 * categorie niet stilzwijgend kwijtraken, dus in gebruik betekent inactief zetten.
 */
export async function deleteKostenCategorie(id, naam) {
  const { count, error: telErr } = await supabase
    .from('job_costs')
    .select('id', { count: 'exact', head: true })
    .eq('category', naam)
  if (telErr) throw telErr
  if (count) {
    throw new Error(
      `"${naam}" kan niet verwijderd worden: ${count === 1 ? 'er is 1 kostenpost' : `er zijn ${count} kostenposten`} `
      + 'met deze categorie. Zet hem op inactief, dan verdwijnt hij uit de keuzelijsten.',
    )
  }
  const { error } = await supabase.from('kosten_categorieen').delete().eq('id', id)
  if (error) throw error
}
