// trial-mails-afmelden (verify_jwt=false) — meldt een bedrijf af voor de
// proefperiodemails. Aangeroepen door de pagina /afmelden (na een klik) en door
// mailprogramma's via List-Unsubscribe-Post (RFC 8058). Alleen POST: een GET van
// een linkscanner mag niemand afmelden.
//
// Bewijs van wie: de HMAC-handtekening in de link (zie _shared/afmelden.ts).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { kloptAfmeldHandtekening } from '../_shared/afmelden.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ success: false, error: 'Alleen POST' }, 405)

  try {
    // Uit de query (List-Unsubscribe) of uit een JSON-body (de pagina).
    const url = new URL(req.url)
    let c = url.searchParams.get('c') || ''
    let s = url.searchParams.get('s') || ''
    if (!c || !s) {
      const body = await req.json().catch(() => ({}))
      c = String(body?.c || '')
      s = String(body?.s || '')
    }
    if (!UUID.test(c) || !(await kloptAfmeldHandtekening(c, s))) {
      return json({ success: false, error: 'Deze afmeldlink klopt niet.' }, 400)
    }

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: bedrijf } = await db.from('companies')
      .select('id, trial_mails_afgemeld_op').eq('id', c).maybeSingle()
    if (!bedrijf) return json({ success: false, error: 'Deze afmeldlink klopt niet.' }, 400)

    if (!bedrijf.trial_mails_afgemeld_op) {
      const { error } = await db.from('companies')
        .update({ trial_mails_uitgesloten: true, trial_mails_afgemeld_op: new Date().toISOString() })
        .eq('id', c)
      if (error) throw new Error(error.message)
      console.log('[trial-mails-afmelden] Afgemeld', { company: c })
    }
    return json({ success: true })
  } catch (err) {
    console.error('[trial-mails-afmelden] Fout:', err)
    return json({ success: false, error: 'Afmelden is niet gelukt. Mail ons op info@bossbase.nl.' }, 500)
  }
})
