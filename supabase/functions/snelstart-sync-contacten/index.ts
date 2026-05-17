import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getSnelStartToken(subscriptionKey: string, secondaryKey: string): Promise<string> {
  const res = await fetch('https://auth.snelstart.nl/b2b/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
    body: `grant_type=maatwerk_token&maatwerk_token=${encodeURIComponent(secondaryKey)}`,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SnelStart auth mislukt (${res.status}): ${body}`)
  }
  const json = await res.json()
  if (!json.access_token) throw new Error('Geen access_token in SnelStart response')
  return json.access_token
}

async function ssFetch(token: string, subscriptionKey: string, path: string) {
  const res = await fetch(`https://b2bapi.snelstart.nl/v2${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`SnelStart API ${res.status} op ${path}: ${body}`)
    throw new Error(`SnelStart ${res.status}: ${body}`)
  }
  return res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: snelstart-sync-contacten')

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
      .select('subscription_key, secondary_key')
      .eq('company_id', profile.company_id)
      .eq('provider', 'snelstart')
      .maybeSingle()

    if (!conn?.subscription_key || !conn?.secondary_key) {
      return new Response(JSON.stringify({ error: 'SnelStart niet geconfigureerd' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = await getSnelStartToken(conn.subscription_key, conn.secondary_key)
    const companyId = profile.company_id

    let imported = 0

    // ── SNELSTART → BOSSBASE ─────────────────────────────────────────────────
    const relaties = await ssFetch(token, conn.subscription_key, '/relaties')
    console.log('SnelStart relaties opgehaald:', Array.isArray(relaties) ? relaties.length : 0)

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

    for (const relatie of (Array.isArray(relaties) ? relaties : [])) {
      const name = relatie.naam || relatie.name || ''
      if (!name.trim()) continue

      const emailKey = (relatie.email || '').toLowerCase()
      const existing = (emailKey ? byEmail.get(emailKey) : null) ?? byName.get(name.toLowerCase()) ?? null

      if (!existing) {
        const { data: newCustomer } = await supabase.from('customers').insert({
          company_id: companyId,
          name: name.trim(),
          email: relatie.email || null,
          phone: relatie.telefoon || relatie.phone || null,
          address: relatie.adres?.straat ? `${relatie.adres.straat} ${relatie.adres.huisnummer || ''}`.trim() : null,
          city: relatie.adres?.plaats || null,
        }).select().single()

        if (newCustomer) {
          imported++
          if (emailKey) byEmail.set(emailKey, newCustomer)
          byName.set(name.toLowerCase(), newCustomer)
        }
      }
    }

    console.log('Geïmporteerd van SnelStart:', imported)

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
