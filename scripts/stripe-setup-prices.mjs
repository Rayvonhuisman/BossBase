#!/usr/bin/env node
// Maakt de producten en prijzen voor de BossBase-abonnementen aan in Stripe, en
// print de env-regels die je daarna moet zetten. Draai dit ZELF met je eigen
// sleutel — hij komt nergens in de code of in een prompt terecht:
//
//     STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup-prices.mjs
//     STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup-prices.mjs --live
//
// Zonder --live weigert het script een live-sleutel, zodat je niet per ongeluk
// in productie aanmaakt.
//
// Idempotent: producten en prijzen krijgen een vaste lookup_key. Bestaat de
// prijs al, dan wordt hij hergebruikt in plaats van gedupliceerd.
//
// Bedragen komen uit src/lib/tiers.js en src/lib/features.js — dezelfde bron als
// de app en de database. Nooit hier hardcoden.

import { TIERS, tierPrice, EXTRA_USER_PRICE, YEARLY_FREE_MONTHS, WELKOM_COUPON_ID } from '../src/lib/tiers.js'
import { MODULES } from '../src/lib/features.js'

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) {
  console.error('STRIPE_SECRET_KEY ontbreekt. Draai:\n  STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup-prices.mjs')
  process.exit(1)
}
const LIVE = process.argv.includes('--live')
if (KEY.startsWith('sk_live') && !LIVE) {
  console.error('Dit is een LIVE-sleutel. Draai bewust met --live als dat de bedoeling is.')
  process.exit(1)
}
console.error(`Modus: ${KEY.startsWith('sk_live') ? 'LIVE' : 'TEST'}\n`)

