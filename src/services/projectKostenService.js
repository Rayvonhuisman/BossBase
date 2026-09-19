import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'
import { alleRijen } from '../lib/alleRijen'

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
    // Gezet als de inkoop op een werkbon is toegevoegd; project_id is dan het
    // project van die werkbon (trigger, migratie 20260919140000).
    werkbonId: row.werkbon_id || null,
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

/** Inkopen die op deze werkbon zijn toegevoegd. */
export async function listWerkbonKosten(werkbonId) {
  if (!werkbonId) return []
  const { data, error } = await supabase
    .from('project_kosten')
    .select('*')
    .eq('werkbon_id', werkbonId)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map(toProjectKost)
}

/**
 * Alle inkopen die op een werkbon staan, bedrijfsbreed en eventueel beperkt tot
 * één periode. Voor de Kosten-pagina: daar staan ze naast het werkbonmateriaal
 * onder "Kosten op werkbonnen", zodat die naam de lading dekt.
 *
 * Via alleRijen, want dit is een bedrijfsbrede lijst die wordt opgeteld en
 * PostgREST kapt stil af op duizend rijen. Filteren op `datum` mag: die kolom is
 * NOT NULL met default CURRENT_DATE (gecontroleerd op productie), dus er valt
 * niets buiten de periode weg.
 *
 * De klant hangt niet aan de inkoop maar aan de werkbon, vandaar de embed.
 * @param {{vanDatum?: string, totDatum?: string}} bereik ISO-datums, inclusief
 */
export async function listWerkbonInkopen({ vanDatum, totDatum } = {}) {
  const gesorteerd = select => {
    let q = supabase.from('project_kosten')
      .select(select, { count: 'exact' })
      .not('werkbon_id', 'is', null)
    if (vanDatum) q = q.gte('datum', vanDatum)
    if (totDatum) q = q.lte('datum', totDatum)
    // Vaste sortering met een unieke laatste sleutel; zonder dat mist alleRijen
    // rijen of levert ze dubbel.
    return q.order('created_at', { ascending: false }).order('id', { ascending: true })
  }
  let rijen
  try {
    rijen = await alleRijen(() => gesorteerd('*, werkbonnen(customer_id)'))
  } catch (error) {
    // Zonder de embed blijft alleen de klantnaam leeg. Dat is beter dan een
    // lege tab, maar een andere fout hoort wél door te komen.
    if (!/could not find.*relationship|foreign key/i.test(error?.message || '')) throw error
    rijen = await alleRijen(() => gesorteerd('*'))
  }
  return rijen.map(row => ({ ...toProjectKost(row), customerId: row.werkbonnen?.customer_id || null }))
}

/**
 * @param {string|null} projectId
 * @param {object} input  naam, aantal, eenheid, prijs_per, leverancier_id, en
 *                        optioneel werkbon_id. Met een werkbon zet de database
 *                        het project zelf (het project van die werkbon).
 */
export async function createProjectKost(projectId, input) {
  const naam = (input.naam || '').trim()
  if (!naam) throw new Error('Omschrijving is verplicht')
  const payload = await withCompanyId({
    project_id: input.werkbon_id ? null : projectId,
    werkbon_id: input.werkbon_id || null,
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
