import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Constant-time string-vergelijking, zodat het interne secret niet via
// response-timing kan lekken. Zelfde patroon als _shared/scheduledSync.ts.
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

// True wanneer de request het juiste interne secret meestuurt (backend-aanroepers
// als create-notification / stripe-webhook). Het secret staat als function-env
// SEND_EMAIL_SECRET. Ontbreekt de env → nooit als intern beschouwd (fail-safe:
// dan is enkel de ingelogde-gebruiker-modus toegestaan).
function isInternalCall(req: Request): boolean {
  const expected = Deno.env.get('SEND_EMAIL_SECRET') ?? ''
  const provided = req.headers.get('x-internal-secret') ?? ''
  return Boolean(expected) && timingSafeEqual(provided, expected)
}

// Rate-limit per ingelogde gebruiker: max. MAX_PER_HOUR mails per uurvenster.
// Gebruikt de email_send_attempts-tabel (RLS aan, alleen service_role). Geeft
// true terug wanneer de mail GEWEIGERD moet worden.
const MAX_PER_HOUR = 60
async function isRateLimited(admin: any, userId: string): Promise<boolean> {
  const nowMs = Date.now()
  const { data: attempt } = await admin
    .from('email_send_attempts')
    .select('user_id, attempt_count, window_start')
    .eq('user_id', userId)
    .maybeSingle()

  if (attempt) {
    const windowMs = new Date(attempt.window_start).getTime()
    const withinHour = nowMs - windowMs < 60 * 60 * 1000
    if (withinHour && attempt.attempt_count >= MAX_PER_HOUR) return true
    const newCount = withinHour ? attempt.attempt_count + 1 : 1
    const newWindow = withinHour ? attempt.window_start : new Date(nowMs).toISOString()
    await admin.from('email_send_attempts').update({
      last_attempt: new Date(nowMs).toISOString(),
      attempt_count: newCount,
      window_start: newWindow,
    }).eq('user_id', userId)
  } else {
    await admin.from('email_send_attempts').insert({
      user_id: userId,
      last_attempt: new Date(nowMs).toISOString(),
      attempt_count: 1,
      window_start: new Date(nowMs).toISOString(),
    })
  }
  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── Autorisatie ─────────────────────────────────────────────────────────
    // send-email is GEEN open relay: de aanroeper moet zich bewijzen als óf een
    // vertrouwde backend-functie (intern secret), óf een echte ingelogde
    // gebruiker (geldige user-JWT). De publieke anon-key alleen — waarmee
    // verify_jwt aan de gateway passeert — levert géén user op en wordt hier
    // dus geweigerd.
    const internal = isInternalCall(req)

    if (!internal) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const authHeader  = req.headers.get('Authorization') || ''
      if (!authHeader) return json({ success: false, error: 'Niet geautoriseerd' }, 401)

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: { user }, error: userErr } = await userClient.auth.getUser()
      if (userErr || !user) return json({ success: false, error: 'Ongeldige sessie' }, 401)

      const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      if (await isRateLimited(admin, user.id)) {
        return json({ success: false, error: 'Te veel e-mails verstuurd, probeer het later opnieuw' }, 429)
      }
    }

    // ── Verzenden ─────────────────────────────────────────────────────────────
    const { to, subject, html, from_name, reply_to, attachments } = await req.json()

    if (!to || !subject || !html) {
      return json({ success: false, error: 'to, subject en html zijn verplicht' }, 400)
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
    // From-naam: puur de bedrijfsnaam (geen "via BossBase"). Systeemmails geven
    // 'BossBase' mee. Het e-mailadres blijft technisch noreply@bossbase.nl.
    const label = from_name && from_name.trim() ? from_name.trim() : 'BossBase'
    const fromLabel = `${label} <${fromEmail}>`

    if (!apiKey) {
      return json({ success: false, error: 'RESEND_API_KEY niet geconfigureerd' }, 500)
    }

    const payload: Record<string, unknown> = { from: fromLabel, to, subject, html }
    // Reply-to: antwoorden van de klant gaan naar het door het bedrijf
    // ingestelde adres i.p.v. naar noreply@bossbase.nl.
    if (typeof reply_to === 'string' && reply_to.includes('@')) payload.reply_to = reply_to
    if (Array.isArray(attachments) && attachments.length > 0) payload.attachments = attachments

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      return json({ success: false, error: data.message || 'Resend fout' }, res.status)
    }

    return json({ success: true, message_id: data.id })
  } catch (err) {
    return json({ success: false, error: String(err) }, 500)
  }
})