async function stripe(path, method = 'GET', params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`)
  return data
}

// Zoekt een prijs op lookup_key; maakt hem anders aan onder een product met
// dezelfde sleutel.
async function zorgVoorPrijs({ lookupKey, productNaam, bedrag, omschrijving }) {
  const bestaand = await stripe(`/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1&active=true`)
  if (bestaand.data?.length) {
    console.error(`  = ${lookupKey.padEnd(34)} bestaat al  (${bestaand.data[0].id})`)
    return bestaand.data[0].id
  }

  const producten = await stripe(`/products/search?query=${encodeURIComponent(`metadata['bb_key']:'${lookupKey}'`)}&limit=1`)
  let productId = producten.data?.[0]?.id
  if (!productId) {
    const product = await stripe('/products', 'POST', {
      name: productNaam,
      ...(omschrijving ? { description: omschrijving } : {}),
      'metadata[bb_key]': lookupKey,
    })
    productId = product.id
  }

  const prijs = await stripe('/prices', 'POST', {
    product: productId,
    currency: 'eur',
    unit_amount: String(Math.round(bedrag * 100)),
    'recurring[interval]': 'month',
    // Alle BossBase-prijzen zijn EXCLUSIEF BTW (zo staan ze op de prijspagina);
    // Stripe Tax rekent het juiste tarief er bovenop.
    tax_behavior: 'exclusive',
    lookup_key: lookupKey,
  })
  console.error(`  + ${lookupKey.padEnd(34)} aangemaakt  (${prijs.id})  € ${bedrag}/mnd`)
  return prijs.id
}

const env = {}

console.error('Pakketten (maandelijks terugkerend, excl. BTW):')
for (const t of TIERS) {
  env[`STRIPE_PRICE_${t.id.toUpperCase()}`] = await zorgVoorPrijs({
    lookupKey: `bb_${t.id}_maand`,
    productNaam: `BossBase ${t.label}`,
    bedrag: tierPrice(t.id),
    omschrijving: `BossBase ${t.label} — abonnement per maand`,
  })
}

console.error('\nExtra gebruiker (aantal-gebaseerd):')
env.STRIPE_PRICE_EXTRA_GEBRUIKER = await zorgVoorPrijs({
  lookupKey: 'bb_extra_gebruiker',
  productNaam: 'BossBase extra gebruiker',
  bedrag: EXTRA_USER_PRICE,
  omschrijving: 'Extra gebruiker bovenop de inbegrepen gebruiker',
})

console.error('\nModules:')
for (const m of MODULES) {
  env[`STRIPE_PRICE_MODULE_${m.key.toUpperCase()}`] = await zorgVoorPrijs({
    lookupKey: `bb_module_${m.key}`,
    productNaam: `BossBase ${m.label}`,
    bedrag: m.price,
    omschrijving: `Module: ${m.label}`,
  })
}

// ── WELKOMSTKORTING ──────────────────────────────────────────────────────────
// De "eerste twee maanden gratis" is een KORTING, geen proefperiode: 100% over
// de eerste twee termijnen. Vaste id, dus opnieuw draaien maakt geen tweede
// coupon aan. Bestaat hij al, dan laten we hem met rust — een coupon is in
// Stripe niet aanpasbaar op bedrag/duur.
console.error('\nWelkomstkorting:')
async function zorgVoorCoupon() {
  try {
    const bestaand = await stripe(`/coupons/${encodeURIComponent(WELKOM_COUPON_ID)}`)
    console.error(`  = ${WELKOM_COUPON_ID.padEnd(34)} bestaat al  (${bestaand.percent_off}% × ${bestaand.duration_in_months} mnd)`)
    return bestaand.id
  } catch {
    const coupon = await stripe('/coupons', 'POST', {
      id: WELKOM_COUPON_ID,
      name: `Welkomstactie: eerste ${YEARLY_FREE_MONTHS} maanden gratis`,
      percent_off: '100',
      duration: 'repeating',
      duration_in_months: String(YEARLY_FREE_MONTHS),
      'metadata[bb_key]': WELKOM_COUPON_ID,
    })
    console.error(`  + ${WELKOM_COUPON_ID.padEnd(34)} aangemaakt  (100% × ${YEARLY_FREE_MONTHS} mnd)`)
    return coupon.id
  }
}
await zorgVoorCoupon()

// ── PORTALCONFIGURATIE VOOR JAARKLANTEN ──────────────────────────────────────
// Een jaarabonnement loopt 12 maanden vast. Het Customer Portal kan die looptijd
// niet afdwingen: het kent alleen "direct" of "per einde factuurperiode", en die
// periode is bij ons één maand. Een jaarklant zou daar dus binnen zijn looptijd
// weg kunnen — bewezen in de sandbox.
//
// Daarom een tweede configuratie ZONDER opzeg- en wijzigknop, die billing-portal
// gebruikt voor jaarklanten binnen hun looptijd. Betaalmethode, gegevens en
// facturen blijven gewoon beschikbaar. Opzeggen loopt voor hen via ons eigen
// scherm (billing-cancel), dat de einddatum van de looptijd aanhoudt.
//
// Herkenbaar aan metadata.bb_key — billing-portal zoekt hem daarop op, zodat er
// geen extra secret nodig is en test en live vanzelf hetzelfde werken.
const PORTAL_JAAR_KEY = 'bb_portal_jaarklant'

console.error('\nPortalconfiguratie voor jaarklanten:')
async function zorgVoorPortalConfig() {
  const lijst = await stripe('/billing_portal/configurations?limit=100&active=true')
  const bestaand = (lijst.data || []).find(c => c?.metadata?.bb_key === PORTAL_JAAR_KEY)

  const velden = {
    'metadata[bb_key]': PORTAL_JAAR_KEY,
    'business_profile[headline]': 'BossBase — abonnement beheren',
    // Geen opzegknop: dat is de hele reden van deze configuratie.
    'features[subscription_cancel][enabled]': 'false',
    // Ook niet van pakket wisselen: downgraden binnen de looptijd zou de
    // verplichting alsnog uithollen.
    'features[subscription_update][enabled]': 'false',
    'features[payment_method_update][enabled]': 'true',
    'features[invoice_history][enabled]': 'true',
    'features[customer_update][enabled]': 'true',
    'features[customer_update][allowed_updates][0]': 'email',
    'features[customer_update][allowed_updates][1]': 'address',
    'features[customer_update][allowed_updates][2]': 'phone',
    'features[customer_update][allowed_updates][3]': 'tax_id',
  }

  // Anders dan een coupon is een portalconfiguratie wél bij te werken, dus bij
  // opnieuw draaien zetten we hem gewoon weer in de gewenste staat.
  const config = bestaand
    ? await stripe(`/billing_portal/configurations/${bestaand.id}`, 'POST', velden)
    : await stripe('/billing_portal/configurations', 'POST', velden)

  console.error(`  ${bestaand ? '=' : '+'} ${PORTAL_JAAR_KEY.padEnd(34)} ${bestaand ? 'bijgewerkt' : 'aangemaakt'}  (${config.id})`)
  console.error(`    opzeggen: ${config.features?.subscription_cancel?.enabled ? 'AAN — fout!' : 'uit'} · ` +
                `pakket wijzigen: ${config.features?.subscription_update?.enabled ? 'AAN — fout!' : 'uit'} · ` +
                `betaalmethode: ${config.features?.payment_method_update?.enabled ? 'aan' : 'uit'} · ` +
                `facturen: ${config.features?.invoice_history?.enabled ? 'aan' : 'uit'}`)
  return config.id
}
const portalJaarId = await zorgVoorPortalConfig()

console.error(`
Klaar. Zet deze variabelen als Supabase-secrets:

  supabase secrets set \\`)
const regels = Object.entries(env).map(([k, v]) => `    ${k}=${v}`)
console.log(regels.join(' \\\n'))
console.error(`
Let op — het jaarabonnement heeft GEEN eigen prijs. Dat is dezelfde maandprijs,
waarbij de welkomstactie "eerste twee maanden gratis" wordt toegepast als de
coupon ${WELKOM_COUPON_ID} hierboven (zie billing-checkout). Bewust een korting
en geen proefperiode: het abonnement staat meteen op actief en de klant ziet
nergens "proefversie" staan.

De portalconfiguratie voor jaarklanten (${portalJaarId}) hoef je NIET als secret
te zetten: billing-portal zoekt hem op via metadata.bb_key = "${PORTAL_JAAR_KEY}".
Wil je die lookup toch overslaan, zet dan STRIPE_PORTAL_CONFIG_JAAR=${portalJaarId}.

Vergeet in het Stripe-dashboard niet:
  • Stripe Tax aanzetten (de prijzen zijn exclusief BTW).
  • Een webhook-endpoint naar /functions/v1/billing-webhook met de events
    checkout.session.completed, customer.subscription.created/updated/deleted,
    invoice.payment_succeeded en invoice.payment_failed. De signing secret
    daarvan wordt STRIPE_BILLING_WEBHOOK_SECRET.
  • Het Customer Portal configureren (opzeggen, betaalmethode, facturen).
`)
