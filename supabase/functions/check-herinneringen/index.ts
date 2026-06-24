import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

function plainTextToHtml(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 6px 0">${line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`)
    .join('')
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

async function sendMail(to: string, subject: string, html: string, fromName: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
  if (!apiKey) { console.warn('RESEND_API_KEY niet ingesteld'); return null }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html }),
  })
  const data = await res.json()
  return res.ok ? data.id : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceKey)

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const results = { herinneringen: 0, afspraken: 0, errors: [] as string[] }

  try {
    // ── Betaalherinneringen ───────────────────────────────────────────────────
    const { data: facturen } = await db
      .from('facturen')
      .select('*, customers(name, email), companies(name, email, logo_url, branding_color)')
      .neq('status', 'betaald')
      .not('vervaldatum', 'is', null)
      .lt('vervaldatum', todayStr)

    for (const f of (facturen || [])) {
      if (!f.customers?.email) continue
      const company = f.companies
      if (!company) continue

      const companyId = f.company_id
      const vervalDate = new Date(f.vervaldatum)
      const daysPast = Math.floor((today.getTime() - vervalDate.getTime()) / 86400000)

      // Haal templates op voor dit bedrijf
      const { data: tpls } = await db
        .from('email_templates')
        .select('*')
        .eq('company_id', companyId)
        .in('type', ['herinnering_1', 'herinnering_2'])
        .eq('actief', true)
        .eq('auto_versturen', true)

      const tpl1 = tpls?.find(t => t.type === 'herinnering_1')
      const tpl2 = tpls?.find(t => t.type === 'herinnering_2')

      const vars = {
        klant_naam: f.customers.name || 'klant',
        bedrijfsnaam: company.name || 'ons bedrijf',
        factuur_nummer: f.nummer,
        totaal_bedrag: fmtCurrency(f.totaal_incl || 0),
        vervaldatum: fmtDate(f.vervaldatum),
      }

      // Herinnering 1
      if (tpl1 && !f.herinnering_1_verstuurd_at && daysPast >= (tpl1.auto_dagen || 7)) {
        const subject = substituteVars(tpl1.onderwerp, vars)
        const innerBody = tpl1.body_html
          ? substituteVars(tpl1.body_html, vars)
          : plainTextToHtml(substituteVars(tpl1.body, vars))
        const html = mailTemplate({ title: subject, body: innerBody, companyName: company.name, logoUrl: company.logo_url || undefined, brandColor: company.branding_color || undefined })
        const msgId = await sendMail(f.customers.email, subject, html, company.name)
        if (msgId !== null) {
          await db.from('facturen').update({ herinnering_1_verstuurd_at: new Date().toISOString() }).eq('id', f.id)
          await db.from('sent_emails').insert({ company_id: companyId, to_email: f.customers.email, subject, related_type: 'factuur', related_id: f.id, customer_id: f.customer_id, status: 'sent' })
          results.herinneringen++
        }
      }

      // Herinnering 2
      if (tpl2 && !f.herinnering_2_verstuurd_at && daysPast >= (tpl2.auto_dagen || 14)) {
        const subject = substituteVars(tpl2.onderwerp, vars)
        const innerBody = tpl2.body_html
          ? substituteVars(tpl2.body_html, vars)
          : plainTextToHtml(substituteVars(tpl2.body, vars))
        const html = mailTemplate({ title: subject, body: innerBody, companyName: company.name, logoUrl: company.logo_url || undefined, brandColor: company.branding_color || undefined })
        const msgId = await sendMail(f.customers.email, subject, html, company.name)
        if (msgId !== null) {
          await db.from('facturen').update({ herinnering_2_verstuurd_at: new Date().toISOString() }).eq('id', f.id)
          await db.from('sent_emails').insert({ company_id: companyId, to_email: f.customers.email, subject, related_type: 'factuur', related_id: f.id, customer_id: f.customer_id, status: 'sent' })
          results.herinneringen++
        }
      }
    }

    // ── Afspraakherinneringen (activiteiten van morgen) ───────────────────────
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStart = tomorrow.toISOString().slice(0, 10) + 'T00:00:00'
    const tomorrowEnd = tomorrow.toISOString().slice(0, 10) + 'T23:59:59'

    const { data: activiteiten } = await db
      .from('activities')
      .select('*, customers(name, email), companies:company_id(name, email, logo_url, branding_color)')
      .eq('type', 'visit')
      .gte('due_at', tomorrowStart)
      .lte('due_at', tomorrowEnd)
      .eq('completed', false)

    for (const act of (activiteiten || [])) {
      if (!act.customers?.email) continue
      const company = act.companies
      if (!company) continue

      const { data: tpls } = await db
        .from('email_templates')
        .select('*')
        .eq('company_id', act.company_id)
        .eq('type', 'afspraak_herinnering')
        .eq('actief', true)
        .limit(1)
      const tpl = tpls?.[0]
      if (!tpl) continue

      // Check al verstuurd
      const { count } = await db
        .from('sent_emails')
        .select('id', { count: 'exact', head: true })
        .eq('appointment_id', act.id)
        .eq('company_id', act.company_id)

      if (count && count > 0) continue

      const dueDate = new Date(act.due_at)
      const vars = {
        klant_naam: act.customers.name || 'klant',
        bedrijfsnaam: company.name || 'ons bedrijf',
        afspraak_datum: dueDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        afspraak_tijd: dueDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
      }

      const subject = substituteVars(tpl.onderwerp, vars)
      const innerBody = tpl.body_html
        ? substituteVars(tpl.body_html, vars)
        : plainTextToHtml(substituteVars(tpl.body, vars))
      const html = mailTemplate({ title: subject, body: innerBody, companyName: company.name, logoUrl: company.logo_url || undefined, brandColor: company.branding_color || undefined })
      const msgId = await sendMail(act.customers.email, subject, html, company.name)
      if (msgId !== null) {
        await db.from('sent_emails').insert({ company_id: act.company_id, to_email: act.customers.email, subject, related_type: 'activity', related_id: act.id, customer_id: act.customer_id, appointment_id: act.id, status: 'sent' })
        results.afspraken++
      }
    }
  } catch (err) {
    results.errors.push(String(err))
  }

  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
