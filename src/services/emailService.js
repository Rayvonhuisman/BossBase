import { supabase } from '../lib/supabase.js'
import { getCompanyId, withCompanyId } from '../lib/currentCompany.js'

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

export async function sendEmail({ to, subject, html, fromName }) {
  const resolvedFromName = fromName || await getCompanyName()
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to, subject, html, from_name: resolvedFromName },
  })
  if (error) throw error
  if (!data?.success) throw new Error(data?.error || 'Versturen mislukt')
  return data
}

// ── VERSTUURDE MAIL LOGGEN ───────────────────────────────────────────────────

export async function logSentEmail({ toEmail, subject, relatedType, relatedId, customerId }) {
  const payload = await withCompanyId({
    to_email: toEmail,
    subject,
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
    const body = substituteVars(tpl.body, vars)
    const html = body.split('\n').map(l => l.trim() === '' ? '<br>' : `<p style="margin:0 0 6px 0">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('')
    await sendEmail({ to: toEmail, subject, html })
    await logSentEmail({ toEmail, subject, relatedType, relatedId, customerId })
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
      body_html: '<p>Beste {{klant_naam}},</p><p>Hierbij ontvangt u offerte <strong>{{offerte_nummer}}</strong>.</p><p>Met vriendelijke groet,<br>{{bedrijfsnaam}}</p>',
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

export async function signOfferte({ signToken, name, email, signatureDataUrl }) {
  const { data, error } = await supabase.functions.invoke('sign-offerte', {
    body: {
      sign_token: signToken,
      name,
      email,
      signature_data_url: signatureDataUrl,
    },
  })
  if (error) throw error
  if (!data?.success) throw new Error(data?.error || 'Ondertekenen mislukt')
  return data
}
