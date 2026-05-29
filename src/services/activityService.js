import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { safeInsert } from "../lib/safeInsert"
import { sanitizeName } from "./customerService"
import { autoSyncActivitySafe, autoSyncDeleteSafe } from "./googleCalendarService"


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

const ALLOWED_TYPES = new Set(["call", "email", "visit", "task", "follow"])

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
  if (input.assigned_to !== undefined) {
    payload.assigned_to = input.assigned_to || null
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
    // TODO: remove inappropriate demo customer data from Supabase
    customerName: sanitizeName(row.customers?.name || ""),
    dueAt: row.due_at || "",
    date: splitDueAt(row.due_at).date,
    time: splitDueAt(row.due_at).time,
    notes: row.notes || "",
    assignee: row.assigned_to || "",
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
    .select("*, customers(*)")
    .order("due_at", { ascending: true })
  if (error) throw error
  return (data || []).map(toActivity)
}

export async function createActivity(input) {
  const payload = await withCompanyId(mapActivityFormToPayload(input))
  const { data, error } = await safeInsert(supabase, "activities", payload, "*, customers(*)")
  if (error) throw error
  const activity = toActivity(data)
  autoSyncActivitySafe(activity)
  return activity
}

export async function updateActivity(id, input) {
  const payload = mapActivityFormToPayload(input)
  const { data, error } = await supabase.from("activities").update(payload).eq("id", id).select("*, customers(*)").single()
  if (error) throw error
  const activity = toActivity(data)
  autoSyncActivitySafe(activity)
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
    .select("*, customers(*)")
    .single()
  if (error) throw error
  return toActivity(data)
}

export async function reopenActivity(id) {
  const { data, error } = await supabase
    .from("activities")
    .update({ completed: false })
    .eq("id", id)
    .select("*, customers(*)")
    .single()
  if (error) throw error
  return toActivity(data)
}
