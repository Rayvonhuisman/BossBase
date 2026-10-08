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
// Daarna de bewaking van live sites waarvan de hosting stopt (zie onderaan):
// klant mailen bij opzeggen, en 14 dagen na het einde ons laten weten dat de
// site offline moet.
//
// {"droogloop": true} zet niets in Stripe, mailt niet en laat alleen zien wat er
// zou gebeuren.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { makeAdminClient, isScheduledCall } from '../_shared/scheduledSync.ts'
import { moetFactureren, regelVoorFactuur, zetFactuurregel } from '../_shared/websiteBetalen.ts'
import { stripeFetch } from '../_shared/stripe.ts'
import { stuurBossBaseMail } from '../_shared/billing.ts'
import { mailAbonnementStopt, mailIntern, WEBSITE_INTERN } from '../_shared/website.ts'

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
    .select('id, company_id, soort, omschrijving, bedrag, per_keer, interval_maanden, aantal_totaal, aantal_gedaan, laatst_voor_periode, stripe_invoiceitems, stripe_subscription_id')
    .eq('wijze', 'abonnement').eq('status', 'loopt')
  if (error) return json({ error: error.message }, 500)

  const uit: { id: string; resultaat: string }[] = []
  for (const r of regels ?? []) {
    try {
      // Hoort de regel bij een eigen hostingabonnement (domein), dan dat
      // abonnement; anders het BossBase-abonnement.
      let sub: any
      if (r.stripe_subscription_id) {
        const s = await stripeFetch(`/subscriptions/${r.stripe_subscription_id}`, 'GET')
        const eind = s?.items?.data?.[0]?.current_period_end ?? s?.current_period_end
        sub = {
          stripe_customer_id: typeof s?.customer === 'string' ? s.customer : s?.customer?.id,
          stripe_subscription_id: r.stripe_subscription_id,
          stripe_status: s?.status,
          current_period_end: eind ? new Date(Number(eind) * 1000).toISOString() : null,
        }
      } else {
        const { data } = await db.from('subscriptions')
          .select('stripe_customer_id, stripe_subscription_id, stripe_status, current_period_end')
          .eq('company_id', r.company_id).maybeSingle()
        sub = data
      }

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
  const bewaking = await bewaakHosting(db, droogloop)
  return json({ droogloop, verwerkt: uit.length, regels: uit, bewaking })
})

// ── Bewaking: live sites waarvan de hosting stopt ──────────────────────────
// Per live site, zonder eigen hostingabonnement:
//  - het BossBase-abonnement stopt (opgezegd, nog lopend): klant één keer
//    mailen met de keuze om alleen de hosting te houden;
//  - het abonnement (of een eigen hostingabonnement) is gestopt: klant mailen
//    als dat nog niet gebeurde; 14 dagen na het einde (en minstens 7 dagen na
//    die mail) ons mailen dat de site offline moet. De superadmin toont hem dan
//    onder "Actie nodig".
// Loopt het abonnement weer gewoon door, dan vervallen de seintjes.
const DAG = 86400_000
const LOPEND_SUB = ['active', 'trialing', 'past_due']

async function bewaakHosting(db: any, droogloop: boolean): Promise<string[]> {
  const uit: string[] = []
  const { data: sites } = await db.from('website_aanvragen')
    .select('id, company_id, domein, domein_via_ons, email_aantal, hosting_einde_op, hosting_mail_op, offline_melding_op')
    .eq('status', 'live')
  for (const a of sites ?? []) {
    try {
      const { data: los } = await db.from('website_betalingen').select('id')
        .eq('company_id', a.company_id).eq('soort', 'hosting').eq('wijze', 'los').eq('status', 'loopt').limit(1)
      if (los?.length) continue

      const { data: sub } = await db.from('subscriptions')
        .select('status, stripe_subscription_id, stripe_status, cancel_at_period_end, stopt_op, current_period_end, cancelled_at')
        .eq('company_id', a.company_id).maybeSingle()
      const loopt = Boolean(sub?.stripe_subscription_id) && LOPEND_SUB.includes(sub?.stripe_status ?? '')
      const stopt = loopt && (sub?.cancel_at_period_end || sub?.stopt_op)
      const gestopt = !loopt && (sub?.status === 'opgezegd' || sub?.stripe_status === 'canceled' || Boolean(a.hosting_einde_op))
      const { data: c } = await db.from('companies').select('id, name, email, phone').eq('id', a.company_id).maybeSingle()
      const nu = Date.now()

      if (loopt && !stopt) {
        // Weer gewoon lopend (bijvoorbeeld opzegging ingetrokken).
        if (a.hosting_mail_op || a.hosting_einde_op || a.offline_melding_op) {
          if (!droogloop) await db.from('website_aanvragen').update({ hosting_mail_op: null, hosting_einde_op: null, offline_melding_op: null }).eq('id', a.id)
          uit.push(`${a.company_id}: abonnement loopt weer, seintjes gewist`)
        }
        continue
      }
      if (!stopt && !gestopt) continue

      const einde = a.hosting_einde_op ?? sub?.stopt_op ?? (stopt ? sub?.current_period_end : null) ?? sub?.cancelled_at ?? new Date(nu).toISOString()
      const mailOp = a.hosting_mail_op ? new Date(a.hosting_mail_op).getTime() : nu
      const offlineOp = new Date(Math.max(new Date(einde).getTime() + 14 * DAG, mailOp + 7 * DAG)).toISOString()

      if (!a.hosting_mail_op) {
        if (c?.email && !droogloop) {
          const m = mailAbonnementStopt({
            bedrijfsnaam: c.name, einde, offlineOp, gestopt,
            domein: a.domein_via_ons ? a.domein : null, emailAantal: Number(a.email_aantal) || 0,
          })
          await stuurBossBaseMail(c.email, m.subject, m.html, WEBSITE_INTERN, undefined, 'website_klant')
        }
        if (!droogloop) await db.from('website_aanvragen').update({ hosting_mail_op: new Date(nu).toISOString(), hosting_einde_op: einde }).eq('id', a.id)
        uit.push(`${a.company_id}: klant gemaild (${gestopt ? 'gestopt' : 'stopt'} op ${einde.slice(0, 10)})`)
        continue
      }

      if (gestopt && nu >= new Date(offlineOp).getTime() && !a.offline_melding_op) {
        if (!droogloop) {
          const i = mailIntern({
            onderwerp: `Website offline halen: ${c?.name ?? a.company_id}`,
            kop: 'Website offline halen',
            bedrijf: c ?? { id: a.company_id },
            regels: [
              ['Hosting gestopt op', einde.slice(0, 10)],
              ['Klant gemaild op', String(a.hosting_mail_op).slice(0, 10)],
              ['Domein via ons', a.domein_via_ons ? `${a.domein} (op verzoek overzetten)` : 'nee'],
            ],
            tekst: 'De klant heeft binnen 14 dagen na het einde geen hosting afgesloten. Haal de site offline en zet de status in de superadmin op Geannuleerd.',
          })
          await stuurBossBaseMail(WEBSITE_INTERN, i.subject, i.html, c?.email ?? undefined, undefined, 'website_intern')
          await db.from('website_aanvragen').update({ offline_melding_op: new Date(nu).toISOString() }).eq('id', a.id)
        }
        uit.push(`${a.company_id}: offline-melding naar ons`)
      }
    } catch (e) {
      uit.push(`${a.company_id}: fout ${(e as Error).message}`)
    }
  }
  return uit
}
