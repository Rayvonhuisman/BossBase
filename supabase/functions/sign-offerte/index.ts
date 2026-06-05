import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 1024
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.slice(i, i + CHUNK)))
  }
  return btoa(parts.join(''))
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '#f97316').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return [isNaN(r) ? 249 : r, isNaN(g) ? 115 : g, isNaN(b) ? 22 : b]
}

const euro = (n: number) => `€ ${Number(n || 0).toFixed(2).replace('.', ',')}`

const fmtDate = (d: string) => {
  if (!d) return '—'
  const parts = String(d).slice(0, 10).split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

async function generateSignedPdf(
  offerte: Record<string, unknown>,
  items: Record<string, unknown>[],
  company: Record<string, unknown>,
  customer: Record<string, unknown>,
  signerName: string,
  signerEmail: string,
  signedAt: string,
  signatureDataUrl: string,
): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import('https://esm.sh/pdf-lib@1.17.1')
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const [ar, ag, ab] = hexToRgb((company?.branding_color as string) || '#f97316')
  const accent = rgb(ar / 255, ag / 255, ab / 255)
  const accentLight = rgb(
    (ar + (255 - ar) * 0.88) / 255,
    (ag + (255 - ag) * 0.88) / 255,
    (ab + (255 - ab) * 0.88) / 255,
  )
  const dark = rgb(0.07, 0.09, 0.15)
  const gray = rgb(0.42, 0.45, 0.50)
  const light = rgb(0.98, 0.98, 0.99)
  const white = rgb(1, 1, 1)
  const border = rgb(0.90, 0.91, 0.92)

  const PAGE_H = 842
  const ML = 50
  const MR = 545
  const CW = MR - ML

  let page = pdfDoc.addPage([595, PAGE_H])
  let y = PAGE_H - 40

  const drawText = (
    text: string,
    x: number,
    py: number,
    options: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = options.font ?? font
    const s = options.size ?? 8.5
    const c = options.color ?? dark
    page.drawText(String(text ?? ''), { x, y: py, font: f, size: s, color: c })
  }

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const companyName = (company?.name as string) || ''
  drawText(companyName, MR - fontBold.widthOfTextAtSize(companyName, 13), y, { font: fontBold, size: 13 })

  const companyLines: string[] = [
    company?.address as string,
    [(company?.postal_code as string), (company?.city as string)].filter(Boolean).join('  '),
    company?.email as string,
    company?.kvk ? `KvK: ${company.kvk}` : '',
    company?.btw_number ? `BTW: ${company.btw_number}` : '',
  ].filter(Boolean)

  let ry = y - 14
  for (const line of companyLines) {
    drawText(line, MR - font.widthOfTextAtSize(line, 8), ry, { size: 8, color: gray })
    ry -= 11
  }
  y = Math.min(y - 14, ry) - 8

  page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 1.5, color: accent })
  y -= 18

  // ── TITLE ────────────────────────────────────────────────────────────────────
  drawText('OFFERTE', ML, y, { font: fontBold, size: 22 })
  y -= 14
  drawText((offerte.nummer as string) || '', ML, y, { size: 10, color: accent })
  y -= 22

  // ── KLANT + META (2 kolommen) ─────────────────────────────────────────────────
  const col2 = ML + CW * 0.5 + 4
  const custStartY = y

  drawText('AAN', ML, y, { font: fontBold, size: 7.5, color: accent })
  y -= 14

  const custLines: string[] = [
    customer?.name as string,
    customer?.address as string,
    [(customer?.postal_code as string), (customer?.city as string)].filter(Boolean).join('  '),
    customer?.email as string,
  ].filter(Boolean)

  for (const line of custLines) {
    drawText(line, ML, y, { size: 9.5 })
    y -= 13
  }

  let infoY = custStartY
  const infoRow = (label: string, val: string) => {
    drawText(label, col2, infoY, { size: 8, color: gray })
    drawText(val || '—', col2 + 95, infoY, { size: 8 })
    infoY -= 13
  }
  infoRow('Offertenummer', (offerte.nummer as string) || '—')
  infoRow('Datum', fmtDate((offerte.created_at as string)?.slice(0, 10)))
  infoRow('Geldig tot', fmtDate(offerte.geldig_tot as string))

  y = Math.min(y, infoY) - 14

  // ── ITEMS TABEL ──────────────────────────────────────────────────────────────
  const ROW_H = 16
  const COL_PERC = [0.40, 0.10, 0.19, 0.11, 0.20]
  const COL_W = COL_PERC.map(p => CW * p)
  const COL_X: number[] = []
  let cx = ML
  COL_W.forEach(w => { COL_X.push(cx); cx += w })

  page.drawRectangle({ x: ML, y: y - ROW_H + 4, width: CW, height: ROW_H, color: accent })
  const HEADERS = ['Omschrijving', 'Aantal', 'Eenheidsprijs', 'BTW', 'Bedrag']
  HEADERS.forEach((h, i) => {
    const isRight = i === 4
    const tw = fontBold.widthOfTextAtSize(h, 7.5)
    const tx = isRight ? COL_X[i] + COL_W[i] - 4 - tw : COL_X[i] + 4
    drawText(h, tx, y - ROW_H + 9, { font: fontBold, size: 7.5, color: white })
  })
  y -= ROW_H

  items.forEach((item, idx) => {
    if (y < 140) return
    if (idx % 2 === 0) {
      page.drawRectangle({ x: ML, y: y - ROW_H + 4, width: CW, height: ROW_H, color: light })
    }
    const typeLabel = item.type ? `[${item.type}] ` : ''
    let omschr = typeLabel + ((item.omschrijving as string) || '')
    while (omschr.length > 3 && font.widthOfTextAtSize(omschr, 8) > COL_W[0] - 8) {
      omschr = omschr.slice(0, -4) + '...'
    }
    const btwPct = item.btw_pct !== undefined ? item.btw_pct : (offerte.btw_pct ?? 21)
    const bedragText = euro((item.subtotaal as number) ?? 0)

    drawText(omschr, COL_X[0] + 4, y - ROW_H + 9, { size: 8 })
    drawText(item.type === 'vast' ? '—' : String(item.aantal ?? 1), COL_X[1] + 4, y - ROW_H + 9, { size: 8 })
    drawText(euro((item.prijs_per as number) ?? 0), COL_X[2] + 4, y - ROW_H + 9, { size: 8 })
    drawText(`${btwPct}%`, COL_X[3] + 4, y - ROW_H + 9, { size: 8 })
    drawText(bedragText, COL_X[4] + COL_W[4] - 4 - font.widthOfTextAtSize(bedragText, 8), y - ROW_H + 9, { size: 8 })

    y -= ROW_H
  })
  y -= 8

  // ── TOTALEN ──────────────────────────────────────────────────────────────────
  const totLeft = ML + CW * 0.6
  const btwBedrag = ((offerte.totaal_incl as number) || 0) - ((offerte.totaal_excl as number) || 0)

  const totRow = (label: string, val: string, isFinal = false) => {
    if (y < 80) return
    if (isFinal) {
      page.drawRectangle({ x: totLeft - 6, y: y - 8, width: MR - totLeft + 6, height: 18, color: accentLight })
    }
    const f = isFinal ? fontBold : font
    const sz = isFinal ? 10 : 8.5
    drawText(label, totLeft, y, { font: f, size: sz, color: isFinal ? dark : gray })
    const vw = f.widthOfTextAtSize(val, sz)
    drawText(val, MR - vw, y, { font: f, size: sz, color: isFinal ? accent : dark })
    y -= 14
  }

  totRow('Subtotaal excl. BTW', euro((offerte.totaal_excl as number) || 0))
  totRow(`BTW ${(offerte.btw_pct as number) ?? 21}%`, euro(btwBedrag))
  totRow('Totaal incl. BTW', euro((offerte.totaal_incl as number) || 0), true)

  // ── NOTITIES ─────────────────────────────────────────────────────────────────
  if (offerte.notities) {
    y -= 8
    const noteLines = String(offerte.notities).split('\n').slice(0, 4)
    for (const line of noteLines) {
      if (y < 80) break
      drawText(line.slice(0, 120), ML, y, { size: 8, color: gray })
      y -= 11
    }
  }

  // ── HANDTEKENING SECTIE ───────────────────────────────────────────────────────
  if (y < 200) {
    page = pdfDoc.addPage([595, PAGE_H])
    y = PAGE_H - 60
  }

  y -= 10
  page.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: border })
  y -= 16

  drawText('Digitaal ondertekend', ML, y, { font: fontBold, size: 10 })
  y -= 16

  const sigDetails: [string, string][] = [
    ['Ondertekend door', signerName],
    ['E-mailadres', signerEmail],
    ['Datum en tijd', new Date(signedAt).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })],
  ]
  for (const [label, val] of sigDetails) {
    drawText(`${label}:`, ML, y, { font: fontBold, size: 8.5, color: gray })
    drawText(val, ML + 105, y, { size: 8.5 })
    y -= 13
  }

  if (signatureDataUrl?.startsWith('data:image/png')) {
    try {
      const sigBytes = dataUrlToBytes(signatureDataUrl)
      const sigImage = await pdfDoc.embedPng(sigBytes)
      const sigDims = sigImage.scaleToFit(160, 70)
      y -= 8
      drawText('Handtekening:', ML, y, { font: fontBold, size: 8.5, color: gray })
      y -= sigDims.height + 4
      page.drawImage(sigImage, { x: ML, y, width: sigDims.width, height: sigDims.height })
    } catch (imgErr) {
      console.error('Handtekening insluitfout:', imgErr)
    }
  }

  const footerText = 'Gegenereerd door BossBase'
  page.drawText(footerText, {
    x: MR - font.widthOfTextAtSize(footerText, 7),
    y: 20,
    font,
    size: 7,
    color: gray,
  })

  return pdfDoc.save()
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  fromName?: string,
  attachments?: Array<{ filename: string; content: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY niet ingesteld' }
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail
  const body: Record<string, unknown> = { from, to, subject, html }
  if (attachments?.length) body.attachments = attachments
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const resBody = await res.text()
      return { ok: false, error: `Resend ${res.status}: ${resBody}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const warnings: string[] = []

  try {
    const { sign_token, name, email, signature_data_url } = await req.json()

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
      .select('id, nummer, omschrijving, totaal_incl, totaal_excl, btw_pct, notities, created_at, company_id, customer_id, signed_at, geldig_tot')
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

    const { data: publicUrl } = admin.storage.from('signatures').getPublicUrl(sigFilename)
    const signatureUrl = publicUrl.publicUrl

    // ── STAP 3: Offerte updaten ───────────────────────────────────────────────
    const now = new Date().toISOString()
    const { error: updateErr } = await admin.from('offertes').update({
      signed_at: now,
      signature_url: signatureUrl,
      signed_by_name: name,
      signed_by_email: email,
      status: 'geaccepteerd',
    }).eq('id', offerte.id)

    if (updateErr) {
      return new Response(JSON.stringify({ success: false, error: `Offerte update mislukt: ${updateErr.message}` }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── STAP 4: Company/customer/items ophalen ────────────────────────────────
    // Vanaf hier is signing geslaagd. Fouten zijn waarschuwingen, geen fatale fouten.
    let company: Record<string, unknown> = {}
    let customer: Record<string, unknown> = {}
    let items: Record<string, unknown>[] = []

    try {
      const [companyRes, customerRes, itemsRes] = await Promise.all([
        admin.from('companies')
          .select('name, email, address, postal_code, city, kvk, btw_number, branding_color, logo_url')
          .eq('id', offerte.company_id)
          .maybeSingle(),
        admin.from('customers')
          .select('name, email, address, postal_code, city')
          .eq('id', offerte.customer_id)
          .maybeSingle(),
        admin.from('offerte_items')
          .select('omschrijving, aantal, prijs_per, subtotaal, btw_pct, type')
          .eq('offerte_id', offerte.id)
          .order('id'),
      ])
      if (companyRes.error) warnings.push(`Company ophalen: ${companyRes.error.message}`)
      else company = companyRes.data || {}
      if (customerRes.error) warnings.push(`Customer ophalen: ${customerRes.error.message}`)
      else customer = customerRes.data || {}
      if (itemsRes.error) warnings.push(`Items ophalen: ${itemsRes.error.message}`)
      else items = itemsRes.data || []
    } catch (err) {
      warnings.push(`Data ophalen mislukt: ${err}`)
    }

    // ── STAP 5: PDF genereren ─────────────────────────────────────────────────
    let attachment: Array<{ filename: string; content: string }> | undefined
    const pdfFilename = `offerte-${offerte.nummer}-ondertekend.pdf`

    try {
      const pdfBytes = await generateSignedPdf(
        offerte,
        items,
        company,
        customer,
        name,
        email,
        now,
        signature_data_url,
      )

      // Upload PDF naar storage
      const { error: pdfUploadErr } = await admin.storage
        .from('signed-offertes')
        .upload(pdfFilename, pdfBytes, { contentType: 'application/pdf', upsert: true })

      if (pdfUploadErr) {
        warnings.push(`PDF upload mislukt (signed-offertes): ${pdfUploadErr.message}`)
      }

      const pdfBase64 = uint8ArrayToBase64(pdfBytes)
      attachment = [{ filename: pdfFilename, content: pdfBase64 }]
    } catch (pdfErr) {
      warnings.push(`PDF genereren mislukt: ${pdfErr}`)
    }

    // ── STAP 6: E-mails versturen ─────────────────────────────────────────────
    const bedrijfNaam = (company?.name as string) || 'BossBase'
    const totaal = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.totaal_incl || 0)
    const appUrl = Deno.env.get('APP_URL') || 'https://app.bossbase.nl'

    try {
      const { data: tpls } = await admin
        .from('email_templates')
        .select('onderwerp, body, auto_versturen')
        .eq('type', 'offerte_geaccepteerd')
        .eq('company_id', offerte.company_id)
        .eq('actief', true)
        .limit(1)
      const tpl = tpls?.[0]

      const vars: Record<string, string> = {
        klant_naam: name,
        bedrijfsnaam: bedrijfNaam,
        offerte_nummer: offerte.nummer,
        totaal_bedrag: totaal,
      }
      const substituteVars = (tmpl: string) =>
        tmpl.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? `{{${k}}}`)
      const bodyToHtml = (b: string) =>
        b.split('\n').map((l: string) =>
          l.trim() === '' ? '<br>' : `<p style="margin:0 0 6px 0">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
        ).join('')

      const klantSubject = tpl?.auto_versturen
        ? substituteVars(tpl.onderwerp)
        : `Bevestiging ondertekening offerte ${offerte.nummer}`

      const klantHtml = tpl?.auto_versturen
        ? bodyToHtml(substituteVars(tpl.body))
        : `<p>Beste ${name},</p>
           <p>Bedankt voor het ondertekenen van offerte <strong>${offerte.nummer}</strong>.</p>
           <p>Omschrijving: ${offerte.omschrijving || '—'}<br>Totaal: <strong>${totaal}</strong></p>
           ${attachment ? '<p>In de bijlage vindt u de ondertekende offerte.</p>' : ''}
           <p>We nemen zo snel mogelijk contact met u op.</p>
           <p>Met vriendelijke groet,<br>${bedrijfNaam}</p>`

      // Bevestiging naar klant
      const mailKlant = await sendEmail(email, klantSubject, klantHtml, bedrijfNaam, attachment)
      if (!mailKlant.ok) warnings.push(`Klantmail mislukt: ${mailKlant.error}`)

      // Notificatie naar eigenaar
      if (company?.email) {
        const mailEigenaar = await sendEmail(
          company.email as string,
          `Offerte ${offerte.nummer} ondertekend door ${name}`,
          `<p>Goed nieuws! Offerte <strong>${offerte.nummer}</strong> is zojuist ondertekend.</p>
           <p>Ondertekend door: <strong>${name}</strong> (${email})<br>
              Datum en tijd: ${new Date(now).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}<br>
              Totaal: <strong>${totaal}</strong></p>
           ${attachment ? '<p>De ondertekende offerte is als bijlage toegevoegd.</p>' : ''}
           <p>Ga naar <a href="${appUrl}/dashboard/offertes">BossBase</a> voor meer details.</p>`,
          bedrijfNaam,
          attachment,
        )
        if (!mailEigenaar.ok) warnings.push(`Eigenaarmail mislukt: ${mailEigenaar.error}`)
      }

      // Log naar sent_emails
      const logRows = [
        {
          company_id: offerte.company_id,
          to_email: email,
          subject: klantSubject,
          related_type: 'offerte',
          related_id: offerte.id,
          status: 'sent',
        },
        ...(company?.email ? [{
          company_id: offerte.company_id,
          to_email: company.email,
          subject: `Offerte ${offerte.nummer} ondertekend door ${name}`,
          related_type: 'offerte',
          related_id: offerte.id,
          status: 'sent',
        }] : []),
      ]
      const { error: logErr } = await admin.from('sent_emails').insert(logRows)
      if (logErr) warnings.push(`E-mail log mislukt: ${logErr.message}`)
    } catch (emailErr) {
      warnings.push(`E-mail stap mislukt: ${emailErr}`)
    }

    return new Response(
      JSON.stringify({ success: true, ...(warnings.length ? { warnings } : {}) }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('sign-offerte onverwachte fout:', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
