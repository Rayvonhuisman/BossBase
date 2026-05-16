// ============================================================================
// google-calendar-callback
// OAuth redirect target. Exchanges the code for tokens and stores the
// connection using the SERVICE ROLE (bypasses RLS). Never returns tokens to
// the browser; finishes with a redirect back into the app.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const enc = new TextEncoder()
const b64urlToBytes = (s: string) => {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : ""
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), c => c.charCodeAt(0))
}

async function verifyState(state: string): Promise<{ uid: string; cid: string } | null> {
  const [payload, sig] = (state || "").split(".")
  if (!payload || !sig) return null
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(Deno.env.get("GOOGLE_STATE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )
  const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), enc.encode(payload))
  if (!ok) return null
  try {
    const { uid, cid, t } = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)))
    if (!uid || !cid) return null
    if (Date.now() - Number(t) > 10 * 60 * 1000) return null // 10 min freshness
    return { uid, cid }
  } catch {
    return null
  }
}

function redirect(status: "connected" | "error", detail = "") {
  const base = (Deno.env.get("APP_URL") || "").replace(/\/$/, "")
  const q = new URLSearchParams({ google: status })
  if (detail) q.set("google_msg", detail.slice(0, 160))
  return new Response(null, { status: 302, headers: { Location: `${base}/calendar?${q.toString()}` } })
}

serve(async (req) => {
  try {
    const u = new URL(req.url)
    const code = u.searchParams.get("code")
    const state = u.searchParams.get("state") ?? ""
    const oauthErr = u.searchParams.get("error")
    if (oauthErr) return redirect("error", oauthErr)
    if (!code) return redirect("error", "geen_code")

    const verified = await verifyState(state)
    if (!verified) return redirect("error", "ongeldige_state")

    // Exchange the authorization code for tokens.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        redirect_uri: Deno.env.get("GOOGLE_REDIRECT_URI")!,
        grant_type: "authorization_code",
      }),
    })
    const tok = await tokenRes.json()
    if (!tokenRes.ok || !tok.access_token) {
      return redirect("error", tok.error_description || "token_exchange_mislukt")
    }

    // Best-effort: read the connected Google account email.
    let email: string | null = null
    try {
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      })
      if (infoRes.ok) email = (await infoRes.json()).email ?? null
    } catch { /* non-fatal */ }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Preserve the existing refresh_token if Google didn't return a new one.
    const { data: existing } = await admin
      .from("google_calendar_connections")
      .select("refresh_token")
      .eq("user_id", verified.uid)
      .maybeSingle()

    const expiry = new Date(Date.now() + (Number(tok.expires_in || 3600) * 1000)).toISOString()
    const row = {
      company_id: verified.cid,
      user_id: verified.uid,
      google_email: email,
      google_calendar_id: "primary",
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || existing?.refresh_token || null,
      token_expiry: expiry,
      is_connected: true,
      updated_at: new Date().toISOString(),
    }

    const { error: upErr } = await admin
      .from("google_calendar_connections")
      .upsert(row, { onConflict: "user_id" })
    if (upErr) return redirect("error", "opslaan_mislukt")

    return redirect("connected", email || "")
  } catch (err) {
    return redirect("error", (err as Error).message)
  }
})
