// ─────────────────────────────────────────────────────────────────────────────
// Welke grootboekrekening en welk btw-tarief krijgt een regel in Moneybird?
//
// Twee lagen, zoals bij SnelStart (grootboekKeuze.ts):
//   1. de keuze van de klant in de boekhoudinstellingen (grootboek_voorkeuren,
//      provider 'moneybird', op id);
//   2. een slimme standaard op SOORT en NAAM van de rekening of het tarief.
//
// Waarom op soort en naam en niet op nummer zoals bij SnelStart: Moneybird
// levert geen vast rekeningschema met vaste nummers. Een administratie heeft
// rekeningen met een soort (omzet, kosten, directe kosten) en een naam; codes
// zijn optioneel. Btw-tarieven bestaan per administratie en kunnen via de API
// niet worden aangemaakt, dus die zoeken we op percentage en naam.
//
// Verschil met SnelStart dat het eenvoudiger maakt: in Moneybird zit het
// btw-tarief per REGEL, niet in de rekening. Vrijgestelde of verlegde omzet mag
// dus op dezelfde omzetrekening als de rest; het tarief zorgt voor de aangifte.
// Een eigen rekening per regime is een keuze, geen vereiste.
// ─────────────────────────────────────────────────────────────────────────────

import { mbFetch, mbAlles, type MbKoppeling } from './moneybird.ts'
import type { VoorkeurRij } from './boekhouding.ts'

export type MbRekening = { id: string; code: string | null; naam: string; soort: 'omzet' | 'kosten' | 'overig' }
export type MbTarief = { id: string; naam: string; pct: number; soort: 'verkoop' | 'inkoop'; toontBtw: boolean }
export type Indeling = { rekeningen: MbRekening[]; tarieven: MbTarief[] }

const pct = (v: unknown) => Math.round(Number(String(v ?? '').replace(',', '.')) * 100) / 100

/** Rekeningen en btw-tarieven van de administratie, in onze vorm. */
export async function laadIndeling(k: MbKoppeling): Promise<Indeling> {
  // /ledger_accounts kent geen paginering; /tax_rates wel.
  const [rek, tar] = await Promise.all([mbFetch(k, '/ledger_accounts'), mbAlles(k, '/tax_rates')])
  const rekeningen: MbRekening[] = (Array.isArray(rek) ? rek : [])
    .filter((r: any) => r?.active !== false)
    .map((r: any) => {
      const typen: string[] = Array.isArray(r.allowed_document_types) ? r.allowed_document_types : []
      const omzet = r.account_type === 'revenue' && (typen.length === 0 || typen.includes('sales_invoice'))
      const kosten = ['expenses', 'direct_costs'].includes(r.account_type) && (typen.length === 0 || typen.includes('purchase_invoice'))
      return { id: String(r.id), code: r.account_id ? String(r.account_id) : null, naam: String(r.name || ''), soort: omzet ? 'omzet' : kosten ? 'kosten' : 'overig' }
    })
  const tarieven: MbTarief[] = tar
    .filter((t: any) => t?.active !== false && ['sales_invoice', 'purchase_invoice'].includes(t?.tax_rate_type))
    .map((t: any) => ({
      id: String(t.id), naam: String(t.name || ''), pct: pct(t.percentage),
      soort: t.tax_rate_type === 'sales_invoice' ? 'verkoop' : 'inkoop', toontBtw: t.show_tax !== false,
    }))
  return { rekeningen, tarieven }
}

// ── Rekeningen ──────────────────────────────────────────────────────────────
const UITZONDERING_OMZET = /(laag|verlaagd|\b9\s?%|verlegd|vrijgesteld|vrij van btw|nul|\b0\s?%|onbelast|buiten|binnen\s?(de\s)?eu|export|icp|intracom)/i

const OMZET_ZOEK: Record<string, RegExp | null> = {
  normaal: null,                                                   // de gewone omzetrekening
  verlaagd: /(laag|verlaagd|\b9\s?%)/i,
  verlegd: /verlegd/i,
  vrijgesteld: /(vrijgesteld|vrij van btw|nultarief|\b0\s?%|onbelast)/i,
}

