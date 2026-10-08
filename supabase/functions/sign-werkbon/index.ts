// Ondertekenen van een werkbon. Zelfde opzet als sign-offerte: de publieke
// ondertekenpagina heeft geen sessie, dus de schrijfactie, de opslag van de
// handtekening en de bevestigingsmails lopen hier met de service-role.
//
// Twee acties op één endpoint:
//   { action: 'fotos', sign_token }  → kortlopende signed URLs voor de foto's.
//     De bucket werkbon-fotos is privé en een signed URL is niet in SQL te
//     maken, dus dat kan alleen hier. De sign-token-functies in de database
//     geven wel de paden, maar nooit een leesbare link.
//   { sign_token, name, email, signature_data_url } → tekenen.
//
// Het ondertekende exemplaar maakt de server (_shared/ondertekendExemplaar.ts),
// uitsluitend uit de sign-token-functies: dat is precies wat de klant op de
// publieke pagina ziet, dus geen inkoopprijzen of interne notities. Een PDF die
// de browser meestuurt wordt genegeerd — die kon de ondertekenaar zelf maken
// (audit 2026-10-01, H4).
//
// Wie mag tekenen:
//   - zonder login (de publieke link): alleen als de werkbon ter ondertekening
//     is verstuurd (verstuurd_op) of al is afgerond;
//   - ingelogd, ter plekke in de afrondmodal: een actieve gebruiker van hetzelfde
//     bedrijf, ook als de werkbon nog in uitvoering is.
// Het pakket moet werkbonnen bevatten. Bewust niet 'digitale_handtekening': die
// feature gaat over offertes, en werkbonnen laten tekenen hoort bij elk pakket
// met werkbonnen (bob-knowledge/abonnementen.md).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'
import { logMailFout } from '../_shared/mailFout.ts'
import { opslagWaarde, kortLink } from '../_shared/documentLink.ts'
import {
  maakWerkbonExemplaar, bytesNaarBase64, isUuid, handtekeningUit, aanroeperGegevens,
} from '../_shared/ondertekendExemplaar.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Zelfde relay als sign-offerte en de stripe-webhook: via send-email met het
// interne secret. Best-effort — een mailfout mag het tekenen niet laten falen.
async function sendViaEdge(supabaseUrl: string, serviceKey: string, body: Record<string, unknown>): Promise<boolean> {
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
  } catch { return false }
}

