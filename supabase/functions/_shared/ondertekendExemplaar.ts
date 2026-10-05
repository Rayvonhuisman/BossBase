// Het ondertekende exemplaar van een offerte of werkbon, gemaakt op de server.
//
// Waarom hier en niet in de browser: tot oktober 2026 maakte de browser van de
// ondertekenaar de "ondertekende PDF" en stuurde die mee. De server bewaarde en
// mailde dat bestand ongezien. Een klant kon dus elk document als het juridische
// bewijsstuk laten opslaan (audit 2026-10-01, H4: een zelfgemaakte PDF met
// "totaal EUR 1,00" werd het officiële exemplaar). Nu maakt de server het
// exemplaar uit de gegevens in de database op het moment van tekenen, en legt hij
// een SHA-256 van de inhoud en van het bestand vast in `ondertekening_bewijs`.
//
// De opmaak is dezelfde als die van de PDF in de app: logo, huisstijl, alle
// regels en totalen, en bij de werkbon het uitgevoerde werk, de uren, het
// materiaal (zonder prijzen), de klantnotities en de foto's. Dat komt doordat
// beide dezelfde code gebruiken (_shared/pdfOpbouw.js, jsPDF); hier staat alleen
// wat de server anders doet: de gegevens uit de database halen en de
// afbeeldingen ophalen zonder browser. Onder de handtekening staan daarnaast het
// IP-adres en het kenmerk.
//
// Wat erin staat is beperkt tot wat de klant ook op de ondertekenpagina ziet:
// geen interne notities, geen inkoopprijzen, geen marge. De werkbon komt uit
// dezelfde sign-token-functies als de publieke pagina; die zijn de afscherming.
//
// Het kenmerk (`inhoud_sha256`) is de SHA-256 van een JSON-weergave van wat er
// is getekend (zie `inhoud` hieronder: per soort de regels, totalen, uren,
// materiaal en notities). `pdf_sha256` is de hash van het bestand zelf.

import { jsPDF } from 'npm:jspdf@4.2.1'
import { buildPdf, buildWerkbonPdf } from './pdfOpbouw.js'
import { regimeVanPct } from './btwRegime.js'
import { bouwPdfData } from './werkbonPdfData.js'

export type Ondertekening = {
  naam: string
  email: string
  tijdstip: string        // ISO
  ip: string | null
  userAgent: string | null
  handtekeningPng: Uint8Array | null
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function bytesNaarBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// ── Afbeeldingen zonder browser ─────────────────────────────────────────────
// De app verkleint afbeeldingen met een canvas; dat bestaat hier niet. Foto's
// worden bij het uploaden al verkleind (afbeeldingComprimeren), en een logo is
// klein, dus hier alleen de afmetingen uitlezen en op maat zetten.

const MIME_FORMAAT: Record<string, string> = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/jpg': 'JPEG', 'image/webp': 'WEBP', 'image/gif': 'GIF' }

function afmetingenUitBytes(b: Uint8Array): { w: number; h: number } | null {
  const u32 = (i: number) => (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0
  const u16le = (i: number) => b[i] | b[i + 1] << 8
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { w: u32(16), h: u32(20) }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: u16le(6), h: u16le(8) }
  // JPEG: zoek het SOF-segment
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1]
      const len = b[i + 2] << 8 | b[i + 3]
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
        return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8] }
      }
      i += 2 + len
    }
    return null
  }
  // WebP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const soort = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (soort === 'VP8 ') return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff }
    if (soort === 'VP8L') {
      const bits = b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (soort === 'VP8X') return { w: 1 + (b[24] | b[25] << 8 | b[26] << 16), h: 1 + (b[27] | b[28] << 8 | b[29] << 16) }
  }
  return null
}

function dataUrlBytes(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '')
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { mime: m[1].toLowerCase(), bytes }
}

