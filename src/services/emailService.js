import { supabase } from '../lib/supabase.js'
import { getCompanyId, withCompanyId } from '../lib/currentCompany.js'
import { mailTemplate } from '../utils/mailTemplate.js'

// ── VARIABELEN VERVANGEN ─────────────────────────────────────────────────────

export function substituteVars(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ── TEMPLATE OPHALEN ─────────────────────────────────────────────────────────

export async function getMailTemplate(type) {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('type', type)
    .eq('actief', true)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── BEDRIJFSNAAM OPHALEN ─────────────────────────────────────────────────────

async function getCompanyName() {
  try {
    const companyId = await getCompanyId()
    if (!companyId) return 'BossBase'
    const { data } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle()
    return data?.name || 'BossBase'
  } catch {
    return 'BossBase'
  }
}

// ── E-MAIL VERSTUREN VIA EDGE FUNCTION ──────────────────────────────────────

export async function sendEmail({ to, subject, html, fromName, attachments }) {
  const resolvedFromName = fromName !== undefined ? fromName : await getCompanyName()
  const body = { to, subject, html, from_name: resolvedFromName }
  if (attachments?.length) body.attachments = attachments

  console.log('[sendEmail] invoke send-email →', { to, subject, from_name: resolvedFromName })
  const { data, error } = await supabase.functions.invoke('send-email', { body })
  console.log('[sendEmail] raw response →', { data, error: error ? { message: error.message, status: error.status, context: error.context } : null })

  if (error) {
    let message = error.message
    try { const b = await error.context?.json(); console.log('[sendEmail] error body →', b); if (b?.error) message = b.error } catch {}
    throw new Error(message)
  }
  if (!data?.success) throw new Error(data?.error || 'Versturen mislukt')
  return data
}

// ── VERSTUURDE MAIL LOGGEN ───────────────────────────────────────────────────

export async function logSentEmail({ toEmail, subject, bodyHtml, relatedType, relatedId, customerId }) {
  const payload = await withCompanyId({
    to_email: toEmail,
    subject,
    body_html: bodyHtml || null,
    related_type: relatedType || null,
    related_id: relatedId || null,
    customer_id: customerId || null,
    status: 'sent',
  })
  const { error } = await supabase.from('sent_emails').insert(payload)
  if (error) console.warn('Sent email log mislukt:', error.message)
}

// ── VERZONDEN E-MAILS PER KLANT ──────────────────────────────────────────────

export async function getSentEmailsByCustomer(customerId) {
  if (!customerId) return []
  const { data, error } = await supabase
    .from('sent_emails')
    .select('*')
    .eq('customer_id', customerId)
    .order('sent_at', { ascending: false })
  if (error) throw error
  return data || []
}

// ── AUTO-EMAIL STUREN (fire-and-forget, niet blokkeren) ──────────────────────

export async function triggerAutoEmail(type, vars, toEmail, companyId, relatedType, relatedId, customerId) {
  try {
    const { data: tpls } = await supabase
      .from('email_templates')
      .select('*')
      .eq('type', type)
      .eq('company_id', companyId)
      .eq('actief', true)
      .eq('auto_versturen', true)
      .limit(1)
    const tpl = tpls?.[0]
    if (!tpl || !toEmail) return
    const subject = substituteVars(tpl.onderwerp, vars)
    const innerBody = tpl.body_html
      ? substituteVars(tpl.body_html, vars)
      : substituteVars(tpl.body, vars).split('\n').map(l => l.trim() === '' ? '' : `<p style="margin:0 0 8px 0">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('')
    const html = mailTemplate({ title: subject, body: innerBody, companyName: vars.bedrijfsnaam || 'BossBase' })
    await sendEmail({ to: toEmail, subject, html })
    await logSentEmail({ toEmail, subject, bodyHtml: html, relatedType, relatedId, customerId })
  } catch (e) {
    console.warn('Auto-email mislukt:', e.message)
  }
}

// ── MAIL TEMPLATE UPSERT (voor nieuwe companies) ─────────────────────────────

export async function ensureMailTemplates(companyId) {
  const defaults = [
    {
      company_id: companyId,
      type: 'offerte',
      name: 'Offerte verstuurd',
      onderwerp: 'Offerte {{offerte_nummer}} van {{bedrijfsnaam}}',
      body: 'Beste {{klant_naam}},\n\nHierbij ontvangt u offerte {{offerte_nummer}}.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      body_html: '<p>Beste {{klant_naam}},</p><p>Hierbij ontvangt u offerte <strong>{{offerte_nummer}}</strong>.</p><p><a href="{{link}}" style="display:inline-block;background:#1DDB62;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Offerte bekijken &amp; ondertekenen</a></p><p>Met vriendelijke groet,<br>{{bedrijfsnaam}}</p>',
      is_default: true,
      actief: true,
    },
    {
      company_id: companyId,
      type: 'factuur',
      name: 'Factuur verstuurd',
      onderwerp: 'Factuur {{factuur_nummer}} van {{bedrijfsnaam}}',
      body: 'Beste {{klant_naam}},\n\nBijgaand ontvangt u factuur {{factuur_nummer}}.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      body_html: '<p>Beste {{klant_naam}},</p><p>Bijgaand ontvangt u factuur <strong>{{factuur_nummer}}</strong>.</p><p>Met vriendelijke groet,<br>{{bedrijfsnaam}}</p>',
      is_default: true,
      actief: true,
    },
  ]

  for (const tpl of defaults) {
    await supabase.from('email_templates').upsert(tpl, { onConflict: 'company_id,type', ignoreDuplicates: false })
  }
}

// ── SIGN-OFFERTE VIA EDGE FUNCTION ──────────────────────────────────────────

export async function signOfferte({ signToken, name, email, signatureDataUrl, signedPdfBase64 }) {
  const body = { sign_token: signToken, name, email, signature_data_url: signatureDataUrl }
  if (signedPdfBase64) body.signed_pdf_base64 = signedPdfBase64
  const { data, error } = await supabase.functions.invoke('sign-offerte', { body })
  if (error) {
    // Haal de werkelijke foutmelding op uit de response body
    let message = error.message
    try {
      const body = await error.context?.json()
      if (body?.error) message = body.error
    } catch {}
    throw new Error(message)
  }
  if (!data?.success) throw new Error(data?.error || 'Ondertekenen mislukt')
  return data
}
