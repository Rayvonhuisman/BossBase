// ─────────────────────────────────────────────────────────────────────────────
// Klanten en leveranciers tussen BossBase en Moneybird, beide kanten op.
//
// Moneybird kent één soort contact; of het een klant of een leverancier is,
// volgt uit wat eraan hangt. Daarom:
//   * een contact dat al aan een BossBase-klant of -leverancier hangt
//     (moneybird_id) blijft daar;
//   * een nieuw contact dat op een inkoopfactuur of bonnetje staat, wordt een
//     LEVERANCIER; elk ander nieuw contact een KLANT. (Moneybird wordt door
//     vakbedrijven vooral voor klanten gebruikt; leveranciers komen binnen via
//     hun facturen.) Zo komt een leverancier niet meer in de klantenlijst
//     terecht, wat de oude koppeling wel deed.
//
// Wat er veranderd is, zien we aan twee kanten:
//   * in Moneybird aan het versienummer (moneybird_versie);
//   * in BossBase aan een vingerafdruk van onze velden bij de laatste sync
//     (moneybird_hash) — customers heeft geen updated_at.
// Is alleen Moneybird veranderd, dan nemen we over. Is alleen BossBase
// veranderd, dan sturen we het door. Allebei: per veld samenvoegen — wat hier
// gewijzigd is blijft staan, de rest komt uit Moneybird — en het resultaat gaat
// terug naar Moneybird.
//
// Nieuwe BossBase-klanten worden in Moneybird aangemaakt. Leveranciers worden
// pas aangemaakt als een kostenpost ze nodig heeft (zoals bij SnelStart); een
// gekoppelde leverancier wordt wel bijgewerkt.
//
// Niet in Moneybird en daarom niet uitgewisseld: website, notities, bron en de
// betaaltermijn per klant (Moneybird heeft geen betaaltermijn per contact; die
// van ons bepaalt de vervaldatum van elke factuur die we boeken).
// ─────────────────────────────────────────────────────────────────────────────

import { alleRijen } from './alleRijen.ts'
import { alleenGevuld, getGenegeerd } from './boekhouding.ts'
import { mbFetch, mbAlles, mbSyncLijst, mbSyncOphalen, isLimiet, MB_HELE_PERIODE, type MbKoppeling, type MbFout } from './moneybird.ts'

// ── Velden ──────────────────────────────────────────────────────────────────
// Een Nederlands btw-nummer zonder landcode (123456782B01) krijgt NL ervoor,
// zodat dezelfde waarde hier en daar hetzelfde leest.
function metNlPrefix(waarde: unknown): string | null {
  const ruw = String(waarde ?? '').trim()
  if (!ruw) return null
  const kaal = ruw.replace(/[\s.\-]/g, '').toUpperCase()
  return /^\d{9}B\d{2}$/.test(kaal) ? `NL${kaal}` : ruw
}

const leeg = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
const tekst = (v: unknown) => (leeg(v) ? null : String(v).trim())

/** Naam van een Moneybird-contact: bedrijfsnaam, anders voor- en achternaam. */
export function contactNaam(c: any): string {
  return tekst(c?.company_name) || [c?.firstname, c?.lastname].map(tekst).filter(Boolean).join(' ')
}

function contactAdres(c: any): string | null {
  return [tekst(c?.address1), tekst(c?.address2)].filter(Boolean).join(' ') || null
}

const eersteMail = (v: unknown) => tekst(String(v ?? '').split(',')[0])

/** Moneybird-contact → kolommen van `customers`. */
export function contactNaarKlant(c: any): Record<string, unknown> {
  return {
    name: contactNaam(c),
    email: eersteMail(c?.email) || eersteMail(c?.send_invoices_to_email),
    phone: tekst(c?.phone),
    address: contactAdres(c),
    postcode: tekst(c?.zipcode),
    city: tekst(c?.city),
    contactpersoon: tekst(c?.attention) || tekst(c?.send_invoices_to_attention),
    kvk_number: tekst(c?.chamber_of_commerce),
    btw_number: metNlPrefix(c?.tax_number),
    iban: tekst(c?.bank_account),
  }
}

