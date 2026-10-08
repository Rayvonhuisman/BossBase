// Het websitetraject: pakketten en prijzen, de intakesleutel, de taak in het
// dashboard en de mails.
//
// Prijzen spiegelen src/lib/website.js. Een edge function kan die module niet
// laden, dus ze staan hier nog een keer; dit is de kant die rekent en afschrijft.
// Pas je een prijs aan, doe het dan in allebei.
import { bossbaseMail, bbP, bbKlein, bbKop2, bbVinkjes, bbUitgelicht } from './bossbaseMail.ts'
import { appOrigin } from './stripe.ts'

export type Pakket = 'basis' | 'compleet' | 'pro'

export const PAKKETTEN: Record<Pakket, { label: string; omvang: string; aanmeldPrijs: number; laterPrijs: number }> = {
  basis:    { label: 'Basis',    omvang: 'Onepager',                           aanmeldPrijs: 0,   laterPrijs: 0 },
  compleet: { label: 'Compleet', omvang: "6 pagina's + Google Bedrijfsprofiel", aanmeldPrijs: 299, laterPrijs: 595 },
  pro:      { label: 'Pro',      omvang: "12 pagina's + Google Bedrijfsprofiel", aanmeldPrijs: 499, laterPrijs: 995 },
}
export const PAKKET_VOLGORDE: Pakket[] = ['basis', 'compleet', 'pro']
export const isPakket = (p: unknown): p is Pakket => typeof p === 'string' && p in PAKKETTEN

export const HOSTING_PER_MAAND = 5
export const DOMEIN_PER_JAAR = 25
export const EMAIL_PER_MAAND = 9
export const TERMIJNEN = 12

// Extra's: de losse opties van NG Digital. laterPrijs is de prijs van NG
// Digital, aanmeldPrijs geldt in de intake. Spiegelt src/lib/website.js → EXTRAS.
export const EXTRAS: Record<string, { label: string; aanmeldPrijs: number; laterPrijs: number; bij: Pakket[]; perStuk?: boolean; maximum?: number; alleenBijAanmelding?: boolean }> = {
  fotoset:        { label: 'Fotoset voor je site',   aanmeldPrijs: 25, laterPrijs: 50,  bij: ['basis'] },
  google_profiel: { label: 'Google Bedrijfsprofiel', aanmeldPrijs: 49, laterPrijs: 95,  bij: ['basis'] },
  logo:           { label: 'Logo-ontwerp',           aanmeldPrijs: 39, laterPrijs: 75,  bij: ['basis', 'compleet', 'pro'] },
  extra_pagina:   { label: 'Extra pagina',           aanmeldPrijs: 49, laterPrijs: 95,  bij: ['compleet', 'pro'], perStuk: true, maximum: 10 },
  whatsapp:       { label: 'WhatsApp-knop',          aanmeldPrijs: 19, laterPrijs: 35,  bij: ['basis', 'compleet', 'pro'] },
}

/** Alleen geldige extra's met een geldig aantal, voor dit pakket. */
export function schoneExtras(extras: unknown, pakket: Pakket): Record<string, number> {
  const uit: Record<string, number> = {}
  const bron = (extras && typeof extras === 'object') ? extras as Record<string, unknown> : {}
  for (const [k, e] of Object.entries(EXTRAS)) {
    if (!e.bij.includes(pakket)) continue
    const n = Math.floor(Number(bron[k]) || 0)
    if (n > 0) uit[k] = e.perStuk ? Math.min(n, e.maximum ?? 10) : 1
  }
  return uit
}

export const extrasPrijs = (extras: Record<string, number>, bijAanmelding: boolean) =>
  Object.entries(extras).reduce((t, [k, n]) => t + n * (bijAanmelding ? EXTRAS[k].aanmeldPrijs : EXTRAS[k].laterPrijs), 0)

export const extrasTekst = (extras: Record<string, number>) =>
  Object.entries(extras).map(([k, n]) => `${n > 1 ? `${n} × ` : ''}${EXTRAS[k].label}`).join(', ')

