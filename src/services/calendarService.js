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
  if (input.type !== undefined) payload.type = input.type || null

  // UI "notes"/"description" → echte kolom `notes`.
  if (input.notes !== undefined) {
    payload.notes = input.notes || null
  } else if (input.description !== undefined) {
    payload.notes = input.description || null
  }

  if (input.customer_id !== undefined || input.custId !== undefined) {
    payload.customer_id = input.customer_id ?? input.custId ?? null
  }
  if (input.deal_id !== undefined || input.dealId !== undefined) {
    payload.deal_id = input.deal_id ?? input.dealId ?? null
  }
  if (input.werkbon_id !== undefined || input.werkbonId !== undefined) {
    payload.werkbon_id = input.werkbon_id ?? input.werkbonId ?? null
  }
  if (input.assigned_to !== undefined || input.assignedTo !== undefined) {
    payload.assigned_to = input.assigned_to ?? input.assignedTo ?? null
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
  const type = row.type || inferType(row)
  const palette = TYPE_COLORS[type] || TYPE_COLORS.event
  return {
    id: row.id,
    type,
    title: row.title || "Afspraak",
    custId: row.customer_id,
    dealId: row.deal_id,
    activityId: row.activiteit_id || row.activity_id || null,
    activiteitId: row.activiteit_id || null,
    werkbonId: row.werkbon_id || null,
    assignedTo: row.assigned_to || null,
    // Herkomst van het item: 'planning' (via de Planning-pagina) of 'zelf'
    // (rechtstreeks in de agenda). Basis voor een later bewerkrecht.
    herkomst: row.herkomst || 'zelf',
    comments: Array.isArray(row.comments) ? row.comments : [],
    location: row.location || "",
    description: row.notes || "",
    notes: row.notes || "",
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
  // Rechtstreeks in de agenda aangemaakt → herkomst 'zelf'. De planning-sync
  // (upsertWerkbonEvent/upsertActivityEvent) zet expliciet 'planning'.
  if (payload.herkomst == null) payload.herkomst = 'zelf'
  // Persoonlijke agenda: een handmatig agenda-item hoort standaard bij de maker,
  // zodat het in zijn eigen agenda verschijnt (en niet in die van collega's).
  if (payload.assigned_to == null) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) payload.assigned_to = user.id
  }
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

export async function deleteCalendarEvent(id) {
  if (!id) return
  const { error } = await supabase.from("calendar_events").delete().eq("id", id)
  if (error) throw error
}

// Werk alleen het notities/communicatie-veld bij (raakt tijden/velden niet aan).
export async function updateCalendarEventComments(id, comments) {
  const { data, error } = await supabase
    .from("calendar_events")
    .update({ comments })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toCalendarEvent(data)
}

// Maak/werk hét calendar_event van een werkbon bij (precies één per werkbon).
// Check eerst of er al een event bestaat met dit werkbon_id → UPDATE, anders INSERT.
// Voorkomt dubbele agenda-items bij herhaald inplannen.
export async function upsertWerkbonEvent({ werkbonId, title, date, time, end, customerId, description }) {
  if (!werkbonId) return null
  const times = buildEventTimes(date, time, end)
  // Agenda-item erft de eigenaar van de werkbon (persoonlijke agenda).
  const { data: wb } = await supabase.from("werkbonnen").select("assigned_to").eq("id", werkbonId).maybeSingle()
  const base = {
    title: title || "Werkbon",
    customer_id: customerId || null,
    notes: description || null,
    assigned_to: wb?.assigned_to || null,
    start_at: times.start_at,
    end_at: times.end_at,
  }

  const { data: existing } = await supabase
    .from("calendar_events")
    .select("id")
    .eq("werkbon_id", werkbonId)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from("calendar_events")
      .update(base)
      .eq("id", existing.id)
      .select()
      .single()
    if (error) throw error
    return toCalendarEvent(data)
  }

  // Nieuw item ontstaat via de planning → herkomst 'planning'. Alleen bij INSERT
  // gezet, zodat de oorspronkelijke herkomst bij een UPDATE behouden blijft.
  const payload = await withCompanyId({ ...base, werkbon_id: werkbonId, herkomst: "planning" })
  const { data, error } = await supabase
    .from("calendar_events")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toCalendarEvent(data)
}

// Maak/werk hét calendar_event van een activiteit bij (precies één per activiteit).
export async function upsertActivityEvent({ activiteitId, title, date, time, end, customerId, location, description }) {
  if (!activiteitId) return null
  const times = buildEventTimes(date, time, end)
  // Agenda-item erft de eigenaar van de activiteit (persoonlijke agenda).
  const { data: act } = await supabase.from("activities").select("assigned_to").eq("id", activiteitId).maybeSingle()
  const base = {
    title: title || "Activiteit",
    customer_id: customerId || null,
    location: location || null,
    notes: description || null,
    assigned_to: act?.assigned_to || null,
    start_at: times.start_at,
    end_at: times.end_at,
  }

  const { data: existing } = await supabase
    .from("calendar_events")
    .select("id")
    .eq("activiteit_id", activiteitId)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from("calendar_events")
      .update(base)
      .eq("id", existing.id)
      .select()
      .single()
    if (error) throw error
    return toCalendarEvent(data)
  }

  // Nieuw item ontstaat via de planning → herkomst 'planning'. Alleen bij INSERT
  // gezet, zodat de oorspronkelijke herkomst bij een UPDATE behouden blijft.
  const payload = await withCompanyId({ ...base, activiteit_id: activiteitId, herkomst: "planning" })
  const { data, error } = await supabase
    .from("calendar_events")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toCalendarEvent(data)
}

// Verwijder het gekoppelde calendar_event van een werkbon (bv. bij uit-plannen).
export async function deleteWerkbonEvent(werkbonId) {
  if (!werkbonId) return
  await supabase.from("calendar_events").delete().eq("werkbon_id", werkbonId)
}

// Verwijder het gekoppelde calendar_event van een activiteit.
export async function deleteActivityEvent(activiteitId) {
  if (!activiteitId) return
  await supabase.from("calendar_events").delete().eq("activiteit_id", activiteitId)
}

// Koppel (of ontkoppel met null) een werkbon aan een agenda-item.
export async function setCalendarEventWerkbon(id, werkbonId) {
  const { data, error } = await supabase
    .from("calendar_events")
    .update({ werkbon_id: werkbonId })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toCalendarEvent(data)
}
