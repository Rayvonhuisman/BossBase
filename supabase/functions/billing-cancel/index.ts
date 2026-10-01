// billing-cancel (verify_jwt=true)
//
// Opzeggen, met de looptijd van het jaarabonnement erin gebakken:
//   • maandabonnement          → stopt aan het einde van de lopende maand
//   • jaarabonnement, in looptijd → stopt aan het einde van de 12 maanden
//     (de schedule krijgt end_behavior 'cancel'; tussentijds stoppen kan niet)
//   • maandabonnement dat nog aan een schedule hangt → schedule vrijgeven,
//     dan stoppen aan het einde van de lopende maand
//   • jaarabonnement, uitgediend → gedraagt zich als een maandabonnement
//
// Waarom hier en niet in het Customer Portal: het portal kent maar twee smaken,
// direct of per einde van de FACTUURPERIODE — en dat is bij ons één maand. Er is
// geen instelling die "pas na 12 maanden" afdwingt. Zou je opzeggen in het portal
// toestaan, dan is de jaarverplichting met twee klikken weg. Daarom loopt
// opzeggen via ons eigen scherm en zetten we in het portal (voor jaarklanten in
// looptijd) een configuratie zonder opzegknop.
//
// Ongedaan maken kan ook: `herstel: true` zet de opzegging terug.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json, CORS, eisAbonnementsbeheerder } from '../_shared/billing.ts'
import { opzeggenBijStripe } from '../_shared/opzeggen.ts'

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

    const body = await req.json().catch(() => ({}))
    const herstel = body?.herstel === true

    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_schedule_id, verplichting_tot, current_period_end, billing_interval')
      .eq('company_id', companyId)
      .maybeSingle()

    if (!sub?.stripe_subscription_id) {
      return json({ error: 'Er is geen lopend abonnement om op te zeggen.', code: 'geen_abonnement' }, 409)
    }

    // Hoe er opgezegd wordt hangt af van het schema: zie _shared/opzeggen.ts.
    // Een abonnement onder een actief schema weigert cancel_at rechtstreeks.
    const uit = await opzeggenBijStripe({
      subscriptionId: sub.stripe_subscription_id,
      scheduleId: sub.stripe_schedule_id,
      verplichtingTot: sub.verplichting_tot,
      herstel,
    })

    // Onze tabel meteen bijwerken, zodat het scherm na het herladen de juiste
    // einddatum toont. De webhook volgt, maar die kan een paar seconden later
    // komen.
    if (uit.route === 'schema_stopt_na_looptijd' || uit.route === 'looptijd_cancel_at') {
      await admin.rpc('bb_stripe_sync_schedule', {
        p_subscription_id: sub.stripe_subscription_id,
        p_schedule_id: sub.stripe_schedule_id,
        p_verplichting_tot: (herstel ? null : uit.stoptOp) ?? sub.verplichting_tot,
        p_stopt_na: !herstel,
      })
      await admin.from('subscriptions')
        .update({ cancel_at_period_end: false })
        .eq('company_id', companyId)
    } else {
      await admin.from('subscriptions')
        .update({
          cancel_at_period_end: !herstel,
          ...(uit.stoptOp ? { current_period_end: uit.stoptOp } : {}),
        })
        .eq('company_id', companyId)
    }

    const datum = uit.stoptOp ? new Date(uit.stoptOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }) : null
    return json({
      resultaat: herstel ? 'opzegging_ingetrokken' : (uit.stoptNaLooptijd ? 'stopt_na_looptijd' : 'stopt_einde_periode'),
      route: uit.route,
      stoptOp: uit.stoptOp,
      bericht: herstel
        ? 'Je abonnement loopt gewoon door.'
        : datum
          ? `Je abonnement stopt op ${datum}. Tot die tijd loopt de incasso door.`
          : 'Je abonnement stopt aan het einde van de lopende periode.',
    })
  } catch (e) {
    return json({ error: (e as Error).message || 'Onbekende fout' }, 500)
  }
})
