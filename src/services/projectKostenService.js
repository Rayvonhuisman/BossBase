import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'

// Projectkosten: wat één klus gekost heeft buiten het werkbonmateriaal om —
// steigerhuur, een gehuurde hoogwerker. Ze tellen mee in de projectmarge en
// gaan NIET naar de boekhouding: de factuur van de verhuurder wordt op de
// Kosten-pagina geboekt (job_costs), en die telt juist niet mee in de marge.
// Zie migratie 20260915130000.
//
// Zelfde velden als werkbonmateriaal (naam, aantal, eenheid, prijs per
// eenheid, leverancier), zodat invoeren op het project hetzelfde gaat als op de
// werkbon. prijs_per is hier de KOSTprijs, exclusief btw.

const rond = n => Math.round(n * 100) / 100

export const toProjectKost = row => {
  const aantal = Number(row.aantal ?? 1)
  const prijsPer = Number(row.prijs_per ?? 0)
  return {
    id: row.id,
    projectId: row.project_id,
    datum: row.datum || '',
    naam: row.naam || '',
    eenheid: row.eenheid || '',
    aantal,
    prijsPer,
    // bedrag is een gegenereerde kolom; de terugval dekt een optimistische rij.
    bedrag: row.bedrag != null ? Number(row.bedrag) : rond(aantal * prijsPer),
    leverancierId: row.leverancier_id || null,
  }
}

export async function listProjectKosten(projectId) {
  if (!projectId) return []
  const { data, error } = await supabase
    .from('project_kosten')
    .select('*')
    .eq('project_id', projectId)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map(toProjectKost)
}

export async function createProjectKost(projectId, input) {
  const naam = (input.naam || '').trim()
  if (!naam) throw new Error('Omschrijving is verplicht')
  const payload = await withCompanyId({
    project_id: projectId,
    naam,
    eenheid: input.eenheid || null,
    aantal: Number(input.aantal) || 1,
    prijs_per: Number(input.prijs_per) || 0,
    leverancier_id: input.leverancier_id || null,
  })
  const { data, error } = await supabase.from('project_kosten').insert(payload).select('*').single()
  if (error) throw error
  return toProjectKost(data)
}

const VELDEN = ['naam', 'eenheid', 'aantal', 'prijs_per', 'leverancier_id']

export async function updateProjectKost(id, patch) {
  const updates = { updated_at: new Date().toISOString() }
  for (const k of VELDEN) {
    if (!(k in patch)) continue
    if (k === 'aantal' || k === 'prijs_per') updates[k] = Number(patch[k]) || 0
    else if (k === 'naam') updates[k] = patch[k]
    else updates[k] = patch[k] || null
  }
  const { data, error } = await supabase.from('project_kosten').update(updates).eq('id', id).select('*').single()
  if (error) throw error
  return toProjectKost(data)
}

export async function deleteProjectKost(id) {
  const { error } = await supabase.from('project_kosten').delete().eq('id', id)
  if (error) throw error
}
