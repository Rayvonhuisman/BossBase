// Ondertekenen van een werkbon. Zelfde opzet als sign-offerte: de publieke
// ondertekenpagina heeft geen sessie, dus de schrijfactie, de opslag van de
// handtekening en de bevestigingsmails lopen hier met de service-role.
//
// Twee acties op één endpoint:
//   { action: 'fotos', sign_token }  → kortlopende signed URLs voor de foto's.
//     De bucket werkbon-fotos is privé en een signed URL is niet in SQL te
//     maken, dus dat kan alleen hier. De sign-token-functies in de database
//     geven wel de paden, maar nooit een leesbare link.
//   { sign_token, name, email, signature_data_url, signed_pdf_base64 } → tekenen.
//
// Wat hier NIET gebeurt: de PDF bouwen. Die komt kant-en-klaar uit de browser.
// Zou deze functie hem zelf maken, dan las hij met de service-role langs de RLS
// die de inkoopprijzen afschermt — precies wat de werkbon niet mag tonen.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'

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

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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
    const payload = await req.json()
    const { action, sign_token, name, email, signature_data_url, signed_pdf_base64 } = payload

    if (!sign_token) return json({ success: false, error: 'sign_token ontbreekt' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // ── ACTIE: foto's ────────────────────────────────────────────────────────
    if (action === 'fotos') {
      const { data: rijen, error } = await admin.rpc('get_werkbon_fotos_by_sign_token', { p_token: sign_token })
      if (error) return json({ success: false, error: error.message }, 500)
      const paden = (rijen || []).map((r: { pad: string }) => padUit(r.pad))
      if (!paden.length) return json({ success: true, fotos: [] })
      const { data: signed } = await admin.storage.from('werkbon-fotos').createSignedUrls(paden, 3600)
      return json({
        success: true,
        fotos: (rijen || []).map((r: { pad: string; categorie: string }, i: number) => ({
          url: signed?.[i]?.signedUrl || null,
          categorie: r.categorie || '',
        })).filter((f: { url: string | null }) => f.url),
      })
    }

    // ── ACTIE: ondertekenen ──────────────────────────────────────────────────
    if (!name || !email || !signature_data_url) {
      return json({ success: false, error: 'Verplichte velden ontbreken' }, 400)
    }

    const { data: werkbon, error: wbErr } = await admin
      .from('werkbonnen')
      .select('id, nummer, titel, company_id, customer_id, ondertekend_op, status, afgerond_op')
      .eq('sign_token', sign_token)
      .maybeSingle()

    if (wbErr) return json({ success: false, error: `Werkbon ophalen mislukt: ${wbErr.message}` }, 500)
    if (!werkbon) return json({ success: false, error: 'Werkbon niet gevonden voor deze link' }, 404)
    if (werkbon.ondertekend_op) return json({ success: false, error: 'Deze werkbon is al ondertekend' }, 409)

    // ── Handtekening opslaan (privé bucket, net als bij de offerte) ──────────
    let sigBytes: Uint8Array
    try {
      sigBytes = dataUrlToBytes(signature_data_url)
    } catch (err) {
      return json({ success: false, error: `Handtekening ongeldig: ${err}` }, 400)
    }

    const sigNaam = `werkbon-${werkbon.id}.png`
    const { error: sigErr } = await admin.storage
      .from('signatures')
      .upload(sigNaam, sigBytes, { contentType: 'image/png', upsert: true })
    if (sigErr) return json({ success: false, error: `Handtekening opslaan mislukt: ${sigErr.message}` }, 500)

    const { data: sigSigned, error: sigUrlErr } = await admin.storage
      .from('signatures')
      .createSignedUrl(sigNaam, 60 * 60 * 24 * 365 * 10) // ~10 jaar
    if (sigUrlErr || !sigSigned?.signedUrl) {
      return json({ success: false, error: `Link naar handtekening maken mislukt: ${sigUrlErr?.message || 'onbekend'}` }, 500)
    }

    // ── Bedrijfsgegevens (branding + notificatieadres) ───────────────────────
    let company: Record<string, unknown> = {}
    try {
      const { data, error } = await admin
        .from('companies')
        .select('name, email, logo_url, branding_color')
        .eq('id', werkbon.company_id)
        .maybeSingle()
      if (error) warnings.push(`Bedrijfsgegevens: ${error.message}`)
      else company = data || {}
    } catch (err) { warnings.push(`Bedrijfsgegevens mislukt: ${err}`) }

    // ── Werkbon bijwerken ────────────────────────────────────────────────────
    // Tekenen rondt de klus ook af als dat nog niet gebeurd was: de klant tekent
    // voor werk dat klaar is. afgerond_op wordt alleen gezet als het leeg is,
    // zodat een eerder afrondmoment niet wordt overschreven.
    const nu = new Date().toISOString()
    const update: Record<string, unknown> = {
      ondertekend_op: nu,
      handtekening_url: sigSigned.signedUrl,
      ondertekend_door_naam: name,
      ondertekend_door_email: email,
      status: 'afgerond',
    }
    if (!werkbon.afgerond_op) update.afgerond_op = nu

    const { error: updErr } = await admin.from('werkbonnen').update(update).eq('id', werkbon.id)
    if (updErr) return json({ success: false, error: `Werkbon bijwerken mislukt: ${updErr.message}` }, 500)

    // ── Ondertekende PDF opslaan (uit de browser) ────────────────────────────
    let pdfUrl: string | null = null
    if (signed_pdf_base64) {
      try {
        const bestand = `werkbon-${werkbon.nummer || werkbon.id}-ondertekend.pdf`
        const { error: upErr } = await admin.storage
          .from('signed-werkbonnen')
          .upload(bestand, base64ToBytes(signed_pdf_base64), { contentType: 'application/pdf', upsert: true })
        if (upErr) {
          warnings.push(`PDF opslaan mislukt: ${upErr.message}`)
        } else {
          // De bucket is privé; een publieke URL zou een dode link zijn.
          const { data: pdfSigned } = await admin.storage
            .from('signed-werkbonnen')
            .createSignedUrl(bestand, 60 * 60 * 24 * 365 * 10)
          pdfUrl = pdfSigned?.signedUrl || null
          if (pdfUrl) {
            const { error: urlErr } = await admin.from('werkbonnen')
              .update({ ondertekende_pdf_url: pdfUrl }).eq('id', werkbon.id)
            if (urlErr) warnings.push(`PDF-link opslaan mislukt: ${urlErr.message}`)
          }
        }
      } catch (err) { warnings.push(`PDF verwerken mislukt: ${err}`) }
    }

    // ── Bevestigingsmails ────────────────────────────────────────────────────
    try {
      const bedrijfsnaam = (company?.name as string) || 'BossBase'
      const logoUrl = (company?.logo_url as string) || undefined
      const brandColor = (company?.branding_color as string) || undefined
      const bedrijfEmail = (company?.email as string) || null
      const bijlagen = signed_pdf_base64
        ? [{ filename: `Werkbon-${werkbon.nummer || ''}.pdf`, content: signed_pdf_base64 }]
        : undefined

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
        to: email,
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
      warnings.push(`Bevestigingsmails mislukt: ${mailErr}`)
    }

    // ── Tijdlijn op de klantkaart ────────────────────────────────────────────
    if (werkbon.customer_id) {
      try {
        await admin.from('klant_tijdlijn').insert({
          customer_id: werkbon.customer_id,
          company_id: werkbon.company_id,
          type: 'werkbon_ondertekend',
          omschrijving: `Werkbon ${werkbon.nummer || ''} ondertekend door ${name}`,
          aangemaakt_op: nu,
          meta: { nummer: werkbon.nummer, signed_by: name, signed_by_email: email },
        })
      } catch { warnings.push('Tijdlijnregel schrijven mislukt') }
    }

    const antwoord: Record<string, unknown> = {
      success: true,
      werkbon_nummer: werkbon.nummer,
      company_name: (company?.name as string) || 'BossBase',
      ondertekend_op: nu,
      ondertekend_door_naam: name,
      handtekening_url: sigSigned.signedUrl,
      ondertekende_pdf_url: pdfUrl,
    }
    if (warnings.length) antwoord.warnings = warnings
    return json(antwoord)
  } catch (err) {
    console.error('sign-werkbon onverwachte fout:', err)
    return json({ success: false, error: String(err) }, 500)
  }
})
