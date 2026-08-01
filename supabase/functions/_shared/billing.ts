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

// Hoeveel gebruikers zitten er in het pakket zelf (de rest is een extra item).
export const INBEGREPEN_GEBRUIKERS = 1

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

// Stripe levert tijdstippen als unix-seconden.
export const naarISO = (sec: unknown): string | null =>
  Number.isFinite(Number(sec)) && Number(sec) > 0
    ? new Date(Number(sec) * 1000).toISOString()
    : null


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
