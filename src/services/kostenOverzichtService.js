import { supabase } from '../lib/supabase'
import { getProjectCosts, isWerkbonMateriaal, inkoopwaardeVanKosten, toJobCost } from './jobCostService.js'
import { listProjectKosten, toProjectKost } from './projectKostenService.js'
import { getTimeEntries } from './projectsService.js'

// Eén bron voor het kostenoverzicht, zowel van één project als van een hele
// klant. De tegels bovenaan en de regels eronder rekenen allebei hiermee, zodat
// ze niet uit elkaar kunnen lopen.
//
// ── Drie regels, drie bronnen, geen overlap ────────────────────────────────
// Elke kostenpost hoort bij precies één regel; dat volgt uit de bron, niet uit
// een filter dat je kunt vergeten:
//
//   materiaal — job_costs MET werkbon_materiaal_id: de spiegelregels van
//               werkbon_materialen, door de database bijgehouden op
//               aantal x inkoopprijs (migratie 20260915130500).
//   inkopen   — project_kosten: wat bij deze klus hoort maar niet op een
//               werkbon staat (steigerhuur, een gehuurde hoogwerker).
//   uren      — werkbon_uren: ALLEEN het aantal uren. Er is geen kostprijs per
//               uur in de database, dus er staat bewust geen bedrag bij en ze
//               tellen niet mee in het totaal. Een verzonnen uurbedrag zou de
//               marge net zo hard vervuilen als helemaal geen uren.
//
// ── Wat er bewust NIET bij op wordt geteld ────────────────────────────────
// boekingen — job_costs ZONDER werkbon_materiaal_id: de boekhouding. Die staan
// apart, ter inzage, buiten het totaal. Tel je ze mee, dan zit dezelfde inkoop
// er twee keer in: de inkoopfactuur van de leverancier is de boeking, en
// hetzelfde materiaal telt via de werkbon al mee. Zie migratie 20260915130000.
//
// Het totaal is daarom materiaal + inkopen — en dat is een brutowinst VÓÓR
// arbeid, nooit een nettowinst.

const rond = n => Math.round((Number(n) || 0) * 100) / 100

export const LEEG_OVERZICHT = {
  materiaal: { regels: [], bedrag: 0, zonderInkoopprijs: 0, geschatBedrag: 0 },
  inkopen: { regels: [], bedrag: 0 },
  uren: { regels: [], uren: 0, km: 0 },
  boekingen: { regels: [], bedrag: 0 },
  totaal: 0,
}

/**
 * Zet opgehaalde rijen om in het overzicht. Puur rekenwerk, zodat een pagina die
 * de rijen al heeft niets opnieuw hoeft op te halen — en zodat dit te testen is
 * zonder database.
 *
 * @param {object}   bron
 * @param {Array}    bron.jobCosts      job_costs (materiaal én boekingen door elkaar)
 * @param {Array}    bron.projectKosten project_kosten
 * @param {Array}    bron.urenRegels    werkbon_uren, als { hours|uren, reisKm }
 */
