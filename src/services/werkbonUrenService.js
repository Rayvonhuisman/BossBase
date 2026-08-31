import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'
import { berekenUren } from './urenService.js'

// Uren op een werkbon. Los van urenregistratie, dat de wérkdag van een
// medewerker bijhoudt (loon en verlof).
//
// Deze uren horen bij de klus: ze voeden de nacalculatie, de facturatie en de
// werkbon-PDF. Ze dragen bewust geen project- of klantkoppeling — die volgen uit
// de werkbon. In de oude opzet kon een urenregel een ánder project hebben dan
// zijn werkbon; dat kan nu niet meer.
//
// Wie mag boeken bepaalt de werkbon, niet het profiel: de uitvoerders en
// verantwoordelijken van díé werkbon, plus admin en planner als vangnet. Dat
// staat in de RLS (bb_mag_werkbon_uren_beheren); de UI vraagt hier hetzelfde na
// zodat je geen knop krijgt die je toch niet mag indrukken.

const SELECT_VOL = '*, profiles(full_name)'

const toWerkbonUur = row => ({
  id: row.id,
  companyId: row.company_id,
  werkbonId: row.werkbon_id,
  profileId: row.profile_id,
  datum: row.datum,
  startTijd: row.start_tijd || null,
  eindTijd: row.eind_tijd || null,
  pauzeMinuten: Number(row.pauze_minuten || 0),
  uren: Number(row.uren || 0),
  reisKm: row.reis_km == null ? null : Number(row.reis_km),
  notitie: row.notitie || '',
  createdAt: row.created_at,
  medewerkerNaam: row.profiles?.full_name || '',
})

/**
 * Mag deze gebruiker uren boeken op deze werkbon? Spiegelt de RLS-regel, zodat
 * het scherm de knop kan verbergen in plaats van te laten falen bij opslaan.
 */
export function magWerkbonUrenBeheren(werkbon, profile) {
  if (!werkbon || !profile?.id) return false
  if (profile.role === 'admin' || profile.role === 'planner') return true
  const uitvoerders = werkbon.assignedToIds || []
  const verantwoordelijken = werkbon.verantwoordelijkeIds || []
  return uitvoerders.includes(profile.id) || verantwoordelijken.includes(profile.id)
}

export async function getWerkbonUren(werkbonId) {
  if (!werkbonId) return []
  const { data, error } = await supabase
    .from('werkbon_uren')
    .select(SELECT_VOL)
    .eq('werkbon_id', werkbonId)
    .order('datum', { ascending: true })
    .order('start_tijd', { ascending: true, nullsFirst: true })
  // De tabel bestaat pas na migratie 20260831140000. Tot die tijd hoort de
  // werkbonkaart gewoon te werken, alleen zonder urenblok.
  if (error) return []
  return (data || []).map(toWerkbonUur)
}

/** Alle werkbonuren van het bedrijf — voedt de leeslijst op de urenpagina. */
export async function getAlleWerkbonUren({ vanDatum, totDatum } = {}) {
  let query = supabase
    .from('werkbon_uren')
    .select('*, profiles(full_name), werkbonnen(id, titel, customer_id, project_id)')
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false })
  if (vanDatum) query = query.gte('datum', vanDatum)
  if (totDatum) query = query.lte('datum', totDatum)

  const { data, error } = await query
  if (error) return []
  return (data || []).map(r => ({
    ...toWerkbonUur(r),
    werkbonTitel: r.werkbonnen?.titel || '',
    projectId: r.werkbonnen?.project_id || null,
    customerId: r.werkbonnen?.customer_id || null,
  }))
}

export async function createWerkbonUur(input) {
  const pauze = Math.max(0, Number(input.pauze_minuten ?? input.pauzeMinuten ?? 0) || 0)
  let uren = input.uren != null ? Number(input.uren) : null
  if ((uren == null || uren === 0) && input.start_tijd && input.eind_tijd) {
    uren = berekenUren(input.start_tijd, input.eind_tijd, pauze)
  }
  if (!uren || uren <= 0) throw new Error('Uren moet groter zijn dan 0')
  if (!input.werkbon_id) throw new Error('werkbon_id is verplicht')
  if (!input.datum) throw new Error('Datum is verplicht')

  const ruweKm = input.reis_km ?? input.reisKm
  const payload = await withCompanyId({
    werkbon_id: input.werkbon_id,
    profile_id: input.profile_id,
    datum: input.datum,
    start_tijd: input.start_tijd || null,
    eind_tijd: input.eind_tijd || null,
    pauze_minuten: pauze,
    uren,
    // Leeg blijft leeg: 0 km en "niet ingevuld" zijn niet hetzelfde.
    reis_km: ruweKm === '' || ruweKm == null ? null : Number(ruweKm),
    notitie: input.notitie || null,
  })

  const { data, error } = await supabase
    .from('werkbon_uren').insert(payload).select(SELECT_VOL).single()
  if (error) {
    // RLS weigert wie niet op de klus zit; die fout is voor de gebruiker
    // onleesbaar, dus vertalen we hem hier één keer.
    if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
      throw new Error('Alleen de uitvoerder of de verantwoordelijke van deze werkbon kan hier uren boeken.')
    }
    throw error
  }
  return toWerkbonUur(data)
}

export async function updateWerkbonUur(id, velden) {
  const updates = { ...velden, updated_at: new Date().toISOString() }
  if ('pauzeMinuten' in updates) {
    updates.pauze_minuten = Math.max(0, Number(updates.pauzeMinuten) || 0)
    delete updates.pauzeMinuten
  }
  if ('startTijd' in updates) { updates.start_tijd = updates.startTijd; delete updates.startTijd }
  if ('eindTijd' in updates) { updates.eind_tijd = updates.eindTijd; delete updates.eindTijd }
  if ('reisKm' in updates) {
    updates.reis_km = updates.reisKm === '' || updates.reisKm == null ? null : Number(updates.reisKm)
    delete updates.reisKm
  }
  if ('start_tijd' in updates || 'eind_tijd' in updates || 'pauze_minuten' in updates) {
    const berekend = berekenUren(updates.start_tijd, updates.eind_tijd, updates.pauze_minuten ?? 0)
    if (berekend !== null) updates.uren = berekend
  }

  const { data, error } = await supabase
    .from('werkbon_uren').update(updates).eq('id', id).select(SELECT_VOL).single()
  if (error) throw error
  return toWerkbonUur(data)
}

export async function deleteWerkbonUur(id) {
  const { error } = await supabase.from('werkbon_uren').delete().eq('id', id)
  if (error) throw error
}

/**
 * Uren per project, via de werkbonnen van dat project. Voedt de nacalculatie —
 * die draait uitsluitend op werkbonuren; werkdaguren tellen er niet in mee.
 * @returns {Promise<Record<string, number>>} projectId → uren
 */
export async function getUrenPerProject() {
  const { data, error } = await supabase
    .from('werkbon_uren')
    .select('uren, werkbonnen!inner(project_id)')
    .not('werkbonnen.project_id', 'is', null)
  if (error) return {}
  const perProject = {}
  for (const r of (data || [])) {
    const pid = r.werkbonnen?.project_id
    if (!pid) continue
    perProject[pid] = (perProject[pid] || 0) + Number(r.uren || 0)
  }
  return perProject
}
