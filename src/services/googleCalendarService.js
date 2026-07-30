import { supabase } from "../lib/supabase"

// Google Calendar integration — frontend façade.
// All Google API traffic and token handling lives in Supabase Edge Functions;
// this module only invokes those functions / safe RPCs. No tokens are ever
// read or stored on the client.

// Connection status via a SECURITY DEFINER RPC that returns NO tokens.
export async function getConnectionStatus() {
  const { data, error } = await supabase.rpc("google_calendar_status")
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    connected: Boolean(row?.connected),
    email: row?.google_email || "",
    calendarId: row?.google_calendar_id || "primary",
  }
}

// Starts the OAuth flow: ask the Edge Function for a consent URL, then send
// the browser to Google. Google redirects back to /calendar?google=...
export async function startGoogleCalendarConnect() {
  // The Edge Function verifies the caller via supabase.auth.getUser(), so it
  // needs a valid *user* JWT. Without an explicit header, invoke() can fall
  // back to the anon key (no user) → 401. Send the live session token.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error("Je sessie is verlopen. Log opnieuw in.")
  }
  const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", {
    body: {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) throw error
  if (!data?.url) throw new Error("Geen Google-autorisatie-URL ontvangen")
  window.location.href = data.url
}

export async function disconnectGoogleCalendar() {
  vergeetGoogleKoppelingStatus()
  const { error } = await supabase.rpc("google_calendar_disconnect")
  if (error) throw error
  return true
}

// Sync one activity. `auto` distinguishes automatic post-save sync (honours the
// company auto-sync toggle) from the manual "Opnieuw synchroniseren" button.
export async function syncActivity(activityId, { auto = false } = {}) {
  const { data, error } = await supabase.functions.invoke("sync-activity-to-google", {
    body: { activity_id: activityId, auto },
  })
  if (error) throw error
  return data
}

export async function syncActivityDelete(activityId, googleEventId) {
  if (!googleEventId) return { skipped: "no_event" }
  const { data, error } = await supabase.functions.invoke("sync-activity-to-google", {
    body: { activity_id: activityId, google_event_id: googleEventId, op: "delete" },
  })
  if (error) throw error
  return data
}

// Is Google Agenda gekoppeld? Kort gecachet, zodat de guard hieronder geen
// extra verkeer oplevert bij elke activiteit-actie.
let koppelingCache = null // { waarde: boolean, tot: number }
const KOPPELING_TTL_MS = 60_000

async function isGoogleGekoppeld() {
  const nu = Date.now()
  if (koppelingCache && koppelingCache.tot > nu) return koppelingCache.waarde
  try {
    const { connected } = await getConnectionStatus()
    koppelingCache = { waarde: Boolean(connected), tot: nu + KOPPELING_TTL_MS }
    return koppelingCache.waarde
  } catch {
    // Status onbekend → niet syncen. Beter een gemiste sync dan een 401 bij
    // elke actie.
    koppelingCache = { waarde: false, tot: nu + KOPPELING_TTL_MS }
    return false
  }
}

/** Wist de cache — aanroepen na (ont)koppelen, zodat de guard direct meebeweegt. */
export function vergeetGoogleKoppelingStatus() { koppelingCache = null }

// Best-effort auto-sync used by activityService after a successful DB write.
// Never throws and never blocks the caller: Google being down must not stop
// the user from creating/updating activities.
//
// Eerst een koppelcheck: zonder koppeling gaf elke activiteit-actie een 401 in
// de console. Niet gekoppeld = niets te syncen, dus niet aanroepen.
export function autoSyncActivitySafe(activity) {
  try {
    if (!activity?.id || !activity?.dueAt) return // untimed → not synced
    isGoogleGekoppeld().then(gekoppeld => {
      if (gekoppeld) syncActivity(activity.id, { auto: true }).catch(() => {})
    })
  } catch { /* swallow — non-blocking */ }
}

export function autoSyncDeleteSafe(activityId, googleEventId) {
  try {
    if (!activityId || !googleEventId) return
    isGoogleGekoppeld().then(gekoppeld => {
      if (gekoppeld) syncActivityDelete(activityId, googleEventId).catch(() => {})
    })
  } catch { /* swallow — non-blocking */ }
}
