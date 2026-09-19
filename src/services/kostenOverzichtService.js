import { supabase } from '../lib/supabase'
import { getProjectCosts, isWerkbonMateriaal, inkoopwaardeVanKosten, toJobCost } from './jobCostService.js'
import { listProjectKosten, listWerkbonKosten, toProjectKost } from './projectKostenService.js'
import { getTimeEntries } from './projectsService.js'
import { alleRijen } from '../lib/alleRijen.js'

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

// Doorvragen tot alle rijen binnen zijn: zie lib/alleRijen.js.

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

// ── Welke kosten horen bij een klant ───────────────────────────────────────
// Eén definitie, voor de klantkaart (getKlantKostenOverzicht, filtert in de
// database) én voor Financiën (getKostenOverzichtPerKlant, filtert hier). Zo kan
// een klant op Financiën niets anders laten zien dan op zijn klantkaart.
//
// Bij een klant horen: zijn projecten, zijn werkbonnen plus de werkbonnen van
// die projecten (een werkbon zonder eigen customer_id hoort via zijn project
// bij de klant), en zijn deals. Een kost hoort bij de klant als hij langs één
// van die routes aan hem hangt.

/**
 * @param {string} customerId
 * @param {object} rijen  { projecten, werkbonnen, deals } — ruwe rijen met
 *                        id, customer_id en (werkbonnen) project_id
 */
export function klantSleutels(customerId, { projecten = [], werkbonnen = [], deals = [] } = {}) {
  const projectIds = new Set(projecten.filter(p => p.customer_id === customerId).map(p => p.id))
  const werkbonIds = new Set(werkbonnen
    .filter(w => w.customer_id === customerId || (w.project_id && projectIds.has(w.project_id)))
    .map(w => w.id))
  const dealIds = new Set(deals.filter(d => d.customer_id === customerId).map(d => d.id))
  return { projectIds, werkbonIds, dealIds }
}

/** Hoort deze job_costs-rij (ruw, snake_case) bij de klant? */
export const kostHoortBijKlant = (rij, customerId, sleutels) =>
  rij.customer_id === customerId
  || (rij.project_id != null && sleutels.projectIds.has(rij.project_id))
  || (rij.werkbon_id != null && sleutels.werkbonIds.has(rij.werkbon_id))
  || (rij.deal_id != null && sleutels.dealIds.has(rij.deal_id))

/**
 * Hoort deze inkoop (project_kosten, ruw) bij de klant? Via zijn project, of via
 * zijn werkbon als die geen project heeft. Het blijft één rij, dus één keer.
 */
export const inkoopHoortBijKlant = (rij, sleutels) =>
  (rij.project_id != null && sleutels.projectIds.has(rij.project_id))
  || (rij.werkbon_id != null && sleutels.werkbonIds.has(rij.werkbon_id))

const naarUrenRegel = r => ({ uren: Number(r.uren || 0), reisKm: r.reis_km == null ? null : Number(r.reis_km) })

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

  // Ook deze id-lijsten doorvragen: ze bepalen via .in(...) welke kosten en uren
  // meetellen, dus een afgekapte lijst laat stil werk wegvallen ondanks dat de
  // rest van deze functie wél alles ophaalt.
  const idLijst = (tabel, select) => alleRijen(() => supabase
    .from(tabel)
    .select(select, { count: 'exact' })
    .eq('customer_id', customerId)
    .order('id', { ascending: true })).catch(() => [])

  const [projectRijen, werkbonRijen, dealRijen] = await Promise.all([
    idLijst('projects', 'id, customer_id'),
    idLijst('werkbonnen', 'id, project_id, customer_id'),
    idLijst('deals', 'id, customer_id'),
  ])

  // Ook de werkbonnen die via hun project bij deze klant horen maar zelf geen
  // customer_id dragen: anders vallen hun uren en materiaal buiten het
  // overzicht terwijl ze op de projectkaart wél meetellen.
  const eigenProjectIds = projectRijen.map(p => p.id)
  const viaProject = eigenProjectIds.length
    ? await alleRijen(() => supabase
        .from('werkbonnen')
        .select('id, project_id, customer_id', { count: 'exact' })
        .in('project_id', eigenProjectIds)
        .order('id', { ascending: true })).catch(() => [])
    : []
  const sleutels = klantSleutels(customerId, {
    projecten: projectRijen,
    werkbonnen: [...werkbonRijen, ...viaProject],
    deals: dealRijen,
  })
  const projectIds = [...sleutels.projectIds]
  const werkbonIdLijst = [...sleutels.werkbonIds]
  const dealIds = [...sleutels.dealIds]

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
  // De database filtert al op dezelfde routes; kostHoortBijKlant erover is
  // dezelfde regel als op Financiën, zodat die twee niet uit elkaar lopen.
  const bijKlant = rows => rows.filter(r => kostHoortBijKlant(r, customerId, sleutels))
  let jobCosts
  try {
    jobCosts = bijKlant(await haalJobCosts(MET_INKOOP)).map(metMateriaalVelden)
  } catch {
    jobCosts = bijKlant(await haalJobCosts('*').catch(() => [])).map(toJobCost)
  }
  // Ontdubbelen op id: één rij is één kostenpost, ongeacht hoeveel routes er
  // naar deze klant leiden.
  jobCosts = [...new Map(jobCosts.map(k => [k.id, k])).values()]

  const [projectKosten, urenRegels] = await Promise.all([
    (projectIds.length || werkbonIdLijst.length)
      ? alleRijen(() => supabase
          .from('project_kosten')
          .select('*', { count: 'exact' })
          .or([
            projectIds.length ? `project_id.in.(${projectIds.join(',')})` : null,
            werkbonIdLijst.length ? `werkbon_id.in.(${werkbonIdLijst.join(',')})` : null,
          ].filter(Boolean).join(','))
          .order('datum', { ascending: true })
          .order('id', { ascending: true }))
        .then(rows => rows.filter(r => inkoopHoortBijKlant(r, sleutels)).map(toProjectKost))
        .catch(() => [])
      : [],
    werkbonIdLijst.length
      ? alleRijen(() => supabase
          .from('werkbon_uren')
          .select('uren, reis_km, werkbon_id', { count: 'exact' })
          .in('werkbon_id', werkbonIdLijst)
          .order('id', { ascending: true }))
        .then(rows => rows.map(naarUrenRegel))
        .catch(() => [])
      : [],
  ])

  return bouwKostenOverzicht({ jobCosts, projectKosten, urenRegels })
}

