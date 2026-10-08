// Betalen voor de website, op twee manieren.
//
// EENMALIG MET iDEAL — een Stripe Checkout-sessie in payment-mode op ons eigen
// platform-account, met de Stripe-klant van het abonnement. billing-webhook
// zet de betaling op 'betaald' bij checkout.session.completed (metadata
// soort=website_upgrade).
//
// ALS REGEL OP HET ABONNEMENT — upgrade in 12 termijnen, hosting en domein.
// Bewust geen extra subscription-item:
//  - een jaarabonnement hangt aan een subscription_schedule, en een item
//    toevoegen betekent die schedule vrijgeven en opnieuw zetten (zie
//    billing-wijzig) — met het risico dat de looptijd verschuift;
//  - Stripe staat op één abonnement geen jaarregel naast maandregels toe, en het
//    domein is per jaar;
//  - een item stopt niet vanzelf na 12 termijnen.
// In plaats daarvan zet website-termijnen elke periode een factuurregel
// (invoice item) klaar. Stripe neemt die mee op de eerstvolgende factuur van het
// abonnement. Wat er al gefactureerd is, houdt website_betalingen bij.
import { stripeFetch, stripeSecret, appOrigin } from './stripe.ts'
import { termijnCenten, type Pakket } from './website.ts'

/** Start een iDEAL-betaling en geeft de Checkout-URL terug. */
export async function startUpgradeBetaling(admin: any, o: {
  companyId: string; pakket?: Pakket | null; extras?: Record<string, number> | null;
  soort?: 'upgrade' | 'extra'; omschrijving: string; bedrag: number;
  terug: string; origin: string; betalingId?: string
}): Promise<string> {
  const { data: sub } = await admin.from('subscriptions')
    .select('stripe_customer_id').eq('company_id', o.companyId).maybeSingle()

  // Eén openstaande iDEAL-betaling per bedrijf en pakket. Bestaat hij al, dan
  // hergebruiken we de rij en maken alleen een nieuwe sessie.
  let betalingId = o.betalingId ?? null
  if (!betalingId) {
    const { data: rij, error } = await admin.from('website_betalingen').insert({
      company_id: o.companyId, soort: o.soort ?? 'upgrade', pakket: o.pakket ?? null, extras: o.extras ?? null,
      omschrijving: o.omschrijving, bedrag: o.bedrag, wijze: 'ideal', status: 'open',
    }).select('id').single()
    if (error) throw new Error(`Betaling vastleggen mislukt: ${error.message}`)
    betalingId = rij.id
  }

  const origin = appOrigin(o.origin)
  const params: Record<string, string> = {
    'mode': 'payment',
    'payment_method_types[0]': 'ideal',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(Math.round(o.bedrag * 100)),
    'line_items[0][price_data][tax_behavior]': 'exclusive',
    'line_items[0][price_data][product_data][name]': o.omschrijving,
    'automatic_tax[enabled]': 'true',
    'invoice_creation[enabled]': 'true',
    'metadata[soort]': 'website_upgrade',
    'metadata[company_id]': o.companyId,
    'metadata[betaling_id]': betalingId!,
    'payment_intent_data[metadata][soort]': 'website_upgrade',
    'payment_intent_data[metadata][betaling_id]': betalingId!,
    'success_url': `${origin}${o.terug}${o.terug.includes('?') ? '&' : '?'}betaling=gelukt`,
    'cancel_url': `${origin}${o.terug}${o.terug.includes('?') ? '&' : '?'}betaling=afgebroken`,
  }
  if (sub?.stripe_customer_id) {
    params['customer'] = sub.stripe_customer_id
    params['customer_update[address]'] = 'auto'
  } else {
    params['customer_creation'] = 'always'
    params['billing_address_collection'] = 'required'
  }
  const sessie = await stripeFetch('/checkout/sessions', 'POST', params)
  await admin.from('website_betalingen').update({ stripe_session_id: sessie.id }).eq('id', betalingId)
  return sessie.url
}

/** Legt een regel op het abonnement vast. website-termijnen factureert hem. */
export async function regelOpAbonnement(admin: any, o: {
  companyId: string; soort: 'upgrade' | 'extra' | 'hosting' | 'domein' | 'email'; omschrijving: string;
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
