import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { safeInsert } from "../lib/safeInsert"
import { logTijdlijnSafe } from "./klantTijdlijnService"

// Real DB columns: id, company_id, customer_id, deal_id, activity_id, title,
// start_at, end_at, location, description, created_at, updated_at.
// The UI carries a `type` field for color-coding events (job/visit/activity/event)
// — that's local UI state only; the DB has no type column.

export function buildEventTimes(date, time = "", end = "") {
  if (!date) return { start_at: null, end_at: null }
  const safeTime = time || "09:00"
  const start = new Date(`${date}T${safeTime}:00`)
  const endDate = end ? new Date(`${date}T${end}:00`) : new Date(start.getTime() + 60 * 60 * 1000)

  return {
    start_at: start.toISOString(),
    end_at: endDate.toISOString(),
  }
}

function splitEventTime(value) {
  if (!value) return { date: "", time: "" }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" }
  return {
    date: parsed.toISOString().slice(0, 10),
    time: parsed.toISOString().slice(11, 16),
  }
}

export function mapCalendarEventFormToPayload(input = {}) {
  const times = (input.start_at && input.end_at)
    ? { start_at: input.start_at, end_at: input.end_at }
    : buildEventTimes(input.date, input.time, input.end)

  const payload = {}
  if (input.title !== undefined) payload.title = input.title
  if (input.location !== undefined) payload.location = input.location || null

  // Description ↔ UI "notes". Accept either name from callers.
  if (input.description !== undefined) {
    payload.description = input.description || null
  } else if (input.notes !== undefined) {
    payload.description = input.notes || null
  }

  if (input.customer_id !== undefined || input.custId !== undefined) {
    payload.customer_id = input.customer_id ?? input.custId ?? null
  }
  if (input.deal_id !== undefined || input.dealId !== undefined) {
    payload.deal_id = input.deal_id ?? input.dealId ?? null
  }
  if (input.activity_id !== undefined || input.activityId !== undefined) {
    payload.activity_id = input.activity_id ?? input.activityId ?? null
  }

  payload.start_at = input.start_at || input.startAt || times.start_at
  payload.end_at = input.end_at || input.endAt || times.end_at

  return payload
}

const TYPE_COLORS = {
  job:      { color: "#fff4ec", textColor: "#e8784a" },
  visit:    { color: "#fff8f4", textColor: "#e8784a" },
  activity: { color: "#eff6ff", textColor: "#2563eb" },
  event:    { color: "#f0fdf4", textColor: "#15A34A" },
}

// We can't store `type` in the DB. Heuristic for display:
// - if linked to a deal with an activity → 'activity'
// - if linked to a customer only → 'visit'
// - otherwise → 'event'
function inferType(row) {
  if (row.activity_id) return "activity"
  if (row.deal_id) return "job"
  if (row.customer_id) return "visit"
  return "event"
}

export const toCalendarEvent = row => {
  const type = inferType(row)
  const palette = TYPE_COLORS[type] || TYPE_COLORS.event
  return {
    id: row.id,
    type,
    title: row.title || "Afspraak",
    custId: row.customer_id,
    dealId: row.deal_id,
    activityId: row.activity_id,
    location: row.location || "",
    description: row.description || "",
    notes: row.description || "",
    startAt: row.start_at || "",
    endAt: row.end_at || "",
    date: splitEventTime(row.start_at).date,
    time: splitEventTime(row.start_at).time,
    end: splitEventTime(row.end_at).time,
    color: palette.color,
    textColor: palette.textColor,
    raw: row,
  }
}

export async function listCalendarEvents() {
  const { data, error } = await supabase.from("calendar_events").select("*").order("start_at", { ascending: true })
  if (error) throw error
  return (data || []).map(toCalendarEvent)
}

export async function createCalendarEvent(input) {
  const payload = await withCompanyId(mapCalendarEventFormToPayload(input))
  const { data, error } = await safeInsert(supabase, "calendar_events", payload)
  if (error) throw error
  const event = toCalendarEvent(data)
  if (data.customer_id) {
    const dateStr = event.date ? ` op ${new Date(event.startAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}` : ''
    logTijdlijnSafe(data.customer_id, 'afspraak_ingepland', `Afspraak ingepland: ${event.title}${dateStr}`, { title: event.title, startAt: event.startAt })
  }
  return event
}

export async function updateCalendarEvent(id, input) {
  const payload = mapCalendarEventFormToPayload(input)
  const { data, error } = await supabase.from("calendar_events").update(payload).eq("id", id).select().single()
  if (error) throw error
  return toCalendarEvent(data)
}
