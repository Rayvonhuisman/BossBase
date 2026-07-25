// stripe-webhook (verify_jwt=false — publiek, Stripe roept dit aan)
// Verifieert de Stripe-signature (STRIPE_WEBHOOK_SECRET) en verwerkt:
//   • checkout.session.completed / payment_intent.succeeded → factuur op betaald
//     via de gedeelde, idempotente route mark_factuur_betaald + boekhoud-sync.
//   • account.updated → stripe_connections bijwerken (koppelstatus actueel).
//   • account.application.deauthorized → koppeling op inactief.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyStripeSignature } from '../_shared/stripe.ts'
import { mailTemplate } from '../_shared/mailTemplate.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? ''
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

  // Signature verifiëren op de RUWE body (JSON.parse pas daarna).
  const payload = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  if (!webhookSecret) return json({ error: 'STRIPE_WEBHOOK_SECRET niet geconfigureerd' }, 500)
  const valid = await verifyStripeSignature(payload, sig, webhookSecret)
  if (!valid) return new Response('invalid signature', { status: 400, headers: CORS })

  let event: any
  try { event = JSON.parse(payload) } catch { return new Response('invalid payload', { status: 400, headers: CORS }) }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  try {
    const type: string = event.type
    const obj = event?.data?.object ?? {}

    // ── Betaling geslaagd → factuur op betaald ──────────────────────────────────
    if (type === 'checkout.session.completed' || type === 'payment_intent.succeeded') {
      const factuurId = obj?.metadata?.factuur_id
      const paymentIntent = type === 'checkout.session.completed'
        ? (typeof obj.payment_intent === 'string' ? obj.payment_intent : null)
        : (obj.id ?? null)

      // Het connected account dat dit event produceerde (direct charges op het
      // gekoppelde account). Staat top-level op het event, niet in data.object.
      const eventAccount: string | null = event.account ?? null

      // Het DAADWERKELIJK betaalde bedrag in centen, uit het Stripe-event zelf
      // (nooit uit de client/metadata).
      const paidCents: number | null =
        type === 'checkout.session.completed'
          ? (Number.isInteger(obj?.amount_total) ? obj.amount_total : null)
          : (Number.isInteger(obj?.amount_received) ? obj.amount_received
             : (Number.isInteger(obj?.amount) ? obj.amount : null))
      const paidCurrency: string = String(obj?.currency ?? '').toLowerCase()
      // Bij Checkout kan een sessie "completed" zijn zonder dat er betaald is
      // (async/uitgestelde methodes). Alleen echt betaalde sessies tellen.
      const sessionPaid = type !== 'checkout.session.completed'
        || obj?.payment_status === undefined
        || obj?.payment_status === 'paid'

      if (factuurId) {
        // ── Server-side verificatie vóór de status-wijziging ───────────────────
        // Haal de factuur (bedrijf + totaal) met de service-role op en verifieer
        // dat deze betaling ÉCHT bij deze factuur en dit bedrijf hoort. Faalt een
        // check → NIET op betaald zetten, netjes loggen, en tóch HTTP 200 zodat
        // Stripe niet blijft retryen.
        const { data: fac } = await admin
          .from('facturen')
          .select('company_id, totaal_incl')
          .eq('id', factuurId)
          .maybeSingle()

        if (!fac) {
          console.error(`[stripe-webhook] onbekende factuur in metadata: ${factuurId}`)
          return json({ received: true, ignored: 'unknown_invoice' })
        }

        const expectedCents = Math.round(Number(fac.totaal_incl || 0) * 100)

        // 1) Account-binding: het bedrijf van de factuur moet een stripe_connections-
        //    rij hebben met stripe_account_id == event.account.
        const { data: conn } = await admin
          .from('stripe_connections')
          .select('stripe_account_id')
          .eq('company_id', fac.company_id)
          .maybeSingle()

        if (!eventAccount || !conn?.stripe_account_id || conn.stripe_account_id !== eventAccount) {
          console.error(`[stripe-webhook] account mismatch — factuur=${factuurId} event.account=${eventAccount ?? 'null'} verwacht=${conn?.stripe_account_id ?? 'geen koppeling'}`)
          return json({ received: true, ignored: 'account_mismatch' })
        }

        // 2) Bedrag-binding: betaald bedrag (centen, EUR) moet gelijk zijn aan het
        //    factuurtotaal. En de sessie/betaling moet daadwerkelijk betaald zijn.
        if (!sessionPaid) {
          console.error(`[stripe-webhook] sessie nog niet betaald — factuur=${factuurId} payment_status=${obj?.payment_status}`)
          return json({ received: true, ignored: 'not_paid' })
        }
        if (paidCents === null || paidCents !== expectedCents || paidCurrency !== 'eur') {
          console.error(`[stripe-webhook] bedrag mismatch — factuur=${factuurId} betaald=${paidCents}${paidCurrency ? ' ' + paidCurrency : ''} verwacht=${expectedCents} eur`)
          return json({ received: true, ignored: 'amount_mismatch' })
        }

        // Checks OK → markeer betaald. De verwachte waarden gaan óók mee naar de
        // RPC (data-laag-backstop: die weigert eveneens bij mismatch).
        const { data: res } = await admin.rpc('mark_factuur_betaald', {
          p_factuur_id: factuurId,
          p_betaald_op: null,
          p_stripe_status: 'paid',
          p_stripe_intent: paymentIntent,
          p_expected_company_id: fac.company_id,
          p_expected_amount_cents: expectedCents,
        })
        // Alleen als DEZE aanroep de factuur op betaald zette (idempotent): log +
        // sync + bevestigingsmails. Een tweede event voor dezelfde betaling levert
        // changed=false → niets (mails gaan zo precies één keer).
        if (res?.changed) {
          const bedragFmt = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(res.totaal_incl || 0))
          if (res.customer_id) {
            await admin.from('klant_tijdlijn').insert({
              customer_id: res.customer_id,
              company_id: res.company_id,
              type: 'factuur_betaald',
              omschrijving: `Factuur ${res.nummer} betaald (€${bedragFmt})`,
              meta: { nummer: res.nummer, bron: 'stripe' },
              aangemaakt_op: new Date().toISOString(),
            }).then(() => {}, () => {})
          }
          // Boekhoud-sync server-to-server (service-modus via cron_secret).
          // Beide providers best-effort; de niet-gekoppelde antwoordt
          // "niet geconfigureerd" en doet niets.
          await fetch(`${supabaseUrl}/functions/v1/moneybird-sync-factuur`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ factuur_id: factuurId, cron_secret: cronSecret }),
          }).catch(() => {})
          await fetch(`${supabaseUrl}/functions/v1/snelstart-sync-factuur`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ factuur_id: factuurId, cron_secret: cronSecret }),
          }).catch(() => {})

          // Betaalbevestigingsmails (klant + bedrijf, met factuur-PDF als bijlage).
          // Best-effort: mag de webhook NOOIT laten falen. Bij een fout blijft de
          // factuur gewoon op betaald staan en geeft de webhook 200 terug.
          try {
            await sendBetaalbevestigingen(admin, supabaseUrl, serviceKey, {
              factuurId,
              companyId: res.company_id,
              customerId: res.customer_id,
              nummer: res.nummer,
              bedragFmt,
            })
          } catch (mailErr: any) {
            console.error('[stripe-webhook] bevestigingsmails', mailErr?.message)
          }
        }
      }

    // ── Koppelstatus actueel houden ─────────────────────────────────────────────
    // Een via Accounts v2 aangemaakt account blijft v1-`account.updated`-events
    // sturen met dezelfde veldnamen (charges_enabled / payouts_enabled /
    // details_submitted). De on-demand stripe-connection-status blijft de primaire
    // sync (na onboarding-terugkeer en handmatig verversen); dit houdt het daarna
    // op de achtergrond actueel.
    } else if (type === 'account.updated') {
      const acctId = obj?.id
      if (acctId) {
        const charges = !!obj.charges_enabled
        const details = !!obj.details_submitted
        await admin.from('stripe_connections').update({
          charges_enabled: charges,
          payouts_enabled: !!obj.payouts_enabled,
          details_submitted: details,
          onboarding_status: charges ? 'active' : (details ? 'in_review' : 'pending'),
          updated_at: new Date().toISOString(),
        }).eq('stripe_account_id', acctId)
      }

    } else if (type === 'account.application.deauthorized') {
      // Bij deauthorization staat het connected account in event.account.
      const acctId = event.account ?? obj?.id
      if (acctId) {
        await admin.from('stripe_connections').update({
          charges_enabled: false,
          payouts_enabled: false,
          onboarding_status: 'disconnected',
          updated_at: new Date().toISOString(),
        }).eq('stripe_account_id', acctId)
      }
    }

    return json({ received: true })
  } catch (err: any) {
    console.error('[stripe-webhook]', type_safe(event), err?.message)
    return json({ error: err?.message || 'Webhook-verwerking mislukt' }, 500)
  }
})

