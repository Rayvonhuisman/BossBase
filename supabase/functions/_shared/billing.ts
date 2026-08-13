// Gedeelde helper voor STRIPE BILLING (abonnementen aan BossBase).
//
// Niet te verwarren met _shared/stripe.ts, dat de CONNECT-integratie bedient
// (betalingen van onze klanten aan hún klanten, op hun connected account).
// Billing draait op ONS eigen platform-account: geen Stripe-Account header.
// De REST-helper en de signature-verificatie hergebruiken we wel — dat is
// dezelfde Stripe API en dezelfde HMAC.

export { stripeFetch, verifyStripeSignature, appOrigin } from './stripe.ts'
import { stripeFetch } from './stripe.ts'

// ── PRIJS-IDS UIT DE OMGEVING ────────────────────────────────────────────────
// Nooit hardcoden: test- en live-mode hebben andere ids, en prijzen wijzigen
// zonder codewijziging. Aanmaken kan met `node scripts/stripe-setup-prices.mjs`,
// die de env-regels uitprint.
const ENV_TIER: Record<string, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  groei:   'STRIPE_PRICE_GROEI',
  team:    'STRIPE_PRICE_TEAM',
}

const ENV_MODULE: Record<string, string> = {
  stripe_betaallink: 'STRIPE_PRICE_MODULE_STRIPE_BETAALLINK',
  planning:          'STRIPE_PRICE_MODULE_PLANNING',
  voertuigen:        'STRIPE_PRICE_MODULE_VOERTUIGEN',
  hosting:           'STRIPE_PRICE_MODULE_HOSTING',
}

const ENV_EXTRA_USER = 'STRIPE_PRICE_EXTRA_GEBRUIKER'

function env(naam: string): string {
  const v = Deno.env.get(naam)
  if (!v) throw new Error(`${naam} niet geconfigureerd`)
  return v
}

export const tierPriceId   = (tier: string) => env(ENV_TIER[tier] ?? '')
export const modulePriceId = (key: string)  => env(ENV_MODULE[key] ?? '')
export const extraUserPriceId = () => env(ENV_EXTRA_USER)

// Omgekeerde vertaling: van een price-id terug naar wat het betekent. De webhook
// leidt hiermee het pakket, de extra gebruikers en de modules af uit de items van
// de subscription — Stripe is dan immers de bron van waarheid.
export type PrijsBetekenis =
  | { soort: 'tier'; tier: string }
  | { soort: 'extra_gebruiker' }
  | { soort: 'module'; moduleKey: string }
  | { soort: 'onbekend' }

export function duidPrijs(priceId: string): PrijsBetekenis {
  if (!priceId) return { soort: 'onbekend' }
  for (const [tier, naam] of Object.entries(ENV_TIER)) {
    if (Deno.env.get(naam) === priceId) return { soort: 'tier', tier }
  }
  if (Deno.env.get(ENV_EXTRA_USER) === priceId) return { soort: 'extra_gebruiker' }
  for (const [key, naam] of Object.entries(ENV_MODULE)) {
    if (Deno.env.get(naam) === priceId) return { soort: 'module', moduleKey: key }
  }
  return { soort: 'onbekend' }
}

// ── JAARABONNEMENT EN WELKOMSTACTIE ──────────────────────────────────────────
// Een jaarabonnement is gewoon 12 maanden maandelijks betalen tegen dezelfde
// prijs. Het voordeel zit in de WELKOMSTACTIE die de klant daarbij kiest.
//
// De gratis maanden zijn een KORTING (Stripe-coupon, 100% over twee termijnen),
// nadrukkelijk GEEN proefperiode. Met trial_period_days zou Checkout
// "proefperiode"-taal tonen, zou het abonnement op `trialing` staan en zou de
// klant denken dat hij nog aan het uitproberen is. Hij is klant en krijgt
// korting. "Proefperiode" blijft voorbehouden aan de 14 dagen gratis
// uitproberen vóór het abonnement.
//
// Spiegelt src/lib/tiers.js → WELKOMSTACTIES. Een edge function kan geen
// frontendmodule laden; de database is en blijft de afdwinging
// (bb_registreer_welkomstactie).
export const WELKOMSTACTIES: Record<string, { kortingMaanden: number; tiers: string[] }> = {
  gratis_maanden: { kortingMaanden: 2, tiers: ['starter', 'groei', 'team'] },
  gratis_website: { kortingMaanden: 0, tiers: ['groei', 'team'] },
}

