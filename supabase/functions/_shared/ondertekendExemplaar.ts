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
// Wat erin staat is bewust beperkt tot wat de klant ook op de ondertekenpagina
// ziet: geen interne notities, geen inkoopprijzen, geen marge. Bij de werkbon
// komen de regels uit dezelfde sign-token-functies als de publieke pagina; die
// zijn de afscherming.
//
// De opmaak is eenvoudiger dan de PDF die de app maakt (geen logo, geen foto's).
// Dat is een keuze: dit document moet kloppen en niet te vervalsen zijn; de
// mooie PDF blijft beschikbaar in de app en op de ondertekenpagina.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1'

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

// ── Tekst ──────────────────────────────────────────────────────────────────
// De standaardfonts van PDF kennen alleen WinAnsi. Een teken daarbuiten (een
// emoji in een omschrijving) zou het hele document laten mislukken; dat wordt
// een vraagteken.
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
function veilig(s: unknown): string {
  return Array.from(String(s ?? '').replace(/\r/g, '').replace(/\t/g, ' '))
    .map(ch => {
      const c = ch.codePointAt(0)!
      if (ch === '\n') return ch
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.includes(ch)) return ch
      return '?'
    }).join('')
}

const euro = (n: unknown) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)
const getal = (n: unknown) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(Number(n) || 0)
const datumNl = (d: unknown) => d ? new Date(String(d)).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }) : ''
const tijdNl = (d: unknown) => d ? new Date(String(d)).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) : ''

class Schrijver {
  doc: PDFDocument; f: PDFFont; fb: PDFFont; page!: PDFPage; y = 0
  readonly L = 50; readonly R = 545; readonly TOP = 790; readonly BOTTOM = 60
  constructor(doc: PDFDocument, f: PDFFont, fb: PDFFont) { this.doc = doc; this.f = f; this.fb = fb; this.nieuwePagina() }
  nieuwePagina() { this.page = this.doc.addPage([595.28, 841.89]); this.y = this.TOP }
  ruimte(h: number) { if (this.y - h < this.BOTTOM) this.nieuwePagina() }
  breek(tekst: string, breedte: number, size: number, font = this.f): string[] {
    const regels: string[] = []
    for (const alinea of veilig(tekst).split('\n')) {
      let huidig = ''
      for (const woord of alinea.split(' ')) {
        const poging = huidig ? `${huidig} ${woord}` : woord
        if (font.widthOfTextAtSize(poging, size) <= breedte) { huidig = poging; continue }
        if (huidig) regels.push(huidig)
        // Eén woord breder dan de kolom: hard afbreken.
        let w = woord
        while (font.widthOfTextAtSize(w, size) > breedte && w.length > 1) {
          let n = w.length
          while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > breedte) n--
          regels.push(w.slice(0, n)); w = w.slice(n)
        }
        huidig = w
      }
      regels.push(huidig)
    }
    return regels
  }
  tekst(t: string, opts: { size?: number; bold?: boolean; x?: number; breedte?: number; kleur?: [number, number, number] } = {}) {
    const size = opts.size ?? 10, font = opts.bold ? this.fb : this.f, x = opts.x ?? this.L
    const regels = this.breek(t, opts.breedte ?? (this.R - x), size, font)
    for (const r of regels) {
      this.ruimte(size + 4)
      this.page.drawText(r, { x, y: this.y - size, size, font, color: rgb(...(opts.kleur ?? [0.1, 0.1, 0.12])) })
      this.y -= size + 4
    }
  }
  rechts(t: string, x: number, y: number, size = 10, bold = false) {
    const font = bold ? this.fb : this.f, s = veilig(t)
    this.page.drawText(s, { x: x - font.widthOfTextAtSize(s, size), y, size, font, color: rgb(0.1, 0.1, 0.12) })
  }
  lijn() { this.ruimte(8); this.page.drawLine({ start: { x: this.L, y: this.y - 3 }, end: { x: this.R, y: this.y - 3 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.82) }); this.y -= 8 }
  wit(h: number) { this.y -= h }
}

