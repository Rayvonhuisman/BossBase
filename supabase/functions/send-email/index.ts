import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logMailFout } from '../_shared/mailFout.ts'
import { inactiefReden } from '../_shared/actieveGebruiker.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Constant-time string-vergelijking, zodat het interne secret niet via
// response-timing kan lekken. Zelfde patroon als _shared/scheduledSync.ts.
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

// True wanneer de request het juiste interne secret meestuurt (backend-aanroepers
// als create-notification / stripe-webhook). Het secret staat als function-env
// SEND_EMAIL_SECRET. Ontbreekt de env → nooit als intern beschouwd (fail-safe:
// dan is enkel de ingelogde-gebruiker-modus toegestaan).
function isInternalCall(req: Request): boolean {
  const expected = Deno.env.get('SEND_EMAIL_SECRET') ?? ''
  const provided = req.headers.get('x-internal-secret') ?? ''
  return Boolean(expected) && timingSafeEqual(provided, expected)
}

// Rate-limit per ingelogde gebruiker: max. MAX_PER_HOUR mails per uurvenster.
// Gebruikt de email_send_attempts-tabel (RLS aan, alleen service_role). Geeft
// true terug wanneer de mail GEWEIGERD moet worden.
const MAX_PER_HOUR = 60
async function isRateLimited(admin: any, userId: string): Promise<boolean> {
  const nowMs = Date.now()
  const { data: attempt } = await admin
    .from('email_send_attempts')
    .select('user_id, attempt_count, window_start')
    .eq('user_id', userId)
    .maybeSingle()

  if (attempt) {
    const windowMs = new Date(attempt.window_start).getTime()
    const withinHour = nowMs - windowMs < 60 * 60 * 1000
    if (withinHour && attempt.attempt_count >= MAX_PER_HOUR) return true
    const newCount = withinHour ? attempt.attempt_count + 1 : 1
    const newWindow = withinHour ? attempt.window_start : new Date(nowMs).toISOString()
    await admin.from('email_send_attempts').update({
      last_attempt: new Date(nowMs).toISOString(),
      attempt_count: newCount,
      window_start: newWindow,
    }).eq('user_id', userId)
  } else {
    await admin.from('email_send_attempts').insert({
      user_id: userId,
      last_attempt: new Date(nowMs).toISOString(),
      attempt_count: 1,
      window_start: new Date(nowMs).toISOString(),
    })
  }
  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── Autorisatie ─────────────────────────────────────────────────────────
    // send-email is GEEN open relay: de aanroeper moet zich bewijzen als óf een
    // vertrouwde backend-functie (intern secret), óf een echte ingelogde
    // gebruiker (geldige user-JWT). De publieke anon-key alleen — waarmee
    // verify_jwt aan de gateway passeert — levert géén user op en wordt hier
    // dus geweigerd.
    const internal = isInternalCall(req)
    let gebruikerBedrijf: string | null = null

    if (!internal) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const authHeader  = req.headers.get('Authorization') || ''
      if (!authHeader) return json({ success: false, error: 'Niet geautoriseerd' }, 401)

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: { user }, error: userErr } = await userClient.auth.getUser()
      if (userErr || !user) return json({ success: false, error: 'Ongeldige sessie' }, 401)
      // service_role omzeilt RLS: zelf controleren dat account en bedrijf actief zijn.
      const inactief = await inactiefReden(user.id)
      if (inactief) return json({ error: inactief }, 403)

      const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      if (await isRateLimited(admin, user.id)) {
        return json({ success: false, error: 'Te veel e-mails verstuurd, probeer het later opnieuw' }, 429)
      }

      // ── Read-only ─────────────────────────────────────────────────────────
      // Zonder geldig abonnement gaat uitgaande post dicht: offertes en facturen
      // versturen, klantmailings, teamuitnodigingen. Dit moet hier en niet in de
      // RLS, want send-email verstuurt via de service-role en zou een policy dus
      // niet tegenkomen.
      //
      // Alleen voor een echte gebruiker. INTERNE aanroepen blijven lopen —
      // betalingsherinneringen, wachtwoord vergeten, verificatiecodes en onze
      // eigen meldingen. Een herinnering op een openstaande factuur is juist
      // geld dat binnenkomt; die tegenhouden zou nergens op slaan.
      //
      // Faalt de aanroep zelf, dan sturen we gewoon: dat is dezelfde
      // veiligheidsklep als in de database. Een storing hier mag nooit de post
      // van een betalende klant tegenhouden.
      const { data: readonly, error: readonlyErr } = await userClient.rpc('bb_is_readonly')
      if (!readonlyErr && readonly === true) {
        return json({
          success: false,
          code: 'readonly',
          error: 'Je account staat op alleen-lezen. Versturen kan weer zodra je een abonnement afsluit.',
        }, 403)
      }

      // ── Geen open relay ───────────────────────────────────────────────────
      // Een gebruiker mag alleen mailen vanuit zijn eigen bedrijf, naar adressen
      // die bij dat bedrijf horen (klanten, leveranciers, teamleden, aanvragen,
      // het bedrijfsadres), met een geverifieerd e-mailadres. Afzendernaam en
      // reply-to bepaalt de server, niet de aanroeper. Zie audit 2026-10-01, K2.
      const { data: prof } = await admin.from('profiles')
        .select('company_id, email_verified_at').eq('id', user.id).maybeSingle()
      if (!prof?.company_id) return json({ success: false, error: 'Geen bedrijf gekoppeld aan dit account' }, 403)
      if (!prof.email_verified_at) {
        return json({ success: false, code: 'niet_geverifieerd', error: 'Bevestig eerst je e-mailadres voordat je mail verstuurt.' }, 403)
      }
      gebruikerBedrijf = prof.company_id
    }

    // ── Verzenden ─────────────────────────────────────────────────────────────
    // `soort`, `company_id` en de gerelateerde verwijzing zijn optioneel en dienen
    // alleen om een MISLUKTE mail herkenbaar vast te leggen in mail_fouten.
    const { to, subject, html, from_name, reply_to, attachments, soort, company_id, gerelateerd_type, gerelateerd_id } = await req.json()

    if (!to || !subject || !html) {
      return json({ success: false, error: 'to, subject en html zijn verplicht' }, 400)
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
    if (!apiKey) {
      return json({ success: false, error: 'Mail is niet geconfigureerd' }, 500)
    }

    const ontvangers = (Array.isArray(to) ? to : [to]).map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
    if (!ontvangers.length) return json({ success: false, error: 'Geen ontvanger opgegeven' }, 400)

    let label: string
    let replyTo: string | null = null
    let bijlagen: unknown[] = []

    if (gebruikerBedrijf) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

      if (ontvangers.length > 5) return json({ success: false, error: 'Maximaal 5 ontvangers per mail' }, 400)
      const { data: buiten, error: buitenErr } = await admin.rpc('bb_mail_ontvangers_buiten_bedrijf', {
        p_company: gebruikerBedrijf, p_emails: ontvangers,
      })
      if (buitenErr) return json({ success: false, error: 'Ontvanger kon niet worden gecontroleerd' }, 500)
      if (Array.isArray(buiten) && buiten.length) {
        return json({
          success: false,
          code: 'ontvanger_onbekend',
          error: `Je kunt alleen mailen naar klanten, leveranciers en teamleden van je bedrijf. Voeg ${buiten.join(', ')} eerst toe aan een klant of leverancier.`,
        }, 403)
      }

      const { data: bedrijf } = await admin.from('companies')
        .select('name, email, reply_to_email').eq('id', gebruikerBedrijf).maybeSingle()
      // Afzendernaam: de bedrijfsnaam, of "BossBase" voor de platformmail
      // (teamuitnodiging). Nooit een vrije tekst van de aanroeper.
      label = from_name === 'BossBase' ? 'BossBase' : (bedrijf?.name?.trim() || 'BossBase')
      replyTo = bedrijf?.reply_to_email || bedrijf?.email || null

      // Bijlagen: alleen PDF's, hooguit 3, samen hooguit ~10 MB.
      if (Array.isArray(attachments) && attachments.length) {
        if (attachments.length > 3) return json({ success: false, error: 'Maximaal 3 bijlagen' }, 400)
        let totaal = 0
        for (const a of attachments) {
          const naam = String(a?.filename ?? '')
          const inhoud = String(a?.content ?? '')
          if (!/\.pdf$/i.test(naam) || !inhoud) return json({ success: false, error: 'Alleen PDF-bijlagen zijn toegestaan' }, 400)
          totaal += inhoud.length
        }
        if (totaal > 14_000_000) return json({ success: false, error: 'Bijlagen zijn te groot' }, 400)
        bijlagen = attachments.map((a: { filename: string; content: string }) => ({ filename: a.filename, content: a.content }))
      }
    } else {
      // Interne aanroepen (andere edge functions met het geheim) bepalen zelf.
      label = from_name && String(from_name).trim() ? String(from_name).trim() : 'BossBase'
      if (typeof reply_to === 'string' && reply_to.includes('@')) replyTo = reply_to
      if (Array.isArray(attachments)) bijlagen = attachments
    }

    // Het e-mailadres blijft technisch noreply@bossbase.nl. Tekens die een
    // From-kop kunnen breken eruit.
    const fromLabel = `${label.replace(/[<>"\r\n]/g, '')} <${fromEmail}>`

    const payload: Record<string, unknown> = { from: fromLabel, to: ontvangers, subject, html }
    if (replyTo) payload.reply_to = replyTo
    if (bijlagen.length > 0) payload.attachments = bijlagen

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      const melding = data.message || `Resend gaf status ${res.status}`
      await logMailFout({
        soort: soort || 'onbekend',
        ontvanger: String(to),
        companyId: company_id || null,
        bedrijfNaam: label,
        fout: String(melding),
        bron: 'send-email',
        gerelateerdType: gerelateerd_type || null,
        gerelateerdId: gerelateerd_id || null,
      })
      return json({ success: false, error: 'De mail kon niet worden verstuurd. Controleer het adres en probeer het opnieuw.' }, 502)
    }

    return json({ success: true, message_id: data.id })
  } catch (err) {
    // Netwerkfout of onverwachte uitzondering: ook dát is post die niet aankwam.
    await logMailFout({ soort: 'onbekend', ontvanger: null, fout: String(err), bron: 'send-email' })
    console.error('send-email', err)
    return json({ success: false, error: 'Versturen mislukt door een interne fout' }, 500)
  }
})
