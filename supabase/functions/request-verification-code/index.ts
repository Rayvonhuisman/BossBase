// request-verification-code — stuurt een 6-cijferige verificatiecode naar de
// ingelogde gebruiker. Patroon van request-password-reset (rate limiting, geen
// enumeratie). verify_jwt=true: alleen de eigenaar van de sessie kan een code
// voor zijn eigen account aanvragen.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'
import { hashVerificationCode } from '../_shared/hashCode.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
    const resendKey   = Deno.env.get('RESEND_API_KEY')!
    const fromEmail   = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'

    // Bepaal de aanroeper uit de JWT (niet uit de request-body → geen spoofing).
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ success: false, error: 'Niet ingelogd' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user?.email) return json({ success: false, error: 'Ongeldige sessie' }, 401)

    const userId = user.id
    const email  = user.email.toLowerCase()
    const admin  = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Al geverifieerd? Dan geen mail nodig.
    const { data: prof } = await admin.from('profiles').select('email_verified_at').eq('id', userId).maybeSingle()
    if (prof?.email_verified_at) return json({ success: true, alreadyVerified: true })

    // ── Rate limiting: min 60s tussen mails, max 3 per 10 min per e-mail ──────
    const nowMs = Date.now()
    const WINDOW = 10 * 60 * 1000
    const { data: attempt } = await admin
      .from('email_verification_attempts')
      .select('email, last_sent, send_count, window_start')
      .eq('email', email)
      .maybeSingle()

    if (attempt) {
      const lastMs   = new Date(attempt.last_sent).getTime()
      const windowMs = new Date(attempt.window_start).getTime()
      const withinWindow = nowMs - windowMs < WINDOW
      if ((nowMs - lastMs < 60 * 1000) || (withinWindow && attempt.send_count >= 3)) {
        console.log('[request-verification-code] Throttled (geen mail):', { to: email })
        return json({ success: true }) // geen enumeratie / geen mail
      }
      await admin.from('email_verification_attempts').update({
        last_sent:    new Date(nowMs).toISOString(),
        send_count:   withinWindow ? attempt.send_count + 1 : 1,
        window_start: withinWindow ? attempt.window_start : new Date(nowMs).toISOString(),
      }).eq('email', email)
    } else {
      await admin.from('email_verification_attempts').insert({
        email, last_sent: new Date(nowMs).toISOString(), send_count: 1, window_start: new Date(nowMs).toISOString(),
      })
    }

    // ── Code genereren (6 cijfers), hashen, opslaan (10 min) ──────────────────
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = await hashVerificationCode(code, userId)
    const expiresAt = new Date(nowMs + 10 * 60 * 1000).toISOString()

    // Oude codes voor deze user wissen, dan de nieuwe code opslaan.
    await admin.from('email_verification_codes').delete().eq('user_id', userId)
    const { error: insErr } = await admin.from('email_verification_codes').insert({
      user_id: userId, email, code_hash: codeHash, expires_at: expiresAt, attempts: 0,
    })
    if (insErr) throw new Error(`Code opslaan mislukt: ${insErr.message}`)

    // ── Mail de code (groot en duidelijk, geen knop) ──────────────────────────
    const html = mailTemplate({
      title: 'Bevestig je e-mailadres',
      preheader: 'Je BossBase verificatiecode',
      body: `<p>Welkom bij BossBase! Gebruik onderstaande code om je e-mailadres te bevestigen:</p>
             <div style="margin:28px 0;text-align:center;">
               <span style="display:inline-block;font-size:38px;font-weight:800;letter-spacing:10px;color:#0D0D0D;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 24px;">${code}</span>
             </div>
             <p style="color:#6b7280;">Deze code is <strong>10 minuten</strong> geldig. Vul hem in op het verificatiescherm om door te gaan.</p>`,
      footerText: 'Heb je geen account aangemaakt? Dan kun je deze mail negeren.',
    })

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `BossBase <${fromEmail}>`,
        to: email,
        subject: 'Je BossBase verificatiecode',
        html,
      }),
    })
    const resendData = await resendRes.json()
    if (!resendRes.ok) {
      console.error('[request-verification-code] Resend fout:', resendData)
      throw new Error(resendData.message || 'Mail versturen mislukt')
    }

    console.log('[request-verification-code] Code verstuurd ✓', { to: email, message_id: resendData.id })
    return json({ success: true })
  } catch (err) {
    console.error('[request-verification-code] Fout:', err)
    return json({ success: false, error: String(err) }, 500)
  }
})
