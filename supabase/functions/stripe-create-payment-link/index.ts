// stripe-create-payment-link (verify_jwt=true)
// Levert de PERMANENTE betaallink voor in de factuurmail: https://<app>/betaal/<token>.
// De link maakt zelf geen (tijdelijke) Checkout Session meer — dat doet de
// tussenpagina (stripe-pay-link) bij elke klik. Deze functie bepaalt alleen of er
// een betaalknop mag komen (feature + actieve koppeling + bedrag) en zorgt voor het
// onraadbare betaaltoken op de factuur.
//
// Contract (de mail-verzending mag NOOIT klappen door Stripe):
//   • { url }                       → link naar de betaalpagina → knop in de mail.
//   • { url: null, reason: '...' }  → geen link (geen/geen actieve koppeling,
//                                     bedrag 0/onbekend) → mail zonder knop.
//   • 403                           → feature niet in abonnement → mail zonder knop.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appOrigin } from '../_shared/stripe.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Feature uit de centrale matrix (src/lib/features.js → plan_features).
const VEREISTE_FEATURE = 'stripe_betaallink'

function genToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') // 48 hex tekens
}

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

    // ── HARDE feature-check (server-side, centrale matrix) ──────────────────────
    const { data: heeftFeature } = await userClient.rpc('bb_has_feature', { p_feature: VEREISTE_FEATURE })
    if (heeftFeature !== true) {
      return json({ url: null, reason: 'feature_niet_in_abonnement' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const factuurId = body?.factuur_id
    if (!factuurId) return json({ error: 'factuur_id ontbreekt' }, 400)

    // ── Koppeling actief? Zo niet: geen link, maar mail mag door ────────────────
    const { data: conn } = await admin
      .from('stripe_connections')
      .select('stripe_account_id, charges_enabled')
      .eq('company_id', companyId)
      .maybeSingle()
    if (!conn?.stripe_account_id || !conn.charges_enabled) {
      return json({ url: null, reason: 'stripe_not_active' })
    }

    // ── Factuur ophalen (server-side gezaghebbend bedrag + bestaand token) ──────
    const { data: factuur } = await admin
      .from('facturen')
      .select('id, totaal_incl, stripe_payment_token')
      .eq('id', factuurId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!factuur) return json({ error: 'Factuur niet gevonden' }, 404)

    const bedragCenten = Math.round(Number(factuur.totaal_incl || 0) * 100)
    if (!bedragCenten || bedragCenten <= 0) {
      return json({ url: null, reason: 'geen_bedrag' })
    }

    // ── Onraadbaar betaaltoken zorgen (één keer aanmaken, daarna hergebruiken) ──
    let token: string = factuur.stripe_payment_token
    if (!token) {
      token = genToken()
      await admin.from('facturen').update({ stripe_payment_token: token }).eq('id', factuur.id)
    }

    // Permanente betaallink: verwijst naar onze eigen tussenpagina, niet naar een
    // (tijdelijke) Stripe-sessie. Op dezelfde omgeving als de afzender.
    const reqOrigin = req.headers.get('origin') || ''
    return json({ url: `${appOrigin(reqOrigin)}/betaal/${token}` })
  } catch (err: any) {
    console.error('[stripe-create-payment-link]', err?.message)
    return json({ error: err?.message || 'Betaallink aanmaken mislukt' }, 500)
  }
})
