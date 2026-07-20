// Minimale Stripe REST-helper voor de Connect-integratie. Stripe verwacht
// application/x-www-form-urlencoded bodies. De platform secret key blijft
// UITSLUITEND hier server-side (edge function env), nooit richting de frontend.

const STRIPE_API = 'https://api.stripe.com/v1'
const STRIPE_API_BASE = 'https://api.stripe.com'

export function stripeSecret(): string {
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  if (!key) throw new Error('STRIPE_SECRET_KEY niet geconfigureerd')
  return key
}

// De Accounts v2-endpoints vereisen een expliciete Stripe-Version header.
// Override via env (STRIPE_API_VERSION) zodat een versiebump door Stripe geen
// code-wijziging vergt.
function stripeApiVersion(): string {
  return Deno.env.get('STRIPE_API_VERSION') || '2026-06-24.dahlia'
}

export function returnUrl(): string {
  return Deno.env.get('STRIPE_CONNECT_RETURN_URL') || ''
}

export function refreshUrl(): string {
  return Deno.env.get('STRIPE_CONNECT_REFRESH_URL') || ''
}

// App-origin voor de publieke pagina's (/betaal, /betaald, ...). Volgt de
// aanroepende origin als die vertrouwd is (productie-origin uit de env, of een
// localhost-dev-origin); anders de productie-origin. Whitelist tegen open-redirect.
export function appOrigin(reqOrigin: string): string {
  let prod = 'https://bossbase.nl'
  try { const u = Deno.env.get('STRIPE_PAYMENT_SUCCESS_URL'); if (u) prod = new URL(u).origin } catch { /* fallback */ }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin)
  return (reqOrigin && (reqOrigin === prod || isLocal)) ? reqOrigin : prod
}

// Gedeelde sessie-aanmaak: maakt een iDEAL Checkout Session OP het account van
// het bedrijf (direct charge), schrijft de betaalgegevens op de factuur en geeft
// de sessie-URL terug. Eén bron voor zowel de tussenpagina (stripe-pay-link) als
// eventuele directe aanroepers — geen parallel systeem. De success/cancel-URL's
// dragen het betaaltoken zodat de bedankpagina de branding kan tonen.
export async function createFactuurCheckoutSession(
  admin: any,
  opts: { factuur: { id: string; nummer: string; totaal_incl: number }, companyId: string, stripeAccountId: string, token: string, reqOrigin: string },
): Promise<{ url: string; sessionId: string }> {
  const { factuur, companyId, stripeAccountId, token, reqOrigin } = opts
  const origin = appOrigin(reqOrigin)
  const bedragCenten = Math.round(Number(factuur.totaal_incl || 0) * 100)

  const params: Record<string, string> = {
    'mode': 'payment',
    'payment_method_types[0]': 'ideal',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(bedragCenten),
    'line_items[0][price_data][product_data][name]': `Factuur ${factuur.nummer}`,
    'metadata[factuur_id]': String(factuur.id),
    'metadata[company_id]': String(companyId),
    // Metadata óók op de PaymentIntent, zodat payment_intent.succeeded de factuur kent.
    'payment_intent_data[metadata][factuur_id]': String(factuur.id),
    'payment_intent_data[metadata][company_id]': String(companyId),
    'success_url': `${origin}/betaald?token=${token}&session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': `${origin}/betaling-geannuleerd?token=${token}`,
  }

  const session = await stripeFetch('/checkout/sessions', 'POST', params, stripeAccountId)

  await admin.from('facturen').update({
    stripe_checkout_session_id: session.id,
    stripe_payment_url: session.url,
    stripe_payment_status: 'open',
  }).eq('id', factuur.id)

  return { url: session.url as string, sessionId: session.id as string }
}

// v2-variant van stripeFetch: JSON-body i.p.v. form-encoding, mét de vereiste
// Stripe-Version header. Gebruikt voor de Accounts v2 API (/v2/core/...).
export async function stripeV2Fetch(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown,
) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${stripeSecret()}`,
    'Content-Type': 'application/json',
    'Stripe-Version': stripeApiVersion(),
  }
  const init: RequestInit = { method, headers }
  if (body !== undefined) init.body = JSON.stringify(body)

  const res = await fetch(`${STRIPE_API_BASE}${path}`, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || `Stripe ${res.status}`)
  }
  return data
}

// Maakt een connected account via de Accounts v2 API (POST /v2/core/accounts) met
// exact het verantwoordelijkheidsmodel van een klassiek "Standard"-account:
//   • dashboard: 'full'           → eigen Stripe-dashboard; Stripe verzamelt de KYC
//   • fees_collector:   'stripe'  → het BEDRIJF betaalt de Stripe-kosten
//   • losses_collector: 'stripe'  → het BEDRIJF draagt disputes/refunds/chargebacks
// Zo blijft BossBase volledig buiten de geldstroom en aansprakelijkheid, identiek
// aan Standard + direct charges. Direct charges regelen we per betaling via de
// Stripe-Account header; hier vragen we alleen de merchant-capabilities aan die we
// gebruiken (kaart + iDEAL). Het teruggegeven id blijft `acct_…`, dus de betaallink
// (Stripe-Account header) en de webhook (account-veld) werken ongewijzigd door.
export async function createStandardConnectedAccountV2(opts: { email?: string | null }) {
  const body: Record<string, unknown> = {
    dashboard: 'full',
    identity: { country: 'nl' },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
          ideal_payments: { requested: true },
        },
      },
    },
    defaults: {
      currency: 'eur',
      responsibilities: {
        fees_collector: 'stripe',
        losses_collector: 'stripe',
      },
    },
    include: ['configuration.merchant', 'identity'],
  }
  if (opts.email) body.contact_email = opts.email
  return await stripeV2Fetch('/v2/core/accounts', 'POST', body)
}

// Eén plek voor alle Stripe-calls. Gooit met de Stripe-foutmelding bij een
// niet-2xx respons zodat de aanroeper een bruikbaar bericht kan tonen.
// stripeAccount (acct_...) → zet de Stripe-Account header voor een actie OP het
// connected account van het bedrijf (direct charge).
export async function stripeFetch(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  params?: Record<string, string>,
  stripeAccount?: string,
) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${stripeSecret()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount
  const init: RequestInit = { method, headers }
  if (params) init.body = new URLSearchParams(params).toString()

  const res = await fetch(`${STRIPE_API}${path}`, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe ${res.status}`)
  }
  return data
}

// Verifieert de Stripe-webhook-signature (header `t=...,v1=...`): HMAC-SHA256 van
// `${t}.${rawBody}` met de webhook-secret. Constant-time vergelijk + replay-check
// op de timestamp. Meerdere v1's (secret-rotatie) worden ondersteund.
export async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSec = 300,
): Promise<boolean> {
  if (!payload || !sigHeader || !secret) return false

  let t = ''
  const v1s: string[] = []
  for (const part of sigHeader.split(',')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    const k = part.slice(0, i).trim()
    const val = part.slice(i + 1).trim()
    if (k === 't') t = val
    else if (k === 'v1') v1s.push(val)
  }
  if (!t || v1s.length === 0) return false

  const ts = Number(t)
  if (Number.isFinite(ts) && toleranceSec > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSec) {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`))
  const expected = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('')

  return v1s.some(v1 => {
    if (v1.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i)
    return diff === 0
  })
}
