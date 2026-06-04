import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AFAS_SUBDOMAIN = 'sb20'

function buildAfasToken(token: string): string {
  const xml = `<token><version>1</version><data>${token}</data></token>`
  return btoa(xml)
}

async function afasFetch(environmentId: string, base64Token: string, connector: string) {
  const url = `https://${environmentId}.${AFAS_SUBDOMAIN}.afasonline.nl/profitrestservices/connectors/${connector}`
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: afas-import-kosten')

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
      .select('afas_environment_id, afas_token')
      .eq('company_id', profile.company_id)
      .eq('provider', 'afas')
      .maybeSingle()

    if (!conn?.afas_environment_id || !conn?.afas_token) {
      return new Response(JSON.stringify({ error: 'AFAS niet geconfigureerd (omgevings-ID en token verplicht)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const base64Token = buildAfasToken(conn.afas_token)
    const companyId = profile.company_id

    const { data: existingCosts } = await supabase
      .from('job_costs')
      .select('externe_referentie')
      .eq('company_id', companyId)
      .not('externe_referentie', 'is', null)

    const existingRefs = new Set((existingCosts || []).map((r: any) => r.externe_referentie))

    let imported = 0

    await sleep(500)
    const result = await afasFetch(conn.afas_environment_id, base64Token, 'FiEntries')
    const rows_raw = Array.isArray(result?.rows) ? result.rows : (Array.isArray(result) ? result : [])
    console.log('AFAS FiEntries opgehaald:', rows_raw.length)

    const toImport = rows_raw.filter((r: any) => !existingRefs.has('afas_' + r.EntryId))

    const rows = toImport.map((r: any) => {
      const amount = Math.abs(parseFloat(r.Amount ?? r.Bedrag ?? r.amount ?? '0'))
      const btwBedrag = parseFloat(r.VatAmount ?? r.BtwBedrag ?? '0')
      const btw_inclusief = btwBedrag !== 0 ? true : null
      return {
        company_id: companyId,
        description: r.Description ?? r.Omschrijving ?? r.description ?? 'AFAS inkoop',
        amount,
        category: 'Inkoopfactuur',
        cost_date: r.Date ? String(r.Date).slice(0, 10) : (r.Datum ? String(r.Datum).slice(0, 10) : null),
        externe_referentie: 'afas_' + r.EntryId,
        klant_type: 'algemeen',
        btw_inclusief,
      }
    })

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from('job_costs').insert(rows)
      if (insertErr) throw insertErr
      imported = rows.length
    }

    console.log('AFAS kosten geïmporteerd:', imported)

    await supabase
      .from('accounting_connections')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('provider', 'afas')

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