/** Moneybird-contact → kolommen van `leveranciers`. */
export function contactNaarLeverancier(c: any): Record<string, unknown> {
  const k = contactNaarKlant(c)
  return {
    naam: k.name, email: k.email, telefoon: k.phone, address: k.address, postcode: k.postcode,
    city: k.city, contactpersoon: k.contactpersoon, kvk_number: k.kvk_number,
    btw_number: k.btw_number, iban: k.iban,
  }
}

/** Een particulier gaat met voor- en achternaam; al het andere als bedrijf. */
function naamVelden(naam: string, particulier: boolean): Record<string, string> {
  if (!particulier) return { company_name: naam, firstname: '', lastname: '' }
  const delen = naam.trim().split(/\s+/)
  if (delen.length < 2) return { company_name: '', firstname: '', lastname: naam }
  return { company_name: '', firstname: delen[0], lastname: delen.slice(1).join(' ') }
}

/** BossBase-klant → velden voor Moneybird. */
export function klantNaarContact(r: any): Record<string, unknown> {
  return {
    ...naamVelden(String(r.name || '').trim(), r.type === 'Particulier'),
    address1: r.address || '',
    zipcode: r.postcode || '',
    city: r.city || '',
    phone: r.phone || '',
    send_invoices_to_email: r.email || '',
    send_invoices_to_attention: r.contactpersoon || '',
    tax_number: r.btw_number || '',
    chamber_of_commerce: r.kvk_number || '',
    bank_account: r.iban || '',
  }
}

/** BossBase-leverancier → velden voor Moneybird. */
export function leverancierNaarContact(r: any): Record<string, unknown> {
  return {
    ...naamVelden(String(r.naam || '').trim(), false),
    address1: r.address || '',
    zipcode: r.postcode || '',
    city: r.city || '',
    phone: r.telefoon || r.mobiel || '',
    send_invoices_to_email: r.email || '',
    send_invoices_to_attention: r.contactpersoon || '',
    tax_number: r.btw_number || '',
    chamber_of_commerce: r.kvk_number || '',
    bank_account: r.iban || '',
  }
}

/**
 * Vingerafdruk van wat we naar Moneybird sturen: de velden zelf, in vaste
 * volgorde (moneybird_hash). Geen hash maar de waarden, zodat we per veld kunnen
 * zien wat hier sinds de vorige sync is gewijzigd. Anders = hier gewijzigd.
 */
export async function vingerafdruk(velden: Record<string, unknown>): Promise<string> {
  const sleutels = Object.keys(velden).sort()
  return JSON.stringify(Object.fromEntries(sleutels.map(s => [s, String(velden[s] ?? '').trim()])))
}

// Welke Moneybird-velden horen bij welke BossBase-kolom.
const CONTACTVELDEN: Record<string, string[]> = {
  name: ['company_name', 'firstname', 'lastname'], naam: ['company_name', 'firstname', 'lastname'],
  email: ['send_invoices_to_email'], phone: ['phone'], telefoon: ['phone'], address: ['address1'],
  postcode: ['zipcode'], city: ['city'], contactpersoon: ['send_invoices_to_attention'],
  kvk_number: ['chamber_of_commerce'], btw_number: ['tax_number'], iban: ['bank_account'],
}

/**
 * Voegt een in Moneybird gewijzigd contact samen met de BossBase-rij, PER VELD:
 * wat hier sinds de vorige sync is gewijzigd blijft staan, de rest neemt de
 * waarde uit Moneybird over (alleen gevulde velden: een leeg veld daar wist hier
 * niets). Zonder bruikbare vingerafdruk (oude koppeling) weten we niet wat hier
 * gewijzigd is; dan wint Moneybird voor gevulde velden.
 * `hierGewijzigd` = er staat hier iets dat nog naar Moneybird moet.
 */
