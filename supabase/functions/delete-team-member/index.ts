// Teamlid verwijderen / (de)activeren met service role.
// - delete:     hard verwijderen — auth.users + profiel weg, sessies ongeldig.
// - deactivate: actief=false + ban + status inactief — kan niet meer inloggen,
//               wordt bij volgende profiel-load uitgelogd. Omkeerbaar.
// - activate:   heractiveren — actief=true, ban op, status actief.
//
// Beveiliging: caller moet admin (of super-admin) van HETZELFDE bedrijf zijn.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ~100 jaar ban = "voor onbepaalde tijd", maar omkeerbaar via 'none'.
const FOREVER_BAN = '876000h'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { memberId, action } = await req.json()
    if (!memberId || !['delete', 'deactivate', 'activate'].includes(action)) {
      return json({ success: false, error: 'memberId en een geldige action zijn verplicht' }, 400)
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Caller bepalen uit zijn JWT.
    const authHeader = req.headers.get('Authorization') || ''
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user: caller } } = await asUser.auth.getUser()
    if (!caller) return json({ success: false, error: 'Niet geauthenticeerd' }, 401)

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Teamlid + bedrijf ophalen.
    const { data: member, error: mErr } = await admin
      .from('company_members')
      .select('id, company_id, profile_id')
      .eq('id', memberId)
      .maybeSingle()
    if (mErr) throw mErr
    if (!member) return json({ success: false, error: 'Teamlid niet gevonden' }, 404)

    // Caller moet admin/super-admin van hetzelfde bedrijf zijn.
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('id, company_id, role, is_super_admin')
      .eq('id', caller.id)
      .maybeSingle()
    const allowed = callerProfile && (
      callerProfile.is_super_admin === true ||
      (callerProfile.role === 'admin' && callerProfile.company_id === member.company_id)
    )
    if (!allowed) return json({ success: false, error: 'Geen rechten voor deze actie' }, 403)

    // Niet je eigen account langs deze weg slopen.
    if (member.profile_id && member.profile_id === caller.id) {
      return json({ success: false, error: 'Je kunt je eigen account hier niet wijzigen' }, 400)
    }

    const pid = member.profile_id as string | null

    if (action === 'deactivate') {
      if (pid) {
        await admin.from('profiles').update({ actief: false, deactivated_at: new Date().toISOString() }).eq('id', pid)
        // Ban → refresh tokens ongeldig, kan niet opnieuw inloggen (omkeerbaar).
        await admin.auth.admin.updateUserById(pid, { ban_duration: FOREVER_BAN })
      }
      await admin.from('company_members').update({ status: 'inactief' }).eq('id', memberId)
      return json({ success: true, action })
    }

    if (action === 'activate') {
      if (pid) {
        await admin.from('profiles').update({ actief: true, deactivated_at: null }).eq('id', pid)
        await admin.auth.admin.updateUserById(pid, { ban_duration: 'none' })
      }
      await admin.from('company_members').update({ status: 'actief' }).eq('id', memberId)
      return json({ success: true, action })
    }

    // action === 'delete' (hard verwijderen)
    if (pid) {
      // auth.users verwijderen → alle sessies/refresh tokens direct ongeldig.
      const { error: delAuthErr } = await admin.auth.admin.deleteUser(pid)
      if (delAuthErr && !/not.*found|404|user.*does not exist/i.test(delAuthErr.message)) {
        throw delAuthErr
      }
      // Profiel verwijderen → cascade't company_members + uren/permissies/notificaties,
      // en zet assigned_to (werkbonnen/activiteiten/deals/projecten) op NULL.
      await admin.from('profiles').delete().eq('id', pid)
    }
    // Vangnet: uitgenodigd lid zonder profiel, of als cascade niet liep.
    await admin.from('company_members').delete().eq('id', memberId)
    return json({ success: true, action })
  } catch (err) {
    console.error('[delete-team-member] Fout:', err)
    return json({ success: false, error: String((err as Error)?.message || err) }, 500)
  }
})
