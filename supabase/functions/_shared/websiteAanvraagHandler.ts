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
//
// Uitbreiding voor de websiteformulieren van bedrijven (Instellingen ›
// Websiteformulier), naast het formulier van bossbase.nl:
//   - GET ?formulier=<token> geeft de openbare instellingen van een formulier
//     (bedrijfsnaam, kleur, velden, koppeling). Niets daarvan is geheim.
//   - multipart/form-data: veld 'gegevens' is dezelfde JSON, plus maximaal
//     FOTO_LIMIETEN.aantal foto's in 'fotos'. Die komen bij het project.
//   - Het kant-en-klare formulier draait op een pagina van BossBase in een
//     iframe. De Origin is dan BossBase; die pagina stuurt in 'ingebed_op' de
//     origins van de pagina's eromheen (location.ancestorOrigins, die een
//     pagina niet kan vervalsen), en díe moeten op de domeinlijst staan.
//   - Testen vanuit Instellingen: met een geldige sessie van iemand uit
//     hetzelfde bedrijf die het formulier mag beheren. Dan geldt de
//     domeinlijst niet, en is het altijd een testaanvraag.

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
  address: string | null
  postcode: string | null
  city: string | null
  gewenste_datum: string | null
  eigen_velden: { naam: string; waarde: string }[]
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
  /** Openbare instellingen voor het formulier op de website (GET). */
  configuratie?(formulier: Formulier): Promise<Record<string, unknown>>
  /** Mag deze sessie (Bearer-token) voor dit bedrijf een testaanvraag sturen? */
  magTesten?(jwt: string, companyId: string): Promise<boolean>
  /** Zet de foto's bij het project van deze aanvraag. Geeft het aantal terug. */
  bewaarFotos?(inquiryId: string, companyId: string, fotos: Foto[]): Promise<number>
  /** Het project (deal) dat de trigger van deze aanvraag maakte. */
  dealVan?(inquiryId: string): Promise<string | null>
}

export interface Foto {
  bytes: Uint8Array
  type: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface Opties {
  /** Origins van de pagina's van BossBase zelf, waar het kant-en-klare formulier draait. */
  paginaHerkomsten?: string[]
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
  configPogingen: 120, configVenster: 10 * 60,
} as const

// Foto's worden in de browser al verkleind (lange zijde 1600px, JPEG), dus een
// foto is zelden meer dan een halve megabyte. Dit is de bovengrens.
export const FOTO_LIMIETEN = {
  aantal: 5,
  bytesPerFoto: 6 * 1024 * 1024,
  maxBodyBytes: 32 * 1024 * 1024,
} as const

// Herkent het bestandstype aan de eerste bytes, niet aan wat de browser zegt.
export function fotoType(b: Uint8Array): Foto['type'] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

// 'https://www.voorbeeld.nl/pad' → 'https://www.voorbeeld.nl'; onzin → null.
function alsOrigin(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 300) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.origin
  } catch {
    return null
  }
}

const stilleLogger: Logger = { info() {}, fout() {} }

function corsHeaders(origin: string | null, toegestaan: boolean): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' }
  if (origin && toegestaan) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
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
    .filter(p => p.role === 'admin' || metVerkoopRecht.has(p.id))
    .map(p => p.id)
}

// ── Eigen velden ─────────────────────────────────────────────────────────────
// Wat een eigen veld heet en of het verplicht is, komt uit het formulier zelf
// (settings), nooit uit de browser. Bij het kant-en-klare formulier is de
// sleutel het id van het veld; bij koppelen de veldnaam op de eigen website.
// Onbekende sleutels vallen weg. De naam wordt op de aanvraag vastgelegd, zodat
// een later hernoemd veld een oude aanvraag niet verandert.
interface EigenVeldDef { id: string; naam: string; soort: string; opties?: string[]; verplicht?: boolean }

