// billing-checkout (verify_jwt=true)
//
// Maakt een Stripe Checkout Session voor een BossBase-abonnement: afsluiten,
// wisselen van pakket, extra gebruikers of modules bijkopen.
//
// Dit draait op ONS platform-account (geen Stripe-Account header) — niet te
// verwarren met stripe-create-payment-link, dat op het connected account van het
// bedrijf werkt.
//
// Server-side gecontroleerd, in deze volgorde:
//   1. Alleen de eigenaar/admin van het bedrijf. Aparte gate, los van het
//      rechtensysteem: dit gaat over geld, niet over werk.
//   2. Downgraden mag niet als het bedrijf boven de limiet van het doelpakket
//      zit. De UI toont dat vooraf, maar de weigering hoort hier te staan.
//   3. Modules alleen bij een pakket dat ze mag bijkopen, en met hun vereiste
//      module erbij (voertuigen kan niet zonder planning).
//   4. De welkomstactie hoort uitsluitend bij een JAARabonnement, mag maar één
//      keer gekozen worden, en de gratis website niet bij Starter.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  stripeFetch, appOrigin, json, CORS, eisAbonnementsbeheerder, stripeKlantVoorBedrijf, checkoutInstellingen,
  tierPriceId, modulePriceId, extraUserPriceId,
  MODULE_BESCHIKBAAR, MODULE_VEREIST, inbegrepenGebruikers, benodigdeGebruikers, teWeinigGebruikers,
  WELKOMSTACTIES, heeftWelkomstkorting, welkomCouponId, isJaar,
} from '../_shared/billing.ts'

