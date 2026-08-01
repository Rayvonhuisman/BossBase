// billing-webhook (verify_jwt=false — publiek, Stripe roept dit aan)
//
// Verwerkt de abonnementsevents van ONS platform-account. Aparte endpoint en
// aparte secret (STRIPE_BILLING_WEBHOOK_SECRET) naast de bestaande
// stripe-webhook, die over Connect-betalingen gaat. Twee endpoints, twee
// secrets: een event van de ene integratie kan de andere dan niet raken.
//
// DE KERNREGEL — bron van waarheid:
//   Zolang subscriptions.stripe_subscription_id leeg is, is onze database
//   leidend. Dat is de gratis 14-daagse proefperiode uit provision_account,
//   waar nog geen Stripe-customer bestaat. Zo'n bedrijf wordt hier NOOIT
//   aangeraakt of "gecorrigeerd". Alleen checkout.session.completed mag de
//   koppeling leggen — dat event draagt onze eigen metadata.company_id.
//   Die regel staat hard in bb_stripe_sync_subscription(), niet hier: zo kan
//   geen enkele afhandeling eromheen.
//
// Verder: signature verifiëren op de RUWE body, elk event precies één keer
// verwerken (stripe_billing_events), en niets doen als het event niet
// eenduidig aan één bedrijf te binden is.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  verifyStripeSignature, stripeFetch, duidItems, naarISO, CORS,
  stuurBossBaseMail, INTERN_ADRES, isJaar, JAAR_TERMIJNEN, SCHEDULE_DOORLOPEN,
} from '../_shared/billing.ts'
import { klantMail, internMail } from '../_shared/websiteMail.ts'

// Maandprijs van de hostingmodule — noemen we in de klantmail zodat die kosten
// niet als verrassing komen. Uit de matrix (plan_modules), niet hardcoded.
async function hostingPrijs(admin: any): Promise<number> {
  const { data } = await admin.from('plan_modules').select('price').eq('module_key', 'hosting').maybeSingle()
  return Number(data?.price ?? 5)
}

// Website-aanvraag afhandelen: rij aanmaken (idempotent) en, alleen als hij
// NIEUW is, de mails versturen. Bij een herhaalde levering van hetzelfde event
// mag de klant niet twee keer dezelfde mail krijgen.
async function verwerkWebsiteAanvraag(admin: any, companyId: string, plan: string | null) {
  const { data: resultaat } = await admin.rpc('bb_open_website_aanvraag', { p_company_id: companyId })
  if (resultaat !== 'aangemaakt') return String(resultaat ?? 'geen aanvraag')

  const { data: bedrijf } = await admin
    .from('companies')
    .select('id, name, email, phone, address, postal_code, city, kvk, btw_number, website, logo_url, branding_color')
    .eq('id', companyId).maybeSingle()
  if (!bedrijf) return 'aanvraag aangemaakt, bedrijf niet gevonden'

  const prijs = await hostingPrijs(admin)

  // Mail naar de klant met de uitvraag. Antwoorden komen bij ons binnen.
  let klantOk = false
  if (bedrijf.email) {
    const m = klantMail(bedrijf, prijs)
    klantOk = !!(await stuurBossBaseMail(bedrijf.email, m.subject, m.html, INTERN_ADRES()))
  }

  // En een seintje naar onszelf dat er actie nodig is.
  const i = internMail(bedrijf, plan)
  await stuurBossBaseMail(INTERN_ADRES(), i.subject, i.html, bedrijf.email ?? undefined)

  if (klantOk) {
    await admin.from('website_aanvragen')
      .update({ status: 'gegevens_gevraagd', mail_verstuurd_op: new Date().toISOString() })
      .eq('company_id', companyId)
  }
  return klantOk ? 'aanvraag aangemaakt + mails verstuurd' : 'aanvraag aangemaakt (mail naar klant mislukt)'
}