export async function voegSamen(
  rij: any, contact: any, isKlant: boolean,
): Promise<{ velden: Record<string, unknown>; hierGewijzigd: boolean }> {
  const naarContact = isKlant ? klantNaarContact : leverancierNaarContact
  const velden = alleenGevuld(isKlant ? contactNaarKlant(contact) : contactNaarLeverancier(contact))
  let basis: Record<string, string> | null = null
  try { basis = rij.moneybird_hash ? JSON.parse(rij.moneybird_hash) : null } catch { basis = null }
  if (!basis || typeof basis !== 'object') return { velden, hierGewijzigd: true }
  const nu = naarContact(rij)
  const gewijzigd = new Set(Object.keys(nu).filter(v => String(nu[v] ?? '').trim() !== String(basis![v] ?? '')))
  for (const kolom of Object.keys(velden)) {
    if ((CONTACTVELDEN[kolom] || []).some(v => gewijzigd.has(v))) delete velden[kolom]
  }
  return { velden, hierGewijzigd: gewijzigd.size > 0 }
}

// ── Contact aanmaken of bijwerken met terugval ──────────────────────────────
// Moneybird valideert btw-nummer, IBAN en KvK. Eén ongeldige waarde laat het
// hele contact mislukken, en daarmee elke factuur die eraan hangt. Daarom:
// weigert Moneybird een veld, dan laten we dat veld weg, proberen opnieuw en
// melden welk veld is overgeslagen — zoals de SnelStart-koppeling doet.
const VELD_LABEL: Record<string, string> = {
  tax_number: 'btw-nummer', bank_account: 'IBAN', chamber_of_commerce: 'KvK-nummer',
  send_invoices_to_email: 'e-mailadres', zipcode: 'postcode', phone: 'telefoonnummer',
}
const RISICOVELDEN = Object.keys(VELD_LABEL)

async function schrijfContact(
  k: MbKoppeling, velden: Record<string, unknown>, bestaandId: string | null,
): Promise<{ contact: any; overgeslagen: string[] }> {
  const doe = (v: Record<string, unknown>) => bestaandId
    ? mbFetch(k, `/contacts/${bestaandId}`, { method: 'PATCH', body: JSON.stringify({ contact: v }) })
    : mbFetch(k, '/contacts', { method: 'POST', body: JSON.stringify({ contact: { country: 'NL', ...v } }) })
  try {
    return { contact: await doe(velden), overgeslagen: [] }
  } catch (err) {
    const f = err as MbFout
    if (f?.status !== 422) throw err
    const genoemd = f.velden && typeof f.velden === 'object'
      ? Object.keys(f.velden as object).filter(v => RISICOVELDEN.includes(v))
      : []
    const weg = genoemd.length ? genoemd : RISICOVELDEN.filter(v => !leeg(velden[v]))
    if (!weg.length) throw err
    const zonder = { ...velden }
    for (const v of weg) delete zonder[v]
    return { contact: await doe(zonder), overgeslagen: weg }
  }
}

const overgeslagenTekst = (naam: string, velden: string[]) =>
  `"${naam}" is in Moneybird gezet zonder ${velden.map(v => VELD_LABEL[v] ?? v).join(' en ')}: `
  + `Moneybird wees ${velden.length === 1 ? 'die waarde' : 'die waarden'} af als ongeldig. Corrigeer het in BossBase, dan gaat het mee bij de volgende synchronisatie.`

/**
 * Zoekt een bestaand Moneybird-contact dat bij deze naam of dit e-mailadres
 * hoort en nog niet aan een andere rij in `tabel` hangt. Zonder deze stap kreeg
 * een klant die al in Moneybird stond bij zijn eerste factuur een tweede contact
 * (gevonden in de testopstelling). SnelStart doet hetzelfde op naam.
 */
