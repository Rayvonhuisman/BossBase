#!/usr/bin/env node
// Bundelt de kennisbank en de systeemprompt tot één bestand dat de edge function
// boss-chat kan importeren.
//
//     node scripts/gen-boss-kennis.mjs
//     → supabase/functions/_shared/bossKennis.ts
//
// Waarom een generator: een edge function draait niet op jouw schijf en kan de
// markdown-bestanden dus niet inlezen. Door ze in een TypeScript-module te
// bakken reizen ze mee met de deploy.
//
// Draai dit script na ELKE wijziging aan bob-knowledge/ — anders praat Boss nog
// met de oude kennis. Daarna:  supabase functions deploy boss-chat

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const KENNIS_MAP = 'bob-knowledge'
const PROMPT     = '_boss-systeemprompt.md'
const UIT        = 'supabase/functions/_shared/bossKennis.ts'

// ── DE SUPER-ADMIN-SECTIE ERUIT ──────────────────────────────────────────────
// aanvullingen.md beschrijft wat er in het interne beheerportaal staat. Die
// beschrijving mag Boss niet hebben.
//
// Je kunt een model vragen ergens over te zwijgen, maar dan moet je het wel eerst
// vertellen — en dat is precies de verkeerde volgorde. Iemand die er slim naar
// vraagt, krijgt het er vroeg of laat uit. Wat Boss niet weet, kan hij niet
// prijsgeven. Dus knippen we de sectie eruit en zetten we er een instructie voor
// in de plaats.
const SUPERADMIN_PATROON = /super[-\s]?admin/i

const SUPERADMIN_VERVANGING = `## Buiten de eigen bedrijfsomgeving

Je kennis gaat uitsluitend over het portaal zoals één bedrijf dat ziet. Valt een
vraag daarbuiten, volg dan de instructie daarover in je systeemprompt.
`

