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

// Alleen vaste codes in de URL; de app vertaalt ze naar een tekst. Geen vrije
// tekst uit Google of een foutmelding (audit F6).
const FOUTCODES = new Set(["geen_code", "ongeldige_state", "token_exchange_mislukt", "opslaan_mislukt", "geweigerd", "onbekend"])
function redirect(params: Record<string, string>) {
  const base = (Deno.env.get("APP_URL") || "").replace(/\/$/, "")
  const q = new URLSearchParams(params)
  return new Response(null, { status: 302, headers: { Location: `${base}/dashboard/calendar?${q.toString()}` } })
}
const fout = (code: string) => redirect({ google: "error", google_msg: FOUTCODES.has(code) ? code : "onbekend" })

serve(async (req) => {
  try {
    const u = new URL(req.url)
    const code = u.searchParams.get("code")
    const state = u.searchParams.get("state") ?? ""
    const oauthErr = u.searchParams.get("error")
    if (oauthErr) return fout(oauthErr === "access_denied" ? "geweigerd" : "onbekend")
    if (!code) return fout("geen_code")

    const verified = await verifyState(state)
    if (!verified) return fout("ongeldige_state")

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
      return fout("token_exchange_mislukt")
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
    // Niet direct koppelen: eerst bevestigen met de sessie van de ingelogde
    // gebruiker (google-calendar-bevestig). Zo zit de koppeling vast aan wie hem
    // in deze browser aanvroeg, niet alleen aan de state (audit B-12).
    const { data: wachtend, error: upErr } = await admin
      .from("google_koppel_wachtend")
      .insert({
        user_id: verified.uid,
        company_id: verified.cid,
        google_email: email,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token || null,
        token_expiry: new Date(Date.now() + (Number(tok.expires_in || 3600) * 1000)).toISOString(),
      })
      .select("id")
      .single()
    if (upErr || !wachtend) return fout("opslaan_mislukt")

    return redirect({ google: "bevestigen", koppel: wachtend.id })
  } catch (err) {
    console.error("[gcal-callback]", (err as Error).message)
    return fout("onbekend")
  }
})
