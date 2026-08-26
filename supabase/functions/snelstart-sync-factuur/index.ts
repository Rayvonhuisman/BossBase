import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, isScheduledCall } from "../_shared/scheduledSync.ts"
import { pushVerkoopboeking, pushFactuurPdf, getGrootboekVoorkeuren } from "../_shared/snelstart.ts"

// Pusht ÉÉN BossBase-factuur als verkoopboeking naar SnelStart (zie
// pushVerkoopboeking in _shared/snelstart.ts voor het boekingsmodel).
// Aangeroepen bij betaald-markering (factuurService), vanuit de Stripe-webhook
// (service-modus via cron_secret) en handmatig. Betaalregistratie bestaat niet
// op dit endpoint (afletteren gebeurt in SnelStart via het bankboek).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = makeAdminClient()
  const body = await req.json().catch(() => ({}))
  const factuurId = body?.factuur_id
  if (!factuurId) return json({ error: 'factuur_id is verplicht' }, 400)

  try {
    // company_id bepalen: service-modus (stripe-webhook/cron, cron_secret) → uit
    // de factuur; anders user-modus met ownership-scoping. Zelfde patroon als
    // moneybird-sync-factuur.
    let companyId: string | null = null
    if (isScheduledCall(body)) {
      const { data: f } = await admin.from('facturen').select('company_id').eq('id', factuurId).maybeSingle()
      companyId = f?.company_id ?? null
    } else {
      const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
      const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
      if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)
      const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
      companyId = profile?.company_id ?? null
    }
    if (!companyId) return json({ error: 'Geen bedrijf gevonden' }, 400)

    const { data: conn } = await admin
      .from('accounting_connections')
      .select('client_key, sync_paid_only')
      .eq('company_id', companyId)
      .eq('provider', 'snelstart')
      .maybeSingle()
    if (!conn?.client_key) return json({ error: 'SnelStart niet geconfigureerd' }, 400)

    const { data: factuur } = await admin
      .from('facturen')
      .select('*, customers(name, email, address, city, phone, snelstart_id)')
      .eq('id', factuurId)
      .eq('company_id', companyId)
      .single()
    if (!factuur) return json({ error: 'Factuur niet gevonden' }, 404)

    // Instelling "alleen betaalde facturen synchroniseren"
    if (conn.sync_paid_only && factuur.status !== 'betaald') {
      return json({ success: true, skipped: 'alleen betaalde facturen worden gesynchroniseerd' })
    }

    const { data: regels } = await admin
      .from('factuur_regels').select('*').eq('factuur_id', factuurId).order('volgorde', { ascending: true })

    const meldingen: string[] = []
    const voorkeuren = await getGrootboekVoorkeuren(admin, companyId)
    const result = await pushVerkoopboeking(
      admin, conn.client_key, companyId, factuur, regels || [], undefined, undefined, meldingen, voorkeuren)

    // Factuur-PDF erbij. Los van de boeking: een ontbrekend of te groot bestand
    // mag een geslaagde boeking niet ongedaan maken. Lukt het niet, dan blijft
    // snelstart_bijlage_gesynct op false en pikt de periodieke sync hem op.
    let bijlage: { gelukt: boolean; reden?: string } = { gelukt: false, reden: 'geen boeking' }
    if (result.snelstart_id && !factuur.snelstart_bijlage_gesynct) {
      bijlage = await pushFactuurPdf(admin, conn.client_key, companyId, factuur, result.snelstart_id)
    }

    await admin.from('accounting_connections')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', companyId).eq('provider', 'snelstart')

    return json({ success: true, ...result, bijlage, meldingen })
  } catch (err: any) {
    console.error('Error:', err?.message, err?.stack)
    return json({ success: false, error: err?.message }, 500)
  }
})
