// Facturen uit Stripe bewaren in stripe_facturen. Gebruikt door de
// billing-webhook (bij elk factuur-event) en door de superadmin (eenmalig alles
// ophalen wat er al in Stripe staat).
//
// Waarom zelf bewaren: de superadmin moet per klant kunnen tonen wat er betaald
// is en wat er misging, en de omzet van maanden vóór de momentopnames kan
// alleen uit facturen worden afgeleid. Stripe bij elke paginaweergave
// bevragen is traag en raakt de limieten.
import { stripeFetch, duidPrijs } from './billing.ts'

const sec = (s: unknown) => (Number.isFinite(Number(s)) && Number(s) > 0 ? new Date(Number(s) * 1000).toISOString() : null)
const euro = (c: unknown) => (Number.isFinite(Number(c)) ? Math.round(Number(c)) / 100 : null)

// De prijs van een factuurregel, in oude en nieuwe API-versies.
function prijsVanRegel(r: any): string | null {
  return r?.price?.id ?? r?.pricing?.price_details?.price ?? r?.plan?.id ?? null
}
function isProratie(r: any): boolean {
  return r?.proration === true
    || r?.parent?.subscription_item_details?.proration === true
    || r?.parent?.invoice_item_details?.proration === true
}

function betaalstatus(inv: any, eventType?: string): string {
  if (inv?.status === 'paid') return 'betaald'
  if (inv?.status === 'draft') return 'concept'
  if (inv?.status === 'void' || inv?.status === 'uncollectible') return 'vervallen'
  if (eventType === 'invoice.payment_failed') return 'mislukt'
  if (inv?.status === 'open' && Number(inv?.attempt_count) > 0 && !inv?.paid) return 'mislukt'
  return 'open'
}

// Bij welk bedrijf hoort deze factuur? Eerst onze eigen metadata, dan de
// koppeling via de Stripe-klant of het abonnement.
async function bedrijfVan(admin: any, inv: any, subId: string | null): Promise<string | null> {
  const meta = inv?.parent?.subscription_details?.metadata?.company_id
    ?? inv?.subscription_details?.metadata?.company_id
    ?? inv?.metadata?.company_id
  if (meta) return String(meta)
  if (subId) {
    const { data: s } = await admin.from('subscriptions').select('company_id').eq('stripe_subscription_id', subId).maybeSingle()
    if (s?.company_id) return s.company_id
    const { data: w } = await admin.from('website_betalingen').select('company_id').eq('stripe_subscription_id', subId).limit(1).maybeSingle()
    if (w?.company_id) return w.company_id
  }
  const klant = typeof inv?.customer === 'string' ? inv.customer : inv?.customer?.id
  if (klant) {
    const { data: s } = await admin.from('subscriptions').select('company_id').eq('stripe_customer_id', klant).maybeSingle()
    if (s?.company_id) return s.company_id
  }
  return null
}

// Waarom mislukte de betaling? Stripe zet de reden op de betaling, niet op de
// factuur. Kost één extra verzoek, alleen bij een mislukte factuur.
async function foutVan(inv: any): Promise<string | null> {
  try {
    const pi = typeof inv?.payment_intent === 'string' ? inv.payment_intent : null
    if (pi) {
      const p = await stripeFetch(`/payment_intents/${pi}`, 'GET')
      return p?.last_payment_error?.message ?? null
    }
    const lijst = await stripeFetch(`/invoice_payments?invoice=${inv.id}&limit=1`, 'GET')
    const pid = lijst?.data?.[0]?.payment?.payment_intent
    if (pid) {
      const p = await stripeFetch(`/payment_intents/${pid}`, 'GET')
      return p?.last_payment_error?.message ?? null
    }
  } catch { /* geen reden te vinden: dan alleen "mislukt" */ }
  return null
}