export const isJaar = (interval?: string | null) => String(interval || '') === 'jaar'

// Een jaarabonnement is 12 maandelijkse termijnen VAST, gerekend vanaf de start.
// De twee gekorte maanden tellen mee: periode 1-2 op € 0 door de coupon,
// periode 3 t/m 12 op de normale prijs. Het einde ligt dus 12 maanden na
// aanvang, niet 14.
export const JAAR_TERMIJNEN = 12

// Wat er ná die 12 termijnen gebeurt. 'release' = de schedule laat het
// abonnement los en het loopt maandelijks door, per maand opzegbaar. Zet de
// klant tijdens de looptijd zijn opzegging in, dan wordt dit 'cancel' en stopt
// het abonnement precies aan het einde van de looptijd.
export const SCHEDULE_DOORLOPEN = 'release'
export const SCHEDULE_STOPPEN   = 'cancel'

// Krijgt deze keuze de welkomstkorting? Geen keuze = nee.
export const heeftWelkomstkorting = (actie?: string | null): boolean =>
  (WELKOMSTACTIES[String(actie || '')]?.kortingMaanden ?? 0) > 0

// Vaste id van de coupon, aangemaakt door scripts/stripe-setup-prices.mjs.
// Overschrijfbaar via env voor het geval je in live mode een andere id wilt.
export const welkomCouponId = () =>
  Deno.env.get('STRIPE_COUPON_WELKOM') || 'bb_welkom_2_maanden_gratis'

// ── WAT DE KLANT MAG KOPEN ───────────────────────────────────────────────────
// Spiegelt src/lib/features.js. Bewust hier herhaald in plaats van geïmporteerd:
// een edge function kan geen frontendmodule laden. De database blijft de
// afdwinging (plan_module_tiers); dit voorkomt alleen een zinloze Stripe-call.
export const MODULE_BESCHIKBAAR: Record<string, string[]> = {
  stripe_betaallink: ['groei'],
  planning:          ['groei'],
  voertuigen:        ['groei'],
  hosting:           ['groei', 'team'],
}
export const MODULE_VEREIST: Record<string, string | null> = {
  stripe_betaallink: null,
  planning:          null,
  voertuigen:        'planning',
  hosting:           null,
}

// Hoeveel gebruikers zitten er IN de pakketprijs (de rest is een apart item)?
// Bij Team telt élke gebruiker mee, ook de eerste: € 59 basis + € 10 per
// gebruiker, dus 1 gebruiker = € 69.
//
// Was één constante voor alle pakketten (1), waardoor Team de eerste gebruiker
// gratis weggaf. Spiegelt src/lib/tiers.js → INBEGREPEN_GEBRUIKERS; een edge
// function kan die module niet laden.
export const INBEGREPEN_GEBRUIKERS: Record<string, number> = {
  starter: 1,
  groei:   1,
  team:    0,
}

/** Aantal gebruikers in de pakketprijs. Onbekend pakket → 1. */
export const inbegrepenGebruikers = (tier: string): number =>
  INBEGREPEN_GEBRUIKERS[tier] ?? 1

// Prijs per extra gebruiker. Spiegelt src/lib/tiers.js → EXTRA_USER_PRICE; een
// edge function kan die module niet laden. Alleen voor wat we in mails en
// meldingen NOEMEN — wat er daadwerkelijk wordt geïncasseerd bepaalt de Stripe
// price achter STRIPE_PRICE_EXTRA_GEBRUIKER, en die komt uit hetzelfde bestand
// via scripts/stripe-setup-prices.mjs.
export const EXTRA_GEBRUIKER_PRIJS = 10

// ── GRENDEL: GEEN LIVE STRIPE VANAF EEN LOKALE OMGEVING ──────────────────────
// De frontend praat lokaal met hetzelfde Supabase-project als productie, dus een
// testklik in `npm run dev` belandde met een live sleutel in het echte
// Stripe-account. Dat is één keer gebeurd; deze grendel voorkomt het voortaan.
//
// De check is bewust op de COMBINATIE: een live sleutel én een lokale herkomst.
// Productie draait op bossbase.nl en wordt dus nooit geraakt; test-sleutels
// (sk_test_) mogen lokaal gewoon.
const LOKALE_HERKOMST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

