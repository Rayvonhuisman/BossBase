// billing-portal (verify_jwt=true)
//
// Opent het Stripe Customer Portal: opzeggen, betaalmethode wijzigen, facturen
// inzien en van pakket wisselen. Dat bouwen we bewust niet zelf na.
//
// Alleen de eigenaar/admin — dezelfde aparte geld-gate als billing-checkout, en
// net als daar server-side afgedwongen zodat een rechtstreekse API-aanroep door
// een medewerker ook wordt geweigerd.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { stripeFetch, appOrigin, json, CORS, eisAbonnementsbeheerder, portalConfigJaar } from '../_shared/billing.ts'

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
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const auth = await eisAbonnementsbeheerder(admin, userClient)
    if (auth instanceof Response) return auth
    const { companyId } = auth

    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, verplichting_tot')
      .eq('company_id', companyId)
      .maybeSingle()

    // Zonder Stripe-customer valt er niets te beheren: dit bedrijf zit nog in de
    // gratis proefperiode uit onze eigen database.
    if (!sub?.stripe_customer_id) {
      return json({
        error: 'Er is nog geen abonnement om te beheren. Sluit eerst een abonnement af.',
        code: 'geen_stripe_klant',
      }, 409)
    }

    const origin = appOrigin(req.headers.get('origin') || '')
    const params: Record<string, string> = {
      'customer': sub.stripe_customer_id,
      'return_url': `${origin}/dashboard/instellingen?tab=abonnement`,
    }
    // Twee portalconfiguraties, want het portal kan een looptijd niet afdwingen:
    // het kent alleen "direct" of "per einde factuurperiode", en die periode is
    // bij ons één maand. Een jaarklant zou zo binnen zijn looptijd weg kunnen.
    //
    // Binnen de looptijd → de configuratie zonder opzeg- en wijzigknop, opgezocht
    // op metadata.bb_key (zie portalConfigJaar). Opzeggen loopt voor die klant via
    // billing-cancel, dat de einddatum van de looptijd aanhoudt.
    // Looptijd voorbij, of maandabonnement → de gewone configuratie.
    const inLooptijd = !!sub.verplichting_tot && new Date(sub.verplichting_tot) > new Date()
    let configId: string | null = null
    if (inLooptijd) {
      configId = await portalConfigJaar()
      if (!configId) {
        // Liever een duidelijke fout dan stilzwijgend de configuratie mét
        // opzegknop gebruiken: dan zou de klant zijn looptijd kunnen breken.
        return json({
          error: 'Abonnementsbeheer is tijdelijk niet beschikbaar. Neem contact met ons op.',
          code: 'portalconfig_jaar_ontbreekt',
        }, 503)
      }
    } else {
      configId = Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') || null
    }
    if (configId) params['configuration'] = configId

    const session = await stripeFetch('/billing_portal/sessions', 'POST', params)
    return json({ url: session.url })
  } catch (e) {
    return json({ error: (e as Error).message || 'Onbekende fout' }, 500)
  }
})