export function bouwKostenOverzicht({ jobCosts = [], projectKosten = [], urenRegels = [] } = {}) {
  const materiaalRegels = jobCosts.filter(isWerkbonMateriaal)
  const boekingRegels = jobCosts.filter(k => !isWerkbonMateriaal(k))

  // Het opgeslagen bedrag is al de inkoopwaarde; deze functie rekent het uit de
  // materiaalregel nóg eens na, zodat ook een rij van vóór die migratie klopt,
  // en telt hoeveel regels op de verkoopprijs zijn teruggevallen.
  const inkoop = inkoopwaardeVanKosten(materiaalRegels)

  const inkopenBedrag = rond(projectKosten.reduce((s, k) => s + (Number(k.bedrag) || 0), 0))
  const boekingenBedrag = rond(boekingRegels.reduce((s, k) => s + (Number(k.amt ?? k.amount) || 0), 0))

  const urenTotaal = urenRegels.reduce((s, u) => s + (Number(u.hours ?? u.uren) || 0), 0)
  const kmTotaal = urenRegels.reduce((s, u) => s + (Number(u.reisKm ?? u.reis_km) || 0), 0)

  return {
    materiaal: {
      regels: materiaalRegels,
      bedrag: inkoop.materiaalInkoop,
      zonderInkoopprijs: inkoop.zonderInkoopprijs,
      geschatBedrag: inkoop.geschatBedrag,
    },
    inkopen: { regels: projectKosten, bedrag: inkopenBedrag },
    uren: { regels: urenRegels, uren: Math.round(urenTotaal * 100) / 100, km: Math.round(kmTotaal * 100) / 100 },
    boekingen: { regels: boekingRegels, bedrag: boekingenBedrag },
    totaal: rond(inkoop.materiaalInkoop + inkopenBedrag),
  }
}

/** Kostenoverzicht van één project. */
export async function getProjectKostenOverzicht(projectId) {
  if (!projectId) return { ...LEEG_OVERZICHT }
  const [jobCosts, projectKosten, urenRegels] = await Promise.all([
    getProjectCosts(projectId).catch(() => []),
    listProjectKosten(projectId),           // fout hier is zichtbaar: de tab meldt hem
    getTimeEntries(projectId).catch(() => []),
  ])
  return bouwKostenOverzicht({ jobCosts, projectKosten, urenRegels })
}

// PostgREST geeft per verzoek hooguit 1000 rijen en meldt niet dat er meer
// waren. Een klant met veel werkbonnen zou dus stil te weinig uren of kosten
// tellen. Doorvragen tot het aantal binnen is dat de database zelf opgeeft.
// (Zelfde aanpak als alleRijen in projectsService; die is daar privé.)
async function alleRijen(maakQuery) {
  const rijen = []
  let totaal = Infinity
  while (rijen.length < totaal) {
    const { data, error, count } = await maakQuery().range(rijen.length, rijen.length + 999)
    if (error) throw error
    if (count != null) totaal = count
    if (!data?.length) break
    rijen.push(...data)
  }
  return rijen
}

// Dezelfde join als getProjectCosts: de inkoopprijs komt mee via de
// materiaalregel, en die tabel heeft eigen RLS — zonder het recht
// 'inkoopprijzen' geeft de database hem niet terug.
const MET_INKOOP = '*, werkbon_materialen!werkbon_materiaal_id(aantal, werkbon_materiaal_inkoop(inkoopprijs_per))'

const metMateriaalVelden = row => {
  const m = Array.isArray(row.werkbon_materialen) ? row.werkbon_materialen[0] : row.werkbon_materialen
  const inkoop = Array.isArray(m?.werkbon_materiaal_inkoop)
    ? m.werkbon_materiaal_inkoop[0] : m?.werkbon_materiaal_inkoop
  return {
    ...toJobCost(row),
    materiaalAantal: m?.aantal != null ? Number(m.aantal) : null,
    inkoopprijsPer: inkoop?.inkoopprijs_per != null ? Number(inkoop.inkoopprijs_per) : null,
  }
}

/**
 * Kostenoverzicht van één klant: alles van al zijn projecten én al zijn
 * werkbonnen, met dezelfde indeling als het project.
 *
 * Een kost kan langs meerdere routes bij dezelfde klant horen (rechtstreeks,
 * via het project, via de werkbon of via de deal). Het blijft één rij, dus hij
 * telt één keer — de or-filter levert geen duplicaten, en voor de zekerheid
 * gaat er nog een ontdubbeling op id overheen.
 */