export function weigerLiveVanafLokaal(reqOrigin: string | null): Response | null {
  const key = Deno.env.get('STRIPE_SECRET_KEY') || ''
  const live = key.startsWith('sk_live_') || key.startsWith('rk_live_')
  if (!live) return null
  if (!LOKALE_HERKOMST.test(String(reqOrigin || ''))) return null
  return json({
    error: 'Dit project draait met een LIVE Stripe-sleutel. Vanaf een lokale omgeving '
      + 'wordt er niets naar Stripe gestuurd, zodat een test nooit in het echte account belandt. '
      + 'Gebruik een staging-project met sk_test_ om de betaalflow te testen.',
    code: 'live_stripe_vanaf_lokaal',
  }, 403)
}

// ── GEDEELDE HTTP-BOUWSTENEN ─────────────────────────────────────────────────
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── AUTORISATIE: ALLEEN DE EIGENAAR/ADMIN ────────────────────────────────────
// Een APARTE gate, los van het rechtensysteem. Dat systeem gaat over werk; dit
// gaat over geld. Een medewerker met alle werkrechten hoort hier niet bij te
// kunnen — ook niet met een rechtstreekse API-aanroep, en daarom staat de check
// hier server-side en niet alleen in de UI.
export async function eisAbonnementsbeheerder(
  admin: any,
  userClient: any,
): Promise<{ userId: string; companyId: string } | Response> {
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return json({ error: 'Ongeldige sessie' }, 401)

  const { data: profile } = await admin
    .from('profiles')
    .select('company_id, role, actief')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.company_id) return json({ error: 'Geen bedrijf gekoppeld' }, 400)
  if (profile.actief === false) return json({ error: 'Account is gedeactiveerd' }, 403)
  if (profile.role !== 'admin') {
    return json({
      error: 'Alleen de eigenaar van het bedrijf kan het abonnement beheren.',
      code: 'geen_abonnementsbeheerder',
    }, 403)
  }
  return { userId: user.id, companyId: profile.company_id }
}

// ── SUBSCRIPTION-ITEMS DUIDEN ────────────────────────────────────────────────
// Uit de items van een Stripe-subscription afleiden: welk pakket, hoeveel extra
// gebruikers, welke modules. Eén plek, zodat webhook en checkout hetzelfde lezen.
export function duidItems(items: any[]): {
  tier: string | null
  priceId: string | null
  extraGebruikers: number
  modules: { module_key: string; item_id: string; price_id: string }[]
} {
  let tier: string | null = null
  let priceId: string | null = null
  let extraGebruikers = 0
  const modules: { module_key: string; item_id: string; price_id: string }[] = []

  for (const item of items || []) {
    const pid = item?.price?.id ?? ''
    const qty = Number(item?.quantity ?? 1)
    const betekenis = duidPrijs(pid)
    if (betekenis.soort === 'tier') {
      tier = betekenis.tier
      priceId = pid
    } else if (betekenis.soort === 'extra_gebruiker') {
      extraGebruikers += Number.isFinite(qty) ? qty : 0
    } else if (betekenis.soort === 'module') {
      modules.push({ module_key: betekenis.moduleKey, item_id: item.id, price_id: pid })
    }
  }
  return { tier, priceId, extraGebruikers, modules }
}

// ── ITEMMUTATIES BEREKENEN ───────────────────────────────────────────────────
// Van "wat heeft de klant nu" naar "wat wil hij" — als een reeks mutaties op de
// bestaande subscription-items. Stripe verwacht per item óf een `id` (bestaand
// item bijwerken of verwijderen) óf een `price` (nieuw item).
//
// Apart van billing-wijzig omdat dit de plek is waar een fout geld kost: een
// gemiste `deleted` betekent dat de klant blijft betalen voor een module die hij
// heeft opgezegd, en een dubbel toegevoegde regel dat hij dubbel betaalt. Los
// testbaar is hier meer waard dan compact.
export type ItemMutaties = { params: Record<string, string>; wijzigingen: string[] }

