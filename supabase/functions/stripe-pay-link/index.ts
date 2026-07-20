// stripe-pay-link (verify_jwt=false — publiek, de klant is niet ingelogd)
// De permanente betaallink /betaal/<token> roept dit aan. Op basis van het
// onraadbare token bepaalt de functie server-side de juiste actie:
//   • factuur al betaald            → { state: 'paid' }
//   • openstaand + actieve koppeling → VERSE Checkout Session → { state: 'redirect', url }
//   • geen/geen actieve koppeling    → { state: 'no_stripe' }
//   • bedrag 0 / geen bedrag         → { state: 'no_stripe' }
//   • onbekend token                 → { state: 'invalid' }
// Bij elke andere respons dan 'invalid' gaat de branding mee (logo + kleur), zodat
// de pagina de huisstijl van het bedrijf toont. Geeft NOOIT verdere factuur-/
// klantgegevens terug — alleen wat nodig is om te betalen.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createFactuurCheckoutSession } from '../_shared/stripe.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const body = await req.json().catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!token) return json({ state: 'invalid' })

    const { data: factuur } = await admin
      .from('facturen')
      .select('id, nummer, totaal_incl, status, company_id')
      .eq('stripe_payment_token', token)
      .maybeSingle()
    if (!factuur) return json({ state: 'invalid' })

    // Branding (alleen naam/logo/kleur — niets gevoeligs).
    const { data: company } = await admin
      .from('companies').select('name, logo_url, branding_color').eq('id', factuur.company_id).maybeSingle()
    const branding = company
      ? { company_name: company.name, logo_url: company.logo_url, branding_color: company.branding_color }
      : null

    if (factuur.status === 'betaald') return json({ state: 'paid', branding })

    const { data: conn } = await admin
      .from('stripe_connections')
      .select('stripe_account_id, charges_enabled')
      .eq('company_id', factuur.company_id)
      .maybeSingle()
    if (!conn?.stripe_account_id || !conn.charges_enabled) return json({ state: 'no_stripe', branding })

    const cents = Math.round(Number(factuur.totaal_incl || 0) * 100)
    if (!cents || cents <= 0) return json({ state: 'no_stripe', branding })

    // Verse Checkout Session (gedeelde logica) → klant wordt hierheen doorgestuurd.
    const reqOrigin = req.headers.get('origin') || ''
    const { url } = await createFactuurCheckoutSession(admin, {
      factuur: { id: factuur.id, nummer: factuur.nummer, totaal_incl: factuur.totaal_incl },
      companyId: factuur.company_id,
      stripeAccountId: conn.stripe_account_id,
      token,
      reqOrigin,
    })
    return json({ state: 'redirect', url, branding })
  } catch (err: any) {
    console.error('[stripe-pay-link]', err?.message)
    return json({ state: 'error' })
  }
})