async function handtekeningBlok(w: Schrijver, o: Ondertekening, documentHash: string) {
  w.wit(10); w.lijn()
  w.tekst('Ondertekening', { size: 12, bold: true })
  if (o.handtekeningPng) {
    try {
      const img = await w.doc.embedPng(o.handtekeningPng)
      const schaal = Math.min(220 / img.width, 80 / img.height, 1)
      const h = img.height * schaal
      w.ruimte(h + 6)
      w.page.drawImage(img, { x: w.L, y: w.y - h, width: img.width * schaal, height: h })
      w.y -= h + 6
    } catch { w.tekst('(handtekening kon niet in het document worden opgenomen; hij is apart bewaard)', { size: 8 }) }
  }
  w.tekst(`Ondertekend door: ${o.naam} (${o.email})`)
  w.tekst(`Datum en tijd: ${tijdNl(o.tijdstip)}`)
  if (o.ip) w.tekst(`IP-adres: ${o.ip}`, { size: 8 })
  if (o.userAgent) w.tekst(`Browser: ${o.userAgent.slice(0, 160)}`, { size: 8 })
  w.wit(6)
  w.tekst(`Documentkenmerk (SHA-256 van de inhoud): ${documentHash}`, { size: 7, kleur: [0.4, 0.4, 0.45] })
  w.tekst('Dit exemplaar is op het moment van ondertekenen door BossBase op de server opgemaakt uit de gegevens van het document. Het kenmerk is vastgelegd bij het document.', { size: 7, kleur: [0.4, 0.4, 0.45] })
}

function partijen(w: Schrijver, bedrijf: Record<string, any>, klant: Record<string, any> | null) {
  const startY = w.y, kolom = 260
  const blok = (x: number, kop: string, regels: string[]) => {
    w.y = startY
    w.tekst(kop, { size: 8, bold: true, x, breedte: kolom, kleur: [0.4, 0.4, 0.45] })
    for (const r of regels.filter(Boolean)) w.tekst(r, { size: 9, x, breedte: kolom })
    return w.y
  }
  const y1 = blok(w.L, 'VAN', [bedrijf?.name, bedrijf?.address, [bedrijf?.postal_code, bedrijf?.city].filter(Boolean).join(' '),
    bedrijf?.email, bedrijf?.kvk ? `KvK ${bedrijf.kvk}` : '', bedrijf?.btw_number ? `Btw ${bedrijf.btw_number}` : ''])
  const y2 = blok(w.L + kolom + 15, 'AAN', [klant?.name, klant?.address, [klant?.postcode, klant?.city].filter(Boolean).join(' '), klant?.email])
  w.y = Math.min(y1, y2) - 8
}

// ── Offerte ────────────────────────────────────────────────────────────────

