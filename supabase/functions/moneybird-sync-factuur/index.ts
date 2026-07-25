import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, isScheduledCall } from "../_shared/scheduledSync.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function mbFetch(token: string, adminId: string, path: string, options: RequestInit = {}) {
  await sleep(200)
  const res = await fetch(`https://moneybird.com/api/v2/${adminId}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`Moneybird API ${res.status} op ${path}: ${body}`)
    throw new Error(`Moneybird ${res.status}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

// Idempotente sync van ÉÉN factuur naar Moneybird:
//   * bestaat facturen.moneybird_id al → GEEN nieuwe invoice aanmaken;
//   * betaling wordt maximaal één keer geregistreerd (moneybird_payment_registered_at);
//   * moneybird_id + moneybird_payment_registered_at worden teruggeschreven.
async function syncFactuur(admin: any, token: string, adminId: string, factuur: any, regels: any[]) {
  let mbInvoiceId: string | null = factuur.moneybird_id || null

  // 1. Invoice aanmaken (alleen als er nog geen moneybird_id is).
  if (!mbInvoiceId) {
    const customer = factuur.customers
    let contactId: string | null = null
    if (customer?.name) {
      const contacts = await mbFetch(token, adminId, `/contacts.json?query=${encodeURIComponent(customer.name)}`)
      const existing = Array.isArray(contacts)
        ? contacts.find((c: any) => c.company_name === customer.name || c.firstname === customer.name)
        : null
      if (existing) {
        contactId = existing.id
      } else {
        const newContact = await mbFetch(token, adminId, '/contacts.json', {
          method: 'POST',
          body: JSON.stringify({ contact: {
            company_name: customer.name, email: customer.email || '', phone: customer.phone || '',
            address1: customer.address || '', city: customer.city || '',
          } }),
        })
        contactId = newContact?.id ?? null
      }
    }

    const invoiceDetails = (regels || []).map((r: any) => ({
      description: r.omschrijving,
      price: r.eenheidsprijs?.toString() ?? '0',
      amount: r.type === 'vast' ? '1' : (r.aantal?.toString() ?? '1'),
      tax_rate_id: null,
    }))

    const mbInvoice = await mbFetch(token, adminId, '/sales_invoices.json', {
      method: 'POST',
      body: JSON.stringify({ sales_invoice: {
        contact_id: contactId,
        invoice_date: factuur.factuurdatum,
        due_date: factuur.vervaldatum || null,
        reference: factuur.betalingskenmerk || factuur.nummer,
        details_attributes: invoiceDetails,
      } }),
    })
    mbInvoiceId = mbInvoice?.id ?? null
    if (mbInvoiceId) {
      // Terugschrijven → volgende sync maakt geen dubbele invoice aan.
      await admin.from('facturen').update({ moneybird_id: String(mbInvoiceId) }).eq('id', factuur.id)
    }
  }

  // 2. Betaling registreren — alleen als betaald én nog niet geregistreerd.
  let paymentRegistered = Boolean(factuur.moneybird_payment_registered_at)
  if (factuur.status === 'betaald' && mbInvoiceId && !paymentRegistered) {
    await mbFetch(token, adminId, `/sales_invoices/${mbInvoiceId}/payments.json`, {
      method: 'POST',
      body: JSON.stringify({ payment: {
        payment_date: factuur.betaald_op || factuur.factuurdatum,
        price: factuur.totaal_incl?.toString() ?? '0',
      } }),
    })
    await admin.from('facturen').update({ moneybird_payment_registered_at: new Date().toISOString() }).eq('id', factuur.id)
    paymentRegistered = true
  }

  return { moneybird_id: mbInvoiceId, payment_registered: paymentRegistered }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = makeAdminClient()
  const body = await req.json().catch(() => ({}))
  const factuurId = body?.factuur_id
  if (!factuurId) return json({ error: 'factuur_id is verplicht' }, 400)

  try {
    // company_id bepalen: service-modus (webhook, cron_secret) → uit de factuur;
    // anders user-modus (auth.getUser → profiles.company_id), met ownership-scoping.
    let companyId: string | null = null
    if (isScheduledCall(body)) {
      const { data: f } = await admin.from('facturen').select('company_id').eq('id', factuurId).maybeSingle()
      companyId = f?.company_id ?? null
    } else {
      const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
      const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
      if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)
      const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
      companyId = profile?.company_id ?? null
    }
    if (!companyId) return json({ error: 'Geen bedrijf gevonden' }, 400)

    const { data: conn } = await admin
      .from('accounting_connections')
      .select('api_token, administration_id, sync_paid_only')
      .eq('company_id', companyId)
      .eq('provider', 'moneybird')
      .maybeSingle()
    if (!conn?.api_token || !conn?.administration_id) return json({ error: 'Moneybird niet geconfigureerd' }, 400)

    // Factuur scoped op companyId (ownership: user kan geen factuur van een ander bedrijf syncen).
    const { data: factuur } = await admin
      .from('facturen')
      .select('*, customers(name, email, address, city, phone)')
      .eq('id', factuurId)
      .eq('company_id', companyId)
      .single()
    if (!factuur) return json({ error: 'Factuur niet gevonden' }, 404)

    // Instelling "alleen betaalde facturen synchroniseren"
    if (conn.sync_paid_only && factuur.status !== 'betaald') {
      return json({ success: true, skipped: 'alleen betaalde facturen worden gesynchroniseerd' })
    }

    const { data: regels } = await admin
      .from('factuur_regels').select('*').eq('factuur_id', factuurId).order('volgorde', { ascending: true })

    const result = await syncFactuur(admin, conn.api_token, conn.administration_id, factuur, regels || [])

    await admin.from('accounting_connections')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', companyId).eq('provider', 'moneybird')

    return json({ success: true, ...result })
  } catch (err: any) {
    console.error('Error:', err?.message, err?.stack)
    return json({ success: false, error: err?.message }, 500)
  }
})
