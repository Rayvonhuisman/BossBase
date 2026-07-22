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
    const { token, fullName, password } = await req.json()
    if (!token || !password) return json({ error: 'token en password zijn verplicht' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Haal uitnodiging op
    const { data: invite, error: inviteErr } = await supabase
      .from('company_members')
      .select('id, email, role, company_id, invite_expires_at')
      .eq('invite_token', token)
      .maybeSingle()

    if (inviteErr || !invite) return json({ error: 'Uitnodiging niet gevonden' }, 404)

    if (!invite.invite_expires_at || new Date(invite.invite_expires_at) < new Date()) {
      return json({ error: 'Uitnodiging is verlopen' }, 410)
    }

    // 2. Maak auth-gebruiker aan (email_confirm: true = geen verificatiemail nodig)
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || '' },
    })

    let userId: string
    let isExistingUser = false

    if (authErr) {
      if (authErr.message?.toLowerCase().includes('already')) {
        // Gebruiker bestaat al — zoek bestaande userId op.
        // Gebruik dezelfde SECURITY DEFINER RPC als de wachtwoord-reset flow.
        const { data: existingId } = await supabase.rpc('get_auth_user_id_by_email', {
          p_email: invite.email.toLowerCase(),
        })
        if (!existingId) {
          return json({ error: 'Dit e-mailadres is al geregistreerd. Probeer in te loggen.' }, 409)
        }
        userId = existingId
        isExistingUser = true
      } else {
        return json({ error: authErr.message }, 400)
      }
    } else {
      userId = authData.user.id
    }

    // 2b. Anti-tenant-hijack: een BESTAAND account wordt nooit stil verplaatst.
    // Zonder deze guard kon een aanvaller een bestaande gebruiker naar zijn eigen
    // bedrijf trekken, puur door een invite met dat e-mailadres aan te maken en te
    // accepteren (de service-role omzeilt de profiel-trigger). Nieuwe accounts
    // (createUser slaagde) doorlopen dit niet en volgen de normale invite-flow.
    if (isExistingUser) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userId)
        .maybeSingle()
      const currentCompany = existingProfile?.company_id ?? null

      // (1) Hoort al bij een ANDER bedrijf → koppelen/overschrijven mag nooit.
      if (currentCompany && currentCompany !== invite.company_id) {
        return json({
          error: 'Dit e-mailadres hoort al bij een ander bedrijf. Log in met dat account om verder te gaan.',
        }, 409)
      }

      // (2) Bewijs van bezit: alleen de rechtmatige eigenaar (geldige JWT van
      // diezelfde gebruiker) mag een bestaand account aan de invite koppelen —
      // niet puur op basis van het e-mailadres in de invite.
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      let owns = false
      if (jwt) {
        const { data: { user } } = await supabase.auth.getUser(jwt)
        owns = !!user && user.id === userId
      }
      if (!owns) {
        return json({
          error: 'Dit e-mailadres is al geregistreerd. Log in met dit account om de uitnodiging te accepteren.',
        }, 401)
      }
    }

    // 3. Maak profiel aan of update als trigger het al aangemaakt heeft.
    // De DB-trigger handle_new_user slaat altijd een profiel op zodra een
    // auth-user wordt aangemaakt. Insert faalt dan met "duplicate key".
    // In beide gevallen (nieuwe insert of bestaand profiel) moet company_id
    // en rol correct worden ingesteld.
    // email_verified_at direct zetten: de invite-mail ís de verificatie, dus
    // uitgenodigde teamleden hoeven geen 6-cijferige code in te vullen.
    const nowIso = new Date().toISOString()
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: userId,
      company_id: invite.company_id,
      full_name: fullName || '',
      role: invite.role || 'medewerker',
      email_verified_at: nowIso,
    })

    if (profileErr) {
      // Insert mislukt (profiel al aangemaakt door trigger): altijd updaten
      await supabase.from('profiles').update({
        company_id: invite.company_id,
        full_name: fullName || '',
        role: invite.role || 'medewerker',
        email_verified_at: nowIso,
      }).eq('id', userId)
    }

    // 4. Koppel company_members record aan het nieuwe profiel
    await supabase.from('company_members').update({
      profile_id: userId,
      status: 'actief',
      accepted_at: new Date().toISOString(),
      invite_token: null,
      invite_expires_at: null,
    }).eq('id', invite.id)

    return json({ success: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
