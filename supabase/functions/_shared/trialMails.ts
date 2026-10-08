// De mails die de gratis proefperiode begeleiden.
//
// Dit zijn acquisitiemails: ze moeten iemand die BossBase probeert overtuigen om
// klant te worden. De opmaak (donkere kop met de resterende dagen, grote
// cijfers, één knop, handtekening met foto) komt uit bossbaseMail.ts, dezelfde
// als alle andere mail van BossBase.
//
// Van Niels, niet van "BossBase Support": een vakman die een mail van een mens
// krijgt leest hem, een systeemmail niet. Er is (nog) geen agendalink of
// demovideo, dus de uitnodiging is: antwoord op deze mail, of bel. Reply-to
// staat op info@bossbase.nl, en dat antwoord moeten we dan ook waarmaken.
//
// De cijfers zijn rekenvoorbeelden, geen metingen bij onze klanten. Zo staan ze
// er ook: "reken mee", "stel dat", "gemiddeld" over het werk, niet over BossBase.
//
// Teksten afgestemd met Niels op 2026-10-06. Wijzig ze niet zonder overleg —
// dit is de stem van het bedrijf, niet een implementatiedetail.
import {
  bossbaseMail, bbP, bbKlein, bbKop2, bbGrootCijfer, bbVergelijking, bbStappen,
  bbVinkjes, bbRekentabel, bbUitgelicht, bbBesparing, bbKnop, bbHandtekening, BB,
} from './bossbaseMail.ts'

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Afzender en antwoordadres. De naam met een pipe erin leest in de inbox als
// een persoon bij een bedrijf, wat het ook is.
export const TRIAL_AFZENDER = 'Niels | BossBase'
export const TRIAL_REPLY_TO = 'info@bossbase.nl'

// Dagnummers zijn intern; wanneer ze uitgaan staat in bb_trial_mail_kandidaten.
export const TRIAL_MAIL_NUMMERS = [3, 7, 11, 14, 15, 30] as const
export type TrialMailNummer = typeof TRIAL_MAIL_NUMMERS[number]

export type TrialMailGegevens = {
  naam: string
  trialEindigt: string | null   // ISO-datum
  appUrl: string
  afmeldUrl: string             // pagina /afmelden met ondertekende link
  // Modules die in de proef gratis geprobeerd zijn (dag 11 en 14 noemen ze).
  modules?: { label: string; prijs: number }[]
}

// Geprobeerde modules: wat ze kosten, en dat ze bij het afsluiten al aanstaan.
const geprobeerd = (modules?: { label: string; prijs: number }[]) => !modules?.length ? '' :
  bbKop2('Je probeerde ook') +
  bbVinkjes(modules.map(m => `${esc(m.label)}: € ${m.prijs} per maand`)) +
  bbP(`Wil je ${modules.length === 1 ? 'hem' : 'ze'} houden? Bij het afsluiten van je abonnement ${modules.length === 1 ? 'staat hij' : 'staan ze'} al aangevinkt. Niet nodig? Vink uit; je gegevens blijven bewaard.`)

const datumNL = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
}

const vet = (t: string) => `<strong style="color:${BB.zwart};">${t}</strong>`

// Gratis website eerst: dat is het sterkste argument, de twee maanden de terugval.
const jaarAanbod = bbUitgelicht(
  'Bij een jaarabonnement',
  'Gratis website voor je bedrijf',
  'Wij bouwen je bedrijfswebsite, helemaal gratis (bij Groei en Team). Liever geen website? Dan krijg je 2 maanden gratis.',
  'Gratis',
)

// Label en balk in de kop. `rest` = dagen dat de proef nog loopt; null = voorbij.
const kopVoor = (rest: number | null) => rest == null
  ? { label: { tekst: 'Account op pauze', kleur: '#fbbf24' }, voortgang: 100 }
  : { label: { tekst: rest === 1 ? 'Morgen laatste dag' : `Nog ${rest} dagen gratis` }, voortgang: ((14 - rest) / 14) * 100 }

type Mail = { subject: string; html: string }

