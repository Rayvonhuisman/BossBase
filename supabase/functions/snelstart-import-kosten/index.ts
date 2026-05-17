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

  console.log('Function started: snelstart-import-kosten')

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
      .select('subscription_key, secondary_key, administration_id')
      .eq('company_id', profile.company_id)
      .eq('provider', 'snelstart')
      .maybeSingle()

    if (!conn?.subscription_key || !conn?.secondary_key) {
      return new Response(JSON.stringify({ error: 'SnelStart niet geconfigureerd' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = await getSnelStartToken(conn.subscription_key, conn.secondary_key)
    const companyId = profile.company_id

    // Bestaande referenties voor deduplicatie
    const { data: existingCosts } = await supabase
      .from('job_costs')
      .select('externe_referentie')
      .eq('company_id', companyId)
      .not('externe_referentie', 'is', null)

    const existingRefs = new Set((existingCosts || []).map((r: any) => r.externe_referentie))

    // ── INKOOPBOEKINGEN ──────────────────────────────────────────────────────
    let inkoopCount = 0
    {
      const boekingen = await ssFetch(token, conn.subscription_key, '/inkoopboekingen')
      const toImport = Array.isArray(boekingen)
        ? boekingen.filter((b: any) => !existingRefs.has('snelstart_' + b.id))
        : []

      const rows = toImport.map((b: any) => ({
        company_id: companyId,
        description: b.omschrijving || b.factuurnummer || 'Inkoop',
        amount: Math.abs(parseFloat(b.bedrag || b.totaalBedrag || '0')),
        category: 'Inkoopfactuur',
        cost_date: b.datum ? b.datum.slice(0, 10) : null,
        externe_referentie: 'snelstart_' + b.id,
        klant_type: 'algemeen',
      }))

      if (rows.length > 0) {
        const { error: insertErr } = await supabase.from('job_costs').insert(rows)
        if (insertErr) throw insertErr
        inkoopCount = rows.length
      }
      console.log('SnelStart inkoopboekingen geïmporteerd:', inkoopCount)
    }

    // Update last_synced_at
    await supabase
      .from('accounting_connections')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('provider', 'snelstart')

    return new Response(
      JSON.stringify({ success: true, imported: { inkoopboekingen: inkoopCount } }),
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
