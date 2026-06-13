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
    const { token, newPassword } = await req.json()
    if (!token || !newPassword) return json({ success: false, error: 'token en newPassword zijn verplicht' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Zoek geldig, ongebruikt token op
    const { data: resetToken, error: tokenErr } = await supabase
      .from('password_reset_tokens')
      .select('id, user_id, email, expires_at, used_at')
      .eq('token', token)
      .is('used_at', null)
      .single()

    if (tokenErr || !resetToken) {
      return json({ success: false, error: 'Ongeldige of al gebruikte resetlink.' }, 400)
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return json({ success: false, error: 'Deze resetlink is verlopen (1 uur). Vraag een nieuwe aan.' }, 400)
    }

    // Stel nieuw wachtwoord in via admin API
    const { error: updateErr } = await supabase.auth.admin.updateUserById(resetToken.user_id, {
      password: newPassword,
    })
    if (updateErr) throw new Error(`Wachtwoord bijwerken mislukt: ${updateErr.message}`)

    // Markeer token als gebruikt
    await supabase.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', resetToken.id)

    console.log('[apply-password-reset] Wachtwoord bijgewerkt voor user:', resetToken.user_id)
    return json({ success: true })
  } catch (err) {
    console.error('[apply-password-reset] Fout:', err)
    return json({ success: false, error: String(err) }, 500)
  }
})
