import { supabase } from '../lib/supabase'
import { withCompanyId, getCompanyId } from '../lib/currentCompany'
import { logTijdlijnSafe } from './klantTijdlijnService'

// =============================================================================
// projects / uren (urenregistratie) / project_notes  service-laag
// Schema: zie supabase/migrations/017_projects.sql
// =============================================================================

const toProject = row => ({
  id: row.id,
  companyId: row.company_id,
  customerId: row.customer_id,
  dealId: row.deal_id,
  offerteId: row.offerte_id,
  name: row.name || '',
  description: row.description || '',
  status: row.status || 'concept',
  projectValue: Number(row.project_value || 0),
  quotedHours: Number(row.quoted_hours || 0),
  usedHoursCached: Number(row.used_hours || 0),
  startDate: row.start_date || null,
  deadline: row.deadline || null,
  ownerId: row.owner_id || null,
  assignedTo: row.assigned_to || null,
  createdBy: row.created_by || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  customerName: row.customers?.name || '',
  dealTitle: row.deals?.title || row.deals?.name || row.deals?.description || '',
  offerteNummer: row.offertes?.nummer || '',
  offerteTotaalIncl: Number(row.offertes?.totaal_incl || 0),
  offerteArbeidsuren: Number(row.offertes?.arbeidsuren || 0),
  raw: row,
})

// Uren leven in urenregistratie (de enige bron van waarheid). We mappen een
// urenregistratie-rij naar het time-entry model dat de project-UI verwacht.
// `resolvedProjectId` is project_id direct, of afgeleid via de werkbon.
const toTimeEntry = (row, resolvedProjectId = null) => ({
  id: row.id,
  companyId: row.company_id,
  projectId: row.project_id || resolvedProjectId || null,
  userId: row.profile_id,
  description: row.notitie || '',
  hours: Number(row.uren || 0),
  entryDate: row.datum,
  billable: true,
  hourlyRate: null,
  createdAt: row.created_at,
  userName: row.profiles?.full_name || '',
  werkbonId: row.werkbon_id || null,
  viaWerkbon: !row.project_id && !!row.werkbon_id,
  raw: row,
})

const toProjectNote = row => ({
  id: row.id,
  companyId: row.company_id,
  projectId: row.project_id,
  createdBy: row.created_by,
  note: row.note || '',
  createdAt: row.created_at,
  authorName: row.profiles?.full_name || '',
  raw: row,
})

const stripUndef = obj => {
  const out = {}
  Object.keys(obj).forEach(k => {
    if (obj[k] !== undefined) out[k] = obj[k]
  })
  return out
}

// Project status-labels (Nederlands) en kleur
export const PROJECT_STATUS = {
  concept:          { label: 'Concept',          col: 'b-gray' },
  offerte_akkoord:  { label: 'Offerte akkoord',  col: 'b-accepted' },
  lopend:           { label: 'Lopend',           col: 'b-progress' },
  wachten_op_klant: { label: 'Wachten op klant', col: 'b-orange' },
  te_factureren:    { label: 'Te factureren',    col: 'b-blue' },
  afgerond:         { label: 'Afgerond',         col: 'b-done' },
  risico:           { label: 'Risico',           col: 'b-lost' },
}

export const PROJECT_STATUS_OPTIONS = Object.entries(PROJECT_STATUS).map(([id, v]) => ({ id, label: v.label }))

// =============================================================================
// PROJECTS
// =============================================================================

export async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*, customers(name), deals(title), offertes(nummer, totaal_incl, arbeidsuren)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toProject)
}

