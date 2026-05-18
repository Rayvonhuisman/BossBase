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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: snelstart-test')

  try {
    const { subscription_key, secondary_key } = await req.json()

    if (!subscription_key || !secondary_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Abonnementssleutel en maatwerksleutel zijn verplicht' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const token = await getSnelStartToken(subscription_key, secondary_key)

    const res = await fetch('https://b2bapi.snelstart.nl/v2/administraties', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': subscription_key,
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`SnelStart administraties ${res.status}: ${body}`)
      return new Response(
        JSON.stringify({ success: false, error: `SnelStart fout: ${res.status}`, detail: body }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: res.status }
      )
    }

    const administraties = await res.json()
    console.log('SnelStart administraties:', JSON.stringify(administraties))

    return new Response(
      JSON.stringify({ success: true, message: 'Verbinding geslaagd', administraties: Array.isArray(administraties) ? administraties : [] }),
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