/**
 * Kostenoverzicht van ÁLLE klanten in één keer, voor Financiën.
 *
 * Zelfde toewijzing (klantSleutels + kostHoortBijKlant) en zelfde rekenwerk
 * (bouwKostenOverzicht) als getKlantKostenOverzicht; alleen haalt deze alles
 * één keer op in plaats van per klant een reeks queries te doen.
 *
 * @param {string[]} customerIds
 * @returns {Promise<Map<string, object>>} customerId → overzicht
 */
export async function getKostenOverzichtPerKlant(customerIds = []) {
  const alles = (tabel, select) => alleRijen(() => supabase
    .from(tabel)
    .select(select, { count: 'exact' })
    .order('id', { ascending: true }))

  const [projecten, werkbonnen, deals, pkRijen, urenRijen] = await Promise.all([
    alles('projects', 'id, customer_id'),
    alles('werkbonnen', 'id, project_id, customer_id'),
    alles('deals', 'id, customer_id'),
    alles('project_kosten', '*'),
    alles('werkbon_uren', 'id, uren, reis_km, werkbon_id'),
  ])
  let jcRijen, naarKost
  try {
    jcRijen = await alles('job_costs', MET_INKOOP)
    naarKost = metMateriaalVelden
  } catch {
    jcRijen = await alles('job_costs', '*')
    naarKost = toJobCost
  }

  const per = new Map()
  for (const cid of customerIds) {
    const sleutels = klantSleutels(cid, { projecten, werkbonnen, deals })
    per.set(cid, bouwKostenOverzicht({
      jobCosts: jcRijen.filter(r => kostHoortBijKlant(r, cid, sleutels)).map(naarKost),
      projectKosten: pkRijen.filter(r => inkoopHoortBijKlant(r, sleutels)).map(toProjectKost),
      urenRegels: urenRijen.filter(r => sleutels.werkbonIds.has(r.werkbon_id)).map(naarUrenRegel),
    }))
  }
  return per
}

/**
 * De bronrijen van één werkbon, voor het blok "Kosten" op de werkbon: materiaal
 * (en boekingen) uit job_costs, en de inkopen die op deze werkbon zijn
 * toegevoegd. De uren heeft de werkbonpagina al; die gaan er daar bij in
 * bouwKostenOverzicht, zodat het rekenwerk hetzelfde blijft.
 */
export async function getWerkbonKostenBron(werkbonId) {
  if (!werkbonId) return { jobCosts: [], projectKosten: [] }
  const haal = select => alleRijen(() => supabase
    .from('job_costs')
    .select(select, { count: 'exact' })
    .eq('werkbon_id', werkbonId)
    .order('id', { ascending: true }))
  let jobCosts
  try {
    jobCosts = (await haal(MET_INKOOP)).map(metMateriaalVelden)
  } catch {
    jobCosts = (await haal('*').catch(() => [])).map(toJobCost)
  }
  const projectKosten = await listWerkbonKosten(werkbonId)
  return { jobCosts, projectKosten }
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