export function trialMail(nummer: TrialMailNummer, g: TrialMailGegevens): Mail {
  const naam = esc(g.naam)
  const datum = esc(datumNL(g.trialEindigt))
  const dashboard = `${g.appUrl}/dashboard`
  const offertes = `${g.appUrl}/offertes`
  const abonnement = `${g.appUrl}/dashboard/instellingen?tab=abonnement`
  // Elke mail heeft een afmeldlink: verplicht voor mail met een aanbod aan
  // eigen klanten zonder toestemming (art. 11.7 lid 3 Telecommunicatiewet).
  const mail = (subject: string, o: { rest: number | null; voorvertoning: string; bovenkop: string; kop: string; inhoud: string }): Mail => ({
    subject,
    html: bossbaseMail({
      titel: subject,
      voorvertoning: o.voorvertoning,
      bovenkop: o.bovenkop,
      kop: o.kop,
      inhoud: o.inhoud,
      ...kopVoor(o.rest),
      reden: 'Je krijgt deze mail omdat je BossBase gratis probeert.',
      afmeldUrl: g.afmeldUrl,
    }),
  })

  switch (nummer) {
    // ── DAG 3 · trial_ends_at − 11 ───────────────────────────────────────────
    case 3: return mail('Je eerste offerte staat in 5 minuten klaar', {
      rest: 11,
      voorvertoning: 'Van 45 minuten in Word naar 5 minuten in BossBase. Zo doe je dat.',
      bovenkop: 'Dag 3 &middot; Je eerste offerte',
      kop: 'Van 45 minuten naar 5 minuten per offerte',
      inhoud:
        bbP(`Hoi ${naam},`) +
        bbP('Een offerte in Word of Excel kost gemiddeld 30 tot 45 minuten. Prijzen opzoeken, regels overtypen, een PDF maken, mailen. En daarna afwachten of je klant hem heeft gezien.') +
        bbVergelijking(['Word of Excel', '45 min'], ['BossBase', '5 min'], 'per offerte') +
        bbP(`Maak je 15 offertes per maand, dan krijg je daarmee ${vet('ruim 10 uur')} terug. Elke maand.`) +
        bbKop2('Zo doe je het') +
        bbStappen([
          { kop: 'Kies je klant', tekst: 'Of zet hem er in een paar tellen bij.' },
          { kop: 'Zet je regels erin', tekst: 'Btw en totaal rekent BossBase uit.' },
          { kop: 'Verstuur hem', tekst: 'Je klant tekent online. Eén klik en het is een factuur.' },
        ]) +
        bbKnop('Maak je eerste offerte', offertes) +
        bbKlein('Tip: stuur je eerste offerte naar jezelf. Dan zie je precies wat je klant ziet.') +
        bbHandtekening({ titel: 'Ergens vastgelopen?', tekst: 'Antwoord gewoon op deze mail met je vraag. Ik lees alles zelf en help je verder.' }),
    })

    // ── DAG 7 · trial_ends_at − 7 ────────────────────────────────────────────
    case 7: return mail('25 uur per maand terug. Reken even mee.', {
      rest: 7,
      voorvertoning: 'Een week BossBase. Tijd om uit te rekenen wat het je oplevert.',
      bovenkop: 'Dag 7 &middot; Wat het je oplevert',
      kop: 'Zoveel tijd krijg je elke maand terug',
      inhoud:
        bbP(`Hoi ${naam},`) +
        bbP('Je bent nu een week met BossBase bezig. Tijd om eens te rekenen. Stel: je hebt een bedrijf met een paar man, en per maand doe je ongeveer dit.') +
        bbRekentabel(['Per maand', 'Nu', 'BossBase', 'Terug'], [
          ['20 offertes', '40 min', '5 min', '11,5 uur'],
          ['20 facturen', '20 min', '2 min', '6 uur'],
          ['40 werkbonnen', '15 min', '5 min', '6,5 uur'],
          ['Betalingen nabellen', '2 uur', '1 klik', '1,5 uur'],
        ], ['Samen', '± 25 uur']) +
        bbBesparing({
          bovenkop: 'Wat het je oplevert',
          bedrag: '€&nbsp;1.250',
          onder: 'bespaard, elke maand',
          feiten: [
            ['25 uur × € 50', 'je eigen tijd, terug per maand'],
            ['vanaf € 39', 'kost BossBase per maand'],
          ],
        }) +
        bbP('En dan tellen we het zoeken naar die ene bon, het overtypen naar je boekhouding en de avonden achter de laptop nog niet eens mee.') +
        bbKnop('Ga verder waar je was', dashboard) +
        bbHandtekening({ titel: 'Zullen we even kennismaken?', tekst: 'Antwoord op deze mail met een dag en tijd die je uitkomt, dan bel ik je. Een kwartiertje: ik kijk met je mee hoe je BossBase het beste inricht voor jouw bedrijf.' }),
    })

    // ── DAG 11 · trial_ends_at − 3 ───────────────────────────────────────────
    case 11: return mail('Nog 3 dagen gratis. Dit blijft van jou.', {
      rest: 3,
      voorvertoning: `Je proefperiode loopt tot ${datumNL(g.trialEindigt)}. Je gegevens blijven altijd bewaard.`,
      bovenkop: `Nog 3 dagen &middot; tot ${datum}`,
      kop: 'Je proefperiode loopt bijna af',
      inhoud:
        bbP(`Hoi ${naam},`) +
        bbP(`Je proefperiode loopt nog 3 dagen, tot ${datum}. Daarna gaat je account op pauze: je kunt alles nog bekijken, maar niets nieuws meer aanmaken of versturen.`) +
        bbKop2('Dit blijft altijd bewaard') +
        bbVinkjes([
          'Je klanten, offertes en facturen',
          'Je werkbonnen, uren en notities',
          'Je instellingen, huisstijl en artikelen',
        ]) +
        bbKop2('Met een abonnement werk je gewoon door') +
        bbVinkjes([
          'Offertes en facturen versturen en laten tekenen',
          'Klussen, werkbonnen en uren bijhouden',
          'Je team erbij, ieder met eigen rechten',
        ]) +
        geprobeerd(g.modules) +
        jaarAanbod +
        bbKnop('Kies je abonnement', abonnement) +
        bbHandtekening({ titel: 'Twijfel je nog?', tekst: 'Welk pakket past bij jou, of kan BossBase iets wat je nodig hebt? Antwoord op deze mail of bel me, dan zoeken we het samen uit.' }),
    })

    // ── DAG 14 · trial_ends_at − 1 ───────────────────────────────────────────
    case 14: return mail('Morgen stopt je proefperiode', {
      rest: 1,
      voorvertoning: 'Kies vandaag je abonnement, dan werk je morgen gewoon door.',
      bovenkop: 'Laatste dag',
      kop: 'Morgen stopt je proefperiode',
      inhoud:
        bbP(`Hoi ${naam},`) +
        bbP('Morgen loopt je proefperiode af.') +
        bbP('Vanaf dan kun je je gegevens nog bekijken en exporteren, maar geen nieuwe offertes, facturen of klussen meer aanmaken. Zodra je een abonnement kiest, staat alles meteen weer open, precies zoals je het achterliet.') +
        geprobeerd(g.modules) +
        jaarAanbod +
        bbKnop('Kies je abonnement', abonnement) +
        bbHandtekening({ titel: 'Nog een vraag voordat je kiest?', tekst: 'Antwoord op deze mail of bel me. Dan heb je vandaag nog antwoord.' }),
    })

    // ── DAG 15 · trial_ends_at + 1 ───────────────────────────────────────────
    case 15: return mail('Je account staat op pauze', {
      rest: null,
      voorvertoning: 'Alles wat je hebt opgebouwd blijft staan.',
      bovenkop: 'Proefperiode afgelopen',
      kop: 'Je account staat op pauze',
      inhoud:
        bbP(`Hoi ${naam},`) +
        bbP('Je proefperiode is afgelopen. Je account staat nu op pauze: je kunt alles nog bekijken en exporteren, maar niet meer aanpassen.') +
        bbGrootCijfer('Niets kwijt', 'Alles wat je hebt opgebouwd blijft staan. Kies een abonnement en je werkt direct verder waar je gebleven was.') +
        bbKnop('Abonnement kiezen', abonnement) +
        bbHandtekening({ titel: 'Liever eerst even sparren?', tekst: 'Welk pakket past bij jouw bedrijf? Antwoord op deze mail of bel me, dan denken we mee.' }),
    })

    // ── DAG 30 · trial_ends_at + 15 ──────────────────────────────────────────
    case 30: return mail('Je gegevens staan er nog', {
      rest: null,
      voorvertoning: 'Alles wat je hebt opgebouwd staat er nog precies zo bij.',
      bovenkop: 'Twee weken later',
      kop: 'Je gegevens staan er nog',
      inhoud:
        bbP(`Hoi ${naam},`) +
        bbP('Het is twee weken geleden dat je proefperiode afliep. Je account staat nog steeds op pauze, en alles wat je hebt opgebouwd staat er nog precies zo bij.') +
        bbP('Misschien was het even te druk, of paste het toen niet. Beide prima. Mocht je het alsnog willen proberen: één klik en je werkt weer verder.') +
        bbKnop('Abonnement kiezen', abonnement) +
        bbHandtekening({ titel: 'Past BossBase toch niet bij je?', tekst: 'Laat het gerust weten. Antwoord op deze mail, ook als het maar één zin is. We horen graag waarom, dan kunnen we het beter maken.' }),
    })
  }
}
