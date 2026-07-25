import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient } from "../_shared/scheduledSync.ts"
import { ssFetch } from "../_shared/snelstart.ts"

// Verbindingstest voor de SnelStart-koppeling. Test de opgegeven koppelsleutel
// (body.client_key, vóór het opslaan) of anders de opgeslagen sleutel van het
// bedrijf. Check = GET /v2/relaties?$top=1 (scope relaties:read) — het lichtste
// endpoint dat auth + subscription key + scope in één keer bewijst.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  console.log('Function started: snelstart-test')
  const supabase = makeAdminClient()

  try {
    const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)

    const body = await req.json().catch(() => ({}))
    let clientKey: string = typeof body.client_key === 'string' ? body.client_key.trim() : ''

    if (!clientKey) {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)
      const { data: conn } = await supabase
        .from('accounting_connections')
        .select('client_key')
        .eq('company_id', profile.company_id)
        .eq('provider', 'snelstart')
        .maybeSingle()
      clientKey = conn?.client_key ?? ''
    }
    if (!clientKey) return json({ success: false, error: 'Geen koppelsleutel opgegeven of opgeslagen' }, 400)

    const relaties = await ssFetch(clientKey, '/relaties?$top=1')

    return json({
      success: true,
      message: 'Verbinding met SnelStart geslaagd',
      relaties_bereikbaar: Array.isArray(relaties),
    })
  } catch (err: any) {
    console.error('Error:', err.message)
    return json({ success: false, error: err.message }, 500)
  }
})
