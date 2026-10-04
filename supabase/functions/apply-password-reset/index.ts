// Supabase email templates zijn leeggemaakt in het dashboard.
// BossBase gebruikt eigen Resend mails voor alle auth emails.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { pasResetToe, type ResetOpslag } from '../_shared/wachtwoordReset.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const invoer = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const tabel = () => supabase.from('password_reset_tokens')

    // De volgorde (zoeken op hash, claimen, wachtwoord zetten, opruimen) staat in
    // _shared/wachtwoordReset.ts; hier alleen de koppeling met de database.
    const opslag: ResetOpslag = {
      async zoek(tokenHash) {
        const { data } = await tabel().select('id, user_id, expires_at, used_at').eq('token_hash', tokenHash).maybeSingle()
        return data ?? null
      },
      async claim(id, nu) {
        // Eén update met "used_at is null" is atomair: van twee gelijktijdige
        // verzoeken krijgt er maar één de rij terug.
        const { data, error } = await tabel()
          .update({ used_at: nu.toISOString() })
          .eq('id', id).is('used_at', null).gt('expires_at', nu.toISOString())
          .select('id')
        if (error) throw new Error(`Token claimen mislukt: ${error.message}`)
        return (data?.length ?? 0) > 0
      },
      async geefVrij(id) {
        await tabel().update({ used_at: null }).eq('id', id)
      },
      async zetWachtwoord(userId, wachtwoord) {
        const { error } = await supabase.auth.admin.updateUserById(userId, { password: wachtwoord })
        if (error) return error.message
        // Nieuw wachtwoord = alle bestaande sessies weg: wie een gestolen sessie
        // had, kan die niet meer verversen (audit 2026-10-01, M12).
        const { error: sessieErr } = await supabase.rpc('bb_sessies_intrekken', { p_user: userId })
        if (sessieErr) console.error('[apply-password-reset] sessies intrekken mislukt:', sessieErr.message)
        return null
      },
      async ruimOp(userId, behalveId) {
        await tabel().delete().eq('user_id', userId).neq('id', behalveId)
      },
    }

    const uitkomst = await pasResetToe(invoer, opslag)
    if (uitkomst.body.code === 'OK') console.log('[apply-password-reset] Wachtwoord bijgewerkt')
    return json(uitkomst.body, uitkomst.status)
  } catch (err) {
    console.error('[apply-password-reset] Fout:', err)
    return json({ success: false, code: 'ERROR', error: 'Wachtwoord instellen mislukt. Vraag een nieuwe link aan.' }, 500)
  }
})
