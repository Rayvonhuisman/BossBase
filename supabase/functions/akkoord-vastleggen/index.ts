// akkoord-vastleggen — legt vast dat een gebruiker bij het aanmaken van zijn
// account akkoord ging met de algemene voorwaarden en de verwerkersovereenkomst
// en de privacyverklaring kreeg aangeboden. Aangeroepen direct na signUp, dus
// bij het klikken op "BossBase starten".
//
// De versies (_shared/akkoord.ts), het tijdstip en het IP-adres bepaalt de
// server zelf; de body wordt niet gelezen. verify_jwt=true: wie, volgt uit de sessie.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { legAkkoordVast } from '../_shared/akkoord.ts'
import { clientFout } from '../_shared/clientFout.ts'

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

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ success: false, error: 'Niet ingelogd' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ success: false, error: 'Ongeldige sessie' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    try {
      const nieuw = await legAkkoordVast(admin, user, req, 'registratie')
      if (!nieuw) return json({ success: true, alVastgelegd: true })
    } catch (e) {
      console.error('[akkoord-vastleggen] Opslaan mislukt', { user: user.id, error: String(e) })
      return json({ success: false, error: 'Akkoord vastleggen mislukt' }, 500)
    }

    console.log('[akkoord-vastleggen] Vastgelegd', { user: user.id })
    return json({ success: true })
  } catch (err) {
    console.error('[akkoord-vastleggen] Fout:', err)
    return json({ success: false, error: clientFout(err) }, 500)
  }
})
