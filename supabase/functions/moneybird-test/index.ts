import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { api_token, administration_id } = await req.json()

    if (!api_token || !administration_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'API token en administratie-ID zijn verplicht' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const res = await fetch(
      `https://moneybird.com/api/v2/${administration_id}/contacts.json?per_page=1`,
      {
        headers: {
          'Authorization': `Bearer ${api_token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (res.status === 401) {
      return new Response(
        JSON.stringify({ success: false, error: 'Ongeldige API token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (res.status === 404) {
      return new Response(
        JSON.stringify({ success: false, error: 'Administratie-ID niet gevonden' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Moneybird fout: ${res.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
