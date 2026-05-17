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
    console.error(`Moneybird API ${res.status} op ${path}: ${body}`)
    throw new Error(`Moneybird ${res.status}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: moneybird-sync-contacten')
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

    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'Geen bedrijf gevonden' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: conn } = await supabase
      .from('accounting_connections')
      .select('api_token, administration_id')
      .eq('company_id', profile.company_id)
      .eq('provider', 'moneybird')
      .maybeSingle()

    if (!conn?.api_token || !conn?.administration_id) {
      return new Response(JSON.stringify({ error: 'Moneybird niet geconfigureerd' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = conn.api_token
    const adminId = conn.administration_id
    const companyId = profile.company_id

    console.log('company_id ontvangen:', companyId)

    let imported = 0
    let exported = 0

    // ── A: MONEYBIRD → BOSSBASE ──────────────────────────────────────────────
    const mbContacts = await mbFetch(token, adminId, '/contacts.json?per_page=100')

    console.log('Moneybird contacts response:', JSON.stringify(mbContacts))

    const contactsList: any[] = Array.isArray(mbContacts) ? mbContacts : []

    if (contactsList.length > 0) {
      const { data: existingCustomers, error: custErr } = await supabase
        .from('customers')
        .select('id, name, email, moneybird_id')
        .eq('company_id', companyId)

      console.log('Query resultaat:', existingCustomers?.length ?? 0, 'klanten gevonden')
      if (custErr) console.error('Supabase customers query error:', custErr.message)
      console.log('BossBase klanten:', existingCustomers?.length ?? 0)

      const byEmail = new Map<string, any>()
      const byName = new Map<string, any>()
      for (const c of (existingCustomers || [])) {
        if (c.email) byEmail.set(c.email.toLowerCase(), c)
        if (c.name) byName.set(c.name.toLowerCase(), c)
      }

      for (const contact of contactsList) {
        const name = contact.company_name || [contact.firstname, contact.lastname].filter(Boolean).join(' ') || ''
        if (!name.trim()) continue

        const emailKey = (contact.email || '').toLowerCase()
        // Match op email als beschikbaar, anders op naam
        const existing = (emailKey ? byEmail.get(emailKey) : null) ?? byName.get(name.toLowerCase()) ?? null

        if (existing) {
          if (!existing.moneybird_id) {
            await supabase.from('customers').update({ moneybird_id: String(contact.id) }).eq('id', existing.id)
          }
        } else {
          const { data: newCustomer } = await supabase.from('customers').insert({
            company_id: companyId,
            name: name.trim(),
            email: contact.email || null,
            phone: contact.phone || null,
            address: contact.address1 || null,
            city: contact.city || null,
            moneybird_id: String(contact.id),
          }).select().single()

          if (newCustomer) {
            imported++
            if (emailKey) byEmail.set(emailKey, newCustomer)
            byName.set(name.toLowerCase(), newCustomer)
          }
        }
      }
    }

    console.log('Geïmporteerd van Moneybird:', imported)

    // ── B: BOSSBASE → MONEYBIRD ──────────────────────────────────────────────
    const { data: unsynced } = await supabase
      .from('customers')
      .select('*')
      .eq('company_id', companyId)
      .is('moneybird_id', null)

    console.log('BossBase klanten zonder moneybird_id:', unsynced?.length ?? 0)
    console.log('Query resultaat unsynced:', unsynced?.length ?? 0, 'klanten gevonden')

    for (const customer of (unsynced || [])) {
      try {
        const mbContact = await mbFetch(token, adminId, '/contacts.json', {
          method: 'POST',
          body: JSON.stringify({
            contact: {
              company_name: customer.name,
              email: customer.email || '',
              phone: customer.phone || '',
              address1: customer.address || '',
              city: customer.city || '',
            },
          }),
        })
        if (mbContact?.id) {
          await supabase.from('customers').update({ moneybird_id: String(mbContact.id) }).eq('id', customer.id)
          exported++
        }
      } catch (err) {
        console.error(`Export klant ${customer.id} mislukt:`, err.message)
      }
    }

    console.log('Geëxporteerd naar Moneybird:', exported)
    console.log('Imported:', imported, 'Exported:', exported)

    return new Response(
      JSON.stringify({ success: true, imported, exported }),
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