async function zoekBestaandContact(
  k: MbKoppeling, tabel: 'customers' | 'leveranciers', naam: string, email: string | null,
): Promise<any | null> {
  const n = naam.trim().toLowerCase()
  const e = String(email || '').trim().toLowerCase()
  for (const zoek of [e, n].filter(Boolean)) {
    const lijst = await mbFetch(k, `/contacts?query=${encodeURIComponent(zoek)}&per_page=100`)
    const treffers = (Array.isArray(lijst) ? lijst : []).filter((c: any) =>
      (e && [c.email, ...String(c.send_invoices_to_email || '').split(',')].some(x => String(x || '').trim().toLowerCase() === e))
      || contactNaam(c).toLowerCase() === n)
    for (const c of treffers) {
      const { data: bezet } = await k.admin.from(tabel).select('id')
        .eq('company_id', k.companyId).eq('moneybird_id', String(c.id)).maybeSingle()
      if (!bezet) return c
    }
  }
  return null
}

/**
 * Zoekt of maakt het Moneybird-contact voor een BossBase-klant; schrijft
 * moneybird_id/versie/hash terug. Gebruikt door de contactensync én bij het
 * boeken van een factuur.
 */
export async function zorgVoorKlantContact(
  k: MbKoppeling, klant: any, meldingen?: string[], { zoeken = true } = {},
): Promise<string> {
  if (klant.moneybird_id) return String(klant.moneybird_id)
  const velden = klantNaarContact(klant)
  // De contactensync heeft alle ongekoppelde Moneybird-contacten al vergeleken
  // en zoekt dus niet nog eens (dat kost verzoeken tegen de limiet).
  const bestaand = zoeken ? await zoekBestaandContact(k, 'customers', String(klant.name || ''), klant.email) : null
  if (bestaand) {
    // Koppelen, zonder vingerafdruk: de contactensync voegt dan samen en stuurt
    // wat Moneybird nog niet had (bijvoorbeeld het btw-nummer) erheen.
    const aanvulling = alleenGevuld(contactNaarKlant(bestaand))
    for (const v of Object.keys(aanvulling)) if (!leeg(klant[v])) delete aanvulling[v]
    await k.admin.from('customers').update({
      moneybird_id: String(bestaand.id), moneybird_versie: Number(bestaand.version) || null, ...aanvulling,
    }).eq('id', klant.id)
    Object.assign(klant, aanvulling, { moneybird_id: String(bestaand.id), moneybird_hash: null })
    return String(bestaand.id)
  }
  const { contact, overgeslagen } = await schrijfContact(k, velden, null)
  if (overgeslagen.length) meldingen?.push(overgeslagenTekst(klant.name, overgeslagen))
  await k.admin.from('customers').update({
    moneybird_id: String(contact.id), moneybird_versie: Number(contact.version) || null,
    moneybird_hash: await vingerafdruk(velden),
  }).eq('id', klant.id)
  klant.moneybird_id = String(contact.id)
  return String(contact.id)
}

/**
 * Stuurt de gegevens van één gekoppelde klant door als ze hier gewijzigd zijn.
 * Nodig vóór een factuur met btw verlegd: Moneybird moet dan het btw-nummer van
 * de klant hebben, en dat kan net zijn aangevuld.
 */
export async function werkKlantContactBij(k: MbKoppeling, klant: any, meldingen?: string[]): Promise<void> {
  if (!klant?.moneybird_id) return
  const velden = klantNaarContact(klant)
  const afdruk = await vingerafdruk(velden)
  if (klant.moneybird_hash === afdruk) return
  const { contact, overgeslagen } = await schrijfContact(k, velden, String(klant.moneybird_id))
  if (overgeslagen.length) meldingen?.push(overgeslagenTekst(klant.name, overgeslagen))
  await k.admin.from('customers').update({ moneybird_hash: afdruk, moneybird_versie: Number(contact?.version) || null }).eq('id', klant.id)
  klant.moneybird_hash = afdruk
}

