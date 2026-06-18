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

  // Verifieer caller via anon client
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

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Alle queries parallel
  const [
    companiesRes, subsRes, profilesRes, usersRes,
    custRes, projRes, offRes, factRes, wbRes, actRes, betaaldFactRes,
  ] = await Promise.all([
    svc.from('companies').select(
      'id, name, email, phone, address, city, postal_code, kvk, btw_number, website, logo_url, branding_color, created_at, status'
    ).order('created_at', { ascending: false }),
    svc.from('subscriptions').select('*'),
    svc.from('profiles').select('id, company_id, full_name, role, created_at, is_super_admin'),
    svc.auth.admin.listUsers({ perPage: 1000, page: 1 }),
    svc.from('customers').select('company_id'),
    svc.from('projects').select('company_id'),
    svc.from('offertes').select('company_id'),
    svc.from('facturen').select('company_id'),
    svc.from('werkbonnen').select('company_id'),
    svc.from('activities').select('company_id, created_at'),
    svc.from('facturen').select('id, company_id').eq('status', 'betaald'),
  ])

  // Omzet: som van regelprijs van betaalde facturen
  const betaaldIds = (betaaldFactRes.data || []).map((f: any) => f.id)
  let regels: any[] = []
  if (betaaldIds.length > 0) {
    const { data: regelData } = await svc
      .from('factuur_regels')
      .select('factuur_id, company_id, regelprijs')
      .in('factuur_id', betaaldIds)
    regels = regelData || []
  }

  const companies  = companiesRes.data  || []
  const subs       = subsRes.data       || []
  const profiles   = profilesRes.data   || []
  const authUsers  = usersRes.data?.users || []

  const countBy  = (arr: any[], cid: string) => (arr || []).filter((x: any) => x.company_id === cid).length
  const sumBy    = (arr: any[], cid: string) => (arr || [])
    .filter((x: any) => x.company_id === cid)
    .reduce((s: number, x: any) => s + Number(x.regelprijs || 0), 0)
  const lastDate = (arr: any[], cid: string) => {
    const dates = (arr || []).filter((x: any) => x.company_id === cid).map((x: any) => x.created_at)
    return dates.length ? [...dates].sort().reverse()[0] : null
  }

  const result = companies.map((company: any) => {
    const members = profiles.filter((p: any) => p.company_id === company.id)
    const sub     = subs.find((s: any) => s.company_id === company.id)

    let lastLogin: string | null = null
    const memberDetails = members.map((m: any) => {
      const au = authUsers.find((u: any) => u.id === m.id)
      const login = au?.last_sign_in_at || null
      if (login && (!lastLogin || login > lastLogin)) lastLogin = login
      return {
        id: m.id,
        fullName: m.full_name || '',
        email: au?.email || '',
        role: m.role || 'medewerker',
        createdAt: m.created_at,
        lastLogin: login,
        isSuperAdmin: m.is_super_admin || false,
      }
    })

    return {
      id: company.id,
      name: company.name,
      email: company.email || '',
      phone: company.phone || '',
      address: company.address || '',
      city: company.city || '',
      postalCode: company.postal_code || '',
      kvk: company.kvk || '',
      btwNumber: company.btw_number || '',
      website: company.website || '',
      logoUrl: company.logo_url || '',
      brandingColor: company.branding_color || '#f97316',
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
        startedAt: sub.started_at,
        notes: sub.notes || '',
      } : null,
      stats: {
        klanten:           countBy(custRes.data, company.id),
        projecten:         countBy(projRes.data, company.id),
        offertes:          countBy(offRes.data,  company.id),
        facturen:          countBy(factRes.data, company.id),
        werkbonnen:        countBy(wbRes.data,   company.id),
        omzet:             sumBy(regels, company.id),
        laatsteActiviteit: lastDate(actRes.data, company.id),
      },
    }
  })

  return json({ companies: result })
})