export function bouwItemMutaties(opts: {
  huidigeItems: any[]
  doelTier: string
  doelExtra: number
  doelModules: string[]
  prijsVoorTier: (tier: string) => string
  prijsVoorModule: (key: string) => string
  prijsExtraGebruiker: () => string
}): ItemMutaties {
  const {
    huidigeItems, doelTier, doelExtra, doelModules,
    prijsVoorTier, prijsVoorModule, prijsExtraGebruiker,
  } = opts

  const params: Record<string, string> = {}
  const wijzigingen: string[] = []
  let i = 0

  const huidig = duidItems(huidigeItems)

  // Pakketregel.
  const tierItem = huidigeItems.find(it => duidPrijs(it?.price?.id ?? '').soort === 'tier')
  const nieuwTierPrice = prijsVoorTier(doelTier)
  if (!tierItem) {
    params[`items[${i}][price]`] = nieuwTierPrice
    params[`items[${i}][quantity]`] = '1'
    i++
    wijzigingen.push(`pakket ${doelTier}`)
  } else if (tierItem.price?.id !== nieuwTierPrice) {
    params[`items[${i}][id]`] = tierItem.id
    params[`items[${i}][price]`] = nieuwTierPrice
    params[`items[${i}][quantity]`] = '1'
    i++
    wijzigingen.push(`${huidig.tier ?? 'pakket'} → ${doelTier}`)
  }

  // Extra gebruikers: één regel met een aantal. Op nul betekent de regel weg —
  // een quantity van 0 accepteert Stripe niet als "gratis", dat is een fout.
  const extraItem = huidigeItems.find(it => duidPrijs(it?.price?.id ?? '').soort === 'extra_gebruiker')
  if (doelExtra > 0 && !extraItem) {
    params[`items[${i}][price]`] = prijsExtraGebruiker()
    params[`items[${i}][quantity]`] = String(doelExtra)
    i++
    wijzigingen.push(`${doelExtra} extra gebruiker(s)`)
  } else if (doelExtra > 0 && extraItem && Number(extraItem.quantity ?? 0) !== doelExtra) {
    params[`items[${i}][id]`] = extraItem.id
    params[`items[${i}][quantity]`] = String(doelExtra)
    i++
    wijzigingen.push(`extra gebruikers ${extraItem.quantity} → ${doelExtra}`)
  } else if (doelExtra === 0 && extraItem) {
    params[`items[${i}][id]`] = extraItem.id
    params[`items[${i}][deleted]`] = 'true'
    i++
    wijzigingen.push('extra gebruikers eraf')
  }

  // Modules: erbij wat ontbreekt, eraf wat niet meer gewenst is.
  const huidigeModules = new Set(huidig.modules.map(m => m.module_key))
  for (const key of doelModules) {
    if (huidigeModules.has(key)) continue
    params[`items[${i}][price]`] = prijsVoorModule(key)
    params[`items[${i}][quantity]`] = '1'
    i++
    wijzigingen.push(`module ${key} erbij`)
  }
  for (const m of huidig.modules) {
    if (doelModules.includes(m.module_key)) continue
    params[`items[${i}][id]`] = m.item_id
    params[`items[${i}][deleted]`] = 'true'
    i++
    wijzigingen.push(`module ${m.module_key} eraf`)
  }

  return { params, wijzigingen }
}

// Stripe levert tijdstippen als unix-seconden.
export const naarISO = (sec: unknown): string | null =>
  Number.isFinite(Number(sec)) && Number(sec) > 0
    ? new Date(Number(sec) * 1000).toISOString()
    : null