// Haalt élke sectie weg waarvan de kop naar het beheerportaal verwijst, op welk
// kopniveau dan ook. Daarna gaan losse regels eruit die het elders noemen — in
// een opsomming, een routelijst of een voetnoot.
function scrubSuperadmin(tekst) {
  const regels = tekst.split('\n')
  const uit = []
  let overslaan = false
  let niveau = 0
  let verwijderd = 0

  for (const regel of regels) {
    const kop = regel.match(/^(#+)\s/)

    if (kop) {
      const dit = kop[1].length
      // Einde van de over te slaan sectie: een kop op hetzelfde of hoger niveau.
      if (overslaan && dit <= niveau) overslaan = false

      if (!overslaan && SUPERADMIN_PATROON.test(regel)) {
        overslaan = true
        niveau = dit
        verwijderd++
        continue
      }
    }

    if (overslaan) { verwijderd++; continue }

    // Losse vermeldingen buiten een eigen sectie.
    if (SUPERADMIN_PATROON.test(regel)) { verwijderd++; continue }

    uit.push(regel)
  }

  return { tekst: uit.join('\n'), verwijderd }
}

// ── ALLEEN VOOR DE INVENTARISATIE ────────────────────────────────────────────
// _inventarisatie.md is geschreven als werkdocument voor Niels, niet als kennis
// voor Boss. Er staan twee soorten tekst in die Boss actief in de weg zitten:
//
//   1. "Openstaande vragen voor Niels" — vragen zónder antwoord. Boss zou ze als
//      feit kunnen lezen, of erger, het antwoord invullen.
//   2. De sectie met tegenstrijdigheden — daarin staan drie verschillende
//      prijslijsten (Starter €19/€29, Vakman, Onderneming, Team €79) met de
//      aantekening dat nog moet worden uitgezocht welke klopt. Geen daarvan is de
//      actuele prijs; die staat in abonnementen.md en in de database.
//
// De rest van het bestand blijft gewoon staan.
const INVENTARISATIE = '_inventarisatie.md'

// Weg vanaf een kop die op het patroon past, tot de volgende kop van hetzelfde
// of een hoger niveau.
function verwijderSectie(regels, patroon) {
  const uit = []
  let overslaan = false
  let niveau = 0
  let weg = 0

  for (const regel of regels) {
    const kop = regel.match(/^(#+)\s/)
    if (kop) {
      const dit = kop[1].length
      if (overslaan && dit <= niveau) overslaan = false
      if (!overslaan && patroon.test(regel)) {
        overslaan = true; niveau = dit; weg++; continue
      }
    }
    if (overslaan) { weg++; continue }
    uit.push(regel)
  }
  return { regels: uit, weg }
}

// De "Openstaande vragen"-blokken zijn geen koppen maar vetgedrukte regels. Ze
// lopen tot de eerstvolgende scheidingslijn of kop.
function verwijderVragenblokken(regels) {
  const uit = []
  let overslaan = false
  let weg = 0

  for (const regel of regels) {
    if (/^\*\*Openstaande vragen/i.test(regel)) { overslaan = true; weg++; continue }
    if (overslaan) {
      if (/^---\s*$/.test(regel) || /^#+\s/.test(regel)) overslaan = false
      else { weg++; continue }
    }
    uit.push(regel)
  }
  return { regels: uit, weg }
}

// Gedachtestreepjes eruit. De systeemprompt verbiedt ze in Boss' antwoorden,
// maar de kennisbank staat er vol mee (ruim honderd stuks, uit de schrijfstijl
// van wie hem heeft opgesteld). Een model neemt de opmaak over die het ziet, dus
// één regel in de prompt legt het af tegen honderd voorbeelden. We vervangen ze
// door een gewoon koppelteken; dat leest hetzelfde en is wél toegestaan.
//
// Alleen in de KENNIS. In de instructie blijft het teken staan, want daar wordt
// het letterlijk benoemd als iets wat niet mag.
// AFAS en Google Agenda eruit. De systeemprompt verbiedt Boss ze te noemen als
// beschikbare koppeling, maar de kennisbank beschrijft ze uitgebreid - inclusief
// de zin "Koppeling met Moneybird, SnelStart of AFAS" die letterlijk uit de
// functiebeschrijving in de database komt. Bij een vraag over de abonnementen
// somde hij AFAS dan gewoon op.
//
// Zelfde les als bij het beheerportaal: een verbod in de prompt legt het af tegen
// een kennisbank die het tegendeel voorschotelt. Wat hij niet heeft, kan hij niet
// noemen.
function scrubNietBeschikbaar(tekst) {
  const regels = tekst.split('\n')
  const uit = []
  let overslaan = false
  let niveau = 0
  let weg = 0

  for (const regel of regels) {
    const kop = regel.match(/^(#+)\s/)
    if (kop) {
      const dit = kop[1].length
      if (overslaan && dit <= niveau) overslaan = false
      if (!overslaan && /\bAFAS\b|Google Agenda|Google Calendar/i.test(regel)) {
        overslaan = true; niveau = dit; weg++; continue
      }
    }
    if (overslaan) { weg++; continue }

    // De opsomming van boekhoudpakketten komt uit de database en noemt AFAS
    // met naam; die ene naam eruit halen laat de zin verder intact.
    let r = regel
      .replace(/Moneybird, SnelStart of AFAS/gi, 'Moneybird of SnelStart')
      .replace(/Moneybird, SnelStart en AFAS/gi, 'Moneybird en SnelStart')

    if (/\bAFAS\b|Google Agenda|Google Calendar/i.test(r)) { weg++; continue }
    uit.push(r)
  }
  return { tekst: uit.join('\n'), weg }
}

// De interne routes (/dashboard/revenue en zo) eruit. Boss gaf ze door aan de
// gebruiker: "onder Financien (of Revenue)". Dat is de technische naam, geen
// menu-item, en dus precies wat hij niet hoort te zeggen. Wat in het menu staat
// staat gewoon in de kennis; de route voegt daar niets aan toe.
function scrubRoutes(tekst) {
  let weg = 0
  const regels = tekst.split('\n')
  const uit = []
  for (const regel of regels) {
    // Regels die niets anders zijn dan een route met zijn label.
    if (/^\s*[-*]\s*`?\/dashboard\/[a-z-]*`?\s*[-:]/i.test(regel)) { weg++; continue }
    const voor = regel
    let r = regel
      .replace(/\s*\((?:route|url|pad):\s*`?\/dashboard[^)]*`?\)/gi, '')
      .replace(/`\/dashboard\/[a-z-]*`/gi, 'het portaal')
      .replace(/\/dashboard(?:\/[a-z.-]*)?/gi, 'het portaal')
    if (r !== voor) weg++
    uit.push(r)
  }
  return { tekst: uit.join('\n'), weg }
}

function scrubStreepjes(tekst) {
  return tekst.replace(/[—–]/g, '-')
}

function scrubInventarisatie(tekst) {
  let regels = tekst.split('\n')
  let weg = 0

  // EERST de secties zelf weghalen. Dit moet vóór de leeswijzer hieronder:
  // die filtert op dezelfde woorden en zou anders de KOP wegnemen, waarna de
  // sectieverwijdering zijn beginpunt niet meer vindt en de hele inhoud —
  // inclusief drie achterhaalde prijslijsten — gewoon blijft staan.
  const a = verwijderSectie(regels, /onzekerheden|tegenstrijdigheden/i)
  regels = a.regels; weg += a.weg

  const b = verwijderVragenblokken(regels)
  regels = b.regels; weg += b.weg

  // Pas nu de leeswijzer bovenaan, die naar de zojuist verwijderde secties
  // verwijst. Blijft die staan, dan gaat Boss zoeken naar iets wat er niet meer
  // is — en dat is het soort halve informatie waar hij dingen bij verzint.
  const voor = regels.length
  regels = regels.filter(r => !/Openstaande vragen voor Niels|onzekerheden & tegenstrijdigheden/i.test(r))
  weg += voor - regels.length

  return { tekst: regels.join('\n'), weg }
}

// ── INLEZEN ──────────────────────────────────────────────────────────────────
const bestanden = readdirSync(KENNIS_MAP)
  .filter(f => f.endsWith('.md') && f !== PROMPT)
  .sort()

if (bestanden.length === 0) {
  console.error(`Geen kennisbestanden gevonden in ${KENNIS_MAP}/`)
  process.exit(1)
}

console.error('Kennisbank bundelen:')
const delen = []
let totaalGeknipt = 0

for (const naam of bestanden) {
  let inhoud = readFileSync(join(KENNIS_MAP, naam), 'utf8')

  const r = scrubSuperadmin(inhoud)
  inhoud = r.tekst
  if (r.verwijderd > 0) {
    totaalGeknipt += r.verwijderd
    console.error(`  ! ${naam}: ${r.verwijderd} regel(s) over het beheerportaal verwijderd`)
  }

  if (naam === INVENTARISATIE) {
    const v = scrubInventarisatie(inhoud)
    inhoud = v.tekst
    console.error(`  ! ${naam}: ${v.weg} regel(s) openstaande vragen en tegenstrijdigheden verwijderd`)
  }

  const nb = scrubNietBeschikbaar(inhoud)
  inhoud = nb.tekst
  if (nb.weg > 0) console.error(`  ! ${naam}: ${nb.weg} regel(s) over niet-beschikbare koppelingen verwijderd`)

  const rt = scrubRoutes(inhoud)
  inhoud = rt.tekst
  if (rt.weg > 0) console.error(`  ! ${naam}: ${rt.weg} interne route(s) verwijderd`)

  inhoud = scrubStreepjes(inhoud)

  delen.push(`\n\n===== ${naam} =====\n\n${inhoud.trim()}`)
  console.error(`  + ${naam.padEnd(34)} ${inhoud.length.toLocaleString('nl-NL')} tekens`)
}

const prompt = readFileSync(join(KENNIS_MAP, PROMPT), 'utf8')
console.error(`  + ${PROMPT.padEnd(34)} ${prompt.length.toLocaleString('nl-NL')} tekens (instructie)`)

// De instructie komt in de plaats van alles wat we hebben weggehaald.
delen.push(`\n\n===== reikwijdte =====\n\n${SUPERADMIN_VERVANGING.trim()}`)
delen.push(`\n\n===== koppelingen =====\n\nDe beschikbare koppelingen zijn Moneybird, SnelStart en de Stripe betaallink.\nVraagt iemand naar een andere koppeling, dan is die er op dit moment niet.`)

const kennis = delen.join('\n')

// ── HARDE EINDCONTROLE ───────────────────────────────────────────────────────
// Het knipwerk hierboven is de bedoeling; deze controle is het bewijs. Zonder
// dit zou een hernoemde kop of een nieuw kennisbestand het beheerportaal
// ongemerkt weer naar binnen laten glippen, en dan merk je het pas als een klant
// ernaar vraagt.
// Bewust BREDER dan SUPERADMIN_PATROON. Zou de controle op precies hetzelfde
// patroon toetsen als de knipregel, dan bewijst hij alleen dat de knipregel zijn
// eigen werk heeft gedaan — en glipt een anders geformuleerde beschrijving er
// gewoon doorheen.
const VERDACHT = [
  /super[-\s]?admin/i,
  /alle bedrijven op het platform/i,
  /aangesloten bedrijven/i,
  /\bMRR\b/,
  /bedrijf (blokkeren|deblokkeren)/i,
  /\/superadmin/i,
]

// Prijzen die NIET kloppen maar wel in oude documentatie voorkwamen. Belanden ze
// alsnog in de bundel, dan gaat Boss ze een klant vertellen — en dat is het soort
// fout waar je pas achter komt als iemand zich erop beroept.
const FOUTE_PRIJZEN = [
  /\bVakman\b/,
  /\bOnderneming\b/,
  /€\s?19\b/,
  /€\s?79\b/,
]
const lek = kennis.split('\n').filter(r => VERDACHT.some(p => p.test(r)))
const prijslek = kennis.split('\n').filter(r => FOUTE_PRIJZEN.some(p => p.test(r)))
if (lek.length > 0) {
  console.error('\nAFGEBROKEN — het beheerportaal staat nog in de gebundelde kennis:')
  lek.slice(0, 5).forEach(r => console.error(`  ${r.trim().slice(0, 100)}`))
  console.error('\nPas scrubSuperadmin() aan of herformuleer de regel; er is niets weggeschreven.')
  process.exit(1)
}
if (prijslek.length > 0) {
  console.error('\nAFGEBROKEN — er staan achterhaalde prijzen of pakketnamen in de kennis:')
  prijslek.slice(0, 5).forEach(r => console.error(`  ${r.trim().slice(0, 100)}`))
  console.error('\nDe geldende prijzen staan in abonnementen.md; er is niets weggeschreven.')
  process.exit(1)
}
const streepjes = (kennis.match(/[—–]/g) || []).length
if (streepjes > 0) {
  console.error(`\nAFGEBROKEN - er staan nog ${streepjes} gedachtestreepjes in de kennis.`)
  process.exit(1)
}
console.error(`  = beheerportaal: ${totaalGeknipt} regel(s) weg, controle schoon`)
const nietBeschikbaar = (kennis.match(/\bAFAS\b|Google Agenda|Google Calendar/gi) || []).length
if (nietBeschikbaar > 0) {
  console.error(`\nAFGEBROKEN - er staan nog ${nietBeschikbaar} verwijzingen naar niet-beschikbare koppelingen in de kennis.`)
  process.exit(1)
}
console.error('  = gedachtestreepjes: geen in de kennis')
const routes = (kennis.match(/\/dashboard\//g) || []).length
if (routes > 0) {
  console.error(`\nAFGEBROKEN - er staan nog ${routes} interne routes in de kennis.`)
  process.exit(1)
}
console.error('  = koppelingen: AFAS en Google Agenda niet in de kennis')
console.error('  = routes: geen interne paden in de kennis')
console.error('  = prijzen: geen achterhaalde bedragen of pakketnamen gevonden')
const geschat = Math.round((prompt.length + kennis.length) / 3.6)

const bestand = `// GEGENEREERD — niet met de hand bewerken.
//
//   node scripts/gen-boss-kennis.mjs
//
// Bron: ${KENNIS_MAP}/ (${bestanden.length} kennisbestanden + de systeemprompt).
// De super-admin-sectie is er bewust uit geknipt; zie het script voor de reden.
//
// Omvang: ongeveer ${geschat.toLocaleString('nl-NL')} tokens. Die gaan als
// gecachte systeemprompt mee, dus je betaalt ze niet bij elk bericht opnieuw.

export const BOSS_INSTRUCTIE = ${JSON.stringify(prompt.trim())}

export const BOSS_KENNIS = ${JSON.stringify(kennis.trim())}

export const BOSS_KENNIS_BESTANDEN = ${JSON.stringify(bestanden)}
`

mkdirSync(dirname(UIT), { recursive: true })
writeFileSync(UIT, bestand)

console.error(`
Geschreven naar ${UIT}
  ${bestanden.length} kennisbestanden, ongeveer ${geschat.toLocaleString('nl-NL')} tokens.

Vergeet niet:  supabase functions deploy boss-chat
`)
