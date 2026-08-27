// ─────────────────────────────────────────────────────────────────────────────
// Welke grootboekrekening krijgt een boeking?
//
// Tot nu toe zochten we op grootboekFUNCTIE en namen we de eerste treffer. Dat
// gaat mis omdat een functie geen rekening aanwijst maar een hele groep: in het
// standaard SnelStart-schema dragen 52 rekeningen de functie
// InkopenKostenAlleBtwTarieven en 23 de functie InkopenKostenHoog. `find()` pakt
// er willekeurig één uit. In de ketentest belandde materiaal daardoor op
// "Reclame- en advertentiekosten" en een inkoopfactuur op "Privé-gebruik
// energie" — bedragen klopten, tegenrekening was onzin.
//
// Daarom omgekeerd: we kiezen op NUMMER, en gebruiken de functie nog als
// controle. Past het nummer niet bij het btw-tarief van de regel, dan schuiven
// we door naar het volgende voorkeursnummer. Pas als geen enkel voorkeursnummer
// bestaat vallen we terug op de oude zoektocht per functie — en dan melden we
// dat, zodat de gebruiker weet dat er gegokt is in plaats van gekozen.
//
// De nummers volgen het standaard Nederlandse rekeningschema zoals SnelStart dat
// uitlevert. Wijkt een administratie daarvan af, dan vangt laag 2 dat op: een
// eigen keuze per bedrijf, opgeslagen in grootboek_voorkeuren.
// ─────────────────────────────────────────────────────────────────────────────

export type Grootboek = { id: string; nummer?: number; omschrijving?: string; grootboekfunctie?: string }

/** Eén gekozen rekening + hoe we eraan gekomen zijn. */
export type Keuze = {
  id: string
  nummer?: number
  omschrijving?: string
  /** 'voorkeur' = op nummer gekozen, 'instelling' = door de klant ingesteld,
   *  'functie' = teruggevallen op de functie (dus gegokt), 'vraagpost' = vangnet. */
  bron: 'instelling' | 'voorkeur' | 'functie' | 'vraagpost'
}

// ── Welke functies horen bij welk btw-tarief ────────────────────────────────
// Een rekening met functie InkopenKostenHoog verwacht 21%; daar een 9%-regel op
// boeken is vragen om een afwijzing. AlleBtwTarieven accepteert alles.
const INKOOP_FUNCTIES = (pct: number): string[] => {
  const alle = ['InkopenKostenAlleBtwTarieven']
  if (pct === 21) return ['InkopenHoog', 'InkopenKostenHoog', ...alle]
  if (pct === 9) return ['InkopenLaag', 'InkopenKostenLaag', ...alle]
  return ['InkopenOverig', 'InkopenKostenOverig', ...alle]
}

// Het tarief telt mee, niet alleen het regime: een 'normaal' regel met een
// afwijkend percentage (oude data met 6%) hoort op de overige-omzetrekening en
// niet op de hoge. Dat deed de oude omzetGrootboekfunctie() ook zo; bij het
// omzetten naar voorkeursnummers was die tariefcontrole eruit gevallen.
const omzetFunctie = (regime: string, pct: number): string => {
  if (regime === 'verlaagd') return 'VerkopenOmzetLaag'
  if (regime === 'verlegd' || regime === 'vrijgesteld') return 'VerkopenOmzetOnbelastVerlegd'
  return pct === 21 ? 'VerkopenOmzetHoog' : 'VerkopenOmzetOverig'
}