export async function bewaarFactuur(admin: any, inv: any, eventType?: string): Promise<string> {
  if (!inv?.id || !String(inv.id).startsWith('in_')) return 'geen factuur'
  const subId: string | null =
    (typeof inv.subscription === 'string' ? inv.subscription : null)
    ?? inv?.parent?.subscription_details?.subscription
    ?? inv?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription
    ?? null

  const regels = (inv?.lines?.data ?? []).map((r: any) => {
    const prijs = prijsVanRegel(r)
    const betekenis = prijs ? duidPrijs(prijs) : { soort: 'onbekend' }
    return {
      omschrijving: r?.description ?? null,
      bedrag: euro(r?.amount),
      aantal: Number(r?.quantity ?? 1),
      prijs,
      soort: (betekenis as any).soort ?? 'onbekend',
      tier: (betekenis as any).tier ?? null,
      module: (betekenis as any).moduleKey ?? null,
      proratie: isProratie(r),
      periodeStart: sec(r?.period?.start),
      periodeEind: sec(r?.period?.end),
    }
  })
  const heeftPakket = regels.some((r: any) => r.soort === 'tier' || r.soort === 'extra_gebruiker' || r.soort === 'module')
  const metaSoort = inv?.parent?.subscription_details?.metadata?.soort ?? inv?.metadata?.soort ?? ''
  const soort = heeftPakket ? 'abonnement' : String(metaSoort).startsWith('website') || regels.some((r: any) => /website|hosting|domein|e-mail/i.test(r.omschrijving ?? '')) ? 'website' : 'overig'

  const status = betaalstatus(inv, eventType)
  const companyId = await bedrijfVan(admin, inv, subId)
  const rij: Record<string, unknown> = {
    stripe_invoice_id: inv.id,
    company_id: companyId,
    stripe_customer_id: typeof inv.customer === 'string' ? inv.customer : inv?.customer?.id ?? null,
    stripe_subscription_id: subId,
    nummer: inv.number ?? null,
    stripe_status: inv.status ?? null,
    betaalstatus: status,
    soort,
    omschrijving: regels.find((r: any) => !r.proratie)?.omschrijving ?? regels[0]?.omschrijving ?? null,
    bedrag: euro(inv.total ?? inv.amount_due),
    bedrag_excl: euro(inv.total_excluding_tax ?? inv.subtotal),
    valuta: inv.currency ?? null,
    regels,
    periode_start: sec(inv.period_start),
    periode_eind: sec(inv.period_end),
    factuurdatum: sec(inv.created),
    betaald_op: sec(inv?.status_transitions?.paid_at),
    pogingen: Number.isFinite(Number(inv.attempt_count)) ? Number(inv.attempt_count) : null,
    volgende_poging: sec(inv.next_payment_attempt),
    url: inv.hosted_invoice_url ?? null,
    pdf: inv.invoice_pdf ?? null,
    bijgewerkt_op: new Date().toISOString(),
  }
  if (status === 'mislukt') rij.fout = (await foutVan(inv)) ?? 'Betaling mislukt'
  else if (status === 'betaald') rij.fout = null

  const { error } = await admin.from('stripe_facturen').upsert(rij, { onConflict: 'stripe_invoice_id' })
  if (error) throw new Error(error.message)
  return `factuur ${inv.number ?? inv.id} bewaard (${status})`
}

// Alle facturen uit Stripe ophalen en bewaren. Leest alleen; verandert niets
// in Stripe.
export async function haalAlleFacturen(admin: any, maxPaginas = 50): Promise<{ aantal: number; fouten: number }> {
  let na: string | null = null
  let aantal = 0
  let fouten = 0
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const q = `/invoices?limit=100${na ? `&starting_after=${na}` : ''}`
    const lijst = await stripeFetch(q, 'GET')
    for (const inv of lijst?.data ?? []) {
      // Regels kunnen afgekapt zijn (meer dan 10): dan los ophalen.
      let volledig = inv
      if (inv?.lines?.has_more) {
        try { volledig = await stripeFetch(`/invoices/${inv.id}?expand[]=lines`, 'GET') } catch { /* dan met de eerste regels */ }
      }
      try { await bewaarFactuur(admin, volledig); aantal++ } catch { fouten++ }
    }
    if (!lijst?.has_more || !lijst?.data?.length) break
    na = lijst.data[lijst.data.length - 1].id
  }
  return { aantal, fouten }
}

// Omzet per maand afleiden uit bewaarde facturen, voor maanden waarvoor nog
// geen momentopname bestaat. Per bedrijf per maand: de vaste prijs van de
// pakket-, gebruikers- en moduleregels (zonder proratie en vóór korting),
// omgerekend naar één maand. Schrijft alleen waar nog niets staat.
export async function reconstrueerOmzet(admin: any): Promise<number> {
  const { data: eerste } = await admin.from('omzet_momentopnames')
    .select('maand').eq('bron', 'momentopname').order('maand').limit(1).maybeSingle()
  const grens = eerste?.maand ? new Date(eerste.maand + 'T00:00:00Z') : new Date()

  const { data: facturen } = await admin.from('stripe_facturen')
    .select('company_id, regels, betaalstatus')
    .eq('soort', 'abonnement').not('company_id', 'is', null)
    .in('betaalstatus', ['betaald', 'open', 'mislukt'])

  const perMaand = new Map<string, { mrr: number; plan: string | null }>()
  for (const f of facturen ?? []) {
    for (const r of f.regels ?? []) {
      if (r.proratie || !r.periodeStart || !r.periodeEind) continue
      if (!['tier', 'extra_gebruiker', 'module'].includes(r.soort)) continue
      const start = new Date(r.periodeStart)
      const eind = new Date(r.periodeEind)
      const maanden = Math.max(1, Math.round((eind.getTime() - start.getTime()) / (30.44 * 86400000)))
      // Vaste prijs: het regelbedrag vóór korting. Bij een gratis maand (coupon)
      // staat het bedrag van de regel nog op de volle prijs; korting staat apart.
      const perMaandBedrag = Number(r.bedrag ?? 0) / maanden
      for (let i = 0; i < maanden; i++) {
        const m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
        if (m >= grens) break
        const sleutel = `${m.toISOString().slice(0, 10)}|${f.company_id}`
        const huidig = perMaand.get(sleutel) ?? { mrr: 0, plan: null }
        huidig.mrr += perMaandBedrag
        if (r.tier) huidig.plan = r.tier
        perMaand.set(sleutel, huidig)
      }
    }
  }

  let geschreven = 0
  for (const [sleutel, w] of perMaand) {
    const [maand, companyId] = sleutel.split('|')
    const { error, count } = await admin.from('omzet_momentopnames').upsert({
      maand, company_id: companyId, plan: w.plan, status: 'actief',
      mrr: Math.round(w.mrr * 100) / 100, bron: 'stripe',
    }, { onConflict: 'maand,company_id', ignoreDuplicates: true, count: 'exact' })
    if (!error) geschreven += count ?? 0
  }
  return geschreven
}
