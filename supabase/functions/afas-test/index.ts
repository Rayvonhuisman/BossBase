import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAccessToken(environmentId: string, appToken: string): Promise<string> {
  const url = `https://sb20.afasfocus.nl/${environmentId}/authentication/getaccesstoken`
  console.log('Token exchange URL:', url)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ apptoken: appToken }),
  })
  const text = await res.text()
  console.log('Token exchange status:', res.status)
  console.log('Token exchange response:', text.substring(0, 300))
  if (!res.ok) throw new Error(`Token exchange HTTP ${res.status}: ${text.substring(0, 200)}`)
  let data: Record<string, string>
  try { data = JSON.parse(text) } catch { throw new Error(`Token exchange: geen JSON: ${text.substring(0, 200)}`) }
  if (!data.access_token) throw new Error(`Geen access_token in response: ${text.substring(0, 200)}`)
  console.log('access_token ontvangen, expires_in:', data.expires_in)
  return data.access_token
}

async function probeEndpoint(url: string, accessToken: string): Promise<{ status: number; body: string }> {
  console.log('Probeer endpoint:', url)
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    })
    clearTimeout(timeout)
    const body = await res.text().catch(() => '')
    console.log(`  → HTTP ${res.status}, body: ${body.substring(0, 300)}`)
    return { status: res.status, body: body.substring(0, 300) }
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Timeout na 10s' : err.message
    console.log(`  → Fout: ${msg}`)
    return { status: 0, body: msg }
  }
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

    // Stap 1: wissel apptoken in voor access_token
    let accessToken: string
    try {
      accessToken = await getAccessToken(environment_id, token)
    } catch (err) {
      console.error('Token exchange mislukt:', err.message)
      return new Response(
        JSON.stringify({ success: false, error: `Token exchange mislukt: ${err.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Stap 1 geslaagd — access_token verkregen, verbinding is bevestigd
    // Probeer extra endpoints voor debugging, maar geef al success terug
    const base = `https://sb20.afasfocus.nl/${environment_id}/api`
    const endpointAttempts: Record<string, unknown>[] = []
    for (const path of ['/relations', '/', '/invoices']) {
      const result = await probeEndpoint(`${base}${path}`, accessToken)
      endpointAttempts.push({ url: `${base}${path}`, ...result })
      if (result.status === 200) break
    }

    console.log('AFAS verbinding geslaagd voor omgeving:', environment_id)
    return new Response(
      JSON.stringify({ success: true, message: 'Verbinding geslaagd (access_token verkregen)', endpoints: endpointAttempts }),
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
