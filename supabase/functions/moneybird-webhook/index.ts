import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient } from "../_shared/scheduledSync.ts"
import { mbFetch, type MbKoppeling } from "../_shared/moneybird.ts"
import { handtekeningKlopt } from "../_shared/moneybirdWebhook.ts"
import { verwerkContactWijziging } from "../_shared/moneybirdContacten.ts"
import { echtBetaald } from "../_shared/moneybirdBoekingen.ts"
import { vandaagIso } from "../_shared/datumTijd.ts"

// Ontvangt webhooks van Moneybird (zie _shared/moneybirdWebhook.ts).
//
// Publiek bereikbaar (verify_jwt = false in config.toml): Moneybird stuurt geen
// Supabase-sleutel mee. De echtheid zit in de handtekening (Moneybird-Signature,
// HMAC-SHA256 met het geheim van díé koppeling). Zonder handtekening doen we
// niets maar antwoorden we wel 200: zo controleert Moneybird bij het aanmelden
// of de URL werkt. Een handtekening die niet klopt krijgt 401.
//
// We vertrouwen de inhoud van het bericht niet blind: Moneybird waarschuwt dat
// de status in het bericht kan afwijken van de actuele. Daarom halen we het
// record altijd opnieuw op voordat we iets wijzigen. Daarmee is verwerken ook
// vanzelf idempotent: hetzelfde bericht twee keer verwerken verandert niets.
//
// Verwerkt:
//   * factuur betaald (extern of gewoon, of een geregistreerde betaling)
//     → de factuur hier op betaald;
//   * contact gewijzigd → gekoppelde klant of leverancier bijwerken.
// Een fout bij het verwerken geeft tóch 200: anders probeert Moneybird het tien
// keer opnieuw, en de nachtelijke sync haalt het hoe dan ook bij.

const ok = (tekst = 'ok') => new Response(tekst, { status: 200 })

async function factuurBetaald(k: MbKoppeling, soort: 'external_sales_invoices' | 'sales_invoices', id: string) {
  const inv = await mbFetch(k, `/${soort}/${id}`)
  // Verrekend met een creditnota is geen betaling (zie echtBetaald).
  if (!echtBetaald(inv)) return
  const { data: f } = await k.admin.from('facturen').select('id, status')
    .eq('company_id', k.companyId).eq('moneybird_id', String(id)).maybeSingle()
  if (!f || !['verzonden', 'geboekt'].includes(f.status)) return
  await k.admin.from('facturen').update({
    status: 'betaald',
    betaald_op: String(inv.paid_at || vandaagIso()).slice(0, 10),
    moneybird_payment_registered_at: new Date().toISOString(),
  }).eq('id', f.id)
}

serve(async (req) => {
  if (req.method !== 'POST') return ok()
  const ruw = await req.text().catch(() => '')
  const handtekening = req.headers.get('Moneybird-Signature') || ''
  if (!handtekening) return ok()

  let bericht: any
  try { bericht = JSON.parse(ruw) } catch { return new Response('ongeldig', { status: 400 }) }

  const admin = makeAdminClient()
  const { data: conn } = await admin.from('accounting_connections')
    .select('company_id, api_token, refresh_token, administration_id, webhook_secret')
    .eq('provider', 'moneybird').eq('webhook_id', String(bericht?.webhook_id || ''))
    .maybeSingle()
  if (!conn?.webhook_secret || String(conn.administration_id) !== String(bericht?.administration_id)) {
    return new Response('onbekend', { status: 401 })
  }
  if (!(await handtekeningKlopt(handtekening, ruw, conn.webhook_secret))) {
    return new Response('handtekening klopt niet', { status: 401 })
  }
  if (!conn.api_token) return ok('niet gekoppeld')

  const k: MbKoppeling = {
    admin, companyId: conn.company_id, administratieId: String(conn.administration_id),
    accessToken: conn.api_token, refreshToken: conn.refresh_token,
  }
  const actie = String(bericht?.action || '')
  const type = String(bericht?.entity_type || '')
  const id = String(bericht?.entity_id || '')

  try {
    if (actie === 'external_sales_invoice_state_changed_to_paid') await factuurBetaald(k, 'external_sales_invoices', id)
    else if (actie === 'sales_invoice_state_changed_to_paid') await factuurBetaald(k, 'sales_invoices', id)
    else if (actie === 'payment_registered') {
      const e = bericht?.entity || {}
      const factuurId = String(e.invoice_id || '')
      if (factuurId && e.invoice_type === 'ExternalSalesInvoice') await factuurBetaald(k, 'external_sales_invoices', factuurId)
      if (factuurId && e.invoice_type === 'SalesInvoice') await factuurBetaald(k, 'sales_invoices', factuurId)
    } else if (actie === 'contact_changed' || type === 'Contact') {
      const contact = await mbFetch(k, `/contacts/${id}`)
      await verwerkContactWijziging(k, contact)
    }
  } catch (e: any) {
    console.error(`moneybird-webhook ${actie} voor ${conn.company_id}:`, e?.message)
  }
  return ok()
})
