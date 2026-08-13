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
import {
  stripeFetch, json, CORS, eisAbonnementsbeheerder, weigerLiveVanafLokaal,
  tierPriceId, modulePriceId, extraUserPriceId, duidItems, naarISO, bouwItemMutaties,
  zetJaarverplichting, isJaar,
  MODULE_BESCHIKBAAR, MODULE_VEREIST, inbegrepenGebruikers,
} from '../_shared/billing.ts'

const TIERS = ['starter', 'groei', 'team']
const RANG = (t: string) => TIERS.indexOf(t)

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

    // Geen live Stripe vanaf localhost — zie weigerLiveVanafLokaal.
    const grendel = weigerLiveVanafLokaal(req.headers.get('origin'))
    if (grendel) return grendel

    const body = await req.json().catch(() => ({}))
    const doelTier: string = String(body?.tier || '').toLowerCase()
    const extra = Math.max(0, Math.trunc(Number(body?.extra_gebruikers ?? 0)))
    const gewensteModules: string[] = Array.isArray(body?.modules)
      ? [...new Set(body.modules.map((m: unknown) => String(m)))]
      : []

    if (!TIERS.includes(doelTier)) return json({ error: 'Onbekend pakket' }, 400)

    // ── Loopt er wel een abonnement? ─────────────────────────────────────────
    const { data: rij } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_schedule_id, verplichting_tot, billing_interval')
      .eq('company_id', companyId)
      .maybeSingle()

    if (!rij?.stripe_subscription_id) {
      return json({
        error: 'Er loopt nog geen abonnement. Sluit er eerst een af.',
        code: 'geen_abonnement',
      }, 409)
    }

    // ── 2. Mag deze overstap? ────────────────────────────────────────────────
    const { data: oordeel, error: oordeelFout } = await admin
      .rpc('bb_mag_wisselen', { p_company_id: companyId, p_doel_tier: doelTier })
    if (oordeelFout) return json({ error: `Controle mislukt: ${oordeelFout.message}` }, 500)

    // Reset de looptijd? Alleen bij een tier-upgrade van een JAARabonnement.
    // bb_mag_wisselen rekent het uit; wij voeren het alleen uit, zodat scherm en
    // server op precies dezelfde regel draaien.
    const looptijdReset = oordeel?.looptijdReset === true

    if (oordeel && oordeel.mag === false) {
      return json({
        error: oordeel.reden || 'Deze overstap kan niet.',
        code: oordeel.code || 'wissel_geweigerd',
        blokkades: oordeel.blokkades ?? undefined,
        verplichtingTot: oordeel.verplichtingTot ?? undefined,
      }, 409)
    }

    // ── 3. Modules valideren ─────────────────────────────────────────────────
    for (const key of gewensteModules) {
      const toegestaan = MODULE_BESCHIKBAAR[key]
      if (!toegestaan) return json({ error: `Onbekende module: ${key}` }, 400)
      if (!toegestaan.includes(doelTier)) {
        return json({
          error: `De module "${key}" is niet beschikbaar bij dit pakket.`,
          code: 'module_niet_beschikbaar',
        }, 400)
      }
      const vereist = MODULE_VEREIST[key]
      if (vereist && !gewensteModules.includes(vereist)) {
        return json({
          error: `De module "${key}" werkt alleen samen met "${vereist}".`,
          code: 'module_vereist',
        }, 400)
      }
    }

    // ── 4. Gebruikersplafond van het DOELpakket ──────────────────────────────
    const { data: hardeLimiet } = await admin
      .from('plan_limits').select('limit_value')
      .eq('plan', doelTier).eq('limit_key', 'gebruikers').maybeSingle()
    const plafond = hardeLimiet?.limit_value ?? null
    if (plafond !== null && inbegrepenGebruikers(doelTier) + extra > plafond) {
      return json({
        error: `${doelTier === 'groei' ? 'Groei' : doelTier} gaat tot ${plafond} gebruikers. Voor meer is er Team.`,
        code: 'te_veel_gebruikers',
        maximum: plafond,
      }, 400)
    }

    // ── Huidige stand bij Stripe ─────────────────────────────────────────────
    const sub = await stripeFetch(
      `/subscriptions/${rij.stripe_subscription_id}?expand[]=items.data.price`, 'GET')
    const items: any[] = sub?.items?.data ?? []
    const huidig = duidItems(items)

    // ── Wat verandert er? ────────────────────────────────────────────────────
    // We stellen de nieuwe itemlijst samen als een reeks mutaties op de
    // bestaande items: bijwerken wat er is, toevoegen wat ontbreekt, verwijderen
    // wat weg moet. Stripe verwacht per item óf een `id` (bestaand) óf een
    // `price` (nieuw).
    const { params, wijzigingen } = bouwItemMutaties({
      huidigeItems: items,
      doelTier,
      doelExtra: extra,
      doelModules: gewensteModules,
      prijsVoorTier: tierPriceId,
      prijsVoorModule: modulePriceId,
      prijsExtraGebruiker: extraUserPriceId,
    })

    if (wijzigingen.length === 0) {
      return json({
        resultaat: 'ongewijzigd',
        bericht: 'Er is niets veranderd aan je abonnement.',
      })
    }

    // Proratie. Omhoog rekenen we meteen af: de klant wil de ruimte nú, dus
    // hoort de bijbetaling er ook nu te zijn — anders krijgt hij weken later een
    // onverwachte factuur voor iets wat hij allang vergeten is. Omlaag zetten we
    // het als krediet op de volgende factuur; een terugbetaling uitkeren is
    // rommeliger dan verrekenen.
    // Richting van de PAKKETwijziging. Blijft het pakket gelijk (module erbij,
    // gebruiker erbij), dan is het geen van beide — dat 'omlaag' noemen is
    // gewoon onwaar, ook al ziet alleen een ontwikkelaar dit veld.
    const rangNu = RANG(huidig.tier ?? doelTier)
    const rangDoel = RANG(doelTier)
    const richting = rangDoel > rangNu ? 'omhoog' : rangDoel < rangNu ? 'omlaag' : 'gelijk'
    const omhoog = richting === 'omhoog'
    params['proration_behavior'] = omhoog ? 'always_invoice' : 'create_prorations'
    // Zonder deze blijft de metadata van de eerste checkout staan; de webhook
    // leest hier de betaaltermijn uit.
    if (rij.billing_interval) params['metadata[billing_interval]'] = rij.billing_interval
    params['metadata[company_id]'] = companyId

    // ── Uitvoeren ────────────────────────────────────────────────────────────
    // Een abonnement dat aan een subscription_schedule hangt laat zich niet
    // zomaar wijzigen — Stripe bewaakt dat de schedule de baas blijft. Loopt het
    // daarop stuk, dan geven we de schedule vrij en proberen we opnieuw.
    //
    // De 12-maandsverplichting gaat daar NIET mee verloren: die staat als
    // verplichting_tot in onze eigen database, wordt afgedwongen door
    // billing-cancel en door de grendel in de webhook (die een te vroege
    // opzegdatum naar het einde van de looptijd schuift), en het portal toont
    // jaarklanten sowieso geen opzegknop. De schedule was de bovenste van drie
    // lagen, niet de enige.
    let bijgewerkt: any
    let scheduleVrijgegeven = false
    try {
      bijgewerkt = await stripeFetch(`/subscriptions/${rij.stripe_subscription_id}`, 'POST', params)
    } catch (e) {
      const bericht = (e as Error).message || ''
      if (!/schedule/i.test(bericht) || !rij.stripe_schedule_id) throw e

      await stripeFetch(`/subscription_schedules/${rij.stripe_schedule_id}/release`, 'POST', {})
      scheduleVrijgegeven = true
      bijgewerkt = await stripeFetch(`/subscriptions/${rij.stripe_subscription_id}`, 'POST', params)

      // De schedule bestaat niet meer, de looptijd wel. Vastleggen dat er geen
      // schedule meer is, met behoud van verplichting_tot.
      await admin.rpc('bb_stripe_sync_schedule', {
        p_subscription_id: rij.stripe_subscription_id,
        p_schedule_id: null,
        p_verplichting_tot: rij.verplichting_tot,
        p_stopt_na: null,
      })
      await admin.from('subscriptions')
        .update({ stripe_schedule_id: null })
        .eq('company_id', companyId)
    }

    // ── Meteen synchroniseren ────────────────────────────────────────────────
    // Niet wachten op de webhook. Dezelfde RPC's, dus dezelfde regel: zolang er
    // geen stripe_subscription_id staat is onze database leidend, en die staat
    // hier per definitie wél. We overschrijven geen waarheid, we halen hem op.
    const nieuweItems: any[] = bijgewerkt?.items?.data ?? []
    const na = duidItems(nieuweItems)
    const item0 = nieuweItems?.[0] ?? {}

    await admin.rpc('bb_stripe_sync_subscription', {
      p_company_id: companyId,
      p_subscription_id: rij.stripe_subscription_id,
      p_customer_id: typeof bijgewerkt?.customer === 'string' ? bijgewerkt.customer : null,
      p_plan: na.tier,
      p_stripe_status: bijgewerkt?.status ?? null,
      p_price_id: na.priceId,
      p_extra_gebruikers: na.extraGebruikers,
      p_interval: rij.billing_interval ?? null,
      p_period_start: naarISO(bijgewerkt?.current_period_start ?? item0?.current_period_start),
      p_period_end:   naarISO(bijgewerkt?.current_period_end   ?? item0?.current_period_end),
      p_cancel_at_end: bijgewerkt?.cancel_at_period_end === true
        || (Number.isFinite(Number(bijgewerkt?.cancel_at)) && Number(bijgewerkt?.cancel_at) > 0),
      p_bind: false,
    })

    await admin.rpc('bb_stripe_sync_modules', {
      p_company_id: companyId,
      p_modules: na.modules,
    })

    // ── Looptijd opnieuw zetten ──────────────────────────────────────────────
    // Alleen bij een pakketupgrade van een jaarabonnement. Modules bijkopen en
    // extra gebruikers raken de looptijd NIET: dat zijn bijbestellingen, en de
    // looptijd resetten voor € 10 zou de bijverkoop remmen die we juist willen.
    //
    // Dit gebeurt ná de itemwijziging, want de nieuwe schedule moet de nieuwe
    // prijsregels weerspiegelen. Is de oude schedule hierboven al vrijgegeven om
    // de items te kunnen wijzigen, dan pakt zetJaarverplichting dat gewoon op.
    let looptijd = ''
    if (looptijdReset && isJaar(rij.billing_interval)) {
      try {
        looptijd = await zetJaarverplichting(admin, rij.stripe_subscription_id, { opnieuw: true })
      } catch (e) {
        // De wijziging zelf is al doorgevoerd en betaald; die draaien we niet
        // terug om een schedule. Wel hard melden, want zonder nieuwe schedule
        // staat er een looptijd in onze database die Stripe niet kent.
        looptijd = `LOOPTIJD NIET GEZET: ${(e as Error).message}`
        console.error('looptijdreset mislukt', rij.stripe_subscription_id, e)
      }
    }

    // De verse verplichting_tot teruglezen, zodat het antwoord de waarheid is en
    // niet onze voorspelling ervan.
    const { data: naRij } = await admin
      .from('subscriptions').select('verplichting_tot')
      .eq('company_id', companyId).maybeSingle()

    return json({
      resultaat: 'gewijzigd',
      tier: na.tier,
      extraGebruikers: na.extraGebruikers,
      modules: na.modules.map(m => m.module_key),
      richting,
      scheduleVrijgegeven,
      looptijdReset,
      looptijd,
      verplichtingTot: naRij?.verplichting_tot ?? null,
      wijzigingen,
      bericht: omhoog
        ? (looptijdReset
            ? 'Je abonnement is bijgewerkt en alles staat meteen open. Het verschil is direct verrekend en je nieuwe looptijd van 12 maanden is ingegaan.'
            : 'Je abonnement is bijgewerkt. Het verschil is direct verrekend en alles staat meteen open.')
        : richting === 'gelijk'
          ? 'Je abonnement is bijgewerkt. Het verschil wordt verrekend op je volgende factuur; wat je erbij hebt genomen staat meteen open.'
          : 'Je abonnement is bijgewerkt. Het verschil wordt verrekend op je volgende factuur.',
    })
  } catch (e) {
    return json({ error: (e as Error).message || 'Onbekende fout' }, 500)
  }
})