// ── Voorkeursnummers: kosten ────────────────────────────────────────────────
// Volgorde is betekenisvol. Omdat de functiecontrole een nummer kan afwijzen,
// dekt één lijst alle tarieven: 7002 is hoog, 7001 laag, 7000 accepteert alles.
// Een 9%-materiaalregel slaat 7002 dus over en landt op 7001.
//
// Onderbouwing per categorie:
//   Materiaal      70xx is in het standaardschema letterlijk "Inkopen" — de
//                  inkoop van goederen die je doorlevert. Precies wat materiaal is.
//   Inkoopfactuur  Verzamelcategorie zonder eigen kostensoort; 7000 "Inkopen alle
//                  btw tarieven" is de brede inkooprekening die daarvoor bedoeld is.
//   Gereedschap    4303 "Kleine aanschaffingen inventaris" — gereedschap is klein
//                  bedrijfsmiddel, geen doorgeleverde handelswaar.
//   Reiskosten     4406 "Reis- en verblijfkosten" is de algemene reisrekening en
//                  accepteert alle tarieven; 4509 "Kilometervergoeding" als tweede
//                  keus voor wie per kilometer boekt. NB: de 4310-reeks is in dit
//                  schema "Reparatie en onderhoud machines" — dus niet geschikt.
//   Arbeid         Vervallen categorie, bestaat nog in oude data. Ingekochte
//                  arbeid is 7100 "Kosten uitbesteed werk".
//   Algemene/Overig 4798 heet letterlijk "Algemene kosten".
const KOSTEN_VOORKEUR: Record<string, number[]> = {
  // Bewust ÉÉN rekening en niet [7002, 7001, 7000]: die reeks boekte 21% op
  // 7002, 9% op 7001 en 0% op 7000. Boekhoudkundig verdedigbaar, maar het
  // instellingenscherm kan dan niet één standaard tonen zonder te liegen — en
  // materiaal in drieën splitsen levert geen inzicht op dat iemand wil.
  // 7000 accepteert alle tarieven, dus alle materiaalinkoop staat bij elkaar.
  'Materiaal':       [7000],
  'Inkoopfactuur':   [7000],
  'Gereedschap':     [4303, 7000],
  'Reiskosten':      [4406, 4509, 7000],
  'Arbeid':          [7100, 7000],
  'Algemene kosten': [4798, 7000],
  'Overig':          [4798, 7000],
}

// Terugval per functie, zoals het vroeger werkte. Alleen nog als geen enkel
// voorkeursnummer in de administratie voorkomt.
const KOSTEN_FUNCTIE_TERUGVAL: Record<string, string[]> = {
  'Materiaal':       ['Inkopen{t}', 'InkopenKosten{t}', 'InkopenKostenAlleBtwTarieven'],
  'Inkoopfactuur':   ['InkopenKostenAlleBtwTarieven', 'InkopenKosten{t}', 'Inkopen{t}'],
  'Gereedschap':     ['InkopenKosten{t}', 'InkopenKostenAlleBtwTarieven'],
  'Reiskosten':      ['InkopenKosten{t}', 'InkopenKostenAlleBtwTarieven'],
  'Arbeid':          ['InkopenKosten{t}', 'InkopenKostenAlleBtwTarieven'],
  'Algemene kosten': ['InkopenKostenAlleBtwTarieven', 'InkopenKosten{t}'],
  'Overig':          ['InkopenKostenAlleBtwTarieven', 'InkopenKosten{t}'],
}

// ── Voorkeursnummers: omzet ─────────────────────────────────────────────────
// BossBase-gebruikers leveren diensten, dus de 82xx-reeks (diensten) gaat voor
// op 80xx (productiegoederen) en 81xx (handelsgoederen).
//
// Vrijgesteld en verlegd gaan bewust UIT ELKAAR, ook al delen ze dezelfde
// grootboekfunctie en dezelfde aangifterubriek (1e). "Werk vrijgesteld" onder
// een rekening die "Omzet verlegd" heet leest verkeerd in het grootboek.
const OMZET_VOORKEUR: Record<string, number[]> = {
  normaal:     [8200, 8000, 8100],
  // Voor een normaal-regel met een afwijkend percentage. De 82xx-reeks
  // (diensten) kent geen overige-omzetrekening, dus hier wél 80xx/81xx.
  overig:      [8020, 8120],
  verlaagd:    [8210, 8010, 8110],
  vrijgesteld: [8240, 8140, 8040],
  verlegd:     [8250, 8150, 8040],
}

const nummerVan = (g: Grootboek): number | null => {
  const n = Number(g?.nummer)
  return Number.isFinite(n) ? n : null
}

/** Zoekt een rekening op nummer, en accepteert hem alleen als de functie past. */
function opNummer(gbs: Grootboek[], nummer: number, toegestaan: string[]): Grootboek | null {
  const gb = gbs.find(g => nummerVan(g) === nummer)
  if (!gb?.id) return null
  return toegestaan.includes(String(gb.grootboekfunctie || '')) ? gb : null
}

function opFunctie(gbs: Grootboek[], functies: string[]): Grootboek | null {
  for (const f of functies) {
    const gb = gbs.find(g => String(g.grootboekfunctie || '') === f)
    if (gb?.id) return gb
  }
  return null
}

const naarKeuze = (gb: Grootboek, bron: Keuze['bron']): Keuze =>
  ({ id: gb.id, nummer: nummerVan(gb) ?? undefined, omschrijving: gb.omschrijving, bron })

