// ============================================================================
// google-calendar-auth-url
// Returns a Google OAuth consent URL for the authenticated BossBase user.
// The Google client secret never leaves the server.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const enc = new TextEncoder()
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

// Sign a compact state token so the callback can trust uid/company_id without
// a Supabase session (Google redirects back without our JWT).
async function signState(uid: string, cid: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ uid, cid, t: Date.now() })))
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(Deno.env.get("GOOGLE_STATE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)))
  return `${payload}.${b64url(sig)}`
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
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Niet ingelogd" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", user.id).single()
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "Geen bedrijf gevonden" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const state = await signState(user.id, profile.company_id)
    const params = new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      redirect_uri: Deno.env.get("GOOGLE_REDIRECT_URI")!,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.events email",
      access_type: "offline",
      prompt: "consent", // force a refresh_token on re-consent
      include_granted_scopes: "true",
      state,
    })
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