/** Idem voor een leverancier (bij het boeken van een kostenpost). */
export async function zorgVoorLeverancierContact(k: MbKoppeling, lev: any, meldingen?: string[]): Promise<string> {
  if (lev.moneybird_id) return String(lev.moneybird_id)
  const velden = leverancierNaarContact(lev)
  const bestaand = await zoekBestaandContact(k, 'leveranciers', String(lev.naam || ''), lev.email)
  if (bestaand) {
    await k.admin.from('leveranciers').update({ moneybird_id: String(bestaand.id), moneybird_versie: Number(bestaand.version) || null }).eq('id', lev.id)
    lev.moneybird_id = String(bestaand.id)
    return String(bestaand.id)
  }
  const { contact, overgeslagen } = await schrijfContact(k, velden, null)
  if (overgeslagen.length) meldingen?.push(overgeslagenTekst(lev.naam, overgeslagen))
  await k.admin.from('leveranciers').update({
    moneybird_id: String(contact.id), moneybird_versie: Number(contact.version) || null,
    moneybird_hash: await vingerafdruk(velden),
  }).eq('id', lev.id)
  lev.moneybird_id = String(contact.id)
  return String(contact.id)
}

/**
 * Haalt één contact op en zet het als leverancier in BossBase, of geeft de
 * bestaande terug. Gebruikt bij het importeren van inkoopfacturen en bonnen.
 */
export async function importeerLeverancier(
  k: MbKoppeling, contact: any, cache?: Map<string, string>,
): Promise<string | null> {
  const id = String(contact?.id || '')
  if (!id) return null
  if (cache?.has(id)) return cache.get(id) ?? null
  const { data: bestaand } = await k.admin.from('leveranciers').select('id')
    .eq('company_id', k.companyId).eq('moneybird_id', id).maybeSingle()
  if (bestaand?.id) { cache?.set(id, bestaand.id); return bestaand.id }

  const velden = contactNaarLeverancier(contact)
  if (!velden.naam) return null
  const { data: opNaam } = await k.admin.from('leveranciers').select('id')
    .eq('company_id', k.companyId).is('moneybird_id', null).ilike('naam', String(velden.naam)).maybeSingle()
  if (opNaam?.id) {
    await k.admin.from('leveranciers').update({ moneybird_id: id, ...alleenGevuld(velden) }).eq('id', opNaam.id)
    cache?.set(id, opNaam.id)
    return opNaam.id
  }
  const { data: nieuw } = await k.admin.from('leveranciers')
    .insert({ company_id: k.companyId, moneybird_id: id, moneybird_versie: Number(contact.version) || null, actief: true, ...velden })
    .select('id').single()
  if (nieuw?.id) cache?.set(id, nieuw.id)
  return nieuw?.id ?? null
}

/**
 * Eén in Moneybird gewijzigd contact verwerken (webhook contact_changed). Zelfde
 * regels als de sync: alleen gekoppelde klanten en leveranciers, Moneybird wint
 * voor gevulde velden, en was het hier óók gewijzigd, dan blijft de oude
 * vingerafdruk staan zodat de volgende sync het samengevoegde resultaat terugstuurt.
 */
export async function verwerkContactWijziging(k: MbKoppeling, contact: any): Promise<boolean> {
  const id = String(contact?.id || '')
  if (!id) return false
  for (const [tabel, kolommen, naarContact] of [
    ['customers', KLANT_KOLOMMEN, klantNaarContact],
    ['leveranciers', LEV_KOLOMMEN, leverancierNaarContact],
  ] as const) {
    const { data: rij } = await k.admin.from(tabel).select(kolommen)
      .eq('company_id', k.companyId).eq('moneybird_id', id).maybeSingle()
    if (!rij) continue
    if (Number(rij.moneybird_versie) === Number(contact.version)) return false
    const { velden, hierGewijzigd } = await voegSamen(rij, contact, tabel === 'customers')
    const samen = { ...rij, ...velden }
    const patch: Record<string, unknown> = { ...velden, moneybird_versie: Number(contact.version) || null }
    if (!hierGewijzigd) patch.moneybird_hash = await vingerafdruk(naarContact(samen))
    await k.admin.from(tabel).update(patch).eq('id', rij.id)
    return true
  }
  return false
}

/**
 * Maakt een BossBase-klant van een Moneybird-contact, met versie en
 * vingerafdruk, zodat de contactensync hem daarna als "bij" ziet. Een contact
 * met alleen voor- en achternaam is een particulier.
 */