// De fotokolom bevat bij nieuwe uploads een kaal opslagpad en bij oude rijen een
// volledige URL. Zelfde afhandeling als storagePathFromStored in werkbonService.
function padUit(waarde: string): string {
  const s = String(waarde || '').split('?')[0]
  const marker = '/werkbon-fotos/'
  const i = s.indexOf(marker)
  return i !== -1 ? s.slice(i + marker.length) : s
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const warnings: string[] = []

  try {
    const payload = await req.json().catch(() => ({}))
    const { action, sign_token, signature_data_url } = payload

    if (!isUuid(sign_token)) return json({ success: false, code: 'ongeldig', error: 'Deze link is ongeldig.' }, 404)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // ── ACTIE: foto's ────────────────────────────────────────────────────────
    if (action === 'fotos') {
      const [{ data: wbRij }, { data: rijen, error }] = await Promise.all([
        admin.rpc('get_werkbon_by_sign_token', { p_token: sign_token }),
        admin.rpc('get_werkbon_fotos_by_sign_token', { p_token: sign_token }),
      ])
      const wb = wbRij?.[0]
      if (error || !wb) return json({ success: true, fotos: [] })
      // Alleen bestanden in de map van DEZE werkbon. werkbon_fotos.url is vrije
      // tekst; zonder dit filter tekende de service-role elk pad in de bucket,
      // ook dat van een ander bedrijf (audit M14).
      const map = `${wb.company_id}/${wb.id}/`
      const geldig = (rijen || [])
        .map((r: { pad: string; categorie: string }) => ({ pad: padUit(r.pad), categorie: r.categorie || '' }))
        .filter((r: { pad: string }) => r.pad.startsWith(map) && !r.pad.includes('..'))
      if (!geldig.length) return json({ success: true, fotos: [] })
      const { data: signed } = await admin.storage.from('werkbon-fotos').createSignedUrls(geldig.map((r: { pad: string }) => r.pad), 3600)
      return json({
        success: true,
        fotos: geldig.map((r: { categorie: string }, i: number) => ({
          url: signed?.[i]?.signedUrl || null,
          categorie: r.categorie,
        })).filter((f: { url: string | null }) => f.url),
      })
    }

    // ── ACTIE: ondertekenen ──────────────────────────────────────────────────
    const name = String(payload?.name ?? '').trim().slice(0, 200)
    const email = String(payload?.email ?? '').trim().toLowerCase().slice(0, 254)
    if (!name || !email || !signature_data_url) {
      return json({ success: false, error: 'Vul de naam en het e-mailadres in en zet een handtekening.' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ success: false, error: 'Vul een geldig e-mailadres in.' }, 400)
    const sigBytes = handtekeningUit(signature_data_url)
    if (!sigBytes) return json({ success: false, error: 'De handtekening kon niet worden gelezen. Probeer het opnieuw.' }, 400)

    const { data: werkbon, error: wbErr } = await admin
      .from('werkbonnen')
      .select('id, nummer, titel, company_id, customer_id, ondertekend_op, status, afgerond_op, verstuurd_op')
      .eq('sign_token', sign_token)
      .maybeSingle()

    if (wbErr) {
      console.error('sign-werkbon ophalen', wbErr.message)
      return json({ success: false, error: 'De werkbon kon niet worden geladen. Probeer het later opnieuw.' }, 500)
    }
    if (!werkbon) return json({ success: false, code: 'ongeldig', error: 'Deze werkbon is niet gevonden. Controleer de link.' }, 404)
    if (werkbon.ondertekend_op) return json({ success: false, code: 'al_ondertekend', error: 'Deze werkbon is al ondertekend.' }, 409)

    // Ter plekke (ingelogd, zelfde bedrijf) of via de publieke link?
    let terPlekke = false
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (jwt && jwt.split('.').length === 3) {
      const { data: { user } } = await admin.auth.getUser(jwt).catch(() => ({ data: { user: null } }))
      if (user) {
        const { data: prof } = await admin.from('profiles').select('company_id, actief').eq('id', user.id).maybeSingle()
        terPlekke = !!prof && prof.actief !== false && prof.company_id === werkbon.company_id
      }
    }
    const verstuurdOfAf = !!werkbon.verstuurd_op || werkbon.status === 'afgerond'
    if (!terPlekke && !verstuurdOfAf) {
      return json({ success: false, code: 'niet_ondertekenbaar', error: 'Deze werkbon is nog niet ter ondertekening verstuurd.' }, 409)
    }

    const { data: heeftFeature } = await admin.rpc('bb_has_feature', {
      p_company_id: werkbon.company_id, p_feature: 'werkbonnen',
    })
    if (heeftFeature !== true) {
      return json({ success: false, error: 'Werkbonnen ondertekenen is voor dit bedrijf niet beschikbaar.' }, 403)
    }

    // ── Handtekening en exemplaar opslaan (uniek pad, nog nergens aan gekoppeld)
    const nu = new Date().toISOString()
    const { ip, userAgent } = aanroeperGegevens(req)
    const uniek = crypto.randomUUID()
    const sigNaam = `werkbon-${werkbon.id}-${uniek}.png`
    const { error: sigErr } = await admin.storage
      .from('signatures')
      .upload(sigNaam, sigBytes, { contentType: 'image/png', upsert: false })
    if (sigErr) {
      console.error('sign-werkbon handtekening', sigErr.message)
      return json({ success: false, error: 'De handtekening kon niet worden opgeslagen. Probeer het opnieuw.' }, 500)
    }
    const sigVerwijzing = await opslagWaarde(admin, 'signatures', sigNaam)

    let exemplaar: Awaited<ReturnType<typeof maakWerkbonExemplaar>> | null = null
    let pdfPad: string | null = null
    try {
      exemplaar = await maakWerkbonExemplaar(admin, sign_token, { naam: name, email, tijdstip: nu, ip, userAgent, handtekeningPng: sigBytes })
      pdfPad = `${werkbon.company_id}/werkbon-${werkbon.id}-${uniek.slice(0, 8)}-ondertekend.pdf`
      const { error: upErr } = await admin.storage.from('signed-werkbonnen')
        .upload(pdfPad, exemplaar.pdf, { contentType: 'application/pdf', upsert: false })
      if (upErr) { console.error('sign-werkbon pdf opslaan', upErr.message); pdfPad = null; warnings.push('Ondertekend exemplaar opslaan mislukt') }
    } catch (e) {
      console.error('sign-werkbon exemplaar maken', e)
      warnings.push('Ondertekend exemplaar maken mislukt')
      await logMailFout({ soort: 'ondertekende_pdf_werkbon', ontvanger: null, companyId: werkbon.company_id,
        fout: `Exemplaar maken mislukt: ${String(e).slice(0, 300)}`, bron: 'sign-werkbon', gerelateerdType: 'werkbon', gerelateerdId: werkbon.id })
    }
    const pdfUrl = pdfPad ? await opslagWaarde(admin, 'signed-werkbonnen', pdfPad) : null

    // ── Bedrijfsgegevens (branding + notificatieadres) ───────────────────────
    const { data: companyRij } = await admin
      .from('companies').select('name, email, logo_url, branding_color').eq('id', werkbon.company_id).maybeSingle()
    const company: Record<string, unknown> = companyRij || {}

    // ── Atomair ondertekenen ─────────────────────────────────────────────────
    // Tekenen rondt de klus ook af als dat nog niet gebeurd was: de klant tekent
    // voor werk dat klaar is. afgerond_op blijft staan als hij er al was.
    const update: Record<string, unknown> = {
      ondertekend_op: nu,
      handtekening_url: sigVerwijzing,
      ondertekend_door_naam: name,
      ondertekend_door_email: email,
      status: 'afgerond',
      ondertekende_pdf_url: pdfUrl,
      afgerond_op: werkbon.afgerond_op || nu,
      ondertekening_bewijs: {
        versie: 1, tijdstip: nu, naam: name, email, ip, user_agent: userAgent,
        nummer: werkbon.nummer, ter_plekke: terPlekke,
        inhoud_sha256: exemplaar?.documentHash ?? null,
        pdf_sha256: pdfPad ? exemplaar?.pdfHash ?? null : null,
        pdf_pad: pdfPad, handtekening_pad: sigNaam,
      },
    }
    let q = admin.from('werkbonnen').update(update).eq('id', werkbon.id).is('ondertekend_op', null)
    if (!terPlekke) q = q.or('verstuurd_op.not.is.null,status.eq.afgerond')
    const { data: gewonnen, error: updErr } = await q.select('id')
    if (updErr || !gewonnen || gewonnen.length === 0) {
      await admin.storage.from('signatures').remove([sigNaam]).catch(() => {})
      if (pdfPad) await admin.storage.from('signed-werkbonnen').remove([pdfPad]).catch(() => {})
      if (updErr) {
        console.error('sign-werkbon update', updErr.message)
        return json({ success: false, error: 'Ondertekenen is niet gelukt. Probeer het opnieuw.' }, 500)
      }
      return json({ success: false, code: 'al_ondertekend', error: 'Deze werkbon is al ondertekend.' }, 409)
    }

    const exemplaarB64 = exemplaar && pdfPad ? bytesNaarBase64(exemplaar.pdf) : null

    // ── Bevestigingsmails ────────────────────────────────────────────────────
    try {
      const bedrijfsnaam = (company?.name as string) || 'Ons bedrijf'
      const logoUrl = (company?.logo_url as string) || undefined
      const brandColor = (company?.branding_color as string) || undefined
      const bedrijfEmail = (company?.email as string) || null
      const bijlagen = exemplaarB64
        ? [{ filename: `Werkbon-${werkbon.nummer || ''}-ondertekend.pdf`, content: exemplaarB64 }]
        : undefined
      // Naar de klant van de werkbon én de ondertekenaar (als dat iemand anders is).
      const { data: klantRij } = werkbon.customer_id
        ? await admin.from('customers').select('email').eq('id', werkbon.customer_id).maybeSingle()
        : { data: null }
      const ontvangers = [...new Set([(klantRij?.email as string | undefined)?.trim().toLowerCase(), email].filter(Boolean))] as string[]

      // 1) KLANT — in de huisstijl van het bedrijf, met de bon als bijlage.
      const klantHtml = mailTemplate({
        title: `Werkbon ${werkbon.nummer || ''} ondertekend`,
        preheader: `Bedankt voor het aftekenen van werkbon ${werkbon.nummer || ''}`,
        body: `<p>Beste ${esc(name)},</p>
<p>Bedankt voor het aftekenen van werkbon <strong>${esc(werkbon.nummer || '')}</strong>${werkbon.titel ? ` — ${esc(werkbon.titel)}` : ''}.</p>
${bijlagen ? '<p>In de bijlage vindt u de ondertekende werkbon met het uitgevoerde werk, de gewerkte uren en het gebruikte materiaal.</p>' : ''}
<p>Heeft u nog vragen over het werk? Neem gerust contact met ons op.</p>
<p>Met vriendelijke groet,<br>${esc(bedrijfsnaam)}</p>`,
        companyName: bedrijfsnaam,
        logoUrl,
        brandColor,
      })
      const klantBody: Record<string, unknown> = {
        to: ontvangers,
        subject: `Werkbon ${werkbon.nummer || ''} ondertekend`,
        html: klantHtml,
        from_name: bedrijfsnaam,
      }
      if (bedrijfEmail) klantBody.reply_to = bedrijfEmail
      if (bijlagen) klantBody.attachments = bijlagen
      if (!(await sendViaEdge(supabaseUrl, serviceKey, klantBody))) warnings.push('Bevestigingsmail naar klant mislukt')

      // 2) BEDRIJF — interne melding, dus BossBase-stijl (geen companyName/logo).
      //    Zelfde keuze als bij de andere meldingen: dit is een systeembericht
      //    aan het bedrijf zelf, geen klantcommunicatie in de eigen huisstijl.
      if (bedrijfEmail) {
        const intern = mailTemplate({
          title: `Werkbon ${werkbon.nummer || ''} is afgetekend`,
          preheader: `${name} heeft werkbon ${werkbon.nummer || ''} ondertekend`,
          body: `<p>Werkbon <strong>${esc(werkbon.nummer || '')}</strong>${werkbon.titel ? ` — ${esc(werkbon.titel)}` : ''} is zojuist door de klant afgetekend.</p>
<p>Ondertekend door: <strong>${esc(name)}</strong> (${esc(email)})<br>
Datum en tijd: ${esc(new Date(nu).toLocaleString('nl-NL'))}</p>
<p>De werkbon staat nu op slot: uren, taken en materiaal kunnen niet meer worden aangepast. Een correctie loopt via een nieuwe werkbon.</p>`,
        })
        const internBody: Record<string, unknown> = {
          to: bedrijfEmail,
          subject: `Werkbon ${werkbon.nummer || ''} afgetekend door ${name}`,
          html: intern,
        }
        if (bijlagen) internBody.attachments = bijlagen
        if (!(await sendViaEdge(supabaseUrl, serviceKey, internBody))) warnings.push('Melding naar bedrijf mislukt')
      }
    } catch (mailErr) {
      console.error('sign-werkbon mails', mailErr); warnings.push('Bevestigingsmails mislukt')
    }

    // ── Tijdlijn op de klantkaart ────────────────────────────────────────────
    // supabase-js GOOIT niet bij een databasefout; het geeft { error } terug. Een
    // try/catch hieromheen kan dus nooit vuren: mislukte de insert (RLS, kolom,
    // constraint), dan verdween dat spoorloos en werd zelfs de warning niet gezet.
    // Zelfde reparatie als in sign-offerte: de fout uit de return lezen.
    if (werkbon.customer_id) {
      const { error: tijdlijnErr } = await admin.from('klant_tijdlijn').insert({
        customer_id: werkbon.customer_id,
        company_id: werkbon.company_id,
        type: 'werkbon_ondertekend',
        omschrijving: `Werkbon ${werkbon.nummer || ''} ondertekend door ${name}`,
        aangemaakt_op: nu,
        meta: { nummer: werkbon.nummer, signed_by: name, signed_by_email: email },
      })
      if (tijdlijnErr) { console.error('sign-werkbon tijdlijn', tijdlijnErr.message); warnings.push('Tijdlijnregel schrijven mislukt') }
    }

    const antwoord: Record<string, unknown> = {
      success: true,
      werkbon_nummer: werkbon.nummer,
      company_name: (company?.name as string) || 'BossBase',
      ondertekend_op: nu,
      ondertekend_door_naam: name,
      // Voor de klant die net tekende: korte links (10 minuten), niet bewaard.
      handtekening_url: await kortLink(admin, 'signatures', sigVerwijzing),
      ondertekende_pdf_url: pdfUrl ? await kortLink(admin, 'signed-werkbonnen', pdfUrl) : null,
    }
    if (warnings.length) antwoord.warnings = warnings
    return json(antwoord)
  } catch (err) {
    console.error('sign-werkbon onverwachte fout:', err)
    return json({ success: false, error: 'Er ging iets mis bij het ondertekenen. Probeer het later opnieuw.' }, 500)
  }
})