// Zet de 12-maandsverplichting op een pas afgesloten jaarabonnement.
//
// Checkout kan zelf geen subscription_schedule maken, dus we maken hem hier ná
// afloop aan vanuit het bestaande abonnement. Eén fase met 12 iteraties, gerekend
// vanaf de start van het abonnement — de twee gekorte maanden vallen daarbínnen,
// dus het einde ligt 12 maanden na aanvang en niet 14.
//
// end_behavior 'release': na de 12 termijnen laat de schedule het abonnement los
// en loopt het maandelijks door. Zo zit niemand vast aan een tweede jaar.
async function zetJaarverplichting(admin: any, subscriptionId: string) {
  // Al een schedule? Dan niets doen — deze functie moet idempotent zijn, want
  // Stripe kan checkout.session.completed opnieuw aanbieden.
  const bestaand = await admin.from('subscriptions')
    .select('stripe_schedule_id').eq('stripe_subscription_id', subscriptionId).maybeSingle()
  if (bestaand.data?.stripe_schedule_id) return 'schedule bestond al'

  const schedule = await stripeFetch('/subscription_schedules', 'POST', {
    from_subscription: subscriptionId,
  })

  // from_subscription levert één fase die de huidige periode weerspiegelt. Die
  // fase krijgt nu 12 iteraties. start_date moet mee, anders verschuift Stripe
  // het beginpunt naar nu en zou de looptijd langer worden dan 12 maanden.
  const fase = schedule?.phases?.[0] ?? {}
  const basis: Record<string, string> = {
    'end_behavior': SCHEDULE_DOORLOPEN,
    'phases[0][start_date]': String(fase.start_date ?? schedule.current_phase?.start_date ?? ''),
    'phases[0][proration_behavior]': 'none',
  }
  ;(fase.items ?? []).forEach((it: any, i: number) => {
    basis[`phases[0][items][${i}][price]`] = it.price
    basis[`phases[0][items][${i}][quantity]`] = String(it.quantity ?? 1)
  })
  // De welkomstkorting hangt aan het abonnement; die moet op de fase herhaald
  // worden, anders gooit het bijwerken van de phases hem eraf. De coupon loopt
  // 2 van de 12 termijnen — hij verlengt de looptijd dus niet.
  ;(fase.discounts ?? []).forEach((d: any, i: number) => {
    const coupon = typeof d === 'string' ? d : (d.coupon?.id ?? d.coupon ?? d.discount?.coupon?.id)
    if (coupon) basis[`phases[0][discounts][${i}][coupon]`] = coupon
  })

  // Lengte van de fase. Recente API-versies gebruiken `duration`; oudere
  // `iterations`. Beide leveren 12 maandelijkse termijnen vanaf de startdatum op.
  // We proberen de nieuwe vorm en vallen terug, zodat een versiebump aan
  // Stripe's kant dit niet stilzwijgend breekt.
  let bijgewerkt
  try {
    bijgewerkt = await stripeFetch(`/subscription_schedules/${schedule.id}`, 'POST', {
      ...basis,
      'phases[0][duration][interval]': 'month',
      'phases[0][duration][interval_count]': String(JAAR_TERMIJNEN),
    })
  } catch (e) {
    if (!/unknown parameter/i.test((e as Error).message)) throw e
    bijgewerkt = await stripeFetch(`/subscription_schedules/${schedule.id}`, 'POST', {
      ...basis,
      'phases[0][iterations]': String(JAAR_TERMIJNEN),
    })
  }
  const eindeFase = bijgewerkt?.phases?.[0]?.end_date ?? null

  await admin.rpc('bb_stripe_sync_schedule', {
    p_subscription_id: subscriptionId,
    p_schedule_id: bijgewerkt.id,
    p_verplichting_tot: naarISO(eindeFase),
    p_stopt_na: false,
  })
  return `schedule ${bijgewerkt.id} · ${JAAR_TERMIJNEN} termijnen t/m ${naarISO(eindeFase)}`
}

