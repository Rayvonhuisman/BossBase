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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  kiesOntvangers,
  verwerkVerzoek,
  type AanvraagOpslag,
  type Logger,
} from '../_shared/websiteAanvraagHandler.ts'

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
      link:         `aanvragen/${melding.inquiryId}`,
      related_type: 'inquiry',
      related_id:   melding.inquiryId,
    })))
    if (insFout) throw insFout
  },

  async hash(waarde) {
    const sig = await crypto.subtle.sign('HMAC', await hmacSleutel, new TextEncoder().encode(waarde))
    return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('')
  },
}

Deno.serve(req => verwerkVerzoek(req, opslag, log))
