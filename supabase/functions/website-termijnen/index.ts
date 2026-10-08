// website-termijnen (verify_jwt=false; alleen met het cron_secret uit de vault)
//
// Elke ochtend: zet de lopende website-regels (upgrade in termijnen, hosting,
// domein) als factuurregel klaar voor de eerstvolgende abonnementsfactuur in
// Stripe. Zie _shared/websiteBetalen.ts voor waarom het factuurregels zijn en
// geen abonnementsitems.
//
// Per regel en per abonnementsperiode hooguit één keer: website_betalingen
// onthoudt voor welk periode-einde hij al klaarstaat, en Stripe krijgt een
// idempotentiesleutel op dezelfde combinatie.
//
// {"droogloop": true} zet niets in Stripe en laat alleen zien wat er zou gebeuren.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { makeAdminClient, isScheduledCall } from '../_shared/scheduledSync.ts'
import { moetFactureren, regelVoorFactuur, zetFactuurregel } from '../_shared/websiteBetalen.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const LOPEND = ['active', 'trialing', 'past_due']

serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* leeg */ }
  if (!isScheduledCall(body)) return json({ error: 'Niet toegestaan' }, 403)
  const droogloop = body?.droogloop === true

  const db = makeAdminClient()
  const { data: regels, error } = await db.from('website_betalingen')
    .select('id, company_id, soort, omschrijving, bedrag, per_keer, interval_maanden, aantal_totaal, aantal_gedaan, laatst_voor_periode, stripe_invoiceitems')
    .eq('wijze', 'abonnement').eq('status', 'loopt')
  if (error) return json({ error: error.message }, 500)

  const uit: { id: string; resultaat: string }[] = []
  for (const r of regels ?? []) {
    try {
      const { data: sub } = await db.from('subscriptions')
        .select('stripe_customer_id, stripe_subscription_id, stripe_status, current_period_end')
        .eq('company_id', r.company_id).maybeSingle()

      if (!sub?.stripe_subscription_id || !LOPEND.includes(sub.stripe_status ?? '')) {
        // Hosting en domein stoppen met het abonnement. Openstaande termijnen
        // van een upgrade niet: die zijn verschuldigd (voorwaarden) en factureren
        // we handmatig. Daarom alleen een notitie, zodat het in de superadmin
        // opvalt.
        if (r.soort === 'upgrade') {
          if (!droogloop) await db.from('website_betalingen').update({ fout: 'Abonnement loopt niet meer; resterende termijnen handmatig factureren.' }).eq('id', r.id)
          uit.push({ id: r.id, resultaat: 'abonnement loopt niet; termijnen handmatig' })
        } else {
          if (!droogloop) await db.from('website_betalingen').update({ status: 'gestopt', fout: 'Abonnement gestopt.' }).eq('id', r.id)
          uit.push({ id: r.id, resultaat: 'gestopt met abonnement' })
        }
        continue
      }
      if (!sub.current_period_end) { uit.push({ id: r.id, resultaat: 'geen periode bekend' }); continue }

      const periodeEind = new Date(sub.current_period_end)
      if (!moetFactureren(r, periodeEind)) { uit.push({ id: r.id, resultaat: 'staat al klaar' }); continue }

      const { centen, omschrijving } = regelVoorFactuur(r)
      if (droogloop) { uit.push({ id: r.id, resultaat: `zou € ${(centen / 100).toFixed(2)} zetten: ${omschrijving}` }); continue }

      const itemId = await zetFactuurregel({
        customer: sub.stripe_customer_id, subscription: sub.stripe_subscription_id,
        centen, omschrijving, betalingId: r.id, periodeEind: sub.current_period_end,
      })
      const gedaan = r.aantal_gedaan + 1
      await db.from('website_betalingen').update({
        aantal_gedaan: gedaan,
        laatst_voor_periode: sub.current_period_end,
        laatst_gefactureerd: new Date().toISOString(),
        stripe_invoiceitems: [...(r.stripe_invoiceitems ?? []), itemId],
        status: r.aantal_totaal != null && gedaan >= r.aantal_totaal ? 'afgerond' : 'loopt',
        fout: null,
      }).eq('id', r.id)
      uit.push({ id: r.id, resultaat: `klaargezet ${itemId}` })
    } catch (e) {
      const fout = (e as Error).message
      if (!droogloop) await db.from('website_betalingen').update({ fout }).eq('id', r.id)
      uit.push({ id: r.id, resultaat: `fout: ${fout}` })
    }
  }
  return json({ droogloop, verwerkt: uit.length, regels: uit })
})