export async function maakOfferteExemplaar(admin: any, offerteId: string, o: Ondertekening) {
  const { data: off, error } = await admin.from('offertes')
    .select('id, nummer, omschrijving, created_at, geldig_tot, totaal_excl, totaal_incl, company_id, customer_id')
    .eq('id', offerteId).maybeSingle()
  if (error || !off) throw new Error('offerte niet gevonden')
  const [{ data: regels }, { data: bedrijf }, { data: klant }] = await Promise.all([
    admin.from('offerte_items')
      .select('omschrijving, eenheid, aantal, prijs_per, subtotaal, btw_pct, btw_regime, volgorde, type')
      .eq('offerte_id', off.id).order('volgorde', { ascending: true }),
    admin.from('companies').select('name, address, postal_code, city, email, kvk, btw_number').eq('id', off.company_id).maybeSingle(),
    off.customer_id
      ? admin.from('customers').select('name, address, postcode, city, email').eq('id', off.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const inhoud = {
    soort: 'offerte', id: off.id, nummer: off.nummer, omschrijving: off.omschrijving ?? '',
    totaal_excl: Number(off.totaal_excl || 0), totaal_incl: Number(off.totaal_incl || 0),
    regels: (regels || []).map((r: any) => ({
      omschrijving: r.omschrijving ?? '', eenheid: r.eenheid ?? '', aantal: Number(r.aantal || 0),
      prijs_per: Number(r.prijs_per || 0), subtotaal: Number(r.subtotaal || 0),
      btw_pct: Number(r.btw_pct ?? 0), btw_regime: r.btw_regime ?? null,
    })),
  }
  const documentHash = await sha256Hex(JSON.stringify(inhoud))

  const doc = await PDFDocument.create()
  doc.setTitle(`Offerte ${off.nummer ?? ''} - ondertekend`)
  doc.setProducer('BossBase'); doc.setCreator('BossBase')
  const w = new Schrijver(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold))

  w.tekst(`Offerte ${off.nummer ?? ''}`, { size: 18, bold: true })
  w.tekst('Ondertekend exemplaar', { size: 10, kleur: [0.4, 0.4, 0.45] })
  w.wit(8)
  partijen(w, bedrijf || {}, klant)
  w.tekst(`Datum: ${datumNl(off.created_at)}${off.geldig_tot ? `   ·   Geldig tot: ${datumNl(off.geldig_tot)}` : ''}`, { size: 9 })
  if (off.omschrijving) { w.wit(4); w.tekst(off.omschrijving, { size: 10 }) }
  w.wit(10)

  // Kolommen: omschrijving | aantal | prijs | btw | totaal
  const kop = () => {
    w.ruimte(16)
    const y = w.y - 9
    w.page.drawText('Omschrijving', { x: w.L, y, size: 8, font: w.fb })
    w.rechts('Aantal', 360, y, 8, true); w.rechts('Prijs', 430, y, 8, true)
    w.rechts('Btw', 475, y, 8, true); w.rechts('Totaal', w.R, y, 8, true)
    w.y -= 13; w.lijn()
  }
  kop()
  for (const r of inhoud.regels) {
    const omschr = w.breek(r.omschrijving || '-', 245, 9)
    const h = omschr.length * 13
    if (w.y - h < w.BOTTOM) { w.nieuwePagina(); kop() }
    const y = w.y - 9
    omschr.forEach((t, i) => w.page.drawText(t, { x: w.L, y: y - i * 13, size: 9, font: w.f }))
    w.rechts(`${getal(r.aantal)} ${veilig(r.eenheid)}`.trim(), 360, y, 9)
    w.rechts(euro(r.prijs_per), 430, y, 9)
    w.rechts(r.btw_regime === 'verlegd' ? 'verlegd' : r.btw_regime === 'vrijgesteld' ? 'vrij' : `${getal(r.btw_pct)}%`, 475, y, 9)
    w.rechts(euro(r.subtotaal), w.R, y, 9)
    w.y -= h + 2
  }
  w.lijn()
  const totaal = (label: string, bedrag: number, bold = false) => {
    w.ruimte(15); const y = w.y - 10
    w.rechts(label, 430, y, 10, bold); w.rechts(euro(bedrag), w.R, y, 10, bold); w.y -= 15
  }
  totaal('Totaal excl. btw', inhoud.totaal_excl)
  totaal('Btw', inhoud.totaal_incl - inhoud.totaal_excl)
  totaal('Totaal incl. btw', inhoud.totaal_incl, true)

  await handtekeningBlok(w, o, documentHash)
  const pdf = await doc.save()
  return { pdf, documentHash, pdfHash: await sha256Hex(pdf), inhoud, klantEmail: (klant?.email as string) || null, klantNaam: (klant?.name as string) || null }
}

// ── Werkbon ────────────────────────────────────────────────────────────────

export async function maakWerkbonExemplaar(admin: any, signToken: string, o: Ondertekening) {
  const rpc = async (naam: string) => {
    const { data, error } = await admin.rpc(naam, { p_token: signToken })
    if (error) throw new Error(`${naam}: ${error.message}`)
    return data || []
  }
  const [[wb], taken, uren, materialen, notities, uitvoerders, [bedrijf], [klant]] = await Promise.all([
    rpc('get_werkbon_by_sign_token'), rpc('get_werkbon_taken_by_sign_token'), rpc('get_werkbon_uren_by_sign_token'),
    rpc('get_werkbon_materialen_by_sign_token'), rpc('get_werkbon_notities_by_sign_token'),
    rpc('get_werkbon_uitvoerders_by_sign_token'), rpc('get_company_by_werkbon_token'), rpc('get_customer_by_werkbon_token'),
  ])
  if (!wb) throw new Error('werkbon niet gevonden')

  // Zelfde selectie als bouwPdfData in de app: alleen afgevinkte taken en
  // meerwerk; geen namen bij de uren; materiaal zonder prijzen.
  const inhoud = {
    soort: 'werkbon', id: wb.id, nummer: wb.nummer, titel: wb.titel ?? '', locatie: wb.locatie ?? '',
    taken: taken.filter((t: any) => t.afgerond && !t.is_meerwerk).map((t: any) => t.omschrijving ?? ''),
    meerwerk: taken.filter((t: any) => t.afgerond && t.is_meerwerk).map((t: any) => t.omschrijving ?? ''),
    uren: uren.map((u: any) => ({ datum: u.datum, start: u.start_tijd, eind: u.eind_tijd, pauze: u.pauze_minuten ?? 0, uren: Number(u.uren || 0), notitie: u.notitie ?? '' })),
    materialen: materialen.map((m: any) => ({ naam: m.naam ?? '', eenheid: m.eenheid ?? '', aantal: Number(m.aantal || 0) })),
    notities: notities.map((n: any) => ({ note: n.note ?? '', gevolg: n.gevolg ?? '', waarschuwing: n.waarschuwing_verzonden_op ?? null })),
  }
  const documentHash = await sha256Hex(JSON.stringify(inhoud))

  const doc = await PDFDocument.create()
  doc.setTitle(`Werkbon ${wb.nummer ?? ''} - ondertekend`)
  doc.setProducer('BossBase'); doc.setCreator('BossBase')
  const w = new Schrijver(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold))

  w.tekst(`Werkbon ${wb.nummer ?? ''}`, { size: 18, bold: true })
  w.tekst('Ondertekend exemplaar', { size: 10, kleur: [0.4, 0.4, 0.45] })
  w.wit(8)
  partijen(w, bedrijf || {}, klant || null)
  if (wb.titel) w.tekst(wb.titel, { size: 12, bold: true })
  if (wb.locatie) w.tekst(`Locatie: ${wb.locatie}`, { size: 9 })
  if (wb.omschrijving) w.tekst(wb.omschrijving, { size: 9 })
  const namen = uitvoerders.map((u: any) => u.naam).filter(Boolean)
  if (namen.length) w.tekst(`Uitgevoerd door: ${namen.join(', ')}`, { size: 9 })

  const sectie = (kop: string, regels: string[]) => {
    if (!regels.length) return
    w.wit(8); w.tekst(kop, { size: 11, bold: true })
    for (const r of regels) w.tekst(`•  ${r}`, { size: 9, x: w.L + 6 })
  }
  sectie('Uitgevoerd werk', inhoud.taken)
  sectie('Meerwerk', inhoud.meerwerk)
  const t5 = (t: unknown) => String(t ?? '').slice(0, 5)
  sectie('Uren', inhoud.uren.map(u =>
    `${datumNl(u.datum)}  ${t5(u.start)}-${t5(u.eind)}  pauze ${u.pauze} min  =  ${getal(u.uren)} uur${u.notitie ? `  (${u.notitie})` : ''}`))
  if (inhoud.uren.length) w.tekst(`Totaal: ${getal(inhoud.uren.reduce((s, u) => s + u.uren, 0))} uur`, { size: 9, bold: true })
  sectie('Materiaal', inhoud.materialen.map(m => `${getal(m.aantal)} ${m.eenheid}  ${m.naam}`.replace(/\s+/g, ' ')))
  sectie('Toelichting', inhoud.notities.filter(n => !n.waarschuwing).map(n => n.note))
  sectie('Verstuurde waarschuwingen', inhoud.notities.filter(n => n.waarschuwing)
    .map(n => `${datumNl(n.waarschuwing)}: ${n.note}${n.gevolg ? ` — gevolg: ${n.gevolg}` : ''}`))

  await handtekeningBlok(w, o, documentHash)
  const pdf = await doc.save()
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
