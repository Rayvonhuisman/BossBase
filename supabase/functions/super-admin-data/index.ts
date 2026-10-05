import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clientFout } from '../_shared/clientFout.ts'
import { alleRijen } from '../_shared/alleRijen.ts'

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

  const body = await req.json().catch(() => ({}))

  // ── Status van een aanvraag via bossbase.nl wijzigen ─────────────────────
  // Alleen aanvragen van formulieren met bestemming 'superadmin': zo kan deze
  // actie nooit een aanvraag van een klant van BossBase aanraken.
  if (body?.actie === 'aanvraag_status') {
    const STATUSSEN = ['nieuw', 'in_behandeling', 'gekwalificeerd', 'afgewezen', 'spam']
    if (!STATUSSEN.includes(body.status)) return json({ error: 'Onbekende status' }, 400)
    const { data: formulieren } = await svc.from('website_forms').select('id').eq('settings->>bestemming', 'superadmin')
    const { data, error } = await svc.from('inquiries')
      .update({ status: body.status })
      .eq('id', body.id)
      .in('form_id', (formulieren || []).map((f: any) => f.id))
      .select('id, status')
      .maybeSingle()
    if (error) return json({ error: clientFout(error) }, 500)
    if (!data) return json({ error: 'Aanvraag niet gevonden' }, 404)
    return json({ aanvraag: data })
  }

  // Aanvragen via bossbase.nl (formulieren met bestemming 'superadmin').
  const { data: saFormulieren } = await svc.from('website_forms').select('id').eq('settings->>bestemming', 'superadmin')
  const saFormIds = (saFormulieren || []).map((f: any) => f.id)

  // Platformbreed boven 1000 rijen gaf één query stil te weinig terug, en
  // daarmee te lage tellingen per bedrijf (audit 2026-10-01, P8). Daarom
  // gepagineerd. Fouten gaan, net als eerst, als lege lijst door.
  const alle = (maak: () => any) => alleRijen(maak).then(data => ({ data })).catch(() => ({ data: [] }))
  const alleAuthGebruikers = async () => {
    const users: any[] = []
    for (let page = 1; ; page++) {
      const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000, page })
      if (error) break
      users.push(...(data?.users || []))
      if (!data?.users || data.users.length < 1000) break
    }
    return { data: { users } }
  }

  // Alle queries parallel
  const [
    companiesRes, subsRes, profilesRes, usersRes,
    custRes, projRes, offRes, factRes, wbRes, actRes, betaaldFactRes,
  ] = await Promise.all([
    svc.from('companies').select(
      'id, name, email, phone, address, city, postal_code, kvk, btw_number, website, logo_url, branding_color, created_at, status, branche'
    ).order('created_at', { ascending: false }),
    svc.from('subscriptions').select('*'),
    alle(() => svc.from('profiles').select('id, company_id, full_name, role, created_at, is_super_admin, telefoon')),
    alleAuthGebruikers(),
    alle(() => svc.from('customers').select('company_id')),
    alle(() => svc.from('projects').select('company_id')),
    alle(() => svc.from('offertes').select('company_id')),
    alle(() => svc.from('facturen').select('company_id')),
    alle(() => svc.from('werkbonnen').select('company_id')),
    alle(() => svc.from('activities').select('company_id, created_at')),
    alle(() => svc.from('facturen').select('id, company_id').eq('status', 'betaald')),
  ])

  const { data: inquiries } = saFormIds.length
    ? await svc.from('inquiries')
        .select('id, name, company_name, email, phone, subject, message, source_url, status, is_test, metadata, created_at')
        .in('form_id', saFormIds)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] }

  // Omzet: som van regelprijs van betaalde facturen
  const betaaldIds = (betaaldFactRes.data || []).map((f: any) => f.id)
  let regels: any[] = []
  if (betaaldIds.length > 0) {
    // Per blok van 200 facturen (lengte van de URL) en per blok gepagineerd.
    for (let i = 0; i < betaaldIds.length; i += 200) {
      const blok = betaaldIds.slice(i, i + 200)
      regels.push(...await alleRijen(() => svc
        .from('factuur_regels')
        .select('factuur_id, company_id, regelprijs')
        .in('factuur_id', blok)))
    }
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
        telefoon: m.telefoon || '',
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
      branche: company.branche || '',
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
        interval: sub.billing_interval || null,
        stripeStatus: sub.stripe_status || null,
        heeftStripe: !!sub.stripe_subscription_id,
        periodeEinde: sub.current_period_end || null,
        stoptOp: sub.stopt_op || (sub.cancel_at_period_end ? sub.current_period_end : null),
        verplichtingTot: sub.verplichting_tot || null,
        opgezegdOp: sub.cancelled_at || null,
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

  const aanvragen = (inquiries || []).map((a: any) => ({
    id: a.id,
    naam: a.name,
    bedrijf: a.company_name || '',
    email: a.email,
    telefoon: a.phone || '',
    onderwerp: a.subject || '',
    bericht: a.message || '',
    pagina: a.source_url || '',
    branche: a.metadata?.branche || '',
    status: a.status,
    isTest: !!a.is_test,
    ontvangenOp: a.created_at,
  }))

  return json({ companies: result, aanvragen })
})
