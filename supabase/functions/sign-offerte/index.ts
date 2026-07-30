import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// HTML-escape voor door de ondertekenaar ingevoerde waarden die in de rauwe
// mailbody terechtkomen (naam). Zelfde escape als de andere mails.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Verstuur via de bestaande send-email edge function met het interne secret —
// exact hetzelfde relay-patroon als de stripe-webhook. Best-effort, gooit niet.
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const warnings: string[] = []

  try {
    const { sign_token, name, email, signature_data_url, signed_pdf_base64 } = await req.json()

    if (!sign_token || !name || !email || !signature_data_url) {
      return new Response(JSON.stringify({ success: false, error: 'Verplichte velden ontbreken' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // ── STAP 1: Offerte ophalen ───────────────────────────────────────────────
    const { data: offerte, error: offerteErr } = await admin
      .from('offertes')
      .select('id, nummer, omschrijving, totaal_incl, company_id, customer_id, signed_at, snapshot_bedrijfsnaam')
      .eq('sign_token', sign_token)
      .maybeSingle()

    if (offerteErr) {
      return new Response(JSON.stringify({ success: false, error: `DB fout bij ophalen offerte: ${offerteErr.message}` }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    if (!offerte) {
      return new Response(JSON.stringify({ success: false, error: 'Offerte niet gevonden voor dit token' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    if (offerte.signed_at) {
      return new Response(JSON.stringify({ success: false, error: 'Offerte is al ondertekend' }), {
        status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── Feature-check (server-side, centrale matrix) ──────────────────────────
    // Deze functie draait met service_role en omzeilt RLS, dus de check moet hier
    // expliciet. Zonder 'digitale_handtekening' in het abonnement kan een offerte
    // niet online ondertekend worden — ook niet met een geldig sign_token.
    const { data: heeftFeature } = await admin.rpc('bb_has_feature', {
      p_company_id: offerte.company_id,
      p_feature: 'digitale_handtekening',
    })
    if (heeftFeature !== true) {
      return new Response(JSON.stringify({ success: false, error: 'Digitaal ondertekenen is voor deze offerte niet beschikbaar.' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── STAP 2: Handtekening uploaden naar storage ────────────────────────────
    const sigFilename = `${offerte.id}.png`
    let sigBytes: Uint8Array
    try {
      sigBytes = dataUrlToBytes(signature_data_url)
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: `Handtekening data ongeldig: ${err}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { error: uploadErr } = await admin.storage
      .from('signatures')
      .upload(sigFilename, sigBytes, { contentType: 'image/png', upsert: true })

    if (uploadErr) {
      return new Response(JSON.stringify({ success: false, error: `Storage upload mislukt (signatures): ${uploadErr.message}` }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // De signatures-bucket is privé (PII-bescherming). We slaan een signed URL
    // op met lange geldigheid (10 jaar) i.p.v. een publieke URL, zodat de
    // handtekening niet zonder token via de publieke endpoint te benaderen is.
    let signatureUrl: string
    const { data: signed, error: signErr } = await admin.storage
      .from('signatures')
      .createSignedUrl(sigFilename, 60 * 60 * 24 * 365 * 10) // ~10 jaar
    if (signErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ success: false, error: `Signed URL maken mislukt: ${signErr?.message || 'onbekend'}` }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    signatureUrl = signed.signedUrl

    // ── STAP 3: Company ophalen (branding voor snapshot + response) ──────────
    let company: Record<string, unknown> = {}
    try {
      const { data, error } = await admin
        .from('companies')
        .select('name, email, logo_url, branding_color, address, postal_code, city, kvk, btw_number')
        .eq('id', offerte.company_id)
        .maybeSingle()
      if (error) warnings.push(`Company ophalen: ${error.message}`)
      else company = data || {}
    } catch (err) {
      warnings.push(`Company ophalen mislukt: ${err}`)
    }

    // ── STAP 4: Offerte updaten (ondertekenen) ───────────────────────────────
    // Branding-snapshot bevriezen als die nog niet bij het versturen is gezet,
    // zodat de ondertekende offerte er altijd hetzelfde uit blijft zien — ook
    // als het bedrijf later zijn logo of kleur wijzigt.
    const now = new Date().toISOString()
    const updatePayload: Record<string, unknown> = {
      signed_at: now,
      signature_url: signatureUrl,
      signed_by_name: name,
      signed_by_email: email,
      status: 'geaccepteerd',
    }
    if (!offerte.snapshot_bedrijfsnaam) {
      updatePayload.snapshot_logo_url = (company?.logo_url as string) ?? null
      updatePayload.snapshot_branding_color = (company?.branding_color as string) ?? null
      updatePayload.snapshot_bedrijfsnaam = (company?.name as string) ?? null
      updatePayload.snapshot_adres = (company?.address as string) ?? null
      updatePayload.snapshot_postcode = (company?.postal_code as string) ?? null
      updatePayload.snapshot_plaats = (company?.city as string) ?? null
      updatePayload.snapshot_email = (company?.email as string) ?? null
      updatePayload.snapshot_kvk = (company?.kvk as string) ?? null
      updatePayload.snapshot_btw = (company?.btw_number as string) ?? null
    }
    const { error: updateErr } = await admin.from('offertes').update(updatePayload).eq('id', offerte.id)

    if (updateErr) {
      return new Response(JSON.stringify({ success: false, error: `Offerte update mislukt: ${updateErr.message}` }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── STAP 5: PDF verwerken (frontend-gegenereerde PDF uploaden) ────────────
    const pdfFilename = `offerte-${offerte.nummer}-ondertekend.pdf`

    if (signed_pdf_base64) {
      try {
        const pdfBytes = base64ToBytes(signed_pdf_base64)
        const { error: pdfUploadErr } = await admin.storage
          .from('signed-offertes')
          .upload(pdfFilename, pdfBytes, { contentType: 'application/pdf', upsert: true })

        if (pdfUploadErr) {
          warnings.push(`PDF upload mislukt (signed-offertes): ${pdfUploadErr.message}`)
        } else {
          const { data: pdfPublicUrlData } = admin.storage.from('signed-offertes').getPublicUrl(pdfFilename)
          const signedPdfUrl = pdfPublicUrlData?.publicUrl || null
          if (signedPdfUrl) {
            const { error: urlUpdateErr } = await admin.from('offertes')
              .update({ signed_pdf_url: signedPdfUrl })
              .eq('id', offerte.id)
            if (urlUpdateErr) warnings.push(`PDF URL opslaan mislukt: ${urlUpdateErr.message}`)
          }
        }
      } catch (pdfErr) {
        warnings.push(`PDF verwerken mislukt: ${pdfErr}`)
      }
    }

    // ── STAP 5b: Bevestigingsmails server-side versturen ─────────────────────
    // Verstuurd VANUIT de edge function (niet meer vanaf de publieke browser-
    // pagina) via de send-email relay met het interne secret. Best-effort: een
    // mailfout mag het ondertekenen niet laten falen.
    try {
      const bedrijfsnaam = (company?.name as string) || offerte.snapshot_bedrijfsnaam || 'BossBase'
      const logoUrl      = (company?.logo_url as string) || undefined
      const brandColor   = (company?.branding_color as string) || undefined
      const bedrijfEmail = (company?.email as string) || null
      const totaalFmt    = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.totaal_incl || 0)
      const signedAtFmt  = new Date(now).toLocaleString('nl-NL')
      const omschrijving = (offerte.omschrijving as string) || ''
      const hasPdf       = !!signed_pdf_base64
      const attachments  = hasPdf
        ? [{ filename: `Offerte-${offerte.nummer}-ondertekend.pdf`, content: signed_pdf_base64 }]
        : undefined

      // 1) KLANT-bevestiging — bedrijfsbranding, reply-to naar het bedrijf.
      const klantHtml = mailTemplate({
        title: `Offerte ${offerte.nummer} ondertekend`,
        preheader: `Bedankt voor het ondertekenen van offerte ${offerte.nummer}`,
        body: `<p>Beste ${esc(name)},</p>
<p>Bedankt voor het ondertekenen van offerte <strong>${esc(offerte.nummer)}</strong>.</p>
${omschrijving ? `<p>Omschrijving: ${esc(omschrijving)}</p>` : ''}
<p>Totaal: <strong>${esc(totaalFmt)}</strong></p>
${hasPdf ? '<p>In de bijlage vindt u de ondertekende offerte.</p>' : ''}
<p>We nemen zo snel mogelijk contact met u op.</p>
<p>Met vriendelijke groet,<br>${esc(bedrijfsnaam)}</p>`,
        companyName: bedrijfsnaam,
        logoUrl,
        brandColor,
      })
      const klantBody: Record<string, unknown> = {
        to: email, subject: `Bevestiging: offerte ${offerte.nummer} ondertekend`, html: klantHtml, from_name: bedrijfsnaam,
      }
      if (bedrijfEmail) klantBody.reply_to = bedrijfEmail
      if (attachments) klantBody.attachments = attachments
      if (!(await sendViaEdge(supabaseUrl, serviceKey, klantBody))) warnings.push('Bevestigingsmail naar klant mislukt')

      // 2) BEDRIJF-notificatie — óók bedrijfsbranding (interne melding naar het
      //    bedrijf zelf, in hun eigen huisstijl).
      if (bedrijfEmail) {
        const bedrijfHtml = mailTemplate({
          title: `Offerte ${offerte.nummer} ondertekend`,
          preheader: `${name} heeft offerte ${offerte.nummer} ondertekend`,
          body: `<p>Goed nieuws! Offerte <strong>${esc(offerte.nummer)}</strong> is zojuist ondertekend.</p>
<p>Ondertekend door: <strong>${esc(name)}</strong> (${esc(email)})<br>
Datum en tijd: ${esc(signedAtFmt)}<br>
Totaal: <strong>${esc(totaalFmt)}</strong></p>
${hasPdf ? '<p>De ondertekende offerte is als bijlage toegevoegd.</p>' : ''}`,
          companyName: bedrijfsnaam,
          logoUrl,
          brandColor,
        })
        const bedrijfBody: Record<string, unknown> = {
          to: bedrijfEmail, subject: `Offerte ${offerte.nummer} ondertekend door ${name}`, html: bedrijfHtml, from_name: bedrijfsnaam,
        }
        if (attachments) bedrijfBody.attachments = attachments
        if (!(await sendViaEdge(supabaseUrl, serviceKey, bedrijfBody))) warnings.push('Notificatiemail naar bedrijf mislukt')
      }
    } catch (mailErr) {
      warnings.push(`Bevestigingsmails mislukt: ${mailErr}`)
    }

    // ── STAP 6: Response samenstellen ────────────────────────────────────────
    const bedrijfNaam = (company?.name as string) || 'BossBase'
    const totaal = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.totaal_incl || 0)

    const responseBody: Record<string, unknown> = {
      success: true,
      offerte_nummer: offerte.nummer,
      offerte_omschrijving: offerte.omschrijving || '',
      company_name: bedrijfNaam,
      company_email: (company?.email as string) || null,
      totaal,
      signed_at: now,
      signed_by_name: name,
      signed_by_email: email,
    }

    if (warnings.length) responseBody.warnings = warnings

    return new Response(
      JSON.stringify(responseBody),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('sign-offerte onverwachte fout:', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