// Per kostencategorie: waar zoeken we op? Eerst directe kosten (inkoop van wat
// je doorlevert), dan algemene kosten.
const KOSTEN_ZOEK: Record<string, RegExp> = {
  'Materiaal':       /(inkoop|materia|grondstof|kostprijs)/i,
  'Inkoopfactuur':   /(inkoop|kostprijs)/i,
  'Gereedschap':     /(gereedschap|kleine aanschaf|klein materieel|inventaris)/i,
  'Reiskosten':      /(reis|kilometer|vervoer|brandstof)/i,
  'Arbeid':          /(uitbesteed|onderaannem|derden|inhuur)/i,
  'Algemene kosten': /algemene kosten/i,
  'Overig':          /(overige|algemene) kosten/i,
}
export const KOSTEN_CATEGORIEEN = Object.keys(KOSTEN_ZOEK)

const algemeen = (r: MbRekening[]) =>
  r.find(x => x.soort === 'kosten' && /^algemene kosten$/i.test(x.naam.trim()))
  ?? r.find(x => x.soort === 'kosten' && /algemene kosten/i.test(x.naam))

/** Standaard omzetrekening voor een btw-regime, of null. */
export function standaardOmzet(rek: MbRekening[], regime: string): MbRekening | null {
  const omzet = rek.filter(r => r.soort === 'omzet')
  const gewoon = omzet.find(r => /^omzet$/i.test(r.naam.trim()))
    ?? omzet.find(r => /omzet/i.test(r.naam) && !UITZONDERING_OMZET.test(r.naam))
    ?? omzet.find(r => !UITZONDERING_OMZET.test(r.naam))
    ?? omzet[0] ?? null
  const zoek = OMZET_ZOEK[regime]
  if (!zoek) return gewoon
  return omzet.find(r => zoek.test(r.naam)) ?? gewoon
}

// De vraagpost van Moneybird: elke administratie heeft standaard
// "Ongecategoriseerde uitgaven". Daar komen kosten waarvan BossBase niet weet
// waar ze horen, met "controleren" erbij — net als de vraagpost bij SnelStart.
const vraagpost = (r: MbRekening[]) =>
  r.find(x => x.soort === 'kosten' && /ongecategoriseerd/i.test(x.naam)) ?? null

/**
 * Standaard kostenrekening voor een categorie, op het model van SnelStart:
 *   - bekende categorie met passende rekening → die (gok: false);
 *   - bekende categorie zonder passende rekening → Algemene kosten, met melding
 *     (gok: true) — zoals SnelStart dan terugvalt op de grootboekfunctie;
 *   - categorie die BossBase niet kent (zelf toegevoegd) → de vraagpost, met
 *     melding en "controleren" (vraagpost: true) — zoals SnelStart.
 */
export function standaardKosten(rek: MbRekening[], categorie: string): { rekening: MbRekening | null; gok: boolean; vraagpost?: boolean } {
  const kosten = rek.filter(r => r.soort === 'kosten')
  const zoek = KOSTEN_ZOEK[categorie]
  if (zoek) {
    const hit = kosten.find(r => zoek.test(r.naam))
    if (hit) return { rekening: hit, gok: false }
    return { rekening: algemeen(rek) ?? vraagpost(rek) ?? kosten[0] ?? null, gok: true }
  }
  const vp = vraagpost(rek)
  if (vp) return { rekening: vp, gok: true, vraagpost: true }
  return { rekening: algemeen(rek) ?? kosten[0] ?? null, gok: true }
}

// ── Btw-tarieven ────────────────────────────────────────────────────────────
const NIET_BINNENLANDS = /(buiten|binnen\s?(de\s)?eu|export|icp|intracom|eu-|\beu\b)/i

