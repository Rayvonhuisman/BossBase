import { supabase } from '../lib/supabase.js'
import { getCompanyId, withCompanyId } from '../lib/currentCompany.js'
import { mailTemplate } from '../utils/mailTemplate.js'
import { kiesTemplate } from '../lib/standaardMailTemplates.js'

// ── VARIABELEN VERVANGEN ─────────────────────────────────────────────────────

export function substituteVars(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// HTML-escape voor gebruikersinvoer die in een HTML-mail terechtkomt.
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Zoals substituteVars, maar escapet elke variabele-waarde zodat HTML/markup in
// klant-/offertevelden ({{klant_naam}} etc.) niet als HTML wordt geïnterpreteerd
// (voorkomt stored XSS / HTML-injectie in verzonden mails en in-app weergave).
export function substituteVarsHtml(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v == null ? `{{${key}}}` : escapeHtml(v)
  })
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

// ── BEDRIJFS-MAILGEGEVENS OPHALEN (naam + reply-to) ──────────────────────────

async function getCompanyMailMeta() {
  try {
    const companyId = await getCompanyId()
    if (!companyId) return { name: 'BossBase', replyTo: null }
    const { data } = await supabase
      .from('companies')
      .select('name, reply_to_email, email')
      .eq('id', companyId)
      .maybeSingle()
    // Reply-to: ingesteld antwoord-adres, anders het bedrijfs-emailadres,
    // anders geen reply-to header.
    return {
      name: data?.name || 'BossBase',
      replyTo: data?.reply_to_email || data?.email || null,
    }
  } catch {
    return { name: 'BossBase', replyTo: null }
  }
}

// ── E-MAIL VERSTUREN VIA EDGE FUNCTION ──────────────────────────────────────

export async function sendEmail({ to, subject, html, fromName, replyTo, attachments }) {
  // Bedrijfsnaam én reply-to centraal oplossen, tenzij expliciet meegegeven.
  // Zo krijgen ALLE verzendplekken automatisch het juiste antwoord-adres.
  let resolvedFromName = fromName
  let resolvedReplyTo = replyTo
  if (resolvedFromName === undefined || resolvedReplyTo === undefined) {
    const meta = await getCompanyMailMeta()
    if (resolvedFromName === undefined) resolvedFromName = meta.name
    if (resolvedReplyTo === undefined) resolvedReplyTo = meta.replyTo
  }
  const body = { to, subject, html, from_name: resolvedFromName }
  if (resolvedReplyTo) body.reply_to = resolvedReplyTo
  if (attachments?.length) body.attachments = attachments

  if (import.meta.env.DEV) console.log('[sendEmail] invoke send-email →', { to, subject, from_name: resolvedFromName })
  const { data, error } = await supabase.functions.invoke('send-email', { body })
  if (import.meta.env.DEV) console.log('[sendEmail] raw response →', { data, error: error ? { message: error.message, status: error.status, context: error.context } : null })

  if (error) {
    let message = error.message
    try { const b = await error.context?.json(); if (import.meta.env.DEV) console.log('[sendEmail] error body →', b); if (b?.error) message = b.error } catch {}
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

// ── AUTO-EMAIL STUREN (niet blokkeren; geeft true/false terug) ─────────────────

export async function triggerAutoEmail(type, vars, toEmail, companyId, relatedType, relatedId, customerId) {
  try {
    // Bewust zonder filter op actief/auto_versturen: we moeten kunnen zien of er
    // géén rij is (→ standaardtekst) of een rij die de ondernemer heeft uitgezet
    // (→ niets versturen). Een ontbrekend template mag de mail niet tegenhouden.
    const { data: tpls, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('type', type)
      .eq('company_id', companyId)
      .limit(1)
    // Weten we niet wat er staat, dan ook niet terugvallen: dat zou een
    // uitgezette mail alsnog versturen.
    if (error) throw error
    const tpl = kiesTemplate(type, tpls?.[0])
    if (!tpl || !toEmail) return
    const subject = substituteVars(tpl.onderwerp, vars)
    const innerBody = tpl.body_html
      ? substituteVarsHtml(tpl.body_html, vars)
      : substituteVars(tpl.body, vars).split('\n').map(l => l.trim() === '' ? '' : `<p style="margin:0 0 8px 0">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('')
    // Bedrijfs-branding (logo + kleur) ophalen voor de zakelijke variant.
    let logoUrl, brandColor
    try {
      const { data: co } = await supabase
        .from('companies')
        .select('logo_url, branding_color')
        .eq('id', companyId)
        .maybeSingle()
      logoUrl = co?.logo_url || undefined
      brandColor = co?.branding_color || undefined
    } catch { /* fallback: geen logo/kleur */ }
    const html = mailTemplate({ title: subject, body: innerBody, companyName: vars.bedrijfsnaam || 'Ons bedrijf', logoUrl, brandColor })
    await sendEmail({ to: toEmail, subject, html })
    await logSentEmail({ toEmail, subject, bodyHtml: html, relatedType, relatedId, customerId })
    return true
  } catch (e) {
    // Niet meer alleen in de console: vastleggen bij de mailfouten (zichtbaar in
    // het beheeroverzicht) en false teruggeven, zodat het scherm het kan melden.
    console.warn('Auto-email mislukt:', e.message)
    try {
      await supabase.rpc('meld_mail_fout', {
        p_soort: `auto_${type}`,
        p_fout: String(e?.message || e).slice(0, 500),
        p_bron: 'triggerAutoEmail',
        p_gerelateerd_type: relatedType || null,
        p_gerelateerd_id: relatedId || null,
      })
    } catch { /* vastleggen mislukt: de console-regel hierboven blijft over */ }
    return false
  }
}

// ── SIGN-OFFERTE VIA EDGE FUNCTION ──────────────────────────────────────────
//
// (Hier stond ensureMailTemplates: een tweede, onvolledige versie van de
// standaardtemplates die nooit werd aangeroepen. De database doet dit al met
// seed_default_email_templates, en die kent alle types.)

export async function signOfferte({ signToken, name, email, signatureDataUrl }) {
  // Het ondertekende exemplaar maakt de server; een PDF uit deze browser wordt
  // niet meer meegestuurd (die kon de ondertekenaar zelf samenstellen).
  const body = { sign_token: signToken, name, email, signature_data_url: signatureDataUrl }
  const { data, error } = await supabase.functions.invoke('sign-offerte', { body })
  if (error) {
    // Haal de werkelijke foutmelding (en de code) op uit de response body
    let message = error.message
    let code = null
    try {
      const body = await error.context?.json()
      if (body?.error) message = body.error
      code = body?.code || null
    } catch {}
    throw Object.assign(new Error(message), { code })
  }
  if (!data?.success) throw new Error(data?.error || 'Ondertekenen mislukt')
  return data
}
