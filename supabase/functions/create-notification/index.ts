// create-notification — maakt in-app notificaties aan voor collega's met de
// service-role, na validatie dat de aanroeper en de doelgebruiker(s) in
// HETZELFDE bedrijf zitten. Hierdoor kan de RLS INSERT-policy op notifications
// streng zijn (alleen self-insert vanaf de client) en is collega-spoofing
// uitgesloten. verify_jwt=true zorgt dat alleen ingelogde gebruikers aanroepen.
//
// Optioneel stuurt deze function ook een e-mail per notificatie (payload
// `email: true`; een oud `{ subject, html }`-object telt ook als "ja"). De
// inhoud van de mail bouwt deze functie ZELF uit titel, tekst en link van de
// melding — HTML of onderwerp van de client wordt genegeerd. Anders was dit een
// kanaal om collega's willekeurige HTML-mail met afzender "BossBase" te sturen,
// buiten de mail-limiet om (audit 2026-10-01, B-8/M13). Elke mail telt mee in
// dezelfde limiet per gebruiker als send-email (60 per uur). Het e-mailADRES wordt UITSLUITEND hier
// server-side opgelost — primair uit auth.users (de canonieke login-email, met
// dezelfde identiteit als profiles.id waaruit medewerkers geselecteerd worden),
// met company_members.email als terugval. Adressen worden nooit naar de client
// teruggegeven, zodat een gebruiker het mailadres van een collega niet kan
// uitlezen. Verzenden gebeurt via de bestaande send-email edge function.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logMailFout } from '../_shared/mailFout.ts'
import { inactiefReden } from '../_shared/actieveGebruiker.ts'
import { mailTemplate } from '../_shared/mailTemplate.ts'

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Zelfde vertaling als notificatieService.toAbsoluteUrl: 'werkbonnen/<id>' →
// https://www.bossbase.nl/dashboard/werkbonnen?open=<id>. Alleen paginanamen
// uit de app; alles wat geen eenvoudig pad is, krijgt geen knop.
function appLink(link: unknown): string | undefined {
  const schoon = String(link ?? '').replace(/^\//, '')
  if (!/^[a-z_-]+(\/[0-9a-f-]{36})?$/i.test(schoon)) return undefined
  const [pagina, id] = schoon.split('/')
  const basis = `https://www.bossbase.nl/dashboard/${pagina}`
  return id ? `${basis}?open=${encodeURIComponent(id)}` : basis
}

// Dezelfde teller als send-email (email_send_attempts): mails die een gebruiker
// via meldingen laat versturen, tellen mee in zijn limiet.
const MAX_PER_UUR = 60
async function mailLimietBereikt(admin: any, userId: string): Promise<boolean> {
  const nu = Date.now()
  const { data: a } = await admin.from('email_send_attempts')
    .select('attempt_count, window_start').eq('user_id', userId).maybeSingle()
  if (a) {
    const binnenUur = nu - new Date(a.window_start).getTime() < 3600_000
    if (binnenUur && a.attempt_count >= MAX_PER_UUR) return true
    await admin.from('email_send_attempts').update({
      last_attempt: new Date(nu).toISOString(),
      attempt_count: binnenUur ? a.attempt_count + 1 : 1,
      window_start: binnenUur ? a.window_start : new Date(nu).toISOString(),
    }).eq('user_id', userId)
  } else {
    await admin.from('email_send_attempts').insert({
      user_id: userId, last_attempt: new Date(nu).toISOString(), attempt_count: 1, window_start: new Date(nu).toISOString(),
    })
  }
  return false
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Los het ontvangeradres server-side op. Nooit terug naar de client sturen.
async function resolveRecipientEmail(admin: any, userId: string, companyId: string): Promise<string | null> {
  // Primair: canonieke login-email uit auth.users (zelfde identiteit als
  // profiles.id — de bron waaruit medewerkers geselecteerd worden).
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    const email = data?.user?.email
    if (email) return email
  } catch { /* val terug op company_members */ }
  // Terugval: company_members.email binnen HETZELFDE bedrijf.
  const { data: m } = await admin
    .from('company_members')
    .select('email')
    .eq('profile_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()
  return m?.email || null
}

// Verstuur via de bestaande send-email edge function (service-role passeert
// verify_jwt). Best-effort: retourneert of het gelukt is, gooit niet.
async function sendViaEdge(
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'x-internal-secret': Deno.env.get('SEND_EMAIL_SECRET') ?? '',
      },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ success: false, error: 'Niet ingelogd' }, 401)

    // Bepaal de aanroeper uit de JWT
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

    // Bedrijf van de aanroeper
    const { data: me } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    const companyId = me?.company_id
    if (!companyId) return json({ success: false, error: 'Geen bedrijf gekoppeld' }, 400)

    const payload = await req.json().catch(() => ({}))
    const list = Array.isArray(payload?.notifications) ? payload.notifications : []
    if (!list.length) return json({ success: true, inserted: 0 })

    // Valideer per notificatie dat de doelgebruiker in hetzelfde bedrijf zit.
    // Verzamel tegelijk de e-mailopdrachten (alleen voor gevalideerde targets).
    const rows: Record<string, unknown>[] = []
    const mailJobs: { userId: string; title: string; body: string | null; link: unknown; soort: string }[] = []
    for (const n of list.slice(0, 50)) {
      if (!n?.user_id || !n?.type || !n?.title) continue
      // Bewust GEEN self-skip: een self-tag levert óók een melding + mail op.
      const { data: target } = await admin
        .from('profiles')
        .select('id')
        .eq('id', n.user_id)
        .eq('company_id', companyId)
        .maybeSingle()
      if (!target) continue // cross-company / onbekend → overslaan
      rows.push({
        company_id:   companyId,
        user_id:      n.user_id,
        type:         String(n.type),
        title:        String(n.title),
        body:         n.body ?? null,
        link:         n.link ?? null,
        related_type: n.related_type ?? null,
        related_id:   n.related_id ?? null,
        created_by:   user.id,
      })
      if (n.email) {
        // `soort` reist mee zodat een mislukte mail herkenbaar in mail_fouten
        // komt: 'mention', 'toewijzing_werkbon', 'planning_verzet', …
        mailJobs.push({
          userId: n.user_id,
          title: String(n.title).slice(0, 200),
          body: n.body ? String(n.body).slice(0, 1000) : null,
          link: n.link,
          soort: String(n.type || 'collega_melding'),
        })
      }
    }

    if (rows.length) {
      const { error: insErr } = await admin.from('notifications').insert(rows)
      if (insErr) { console.error('[create-notification]', insErr.message); return json({ success: false, error: 'Melding opslaan mislukt' }, 500) }
    }

    // E-mails versturen (best-effort, blokkeert de notificatie-insert niet).
    let emailed = 0
    if (mailJobs.length) {
      const { data: co } = await admin
        .from('companies')
        .select('name, reply_to_email, email')
        .eq('id', companyId)
        .maybeSingle()
      // Interne post komt van BossBase, niet van het bedrijf. De huisstijl van
      // een bedrijf is voor communicatie naar HUN klanten; een monteur die "je
      // bent getagd" of "je bent ingepland" krijgt, hoort te zien dat het
      // systeem dat stuurt. De HTML deed dit al goed (mailTemplate zonder
      // companyName = BossBase-variant); alleen de afzendernaam liep nog mee.
      const fromName = 'BossBase'
      // De echte bedrijfsnaam blijft wél nodig: die gaat naar mail_fouten, zodat
      // daar leesbaar staat bij welk bedrijf de post is blijven liggen.
      const bedrijfsnaam = co?.name || 'onbekend bedrijf'
      // Reply-to = het bedrijfsadres, bewust NIET het adres van degene die tagde
      // of toewees. Gemeten: een medewerker kan de adressen van collega's
      // nergens in de app zien — company_members geeft hem alleen zijn eigen
      // regel (RLS: profile_id = auth.uid() of admin), profiles heeft niet eens
      // een e-mailkolom, en de medewerkerkiezer haalt alleen naam en avatar op.
      // Het adres van de afzender in de header zetten zou dus een gegeven
      // prijsgeven dat de ontvanger via het scherm niet kan opvragen.
      // Reageren gaat daarom in de app: de mail heeft daar een knop voor.
      const replyTo  = co?.reply_to_email || co?.email || null

      const { data: afzender } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      const afzenderNaam = afzender?.full_name || 'Een collega'

      for (const job of mailJobs) {
        try {
          if (await mailLimietBereikt(admin, user.id)) {
            await logMailFout({
              soort: job.soort, ontvanger: null, companyId, bedrijfNaam: bedrijfsnaam,
              fout: 'Mail-limiet per gebruiker bereikt (60 per uur); melding wel in de app gezet',
              bron: 'create-notification',
            })
            continue
          }
          const to = await resolveRecipientEmail(admin, job.userId, companyId)
          if (!to) {
            // Gebeurde eerder stil: de in-app melding stond er wel, de mail niet,
            // en niemand wist dat de collega niets in zijn inbox kreeg.
            await logMailFout({
              soort: job.soort || 'collega_melding',
              ontvanger: null, companyId, bedrijfNaam: bedrijfsnaam,
              fout: `Geen e-mailadres bekend voor gebruiker ${job.userId}`,
              bron: 'create-notification',
            })
            continue
          }
          const { data: ontvanger } = await admin.from('profiles').select('full_name').eq('id', job.userId).maybeSingle()
          const knop = appLink(job.link)
          const html = mailTemplate({
            title: job.title,
            preheader: job.title,
            body: `<p>Hoi ${esc(ontvanger?.full_name || 'collega')},</p>
                   <p><strong>${esc(afzenderNaam)}</strong>: ${esc(job.title)}</p>
                   ${job.body ? `<blockquote style="margin:12px 0;padding:12px 16px;background:#f9fafb;border-left:3px solid #1DDB62;border-radius:4px;color:#374151;">${esc(job.body)}</blockquote>` : ''}`,
            buttonText: knop ? 'Bekijk in BossBase' : undefined,
            buttonUrl: knop,
          })
          const body: Record<string, unknown> = { to, subject: job.title, html, from_name: fromName }
          if (replyTo) body.reply_to = replyTo
          body.soort = job.soort || 'collega_melding'
          body.company_id = companyId
          const ok = await sendViaEdge(supabaseUrl, serviceKey, body)
          if (ok) emailed++
          // Mislukt hij, dan legt send-email dat zelf vast in mail_fouten.
        } catch (e) {
          await logMailFout({
            soort: job.soort || 'collega_melding',
            ontvanger: null, companyId, bedrijfNaam: fromName,
            fout: String((e as Error)?.message || e),
            bron: 'create-notification',
          })
        }
      }
    }

    return json({ success: true, inserted: rows.length, emailed })
  } catch (err) {
    console.error('[create-notification]', err)
    return json({ success: false, error: 'Melding aanmaken mislukt' }, 500)
  }
})
