// verify-code — controleert de 6-cijferige verificatiecode van de ingelogde
// gebruiker. Bij succes: markeert de code + profiel als geverifieerd en
// provisioneert het bedrijf (company + pipeline) als dat er nog niet is.
// verify_jwt=true: alleen de eigenaar van de sessie kan zijn eigen code checken.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hashVerificationCode, legacyHashVerificationCode, LEGACY_TOT, gelijk } from '../_shared/hashCode.ts'
import { legAkkoordVast } from '../_shared/akkoord.ts'
import { bronVanBezoeker } from '../_shared/meting.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const MAX_ATTEMPTS = 5

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    const { code } = await req.json().catch(() => ({}))
    if (!code || !/^\d{6}$/.test(String(code))) {
      return json({ success: false, code: 'INVALID', error: 'Vul de 6-cijferige code in.' }, 400)
    }

    // Aanroeper uit de JWT (niet uit de body).
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ success: false, error: 'Niet ingelogd' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ success: false, error: 'Ongeldige sessie' }, 401)

    const userId = user.id
    const admin  = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Al geverifieerd? Idempotent succes.
    const { data: prof } = await admin.from('profiles')
      .select('email_verified_at, company_id').eq('id', userId).maybeSingle()
    if (prof?.email_verified_at) return json({ success: true, alreadyVerified: true })

    // Meest recente, nog niet gebruikte code voor deze user.
    const { data: row } = await admin.from('email_verification_codes')
      .select('id, code_hash, expires_at, verified_at, attempts, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!row || row.verified_at) {
      return json({ success: false, code: 'NO_CODE', error: 'Geen geldige code gevonden. Vraag een nieuwe code aan.' }, 400)
    }
    if (new Date(row.expires_at) < new Date()) {
      return json({ success: false, code: 'EXPIRED', error: 'Code is verlopen. Vraag een nieuwe code aan.' }, 400)
    }
    // Eerst de poging tellen, atomair: twee gelijktijdige verzoeken kunnen zo
    // nooit samen meer dan MAX_ATTEMPTS pogingen opleveren. Geen rij terug =
    // het maximum is bereikt.
    const { data: poging } = await admin.rpc('bb_verificatie_poging', { p_id: row.id, p_max: MAX_ATTEMPTS })
    if (poging === null || poging === undefined) {
      return json({ success: false, code: 'TOO_MANY', error: 'Te veel pogingen. Vraag een nieuwe code aan.' }, 400)
    }

    // Hash de ingevoerde code en vergelijk (constante tijd). Codes van vóór de
    // overstap op HMAC gebruiken nog de oude hash.
    const invoer = String(code)
    let klopt = gelijk(await hashVerificationCode(invoer, userId), row.code_hash)
    if (!klopt && row.created_at && row.created_at < LEGACY_TOT) {
      klopt = gelijk(await legacyHashVerificationCode(invoer, userId), row.code_hash)
    }
    if (!klopt) {
      const remaining = MAX_ATTEMPTS - Number(poging)
      if (remaining <= 0) {
        return json({ success: false, code: 'TOO_MANY', error: 'Te veel pogingen. Vraag een nieuwe code aan.' }, 400)
      }
      return json({ success: false, code: 'MISMATCH', remaining, error: `Code is onjuist. Nog ${remaining} ${remaining === 1 ? 'poging' : 'pogingen'}.` }, 400)
    }

    // Vangnet: kwam het akkoord bij registratie niet aan (akkoord-vastleggen
    // faalde), leg het dan nu vast. Een account bestaat niet zonder akkoord.
    try {
      if (await legAkkoordVast(admin, user, req, 'registratie_vangnet', { alleenEerste: true })) {
        console.log('[verify-code] Akkoord via vangnet vastgelegd', { user: userId })
      }
    } catch (e) {
      console.error('[verify-code] Akkoord vastleggen mislukt', { user: userId, error: String(e) })
      return json({ success: false, error: 'Account aanmaken mislukt. Probeer het opnieuw.' }, 500)
    }

    // ── Match → markeer geverifieerd ──────────────────────────────────────────
    const now = new Date().toISOString()
    await admin.from('email_verification_codes').update({ verified_at: now }).eq('id', row.id)
    await admin.from('profiles').update({ email_verified_at: now }).eq('id', userId)

    // Provision company + pipeline als die er nog niet is. provision_account
    // gebruikt auth.uid(), dus aanroepen via de user-scoped client. De RPC is
    // SECURITY DEFINER (draait als owner) → de protect_profile_privileges
    // trigger blokkeert de company_id-koppeling niet.
    let companyId = prof?.company_id || null
    if (!companyId) {
      const meta = user.user_metadata || {}
      const companyName = meta.company_name || (user.email ? user.email.split('@')[0] : 'Mijn bedrijf')
      const { data: rpcData, error: rpcErr } = await userClient.rpc('provision_account', {
        p_company_name: companyName,
        p_full_name:    meta.full_name || '',
        p_email:        user.email || null,
        p_phone:        meta.phone || null,
        p_kvk:          meta.kvk || null,
      })
      if (rpcErr) {
        console.error('[verify-code] provision_account fout:', rpcErr)
        return json({ success: false, error: 'Account aanmaken mislukt. Probeer het opnieuw.' }, 500)
      }
      companyId = rpcData?.company_id || null

      // De proef start op het pakket dat de klant bij aanmelden koos (groei of
      // team). De trigger op companies zet altijd groei; alleen bij een vers
      // aangemaakt bedrijf in de proefperiode zetten we hem om. Audit A2.
      if (companyId && rpcData?.status === 'created' && meta.gekozen_pakket === 'team') {
        const { error: pakketErr } = await admin.from('subscriptions')
          .update({ plan: 'team' }).eq('company_id', companyId).eq('status', 'trial')
        if (pakketErr) console.error('[verify-code] proefpakket zetten mislukt:', pakketErr.message)
      }

      // Branche en telefoonnummer uit het aanmeldformulier. Best-effort: een
      // fout hier mag het account niet tegenhouden, het bedrijf bestaat al.
      const branche = typeof meta.branche === 'string' ? meta.branche.trim().slice(0, 60) : ''
      if (companyId && rpcData?.status === 'created' && branche) {
        const { error: brancheErr } = await admin.from('companies').update({ branche }).eq('id', companyId)
        if (brancheErr) console.error('[verify-code] branche zetten mislukt:', brancheErr.message)
      }
      // Langs welk kanaal kwam dit account binnen? Uit de eigen cookievrije
      // meting van bossbase.nl, alleen als de bezoeker vandaag op de site was.
      // Alleen het kanaal wordt bewaard, nooit de bezoekershash.
      if (companyId && rpcData?.status === 'created') {
        const bron = await bronVanBezoeker(admin, req)
        if (bron) {
          const { error: bronErr } = await admin.from('companies').update({ aanmeldbron: bron }).eq('id', companyId)
          if (bronErr) console.error('[verify-code] aanmeldbron zetten mislukt:', bronErr.message)
        }
      }
      const telefoon = typeof meta.phone === 'string' ? meta.phone.trim().slice(0, 30) : ''
      if (telefoon) {
        const { error: telErr } = await admin.from('profiles').update({ telefoon }).eq('id', userId).is('telefoon', null)
        if (telErr) console.error('[verify-code] telefoon zetten mislukt:', telErr.message)
      }
    }

    console.log('[verify-code] Geverifieerd ✓', { user: userId })
    return json({ success: true, companyId })
  } catch (err) {
    console.error('[verify-code] Fout:', err)
    return json({ success: false, error: 'Verifiëren mislukt door een interne fout. Probeer het opnieuw.' }, 500)
  }
})
