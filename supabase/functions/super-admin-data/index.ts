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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Niet geautoriseerd' }, 401)

  // Verifieer de caller via anon client
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: userErr } = await anonClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Niet geautoriseerd' }, 401)

  const { data: callerProfile } = await anonClient
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!callerProfile?.is_super_admin) return json({ error: 'Geen super-admin toegang' }, 403)

  // Service role voor auth.users en cross-company queries
  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const [companiesRes, subsRes, profilesRes, usersRes] = await Promise.all([
    svc.from('companies').select('id, name, email, city, kvk, created_at, status').order('created_at', { ascending: false }),
    svc.from('subscriptions').select('*'),
    svc.from('profiles').select('id, company_id, full_name, role'),
    svc.auth.admin.listUsers({ perPage: 1000, page: 1 }),
  ])

  const companies  = companiesRes.data  || []
  const subs       = subsRes.data       || []
  const profiles   = profilesRes.data   || []
  const authUsers  = usersRes.data?.users || []

  const result = companies.map(company => {
    const members = profiles.filter(p => p.company_id === company.id)
    const sub     = subs.find(s => s.company_id === company.id)

    let lastLogin: string | null = null
    const memberDetails = members.map(m => {
      const au = authUsers.find(u => u.id === m.id)
      const login = au?.last_sign_in_at || null
      if (login && (!lastLogin || login > lastLogin)) lastLogin = login
      return {
        id: m.id,
        fullName: m.full_name || '',
        email: au?.email || '',
        role: m.role || 'medewerker',
        lastLogin: login,
      }
    })

    return {
      id: company.id,
      name: company.name,
      email: company.email || '',
      city: company.city || '',
      kvk: company.kvk || '',
      createdAt: company.created_at,
      status: company.status || 'actief',
      memberCount: members.length,
      lastLogin,
      members: memberDetails,
      subscription: sub ? {
        id: sub.id,
        plan: sub.plan,
        status: sub.status,
        pricePerMonth: sub.price_per_month,
        trialEndsAt: sub.trial_ends_at,
        notes: sub.notes || '',
      } : null,
    }
  })

  return json({ companies: result })
})
