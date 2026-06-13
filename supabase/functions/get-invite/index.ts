import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return json({ error: 'token is verplicht' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('company_members')
      .select('id, email, full_name, role, invite_expires_at, invite_company_name')
      .eq('invite_token', token)
      .maybeSingle()

    if (error || !data) return json({ error: 'Uitnodiging niet gevonden' }, 404)

    if (!data.invite_expires_at || new Date(data.invite_expires_at) < new Date()) {
      return json({ expired: true, error: 'Uitnodiging is verlopen' }, 410)
    }

    return json({
      email: data.email,
      fullName: data.full_name || '',
      role: data.role || 'medewerker',
      companyName: data.invite_company_name || 'BossBase',
      expiresAt: data.invite_expires_at,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