// Wat een upgrade kost. Bij de aanmelding (de intake) geldt de aanmeldprijs.
// Daarna de prijs voor later upgraden; van Compleet naar Pro betaal je het
// verschil tussen de twee latere prijzen.
export function upgradePrijs(van: Pakket, naar: Pakket, bijAanmelding: boolean): number {
  if (PAKKET_VOLGORDE.indexOf(naar) <= PAKKET_VOLGORDE.indexOf(van)) return 0
  if (bijAanmelding) return PAKKETTEN[naar].aanmeldPrijs - PAKKETTEN[van].aanmeldPrijs
  return PAKKETTEN[naar].laterPrijs - PAKKETTEN[van].laterPrijs
}

// Bedrag per termijn in centen. De eerste termijnen krijgen een cent extra tot
// het totaal precies klopt: 29900 / 12 = 2491 rest 8, dus € 299 wordt 8
// termijnen van € 24,92 en 4 van € 24,91.
export function termijnCenten(totaalEuro: number, termijn: number, aantal = TERMIJNEN): number {
  const totaal = Math.round(totaalEuro * 100)
  const basis = Math.floor(totaal / aantal)
  const rest = totaal - basis * aantal
  return basis + (termijn < rest ? 1 : 0)
}

export const STATUS_LABEL: Record<string, string> = {
  wacht_op_intake:  'Wacht op je intake',
  intake_ontvangen: 'Intake ontvangen',
  in_bouw:          'In bouw',
  ter_beoordeling:  'Ter beoordeling',
  live:             'Live',
  geannuleerd:      'Geannuleerd',
}

// Website-mail naar ons. Vast adres: de opdracht noemt info@bossbase.nl.
export const WEBSITE_INTERN = 'info@bossbase.nl'

