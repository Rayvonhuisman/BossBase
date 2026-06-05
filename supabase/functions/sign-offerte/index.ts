import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sendEmail(to: string, subject: string, html: string, fromName?: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
  if (!apiKey) return
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

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

    // Fetch offerte by token
    const { data: offerte, error: offerteErr } = await admin
      .from('offertes')
      .select('id, nummer, omschrijving, totaal_incl, company_id, customer_id, signed_at, geldig_tot')
      .eq('sign_token', sign_token)
      .maybeSingle()

    if (offerteErr || !offerte) {
      return new Response(JSON.stringify({ success: false, error: 'Offerte niet gevonden' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (offerte.signed_at) {
      return new Response(JSON.stringify({ success: false, error: 'Offerte is al ondertekend' }), {
        status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Upload signature to storage
    const filename = `${offerte.id}.png`
    const bytes = dataUrlToBytes(signature_data_url)
    const { error: uploadErr } = await admin.storage
      .from('signatures')
      .upload(filename, bytes, { contentType: 'image/png', upsert: true })

    if (uploadErr) {
      return new Response(JSON.stringify({ success: false, error: 'Upload mislukt: ' + uploadErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: publicUrl } = admin.storage.from('signatures').getPublicUrl(filename)
    const signatureUrl = publicUrl.publicUrl

    // Update offerte
    const now = new Date().toISOString()
    await admin.from('offertes').update({
      signed_at: now,
      signature_url: signatureUrl,
      signed_by_name: name,
      signed_by_email: email,
      status: 'geaccepteerd',
    }).eq('id', offerte.id)

    // Fetch company and customer info for emails
    const [{ data: company }, { data: customer }] = await Promise.all([
      admin.from('companies').select('name, email').eq('id', offerte.company_id).maybeSingle(),
      admin.from('customers').select('name, email').eq('id', offerte.customer_id).maybeSingle(),
    ])

    const appUrl = Deno.env.get('APP_URL') || 'https://app.bossbase.nl'
    const bedrijfNaam = company?.name || 'BossBase'
    const totaal = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.totaal_incl || 0)

    // Load offerte_geaccepteerd template from DB
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
    const substituteVars = (tmpl: string) => tmpl.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? `{{${k}}}`)
    const bodyToHtml = (body: string) => body.split('\n').map((l: string) =>
      l.trim() === '' ? '<br>' : `<p style="margin:0 0 6px 0">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
    ).join('')

    const signerSubject = tpl && tpl.auto_versturen
      ? substituteVars(tpl.onderwerp)
      : `Offerte ${offerte.nummer} ondertekend`
    const signerHtml = tpl && tpl.auto_versturen
      ? bodyToHtml(substituteVars(tpl.body))
      : `<p>Beste ${name},</p>
         <p>Bedankt voor het ondertekenen van offerte <strong>${offerte.nummer}</strong>.</p>
         <p>Omschrijving: ${offerte.omschrijving || '—'}<br>Totaal: <strong>${totaal}</strong></p>
         <p>We nemen zo snel mogelijk contact met u op.</p>
         <p>Met vriendelijke groet,<br>${bedrijfNaam}</p>`

    // Send confirmation to signer
    await sendEmail(email, signerSubject, signerHtml, bedrijfNaam)

    // Notify company owner
    if (company?.email) {
      await sendEmail(
        company.email,
        `Offerte ${offerte.nummer} is ondertekend door ${name}`,
        `<p>Goed nieuws! Offerte <strong>${offerte.nummer}</strong> is zojuist ondertekend.</p>
         <p>Ondertekend door: <strong>${name}</strong> (${email})<br>
            Totaal: <strong>${totaal}</strong></p>
         <p>Ga naar <a href="${appUrl}/dashboard/offertes">BossBase</a> voor meer details.</p>`,
        bedrijfNaam,
      )
    }

    // Log to sent_emails
    const signerLog = {
      company_id: offerte.company_id,
      to_email: email,
      subject: `Offerte ${offerte.nummer} ondertekend`,
      related_type: 'offerte',
      related_id: offerte.id,
      status: 'sent',
    }
    await admin.from('sent_emails').insert(signerLog)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
