// Betalen voor de website.
//
// UPGRADE EN EXTRA'S — altijd via Stripe Checkout op ons eigen platform-account,
// met precies dezelfde klant, betaalmethodes en instellingen als de checkout van
// het BossBase-abonnement (stripeKlantVoorBedrijf en checkoutInstellingen in
// _shared/billing.ts). Twee wijzen:
//  - eenmalig ('ideal'): payment-mode;
//  - per maand ('termijnen'): subscription-mode, een eigen abonnement van
//    TERMIJNEN maandtermijnen. De eerste wordt meteen afgerekend; billing-webhook
//    zet daarna cancel_at, zodat het na de laatste termijn vanzelf stopt.
// Pas als Stripe meldt dat er betaald is, telt het (billing-webhook →
// verwerkWebsiteBetaling). Bij de intake staat de hele intake als concept in
// `gegevens` en wordt hij pas dan ingediend.
//
// DOORLOPENDE REGELS — hosting, domein en e-mail gaan als regel op het
// BossBase-abonnement (regelOpAbonnement hieronder). Bewust geen extra
// subscription-item: een jaarabonnement hangt aan een subscription_schedule, en
// Stripe staat geen jaarregel naast maandregels toe. website-termijnen zet elke
// periode een factuurregel (invoice item) klaar voor de eerstvolgende factuur.
import { stripeFetch, stripeSecret, appOrigin } from './stripe.ts'
import { stripeKlantVoorBedrijf, checkoutInstellingen } from './billing.ts'
import { termijnCenten, TERMIJNEN, type Pakket } from './website.ts'

/** Bedrag per maandtermijn in centen. */
export const termijnBedragCenten = (bedrag: number) => Math.round((bedrag * 100) / TERMIJNEN)

/**
 * Start een betaling via Stripe Checkout en geeft de URL terug. Een eerdere
 * openstaande Checkout van dit bedrijf voor dezelfde soort laten we verlopen,
 * zodat er nooit twee tegelijk betaald kunnen worden.
 */
export async function startBetaling(admin: any, o: {
  companyId: string; soort: 'upgrade' | 'extra'; wijze: 'ideal' | 'termijnen';
  pakket?: Pakket | null; extras?: Record<string, number> | null; gegevens?: unknown;
  omschrijving: string; bedrag: number;
  gelukt: string; afgebroken: string; origin: string; betalingId?: string
}): Promise<string> {
  // Oude openstaande sessies van dit bedrijf (zelfde soort) laten verlopen.
  const { data: open } = await admin.from('website_betalingen')
    .select('id, stripe_session_id').eq('company_id', o.companyId).eq('soort', o.soort).eq('status', 'open')
  for (const b of open ?? []) {
    if (b.id === o.betalingId) continue
    if (b.stripe_session_id) {
      try { await stripeFetch(`/checkout/sessions/${b.stripe_session_id}/expire`, 'POST', {}) } catch { /* al verlopen of afgerond */ }
    }
    await admin.from('website_betalingen').update({ status: 'vervallen' }).eq('id', b.id).eq('status', 'open')
  }

  let betalingId = o.betalingId ?? null
  if (!betalingId) {
    const { data: rij, error } = await admin.from('website_betalingen').insert({
      company_id: o.companyId, soort: o.soort, pakket: o.pakket ?? null, extras: o.extras ?? null,
      gegevens: o.gegevens ?? null, omschrijving: o.omschrijving, bedrag: o.bedrag,
      wijze: o.wijze, status: 'open',
      per_keer: o.wijze === 'termijnen' ? termijnBedragCenten(o.bedrag) / 100 : null,
      interval_maanden: o.wijze === 'termijnen' ? 1 : null,
      aantal_totaal: o.wijze === 'termijnen' ? TERMIJNEN : null,
    }).select('id').single()
    if (error) throw new Error(`Betaling vastleggen mislukt: ${error.message}`)
    betalingId = rij.id
  }

  const origin = appOrigin(o.origin)
  const metaSoort = o.wijze === 'termijnen' ? 'website_termijnen' : 'website_upgrade'
  const customerId = await stripeKlantVoorBedrijf(admin, o.companyId)
  const params: Record<string, string> = {
    ...checkoutInstellingen(customerId, o.wijze === 'termijnen' ? 'subscription' : 'payment'),
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][tax_behavior]': 'exclusive',
    'line_items[0][price_data][product_data][name]': o.omschrijving,
    'metadata[soort]': metaSoort,
    'metadata[company_id]': o.companyId,
    'metadata[betaling_id]': betalingId!,
    'success_url': `${origin}${o.gelukt}`,
    'cancel_url': `${origin}${o.afgebroken}`,
  }
  if (o.wijze === 'termijnen') {
    params['line_items[0][price_data][unit_amount]'] = String(termijnBedragCenten(o.bedrag))
    params['line_items[0][price_data][recurring][interval]'] = 'month'
    params['line_items[0][price_data][product_data][name]'] = `${o.omschrijving} (${TERMIJNEN} maandtermijnen)`
    // Op het abonnement zelf, zodat ook latere facturen bij de betaling te
    // herleiden zijn, en zodat billing-webhook het niet voor het
    // BossBase-abonnement aanziet.
    params['subscription_data[metadata][soort]'] = metaSoort
    params['subscription_data[metadata][company_id]'] = o.companyId
    params['subscription_data[metadata][betaling_id]'] = betalingId!
  } else {
    params['line_items[0][price_data][unit_amount]'] = String(Math.round(o.bedrag * 100))
    params['invoice_creation[enabled]'] = 'true'
    params['payment_intent_data[metadata][soort]'] = metaSoort
    params['payment_intent_data[metadata][betaling_id]'] = betalingId!
  }
  const sessie = await stripeFetch('/checkout/sessions', 'POST', params)
  await admin.from('website_betalingen').update({ stripe_session_id: sessie.id, status: 'open' }).eq('id', betalingId)
  return sessie.url
}

