import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started')
  console.log('SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? 'set' : 'missing')

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
      const body = await res.text().catch(() => '')
      console.error(`Moneybird 401 Unauthorized: ${body}`)
      return new Response(
        JSON.stringify({ success: false, error: 'Ongeldige API token', detail: body }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    if (res.status === 404) {
      const body = await res.text().catch(() => '')
      console.error(`Moneybird 404 Not Found: ${body}`)
      return new Response(
        JSON.stringify({ success: false, error: 'Administratie-ID niet gevonden', detail: body }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`Moneybird ${res.status} fout: ${body}`)
      return new Response(
        JSON.stringify({ success: false, error: `Moneybird fout: ${res.status}`, detail: body }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: res.status }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
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