export function eigenVelden(
  settings: Record<string, unknown>, ingevuld: Record<string, string>,
): { ok: true; velden: { naam: string; waarde: string }[] } | { ok: false; fout: string } {
  const uit: { naam: string; waarde: string }[] = []
  if (settings.modus === 'koppelen') {
    const koppeling = Array.isArray(settings.koppeling) ? settings.koppeling as Record<string, string>[] : []
    for (const k of koppeling) {
      if (k?.doel !== 'eigen' || !k.naam) continue
      const w = ingevuld[k.veld]
      if (w) uit.push({ naam: k.naam, waarde: w })
    }
    return { ok: true, velden: uit }
  }
  const defs = Array.isArray(settings.eigen_velden) ? settings.eigen_velden as EigenVeldDef[] : []
  for (const d of defs) {
    if (!d?.id || !d.naam) continue
    let w = ingevuld[d.id] ?? ''
    if (!w) {
      if (d.verplicht) return { ok: false, fout: `Vul "${d.naam}" in` }
      continue
    }
    if (d.soort === 'getal') {
      const n = w.replace(/\s/g, '').replace(',', '.')
      if (!/^-?\d+(\.\d+)?$/.test(n)) return { ok: false, fout: `"${d.naam}" moet een getal zijn` }
    } else if (d.soort === 'keuze') {
      if (!(d.opties || []).includes(w)) return { ok: false, fout: `Kies bij "${d.naam}" een van de opties` }
    } else if (d.soort === 'janee') {
      const j = w.toLowerCase()
      if (!['ja', 'nee', 'true', 'false'].includes(j)) return { ok: false, fout: `Kies bij "${d.naam}" ja of nee` }
      w = j === 'ja' || j === 'true' ? 'Ja' : 'Nee'
    } else if (d.soort === 'datum') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(w)) return { ok: false, fout: `"${d.naam}" moet een datum zijn` }
    }
    uit.push({ naam: d.naam, waarde: w })
  }
  return { ok: true, velden: uit }
}

async function geefConfiguratie(req: Request, opslag: AanvraagOpslag, cors: Record<string, string>, log: Logger) {
  const token = new URL(req.url).searchParams.get('formulier') || ''
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token) || !opslag.configuratie) {
    return antwoord(404, { ok: false, fout: 'formulier_onbekend' }, cors)
  }
  try {
    if (!(await opslag.claimPoging(`cfg:${await opslag.hash(clientIp(req))}`, LIMIETEN.configPogingen, LIMIETEN.configVenster))) {
      return antwoord(429, { ok: false, fout: 'te_veel_pogingen' }, cors)
    }
    const formulier = await opslag.zoekFormulier(token)
    // Het formulier van bossbase.nl zelf heeft geen openbare instellingen nodig.
    if (!formulier || !formulier.is_active || formulier.settings?.bestemming === 'superadmin') {
      return antwoord(404, { ok: false, fout: 'formulier_onbekend' }, cors)
    }
    return antwoord(200, { ok: true, ...(await opslag.configuratie(formulier)) }, cors)
  } catch (e) {
    log.fout('configuratie laden mislukt', { soort: (e as Error)?.name })
    return antwoord(500, { ok: false, fout: 'serverfout' }, cors)
  }
}

