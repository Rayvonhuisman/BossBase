import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function mbFetch(token: string, adminId: string, path: string, options: RequestInit = {}) {
  await sleep(200)
  const res = await fetch(`https://moneybird.com/api/v2/${adminId}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Moneybird ${res.status}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { authorization: authHeader } } }
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Niet ingelogd' }), { status: 401, headers: corsHeaders })
    }

    const { factuur_id } = await req.json()
    if (!factuur_id) {
      return new Response(JSON.stringify({ error: 'factuur_id is verplicht' }), { status: 400, headers: corsHeaders })
    }

    // Get company_id from profile
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'Geen bedrijf gevonden' }), { status: 400, headers: corsHeaders })
    }

    // Get Moneybird connection
    const { data: conn } = await supabase
      .from('accounting_connections')
      .select('api_token, administration_id')
      .eq('company_id', profile.company_id)
      .eq('provider', 'moneybird')
      .maybeSingle()

    if (!conn?.api_token || !conn?.administration_id) {
      return new Response(JSON.stringify({ error: 'Moneybird niet geconfigureerd' }), { status: 400, headers: corsHeaders })
    }

    const token = conn.api_token
    const adminId = conn.administration_id

    // Get factuur + customer
    const { data: factuur } = await supabase
      .from('facturen')
      .select('*, customers(name, email, address, city, postal_code, phone, kvk, btw_number)')
      .eq('id', factuur_id)
      .single()

    if (!factuur) {
      return new Response(JSON.stringify({ error: 'Factuur niet gevonden' }), { status: 404, headers: corsHeaders })
    }

    // Get factuurregels
    const { data: regels } = await supabase
      .from('factuur_regels')
      .select('*')
      .eq('factuur_id', factuur_id)
      .order('volgorde', { ascending: true })

    const customer = factuur.customers

    // Find or create contact in Moneybird
    let contactId: string | null = null

    if (customer?.name) {
      const contacts = await mbFetch(token, adminId, `/contacts.json?query=${encodeURIComponent(customer.name)}`)
      const existing = Array.isArray(contacts) ? contacts.find((c: any) =>
        c.company_name === customer.name || c.firstname === customer.name
      ) : null

      if (existing) {
        contactId = existing.id
      } else {
        const newContact = await mbFetch(token, adminId, '/contacts.json', {
          method: 'POST',
          body: JSON.stringify({
            contact: {
              company_name: customer.name,
              email: customer.email || '',
              phone: customer.phone || '',
              address1: customer.address || '',
              city: customer.city || '',
              zipcode: customer.postal_code || '',
              tax_number: customer.btw_number || '',
            },
          }),
        })
        contactId = newContact?.id ?? null
      }
    }

    // Build invoice lines
    const invoiceDetails = (regels || []).map((r: any) => ({
      description: r.omschrijving,
      price: r.eenheidsprijs?.toString() ?? '0',
      amount: r.type === 'vast' ? '1' : (r.aantal?.toString() ?? '1'),
      tax_rate_id: null, // tax rates resolved separately if needed
    }))

    // Create sales invoice
    const invoicePayload: any = {
      sales_invoice: {
        contact_id: contactId,
        invoice_date: factuur.factuurdatum,
        due_date: factuur.vervaldatum || null,
        reference: factuur.betalingskenmerk || factuur.nummer,
        details_attributes: invoiceDetails,
      },
    }

    const mbInvoice = await mbFetch(token, adminId, '/sales_invoices.json', {
      method: 'POST',
      body: JSON.stringify(invoicePayload),
    })

    const mbInvoiceId = mbInvoice?.id

    // If factuur is betaald, register payment
    if (factuur.status === 'betaald' && mbInvoiceId) {
      await mbFetch(token, adminId, `/sales_invoices/${mbInvoiceId}/payments.json`, {
        method: 'POST',
        body: JSON.stringify({
          payment: {
            payment_date: factuur.betaald_op || factuur.factuurdatum,
            price: factuur.totaal_incl?.toString() ?? '0',
          },
        }),
      })
    }

    // Update last_synced_at
    await supabase
      .from('accounting_connections')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', profile.company_id)
      .eq('provider', 'moneybird')

    return new Response(
      JSON.stringify({ success: true, moneybird_id: mbInvoiceId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