/** Standaard verkooptarief voor een btw-regime, of null als er geen passend is. */
export function standaardVerkoopTarief(tar: MbTarief[], regime: string): MbTarief | null {
  const v = tar.filter(t => t.soort === 'verkoop')
  if (regime === 'normaal') return v.find(t => t.pct === 21 && !NIET_BINNENLANDS.test(t.naam)) ?? null
  if (regime === 'verlaagd') return v.find(t => t.pct === 9 && !NIET_BINNENLANDS.test(t.naam)) ?? null
  // Moneybird kent ook "Product buiten EU (btw verlegd)" en "Dienst binnen EU (btw
  // verlegd)" (rubriek 3a/3b). Binnenlandse verlegging (onderaanneming) is
  // "Btw verlegd binnenland" (rubriek 1e): die eerst, EU-varianten nooit.
  if (regime === 'verlegd') {
    return v.find(t => t.pct === 0 && /verlegd binnenland/i.test(t.naam))
      ?? v.find(t => t.pct === 0 && /verlegd/i.test(t.naam) && !NIET_BINNENLANDS.test(t.naam) && !/product|dienst/i.test(t.naam))
      ?? null
  }
  // Vrijgesteld = Moneybird's tarief "Btw vrijgesteld" (zonder aangifterubriek).
  // Bewust GEEN terugval op "0% btw": dat is rubriek 1e (nultarief en verlegd),
  // en vrijgestelde omzet hoort daar niet in.
  if (regime === 'vrijgesteld') return v.find(t => t.pct === 0 && /vrijgesteld/i.test(t.naam)) ?? null
  return null
}

/** Standaard inkooptarief voor een percentage (21, 9 of 0), of null. */
export function standaardInkoopTarief(tar: MbTarief[], percentage: number): MbTarief | null {
  const i = tar.filter(t => t.soort === 'inkoop' && !NIET_BINNENLANDS.test(t.naam) && !/verlegd/i.test(t.naam))
  if (percentage === 0) return i.find(t => t.pct === 0 && /(geen|0\s?%|nul|vrij)/i.test(t.naam)) ?? i.find(t => t.pct === 0) ?? null
  return i.find(t => t.pct === percentage) ?? null
}

// ── Keuze met instelling van de klant ───────────────────────────────────────
const label = (r: MbRekening) => (r.code ? `${r.code} ${r.naam}` : r.naam)
const REGIME_TEKST: Record<string, string> = {
  normaal: 'normaal (21%)', verlaagd: 'verlaagd (9%)', vrijgesteld: 'vrijgesteld', verlegd: 'btw verlegd',
}

export function kiesOmzetRekening(ind: Indeling, voork: Record<string, VoorkeurRij>, regime: string): string {
  const eigen = voork[`omzet:${regime}`]?.id
  if (eigen && ind.rekeningen.some(r => r.id === eigen && r.soort === 'omzet')) return eigen
  const std = standaardOmzet(ind.rekeningen, regime)
  if (!std) throw new Error('Er staat geen omzetrekening in je Moneybird-administratie. Maak er een aan in Moneybird.')
  return std.id
}

/** De kostenrekening voor een categorie. `vraagpost`: boeken met "controleren" erbij. */
export function kiesKostenRekening(
  ind: Indeling, voork: Record<string, VoorkeurRij>, categorie: string, meldingen?: string[],
): { id: string; vraagpost: boolean } {
  const eigen = voork[`kosten:${categorie}`]?.id
  if (eigen && ind.rekeningen.some(r => r.id === eigen && r.soort === 'kosten')) return { id: eigen, vraagpost: false }
  const { rekening, gok, vraagpost: vp } = standaardKosten(ind.rekeningen, categorie)
  if (!rekening) throw new Error('Er staat geen kostenrekening in je Moneybird-administratie. Maak er een aan in Moneybird.')
  if (vp) {
    meldingen?.push(
      `Categorie "${categorie}" heeft nog geen grootboekrekening. De kosten staan nu op ${label(rekening)} met "controleren" erbij `
      + 'voor je boekhouder. Kies er een rekening bij onder Integraties › Moneybird › Instellingen.',
    )
  } else if (gok) {
    meldingen?.push(
      `Categorie "${categorie}" heeft nog geen grootboekrekening in Moneybird. De kosten staan nu op ${label(rekening)}. `
      + 'Kies er een rekening bij onder Integraties › Moneybird › Instellingen, of maak er een aan via de checklist daar.',
    )
  }
  return { id: rekening.id, vraagpost: Boolean(vp) }
}

