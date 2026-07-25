import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { safeInsert } from "../lib/safeInsert"
import { sanitizeName } from "./customerService"
import { autoSyncActivitySafe, autoSyncDeleteSafe } from "./googleCalendarService"
import { upsertActivityEvent } from "./calendarService"


// Real DB columns: id, company_id, customer_id, deal_id, assigned_to, title, type,
// due_at, completed (boolean), notes, created_at, updated_at.
// UI uses a richer "status" string ('open' | 'today' | 'overdue' | 'completed' | 'done').
// We translate UI status ↔ DB completed inside this service.

export function buildDueAt(date, time = "") {
  if (!date) return null
  const safeTime = time || "09:00"
  return new Date(`${date}T${safeTime}:00`).toISOString()
}

const pad = n => String(n).padStart(2, '0')

function splitDueAt(dueAt) {
  if (!dueAt) return { date: "", time: "" }
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return { date: "", time: "" }
  // Use local timezone so 07:00 UTC (= 09:00 CEST) displays as 09:00 for the user.
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

// Join klant + de toegewezen medewerker (voor de naam), zodat we nooit een
// ruw assigned_to-id hoeven te tonen. De embed gebruikt de FK-naam expliciet.
const ACTIVITY_SELECT = "*, customers(*), assigned_profile:profiles!activities_assigned_to_fkey(full_name)"

const ALLOWED_TYPES = new Set(["call", "email", "visit", "task", "follow"])

// Engelse type-waardes blijven in de DB staan; voor weergave tonen we altijd
// een Nederlands label. Extra varianten zijn meegenomen voor de zekerheid.
export const ACTIVITEIT_TYPE_LABELS = {
  call: "Bellen",
  email: "E-mail",
  visit: "Bezoek",
  task: "Taak",
  follow: "Opvolgen",
  meeting: "Vergadering",
  note: "Notitie",
  quote: "Offerte",
  offer: "Offerte",
}

export const activiteitTypeLabel = t =>
  ACTIVITEIT_TYPE_LABELS[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : "")

const isCompletedStatus = status => status === "completed" || status === "done"

export function mapActivityFormToPayload(input = {}) {
  const dueAt = input.due_at ?? input.dueAt ?? buildDueAt(input.date, input.time)
  const payload = {}

  if (input.title !== undefined) payload.title = input.title
  if (input.notes !== undefined) payload.notes = input.notes || null

  if (input.type !== undefined) {
    payload.type = ALLOWED_TYPES.has(input.type) ? input.type : "task"
  }

  if (input.customer_id !== undefined || input.custId !== undefined) {
    payload.customer_id = input.customer_id ?? input.custId ?? null
  }
  if (input.deal_id !== undefined || input.dealId !== undefined) {
    payload.deal_id = input.deal_id ?? input.dealId ?? null
  }
  // Toewijzing: meerdere medewerkers (assigned_to_ids) + de primaire (assigned_to).
  if (input.assigned_to_ids !== undefined || input.assignedToIds !== undefined
      || input.assigned_to !== undefined || input.assignedTo !== undefined) {
    let ids = input.assigned_to_ids ?? input.assignedToIds
    if (!Array.isArray(ids)) {
      const single = input.assigned_to ?? input.assignedTo
      ids = single ? [single] : []
    }
    ids = ids.filter(Boolean)
    payload.assigned_to_ids = ids
    payload.assigned_to = ids[0] || null
  }
  if (input.endTime !== undefined || input.end_time !== undefined) {
    payload.end_time = input.endTime ?? input.end_time ?? null
  }
  if (input.location !== undefined) {
    payload.location = input.location || null
  }
  if (input.voertuig_id !== undefined || input.voertuigId !== undefined) {
    payload.voertuig_id = input.voertuig_id ?? input.voertuigId ?? null
  }

  if (dueAt) payload.due_at = dueAt

  // Translate UI status → DB completed boolean.
  if (input.completed !== undefined) {
    payload.completed = Boolean(input.completed)
  } else if (input.status !== undefined) {
    payload.completed = isCompletedStatus(input.status)
  }

  return payload
}

export const toActivity = row => {
  const completed = Boolean(row.completed)
  return {
    id: row.id,
    type: row.type || "task",
    title: row.title || "Activiteit",
    custId: row.customer_id,
    dealId: row.deal_id,
    customerName: sanitizeName(row.customers?.name || ""),
    dueAt: row.due_at || "",
    date: splitDueAt(row.due_at).date,
    time: splitDueAt(row.due_at).time,
    notes: row.notes || "",
    assignee: row.assigned_to || "",
    // Meerdere toegewezen medewerkers; valt terug op de enkele assigned_to.
    assignedToIds: Array.isArray(row.assigned_to_ids) && row.assigned_to_ids.length
      ? row.assigned_to_ids
      : (row.assigned_to ? [row.assigned_to] : []),
    assigneeName: sanitizeName(row.assigned_profile?.full_name || ""),
    endTime: row.end_time || null,
    location: row.location || '',
    voertuigId: row.voertuig_id || null,
    completed,
    // Synthesize a display status the existing UI expects.
    status: completed ? "completed" : computeOpenStatus(row.due_at),
    // Google Calendar sync state (columns added in migration 010).
    googleEventId: row.google_event_id || null,
    googleSyncStatus: row.google_sync_status || "not_synced",
    googleSyncedAt: row.google_calendar_synced_at || null,
    googleSyncError: row.google_sync_error || null,
    raw: row,
  }
}

function computeOpenStatus(dueAt) {
  if (!dueAt) return "open"
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return "open"
  // Compare in local timezone to avoid UTC midnight causing wrong day.
  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const dueDay = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`
  if (dueDay < today) return "overdue"
  if (dueDay === today) return "today"
  return "open"
}

export async function listActivities() {
  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_SELECT)
    .order("due_at", { ascending: true })
  if (error) throw error
  return (data || []).map(toActivity)
}

export async function createActivity(input) {
  const payload = await withCompanyId(mapActivityFormToPayload(input))
  // Standaard toewijzen aan de ingelogde gebruiker als er niemand gekozen is.
  // Zo is een activiteit nooit "niemand" en tonen we altijd een echte naam.
  if (!payload.assigned_to && (!payload.assigned_to_ids || payload.assigned_to_ids.length === 0)) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) { payload.assigned_to = user.id; payload.assigned_to_ids = [user.id] }
    } catch { /* ignore — blijft ongekoppeld als auth onbekend is */ }
  }
  const { data, error } = await safeInsert(supabase, "activities", payload, ACTIVITY_SELECT)
  if (error) throw error
  const activity = toActivity(data)
  autoSyncActivitySafe(activity)
  return activity
}

// Houd een eventueel gekoppeld agenda-item (calendar_event) in sync met de
// activiteit. We werken ALLEEN een bestaand event bij — we maken geen nieuw
// agenda-item voor activiteiten die nooit zijn ingepland. Zo loopt het agenda-
// item overal mee (agenda, activiteiten-pagina, planning), niet alleen op de
// plek waar de wijziging gebeurt. Best-effort, nooit blokkerend.
async function syncLinkedActivityEvent(activity) {
  try {
    const { data: existing } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("activiteit_id", activity.id)
      .maybeSingle()
    if (!existing) return // niet ingepland → geen agenda-item om bij te werken
    await upsertActivityEvent({
      activiteitId: activity.id,
      title: activity.title,
      date: activity.date,
      time: activity.time,
      end: activity.endTime || "",
      customerId: activity.custId || null,
      location: activity.location || null,
    })
  } catch { /* sync is best-effort */ }
}

export async function updateActivity(id, input) {
  const payload = mapActivityFormToPayload(input)
  const { data, error } = await supabase.from("activities").update(payload).eq("id", id).select(ACTIVITY_SELECT).single()
  if (error) throw error
  const activity = toActivity(data)
  autoSyncActivitySafe(activity)
  // Gekoppeld agenda-item meelopen (alleen als het al bestaat).
  await syncLinkedActivityEvent(activity)
  return activity
}

export async function deleteActivity(id) {
  // Capture the linked Google event id before the row is gone, so we can
  // remove the calendar event afterwards (best-effort, non-blocking).
  let googleEventId = null
  try {
    const { data: pre } = await supabase
      .from("activities").select("google_event_id").eq("id", id).maybeSingle()
    googleEventId = pre?.google_event_id || null
  } catch { /* column may not exist yet pre-migration — ignore */ }

  const { error } = await supabase.from("activities").delete().eq("id", id)
  if (error) throw error
  autoSyncDeleteSafe(id, googleEventId)
}

export async function completeActivity(id) {
  const { data, error } = await supabase
    .from("activities")
    .update({ completed: true })
    .eq("id", id)
    .select(ACTIVITY_SELECT)
    .single()
  if (error) throw error
  return toActivity(data)
}

export async function reopenActivity(id) {
  const { data, error } = await supabase
    .from("activities")
    .update({ completed: false })
    .eq("id", id)
    .select(ACTIVITY_SELECT)
    .single()
  if (error) throw error
  return toActivity(data)
}

// =============================================================================
// ACTIVITEIT NOTITIES (log) — losse rijen, zelfde patroon als project_notes.
// De oude tekstkolom activities.notes blijft voorlopig staan; de inhoud daarvan
// is bij de migratie als eerste logregel overgenomen.
// =============================================================================

const toActiviteitNotitie = row => ({
  id: row.id,
  companyId: row.company_id,
  activityId: row.activity_id,
  createdBy: row.created_by,
  note: row.note || '',
  createdAt: row.created_at,
  authorName: row.profiles?.full_name || '',
  raw: row,
})

export async function getActiviteitNotities(activityId) {
  if (!activityId) return []
  const { data, error } = await supabase
    .from('activiteit_notities')
    .select('*, profiles(full_name)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toActiviteitNotitie)
}

export async function addActiviteitNotitie(activityId, note) {
  if (!activityId) throw new Error('activityId is verplicht')
  const text = (typeof note === 'string' ? note : note?.note || '').trim()
  if (!text) throw new Error('Notitie mag niet leeg zijn')

  const base = { activity_id: activityId, note: text }
  try {
    const { data: u } = await supabase.auth.getUser()
    if (u?.user?.id) base.created_by = u.user.id
  } catch { /* ignore */ }

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('activiteit_notities')
    .insert(payload)
    .select('*, profiles(full_name)')
    .single()
  if (error) throw error
  return toActiviteitNotitie(data)
}

export async function deleteActiviteitNotitie(notitieId) {
  if (!notitieId) throw new Error('notitieId is verplicht')
  const { error } = await supabase.from('activiteit_notities').delete().eq('id', notitieId)
  if (error) throw error
}