// ── JAARVERPLICHTING ─────────────────────────────────────────────────────────
// Zet (of hérzet) de subscription_schedule die de 12 maanden vastlegt.
//
// Gedeeld tussen de webhook (bij het afsluiten) en billing-wijzig (bij een
// pakketupgrade, waarbij de looptijd opnieuw begint). Eén implementatie, want
// twee versies van "wat is de looptijd" is precies het soort verschil dat je pas
// merkt als een klant zegt dat hij eerder wilde kunnen opzeggen.
//
// `opnieuw: true` reset: bestaande schedule vrijgeven en een verse aanmaken
// vanaf de lopende factuurperiode. Zonder die vlag is de functie idempotent en
// doet hij niets als er al een schedule staat — Stripe kan
// checkout.session.completed immers opnieuw aanbieden.
export async function zetJaarverplichting(
  admin: any,
  subscriptionId: string,
  opts: { opnieuw?: boolean } = {},
): Promise<string> {
  const opnieuw = opts.opnieuw === true

  const bestaand = await admin.from('subscriptions')
    .select('stripe_schedule_id').eq('stripe_subscription_id', subscriptionId).maybeSingle()
  const oudeSchedule = bestaand.data?.stripe_schedule_id ?? null

  if (oudeSchedule && !opnieuw) return 'schedule bestond al'

  // Bij een reset moet de oude eerst weg. Is hij al released (bv. doordat
  // billing-wijzig hem moest vrijgeven om de items te kunnen wijzigen), dan is
  // dat geen fout maar precies de situatie waar we in willen zijn.
  if (oudeSchedule && opnieuw) {
    try {
      await stripeFetch(`/subscription_schedules/${oudeSchedule}/release`, 'POST', {})
    } catch (e) {
      if (!/released|completed|canceled|not found/i.test((e as Error).message)) throw e
    }
  }

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
    basis[`phases[0][items][${i}][price]`] = typeof it.price === 'string' ? it.price : it.price?.id
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
  return `${opnieuw ? 'looptijd opnieuw gezet' : 'schedule'} ${bijgewerkt.id} · ${JAAR_TERMIJNEN} termijnen t/m ${naarISO(eindeFase)}`
}

// ── MAIL ─────────────────────────────────────────────────────────────────────
// Zelfde route als check-herinneringen: rechtstreeks naar Resend. Dit zijn mails
// VAN BossBase AAN onze klant, dus altijd de BossBase-afzender en -branding —
// niet de branding van het bedrijf zoals bij offerte-/factuurmails.
export async function stuurBossBaseMail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<string | null> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
  if (!apiKey) { console.warn('RESEND_API_KEY niet ingesteld — mail overgeslagen'); return null }
  const payload: Record<string, unknown> = { from: `BossBase <${fromEmail}>`, to, subject, html }
  if (replyTo) payload.reply_to = replyTo
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { console.warn('Resend-fout:', data?.message ?? res.status); return null }
  return data?.id ?? null
}

// Waar de interne melding heen gaat dat er een website-aanvraag ligt.
export const INTERN_ADRES = () => Deno.env.get('BOSSBASE_INTERN_EMAIL') || 'hallo@bossbase.nl'


// ── PORTALCONFIGURATIE VOOR JAARKLANTEN ──────────────────────────────────────
// Het Customer Portal kan een looptijd niet afdwingen (alleen "direct" of "per
// einde factuurperiode", en die is bij ons één maand). Voor jaarklanten binnen
// hun looptijd gebruiken we daarom een aparte configuratie zonder opzeg- en
// wijzigknop, aangemaakt door scripts/stripe-setup-prices.mjs.
//
// We zoeken hem op metadata in plaats van via een secret: dan kloppen script en
// functie per definitie met elkaar, en werkt test net als live zonder dat er een
// variabele vergeten kan worden. STRIPE_PORTAL_CONFIG_JAAR blijft als snelle
// omweg bestaan voor wie de extra API-call wil vermijden.
export const PORTAL_JAAR_KEY = 'bb_portal_jaarklant'

let portalJaarCache: string | null = null

export async function portalConfigJaar(): Promise<string | null> {
  const uitEnv = Deno.env.get('STRIPE_PORTAL_CONFIG_JAAR')
  if (uitEnv) return uitEnv
  if (portalJaarCache) return portalJaarCache

  const lijst = await stripeFetch('/billing_portal/configurations?limit=100&active=true', 'GET')
  const gevonden = (lijst?.data ?? []).find((c: any) => c?.metadata?.bb_key === PORTAL_JAAR_KEY)
  if (!gevonden) return null

  // Alleen cachen als hij ook echt doet wat we ervan verwachten. Staat opzeggen
  // per ongeluk aan, dan is dat geen bruikbare configuratie voor een jaarklant.
  if (gevonden?.features?.subscription_cancel?.enabled) {
    console.warn(`Portalconfiguratie ${gevonden.id} heeft opzeggen AAN staan; niet gebruikt voor jaarklanten.`)
    return null
  }
  portalJaarCache = gevonden.id
  return portalJaarCache
}