export function kiesVerkoopTarief(ind: Indeling, voork: Record<string, VoorkeurRij>, regime: string, pct = 21): string {
  // Een normaal-regel met een afwijkend percentage (oude data, bijvoorbeeld 6%):
  // het tarief met dát percentage, niet 21%. Bij SnelStart is dat de aparte
  // overige-omzetrekening; in Moneybird zit het in het tarief.
  if (regime === 'normaal' && pct !== 21) {
    const t = ind.tarieven.find(x => x.soort === 'verkoop' && x.pct === pct && !NIET_BINNENLANDS.test(x.naam))
    if (t) return t.id
    throw new Error(`Er is geen btw-tarief van ${pct}% voor verkoop in je Moneybird-administratie. Maak het aan in Moneybird (Instellingen › Btw-tarieven).`)
  }
  const eigen = voork[`btw:${regime}`]?.id
  if (eigen && ind.tarieven.some(t => t.id === eigen && t.soort === 'verkoop')) return eigen
  const std = standaardVerkoopTarief(ind.tarieven, regime)
  if (!std) {
    // Een nieuwe Moneybird-administratie heeft standaard geen tarief voor btw
    // verlegd, en de API kan er geen aanmaken. Het 0%-tarief gebruiken zou
    // fiscaal fout zijn (andere aangifterubriek), dus: zeggen wat te doen.
    const naam = regime === 'verlegd' ? 'Btw verlegd binnenland' : regime === 'vrijgesteld' ? 'Btw vrijgesteld' : null
    throw new Error(naam
      ? `Je Moneybird-administratie heeft nog geen btw-tarief "${naam}". Maak het aan in Moneybird `
        + `(Instellingen › Boekhouding › Btw-tarieven › Toevoegen › "${naam}") en synchroniseer opnieuw, of kies het onder Integraties › Moneybird › Instellingen.`
      : `Er is geen btw-tarief voor ${REGIME_TEKST[regime] ?? regime} gevonden in je Moneybird-administratie. `
        + 'Maak het aan in Moneybird (Instellingen › Btw-tarieven) of kies het onder Integraties › Moneybird › Instellingen.')
  }
  return std.id
}

export function kiesInkoopTarief(ind: Indeling, voork: Record<string, VoorkeurRij>, percentage: number): string {
  const p = percentage === 9 ? 9 : percentage === 0 ? 0 : 21
  const eigen = voork[`btwinkoop:${p}`]?.id
  if (eigen && ind.tarieven.some(t => t.id === eigen && t.soort === 'inkoop')) return eigen
  const std = standaardInkoopTarief(ind.tarieven, p)
  if (!std) {
    throw new Error(
      `Er is geen btw-tarief voor inkoop met ${p}% gevonden in je Moneybird-administratie. `
      + 'Maak het aan in Moneybird (Instellingen › Btw-tarieven, voor inkoop) of kies het onder Integraties › Moneybird › Instellingen.')
  }
  return std.id
}

/**
 * Checklist na het koppelen: wat moet er in de Moneybird-administratie staan
 * om alles te kunnen boeken? Een nieuwe administratie mist standaard de
 * tarieven voor btw verlegd en vrijgesteld, en die kan BossBase via de API niet
 * aanmaken. Het instellingenscherm toont dit per punt met een vinkje of kruisje.
 */
export type Controle = {
  ok: boolean; titel: string; uitleg: string
  // Wat de gebruiker kan doen: BossBase maakt het aan, of een link naar de
  // plek in het boekhoudpakket waar hij het zelf doet.
  actie?: { soort: 'aanmaken'; wat: 'inkoop'; label: string } | { soort: 'link'; url: string; label: string }
}

