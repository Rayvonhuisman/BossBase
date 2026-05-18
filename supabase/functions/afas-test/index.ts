import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildAfasToken(token: string): string {
  const xml = `<token><version>1</version><data>${token}</data></token>`
  return btoa(xml)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: afas-test')

  try {
    const { environment_id, token } = await req.json()

    if (!environment_id || !token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Omgevings-ID en App token zijn verplicht' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const base64Token = buildAfasToken(token)
    const url = `https://${environment_id}.rest.afas.online/profitrestservices/metainfo`

    const res = await fetch(url, {
      headers: {
        'Authorization': `AfasToken ${base64Token}`,
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`AFAS metainfo ${res.status}: ${body}`)
      return new Response(
        JSON.stringify({ success: false, error: `AFAS fout: ${res.status}`, detail: body }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log('AFAS verbinding geslaagd voor omgeving:', environment_id)

    return new Response(
      JSON.stringify({ success: true, message: 'Verbinding geslaagd' }),
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
