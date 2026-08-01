// billing-cancel (verify_jwt=true)
//
// Opzeggen, met de looptijd van het jaarabonnement erin gebakken:
//   • maandabonnement          → stopt aan het einde van de lopende maand
//   • jaarabonnement, in looptijd → stopt aan het einde van de 12 maanden
//     (de schedule krijgt end_behavior 'cancel'; tussentijds stoppen kan niet)
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
import {
  stripeFetch, json, CORS, eisAbonnementsbeheerder,
  SCHEDULE_DOORLOPEN, SCHEDULE_STOPPEN, naarISO,
} from '../_shared/billing.ts'

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

    const inLooptijd = !!sub.verplichting_tot && new Date(sub.verplichting_tot) > new Date()

    // ── Jaarabonnement binnen de looptijd ──────────────────────────────────────
    // Niet tussentijds beëindigen, maar de schedule laten stoppen aan het einde
    // van de 12 termijnen. De maandelijkse incasso loopt tot dat moment gewoon door.
    if (inLooptijd) {
      // Handhaven via cancel_at op het ABONNEMENT, niet via de schedule.
      // Reden: zodra iemand in het Customer Portal op opzeggen klikt, zet Stripe
      // de schedule op `released` — die is dan niet meer bij te werken. cancel_at
      // overleeft dat wel en zet de einddatum onafhankelijk van de schedule.
      const eindeUnix = Math.floor(new Date(sub.verplichting_tot).getTime() / 1000)
      // Stripe accepteert cancel_at en cancel_at_period_end niet samen. Bij
      // herstellen leegt een lege cancel_at beide; die ene parameter volstaat.
      await stripeFetch(`/subscriptions/${sub.stripe_subscription_id}`, 'POST',
        { 'cancel_at': herstel ? '' : String(eindeUnix) })

      // Loopt de schedule nog, dan zetten we die in dezelfde richting. Is hij al
      // released, dan is dat geen probleem — cancel_at doet het werk.
      if (sub.stripe_schedule_id) {
        try {
          await stripeFetch(`/subscription_schedules/${sub.stripe_schedule_id}`, 'POST', {
            end_behavior: herstel ? SCHEDULE_DOORLOPEN : SCHEDULE_STOPPEN,
          })
        } catch (e) {
          if (!/released|completed|canceled/i.test((e as Error).message)) throw e
        }
      }

      await admin.rpc('bb_stripe_sync_schedule', {
        p_subscription_id: sub.stripe_subscription_id,
        p_schedule_id: sub.stripe_schedule_id,
        p_verplichting_tot: sub.verplichting_tot,
        p_stopt_na: !herstel,
      })
      await admin.from('subscriptions')
        .update({ cancel_at_period_end: false })
        .eq('company_id', companyId)

      return json({
        resultaat: herstel ? 'opzegging_ingetrokken' : 'stopt_na_looptijd',
        stoptOp: sub.verplichting_tot,
        bericht: herstel
          ? 'Je abonnement loopt na de looptijd gewoon door.'
          : `Je abonnement stopt op ${new Date(sub.verplichting_tot).toLocaleDateString('nl-NL')}. Tot die tijd loopt de incasso door.`,
      })
    }

    // ── Maandabonnement (of jaarabonnement dat is uitgediend) ─────────────────
    const bijgewerkt = await stripeFetch(`/subscriptions/${sub.stripe_subscription_id}`, 'POST', {
      cancel_at_period_end: herstel ? 'false' : 'true',
    })
    return json({
      resultaat: herstel ? 'opzegging_ingetrokken' : 'stopt_einde_periode',
      stoptOp: naarISO(bijgewerkt?.cancel_at) ?? sub.current_period_end,
      bericht: herstel
        ? 'Je abonnement loopt gewoon door.'
        : 'Je abonnement stopt aan het einde van de lopende maand.',
    })
  } catch (e) {
    return json({ error: (e as Error).message || 'Onbekende fout' }, 500)
  }
})