const TIERS = ['starter', 'groei', 'team']

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

    // ── 1. Alleen de eigenaar/admin ────────────────────────────────────────────
    const auth = await eisAbonnementsbeheerder(admin, userClient)
    if (auth instanceof Response) return auth
    const { companyId } = auth

    const body = await req.json().catch(() => ({}))
    const tier: string = String(body?.tier || '').toLowerCase()
    const interval: string = String(body?.interval || 'maand').toLowerCase()
    const extra = Math.max(0, Math.trunc(Number(body?.extra_gebruikers ?? 0)))
    const modules: string[] = Array.isArray(body?.modules)
      ? [...new Set(body.modules.map((m: unknown) => String(m)))]
      : []
    const welkomstactie: string | null = body?.welkomstactie ? String(body.welkomstactie) : null

    if (!TIERS.includes(tier)) return json({ error: 'Onbekend pakket' }, 400)
    if (!['maand', 'jaar'].includes(interval)) return json({ error: 'Onbekende betaaltermijn' }, 400)

    // ── Minstens zoveel plekken als er gebruikers zijn ─────────────────────────
    const weigering = teWeinigGebruikers(tier, extra, await benodigdeGebruikers(admin, companyId))
    if (weigering) return weigering

    // ── Welkomstactie valideren ────────────────────────────────────────────────
    if (welkomstactie) {
      const actie = WELKOMSTACTIES[welkomstactie]
      if (!actie) return json({ error: 'Onbekende welkomstactie' }, 400)
      if (!isJaar(interval)) {
        return json({
          error: 'Een welkomstactie hoort bij een jaarabonnement.',
          code: 'actie_alleen_bij_jaar',
        }, 400)
      }
      if (!actie.tiers.includes(tier)) {
        return json({
          error: `Deze welkomstactie is niet beschikbaar bij ${tier}.`,
          code: 'actie_niet_bij_pakket',
        }, 400)
      }
    }

    // ── 2. Downgrade-gate ──────────────────────────────────────────────────────
    // Boven de limiet van het doelpakket mag je er niet heen. De klant moet
    // eerst opruimen; we vertellen precies wát.
    const { data: blokkades, error: blokErr } = await admin
      .rpc('bb_downgrade_blokkades', { p_company_id: companyId, p_doel_tier: tier })
    if (blokErr) { console.error('[billing-checkout] limietcontrole', blokErr.message); return json({ error: 'Limietcontrole mislukt. Probeer het later opnieuw.' }, 500) }

    if (Array.isArray(blokkades) && blokkades.length > 0) {
      return json({
        error: 'Je zit boven de limiet van dit pakket.',
        code: 'downgrade_geblokkeerd',
        blokkades: blokkades.map((b: any) => ({
          limiet: b.limiet, label: b.label,
          gebruikt: b.gebruikt, maximum: b.maximum, teveel: b.teveel,
        })),
      }, 409)
    }

    // ── 3. Modules valideren ───────────────────────────────────────────────────
    for (const key of modules) {
      const toegestaan = MODULE_BESCHIKBAAR[key]
      if (!toegestaan) return json({ error: `Onbekende module: ${key}` }, 400)
      if (!toegestaan.includes(tier)) {
        return json({ error: `De module "${key}" is niet beschikbaar bij dit pakket.`, code: 'module_niet_beschikbaar' }, 400)
      }
      const vereist = MODULE_VEREIST[key]
      if (vereist && !modules.includes(vereist)) {
        return json({ error: `De module "${key}" werkt alleen samen met "${vereist}".`, code: 'module_vereist' }, 400)
      }
    }

    // Extra gebruikers mogen het maximum van het DOELpakket niet overschrijden.
    // Bewust de harde matrixwaarde, niet bb_limit(): die geeft tijdens een
    // proefperiode "onbeperkt" terug, en juist bij het afsluiten van een
    // abonnement moet je tegen de echte limiet aanlopen.
    const { data: hardeLimiet } = await admin
      .from('plan_limits').select('limit_value')
      .eq('plan', tier).eq('limit_key', 'gebruikers').maybeSingle()
    const plafond = hardeLimiet?.limit_value ?? null
    if (plafond !== null && inbegrepenGebruikers(tier) + extra > plafond) {
      return json({
        error: `Dit pakket gaat tot ${plafond} gebruikers.`,
        code: 'te_veel_gebruikers',
        maximum: plafond,
      }, 400)
    }

    // ── 4. Stripe-customer hergebruiken of aanmaken ────────────────────────────
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, stripe_status, welkomstactie')
      .eq('company_id', companyId)
      .maybeSingle()

    // Eén welkomstactie per bedrijf, ooit. Zonder deze controle neemt iemand
    // eerst de twee gratis maanden en claimt daarna alsnog de website. De
    // database grendelt het ook (trigger op subscriptions); dit geeft er alleen
    // een nette melding bij in plaats van een databasefout.
    if (welkomstactie && sub?.welkomstactie && sub.welkomstactie !== welkomstactie) {
      return json({
        error: 'Je hebt al een welkomstactie gekozen. Die kan niet meer worden gewisseld.',
        code: 'welkomstactie_vast',
        gekozen: sub.welkomstactie,
      }, 409)
    }

    const customerId = await stripeKlantVoorBedrijf(admin, companyId)

    // ── 5. Loopt er al een abonnement? Dan is dit een wijziging ────────────────
    // Een tweede Checkout zou een tweede abonnement naast het bestaande maken.
    // Wijzigen loopt via billing-wijzig, dat de items van het lopende abonnement
    // bijwerkt. NIET via het Customer Portal: dat kan van pakket wisselen niet
    // voor jaarklanten binnen hun looptijd, en het kent geen van onze regels
    // (downgradegrendel, looptijd, looptijdreset).
    //
    // De code heet nog `gebruik_portal` omdat oudere cliëntversies daarop
    // reageren; de melding wijst naar de juiste plek.
    // Een definitief geannuleerd abonnement telt niet: dan sluit de klant een
    // nieuw abonnement af, op dezelfde Stripe-klant.
    if (sub?.stripe_subscription_id && sub?.stripe_status !== 'canceled') {
      return json({
        error: 'Je hebt al een lopend abonnement. Gebruik "Abonnement wijzigen" in plaats van opnieuw afsluiten.',
        code: 'gebruik_portal',
      }, 409)
    }

    // ── 6. Checkout Session ────────────────────────────────────────────────────
    const origin = appOrigin(req.headers.get('origin') || '')
    // Vaste instellingen (klant, btw, adres, betaalmethodes): _shared/billing.ts,
    // gedeeld met de websitebetalingen.
    const params: Record<string, string> = {
      ...checkoutInstellingen(customerId, 'subscription'),
      // Let op het /dashboard-voorvoegsel: de instellingenpagina leeft binnen de
      // app-shell (/dashboard/<pagina>). Zonder dat voorvoegsel landt de klant na
      // het betalen op de marketingsite in plaats van bij zijn abonnement.
      'success_url': `${origin}/dashboard/instellingen?tab=abonnement&checkout=gelukt&session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${origin}/dashboard/instellingen?tab=abonnement&checkout=geannuleerd`,
      // Metadata op de SESSIE (voor checkout.session.completed) én op de
      // subscription zelf (voor alle latere customer.subscription.* events).
      'metadata[company_id]': companyId,
      'subscription_data[metadata][company_id]': companyId,
      'subscription_data[metadata][billing_interval]': interval,
    }
    // De keuze reist mee als metadata; de webhook legt hem daarna vast en zet zo
    // nodig de website-aanvraag klaar.
    if (welkomstactie) params['subscription_data[metadata][welkomstactie]'] = welkomstactie

    let i = 0
    params[`line_items[${i}][price]`] = tierPriceId(tier)
    params[`line_items[${i}][quantity]`] = '1'
    i++

    if (extra > 0) {
      params[`line_items[${i}][price]`] = extraUserPriceId()
      params[`line_items[${i}][quantity]`] = String(extra)
      i++
    }

    for (const key of modules) {
      params[`line_items[${i}][price]`] = modulePriceId(key)
      params[`line_items[${i}][quantity]`] = '1'
      i++
    }

    // De welkomstkorting hangt aan de KEUZE, niet aan het jaarabonnement. Alleen
    // "eerste 2 maanden gratis" krijgt de coupon; wie de website kiest betaalt
    // vanaf maand 1. Zonder dat onderscheid zou wie de website kiest die twee
    // maanden er stilzwijgend bij krijgen.
    //
    // Bewust een coupon en geen trial_period_days: bij een proefperiode noemt
    // Checkout het een proefversie, komt het abonnement op `trialing` te staan
    // en denkt de klant dat hij nog aan het uitproberen is. Met een coupon staat
    // het abonnement meteen op actief, ligt de incassomachtiging vast en ziet de
    // klant gewoon € 39 per maand met de eerste twee termijnen op € 0.
    if (heeftWelkomstkorting(welkomstactie)) {
      params['discounts[0][coupon]'] = welkomCouponId()
    }

    const session = await stripeFetch('/checkout/sessions', 'POST', params)

    return json({ url: session.url, sessionId: session.id })
  } catch (e) {
    // Geen Stripe- of databasetekst naar de browser; details staan in de log.
    console.error('[billing-checkout]', (e as Error)?.message)
    return json({ error: 'Afrekenen starten is niet gelukt. Probeer het later opnieuw.' }, 500)
  }
})
