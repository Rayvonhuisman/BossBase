// Teamlid verwijderen / (de)activeren met service role.
// - delete:     hard verwijderen — auth.users + profiel weg, sessies ongeldig.
// - deactivate: actief=false + ban + status inactief — kan niet meer inloggen,
//               wordt bij volgende sessie-controle uitgelogd. Omkeerbaar.
// - activate:   heractiveren — actief=true, ban op, status actief.
//
// memberId mag een company_members.id zijn (openstaande uitnodiging) ÓF een
// profiles.id (een echt teamlid — dat is de bron die de rest van de app
// gebruikt; company_members is voor veel bedrijven leeg). We ondersteunen beide,
// want anders vond de functie het lid niet en werd auth.admin.deleteUser nooit
// bereikt → auth-account bleef bestaan en de gebruiker kon blijven inloggen.
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

    // ── Doelwit bepalen: company_members-rij of profiel ──────────────────────
    let memberRowId: string | null = null   // company_members.id (indien aanwezig)
    let pid: string | null = null           // profiles.id == auth.users.id
    let targetCompany: string | null = null

    const { data: member, error: mErr } = await admin
      .from('company_members')
      .select('id, company_id, profile_id')
      .eq('id', memberId)
      .maybeSingle()
    if (mErr) throw mErr

    if (member) {
      memberRowId = member.id
      pid = member.profile_id
      targetCompany = member.company_id
    } else {
      // Geen company_members-rij → behandel memberId als profiel-id (echt teamlid).
      const { data: prof, error: pErr } = await admin
        .from('profiles')
        .select('id, company_id')
        .eq('id', memberId)
        .maybeSingle()
      if (pErr) throw pErr
      if (prof) {
        pid = prof.id
        targetCompany = prof.company_id
      }
    }

    if (!memberRowId && !pid) return json({ success: false, error: 'Teamlid niet gevonden' }, 404)

    // Caller moet admin/super-admin van hetzelfde bedrijf zijn.
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('id, company_id, role, is_super_admin')
      .eq('id', caller.id)
      .maybeSingle()
    const allowed = callerProfile && (
      callerProfile.is_super_admin === true ||
      (callerProfile.role === 'admin' && callerProfile.company_id === targetCompany)
    )
    if (!allowed) return json({ success: false, error: 'Geen rechten voor deze actie' }, 403)

    // Niet je eigen account langs deze weg slopen.
    if (pid && pid === caller.id) {
      return json({ success: false, error: 'Je kunt je eigen account hier niet wijzigen' }, 400)
    }

    // Bescherm de laatste actieve beheerder: een bedrijf mag niet zonder admin
    // komen te zitten (anders is niemand meer in staat het team te beheren).
    if (pid && (action === 'deactivate' || action === 'delete')) {
      const { data: targetProfile } = await admin
        .from('profiles').select('role, company_id').eq('id', pid).maybeSingle()
      if (targetProfile?.role === 'admin' && targetProfile.company_id) {
        const { count } = await admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', targetProfile.company_id)
          .eq('role', 'admin')
          .eq('actief', true)
          .neq('id', pid)
        if ((count ?? 0) === 0) {
          return json({ success: false, error: 'Dit is de laatste actieve beheerder — wijs eerst een andere beheerder aan.' }, 409)
        }
      }
    }

    if (action === 'deactivate') {
      if (pid) {
        await admin.from('profiles').update({ actief: false, deactivated_at: new Date().toISOString() }).eq('id', pid)
        // Ban → refresh tokens ongeldig, kan niet opnieuw inloggen (omkeerbaar).
        await admin.auth.admin.updateUserById(pid, { ban_duration: FOREVER_BAN })
      }
      if (memberRowId) await admin.from('company_members').update({ status: 'inactief' }).eq('id', memberRowId)
      console.log('[delete-team-member] gedeactiveerd:', { memberId, profileId: pid })
      return json({ success: true, action })
    }

    if (action === 'activate') {
      if (pid) {
        await admin.from('profiles').update({ actief: true, deactivated_at: null }).eq('id', pid)
        await admin.auth.admin.updateUserById(pid, { ban_duration: 'none' })
      }
      if (memberRowId) await admin.from('company_members').update({ status: 'actief' }).eq('id', memberRowId)
      console.log('[delete-team-member] geactiveerd:', { memberId, profileId: pid })
      return json({ success: true, action })
    }

    // action === 'delete' (hard verwijderen)
    let authDeleted = false
    if (pid) {
      // auth.users verwijderen → alle sessies/refresh tokens direct ongeldig.
      const { data: delData, error: delAuthErr } = await admin.auth.admin.deleteUser(pid)
      if (delAuthErr) {
        const alreadyGone = /not.*found|404|user.*does not exist|user_not_found/i.test(delAuthErr.message)
        console.log('[delete-team-member] deleteUser resultaat:', {
          profileId: pid, ok: false, alreadyGone, error: delAuthErr.message,
        })
        // Account bestaat al niet meer = ook goed; andere fouten zijn echt fout.
        if (!alreadyGone) throw new Error(`auth.admin.deleteUser mislukt: ${delAuthErr.message}`)
        authDeleted = true
      } else {
        authDeleted = true
        console.log('[delete-team-member] deleteUser geslaagd:', { profileId: pid, user: delData?.user?.id ?? null })
      }
      // Profiel verwijderen → cascade't company_members + uren/permissies/notificaties,
      // en zet assigned_to (werkbonnen/activiteiten/deals/projecten) op NULL.
      const { error: profErr } = await admin.from('profiles').delete().eq('id', pid)
      if (profErr) console.log('[delete-team-member] profiel verwijderen waarschuwing:', profErr.message)
    } else {
      console.log('[delete-team-member] openstaande uitnodiging zonder profiel — alleen company_members-rij verwijderen', { memberId })
    }
    // Vangnet: openstaande uitnodiging, of als de cascade de rij niet meenam.
    if (memberRowId) await admin.from('company_members').delete().eq('id', memberRowId)
    console.log('[delete-team-member] klaar:', { memberId, profileId: pid, authDeleted })
    return json({ success: true, action, authDeleted })
  } catch (err) {
    console.error('[delete-team-member] Fout:', err)
    return json({ success: false, error: String((err as Error)?.message || err) }, 500)
  }
})