export async function getProjectsByCustomer(customerId) {
  if (!customerId) return []
  const { data, error } = await supabase
    .from('projects')
    .select('*, customers(name), deals(title), offertes(nummer, totaal_incl, arbeidsuren)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toProject)
}

export async function getProjectById(id) {
  const { data, error } = await supabase
    .from('projects')
    .select('*, customers(name), deals(title), offertes(nummer, totaal_incl, arbeidsuren)')
    .eq('id', id)
    .single()
  if (error) throw error
  return toProject(data)
}

export async function createProject(input) {
  const name = (input.name || '').trim()
  if (!name) throw new Error('Projectnaam is verplicht')

  const base = stripUndef({
    name,
    description: input.description || null,
    status: input.status || 'concept',
    customer_id: input.customer_id || input.customerId || null,
    deal_id: input.deal_id || input.dealId || null,
    offerte_id: input.offerte_id || input.offerteId || null,
    project_value: Number(input.project_value ?? input.projectValue ?? 0),
    quoted_hours: Number(input.quoted_hours ?? input.quotedHours ?? 0),
    start_date: input.start_date || input.startDate || null,
    deadline: input.deadline || null,
    owner_id: input.owner_id || input.ownerId || null,
    assigned_to: input.assigned_to || input.assignedTo || null,
  })

  // created_by op huidige gebruiker zetten zodat audit-trail intact blijft
  try {
    const { data: u } = await supabase.auth.getUser()
    if (u?.user?.id) base.created_by = u.user.id
  } catch { /* ignore */ }

  // null-keys verwijderen zodat DB-defaults blijven gelden
  Object.keys(base).forEach(k => base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('projects')
    .insert(payload)
    .select('*, customers(name), deals(title), offertes(nummer, totaal_incl, arbeidsuren)')
    .single()
  if (error) throw error
  const project = toProject(data)
  if (project.customerId) {
    logTijdlijnSafe(project.customerId, 'project_aangemaakt',
      `Project aangemaakt: ${project.name}`, { name: project.name })
  }
  return project
}

export async function updateProject(projectId, patch) {
  if (!projectId) throw new Error('projectId is verplicht')
  const updates = {}
  const map = {
    name: 'name',
    description: 'description',
    status: 'status',
    customerId: 'customer_id',
    customer_id: 'customer_id',
    dealId: 'deal_id',
    deal_id: 'deal_id',
    offerteId: 'offerte_id',
    offerte_id: 'offerte_id',
    projectValue: 'project_value',
    project_value: 'project_value',
    quotedHours: 'quoted_hours',
    quoted_hours: 'quoted_hours',
    startDate: 'start_date',
    start_date: 'start_date',
    deadline: 'deadline',
    ownerId: 'owner_id',
    owner_id: 'owner_id',
    assignedTo: 'assigned_to',
    assigned_to: 'assigned_to',
  }
  Object.keys(patch || {}).forEach(k => {
    if (k in map) updates[map[k]] = patch[k]
  })
  if (Object.keys(updates).length === 0) return getProjectById(projectId)

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select('*, customers(name), deals(title), offertes(nummer, totaal_incl, arbeidsuren)')
    .single()
  if (error) throw error
  const project = toProject(data)
  if (project.customerId && updates.status) {
    const statusLabel = PROJECT_STATUS[updates.status]?.label || updates.status
    logTijdlijnSafe(project.customerId, 'project_status_gewijzigd',
      `Project status gewijzigd naar ${statusLabel}`,
      { name: project.name, status: updates.status })
  }
  return project
}

export async function deleteProject(projectId) {
  if (!projectId) throw new Error('projectId is verplicht')
  const { error } = await supabase.from('projects').delete().eq('id', projectId)
  if (error) throw error
}

// =============================================================================
// TIME ENTRIES  (bron: urenregistratie — de enige urentabel)
// =============================================================================

// Map werkbon → project, zodat we uren die via een werkbon zijn geboekt kunnen
// toewijzen aan het project van die werkbon.
async function getWerkbonProjectMap() {
  const { data, error } = await supabase.from('werkbonnen').select('id, project_id')
  if (error) return {}
  const map = {}
  for (const w of (data || [])) if (w.project_id) map[w.id] = w.project_id
  return map
}

// Uren van één project: rechtstreeks (project_id) óf via een werkbon van dit
// project (werkbonnen.project_id = projectId).
export async function getTimeEntries(projectId) {
  if (!projectId) return []
  const wbMap = await getWerkbonProjectMap()
  const werkbonIds = Object.keys(wbMap).filter(id => wbMap[id] === projectId)

  const orParts = [`project_id.eq.${projectId}`]
  if (werkbonIds.length) orParts.push(`werkbon_id.in.(${werkbonIds.join(',')})`)

  const { data, error } = await supabase
    .from('urenregistratie')
    .select('*, profiles(full_name)')
    .or(orParts.join(','))
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(r => toTimeEntry(r, projectId))
}

// Totaal geregistreerde uren per project (direct + via werkbon), voor de
// project-lijst (nacalculatie). Geeft { projectId: totaalUren }.
export async function getProjectHoursMap() {
  const [urenRes, wbMap] = await Promise.all([
    supabase.from('urenregistratie').select('uren, project_id, werkbon_id'),
    getWerkbonProjectMap(),
  ])
  const byProject = {}
  for (const u of (urenRes.data || [])) {
    const pid = u.project_id || wbMap[u.werkbon_id] || null
    if (!pid) continue
    byProject[pid] = (byProject[pid] || 0) + Number(u.uren || 0)
  }
  return byProject
}

export async function addTimeEntry(projectId, entryData = {}) {
  if (!projectId) throw new Error('projectId is verplicht')
  const hours = Number(entryData.hours ?? 0)
  if (!hours || hours <= 0) throw new Error('Uren moet groter zijn dan 0')

  // profile_id: expliciet of de ingelogde gebruiker.
  let profileId = entryData.user_id || entryData.userId || entryData.profile_id || entryData.profileId || null
  if (!profileId) {
    try {
      const { data: u } = await supabase.auth.getUser()
      profileId = u?.user?.id || null
    } catch { /* ignore */ }
  }
  if (!profileId) throw new Error('Geen medewerker bekend voor deze urenregistratie')

  const base = {
    profile_id: profileId,
    project_id: projectId,
    datum: entryData.entry_date || entryData.entryDate || new Date().toISOString().slice(0, 10),
    uren: hours,
    type: entryData.type || 'arbeid',
    notitie: entryData.description || null,
  }
  Object.keys(base).forEach(k => base[k] === null && delete base[k])
  const payload = await withCompanyId(base)

  const { data, error } = await supabase
    .from('urenregistratie')
    .insert(payload)
    .select('*, profiles(full_name)')
    .single()
  if (error) throw error
  return toTimeEntry(data, projectId)
}

export async function updateTimeEntry(entryId, patch) {
  if (!entryId) throw new Error('entryId is verplicht')
  const updates = {}
  const map = {
    description: 'notitie',
    notitie: 'notitie',
    hours: 'uren',
    uren: 'uren',
    entryDate: 'datum',
    entry_date: 'datum',
    datum: 'datum',
  }
  Object.keys(patch || {}).forEach(k => {
    if (k in map) updates[map[k]] = patch[k]
  })
  if (Object.keys(updates).length === 0) return null

  const { data, error } = await supabase
    .from('urenregistratie')
    .update(updates)
    .eq('id', entryId)
    .select('*, profiles(full_name)')
    .single()
  if (error) throw error
  return toTimeEntry(data)
}

export async function deleteTimeEntry(entryId) {
  if (!entryId) throw new Error('entryId is verplicht')
  const { error } = await supabase.from('urenregistratie').delete().eq('id', entryId)
  if (error) throw error
}

// =============================================================================
// PROJECT NOTES
// =============================================================================

export async function getProjectNotes(projectId) {
  if (!projectId) return []
  const { data, error } = await supabase
    .from('project_notes')
    .select('*, profiles(full_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toProjectNote)
}

export async function addProjectNote(projectId, note) {
  if (!projectId) throw new Error('projectId is verplicht')
  const text = (typeof note === 'string' ? note : note?.note || '').trim()
  if (!text) throw new Error('Notitie mag niet leeg zijn')

  const base = { project_id: projectId, note: text }
  try {
    const { data: u } = await supabase.auth.getUser()
    if (u?.user?.id) base.created_by = u.user.id
  } catch { /* ignore */ }

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('project_notes')
    .insert(payload)
    .select('*, profiles(full_name)')
    .single()
  if (error) throw error
  return toProjectNote(data)
}

export async function deleteProjectNote(noteId) {
  if (!noteId) throw new Error('noteId is verplicht')
  const { error } = await supabase.from('project_notes').delete().eq('id', noteId)
  if (error) throw error
}

// =============================================================================
// PROJECT INVOICES — leest uit `facturen` met project_id (zie migratie 017)
// =============================================================================

export async function getProjectInvoices(projectId) {
  if (!projectId) return []
  const { data, error } = await supabase
    .from('facturen')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(row => ({
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    projectId: row.project_id,
    nummer: row.nummer || '',
    status: row.status || 'concept',
    factuurdatum: row.factuurdatum || null,
    vervaldatum: row.vervaldatum || null,
    betaaldOp: row.betaald_op || null,
    totaalExcl: Number(row.totaal_excl || 0),
    totaalIncl: Number(row.totaal_incl || 0),
    raw: row,
  }))
}

// Koppel een bestaande factuur aan een project (utility — niet via UI gebruikt)
export async function linkFactuurToProject(factuurId, projectId) {
  const { data, error } = await supabase
    .from('facturen')
    .update({ project_id: projectId })
    .eq('id', factuurId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// =============================================================================
// COMPUTED VALUES / PROJECT HEALTH
// =============================================================================

/**
 * Verrijkt een project met afgeleide totalen op basis van urenregistratie + invoices.
 * Geeft een nieuw object terug; muteert het origineel niet.
 */
export function enrichProject(project, { timeEntries = [], invoices = [], usedHours: usedHoursArg } = {}) {
  // usedHours expliciet (uit de hours-map) of afgeleid uit de meegegeven regels.
  const usedHours = usedHoursArg != null
    ? Number(usedHoursArg)
    : timeEntries.reduce((s, t) => s + (Number(t.hours) || 0), 0)
  const quoted = Number(project.quotedHours || 0)
  const remainingHours = Math.max(0, quoted - usedHours)
  const hoursPercentage = quoted > 0 ? usedHours / quoted : 0

  const invoicedAmount = invoices.reduce(
    (s, f) => s + Number(f.totaalIncl || f.totaal_incl || 0),
    0,
  )
  const value = Number(project.projectValue || 0)
  const remainingToInvoice = Math.max(0, value - invoicedAmount)

  const health = calculateProjectHealth({
    ...project,
    usedHours,
    hoursPercentage,
    remainingToInvoice,
  })

  return {
    ...project,
    usedHours: Math.round(usedHours * 100) / 100,
    remainingHours: Math.round(remainingHours * 100) / 100,
    hoursPercentage,
    invoicedAmount: Math.round(invoicedAmount * 100) / 100,
    remainingToInvoice: Math.round(remainingToInvoice * 100) / 100,
    health,
  }
}

/**
 * Berekent een health-label voor een project.
 * Regels:
 *   - 'overschreden' wanneer hoursPercentage > 1 (>100%)
 *   - 'risk' wanneer deadline verlopen en status niet 'afgerond'
 *   - 'warning' wanneer hoursPercentage >= 0.8
 *   - 'invoice'  wanneer status 'te_factureren' en remainingToInvoice > 0
 *   - anders 'healthy'
 */
export function calculateProjectHealth(p = {}) {
  const used = Number(p.usedHours ?? p.used_hours ?? 0)
  const quoted = Number(p.quotedHours ?? p.quoted_hours ?? 0)
  const pct = p.hoursPercentage != null
    ? Number(p.hoursPercentage)
    : (quoted > 0 ? used / quoted : 0)

  const today = new Date().toISOString().slice(0, 10)
  const status = p.status || 'concept'
  const deadlineRisk = Boolean(p.deadline) && p.deadline < today && status !== 'afgerond'
  const invoiceRisk = status === 'te_factureren' && Number(p.remainingToInvoice || 0) > 0

  // overschreden gaat boven alles
  if (pct > 1) {
    return { id: 'overschreden', label: 'Uren overschreden', col: 'b-lost', tone: 'risk' }
  }
  if (deadlineRisk) {
    return { id: 'deadline', label: 'Deadline verlopen', col: 'b-lost', tone: 'risk' }
  }
  if (pct >= 0.8) {
    return { id: 'warning', label: 'Let op urenbudget', col: 'b-orange', tone: 'warning' }
  }
  if (invoiceRisk) {
    return { id: 'invoice', label: 'Facturatie openstaand', col: 'b-blue', tone: 'warning' }
  }
  return { id: 'healthy', label: 'Gezond', col: 'b-accepted', tone: 'healthy' }
}

// =============================================================================
// AGGREGATIE — gebruikt door ProjectsPage voor KPI's en lijst-verrijking
// =============================================================================

/**
 * Haalt projecten + geregistreerde uren (urenregistratie) en facturen op, en verrijkt
 * elk project met live totals. Eén batch-query per resource.
 */
export async function getEnrichedProjects() {
  const [projects, hoursByProject, allInvoices] = await Promise.all([
    getProjects(),
    getProjectHoursMap().catch(() => ({})),
    supabase.from('facturen').select('*').then(r => (r.error ? [] : r.data || [])),
  ])

  const invoicesByProject = {}
  for (const f of allInvoices) {
    if (!f.project_id) continue
    if (!invoicesByProject[f.project_id]) invoicesByProject[f.project_id] = []
    invoicesByProject[f.project_id].push({
      totaalIncl: Number(f.totaal_incl || 0),
      status: f.status,
    })
  }
  return projects.map(p => enrichProject(p, {
    usedHours: hoursByProject[p.id] || 0,
    invoices: invoicesByProject[p.id] || [],
  }))
}

// Re-export ter convenience voor pagina's die snelle toegang tot company_id willen
export { getCompanyId }