/**
 * Kiest de omzetrekening voor één factuurregel.
 *
 * @param voorkeurNummer  door de klant ingesteld nummer (laag 2), of null
 * @param meldingen       hierin belandt een waarschuwing als er is teruggevallen
 */
export function kiesOmzetGrootboek(
  gbs: Grootboek[], regime: string, pct: number,
  voorkeurNummer?: number | null, meldingen?: string[],
): Keuze {
  const functie = omzetFunctie(regime, pct)
  const toegestaan = [functie]
  // Een normaal-regel met een afwijkend percentage heeft zijn eigen reeks.
  const voorkeuren = (regime === 'normaal' && pct !== 21) ? OMZET_VOORKEUR.overig : (OMZET_VOORKEUR[regime] || [])

  // 1. Instelling van de klant wint, mits de functie klopt.
  if (voorkeurNummer) {
    const gb = opNummer(gbs, voorkeurNummer, toegestaan)
    if (gb) return naarKeuze(gb, 'instelling')
    meldingen?.push(
      `Grootboek ${voorkeurNummer} is ingesteld voor ${regime}e omzet, maar past niet bij dat btw-tarief `
      + `(verwacht: ${functie}). Er is een standaardrekening gebruikt; pas de instelling aan.`,
    )
  }

  // 2. Onze voorkeursnummers.
  for (const nr of voorkeuren) {
    const gb = opNummer(gbs, nr, toegestaan)
    if (gb) return naarKeuze(gb, 'voorkeur')
  }

  // 3. Terugval op de functie — dit is gokken, dus melden.
  const gb = opFunctie(gbs, toegestaan)
  if (gb) {
    meldingen?.push(
      `Geen van de gebruikelijke omzetrekeningen (${voorkeuren.join(', ')}) bestaat in je `
      + `administratie. ${regime === 'normaal' ? 'Belaste' : regime[0].toUpperCase() + regime.slice(1) + 'e'} omzet is `
      + `daarom geboekt op ${gb.nummer} ${gb.omschrijving}. Controleer of dat klopt en stel het zo nodig in.`,
    )
    return naarKeuze(gb, 'functie')
  }

  throw new Error(
    `Geen omzetrekening gevonden voor ${regime} (${pct}%). Gezocht op nummer `
    + `${voorkeuren.join(', ')} en op functie ${functie}. `
    + `Maak zo'n rekening aan in SnelStart of kies er een in de boekhoudinstellingen.`,
  )
}

/**
 * Kiest de inkooprekening voor één kostenpost. Valt terug op de vraagpost als
 * de categorie onbekend is of niets past — dan gaat de markering aan.
 */
export function kiesInkoopGrootboek(
  gbs: Grootboek[], categorie: string, pct: number,
  voorkeurNummer?: number | null, meldingen?: string[],
): Keuze {
  const toegestaan = INKOOP_FUNCTIES(pct)
  const cat = String(categorie || '').trim()

  if (voorkeurNummer) {
    const gb = opNummer(gbs, voorkeurNummer, toegestaan)
    if (gb) return naarKeuze(gb, 'instelling')
    meldingen?.push(
      `Grootboek ${voorkeurNummer} is ingesteld voor "${cat}", maar accepteert geen ${pct}% btw. `
      + `Er is een standaardrekening gebruikt; kies in de boekhoudinstellingen een rekening die alle tarieven aankan.`,
    )
  }

  for (const nr of (KOSTEN_VOORKEUR[cat] || [])) {
    const gb = opNummer(gbs, nr, toegestaan)
    if (gb) return naarKeuze(gb, 'voorkeur')
  }

  const suffix = pct === 21 ? 'Hoog' : pct === 9 ? 'Laag' : 'Overig'
  const functies = (KOSTEN_FUNCTIE_TERUGVAL[cat] || []).map(f => f.replace('{t}', suffix))
  const gb = functies.length ? opFunctie(gbs, functies) : null
  if (gb) {
    meldingen?.push(
      `Geen van de gebruikelijke rekeningen (${(KOSTEN_VOORKEUR[cat] || []).join(', ')}) bestaat in je administratie. `
      + `"${cat}" is daarom geboekt op ${gb.nummer} ${gb.omschrijving}. Controleer of dat klopt en stel het zo nodig in.`,
    )
    return naarKeuze(gb, 'functie')
  }

  const vraagpost = gbs.find(g => String(g.grootboekfunctie || '') === 'InkopenVraagPosten')
  if (vraagpost?.id) {
    // Een categorie die wij niet kennen is er een die de klant zelf heeft
    // toegevoegd. Waar "Verzekeringen" of "Abonnementen" hoort valt niet te
    // raden, dus: vraagpost met markering, en zeggen wat eraan te doen is. Dat
    // is beter dan de boeking weigeren — dan mist er een kostenpost in de
    // boekhouding en weet niemand waarom.
    if (!KOSTEN_VOORKEUR[cat]) {
      meldingen?.push(
        `Categorie "${cat}" heeft nog geen grootboekrekening. De kosten staan nu op de vraagpost met een `
        + `markering voor je boekhouder. Kies er een rekening bij onder Integraties → SnelStart → Boekhoudinstellingen.`,
      )
    }
    return naarKeuze(vraagpost, 'vraagpost')
  }

  const beschikbaar = [...new Set(gbs.map(g => g.grootboekfunctie).filter(f => String(f || '').startsWith('Inkopen')))].join(', ')
  throw new Error(
    `Geen inkooprekening voor categorie "${cat}" (${pct}% btw) en geen vraagpostenrekening in de administratie; `
    + `beschikbare inkoopfuncties: ${beschikbaar || 'geen'}`,
  )
}

