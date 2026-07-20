// stripe-connection-status (verify_jwt=true)
// Haalt het connected account op bij Stripe en schrijft charges_enabled,
// payouts_enabled, details_submitted en onboarding_status naar stripe_connections.
// Aangeroepen na terugkeer uit de onboarding en on-demand ("status vernieuwen").
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { stripeFetch } from '../_shared/stripe.ts'

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
    if (!authHeader) return json({ error: 'Niet ingelogd' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Ongeldige sessie' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    const companyId = profile?.company_id
    if (!companyId) return json({ error: 'Geen bedrijf gekoppeld' }, 400)

    const { data: conn } = await admin
      .from('stripe_connections')
      .select('stripe_account_id')
      .eq('company_id', companyId)
      .maybeSingle()

    if (!conn?.stripe_account_id) return json({ connected: false })

    // v1-read blijft bewust: een via Accounts v2 aangemaakt account is
    // interoperabel en geeft op GET /v1/accounts/{id} nog steeds een v1-Account
    // terug met charges_enabled / payouts_enabled / details_submitted.
    const account = await stripeFetch(`/accounts/${conn.stripe_account_id}`, 'GET')
    const charges  = !!account.charges_enabled
    const payouts  = !!account.payouts_enabled
    const details  = !!account.details_submitted
    // active = geld ontvangen kan; in_review = gegevens ingediend maar nog niet
    // vrijgegeven; pending = onboarding nog niet afgerond.
    const onboarding_status = charges ? 'active' : (details ? 'in_review' : 'pending')

    await admin.from('stripe_connections').update({
      charges_enabled: charges,
      payouts_enabled: payouts,
      details_submitted: details,
      onboarding_status,
      updated_at: new Date().toISOString(),
    }).eq('company_id', companyId)

    return json({
      connected: true,
      charges_enabled: charges,
      payouts_enabled: payouts,
      details_submitted: details,
      onboarding_status,
    })
  } catch (err: any) {
    console.error('[stripe-connection-status]', err?.message)
    return json({ error: err?.message || 'Status ophalen mislukt' }, 500)
  }
})
