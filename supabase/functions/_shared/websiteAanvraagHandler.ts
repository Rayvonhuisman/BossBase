// Verwerking van een openbare websiteaanvraag, los van Deno en Supabase.
//
// De functie public-website-inquiry geeft hier een opslag-object aan dat met
// de service-role praat; de test geeft een nep-opslag. Zo is de hele volgorde
// (CORS, honeypot, rate limit, validatie, formulier, opslaan, melden) te testen
// zonder deploy.
//
// De volgorde is bewust:
//   1. methode, type, grootte, JSON        — goedkoop, vóór elke databasecall
//   2. rate limit per IP                   — telt óók mislukte pogingen, zodat
//                                            niemand ongelimiteerd tokens raadt
//   3. honeypot                            — doet alsof het gelukt is
//   4. validatie                           — veldmeldingen terug
//   5. formulier op token, actief, herkomst
//   6. rate limit per formulier en e-mail
//   7. opslaan; company_id komt uit het formulier, nooit uit de body
//   8. melden (best effort)

import { leesAanvraag, type SchoneAanvraag } from './websiteAanvraag.ts'

export interface Formulier {
  id: string
  company_id: string
  is_active: boolean
  allowed_domains: string[] | null
  settings: Record<string, unknown> | null
}

export interface NieuweAanvraag {
  company_id: string
  form_id: string
  name: string
  company_name: string | null
  email: string
  phone: string | null
  subject: string | null
  message: string
  source: string
  source_url: string | null
  status: 'nieuw'
  is_test: boolean
  submission_id: string | null
  metadata: Record<string, unknown>
}

export interface Melding {
  inquiryId: string
  titel: string
  tekst: string
}

export interface AanvraagOpslag {
  /** Alle origins die bij een actief formulier horen (voor CORS). */
  bekendeHerkomsten(): Promise<Set<string>>
  zoekFormulier(token: string): Promise<Formulier | null>
  /** true = binnen de limiet (en de poging is geteld), false = geblokkeerd. */
  claimPoging(sleutel: string, max: number, vensterSeconden: number): Promise<boolean>
  /** Geeft dubbel=true als deze submission_id voor dit formulier al bestond. */
  bewaar(rij: NieuweAanvraag): Promise<{ id: string | null; dubbel: boolean }>
  meld(companyId: string, melding: Melding): Promise<void>
  /** Eenrichtings-hash (HMAC) zodat er nooit een ruw IP of e-mailadres in de limiettabel staat. */
  hash(waarde: string): Promise<string>
}

export interface Logger {
  info(bericht: string, velden?: Record<string, unknown>): void
  fout(bericht: string, velden?: Record<string, unknown>): void
}

export const LIMIETEN = {
  maxBodyTekens: 20_000,
  ipPogingen: 10, ipVenster: 10 * 60,
  formulierPogingen: 200, formulierVenster: 60 * 60,
  emailPogingen: 5, emailVenster: 60 * 60,
} as const

const stilleLogger: Logger = { info() {}, fout() {} }

function corsHeaders(origin: string | null, toegestaan: boolean): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' }
  if (origin && toegestaan) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'content-type, authorization, apikey, x-client-info'
    h['Access-Control-Max-Age'] = '600'
  }
  return h
}

function antwoord(status: number, body: Record<string, unknown>, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'onbekend'
}

// Een melding bevat naam, bedrijf en onderwerp — genoeg om te weten waar het
// over gaat. Het bericht, e-mailadres en telefoonnummer blijven in de aanvraag
// zelf, achter de RLS van inquiries.
export function meldingVoor(a: SchoneAanvraag, inquiryId: string): Melding {
  const delen = [a.company_name ? `${a.name} (${a.company_name})` : a.name]
  if (a.subject) delen.push(a.subject)
  const tekst = delen.join(' · ')
  return {
    inquiryId,
    titel: a.is_test ? 'Testaanvraag via de website' : 'Nieuwe websiteaanvraag',
    tekst: tekst.length > 140 ? `${tekst.slice(0, 139)}…` : tekst,
  }
}

// Wie een melding krijgt: dezelfde regel als bb_has_permission('verkoop'),
// het recht waarmee de pagina Aanvragen en de RLS op inquiries werken.
export function kiesOntvangers(
  profielen: { id: string; role: string | null }[],
  metVerkoopRecht: Set<string>,
): string[] {
  return profielen
    .filter(p => p.role === 'admin' || p.role === 'planner' || metVerkoopRecht.has(p.id))
    .map(p => p.id)
}