function type_safe(event: any): string {
  try { return String(event?.type || '?') } catch { return '?' }
}

// HTML-escape voor waarden uit de database (klant-/bedrijfsnaam) in de mailbody.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Verstuur via de bestaande send-email edge function (service-role passeert
// verify_jwt), zelfde patroon als create-notification. Best-effort, gooit niet.
async function sendViaEdge(supabaseUrl: string, serviceKey: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey, 'Content-Type': 'application/json', 'x-internal-secret': Deno.env.get('SEND_EMAIL_SECRET') ?? '' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch { return false }
}

// Haal de bij verzending opgeslagen factuur-PDF op uit de private bucket en geef
// 'm als base64 terug (of null als er niets is). Service-role omzeilt de RLS.
async function loadFactuurPdfBase64(admin: any, companyId: string, factuurId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.storage.from('factuur-pdfs').download(`${companyId}/${factuurId}.pdf`)
    if (error || !data) return null
    return base64Encode(new Uint8Array(await data.arrayBuffer()))
  } catch { return null }
}

// Stuurt na een bevestigde betaling twee mails: (1) naar de KLANT, zakelijk in de
// branding van het bedrijf (met reply-to naar het bedrijf), en (2) naar het
// BEDRIJF, systeemmail in BossBase-branding. Beide met de factuur-PDF als bijlage
// (indien opgeslagen). Hergebruikt de centrale mailTemplate + send-email function.
async function sendBetaalbevestigingen(
  admin: any,
  supabaseUrl: string,
  serviceKey: string,
  ctx: { factuurId: string; companyId: string; customerId: string | null; nummer: string; bedragFmt: string },
): Promise<void> {
  const { factuurId, companyId, customerId, nummer, bedragFmt } = ctx

  const [companyRes, factuurRes, customerRes] = await Promise.all([
    admin.from('companies').select('name, email, reply_to_email, logo_url, branding_color').eq('id', companyId).maybeSingle(),
    admin.from('facturen').select('snapshot_bedrijfsnaam, snapshot_logo_url, snapshot_branding_color').eq('id', factuurId).maybeSingle(),
    customerId
      ? admin.from('customers').select('name, email').eq('id', customerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const company = companyRes?.data ?? null
  const factuur = factuurRes?.data ?? null
  const customer = customerRes?.data ?? null

  // Branding = snapshot van de verstuurde factuur, anders de live bedrijfsbranding.
  const bedrijfsnaam = factuur?.snapshot_bedrijfsnaam || company?.name || 'Ons bedrijf'
  const logoUrl      = factuur?.snapshot_logo_url || company?.logo_url || undefined
  const brandColor   = factuur?.snapshot_branding_color || company?.branding_color || undefined
  const bedrijfEmail = company?.reply_to_email || company?.email || null
  const klantNaam    = customer?.name || ''

  const pdf = await loadFactuurPdfBase64(admin, companyId, factuurId)
  const attachments = pdf ? [{ filename: `Factuur-${nummer}.pdf`, content: pdf }] : undefined

  // 1) KLANT — zakelijke mail in bedrijfsbranding.
  if (customer?.email) {
    const html = mailTemplate({
      title: 'Betaling ontvangen',
      preheader: `Je betaling voor factuur ${nummer} is ontvangen`,
      body: `<p>Beste ${esc(klantNaam) || 'klant'},</p>
<p>Bedankt! We hebben je betaling voor <strong>factuur ${esc(nummer)}</strong> van <strong>&euro;${esc(bedragFmt)}</strong> in goede orde ontvangen.</p>
<p>Een kopie van de factuur vind je als bijlage bij deze e-mail.</p>
<p>Met vriendelijke groet,<br>${esc(bedrijfsnaam)}</p>`,
      companyName: bedrijfsnaam,
      logoUrl,
      brandColor,
    })
    const body: Record<string, unknown> = {
      to: customer.email, subject: `Betaling ontvangen — factuur ${nummer}`, html, from_name: bedrijfsnaam,
    }
    if (bedrijfEmail) body.reply_to = bedrijfEmail
    if (attachments) body.attachments = attachments
    await sendViaEdge(supabaseUrl, serviceKey, body)
  }

  // 2) BEDRIJF — systeemmail in BossBase-branding (geen companyName meegeven).
  if (bedrijfEmail) {
    const html = mailTemplate({
      title: `Factuur ${nummer} is betaald`,
      preheader: `${klantNaam || 'Een klant'} heeft factuur ${nummer} betaald`,
      body: `<p>Goed nieuws! <strong>Factuur ${esc(nummer)}</strong> is betaald${klantNaam ? ` door <strong>${esc(klantNaam)}</strong>` : ''}.</p>
<table cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0;font-size:15px;color:#374151;">
  <tr><td style="padding:2px 0;color:#6b7280;">Bedrag</td><td style="padding:2px 0 2px 20px;font-weight:600;">&euro;${esc(bedragFmt)}</td></tr>
  <tr><td style="padding:2px 0;color:#6b7280;">Betaalmethode</td><td style="padding:2px 0 2px 20px;font-weight:600;">iDEAL via Stripe</td></tr>
</table>
<p>Een kopie van de factuur vind je als bijlage.</p>`,
    })
    const body: Record<string, unknown> = {
      to: bedrijfEmail, subject: `Factuur ${nummer} is betaald`, html, from_name: 'BossBase',
    }
    if (attachments) body.attachments = attachments
    await sendViaEdge(supabaseUrl, serviceKey, body)
  }
}
