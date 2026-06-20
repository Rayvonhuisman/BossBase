// create-notification — maakt in-app notificaties aan voor collega's met de
// service-role, na validatie dat de aanroeper en de doelgebruiker(s) in
// HETZELFDE bedrijf zitten. Hierdoor kan de RLS INSERT-policy op notifications
// streng zijn (alleen self-insert vanaf de client) en is collega-spoofing
// uitgesloten. verify_jwt=true zorgt dat alleen ingelogde gebruikers aanroepen.
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ success: false, error: 'Niet ingelogd' }, 401)

    // Bepaal de aanroeper uit de JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ success: false, error: 'Ongeldige sessie' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Bedrijf van de aanroeper
    const { data: me } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    const companyId = me?.company_id
    if (!companyId) return json({ success: false, error: 'Geen bedrijf gekoppeld' }, 400)

    const payload = await req.json().catch(() => ({}))
    const list = Array.isArray(payload?.notifications) ? payload.notifications : []
    if (!list.length) return json({ success: true, inserted: 0 })

    // Valideer per notificatie dat de doelgebruiker in hetzelfde bedrijf zit
    const rows: Record<string, unknown>[] = []
    for (const n of list.slice(0, 50)) {
      if (!n?.user_id || !n?.type || !n?.title) continue
      if (n.user_id === user.id) continue // self-notificatie niet nodig
      const { data: target } = await admin
        .from('profiles')
        .select('id')
        .eq('id', n.user_id)
        .eq('company_id', companyId)
        .maybeSingle()
      if (!target) continue // cross-company / onbekend → overslaan
      rows.push({
        company_id:   companyId,
        user_id:      n.user_id,
        type:         String(n.type),
        title:        String(n.title),
        body:         n.body ?? null,
        link:         n.link ?? null,
        related_type: n.related_type ?? null,
        related_id:   n.related_id ?? null,
        created_by:   user.id,
      })
    }

    if (rows.length) {
      const { error: insErr } = await admin.from('notifications').insert(rows)
      if (insErr) return json({ success: false, error: insErr.message }, 500)
    }

    return json({ success: true, inserted: rows.length })
  } catch (err) {
    return json({ success: false, error: String(err) }, 500)
  }
})