export async function verwerkVerzoek(
  req: Request, opslag: AanvraagOpslag, log: Logger = stilleLogger, opties: Opties = {},
): Promise<Response> {
  const origin = req.headers.get('origin')
  const paginaHerkomsten = new Set(opties.paginaHerkomsten || [])
  let herkomstOk = false
  if (origin) {
    try {
      herkomstOk = paginaHerkomsten.has(origin) || (await opslag.bekendeHerkomsten()).has(origin)
    } catch (e) {
      log.fout('herkomsten laden mislukt', { soort: (e as Error)?.name })
    }
  }
  const cors = corsHeaders(origin, herkomstOk)

  if (req.method === 'OPTIONS') return new Response(null, { status: herkomstOk ? 204 : 403, headers: cors })
  if (req.method === 'GET' && new URL(req.url).searchParams.has('formulier')) {
    if (origin && !herkomstOk) return antwoord(403, { ok: false, fout: 'herkomst_niet_toegestaan' }, cors)
    return geefConfiguratie(req, opslag, cors, log)
  }
  if (req.method !== 'POST') {
    return antwoord(405, { ok: false, fout: 'methode_niet_toegestaan' }, { ...cors, Allow: 'GET, POST, OPTIONS' })
  }
  // Een browser op een onbekende site krijgt geen CORS-headers en kan het
  // antwoord dus niet lezen. Weigeren maakt dat expliciet en voorkomt dat we
  // voor zo'n pagina toch een aanvraag opslaan.
  if (origin && !herkomstOk) return antwoord(403, { ok: false, fout: 'herkomst_niet_toegestaan' }, cors)

  const soort = (req.headers.get('content-type') || '').toLowerCase()
  const metFotos = soort.startsWith('multipart/form-data')
  if (!soort.includes('application/json') && !metFotos) {
    return antwoord(415, { ok: false, fout: 'ongeldig_verzoek' }, cors)
  }
  const lengte = Number(req.headers.get('content-length') || 0)
  if (lengte > (metFotos ? FOTO_LIMIETEN.maxBodyBytes : LIMIETEN.maxBodyTekens)) {
    return antwoord(413, { ok: false, fout: 'te_groot' }, cors)
  }

  try {
    let ruw: string
    const fotos: Foto[] = []
    if (metFotos) {
      let delen: FormData
      try {
        delen = await req.formData()
      } catch {
        return antwoord(400, { ok: false, fout: 'ongeldig_verzoek' }, cors)
      }
      const g = delen.get('gegevens')
      ruw = typeof g === 'string' ? g : ''
      const bestanden = delen.getAll('fotos').filter((f): f is File => typeof f !== 'string')
      if (bestanden.length > FOTO_LIMIETEN.aantal) {
        return antwoord(400, { ok: false, fout: 'validatie', velden: { fotos: `Maximaal ${FOTO_LIMIETEN.aantal} foto's` } }, cors)
      }
      for (const f of bestanden) {
        if (f.size > FOTO_LIMIETEN.bytesPerFoto) {
          return antwoord(400, { ok: false, fout: 'validatie', velden: { fotos: 'Een foto is te groot' } }, cors)
        }
        const bytes = new Uint8Array(await f.arrayBuffer())
        const type = fotoType(bytes)
        if (!type) return antwoord(400, { ok: false, fout: 'validatie', velden: { fotos: 'Alleen foto\'s (JPG, PNG of WebP)' } }, cors)
        fotos.push({ bytes, type })
      }
    } else {
      ruw = await req.text()
    }
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
    const bedrijfsformulier = formulier.settings?.bestemming !== 'superadmin'
    // Het kant-en-klare formulier op een pagina van BossBase, ingebed op de
    // website van het bedrijf: dan telt waar die pagina in staat.
    const ingebedOp = Array.isArray((body as Record<string, unknown>)?.ingebed_op)
      ? ((body as Record<string, unknown>).ingebed_op as unknown[]).slice(0, 10).map(alsOrigin).filter((o): o is string => !!o)
      : []
    let herkomstGoed: boolean
    if (bedrijfsformulier) {
      // Een bedrijfsformulier werkt alleen op de opgegeven domeinen. Een lege
      // lijst betekent dus: nog nergens.
      herkomstGoed = !!origin && (
        domeinen.includes(origin)
        || (paginaHerkomsten.has(origin) && ingebedOp.some(o => domeinen.includes(o)))
      )
    } else {
      herkomstGoed = !origin || domeinen.length === 0 || domeinen.includes(origin)
    }

    // Testaanvraag vanuit Instellingen: alleen met een sessie uit dit bedrijf.
    let test = false
    const bearer = (req.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i)?.[1]
    // Altijd controleren als er een sessie meekomt (ook vanaf een toegestaan
    // domein), zodat een test nooit op de limiet per e-mailadres stukloopt.
    // Een bezoekersformulier stuurt nooit een Authorization-header mee.
    if (bearer && opslag.magTesten && bedrijfsformulier) {
      test = await opslag.magTesten(bearer, formulier.company_id)
    }
    if (!herkomstGoed && !test) {
      log.info('geweigerd: herkomst hoort niet bij dit formulier', { formulier: formulier.id })
      return antwoord(403, { ok: false, fout: 'herkomst_niet_toegestaan' }, cors)
    }

    const binnenLimiet = test || (
      await opslag.claimPoging(`form:${formulier.id}`, LIMIETEN.formulierPogingen, LIMIETEN.formulierVenster)
      && await opslag.claimPoging(`email:${await opslag.hash(a.email.toLowerCase())}`, LIMIETEN.emailPogingen, LIMIETEN.emailVenster))
    if (!binnenLimiet) {
      log.info('geweigerd: te veel pogingen (formulier/e-mail)', { formulier: formulier.id })
      return antwoord(429, { ok: false, fout: 'te_veel_pogingen' }, cors)
    }

    const settings = formulier.settings || {}
    const eigen = bedrijfsformulier ? eigenVelden(settings, a.eigen) : { ok: true as const, velden: [] }
    if (!eigen.ok) return antwoord(400, { ok: false, fout: 'validatie', velden: { eigen: eigen.fout } }, cors)
    const bron = typeof settings.source === 'string' && settings.source ? settings.source : 'website'
    const metadata: Record<string, unknown> = {
      privacy: { akkoord: true, versie: a.privacy_versie, akkoord_op: new Date().toISOString() },
    }
    if (a.branche) metadata.branche = a.branche
    if (fotos.length) metadata.fotos = fotos.length
    if (ingebedOp.length && origin && paginaHerkomsten.has(origin)) metadata.ingebed_op = ingebedOp[0]

    const { id, dubbel } = await opslag.bewaar({
      company_id: formulier.company_id,
      form_id: formulier.id,
      name: a.name,
      company_name: a.company_name,
      email: a.email,
      phone: a.phone,
      subject: a.subject,
      message: a.message,
      address: a.address,
      postcode: a.postcode,
      city: a.city,
      gewenste_datum: a.gewenste_datum,
      eigen_velden: eigen.velden,
      source: bron,
      source_url: a.source_url,
      status: 'nieuw',
      is_test: a.is_test || test,
      submission_id: a.submission_id,
      metadata,
    })

    if (dubbel) {
      // Dezelfde inzending nog een keer (dubbelklik, retry na netwerkfout).
      // Niet opnieuw opslaan en niet opnieuw melden, wel "gelukt" zeggen.
      log.info('dubbele inzending genegeerd', { formulier: formulier.id })
      return antwoord(200, { ok: true }, cors)
    }

    if (id && fotos.length && opslag.bewaarFotos) {
      // Na het opslaan: de trigger heeft dan het project gemaakt. Mislukt dit,
      // dan staat de aanvraag er wel; die is belangrijker dan de foto's.
      try {
        await opslag.bewaarFotos(id, formulier.company_id, fotos)
      } catch (e) {
        log.fout('foto\'s opslaan mislukt', { soort: (e as Error)?.name, formulier: formulier.id })
      }
    }

    if (id) {
      try {
        await opslag.meld(formulier.company_id, meldingVoor({ ...a, is_test: a.is_test || test }, id))
      } catch (e) {
        log.fout('melding maken mislukt', { soort: (e as Error)?.name })
      }
    }

    log.info('aanvraag opgeslagen', { formulier: formulier.id, test: a.is_test || test })
    // Alleen de tester krijgt te zien wélk project er is gemaakt, om er
    // meteen naartoe te kunnen. Een bezoeker heeft daar niets aan.
    if (test && id && opslag.dealVan) {
      return antwoord(200, { ok: true, deal_id: await opslag.dealVan(id).catch(() => null) }, cors)
    }
    return antwoord(200, { ok: true }, cors)
  } catch (e) {
    log.fout('verwerken mislukt', { soort: (e as Error)?.name, code: (e as { code?: string })?.code })
    return antwoord(500, { ok: false, fout: 'serverfout' }, cors)
  }
}
