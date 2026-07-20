// stripe-connect-start (verify_jwt=true)
// Start de Stripe Connect onboarding voor het bedrijf van de ingelogde gebruiker:
//   1. user uit JWT → company_id uit profiles.
//   2. HARDE tier-check server-side: alleen Groei/Team (via get_company_tier).
//   3. Maak (indien nog niet aanwezig) een Standard connected account (v1) en bewaar
//      het stripe_account_id (acct_…) in stripe_connections.
//   4. Genereer een Account Link (account_onboarding) en geef de onboarding-URL
//      terug; de frontend redirect erheen.
// De platform secret key blijft uitsluitend server-side (zie _shared/stripe.ts).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { stripeFetch, returnUrl, refreshUrl } from '../_shared/stripe.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Alleen deze tiers mogen een eigen Stripe-account koppelen.
const ALLOWED_TIERS = ['groei', 'team']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Niet ingelogd' }, 401)

    // User-context client: bepaalt de aanroeper én laat get_company_tier() met de
    // juiste auth.uid() draaien.
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

    // ── HARDE tier-check (server-side) ──────────────────────────────────────────
    const { data: tier } = await userClient.rpc('get_company_tier')
    if (!ALLOWED_TIERS.includes(String(tier || '').toLowerCase())) {
      return json({ error: 'Stripe-koppeling is beschikbaar vanaf het Groei-abonnement.' }, 403)
    }

    // ── Connected account (Standard) — hergebruik of aanmaken ───────────────────
    const { data: existing } = await admin
      .from('stripe_connections')
      .select('stripe_account_id')
      .eq('company_id', companyId)
      .maybeSingle()

    let accountId: string | null = existing?.stripe_account_id || null

    if (!accountId) {
      const { data: company } = await admin.from('companies').select('email').eq('id', companyId).maybeSingle()

      // Standard connected account via de v1-API. Bij Standard is het BEDRIJF
      // merchant of record en aansprakelijk (disputes/refunds/chargebacks) en betaalt
      // het de Stripe-kosten; Stripe verzorgt de KYC. Direct charges regelen we per
      // betaling via de Stripe-Account header, zónder application fee → BossBase
      // blijft volledig buiten de geldstroom en aansprakelijkheid.
      const params: Record<string, string> = { type: 'standard' }
      if (company?.email) params.email = company.email

      const account = await stripeFetch('/accounts', 'POST', params)
      accountId = account.id

      await admin.from('stripe_connections').upsert({
        company_id: companyId,
        stripe_account_id: accountId,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        onboarding_status: 'pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id' })
    }

    // ── Account Link (onboarding) ───────────────────────────────────────────────
    // Basis-URL = de aanroepende origin als die is toegestaan (productie-origin uit
    // de env-secret óf een localhost-dev-origin), zodat de gebruiker terugkeert naar
    // DEZELFDE omgeving als waar hij koppelde. Anders val terug op de env-URL. De
    // whitelist voorkomt een open-redirect via een willekeurige origin.
    const reqOrigin = req.headers.get('origin') || ''
    const isLocalOrigin = (o: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)
    const baseFor = (envUrl: string) => {
      if (!envUrl) return envUrl
      try {
        const env = new URL(envUrl)
        if (reqOrigin && (reqOrigin === env.origin || isLocalOrigin(reqOrigin))) {
          return reqOrigin + env.pathname
        }
      } catch { /* val terug op env-URL */ }
      return envUrl
    }
    // Open na terugkeer meteen de Integraties-tab van de instellingen
    // (…/dashboard/instellingen?tab=integraties).
    const withTab = (base: string) =>
      base ? `${base}${base.includes('?') ? '&' : '?'}tab=integraties` : base

    const link = await stripeFetch('/account_links', 'POST', {
      account: accountId!,
      return_url: withTab(baseFor(returnUrl())),
      refresh_url: withTab(baseFor(refreshUrl())),
      type: 'account_onboarding',
    })

    return json({ url: link.url })
  } catch (err: any) {
    console.error('[stripe-connect-start]', err?.message)
    return json({ error: err?.message || 'Onboarding starten mislukt' }, 500)
  }
})