export const euro = (n: number) =>
  `€ ${Number(n).toLocaleString('nl-NL', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// ── De sleutel ──────────────────────────────────────────────────────────────
// 32 willekeurige bytes, base64url. In de database staat alleen de sha256, zodat
// een uitgelekte databasedump geen werkende links oplevert.
export const SLEUTEL_DAGEN = 30

export async function hashSleutel(sleutel: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sleutel))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function nieuweSleutel(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Maakt een nieuwe sleutel voor dit bedrijf en geeft de volledige link terug. */
export async function maakIntakeLink(admin: any, companyId: string, origin = ''): Promise<{ url: string; verlooptOp: string }> {
  const sleutel = nieuweSleutel()
  const verlooptOp = new Date(Date.now() + SLEUTEL_DAGEN * 86400_000).toISOString()
  const { error } = await admin.from('website_tokens').insert({
    company_id: companyId, hash: await hashSleutel(sleutel), verloopt_op: verlooptOp,
  })
  if (error) throw new Error(`Sleutel opslaan mislukt: ${error.message}`)
  return { url: `${appOrigin(origin)}/intake/${sleutel}`, verlooptOp }
}

/** Zoekt de sleutel op. Geeft null als hij onbekend, verlopen of gebruikt is. */
export async function controleerSleutel(admin: any, sleutel: unknown): Promise<{ id: string; company_id: string; verloopt_op: string } | null> {
  if (typeof sleutel !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(sleutel)) return null
  const { data } = await admin.from('website_tokens')
    .select('id, company_id, verloopt_op, gebruikt_op')
    .eq('hash', await hashSleutel(sleutel)).maybeSingle()
  if (!data || data.gebruikt_op || new Date(data.verloopt_op) <= new Date()) return null
  return data
}

// ── De taak in het dashboard ────────────────────────────────────────────────
// Een activiteit voor de eigenaar, plus een melding met een link naar de pagina
// Website. De sleutel zelf zet ik er niet in: activiteiten zijn zichtbaar voor
// collega's. Op de pagina Website maakt de knop een verse link.
export async function maakIntakeTaak(admin: any, companyId: string): Promise<string | null> {
  const { data: bedrijf } = await admin.from('companies').select('eigenaar_id').eq('id', companyId).maybeSingle()
  const eigenaar = bedrijf?.eigenaar_id ?? null
  const { data: taak } = await admin.from('activities').insert({
    company_id: companyId,
    title: 'Vul de intake voor je gratis website in',
    type: 'task',
    due_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    completed: false,
    notes: 'Open Website in het menu en klik op "Intake invullen", of gebruik de link uit onze mail. Hoe eerder je hem invult, hoe eerder je site live staat.',
    assigned_to: eigenaar,
    assigned_to_ids: eigenaar ? [eigenaar] : null,
    priority: 'hoog',
  }).select('id').maybeSingle()
  if (eigenaar) {
    await admin.from('notifications').insert({
      company_id: companyId, user_id: eigenaar, type: 'website',
      title: 'Je gratis website: vul de intake in',
      body: 'Vertel ons wat er op je site moet komen. Dat kost ongeveer een half uur.',
      link: 'website',
    })
  }
  return taak?.id ?? null
}

// ── Mails ───────────────────────────────────────────────────────────────────
const groet = (naam?: string | null) => bbP(`Hallo${naam ? ` ${esc(naam)}` : ''},`)

export function mailIntakeUitnodiging(o: { bedrijfsnaam?: string | null; url: string }) {
  const inhoud = [
    groet(o.bedrijfsnaam),
    bbP('Leuk dat je voor de gratis website hebt gekozen. Wij bouwen hem; jij vertelt ons wat erop moet.'),
    bbP('Via de knop hieronder kom je bij het intakeformulier. We hebben alvast ingevuld wat we van je weten: je bedrijfsnaam, adres, logo en contactgegevens. Controleer het en pas aan wat niet klopt.'),
    bbKop2('Zo gaat het'),
    bbVinkjes([
      '<strong>Intake invullen.</strong> Ongeveer een half uur. Tussendoor stoppen mag, je antwoorden blijven bewaard.',
      '<strong>Wij bouwen je site.</strong> Je ziet de voortgang in BossBase onder Website.',
      '<strong>Jij beoordeelt.</strong> Je krijgt een link, en geeft je wijzigingen één keer door.',
      '<strong>Live.</strong> Daarna gaat je site online.',
    ]),
    bbUitgelicht('Alleen bij je aanmelding', 'Meer pagina\'s voor minder',
      `Kies je in de intake voor Compleet of Pro, dan betaal je ${euro(PAKKETTEN.compleet.aanmeldPrijs)} of ${euro(PAKKETTEN.pro.aanmeldPrijs)} in plaats van ${euro(PAKKETTEN.compleet.laterPrijs)} of ${euro(PAKKETTEN.pro.laterPrijs)} later.`),
    bbKlein(`Hosting kost ${euro(HOSTING_PER_MAAND)} per maand en gaat pas in als je site live staat. De link is ${SLEUTEL_DAGEN} dagen geldig; daarna maak je onder Website in BossBase een nieuwe.`),
  ].join('')
  return {
    subject: 'Je gratis website: vul de intake in',
    html: bossbaseMail({
      titel: 'Je gratis website',
      bovenkop: 'Gratis website',
      kop: 'Vertel ons wat er op je site moet',
      voorvertoning: 'Ongeveer een half uur werk. We hebben al ingevuld wat we van je weten.',
      inhoud,
      knop: { tekst: 'Intake invullen', url: o.url },
      reden: 'Je krijgt deze mail omdat je bij je jaarabonnement voor de gratis website hebt gekozen.',
    }),
  }
}

export function mailIntakeBevestiging(o: { bedrijfsnaam?: string | null; pakket: Pakket; betaling?: string | null }) {
  const p = PAKKETTEN[o.pakket]
  const inhoud = [
    groet(o.bedrijfsnaam),
    bbP(`Bedankt, we hebben je intake ontvangen. Je hebt gekozen voor <strong>${esc(p.label)}</strong> (${esc(p.omvang)}).`),
    o.betaling ? bbP(esc(o.betaling)) : '',
    bbP('We gaan aan de slag. Zodra er een eerste versie staat, krijg je een link om hem te bekijken. Hoe ver we zijn, zie je in BossBase onder Website.'),
  ].join('')
  return {
    subject: 'We hebben je intake ontvangen',
    html: bossbaseMail({
      titel: 'Intake ontvangen', bovenkop: 'Je website', kop: 'Je intake is binnen',
      voorvertoning: 'We gaan aan de slag met je website.',
      inhoud,
      knop: { tekst: 'Bekijk in BossBase', url: `${appOrigin('')}/dashboard/website` },
    }),
  }
}

// Bij elke statuswijziging. Bij "ter beoordeling" met de link en de uitleg over
// de ene feedbackronde; bij "live" met de hosting.
export function mailStatus(o: { bedrijfsnaam?: string | null; status: string; siteUrl?: string | null }) {
  const label = STATUS_LABEL[o.status] ?? o.status
  const dashboard = `${appOrigin('')}/dashboard/website`
  let kop = `Je website: ${label.toLowerCase()}`
  let tekst = ''
  let knop = { tekst: 'Bekijk in BossBase', url: dashboard }
  switch (o.status) {
    case 'intake_ontvangen':
      kop = 'We hebben je intake'
      tekst = bbP('Je intake is binnen. We kijken hem door en beginnen daarna met bouwen.')
      break
    case 'in_bouw':
      kop = 'We bouwen je website'
      tekst = bbP('We zijn begonnen met je site. Zodra er een versie staat die je kunt bekijken, hoor je het van ons.')
      break
    case 'ter_beoordeling':
      kop = 'Je website staat klaar om te bekijken'
      tekst = [
        bbP('De eerste versie van je site staat klaar. Kijk hem rustig door, ook op je telefoon.'),
        bbP('Geef daarna in BossBase onder Website je wijzigingen door, <strong>alles in één keer</strong>. Die verwerken we, en daarna zetten we je site live.'),
        o.siteUrl ? bbKlein(`Link naar je site: <a href="${esc(o.siteUrl)}" style="color:#047a35;">${esc(o.siteUrl)}</a>`) : '',
      ].join('')
      knop = { tekst: 'Wijzigingen doorgeven', url: dashboard }
      break
    case 'live':
      kop = 'Je website staat live'
      tekst = [
        bbP('Gefeliciteerd, je site is online.'),
        o.siteUrl ? bbP(`<a href="${esc(o.siteUrl)}" style="color:#047a35;font-weight:700;">${esc(o.siteUrl)}</a>`) : '',
        bbKlein(`Vanaf nu loopt de hosting: ${euro(HOSTING_PER_MAAND)} per maand, als regel op je BossBase-abonnement. Heb je een domeinnaam of zakelijke e-mail bij ons, dan staan die er vanaf nu ook op. Wil je later iets laten aanpassen, dan vraag je dat aan onder Website.`),
      ].join('')
      break
    case 'geannuleerd':
      kop = 'Je website-aanvraag is gestopt'
      tekst = bbP('We hebben je website-aanvraag stopgezet. Klopt dat niet, antwoord dan op deze mail.')
      break
    default:
      tekst = bbP(`De status van je website is nu: <strong>${esc(label)}</strong>.`)
  }
  return {
    subject: kop,
    html: bossbaseMail({
      titel: kop, bovenkop: 'Je website', kop: esc(kop), voorvertoning: kop,
      inhoud: groet(o.bedrijfsnaam) + tekst, knop,
    }),
  }
}

// Melding aan ons: nieuwe intake, upgrade, verzoek, feedback.
export function mailIntern(o: { onderwerp: string; kop: string; bedrijf: { id: string; name?: string | null; email?: string | null; phone?: string | null }; regels: [string, string][]; tekst?: string }) {
  const rij = (k: string, v: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;font-size:14px;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;font-size:14px;">${v}</td></tr>`
  const inhoud = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
      ${rij('Bedrijf', `<strong>${esc(o.bedrijf.name ?? 'onbekend')}</strong>`)}
      ${rij('E-mail', esc(o.bedrijf.email ?? '—'))}
      ${rij('Telefoon', esc(o.bedrijf.phone ?? '—'))}
      ${o.regels.map(([k, v]) => rij(k, esc(v))).join('')}
    </table>
    ${o.tekst ? `<div style="white-space:pre-wrap;padding:14px 16px;background:#f4f4f2;border-radius:12px;font-size:14px;line-height:1.55;">${esc(o.tekst)}</div>` : ''}`
  return {
    subject: o.onderwerp,
    html: bossbaseMail({
      titel: o.onderwerp, bovenkop: 'Websites', kop: esc(o.kop), voorvertoning: o.onderwerp,
      inhoud, knop: { tekst: 'Open Websites in de superadmin', url: `${appOrigin('')}/superadmin` },
    }),
  }
}
