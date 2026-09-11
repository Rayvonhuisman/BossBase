import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { safeInsert } from "../lib/safeInsert"
import { logTijdlijnSafe } from "./klantTijdlijnService"
import { lokaalNaarUtc, splitsLokaal } from "../lib/datumTijd"

// Real DB columns: id, company_id, customer_id, deal_id, activity_id, title,
// start_at, end_at, location, description, created_at, updated_at.
// The UI carries a `type` field for color-coding events (job/visit/activity/event)
// — that's local UI state only; the DB has no type column.

// De ingevoerde tijd is Nederlandse wandkloektijd; de kolommen zijn timestamptz.
// Heen en terug loopt daarom altijd via lib/datumTijd, zodat 09:00 ook echt als
// 09:00 terugkomt. Eerder werd hier bij het teruglezen `.toISOString()` gebruikt,
// wat de UTC-wijzerplaat gaf (09:00 → 07:00).
export function buildEventTimes(date, time = "", end = "") {
  if (!date) return { start_at: null, end_at: null }
  const start = lokaalNaarUtc(date, time || "09:00")
  if (!start) return { start_at: null, end_at: null }
  const endDate = end ? lokaalNaarUtc(date, end) : new Date(start.getTime() + 60 * 60 * 1000)

  return {
    start_at: start.toISOString(),
    end_at: (endDate || new Date(start.getTime() + 60 * 60 * 1000)).toISOString(),
  }
}

const splitEventTime = splitsLokaal

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
  // (syncWerkbonEvents/upsertActivityEvent) zet expliciet 'planning'.
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

// Agenda-items van een werkbon: één per geplande dag (calendar_events.werkbon_dag_id).
// De werkbon zelf is de bron: deze functie leest hem opnieuw in en brengt de
// agenda daarmee in lijn — ontbrekende dagen erbij, vervallen dagen weg, titel
// en tijden bijgewerkt. Een dag zonder starttijd krijgt geen item; zo'n dag telt
// op de planning ook als niet ingepland.
//
// Een item dat al aan de werkbon hing zonder dag (van vóór de dagen-tabel, of
// een handmatig agenda-item waar de werkbon uit is aangemaakt) wordt overgenomen
// door de dag op dezelfde datum. Planning-items die nergens meer bij horen gaan
// weg; handmatige items blijven staan.
export async function syncWerkbonEvents(werkbonId) {
  if (!werkbonId) return
  const lees = dagVelden => supabase
    .from("werkbonnen")
    .select(`id, titel, customer_id, omschrijving, assigned_to, starttijd, eindtijd, werkbon_dagen(${dagVelden})`)
    .eq("id", werkbonId)
    .maybeSingle()
  let { data: wb, error } = await lees("id, datum, starttijd, eindtijd, medewerker_ids")
  // Vóór migratie werkbon_dag_medewerkers: zonder dagploeg, dus de hele ploeg.
  if (error && /medewerker_ids/i.test(error.message || "")) ({ data: wb, error } = await lees("id, datum, starttijd, eindtijd"))
  // Vóór migratie werkbon_dagen: het oude gedrag, één item per werkbon.
  if (error && /werkbon_dagen/i.test(error.message || "")) return syncEnkelWerkbonEvent(werkbonId)
  if (error) throw error
  if (!wb) return

  const hhmm = t => (t ? String(t).slice(0, 5) : "")
  const gewenst = (wb.werkbon_dagen || [])
    .map(dag => ({ dag, start: hhmm(dag.starttijd) || hhmm(wb.starttijd), eind: hhmm(dag.eindtijd) || hhmm(wb.eindtijd) }))
    .filter(x => x.start)

  const { data: bestaand, error: leesFout } = await supabase
    .from("calendar_events")
    .select("id, werkbon_dag_id, herkomst, start_at")
    .eq("werkbon_id", werkbonId)
  if (leesFout) throw leesFout
  const over = [...(bestaand || [])]
  const pak = pred => {
    const i = over.findIndex(pred)
    return i < 0 ? null : over.splice(i, 1)[0]
  }

  const base = {
    title: wb.titel || "Werkbon",
    customer_id: wb.customer_id || null,
    notes: wb.omschrijving || null,
    // Agenda-item erft de eigenaar van de werkbon (persoonlijke agenda).
    assigned_to: wb.assigned_to || null,
  }
  for (const { dag, start, eind } of gewenst) {
    const times = buildEventTimes(dag.datum, start, eind)
    // Heeft de dag een eigen dagploeg, dan hoort het item bij de eerste van díé
    // ploeg (leeg = niemand die dag); anders bij de eigenaar van de werkbon.
    const eigenaar = Array.isArray(dag.medewerker_ids) ? (dag.medewerker_ids[0] || null) : base.assigned_to
    const item = pak(e => e.werkbon_dag_id === dag.id)
      || pak(e => !e.werkbon_dag_id && splitEventTime(e.start_at).date === dag.datum)
    if (item) {
      const { error: e } = await supabase
        .from("calendar_events")
        .update({ ...base, assigned_to: eigenaar, ...times, werkbon_dag_id: dag.id })
        .eq("id", item.id)
      if (e) throw e
    } else {
      const payload = await withCompanyId({
        ...base, assigned_to: eigenaar, ...times, werkbon_id: werkbonId, werkbon_dag_id: dag.id, herkomst: "planning",
      })
      const { error: e } = await supabase.from("calendar_events").insert(payload)
      if (e) throw e
    }
  }

  const weg = over.filter(e => e.werkbon_dag_id || e.herkomst === "planning").map(e => e.id)
  if (weg.length) {
    const { error: e } = await supabase.from("calendar_events").delete().in("id", weg)
    if (e) throw e
  }
}

// Terugval zolang de database geen werkbon_dagen kent.
async function syncEnkelWerkbonEvent(werkbonId) {
  const { data: wb } = await supabase
    .from("werkbonnen")
    .select("titel, customer_id, omschrijving, gepland_op, starttijd, eindtijd")
    .eq("id", werkbonId)
    .maybeSingle()
  if (!wb?.gepland_op || !wb?.starttijd) {
    await supabase.from("calendar_events").delete().eq("werkbon_id", werkbonId)
    return null
  }
  return upsertWerkbonEvent({
    werkbonId,
    title: wb.titel,
    date: wb.gepland_op,
    time: String(wb.starttijd).slice(0, 5),
    end: wb.eindtijd ? String(wb.eindtijd).slice(0, 5) : "",
    customerId: wb.customer_id,
    description: wb.omschrijving,
  })
}

// Het oude "één item per werkbon". Alleen nog voor de terugval hierboven.
async function upsertWerkbonEvent({ werkbonId, title, date, time, end, customerId, description }) {
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
