import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildAfasToken(token: string): string {
  const xml = `<token><version>1</version><data>${token}</data></token>`
  return btoa(xml)
}

async function afasFetch(environmentId: string, subdomain: string, base64Token: string, connector: string) {
  const url = `https://${environmentId}.${subdomain}.afasonline.nl/profitrestservices/connectors/${connector}`
  const res = await fetch(url, {
    headers: {
      'Authorization': `AfasToken ${base64Token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`AFAS ${connector} ${res.status}: ${body}`)
    throw new Error(`AFAS ${res.status}: ${body}`)
  }
  return res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: afas-sync-contacten')

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

    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'Geen bedrijf gevonden' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: conn } = await supabase
      .from('accounting_connections')
      .select('afas_environment_id, afas_token, afas_subdomain')
      .eq('company_id', profile.company_id)
      .eq('provider', 'afas')
      .maybeSingle()

    if (!conn?.afas_environment_id || !conn?.afas_token || !conn?.afas_subdomain) {
      return new Response(JSON.stringify({ error: 'AFAS niet geconfigureerd (omgevings-ID, subdomein en token verplicht)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const base64Token = buildAfasToken(conn.afas_token)
    const companyId = profile.company_id

    const result = await afasFetch(conn.afas_environment_id, conn.afas_subdomain, base64Token, 'KnContact')
    const contacten = Array.isArray(result?.rows) ? result.rows : (Array.isArray(result) ? result : [])
    console.log('AFAS KnContact opgehaald:', contacten.length)

    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, name, email')
      .eq('company_id', companyId)

    const byName = new Map<string, any>()
    const byEmail = new Map<string, any>()
    for (const c of (existingCustomers || [])) {
      if (c.name) byName.set(c.name.toLowerCase(), c)
      if (c.email) byEmail.set(c.email.toLowerCase(), c)
    }

    let imported = 0

    for (const contact of contacten) {
      const name = contact.BcCoName ?? contact.Naam ?? contact.name ?? ''
      if (!name.trim()) continue

      const email = (contact.EmAd ?? contact.Email ?? contact.email ?? '').toLowerCase()
      const existing = (email ? byEmail.get(email) : null) ?? byName.get(name.toLowerCase()) ?? null

      if (!existing) {
        const { data: newCustomer } = await supabase.from('customers').insert({
          company_id: companyId,
          name: name.trim(),
          email: email || null,
          phone: contact.TeNr ?? contact.Telefoon ?? null,
          address: contact.Ad ?? contact.Adres ?? null,
          city: contact.Rs ?? contact.Plaats ?? null,
        }).select().single()

        if (newCustomer) {
          imported++
          if (email) byEmail.set(email, newCustomer)
          byName.set(name.toLowerCase(), newCustomer)
        }
      }
    }

    console.log('AFAS contacten geïmporteerd:', imported)

    return new Response(
      JSON.stringify({ success: true, imported }),
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