export async function verwerkVerzoek(req: Request, opslag: AanvraagOpslag, log: Logger = stilleLogger): Promise<Response> {
  const origin = req.headers.get('origin')
  let herkomstOk = false
  if (origin) {
    try {
      herkomstOk = (await opslag.bekendeHerkomsten()).has(origin)
    } catch (e) {
      log.fout('herkomsten laden mislukt', { soort: (e as Error)?.name })
    }
  }
  const cors = corsHeaders(origin, herkomstOk)

  if (req.method === 'OPTIONS') return new Response(null, { status: herkomstOk ? 204 : 403, headers: cors })
  if (req.method !== 'POST') {
    return antwoord(405, { ok: false, fout: 'methode_niet_toegestaan' }, { ...cors, Allow: 'POST, OPTIONS' })
  }
  // Een browser op een onbekende site krijgt geen CORS-headers en kan het
  // antwoord dus niet lezen. Weigeren maakt dat expliciet en voorkomt dat we
  // voor zo'n pagina toch een aanvraag opslaan.
  if (origin && !herkomstOk) return antwoord(403, { ok: false, fout: 'herkomst_niet_toegestaan' }, cors)

  if (!(req.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return antwoord(415, { ok: false, fout: 'ongeldig_verzoek' }, cors)
  }
  const lengte = Number(req.headers.get('content-length') || 0)
  if (lengte > LIMIETEN.maxBodyTekens) return antwoord(413, { ok: false, fout: 'te_groot' }, cors)

  try {
    const ruw = await req.text()
    if (ruw.length > LIMIETEN.maxBodyTekens) return antwoord(413, { ok: false, fout: 'te_groot' }, cors)

    let body: unknown
    try {
      body = JSON.parse(ruw)
    } catch {
      return antwoord(400, { ok: false, fout: 'ongeldig_verzoek' }, cors)
    }

    if (!(await opslag.claimPoging(`ip:${await opslag.hash(clientIp(req))}`, LIMIETEN.ipPogingen, LIMIETEN.ipVenster))) {
      log.info('geweigerd: te veel pogingen (ip)')
      return antwoord(429, { ok: false, fout: 'te_veel_pogingen' }, cors)
    }

    const gelezen = leesAanvraag(body)
    if (gelezen.honeypot) {
      // Doe alsof het gelukt is: een bot die een fout ziet, probeert het anders.
      log.info('honeypot gevuld, niet opgeslagen')
      return antwoord(200, { ok: true }, cors)
    }
    if (!gelezen.ok) {
      if (gelezen.fouten.form_token) return antwoord(404, { ok: false, fout: 'formulier_onbekend' }, cors)
      return antwoord(400, { ok: false, fout: 'validatie', velden: gelezen.fouten }, cors)
    }
    const a = gelezen.aanvraag

    const formulier = await opslag.zoekFormulier(a.form_token)
    if (!formulier || !formulier.is_active) {
      log.info('geweigerd: formulier onbekend of uitgeschakeld')
      return antwoord(404, { ok: false, fout: 'formulier_onbekend' }, cors)
    }
    const domeinen = formulier.allowed_domains || []
    if (origin && domeinen.length > 0 && !domeinen.includes(origin)) {
      log.info('geweigerd: herkomst hoort niet bij dit formulier', { formulier: formulier.id })
      return antwoord(403, { ok: false, fout: 'herkomst_niet_toegestaan' }, cors)
    }

    const binnenLimiet =
      await opslag.claimPoging(`form:${formulier.id}`, LIMIETEN.formulierPogingen, LIMIETEN.formulierVenster)
      && await opslag.claimPoging(`email:${await opslag.hash(a.email.toLowerCase())}`, LIMIETEN.emailPogingen, LIMIETEN.emailVenster)
    if (!binnenLimiet) {
      log.info('geweigerd: te veel pogingen (formulier/e-mail)', { formulier: formulier.id })
      return antwoord(429, { ok: false, fout: 'te_veel_pogingen' }, cors)
    }

    const settings = formulier.settings || {}
    const bron = typeof settings.source === 'string' && settings.source ? settings.source : 'website'
    const metadata: Record<string, unknown> = {
      privacy: { akkoord: true, versie: a.privacy_versie, akkoord_op: new Date().toISOString() },
    }
    if (a.branche) metadata.branche = a.branche

    const { id, dubbel } = await opslag.bewaar({
      company_id: formulier.company_id,
      form_id: formulier.id,
      name: a.name,
      company_name: a.company_name,
      email: a.email,
      phone: a.phone,
      subject: a.subject,
      message: a.message,
      source: bron,
      source_url: a.source_url,
      status: 'nieuw',
      is_test: a.is_test,
      submission_id: a.submission_id,
      metadata,
    })

    if (dubbel) {
      // Dezelfde inzending nog een keer (dubbelklik, retry na netwerkfout).
      // Niet opnieuw opslaan en niet opnieuw melden, wel "gelukt" zeggen.
      log.info('dubbele inzending genegeerd', { formulier: formulier.id })
      return antwoord(200, { ok: true }, cors)
    }

    if (id) {
      try {
        await opslag.meld(formulier.company_id, meldingVoor(a, id))
      } catch (e) {
        log.fout('melding maken mislukt', { soort: (e as Error)?.name })
      }
    }

    log.info('aanvraag opgeslagen', { formulier: formulier.id, test: a.is_test })
    return antwoord(200, { ok: true }, cors)
  } catch (e) {
    log.fout('verwerken mislukt', { soort: (e as Error)?.name, code: (e as { code?: string })?.code })
    return antwoord(500, { ok: false, fout: 'serverfout' }, cors)
  }
}
