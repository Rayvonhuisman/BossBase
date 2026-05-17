import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: moneybird-update-contact')
  console.log('SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? 'set' : 'missing')

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Niet ingelogd' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { customer_id } = await req.json()
    if (!customer_id) {
      return new Response(JSON.stringify({ error: 'customer_id is verplicht' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: customer } = await supabase.from('customers').select('*').eq('id', customer_id).single()
    if (!customer) {
      return new Response(JSON.stringify({ error: 'Klant niet gevonden' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: conn } = await supabase
      .from('accounting_connections')
      .select('api_token, administration_id')
      .eq('company_id', customer.company_id)
      .eq('provider', 'moneybird')
      .maybeSingle()

    if (!conn?.api_token || !conn?.administration_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Moneybird niet geconfigureerd' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const contactBody = JSON.stringify({
      contact: {
        company_name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        address1: customer.address || '',
        city: customer.city || '',
      },
    })

    await sleep(200)

    let mbId: string

    if (customer.moneybird_id) {
      const res = await fetch(
        `https://moneybird.com/api/v2/${conn.administration_id}/contacts/${customer.moneybird_id}.json`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${conn.api_token}`, 'Content-Type': 'application/json' },
          body: contactBody,
        }
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`Moneybird PATCH ${res.status}: ${body}`)
        throw new Error(`Moneybird ${res.status}: ${body}`)
      }
      mbId = customer.moneybird_id
    } else {
      const res = await fetch(
        `https://moneybird.com/api/v2/${conn.administration_id}/contacts.json`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${conn.api_token}`, 'Content-Type': 'application/json' },
          body: contactBody,
        }
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`Moneybird POST ${res.status}: ${body}`)
        throw new Error(`Moneybird ${res.status}: ${body}`)
      }
      const mbContact = await res.json()
      mbId = String(mbContact.id)
      await supabase.from('customers').update({ moneybird_id: mbId }).eq('id', customer_id)
    }

    return new Response(
      JSON.stringify({ success: true, moneybird_id: mbId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error:', err.message, err.stack)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
