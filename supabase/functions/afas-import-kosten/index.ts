import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AFAS_BASE = 'sb20.afasfocus.nl'

async function getAccessToken(environmentId: string, appToken: string): Promise<string> {
  const url = `https://${AFAS_BASE}/${environmentId}/authentication/getaccesstoken`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ apptoken: appToken }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Token exchange HTTP ${res.status}: ${text.substring(0, 200)}`)
  let data: Record<string, string>
  try { data = JSON.parse(text) } catch { throw new Error(`Token exchange: geen JSON: ${text.substring(0, 200)}`) }
  if (!data.access_token) throw new Error(`Geen access_token in response: ${text.substring(0, 200)}`)
  return data.access_token
}

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
      return new Response(JSON.stringify({ error: 'AFAS niet geconfigureerd' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const accessToken = await getAccessToken(conn.afas_environment_id, conn.afas_token)

    const reqHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Accept-Version': '1.0',
    }

    const endpoints = [
      'purchaseinvoice',
      'purchaseinvoices',
      'invoices',
      'financialentries',
      'salesjournalentry',
    ]

    const attempts: { url: string; status: number }[] = []

    for (const ep of endpoints) {
      const url = `https://${AFAS_BASE}/${conn.afas_environment_id}/api/${ep}`
      console.log(`Probeer: ${url}`)
      const res = await fetch(url, { headers: reqHeaders })
      const text = await res.text()
      console.log(`${ep} → HTTP ${res.status}`)
      console.log(`${ep} → body: ${text.substring(0, 3000)}`)
      attempts.push({ url, status: res.status })

      if (res.ok) {
        let data: any
        try { data = JSON.parse(text) } catch {
          console.log(`${ep} → geen geldige JSON, volgende proberen`)
          continue
        }
        console.log(`Geslaagd via /${ep}`)
        console.log(`Keys: ${typeof data === 'object' && data !== null ? Object.keys(data).join(', ') : typeof data}`)
        return new Response(
          JSON.stringify({ success: true, endpoint: ep, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    console.log('Alle endpoints mislukt:', JSON.stringify(attempts))
    return new Response(
      JSON.stringify({ success: false, error: 'Geen werkend endpoint gevonden', attempts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('Error:', err.message, err.stack)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
