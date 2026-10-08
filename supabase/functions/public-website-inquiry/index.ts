// public-website-inquiry — ontvangt het contactformulier van een website en
// slaat het op als aanvraag (public.inquiries) bij het bedrijf van dat
// formulier.
//
// Publiek (verify_jwt = false in config.toml): de bezoeker is niet ingelogd.
// Wat het veilig maakt, staat in _shared/websiteAanvraagHandler.ts:
//   - het company_id komt uit het formulier (gevonden op het openbare token),
//     nooit uit de request-body;
//   - alleen bekende velden worden gelezen, gevalideerd en begrensd;
//   - honeypot, rate limit per IP / formulier / e-mailadres;
//   - CORS alleen voor origins die bij een actief formulier horen.
//
// Logs bevatten nooit naam, e-mail, bericht, IP of token — alleen het
// formulier-id en de soort fout.
//
// Env: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY (door Supabase geïnjecteerd).
// Geen extra secrets nodig.
//
// Websiteformulieren van bedrijven (Instellingen › Websiteformulier) lopen hier
// ook doorheen: het kant-en-klare formulier (public/aanvraagformulier.html) en
// het koppelscript (public/formulier.js). Zie de kop van
// _shared/websiteAanvraagHandler.ts voor wat daarbij anders is.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'
import { bronVanBezoeker } from '../_shared/meting.ts'
import {
  kiesOntvangers,
  verwerkVerzoek,
  type AanvraagOpslag,
  type Logger,
} from '../_shared/websiteAanvraagHandler.ts'

// De pagina's van BossBase waarop het kant-en-klare formulier draait (in een
// iframe op de website van het bedrijf).
const siteOrigin = (() => {
  try { return new URL(Deno.env.get('SITE_URL') || 'https://www.bossbase.nl').origin } catch { return 'https://www.bossbase.nl' }
})()
const PAGINA_HERKOMSTEN = [...new Set(['https://www.bossbase.nl', 'https://bossbase.nl', siteOrigin])]

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const log: Logger = {
  info: (bericht, velden) => console.log(`[public-website-inquiry] ${bericht}`, velden ?? ''),
  fout: (bericht, velden) => console.error(`[public-website-inquiry] ${bericht}`, velden ?? ''),
}

// Origins van actieve formulieren, een minuut in het geheugen van deze
// instantie. Een preflight kost zo geen databasecall per bezoeker.
let herkomsten: { set: Set<string>; tot: number } | null = null

// HMAC-sleutel voor IP- en e-mailhashes in de limiettabel. De service-role key
// verlaat de server nooit; roteert hij, dan beginnen de tellers opnieuw.
const hmacSleutel = crypto.subtle.importKey(
  'raw', new TextEncoder().encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
)

// ── Aanvragen voor BossBase zelf (formulier op bossbase.nl) ─────────────────
// Die komen binnen in de superadmin en gaan per mail naar ons, met alle
// gegevens en een link. Geen pipeline, geen melding in een bedrijf.
const MELD_ADRES = 'info@bossbase.nl'

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

async function mailNaarBossBase(inquiryId: string) {
  const { data: a, error } = await admin
    .from('inquiries')
    .select('name, company_name, email, phone, subject, message, source_url, metadata, is_test, created_at')
    .eq('id', inquiryId)
    .single()
  if (error) throw error

  const siteUrl = Deno.env.get('SITE_URL') || 'https://www.bossbase.nl'
  const link = `${siteUrl}/superadmin?aanvraag=${inquiryId}`
  const rij = (k: string, v: unknown) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>` : ''
  const branche = (a.metadata as Record<string, unknown> | null)?.branche
  const html = mailTemplate({
    title: a.is_test ? 'Testaanvraag via bossbase.nl' : 'Nieuwe aanvraag via bossbase.nl',
    preheader: `${a.name}${a.company_name ? ` (${a.company_name})` : ''}${a.subject ? ` · ${a.subject}` : ''}`,
    body: `<table style="border-collapse:collapse;font-size:15px">
             ${rij('Naam', a.name)}${rij('Bedrijf', a.company_name)}${rij('E-mail', a.email)}${rij('Telefoon', a.phone)}
             ${rij('Onderwerp', a.subject)}${rij('Branche', branche)}${rij('Pagina', a.source_url)}
           </table>
           <p style="margin-top:16px;white-space:pre-wrap">${esc(a.message)}</p>`,
    buttonText: 'Open in de superadmin',
    buttonUrl: link,
  })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `BossBase <${Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'}>`,
      to: MELD_ADRES,
      reply_to: a.email,
      subject: `${a.is_test ? '[TEST] ' : ''}Aanvraag via bossbase.nl: ${a.company_name || a.name}${a.subject ? ` · ${a.subject}` : ''}`,
      html,
    }),
  })
  if (!res.ok) throw new Error(`Resend gaf status ${res.status}`)
}

