// google-calendar-bevestig (verify_jwt=true)
//
// Tweede stap van de Google Agenda-koppeling. De callback heeft de tokens in
// google_koppel_wachtend gezet en de browser met een eenmalige verwijzing naar
// de app gestuurd. Hier bevestigt de ingelogde gebruiker: alleen als hij dezelfde
// is als in de OAuth-state, en binnen 10 minuten, wordt de koppeling gemaakt.
// Daarmee zit de koppeling vast aan de sessie die hem aanvroeg (audit B-12:
// zonder deze stap kon een vreemde callback-link een koppeling maken).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { inactiefReden } from '../_shared/actieveGebruiker.ts'

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GELDIG_MS = 10 * 60 * 1000

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: "Niet ingelogd" }, 401)
    const inactief = await inactiefReden(user.id)
    if (inactief) return json({ error: inactief }, 403)

    const { koppel } = await req.json().catch(() => ({}))
    if (!koppel || !UUID.test(String(koppel))) return json({ error: "Koppeling niet gevonden" }, 404)

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    // Verlopen wachtende koppelingen opruimen (bevatten tokens; niet laten liggen).
    await admin.from("google_koppel_wachtend").delete().lt("aangemaakt_op", new Date(Date.now() - GELDIG_MS).toISOString())
    const { data: w } = await admin.from("google_koppel_wachtend").select("*").eq("id", koppel).maybeSingle()
    // Eén antwoord voor "bestaat niet", "verlopen" en "niet van jou".
    if (!w || w.user_id !== user.id || Date.now() - new Date(w.aangemaakt_op).getTime() > GELDIG_MS) {
      return json({ error: "Koppeling niet gevonden of verlopen. Probeer opnieuw te koppelen." }, 404)
    }

    const { data: bestaand } = await admin
      .from("google_calendar_connections").select("refresh_token").eq("user_id", user.id).maybeSingle()
    const { error } = await admin.from("google_calendar_connections").upsert({
      company_id: w.company_id,
      user_id: w.user_id,
      google_email: w.google_email,
      google_calendar_id: "primary",
      access_token: w.access_token,
      refresh_token: w.refresh_token || bestaand?.refresh_token || null,
      token_expiry: w.token_expiry,
      is_connected: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    // Eenmalig: altijd weg, ook bij een fout.
    await admin.from("google_koppel_wachtend").delete().eq("id", w.id)
    if (error) {
      console.error("[gcal-bevestig] opslaan", error.message)
      return json({ error: "Koppeling opslaan mislukt" }, 500)
    }
    return json({ success: true, email: w.google_email })
  } catch (e) {
    console.error("[gcal-bevestig]", (e as Error).message)
    return json({ error: "Koppelen mislukt" }, 500)
  }
})
