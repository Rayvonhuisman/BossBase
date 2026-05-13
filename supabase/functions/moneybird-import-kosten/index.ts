import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function mbFetch(token: string, adminId: string, path: string) {
  await sleep(200)
  const res = await fetch(`https://moneybird.com/api/v2/${adminId}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Moneybird ${res.status}: ${body}`)
  }
  return res.json()
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

    // Get company_id and connection
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'Geen bedrijf gevonden' }), { status: 400, headers: corsHeaders })
    }

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

    // Fetch existing externe_referentie values to avoid duplicates
    const { data: existing } = await supabase
      .from('job_costs')
      .select('externe_referentie')
      .eq('company_id', profile.company_id)
      .not('externe_referentie', 'is', null)

    const existingRefs = new Set((existing || []).map((r: any) => r.externe_referentie))

    // Fetch purchase invoices from Moneybird (page 1, max 100)
    const invoices = await mbFetch(token, adminId, '/purchase_invoices.json?per_page=100&filter=state%3Aall')

    if (!Array.isArray(invoices)) {
      return new Response(
        JSON.stringify({ success: true, imported: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const toImport = invoices.filter((inv: any) => !existingRefs.has(String(inv.id)))

    const rows = toImport.map((inv: any) => ({
      company_id: profile.company_id,
      description: inv.reference || inv.details?.[0]?.description || 'Inkoopregel',
      amount: parseFloat(inv.total_price_excl_tax || inv.total_price || '0'),
      category: 'inkoop',
      cost_date: inv.date || null,
      externe_referentie: String(inv.id),
      klant_type: 'algemeen',
    }))

    let imported = 0
    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from('job_costs').insert(rows)
      if (insertErr) throw insertErr
      imported = rows.length
    }

    // Update last_synced_at
    await supabase
      .from('accounting_connections')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', profile.company_id)
      .eq('provider', 'moneybird')

    return new Response(
      JSON.stringify({ success: true, imported }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