/** Telt `maanden` kalendermaanden op bij een unix-tijd (seconden). */
export function plusMaanden(sec: number, maanden: number): number {
  const d = new Date(sec * 1000)
  const doel = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + maanden, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()))
  return Math.floor(doel.getTime() / 1000)
}

/** Legt een regel op het abonnement vast. website-termijnen factureert hem. */
export async function regelOpAbonnement(admin: any, o: {
  companyId: string; soort: 'hosting' | 'domein' | 'email'; omschrijving: string;
  bedrag: number; pakket?: Pakket | null; extras?: Record<string, number> | null;
  termijnen?: number | null; intervalMaanden?: number
}): Promise<string> {
  const { data: sub } = await admin.from('subscriptions')
    .select('stripe_subscription_id, stripe_status').eq('company_id', o.companyId).maybeSingle()
  if (!sub?.stripe_subscription_id || !['active', 'trialing', 'past_due'].includes(sub.stripe_status ?? '')) {
    throw new Error('Er loopt geen abonnement waar we dit aan kunnen toevoegen.')
  }
  const termijnen = o.termijnen ?? null
  const { data, error } = await admin.from('website_betalingen').insert({
    company_id: o.companyId, soort: o.soort, pakket: o.pakket ?? null, extras: o.extras ?? null, omschrijving: o.omschrijving,
    bedrag: o.bedrag, wijze: 'abonnement', status: 'loopt',
    per_keer: termijnen ? Math.round((o.bedrag / termijnen) * 100) / 100 : o.bedrag,
    interval_maanden: o.intervalMaanden ?? 1,
    aantal_totaal: termijnen,
    start_op: new Date().toISOString(),
  }).select('id').single()
  if (error) throw new Error(`Regel vastleggen mislukt: ${error.message}`)
  return data.id
}

// ── Factureren (website-termijnen) ──────────────────────────────────────────

const MAAND = 30.44 * 86400_000

/**
 * Moet deze regel nu op de factuur? `periodeEind` is het einde van de lopende
 * abonnementsperiode: de factuur op dat moment is de eerstvolgende.
 */
export function moetFactureren(r: { laatst_voor_periode: string | null; interval_maanden: number | null; aantal_totaal: number | null; aantal_gedaan: number }, periodeEind: Date): boolean {
  if (r.aantal_totaal != null && r.aantal_gedaan >= r.aantal_totaal) return false
  if (!r.laatst_voor_periode) return true
  const vorige = new Date(r.laatst_voor_periode)
  if (vorige.getTime() >= periodeEind.getTime()) return false
  // Per jaar: pas weer als er ±12 maanden tussen zitten. Een dag speling, want
  // maandgrenzen in Stripe zijn kalendermaanden.
  const interval = Math.max(1, r.interval_maanden ?? 1)
  return periodeEind.getTime() - vorige.getTime() >= interval * MAAND - 3 * 86400_000
}

/** Zet één regel klaar voor de eerstvolgende factuur van het abonnement. */
export async function zetFactuurregel(o: {
  customer: string; subscription: string; centen: number; omschrijving: string;
  betalingId: string; periodeEind: string
}): Promise<string> {
  // Idempotent per regel en periode: draait de cron twee keer, of loopt hij
  // vast na de Stripe-aanroep maar vóór het bijwerken van de rij, dan maakt
  // Stripe geen tweede regel.
  const res = await fetch('https://api.stripe.com/v1/invoiceitems', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeSecret()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `website-${o.betalingId}-${o.periodeEind}`,
    },
    body: new URLSearchParams({
      customer: o.customer,
      subscription: o.subscription,
      currency: 'eur',
      amount: String(o.centen),
      description: o.omschrijving,
      tax_behavior: 'exclusive',
      'metadata[website_betaling_id]': o.betalingId,
    }).toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`)
  return data.id
}

/** Bedrag in centen voor de volgende keer, en de tekst op de factuur. */
export function regelVoorFactuur(r: { soort: string; omschrijving: string; bedrag: number; per_keer: number | null; aantal_totaal: number | null; aantal_gedaan: number }): { centen: number; omschrijving: string } {
  if (r.aantal_totaal) {
    return {
      centen: termijnCenten(Number(r.bedrag), r.aantal_gedaan, r.aantal_totaal),
      omschrijving: `${r.omschrijving}, termijn ${r.aantal_gedaan + 1} van ${r.aantal_totaal}`,
    }
  }
  return { centen: Math.round(Number(r.per_keer ?? r.bedrag) * 100), omschrijving: r.omschrijving }
}