export async function klantUitContact(k: MbKoppeling, c: any): Promise<string | null> {
  const velden = contactNaarKlant(c)
  if (!velden.name) return null
  const particulier = !tekst(c?.company_name) && Boolean(tekst(c?.firstname) || tekst(c?.lastname))
  const { data: rij } = await k.admin.from('customers').insert({
    company_id: k.companyId, moneybird_id: String(c.id), moneybird_versie: Number(c.version) || null,
    ...(particulier ? { type: 'Particulier' } : {}), ...velden,
  }).select(KLANT_KOLOMMEN).single()
  if (!rij) return null
  await k.admin.from('customers').update({ moneybird_hash: await vingerafdruk(klantNaarContact(rij)) }).eq('id', rij.id)
  return rij.id
}

/** Welke contacten staan op een inkoopfactuur of bonnetje? Dat zijn leveranciers. */
async function leverancierContactIds(k: MbKoppeling): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const soort of ['documents/purchase_invoices', 'documents/receipts']) {
    // Een filter vervangt álle standaardwaarden, dus de periode expliciet.
    const lijst = await mbAlles(k, `/${soort}?filter=${encodeURIComponent(MB_HELE_PERIODE)}`)
    for (const d of lijst) if (d?.contact_id) ids.add(String(d.contact_id))
  }
  return ids
}

// ── De sync ─────────────────────────────────────────────────────────────────
export type ContactenUitslag = {
  klanten: { geimporteerd: number; bijgewerkt: number; geexporteerd: number; doorgestuurd: number }
  leveranciers: { geimporteerd: number; bijgewerkt: number; doorgestuurd: number }
  overgeslagenUitPrullenbak: number
  adresWaarschuwingen: { klant: string; mist: string[] }[]
  fouten: string[]
  meldingen: string[]
  /** true als de run stopte voordat alles klaar was (tijd of limiet). */
  rest: boolean
}

const KLANT_KOLOMMEN = 'id, name, type, email, phone, address, postcode, city, contactpersoon, kvk_number, btw_number, iban, moneybird_id, moneybird_versie, moneybird_hash'
const LEV_KOLOMMEN = 'id, naam, email, telefoon, mobiel, address, postcode, city, contactpersoon, kvk_number, btw_number, iban, moneybird_id, moneybird_versie, moneybird_hash'