const naarDataUrlVanBytes = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${bytesNaarBase64(bytes)}`

function serverOmgeving(admin: any) {
  return {
    // Alleen http(s) of een opslagpad in een van onze buckets.
    async naarDataUrl(url: string): Promise<string | null> {
      try {
        if (!url) return null
        if (url.startsWith('data:')) return url
        if (!/^https:\/\//i.test(url)) return null
        const res = await fetch(url)
        if (!res.ok) return null
        const mime = (res.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase()
        if (!MIME_FORMAAT[mime]) return null
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.length > 8_000_000) return null
        return naarDataUrlVanBytes(bytes, mime)
      } catch { return null }
    },
    async bereidAfbeelding(dataUrl: string, maxWmm: number, maxHmm: number) {
      const d = dataUrlBytes(dataUrl)
      if (!d) return null
      const formaat = MIME_FORMAAT[d.mime]
      const dims = afmetingenUitBytes(d.bytes)
      if (!formaat || !dims?.w || !dims?.h) return null
      const schaal = Math.min(maxWmm / dims.w, maxHmm / dims.h)
      return { dataUrl, formaat, breedte: dims.w * schaal, hoogte: dims.h * schaal }
    },
    async afmetingen(dataUrl: string) {
      const d = dataUrlBytes(dataUrl)
      return d ? afmetingenUitBytes(d.bytes) : null
    },
    // Geen documentUrl en geen supabaseUrl: de handtekening geven we zelf mee.
    _admin: admin,
  }
}

async function opslagNaarDataUrl(admin: any, bucket: string, pad: string): Promise<string | null> {
  try {
    const { data, error } = await admin.storage.from(bucket).download(pad)
    if (error || !data) return null
    const mime = (data.type || 'image/jpeg').toLowerCase()
    if (!MIME_FORMAAT[mime]) return null
    return naarDataUrlVanBytes(new Uint8Array(await data.arrayBuffer()), mime)
  } catch { return null }
}

const handtekeningDataUrl = (o: Ondertekening) =>
  o.handtekeningPng ? `data:image/png;base64,${bytesNaarBase64(o.handtekeningPng)}` : null

function nieuwDocument() {
  return new jsPDF({ unit: 'mm', format: 'a4' })
}

const pdfBytes = (doc: any) => new Uint8Array(doc.output('arraybuffer'))

// Bedrijf zoals de app het aan de PDF geeft: live gegevens, met de bevroren
// snapshot van het document eroverheen als die er is (companyForDocument).
function bedrijfVoorDocument(live: Record<string, any> | null, doc: Record<string, any>) {
  const basis = {
    name: live?.name || '', address: live?.address || '', postalCode: live?.postal_code || '',
    city: live?.city || '', email: live?.email || '', phone: live?.phone || '', kvk: live?.kvk || '',
    btwNumber: live?.btw_number || '', logoUrl: live?.logo_url || '', brandingColor: live?.branding_color || '#1DDB62',
    iban: live?.iban || '', ibanTnv: live?.iban_tnv || '',
  }
  const heeftSnapshot = !!(doc?.snapshot_bedrijfsnaam || doc?.snapshot_logo_url || doc?.snapshot_branding_color)
  if (!heeftSnapshot) return basis
  return {
    ...basis,
    name: doc.snapshot_bedrijfsnaam ?? basis.name,
    logoUrl: doc.snapshot_logo_url ?? basis.logoUrl,
    brandingColor: doc.snapshot_branding_color ?? basis.brandingColor,
    address: doc.snapshot_adres ?? basis.address,
    postalCode: doc.snapshot_postcode ?? basis.postalCode,
    city: doc.snapshot_plaats ?? basis.city,
    email: doc.snapshot_email ?? basis.email,
    kvk: doc.snapshot_kvk ?? basis.kvk,
    btwNumber: doc.snapshot_btw ?? basis.btwNumber,
  }
}

// ── Offerte ────────────────────────────────────────────────────────────────

export async function maakOfferteExemplaar(admin: any, offerteId: string, o: Ondertekening) {
  const { data: off, error } = await admin.from('offertes')
    .select('id, nummer, omschrijving, created_at, verzonden_op, geldig_tot, btw_pct, notes, totaal_excl, totaal_incl, company_id, customer_id, sign_token, snapshot_logo_url, snapshot_branding_color, snapshot_bedrijfsnaam, snapshot_adres, snapshot_postcode, snapshot_plaats, snapshot_email, snapshot_kvk, snapshot_btw')
    .eq('id', offerteId).maybeSingle()
  if (error || !off) throw new Error('offerte niet gevonden')
  const [{ data: regels, error: regelsFout }, { data: bedrijf }, { data: klant }] = await Promise.all([
    admin.from('offerte_items')
      .select('omschrijving, eenheid, aantal, prijs_per, subtotaal, btw_pct, btw_regime, volgorde, type')
      .eq('offerte_id', off.id).order('volgorde', { ascending: true }),
    admin.from('companies').select('name, address, postal_code, city, email, phone, kvk, btw_number, logo_url, branding_color, iban, iban_tnv').eq('id', off.company_id).maybeSingle(),
    off.customer_id
      ? admin.from('customers').select('name, address, postcode, city, email, phone, kvk_number, btw_number').eq('id', off.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  // Liever geen exemplaar dan een exemplaar zonder regels.
  if (regelsFout) throw new Error(`offerteregels: ${regelsFout.message}`)

  // Zelfde vorm als toOfferteItem in de app.
  const items = (regels || []).map((r: any) => ({
    omschrijving: r.omschrijving, eenheid: r.eenheid || '', type: r.type || null,
    btwPct: r.btw_pct != null ? Number(r.btw_pct) : null,
    btwRegime: r.btw_regime || regimeVanPct(r.btw_pct),
    aantal: Number(r.aantal || 1), prijsPer: Number(r.prijs_per || 0), subtotaal: Number(r.subtotaal || 0),
  }))

  const inhoud = {
    soort: 'offerte', id: off.id, nummer: off.nummer, omschrijving: off.omschrijving ?? '',
    totaal_excl: Number(off.totaal_excl || 0), totaal_incl: Number(off.totaal_incl || 0),
    opmerking: off.notes ?? '',
    regels: items.map((r: any) => ({
      omschrijving: r.omschrijving ?? '', eenheid: r.eenheid, aantal: r.aantal, prijs_per: r.prijsPer,
      subtotaal: r.subtotaal, btw_pct: r.btwPct, btw_regime: r.btwRegime,
    })),
  }
  const documentHash = await sha256Hex(JSON.stringify(inhoud))

  const document = {
    id: off.id, nummer: off.nummer || '', omschrijving: off.omschrijving || '',
    createdAt: off.created_at, verzondenOp: off.verzonden_op, geldigTot: off.geldig_tot,
    btwPct: Number(off.btw_pct || 21), notes: off.notes || '',
    signedAt: o.tijdstip, signedByName: o.naam, signedByEmail: o.email,
    signatureDataUrl: handtekeningDataUrl(o),
    ondertekeningExtra: { ip: o.ip, kenmerk: documentHash },
  }
  const customer = klant ? {
    name: klant.name || '', address: klant.address || '', postcode: klant.postcode || '', city: klant.city || '',
    email: klant.email || '', phone: klant.phone || '', kvkNumber: klant.kvk_number || '', btwNumber: klant.btw_number || '',
  } : null

  const doc = nieuwDocument()
  doc.setProperties({ title: `Offerte ${off.nummer ?? ''} - ondertekend`, creator: 'BossBase' })
  await buildPdf(doc, 'offerte', document, items, customer, bedrijfVoorDocument(bedrijf, off), serverOmgeving(admin))
  const pdf = pdfBytes(doc)
  return { pdf, documentHash, pdfHash: await sha256Hex(pdf), inhoud, klantEmail: (klant?.email as string) || null, klantNaam: (klant?.name as string) || null }
}

// ── Werkbon ────────────────────────────────────────────────────────────────

export async function maakWerkbonExemplaar(admin: any, signToken: string, o: Ondertekening) {
  const rpc = async (naam: string) => {
    const { data, error } = await admin.rpc(naam, { p_token: signToken })
    if (error) throw new Error(`${naam}: ${error.message}`)
    return data || []
  }
  const [[wb], taken, uren, materialen, notities, uitvoerders, fotos, [bedrijf], [klant]] = await Promise.all([
    rpc('get_werkbon_by_sign_token'), rpc('get_werkbon_taken_by_sign_token'), rpc('get_werkbon_uren_by_sign_token'),
    rpc('get_werkbon_materialen_by_sign_token'), rpc('get_werkbon_notities_by_sign_token'),
    rpc('get_werkbon_uitvoerders_by_sign_token'), rpc('get_werkbon_fotos_by_sign_token'),
    rpc('get_company_by_werkbon_token'), rpc('get_customer_by_werkbon_token'),
  ])
  if (!wb) throw new Error('werkbon niet gevonden')

  // Zelfde zeef als de app (bouwPdfData): alleen afgevinkte taken en meerwerk,
  // geen namen bij de uren, materiaal zonder prijzen, alleen klantnotities (de
  // RPC levert alleen die).
  const data = bouwPdfData({
    taken: taken.map((t: any) => ({ omschrijving: t.omschrijving, afgerond: t.afgerond, isMeerwerk: t.is_meerwerk })),
    uren, materialen,
    notities: notities.map((n: any) => ({ ...n, voor_klant: true })),
    fotos: [],
  })
  // Foto's: alleen bestanden in de map van dit bedrijf en deze werkbon (zelfde
  // regel als de fotoactie van sign-werkbon, audit M14).
  const prefix = `${wb.company_id}/${wb.id}/`
  for (const f of fotos) {
    const pad = String(f.pad || '').split('?')[0].replace(/^.*\/werkbon-fotos\//, '')
    if (!pad.startsWith(prefix)) continue
    const dataUrl = await opslagNaarDataUrl(admin, 'werkbon-fotos', pad)
    if (dataUrl) data.fotos.push({ dataUrl, categorie: f.categorie || '' } as any)
  }

  const inhoud = {
    soort: 'werkbon', id: wb.id, nummer: wb.nummer, titel: wb.titel ?? '', locatie: wb.locatie ?? '',
    omschrijving: wb.omschrijving ?? '',
    taken: data.taken.map((t: any) => t.omschrijving ?? ''),
    meerwerk: data.meerwerk.map((t: any) => t.omschrijving ?? ''),
    uren: data.uren.map((u: any) => ({ datum: u.datum, start: u.startTijd, eind: u.eindTijd, pauze: u.pauzeMinuten ?? 0, uren: Number(u.uren || 0), notitie: u.notitie ?? '' })),
    materialen: data.materialen,
    notities: data.notities.map((n: any) => n.note ?? ''),
    waarschuwingen: data.waarschuwingen.map((n: any) => ({ note: n.note ?? '', gevolg: n.gevolg ?? '', verzonden: n.verzondenOp ?? null })),
    fotos: data.fotos.length,
  }
  const documentHash = await sha256Hex(JSON.stringify(inhoud))

  const werkbon = {
    id: wb.id, signToken, nummer: wb.nummer, titel: wb.titel, omschrijving: wb.omschrijving, locatie: wb.locatie,
    geplandOp: wb.gepland_op, gestartOp: wb.gestart_op, afgerondOp: wb.afgerond_op,
    ondertekendOp: o.tijdstip, ondertekendDoorNaam: o.naam, ondertekendDoorEmail: o.email,
    handtekeningDataUrl: handtekeningDataUrl(o),
    uitvoerders: uitvoerders.map((u: any) => u.naam).filter(Boolean),
    ondertekeningExtra: { ip: o.ip, kenmerk: documentHash },
  }
  const company = bedrijf ? {
    name: bedrijf.name || '', address: bedrijf.address || '', postalCode: bedrijf.postal_code || '', city: bedrijf.city || '',
    email: bedrijf.email || '', phone: bedrijf.phone || '', kvk: bedrijf.kvk || '', btwNumber: bedrijf.btw_number || '',
    logoUrl: bedrijf.logo_url || '', brandingColor: bedrijf.branding_color || '#1DDB62',
  } : {}
  const customer = klant ? {
    name: klant.name || '', address: klant.address || '', postcode: klant.postcode || '', city: klant.city || '',
    email: klant.email || '', phone: klant.phone || '',
  } : null

  const doc = nieuwDocument()
  doc.setProperties({ title: `Werkbon ${wb.nummer ?? ''} - ondertekend`, creator: 'BossBase' })
  await buildWerkbonPdf(doc, werkbon, data, customer, company, serverOmgeving(admin))
  const pdf = pdfBytes(doc)
  return { pdf, documentHash, pdfHash: await sha256Hex(pdf), inhoud, klantEmail: (klant?.email as string) || null, klantNaam: (klant?.name as string) || null }
}

// Een sign_token is een uuid. Alles anders hoeft niet eens naar de database.
export const isUuid = (s: unknown) =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

// Handtekening uit een data-URL: alleen PNG, hooguit 1 MB (bucketlimiet).
export function handtekeningUit(dataUrl: unknown): Uint8Array | null {
  const s = String(dataUrl ?? '')
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(s)
  if (!m || m[1].length > 1_300_000) return null
  try {
    const bin = atob(m[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    // PNG-handtekening: 89 50 4E 47
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
    return bytes
  } catch { return null }
}

export function aanroeperGegevens(req: Request) {
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || '').trim() || null
  const ua = (req.headers.get('user-agent') || '').slice(0, 300) || null
  return { ip, userAgent: ua }
}

/** "Vandaag" in Nederland, als YYYY-MM-DD. */
export function vandaagNl(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
