import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildAfasToken(token: string): string {
  const tokenXml = `<token><version>1</version><data>${token}</data></token>`
  const base64Token = btoa(tokenXml)
  return base64Token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: afas-test')

  try {
    const { environment_id, token, subdomain } = await req.json()

    if (!environment_id || !token || !subdomain) {
      return new Response(
        JSON.stringify({ success: false, error: 'Omgevings-ID, subdomein en App token zijn verplicht' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const base64Token = buildAfasToken(token)
    const authHeader = `AfasToken ${base64Token}`
    const url = `https://${environment_id}.${subdomain}.afasonline.nl/profitrestservices/metainfo`

    console.log('AFAS test URL:', url)

    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      })
    } catch (fetchErr) {
      console.error('AFAS fetch error (network/DNS):', fetchErr.message)
      return new Response(
        JSON.stringify({ success: false, error: `Netwerk fout: ${fetchErr.message}`, url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`AFAS metainfo HTTP ${res.status}:`, body)
      return new Response(
        JSON.stringify({ success: false, error: `AFAS fout: ${res.status}`, detail: body, url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log('AFAS verbinding geslaagd voor omgeving:', environment_id)

    return new Response(
      JSON.stringify({ success: true, message: 'Verbinding geslaagd' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err.message, err.stack)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
