// billing-wijzig (verify_jwt=true)
//
// Wijzigt een LOPEND abonnement: ander pakket, meer of minder gebruikers,
// modules erbij of eraf. Voor wie nog geen abonnement heeft is billing-checkout
// de weg; die twee sluiten elkaar uit.
//
// WAAROM DEZE FUNCTIE BESTAAT
// Wijzigen hoorde in het Customer Portal thuis. Dat bleek een doodlopende weg:
//   • Jaarklanten krijgen binnen hun looptijd de portalconfiguratie zonder
//     wijzigknop — die staat uit omdat downgraden de 12-maandsverplichting zou
//     uithollen. Gevolg: ze konden ook niet UPgraden, terwijl dat juist meer
//     omzet is en de verplichting alleen maar verhoogt.
//   • Voor maandklanten hangt het aan "Customers can switch plans" in het
//     Stripe-dashboard. Een vinkje buiten onze code, dat uit kan staan zonder
//     dat iemand het merkt.
// Upgraden is het moment waarop we geld verdienen. Dat mag niet afhangen van een
// dashboardinstelling. Daarom doen we het hier zelf, tegen de Stripe API.
//
// Server-side gecontroleerd, in deze volgorde:
//   1. Alleen de eigenaar/admin. Aparte gate, los van het rechtensysteem.
//   2. bb_mag_wisselen(): omhoog altijd, omlaag niet binnen de jaarlooptijd en
//      niet boven de limiet van het doelpakket.
//   3. Modules alleen bij een pakket dat ze mag, met hun vereiste module erbij.
//   4. Extra gebruikers binnen het plafond van het DOELpakket.
//
// Na afloop synchroniseren we de nieuwe stand meteen naar onze database — via
// dezelfde RPC's als de webhook, dus met dezelfde bron-van-waarheid-regel. De
// klant ziet het resultaat direct in plaats van te moeten wachten tot Stripe
// zijn event stuurt.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json, CORS, eisAbonnementsbeheerder } from '../_shared/billing.ts'
import { wijzigAbonnement } from '../_shared/abonnementWijzigen.ts'

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

    // ── 1. Alleen de eigenaar/admin ──────────────────────────────────────────
    const auth = await eisAbonnementsbeheerder(admin, userClient)
    if (auth instanceof Response) return auth
    const { companyId } = auth

    const body = await req.json().catch(() => ({}))
    const doelTier: string = String(body?.tier || '').toLowerCase()
    const extra = Math.max(0, Math.trunc(Number(body?.extra_gebruikers ?? 0)))
    const gewensteModules: string[] = Array.isArray(body?.modules)
      ? [...new Set(body.modules.map((m: unknown) => String(m)))]
      : []

    return await wijzigAbonnement(admin, companyId, doelTier, extra, gewensteModules)
  } catch (e) {
    console.error('[billing-wijzig]', (e as Error)?.message)
    return json({ error: 'Wijzigen is niet gelukt. Probeer het later opnieuw.' }, 500)
  }
})
