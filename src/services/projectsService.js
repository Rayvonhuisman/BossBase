import { supabase } from '../lib/supabase'
import { withCompanyId, getCompanyId } from '../lib/currentCompany'
import { logTijdlijnSafe } from './klantTijdlijnService'

// =============================================================================
// projects / time_entries / project_notes  service-laag
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

const toTimeEntry = row => ({
  id: row.id,
  companyId: row.company_id,
  projectId: row.project_id,
  userId: row.user_id,
  description: row.description || '',
  hours: Number(row.hours || 0),
  entryDate: row.entry_date,
  billable: row.billable !== false,
  hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
  createdAt: row.created_at,
  userName: row.profiles?.full_name || '',
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
// TIME ENTRIES
// =============================================================================

export async function getTimeEntries(projectId) {
  if (!projectId) return []
  const { data, error } = await supabase
    .from('time_entries')
    .select('*, profiles(full_name)')
    .eq('project_id', projectId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toTimeEntry)
}

export async function getAllTimeEntries() {
  const { data, error } = await supabase
    .from('time_entries')
    .select('*, profiles(full_name)')
    .order('entry_date', { ascending: false })
  if (error) throw error
  return (data || []).map(toTimeEntry)
}

export async function addTimeEntry(projectId, entryData = {}) {
  if (!projectId) throw new Error('projectId is verplicht')
  const hours = Number(entryData.hours ?? 0)
  if (!hours || hours <= 0) throw new Error('Uren moet groter zijn dan 0')

  const base = {
    project_id: projectId,
    description: entryData.description || null,
    hours,
    entry_date: entryData.entry_date || entryData.entryDate || new Date().toISOString().slice(0, 10),
    billable: entryData.billable !== false,
    hourly_rate: entryData.hourly_rate ?? entryData.hourlyRate ?? null,
  }

  // user_id: prefer expliciet, anders ingelogde gebruiker
  let userId = entryData.user_id || entryData.userId || null
  if (!userId) {
    try {
      const { data: u } = await supabase.auth.getUser()
      userId = u?.user?.id || null
    } catch { /* ignore */ }
  }
  if (userId) base.user_id = userId

  Object.keys(base).forEach(k => base[k] === null && delete base[k])
  const payload = await withCompanyId(base)

  const { data, error } = await supabase
    .from('time_entries')
    .insert(payload)
    .select('*, profiles(full_name)')
    .single()
  if (error) throw error
  return toTimeEntry(data)
}

export async function updateTimeEntry(entryId, patch) {
  if (!entryId) throw new Error('entryId is verplicht')
  const updates = {}
  const map = {
    description: 'description',
    hours: 'hours',
    entryDate: 'entry_date',
    entry_date: 'entry_date',
    billable: 'billable',
    hourlyRate: 'hourly_rate',
    hourly_rate: 'hourly_rate',
  }
  Object.keys(patch || {}).forEach(k => {
    if (k in map) updates[map[k]] = patch[k]
  })
  if (Object.keys(updates).length === 0) return null

  const { data, error } = await supabase
    .from('time_entries')
    .update(updates)
    .eq('id', entryId)
    .select('*, profiles(full_name)')
    .single()
  if (error) throw error
  return toTimeEntry(data)
}

export async function deleteTimeEntry(entryId) {
  if (!entryId) throw new Error('entryId is verplicht')
  const { error } = await supabase.from('time_entries').delete().eq('id', entryId)
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
 * Verrijkt een project met afgeleide totalen op basis van time_entries + invoices.
 * Geeft een nieuw object terug; muteert het origineel niet.
 */
export function enrichProject(project, { timeEntries = [], invoices = [] } = {}) {
  const usedHours = timeEntries.reduce((s, t) => s + (Number(t.hours) || 0), 0)
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
 * Haalt projecten + bijbehorende time_entries en facturen op, en verrijkt
 * elk project met live totals. Eén batch-query per resource.
 */
export async function getEnrichedProjects() {
  const [projects, allEntries, allInvoices] = await Promise.all([
    getProjects(),
    getAllTimeEntries().catch(() => []),
    supabase.from('facturen').select('*').then(r => (r.error ? [] : r.data || [])),
  ])

  const entriesByProject = {}
  for (const e of allEntries) {
    if (!entriesByProject[e.projectId]) entriesByProject[e.projectId] = []
    entriesByProject[e.projectId].push(e)
  }
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
    timeEntries: entriesByProject[p.id] || [],
    invoices: invoicesByProject[p.id] || [],
  }))
}

// Re-export ter convenience voor pagina's die snelle toegang tot company_id willen
export { getCompanyId }