export async function getKlantKostenOverzicht(customerId) {
  if (!customerId) return { ...LEEG_OVERZICHT }

  const [projectRijen, werkbonRijen, dealRijen] = await Promise.all([
    supabase.from('projects').select('id').eq('customer_id', customerId).then(r => r.data || []),
    supabase.from('werkbonnen').select('id, project_id').eq('customer_id', customerId).then(r => r.data || []),
    supabase.from('deals').select('id').eq('customer_id', customerId).then(r => r.data || []),
  ])

  const projectIds = projectRijen.map(p => p.id)
  // Ook de werkbonnen die via hun project bij deze klant horen maar zelf geen
  // customer_id dragen: anders vallen hun uren en materiaal buiten het
  // overzicht terwijl ze op de projectkaart wél meetellen.
  const werkbonIds = new Set(werkbonRijen.map(w => w.id))
  if (projectIds.length) {
    const { data: viaProject } = await supabase
      .from('werkbonnen').select('id').in('project_id', projectIds)
    for (const w of viaProject || []) werkbonIds.add(w.id)
  }
  const werkbonIdLijst = [...werkbonIds]
  const dealIds = dealRijen.map(d => d.id)

  const orDelen = [`customer_id.eq.${customerId}`]
  if (projectIds.length) orDelen.push(`project_id.in.(${projectIds.join(',')})`)
  if (werkbonIdLijst.length) orDelen.push(`werkbon_id.in.(${werkbonIdLijst.join(',')})`)
  if (dealIds.length) orDelen.push(`deal_id.in.(${dealIds.join(',')})`)

  const haalJobCosts = async (select) => alleRijen(() => supabase
    .from('job_costs')
    .select(select, { count: 'exact' })
    .or(orDelen.join(','))
    .order('cost_date', { ascending: false })
    .order('id', { ascending: true }))

  // Kent de API de materiaalrelatie nog niet, dan weigert hij de héle select.
  // Terugvallen op de kale kolommen: liever kosten zonder inkoopprijs dan een
  // leeg overzicht.
  let jobCosts
  try {
    jobCosts = (await haalJobCosts(MET_INKOOP)).map(metMateriaalVelden)
  } catch {
    jobCosts = (await haalJobCosts('*').catch(() => [])).map(toJobCost)
  }
  // Ontdubbelen op id: één rij is één kostenpost, ongeacht hoeveel routes er
  // naar deze klant leiden.
  jobCosts = [...new Map(jobCosts.map(k => [k.id, k])).values()]

  const [projectKosten, urenRegels] = await Promise.all([
    projectIds.length
      ? alleRijen(() => supabase
          .from('project_kosten')
          .select('*', { count: 'exact' })
          .in('project_id', projectIds)
          .order('datum', { ascending: true })
          .order('id', { ascending: true }))
        .then(rows => rows.map(toProjectKost))
        .catch(() => [])
      : [],
    werkbonIdLijst.length
      ? alleRijen(() => supabase
          .from('werkbon_uren')
          .select('uren, reis_km, werkbon_id', { count: 'exact' })
          .in('werkbon_id', werkbonIdLijst)
          .order('id', { ascending: true }))
        .then(rows => rows.map(r => ({ uren: Number(r.uren || 0), reisKm: r.reis_km == null ? null : Number(r.reis_km) })))
        .catch(() => [])
      : [],
  ])

  return bouwKostenOverzicht({ jobCosts, projectKosten, urenRegels })
}

/** Alleen de projectkosten van een klant, gegroepeerd per project (voor de lijst). */
export function inkopenPerProject(regels = [], projecten = []) {
  const naam = new Map(projecten.map(p => [p.id, p.name || p.naam || '']))
  const per = new Map()
  for (const r of regels) {
    if (!per.has(r.projectId)) per.set(r.projectId, { projectId: r.projectId, naam: naam.get(r.projectId) || 'Project', regels: [], bedrag: 0 })
    const groep = per.get(r.projectId)
    groep.regels.push(r)
    groep.bedrag = rond(groep.bedrag + (Number(r.bedrag) || 0))
  }
  return [...per.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
}
