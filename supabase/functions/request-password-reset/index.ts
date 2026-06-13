// Supabase email templates zijn leeggemaakt in het dashboard.
// BossBase gebruikt eigen Resend mails voor alle auth emails.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff">
  <div style="margin-bottom:32px">
    <span style="font-size:22px;font-weight:900;color:#1DDB62;letter-spacing:-0.5px">Boss<span style="color:#0a0a0a">Base</span></span>
  </div>

  <h2 style="font-size:22px;font-weight:800;color:#0a0a0a;margin:0 0 20px 0">Wachtwoord opnieuw instellen</h2>

  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px 0">Hallo,</p>

  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px 0">
    Je hebt een verzoek ingediend om je wachtwoord opnieuw in te stellen voor je BossBase account.
  </p>

  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 28px 0">
    Klik op onderstaande knop om een nieuw wachtwoord in te stellen:
  </p>

  <a href="${resetUrl}"
     style="display:inline-block;background:#1DDB62;color:#0a0a0a;font-weight:800;
            font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;
            letter-spacing:-0.2px">
    Stel nieuw wachtwoord in →
  </a>

  <p style="color:#6b7280;font-size:13px;margin:28px 0 8px 0">
    Deze link is <strong>1 uur geldig</strong>.
  </p>

  <p style="color:#9ca3af;font-size:12px;margin:0 0 28px 0">
    Als je dit verzoek niet hebt ingediend, kun je deze mail negeren.
  </p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px 0" />

  <p style="color:#6b7280;font-size:13px;margin:0">
    Met vriendelijke groet,<br>Het BossBase team
  </p>
</div>`

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