export async function syncContacten(k: MbKoppeling): Promise<ContactenUitslag> {
  const u: ContactenUitslag = {
    klanten: { geimporteerd: 0, bijgewerkt: 0, geexporteerd: 0, doorgestuurd: 0 },
    leveranciers: { geimporteerd: 0, bijgewerkt: 0, doorgestuurd: 0 },
    overgeslagenUitPrullenbak: 0, adresWaarschuwingen: [], fouten: [], meldingen: [], rest: false,
  }
  const db = k.admin
  const co = k.companyId
  const tijdOp = () => Boolean(k.budget?.op(15_000))

  try {
    // ── Wat er is ────────────────────────────────────────────────────────────
    const lijst = await mbSyncLijst(k, 'contacts')
    const klanten = await alleRijen(() => db.from('customers').select(KLANT_KOLOMMEN).eq('company_id', co))
    const levs = await alleRijen(() => db.from('leveranciers').select(LEV_KOLOMMEN).eq('company_id', co))
    const klantOpMb = new Map<string, any>()
    const levOpMb = new Map<string, any>()
    for (const r of klanten) if (r.moneybird_id) klantOpMb.set(String(r.moneybird_id), r)
    for (const r of levs) if (r.moneybird_id) levOpMb.set(String(r.moneybird_id), r)

    const genegeerdKlant = await getGenegeerd(db, co, 'moneybird', 'klant')
    const genegeerdLev = await getGenegeerd(db, co, 'moneybird', 'leverancier')

    // Wat moet er opgehaald worden: gekoppeld en in Moneybird gewijzigd, of nieuw.
    const ophalen: string[] = []
    for (const { id, version } of lijst) {
      const r = klantOpMb.get(id) ?? levOpMb.get(id)
      if (r) { if (Number(r.moneybird_versie) !== version) ophalen.push(id); continue }
      if (genegeerdKlant.has(id) || genegeerdLev.has(id)) { u.overgeslagenUitPrullenbak++; continue }
      ophalen.push(id)
    }

    // ── A. Moneybird → BossBase ──────────────────────────────────────────────
    const contacten = await mbSyncOphalen(k, 'contacts', ophalen)
    if (contacten.length < ophalen.length) u.rest = true

    const nieuw = contacten.filter(c => !klantOpMb.has(String(c.id)) && !levOpMb.has(String(c.id)))
    const leverancierIds = nieuw.length ? await leverancierContactIds(k) : new Set<string>()

    // Voor het koppelen van nieuwe contacten aan bestaande, nog ongekoppelde rijen.
    const klantOpMail = new Map<string, any>()
    const klantOpNaam = new Map<string, any>()
    for (const r of klanten) {
      if (r.moneybird_id) continue
      if (r.email) klantOpMail.set(String(r.email).toLowerCase(), r)
      if (r.name) klantOpNaam.set(String(r.name).toLowerCase(), r)
    }
    const levOpNaam = new Map<string, any>()
    for (const r of levs) if (!r.moneybird_id && r.naam) levOpNaam.set(String(r.naam).toLowerCase(), r)

    for (const c of contacten) {
      if (tijdOp()) { u.rest = true; break }
      const id = String(c.id)
      const naam = contactNaam(c)
      if (!naam) continue
      try {
        const gekoppeldeKlant = klantOpMb.get(id)
        const gekoppeldeLev = levOpMb.get(id)
        if (gekoppeldeKlant || gekoppeldeLev) {
          const isKlant = Boolean(gekoppeldeKlant)
          const rij = gekoppeldeKlant ?? gekoppeldeLev
          const naarContact = isKlant ? klantNaarContact : leverancierNaarContact
          // Per veld samenvoegen: wat hier gewijzigd is blijft, de rest komt uit
          // Moneybird (zie voegSamen).
          const { velden, hierGewijzigd } = await voegSamen(rij, c, isKlant)
          await db.from(isKlant ? 'customers' : 'leveranciers').update({
            ...velden, moneybird_versie: Number(c.version) || null,
          }).eq('id', rij.id)
          Object.assign(rij, velden, { moneybird_versie: Number(c.version) || null })
          // Alleen daar gewijzigd: hier is nu gelijk aan daar. Ook hier
          // gewijzigd: de oude vingerafdruk blijft staan, zodat stap C het
          // samengevoegde resultaat terugstuurt.
          if (!hierGewijzigd) {
            const afdruk = await vingerafdruk(naarContact(rij))
            await db.from(isKlant ? 'customers' : 'leveranciers').update({ moneybird_hash: afdruk }).eq('id', rij.id)
            rij.moneybird_hash = afdruk
          }
          if (isKlant) u.klanten.bijgewerkt++; else u.leveranciers.bijgewerkt++
          continue
        }

        // Nieuw contact: leverancier als het op een inkoopdocument staat.
        if (leverancierIds.has(id)) {
          const velden = contactNaarLeverancier(c)
          const bestaand = levOpNaam.get(naam.toLowerCase())
          if (bestaand) {
            await db.from('leveranciers').update({ moneybird_id: id, moneybird_versie: Number(c.version) || null, ...alleenGevuld(velden) }).eq('id', bestaand.id)
            levOpNaam.delete(naam.toLowerCase())
            u.leveranciers.bijgewerkt++
          } else {
            await db.from('leveranciers').insert({ company_id: co, moneybird_id: id, moneybird_versie: Number(c.version) || null, actief: true, ...velden })
            u.leveranciers.geimporteerd++
          }
          continue
        }

        const velden = contactNaarKlant(c)
        const mail = String(velden.email || '').toLowerCase()
        const bestaand = (mail && klantOpMail.get(mail)) || klantOpNaam.get(naam.toLowerCase())
        if (bestaand) {
          const samen = { ...bestaand, ...alleenGevuld(velden) }
          await db.from('customers').update({
            moneybird_id: id, moneybird_versie: Number(c.version) || null, ...alleenGevuld(velden),
            // Bewust GEEN hash: dan ziet stap C hem als gewijzigd en gaan de
            // BossBase-gegevens die Moneybird nog niet had (bijv. KvK) erheen.
          }).eq('id', bestaand.id)
          Object.assign(bestaand, samen, { moneybird_id: id })
          klantOpMb.set(id, bestaand)
          klantOpMail.delete(mail); klantOpNaam.delete(naam.toLowerCase())
          u.klanten.bijgewerkt++
        } else {
          if (await klantUitContact(k, c)) u.klanten.geimporteerd++
        }
      } catch (err: any) {
        if (isLimiet(err)) throw err
        u.fouten.push(`Contact "${naam}" ophalen: ${err?.message}`)
      }
    }

    // ── B. Nieuwe BossBase-klanten naar Moneybird ─────────────────────────────
    for (const r of klanten) {
      if (r.moneybird_id || !String(r.name || '').trim()) continue
      if (tijdOp()) { u.rest = true; break }
      try {
        const mist = ['address', 'postcode', 'city'].filter(v => leeg(r[v]))
          .map(v => ({ address: 'adres', postcode: 'postcode', city: 'plaats' } as Record<string, string>)[v])
        if (mist.length) u.adresWaarschuwingen.push({ klant: r.name, mist })
        await zorgVoorKlantContact(k, r, u.meldingen, { zoeken: false })
        u.klanten.geexporteerd++
      } catch (err: any) {
        if (isLimiet(err)) throw err
        u.fouten.push(`Klant "${r.name}" naar Moneybird: ${err?.message}`)
      }
    }

    // ── C. Hier gewijzigd → naar Moneybird ───────────────────────────────────
    const doorsturen = async (tabel: 'customers' | 'leveranciers', rijen: any[], naarContact: (r: any) => Record<string, unknown>) => {
      for (const r of rijen) {
        if (!r.moneybird_id) continue
        const velden = naarContact(r)
        const afdruk = await vingerafdruk(velden)
        if (r.moneybird_hash === afdruk) continue
        if (tijdOp()) { u.rest = true; return }
        const naam = tabel === 'customers' ? r.name : r.naam
        try {
          const { contact, overgeslagen } = await schrijfContact(k, velden, String(r.moneybird_id))
          if (overgeslagen.length) u.meldingen.push(overgeslagenTekst(naam, overgeslagen))
          await db.from(tabel).update({ moneybird_hash: afdruk, moneybird_versie: Number(contact?.version) || null }).eq('id', r.id)
          if (tabel === 'customers') u.klanten.doorgestuurd++; else u.leveranciers.doorgestuurd++
        } catch (err: any) {
          if (isLimiet(err)) throw err
          // Verwijderd of samengevoegd in Moneybird: de koppeling loslaten, dan
          // wordt hij bij de volgende sync opnieuw aangemaakt of gekoppeld.
          if ((err as MbFout)?.status === 404) {
            await db.from(tabel).update({ moneybird_id: null, moneybird_versie: null, moneybird_hash: null }).eq('id', r.id)
            u.meldingen.push(`"${naam}" bestond niet meer in Moneybird; de koppeling is losgelaten en wordt opnieuw gelegd.`)
          } else {
            u.fouten.push(`"${naam}" bijwerken in Moneybird: ${err?.message}`)
          }
        }
      }
    }
    // Opnieuw lezen: stap A en B hebben id's, versies en hashes gezet.
    const klantenNu = await alleRijen(() => db.from('customers').select(KLANT_KOLOMMEN).eq('company_id', co).not('moneybird_id', 'is', null))
    await doorsturen('customers', klantenNu, klantNaarContact)
    const levsNu = await alleRijen(() => db.from('leveranciers').select(LEV_KOLOMMEN).eq('company_id', co).not('moneybird_id', 'is', null))
    await doorsturen('leveranciers', levsNu, leverancierNaarContact)
  } catch (err: any) {
    if (!isLimiet(err)) throw err
    u.rest = true
    u.meldingen.push(err.message)
  }
  return u
}
