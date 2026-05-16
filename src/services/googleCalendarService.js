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
  const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", { body: {} })
  if (error) throw error
  if (!data?.url) throw new Error("Geen Google-autorisatie-URL ontvangen")
  window.location.href = data.url
}

export async function disconnectGoogleCalendar() {
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

// Best-effort auto-sync used by activityService after a successful DB write.
// Never throws and never blocks the caller: Google being down must not stop
// the user from creating/updating activities.
export function autoSyncActivitySafe(activity) {
  try {
    if (!activity?.id || !activity?.dueAt) return // untimed → not synced
    syncActivity(activity.id, { auto: true }).catch(() => {})
  } catch { /* swallow — non-blocking */ }
}

export function autoSyncDeleteSafe(activityId, googleEventId) {
  try {
    if (!activityId || !googleEventId) return
    syncActivityDelete(activityId, googleEventId).catch(() => {})
  } catch { /* swallow — non-blocking */ }
}