export function controleNaKoppelen(ind: Indeling, administratieId: string): Controle[] {
  const materiaal = standaardKosten(ind.rekeningen, 'Materiaal')
  const tariefPagina = `https://moneybird.com/${administratieId}/tax_rates/new`
  const link = { soort: 'link' as const, url: tariefPagina, label: 'Openen in Moneybird' }
  return [
    {
      ok: Boolean(standaardVerkoopTarief(ind.tarieven, 'verlegd')),
      titel: 'Btw-tarief "Btw verlegd binnenland"',
      uitleg: 'Nodig als je in onderaanneming werkt (btw verlegd). BossBase kan btw-tarieven niet zelf aanmaken: '
        + 'open de pagina in Moneybird, vink onder Verkoopfactuur "Btw verlegd binnenland" aan en klik Opslaan.',
      actie: link,
    },
    {
      ok: Boolean(standaardVerkoopTarief(ind.tarieven, 'vrijgesteld')),
      titel: 'Btw-tarief "Btw vrijgesteld"',
      uitleg: 'Nodig voor werk zonder btw (vrijgesteld). Open de pagina in Moneybird, vink onder Verkoopfactuur '
        + '"Btw vrijgesteld" aan en klik Opslaan.',
      actie: link,
    },
    {
      ok: Boolean(standaardInkoopTarief(ind.tarieven, 0)),
      titel: 'Btw-tarief voor kosten zonder btw',
      uitleg: 'Nodig voor kosten waar geen btw op zit, zoals verzekeringen. Open de pagina in Moneybird, vink onder '
        + 'Inkoopfactuur "0% btw" aan en klik Opslaan.',
      actie: link,
    },
    {
      ok: Boolean(materiaal.rekening && !materiaal.gok),
      titel: 'Een categorie voor inkoop van materiaal',
      uitleg: 'Zonder komen materiaalkosten op Algemene kosten. BossBase kan de categorie "Inkoop materialen" voor je aanmaken.',
      actie: { soort: 'aanmaken', wat: 'inkoop', label: 'Aanmaken' },
    },
  ]
}

// De categorie die de knop "Aanmaken" in de checklist maakt. RGS 3.5-code
// WKprInhInh = "Inkoopwaarde handelsgoederen" (70251): ingekochte goederen die je
// doorlevert, zoals materiaal bij een klus. Moneybird eist een RGS-code bij het
// aanmaken van een categorie.
export const INKOOP_REKENING = { name: 'Inkoop materialen', account_type: 'direct_costs', rgs_code: 'WKprInhInh' }

export async function maakInkoopRekening(k: MbKoppeling): Promise<void> {
  const { rgs_code, ...ledger_account } = INKOOP_REKENING
  await mbFetch(k, '/ledger_accounts', {
    method: 'POST',
    body: JSON.stringify({ rgs_code, ledger_account: { ...ledger_account, allowed_document_types: ['purchase_invoice'] } }),
  })
}

/** Wat de standaard zou kiezen, per instelbare sleutel — voor het instellingenscherm. */
export function standaardIndeling(ind: Indeling, kostenCategorieen: string[]): Record<string, { soort: 'een'; id: string; label: string } | null> {
  const uit: Record<string, { soort: 'een'; id: string; label: string } | null> = {}
  const zet = (sleutel: string, id: string | undefined | null, lbl: string | undefined | null) => {
    uit[sleutel] = id ? { soort: 'een', id, label: String(lbl) } : null
  }
  for (const cat of kostenCategorieen) {
    const { rekening, gok } = standaardKosten(ind.rekeningen, cat)
    // Valt een categorie terug op algemene kosten, dan zegt het scherm dat
    // eerlijk: daar boekt de sync hem ook (met een melding).
    const { vraagpost: vp } = standaardKosten(ind.rekeningen, cat)
    const passend = !gok || /algemene|overig/i.test(cat)
    zet(`kosten:${cat}`, rekening?.id, rekening && (vp
      ? `${label(rekening)} (vraagpost, te controleren)`
      : passend ? label(rekening) : `${label(rekening)} (geen eigen rekening gevonden)`))
  }
  for (const regime of ['normaal', 'verlaagd', 'vrijgesteld', 'verlegd']) {
    const r = standaardOmzet(ind.rekeningen, regime)
    zet(`omzet:${regime}`, r?.id, r && label(r))
    const t = standaardVerkoopTarief(ind.tarieven, regime)
    zet(`btw:${regime}`, t?.id, t?.naam)
  }
  for (const p of [21, 9, 0]) {
    const t = standaardInkoopTarief(ind.tarieven, p)
    zet(`btwinkoop:${p}`, t?.id, t?.naam)
  }
  return uit
}