const opslag: AanvraagOpslag = {
  async bekendeHerkomsten() {
    if (herkomsten && herkomsten.tot > Date.now()) return herkomsten.set
    const { data, error } = await admin.from('website_forms').select('allowed_domains').eq('is_active', true)
    if (error) throw error
    const set = new Set<string>()
    for (const rij of data ?? []) for (const d of (rij.allowed_domains as string[] | null) ?? []) set.add(d)
    herkomsten = { set, tot: Date.now() + 60_000 }
    return set
  },

  async zoekFormulier(token) {
    const { data, error } = await admin
      .from('website_forms')
      .select('id, company_id, is_active, allowed_domains, settings')
      .eq('public_token', token)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async claimPoging(sleutel, max, vensterSeconden) {
    const { data, error } = await admin.rpc('bb_website_inquiry_claim', {
      p_sleutel: sleutel, p_max: max, p_venster_sec: vensterSeconden,
    })
    if (error) throw error
    return data === true
  },

  async bewaar(rij) {
    const { data, error } = await admin.from('inquiries').insert(rij).select('id').single()
    // 23505 = unieke index (form_id, submission_id): deze inzending bestond al.
    if (error?.code === '23505') return { id: null, dubbel: true }
    if (error) throw error
    return { id: data.id as string, dubbel: false }
  },

  async meld(companyId, melding) {
    // Welk formulier, en is er door de trigger al een deal van gemaakt
    // (bb_websiteaanvraag_naar_pipeline)?
    const { data: inq, error: inqFout } = await admin
      .from('inquiries')
      .select('deal_id, website_forms(settings)')
      .eq('id', melding.inquiryId)
      .single()
    if (inqFout) throw inqFout
    const bestemming = (inq?.website_forms as { settings?: Record<string, unknown> } | null)?.settings?.bestemming
    if (bestemming === 'superadmin') {
      await mailNaarBossBase(melding.inquiryId)
      return
    }

    const { data: profielen, error } = await admin
      .from('profiles')
      .select('id, role')
      .eq('company_id', companyId)
      .eq('actief', true)
      .is('verwijderd_op', null)
    if (error) throw error
    if (!profielen?.length) return

    const { data: rechten, error: rechtFout } = await admin
      .from('user_permissions')
      .select('user_id')
      .in('user_id', profielen.map(p => p.id))
      .eq('permission', 'verkoop')
      .eq('granted', true)
    if (rechtFout) throw rechtFout

    const ontvangers = kiesOntvangers(profielen, new Set((rechten ?? []).map(r => r.user_id as string)))
    if (!ontvangers.length) return

    const { error: insFout } = await admin.from('notifications').insert(ontvangers.map(userId => ({
      company_id:   companyId,
      user_id:      userId,
      type:         'website_aanvraag',
      title:        melding.titel,
      body:         melding.tekst,
      // De aanvraag staat als project in de pipeline; de melding opent dat.
      link:         inq?.deal_id ? `deal/${inq.deal_id}` : 'pipeline',
      related_type: inq?.deal_id ? 'deal' : 'inquiry',
      related_id:   inq?.deal_id ?? melding.inquiryId,
    })))
    if (insFout) throw insFout
  },

  async configuratie(formulier) {
    const { data: bedrijf, error } = await admin
      .from('companies')
      .select('name, branding_color')
      .eq('id', formulier.company_id)
      .single()
    if (error) throw error
    const s = formulier.settings || {}
    return {
      bedrijf: bedrijf?.name || '',
      kleur: /^#[0-9a-fA-F]{6}$/.test(bedrijf?.branding_color || '') ? bedrijf.branding_color : '#1DDB62',
      modus: s.modus === 'koppelen' ? 'koppelen' : 'kant_en_klaar',
      velden: Array.isArray(s.velden) ? s.velden : [],
      koppeling: Array.isArray(s.koppeling) ? s.koppeling : [],
      eigen_velden: Array.isArray(s.eigen_velden) ? s.eigen_velden : [],
      privacy_url: typeof s.privacy_url === 'string' ? s.privacy_url : null,
    }
  },

  // Dezelfde regel als bb_has_permission('instellingen'): actief, in dit
  // bedrijf, en beheerder of met het recht.
  async magTesten(jwt, companyId) {
    const { data: u, error } = await admin.auth.getUser(jwt)
    if (error || !u?.user) return false
    const { data: p } = await admin
      .from('profiles')
      .select('company_id, role, actief')
      .eq('id', u.user.id)
      .maybeSingle()
    if (!p || p.company_id !== companyId || p.actief === false) return false
    if (p.role === 'admin') return true
    const { data: recht } = await admin
      .from('user_permissions')
      .select('user_id')
      .eq('user_id', u.user.id)
      .eq('company_id', companyId)
      .eq('permission', 'instellingen')
      .eq('granted', true)
      .maybeSingle()
    return !!recht
  },

  async dealVan(inquiryId) {
    const { data } = await admin.from('inquiries').select('deal_id').eq('id', inquiryId).single()
    return (data?.deal_id as string | null) ?? null
  },

  // Zelfde plek en vorm als een foto die je in de app bij de aanvraag zet
  // (projectsService.uploadProjectFoto): privébucket, pad
  // <bedrijf>/<project>/<uuid>.<ext>, en alleen het pad in project_fotos.
  async bewaarFotos(inquiryId, companyId, fotos) {
    const { data: inq, error } = await admin.from('inquiries').select('deal_id').eq('id', inquiryId).single()
    if (error) throw error
    if (!inq?.deal_id) return 0
    const { data: project, error: pFout } = await admin
      .from('projects').select('id').eq('deal_id', inq.deal_id).eq('company_id', companyId).maybeSingle()
    if (pFout) throw pFout
    if (!project) return 0

    let aantal = 0
    for (const f of fotos) {
      const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg'
      const pad = `${companyId}/${project.id}/${crypto.randomUUID()}.${ext}`
      const { error: upFout } = await admin.storage.from('project-fotos').upload(pad, f.bytes, { contentType: f.type })
      if (upFout) throw upFout
      const { error: insFout } = await admin.from('project_fotos').insert({
        company_id: companyId, project_id: project.id, url: pad, categorie: 'website',
      })
      if (insFout) throw insFout
      aantal++
    }
    return aantal
  },

  async hash(waarde) {
    const sig = await crypto.subtle.sign('HMAC', await hmacSleutel, new TextEncoder().encode(waarde))
    return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('')
  },
}

// Bij een aanvraag via bossbase.nl zelf het kanaal meegeven waarlangs de
// bezoeker vandaag binnenkwam (eigen cookievrije meting, zie _shared/meting.ts).
// Per verzoek een eigen opslag-object: de bron hoort bij dít verzoek.
Deno.serve(req => verwerkVerzoek(req, {
  ...opslag,
  async bewaar(rij) {
    try {
      const { data: f } = await admin.from('website_forms').select('settings').eq('id', rij.form_id).maybeSingle()
      if ((f?.settings as Record<string, unknown> | null)?.bestemming === 'superadmin') {
        const bron = await bronVanBezoeker(admin, req)
        if (bron) rij = { ...rij, metadata: { ...rij.metadata, bron } }
      }
    } catch { /* zonder bron gewoon bewaren */ }
    return opslag.bewaar(rij)
  },
}, log, { paginaHerkomsten: PAGINA_HERKOMSTEN }))