/** Alle sleutels die in de boekhoudinstellingen ingesteld kunnen worden. */
export const VOORKEUR_SLEUTELS = [
  ...Object.keys(KOSTEN_VOORKEUR).map(c => `kosten:${c}`),
  ...Object.keys(OMZET_VOORKEUR).map(r => `omzet:${r}`),
]

export { KOSTEN_VOORKEUR, OMZET_VOORKEUR }

export type Standaard =
  | { soort: 'een'; nummer?: number; omschrijving?: string }
  // Voor een categorie die per btw-tarief anders uitpakt. Dan MOET het scherm
  // de splitsing tonen; één regel laten zien zou een halve waarheid zijn.
  | { soort: 'per_tarief'; perTarief: { pct: number; nummer?: number; omschrijving?: string }[] }
  | null

/**
 * Welke rekening zou de standaardindeling kiezen, gegeven deze administratie?
 *
 * Het instellingenscherm toont dit per regel, zodat zichtbaar is wat er gebeurt
 * als je niets invult. Bewust hier berekend en niet in de UI overgetypt: twee
 * lijsten die uit elkaar lopen is precies hoe je een scherm krijgt dat iets
 * anders belooft dan de sync doet.
 *
 * Kosten worden op alle drie de tarieven opgelost. Een voorkeursreeks kan per
 * tarief op een andere rekening uitkomen — dat is juist de bedoeling van de
 * functiecontrole — en dan is één antwoord tonen niet waar. Komen alle drie op
 * dezelfde rekening uit, dan is het één regel.
 */
export function standaardIndeling(gbs: Grootboek[]): Record<string, Standaard> {
  const uit: Record<string, Standaard> = {}

  for (const cat of Object.keys(KOSTEN_VOORKEUR)) {
    const per = [21, 9, 0].map(pct => {
      try {
        const k = kiesInkoopGrootboek(gbs, cat, pct)
        return k.bron === 'vraagpost'
          ? { pct, nummer: undefined, omschrijving: undefined }
          : { pct, nummer: k.nummer, omschrijving: k.omschrijving }
      } catch {
        return { pct, nummer: undefined, omschrijving: undefined }
      }
    })
    const uniek = new Set(per.map(p => String(p.nummer ?? '')))
    if (uniek.size === 1) {
      const eerste = per[0]
      uit[`kosten:${cat}`] = eerste.nummer
        ? { soort: 'een', nummer: eerste.nummer, omschrijving: eerste.omschrijving }
        : null
    } else {
      uit[`kosten:${cat}`] = { soort: 'per_tarief', perTarief: per }
    }
  }

  // Omzet: elk regime heeft één tarief, dus hier is één antwoord wél volledig.
  // De uitzondering — een normaal-regel met een afwijkend percentage — hoort bij
  // de sleutel 'overig' en krijgt daarmee zijn eigen regel.
  for (const regime of Object.keys(OMZET_VOORKEUR)) {
    const pct = regime === 'normaal' ? 21 : regime === 'verlaagd' ? 9 : regime === 'overig' ? 6 : 0
    try {
      const k = kiesOmzetGrootboek(gbs, regime === 'overig' ? 'normaal' : regime, pct)
      uit[`omzet:${regime}`] = { soort: 'een', nummer: k.nummer, omschrijving: k.omschrijving }
    } catch { uit[`omzet:${regime}`] = null }
  }
  return uit
}