// Stripe blijft retryen bij een niet-2xx. Bij een event dat we bewust NIET
// verwerken willen we juist géén retry — daarom 200 met een uitleg.
const ok = (resultaat: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ resultaat, ...extra }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const secret      = Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET') ?? ''

  // ── Signature op de ruwe body, vóór elke interpretatie ──────────────────────
  const payload = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  if (!secret) {
    return new Response(JSON.stringify({ error: 'STRIPE_BILLING_WEBHOOK_SECRET niet geconfigureerd' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
  if (!await verifyStripeSignature(payload, sig, secret)) {
    return new Response('invalid signature', { status: 400, headers: CORS })
  }

  let event: any
  try { event = JSON.parse(payload) } catch {
    return new Response('invalid payload', { status: 400, headers: CORS })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const type: string = event?.type ?? ''
  const obj: any = event?.data?.object ?? {}
  const eventId: string = event?.id ?? ''
  if (!eventId) return new Response('missing event id', { status: 400, headers: CORS })

  // Een event van een CONNECTED account hoort bij de Connect-integratie, niet
  // hier. Billing draait op het platform-account, waar event.account leeg is.
  if (event?.account) return ok('genegeerd: connected-account-event')

  // ── Idempotentie: claim het event ──────────────────────────────────────────
  // Slaagt de insert niet, dan is dit event al verwerkt en stoppen we. Dit
  // gebeurt vóór alle zijeffecten, zodat een retry nooit dubbel telt.
  const { error: claimErr } = await admin
    .from('stripe_billing_events')
    .insert({ event_id: eventId, type })
  if (claimErr) {
    if (claimErr.code === '23505') return ok('al verwerkt')
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const rond = async (resultaat: string, companyId: string | null = null) => {
    await admin.from('stripe_billing_events')
      .update({ resultaat, company_id: companyId }).eq('event_id', eventId)
    return ok(resultaat)
  }

  try {
    // ── Welke subscription en welk bedrijf? ──────────────────────────────────
    let subscriptionId: string | null = null
    let companyId: string | null = null
    let bind = false

    if (type === 'checkout.session.completed') {
      // Het ENIGE moment waarop we een bedrijf aan Stripe koppelen. Het bedrijf
      // komt uit onze eigen metadata, die wij bij het aanmaken hebben gezet.
      if (obj?.mode !== 'subscription') return await rond('genegeerd: geen abonnements-checkout')
      subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null
      companyId = obj?.metadata?.company_id ?? null
      bind = true
    } else if (type.startsWith('customer.subscription.')) {
      subscriptionId = obj?.id ?? null
    } else if (type === 'invoice.payment_succeeded' || type === 'invoice.payment_failed' || type === 'invoice.paid') {
      // Stripe heeft het abonnement op de factuur verplaatst: vroeger
      // invoice.subscription, in recentere API-versies
      // invoice.parent.subscription_details.subscription (en per regel onder
      // lines.data[].parent). We lezen alle drie, oudste laatst, zodat een
      // versiebump aan Stripe's kant dit niet stilzwijgend breekt — zonder deze
      // fallback werd elk factuur-event genegeerd en zag je een mislukte
      // betaling dus nooit terug.
      subscriptionId =
        (typeof obj.subscription === 'string' ? obj.subscription : null)
        ?? obj?.parent?.subscription_details?.subscription
        ?? obj?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription
        ?? null
    } else if (type.startsWith('subscription_schedule.')) {
      // De schedule bewaakt de looptijd; wijzigingen eraan (opzeggen tegen het
      // einde, vrijgeven na 12 maanden) moeten in onze DB terechtkomen.
      const schedSub = typeof obj.subscription === 'string' ? obj.subscription : null
      if (!schedSub) return await rond('genegeerd: schedule zonder abonnement')
      const eersteFase = obj?.phases?.[0] ?? {}
      const { data: r } = await admin.rpc('bb_stripe_sync_schedule', {
        p_subscription_id: schedSub,
        p_schedule_id: obj.id ?? null,
        p_verplichting_tot: naarISO(eersteFase.end_date),
        // 'cancel' = de klant heeft opgezegd tegen het einde van de looptijd.
        p_stopt_na: obj?.end_behavior === 'cancel',
      })
      return await rond(`${type} → ${r}`)
    } else {
      return await rond(`genegeerd: ${type}`)
    }

    if (!subscriptionId) return await rond('genegeerd: geen subscription in event')

    // Buiten het bindmoment leiden we het bedrijf UITSLUITEND af uit een
    // bestaande koppeling. Geen koppeling = geen bedrijf = niets doen. Dat is
    // precies wat een DB-proefperiode beschermt.
    if (!bind) {
      const { data: rij } = await admin
        .from('subscriptions').select('company_id')
        .eq('stripe_subscription_id', subscriptionId).maybeSingle()
      companyId = rij?.company_id ?? null
      if (!companyId) return await rond('genegeerd: onbekend abonnement (geen gekoppeld bedrijf)')
    }
    if (!companyId) return await rond('genegeerd: geen bedrijf te bepalen')

    // ── Actuele stand bij Stripe ophalen ─────────────────────────────────────
    // Nooit vertrouwen op wat er in het event staat: dat kan verouderd zijn bij
    // out-of-order aflevering. Stripe is de bron, dus vragen we het Stripe.
    const sub = await stripeFetch(`/subscriptions/${subscriptionId}?expand[]=items.data.price`, 'GET')

    const items = sub?.items?.data ?? []
    const { tier, priceId, extraGebruikers, modules } = duidItems(items)

    // Een abonnement zonder herkenbaar pakket wijst op verkeerd geconfigureerde
    // prijs-ids. Dan liever niets doen dan het pakket wissen.
    if (!tier && type !== 'customer.subscription.deleted') {
      return await rond('genegeerd: geen herkenbaar pakket in de items (controleer de STRIPE_PRICE_*-variabelen)', companyId)
    }

    const stripeStatus: string = type === 'customer.subscription.deleted' ? 'canceled' : (sub?.status ?? '')
    const interval: string = sub?.metadata?.billing_interval ?? null

    // Periode: bij een lopende proefperiode (het jaarabonnement) is de
    // trial-einddatum de datum die de klant moet zien.
    // De factuurperiode stond vroeger op de subscription zelf; in recentere
    // API-versies staat hij op het subscription-ITEM. Zonder deze fallback
    // blijven current_period_start/end leeg — dan toont de app geen verlengdatum
    // en ankert companies.periode_start niet op de factuurperiode.
    const item0 = items?.[0] ?? {}
    const rauwStart = sub?.current_period_start ?? item0?.current_period_start
    const rauwEind  = sub?.current_period_end   ?? item0?.current_period_end

    const periodStart = naarISO(rauwStart)
    const periodEnd = stripeStatus === 'trialing'
      ? (naarISO(sub?.trial_end) ?? naarISO(rauwEind))
      : naarISO(rauwEind)

    const { data: resultaat, error: syncErr } = await admin.rpc('bb_stripe_sync_subscription', {
      p_company_id: companyId,
      p_subscription_id: subscriptionId,
      p_customer_id: typeof sub?.customer === 'string' ? sub.customer : null,
      p_plan: tier,
      p_stripe_status: stripeStatus,
      p_price_id: priceId,
      p_extra_gebruikers: extraGebruikers,
      p_interval: interval,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      // Opzegging per einde periode: Stripe geeft dit in recentere API-versies
      // als een tijdstip in `cancel_at` in plaats van de vlag
      // `cancel_at_period_end`. Beide lezen, anders zie je een opzegging die de
      // klant in het portaal wél heeft gedaan bij ons niet terug.
      p_cancel_at_end: sub?.cancel_at_period_end === true
        || (Number.isFinite(Number(sub?.cancel_at)) && Number(sub?.cancel_at) > 0),
      p_bind: bind,
    })
    if (syncErr) throw new Error(syncErr.message)

    // Heeft de databaseregel het event afgewezen (bv. DB-proefperiode), dan
    // raken we ook de modules niet aan.
    if (typeof resultaat === 'string' && resultaat.startsWith('genegeerd')) {
      return await rond(resultaat, companyId)
    }

    await admin.rpc('bb_stripe_sync_modules', {
      p_company_id: companyId,
      p_modules: modules,
    })

    // ── Jaarverplichting ─────────────────────────────────────────────────────
    // Alleen bij het BINDMOMENT en alleen voor een jaarabonnement. Een
    // maandabonnement krijgt geen schedule en blijft per maand opzegbaar.
    let verplichting = ''
    if (bind && isJaar(interval)) {
      try {
        verplichting = ` · ${await zetJaarverplichting(admin, subscriptionId)}`
      } catch (e) {
        // De verplichting mag de abonnementsverwerking niet laten klappen; zonder
        // schedule staat het abonnement er gewoon, alleen zonder looptijdgrendel.
        verplichting = ` · schedule mislukt: ${(e as Error).message}`
      }
    }

    // Werkelijke stopdatum vastleggen (Stripe cancel_at). Zonder deze weten we
    // wel DAT er opgezegd is, maar niet wanneer — en dat verschilt tussen een
    // maandabonnement en een jaarabonnement met looptijd.
    await admin.rpc('bb_stripe_sync_stopdatum', {
      p_subscription_id: subscriptionId,
      p_stopt_op: naarISO(sub?.cancel_at),
    })

    // ── Grendel op de jaarlooptijd ───────────────────────────────────────────
    // Het Customer Portal kent alleen "direct" of "per einde FACTUURPERIODE", en
    // die periode is bij ons één maand. Een jaarklant die daar op opzeggen klikt,
    // eindigt dus volgende maand en breekt zijn looptijd — bewezen in de sandbox.
    //
    // Een portalconfiguratie zonder opzegknop (STRIPE_PORTAL_CONFIG_JAAR) helpt,
    // maar dat is een dashboardinstelling die stuk kan gaan zonder dat iemand het
    // merkt. Daarom corrigeren we het hier ook: valt de opzegdatum binnen de
    // looptijd, dan schuiven we hem naar het einde ervan. De klant heeft opgezegd
    // en dat blijft zo — alleen op het juiste moment.
    let grendel = ''
    try {
      const { data: rij } = await admin
        .from('subscriptions')
        .select('verplichting_tot, stripe_schedule_id')
        .eq('stripe_subscription_id', subscriptionId).maybeSingle()

      const eindeLooptijd = rij?.verplichting_tot ? new Date(rij.verplichting_tot) : null
      const opzegdatum = sub?.cancel_at ? new Date(Number(sub.cancel_at) * 1000) : null

      if (eindeLooptijd && eindeLooptijd > new Date() && opzegdatum && opzegdatum < eindeLooptijd) {
        // Opzegdatum naar het einde van de looptijd schuiven. Via cancel_at op
        // het abonnement, want een portal-opzegging zet de schedule op
        // `released` en die is dan niet meer bij te werken.
        const eindeUnix = Math.floor(eindeLooptijd.getTime() / 1000)
        await stripeFetch(`/subscriptions/${subscriptionId}`, 'POST', {
          'cancel_at': String(eindeUnix),
        })
        if (rij?.stripe_schedule_id) {
          try {
            await stripeFetch(`/subscription_schedules/${rij.stripe_schedule_id}`, 'POST', { end_behavior: 'cancel' })
          } catch (e) {
            if (!/released|completed|canceled/i.test((e as Error).message)) throw e
          }
        }
        await admin.rpc('bb_stripe_sync_schedule', {
          p_subscription_id: subscriptionId,
          p_schedule_id: rij?.stripe_schedule_id ?? null,
          p_verplichting_tot: rij?.verplichting_tot ?? null,
          p_stopt_na: true,
        })
        await admin.from('subscriptions')
          .update({ cancel_at_period_end: false })
          .eq('stripe_subscription_id', subscriptionId)
        grendel = ' · opzegging verplaatst naar einde looptijd'
      }
    } catch (e) {
      grendel = ` · grendel mislukt: ${(e as Error).message}`
    }

    // ── Welkomstactie ────────────────────────────────────────────────────────
    // Reist mee als metadata op de subscription. De database bepaalt of hij mag
    // (jaarabonnement, pakket, nog niet eerder gekozen) — wij leggen alleen voor.
    let actieResultaat = ''
    const gekozenActie: string | null = sub?.metadata?.welkomstactie ?? null
    if (gekozenActie) {
      const { data: r } = await admin.rpc('bb_registreer_welkomstactie', {
        p_company_id: companyId,
        p_actie: gekozenActie,
        p_interval: interval,
      })
      actieResultaat = ` · actie: ${r}`

      // Website gekozen én zojuist vastgelegd → aanvraag openen en uitvragen.
      if (gekozenActie === 'gratis_website' && String(r ?? '').startsWith('vastgelegd')) {
        try {
          actieResultaat += ` · ${await verwerkWebsiteAanvraag(admin, companyId, tier)}`
        } catch (mailFout) {
          // De mail mag de abonnementsverwerking nooit laten klappen; de aanvraag
          // staat dan gewoon op 'open' in het portaal.
          actieResultaat += ` · website-mail mislukt: ${(mailFout as Error).message}`
        }
      }
    }

    return await rond(`${resultaat} (${type} → ${stripeStatus})${verplichting}${grendel}${actieResultaat}`, companyId)
  } catch (e) {
    // Fout in onze verwerking: laat het event los zodat Stripe opnieuw aanbiedt.
    await admin.from('stripe_billing_events').delete().eq('event_id', eventId)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
