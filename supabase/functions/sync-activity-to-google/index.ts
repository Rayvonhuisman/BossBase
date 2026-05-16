// ============================================================================
// sync-activity-to-google
// One-way sync of a single BossBase activity to the user's Google Calendar.
// Create / update / delete. All Google API calls happen here (server-side);
// tokens never reach the browser. Failures are recorded on the activity but
// never block the user — the caller treats this as best-effort.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

const TZ = "Europe/Amsterdam"

// Refresh the access token if it is missing or (nearly) expired.
async function ensureAccessToken(admin: any, conn: any): Promise<string | null> {
  const exp = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0
  if (conn.access_token && exp > Date.now() + 60_000) return conn.access_token
  if (!conn.refresh_token) return conn.access_token || null

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  })
  const tok = await res.json()
  if (!res.ok || !tok.access_token) {
    // Refresh token revoked / invalid → mark the connection as broken.
    await admin.from("google_calendar_connections")
      .update({ is_connected: false, updated_at: new Date().toISOString() })
      .eq("id", conn.id)
    return null
  }
  const expiry = new Date(Date.now() + Number(tok.expires_in || 3600) * 1000).toISOString()
  await admin.from("google_calendar_connections")
    .update({ access_token: tok.access_token, token_expiry: expiry, updated_at: new Date().toISOString() })
    .eq("id", conn.id)
  return tok.access_token
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("authorization") ?? ""
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return json({ error: "Niet ingelogd" }, 401)

    const { activity_id, google_event_id: bodyEventId, op = "upsert", auto = false } = await req.json()
    if (!activity_id && op !== "delete") return json({ error: "activity_id is verplicht" }, 400)

    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", user.id).single()
    if (!profile?.company_id) return json({ error: "Geen bedrijf gevonden" }, 400)

    // Auto-sync respects the company toggle; the manual "Opnieuw
    // synchroniseren" button (auto=false) always proceeds.
    if (auto) {
      const { data: settings } = await supabase
        .from("bedrijfsinstellingen")
        .select("auto_sync_google_calendar")
        .eq("company_id", profile.company_id)
        .maybeSingle()
      if (settings && settings.auto_sync_google_calendar === false) {
        return json({ skipped: "auto_disabled" })
      }
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Connection for this user (tokens read with the service role only).
    const { data: conn } = await admin
      .from("google_calendar_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!conn || !conn.is_connected) return json({ skipped: "not_connected" })

    const accessToken = await ensureAccessToken(admin, conn)
    if (!accessToken) return json({ skipped: "token_revoked" })

    const calId = encodeURIComponent(conn.google_calendar_id || "primary")
    const gcalBase = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`

    // ── Delete ────────────────────────────────────────────────────────────
    if (op === "delete") {
      const evId = bodyEventId
      if (!evId) return json({ skipped: "no_event" })
      const res = await fetch(`${gcalBase}/${encodeURIComponent(evId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      // 200/204 = deleted, 404/410 = already gone — both are success here.
      if (res.ok || res.status === 404 || res.status === 410) return json({ ok: true, op: "delete" })
      return json({ ok: false, error: `Google ${res.status}` })
    }

    // ── Create / update ───────────────────────────────────────────────────
    const { data: activity } = await admin
      .from("activities").select("*").eq("id", activity_id).single()
    if (!activity) return json({ error: "Activiteit niet gevonden" }, 404)
    if (activity.company_id !== profile.company_id) return json({ error: "Geen toegang" }, 403)

    // Untimed items (notes/tasks without a moment) are never synced.
    if (!activity.due_at) {
      await admin.from("activities")
        .update({ google_sync_status: "not_synced", google_sync_error: null })
        .eq("id", activity.id)
      return json({ skipped: "no_datetime" })
    }

    // Optional location from the linked customer (defensive: schema varies).
    let location = ""
    if (activity.customer_id) {
      const { data: cust } = await admin
        .from("customers").select("*").eq("id", activity.customer_id).maybeSingle()
      if (cust) {
        location = [cust.adres || cust.address, cust.postcode, cust.plaats || cust.city || cust.location]
          .filter(Boolean).join(", ") || cust.name || ""
      }
    }

    const start = new Date(activity.due_at)
    const end = new Date(start.getTime() + 60 * 60 * 1000) // default 1h
    const eventBody = {
      summary: activity.title || "BossBase activiteit",
      description: activity.notes || "",
      location,
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end: { dateTime: end.toISOString(), timeZone: TZ },
    }

    const existingEventId = activity.google_event_id
    const url = existingEventId ? `${gcalBase}/${encodeURIComponent(existingEventId)}` : gcalBase
    const method = existingEventId ? "PUT" : "POST"

    const gres = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    })
    const gdata = await gres.json().catch(() => ({}))

    if (!gres.ok) {
      const msg = gdata?.error?.message || `Google ${gres.status}`
      await admin.from("activities").update({
        google_sync_status: "error",
        google_sync_error: msg,
      }).eq("id", activity.id)
      return json({ ok: false, error: msg })
    }

    await admin.from("activities").update({
      google_event_id: gdata.id || existingEventId,
      google_calendar_synced_at: new Date().toISOString(),
      google_sync_status: "synced",
      google_sync_error: null,
    }).eq("id", activity.id)

    return json({ ok: true, op: existingEventId ? "update" : "create", google_event_id: gdata.id })
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500)
  }
})
