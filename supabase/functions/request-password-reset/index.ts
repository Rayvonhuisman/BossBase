// Supabase email templates zijn leeggemaakt in het dashboard.
// BossBase gebruikt eigen Resend mails voor alle auth emails.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { email } = await req.json()
    if (!email) return json({ success: false, error: 'email is verplicht' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey   = Deno.env.get('RESEND_API_KEY')!
    const fromEmail   = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
    const siteUrl     = Deno.env.get('SITE_URL') || 'https://www.bossbase.nl'

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Zoek user_id op via SECURITY DEFINER helper (bypast RLS op auth.users)
    const { data: userId } = await supabase.rpc('get_auth_user_id_by_email', { p_email: email.toLowerCase() })

    // Altijd success — geen user-existence leak
    if (!userId) return json({ success: true })

    // ── Rate limiting (mail-spam tegengaan) ──────────────────────────────────
    // Throttle per e-mailadres: min. 60s tussen mails én max. 3 per uur.
    // Bij overschrijding altijd success:true teruggeven (geen enumeratie) maar
    // GEEN mail versturen. De attempts-tabel heeft RLS aan zonder policies, dus
    // alleen deze service-role-client kan erin lezen/schrijven.
    const normEmail = email.toLowerCase()
    const nowMs = Date.now()
    const { data: attempt } = await supabase
      .from('password_reset_attempts')
      .select('email, last_attempt, attempt_count, window_start')
      .eq('email', normEmail)
      .maybeSingle()

    if (attempt) {
      const lastMs = new Date(attempt.last_attempt).getTime()
      const windowMs = new Date(attempt.window_start).getTime()
      const withinHour = nowMs - windowMs < 60 * 60 * 1000
      // Te snel achter elkaar (< 60s) of meer dan 3 binnen het uurvenster?
      if ((nowMs - lastMs < 60 * 1000) || (withinHour && attempt.attempt_count >= 3)) {
        console.log('[request-password-reset] Throttled (geen mail):', { to: normEmail })
        return json({ success: true })
      }
      // Reset het uurvenster als het verlopen is.
      const newCount = withinHour ? attempt.attempt_count + 1 : 1
      const newWindow = withinHour ? attempt.window_start : new Date(nowMs).toISOString()
      await supabase.from('password_reset_attempts').update({
        last_attempt: new Date(nowMs).toISOString(),
        attempt_count: newCount,
        window_start: newWindow,
      }).eq('email', normEmail)
    } else {
      await supabase.from('password_reset_attempts').insert({
        email: normEmail,
        last_attempt: new Date(nowMs).toISOString(),
        attempt_count: 1,
        window_start: new Date(nowMs).toISOString(),
      })
    }

    // Genereer token, 1 uur geldig
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { error: insertErr } = await supabase.from('password_reset_tokens').insert({
      user_id: userId,
      email: email.toLowerCase(),
      token,
      expires_at: expiresAt,
    })
    if (insertErr) throw new Error(`Token opslaan mislukt: ${insertErr.message}`)

    // Mail via Resend
    const resetUrl = `${siteUrl}/reset-password?token=${token}`
    const html = mailTemplate({
      title: 'Wachtwoord opnieuw instellen',
      preheader: 'Stel je BossBase wachtwoord opnieuw in',
      body: `<p>Je hebt een verzoek ingediend om je wachtwoord opnieuw in te stellen voor je BossBase account.</p>
             <p>Klik op onderstaande knop om een nieuw wachtwoord in te stellen:</p>`,
      buttonText: 'Stel nieuw wachtwoord in',
      buttonUrl: resetUrl,
      footerText: 'Deze link is <strong>1 uur geldig</strong>. Als je dit verzoek niet hebt ingediend, kun je deze mail negeren.',
    })

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `BossBase <${fromEmail}>`,
        to: email,
        subject: 'Wachtwoord opnieuw instellen - BossBase',
        html,
      }),
    })

    const resendData = await resendRes.json()
    if (!resendRes.ok) {
      console.error('[request-password-reset] Resend fout:', resendData)
      throw new Error(resendData.message || 'Mail versturen mislukt')
    }

    console.log('[request-password-reset] Mail verstuurd ✓', { to: email, message_id: resendData.id, resetUrl })
    return json({ success: true })
  } catch (err) {
    console.error('[request-password-reset] Fout:', err)
    return json({ success: false, error: String(err) }, 500)
  }
})
