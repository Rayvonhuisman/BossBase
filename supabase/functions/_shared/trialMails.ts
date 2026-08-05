// De vijf mails die de gratis proefperiode begeleiden.
//
// Van BossBase aan onze klant, ondertekend met Niels. Dat is bewust persoonlijk:
// een ambachtelijke ondernemer die een mail krijgt van "BossBase Support" leest
// een systeem, en een mail van Niels leest een mens. Vandaar ook "antwoord
// gewoon op deze mail" in vier van de vijf — dat is een uitnodiging die we waar
// moeten maken, dus reply-to staat op info@bossbase.nl.
//
// Toon: rustig en zakelijk. Geen uitroeptekens, geen kortingsdruk, geen
// "laatste kans". Wie na dertig dagen niets heeft gedaan is geen prooi maar
// iemand voor wie het even niet uitkwam.
//
// De teksten staan hier letterlijk zoals afgesproken; alleen [naam] en [datum]
// worden ingevuld. Wijzig ze niet zonder overleg — dit is de stem van het
// bedrijf, niet een implementatiedetail.
import { mailTemplate, mailButton } from './mailTemplate.ts'

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Afzender en antwoordadres. De naam met een pipe erin leest in de inbox als
// een persoon bij een bedrijf, wat het ook is.
export const TRIAL_AFZENDER = 'Niels | BossBase'
export const TRIAL_REPLY_TO = 'info@bossbase.nl'

export const TRIAL_MAIL_NUMMERS = [7, 11, 14, 15, 30] as const
export type TrialMailNummer = typeof TRIAL_MAIL_NUMMERS[number]

export type TrialMailGegevens = {
  naam: string
  trialEindigt: string | null   // ISO-datum
  appUrl: string
}

const datumNL = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Alinea met de standaardafstand van de template.
const p = (inhoud: string) => `<p style="margin:0 0 14px;">${inhoud}</p>`

// De ondertekening. Los gehouden zodat hij in alle vijf identiek is.
const ondertekening = `<p style="margin:24px 0 0;">Niels</p>`

// De knop zit in de BODY, niet in de buttonText/buttonUrl van de template.
// Reden: in alle vijf de teksten komt na de knop nog een zin, en daaronder pas
// de ondertekening. Zou de template de knop plaatsen, dan belandt hij altijd
// onderaan en klopt de volgorde niet meer met wat er is afgesproken.
const knop = (tekst: string, url: string) =>
  `<div style="margin:26px 0 4px;">${mailButton(tekst, url)}</div>`

// Afsluitende zin ná de knop: gewone tekst, geen kleine lettertjes. Het is
// onderdeel van wat Niels zegt, niet een voetnoot.
const naKnop = (inhoud: string) => `<p style="margin:18px 0 0;">${inhoud}</p>`

// Lijstje zonder bolletjes-uit-de-doos: een middenpunt met wat lucht eromheen
// leest rustiger in mail dan een <ul>, en gedraagt zich voorspelbaarder in
// Outlook.
const puntenlijst = (regels: string[]) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
    ${regels.map(r => `
    <tr>
      <td style="padding:3px 8px 3px 0;color:#1DDB62;font-size:15px;line-height:1.6;vertical-align:top;">&middot;</td>
      <td style="padding:3px 0;font-size:15px;color:#374151;line-height:1.6;">${r}</td>
    </tr>`).join('')}
  </table>`

type Mail = { subject: string; html: string }

export function trialMail(nummer: TrialMailNummer, g: TrialMailGegevens): Mail {
  const naam = esc(g.naam)
  const datum = esc(datumNL(g.trialEindigt))
  const dashboard = `${g.appUrl}/dashboard`
  const abonnement = `${g.appUrl}/dashboard/instellingen?tab=abonnement`

  switch (nummer) {
    // ── DAG 7 ────────────────────────────────────────────────────────────────
    case 7: return {
      subject: 'Hoe bevalt BossBase tot nu toe?',
      html: mailTemplate({
        title: 'Hoe bevalt BossBase tot nu toe?',
        preheader: 'Je bent nu een week met BossBase bezig — hoe gaat het?',
        body:
          p(`Hoi ${naam},`) +
          p('Je bent nu een week met BossBase bezig. Ik ben benieuwd hoe het gaat.') +
          p('Loop je ergens tegenaan, of mis je iets? Antwoord gewoon op deze mail — we lezen alles zelf.') +
          p('Nog niet alles geprobeerd? Deze drie dingen leveren de meeste tijdwinst op:') +
          puntenlijst([
            'Je eerste offerte maken en versturen',
            'Een klus inplannen in je agenda',
            'Een factuur sturen vanuit een getekende offerte',
          ]) +
          knop('Naar je dashboard', dashboard) +
          ondertekening,
      }),
    }

    // ── DAG 11 ───────────────────────────────────────────────────────────────
    case 11: return {
      subject: 'Nog 3 dagen gratis proberen',
      html: mailTemplate({
        title: 'Nog 3 dagen gratis proberen',
        preheader: `Je proefperiode loopt tot ${datumNL(g.trialEindigt)}.`,
        body:
          p(`Hoi ${naam},`) +
          p(`Je proefperiode loopt nog 3 dagen — tot ${datum}.`) +
          p('Daarna kun je je gegevens nog gewoon inzien, maar om verder te werken heb je een abonnement nodig. Je klanten, offertes en facturen blijven hoe dan ook bewaard.') +
          knop('Kies je abonnement', abonnement) +
          naKnop('Twijfel je nog of heb je een vraag? Antwoord op deze mail.') +
          ondertekening,
      }),
    }

    // ── DAG 14 ───────────────────────────────────────────────────────────────
    case 14: return {
      subject: 'Morgen stopt je proefperiode',
      html: mailTemplate({
        title: 'Morgen stopt je proefperiode',
        preheader: 'Daarna kun je je gegevens nog bekijken en exporteren.',
        body:
          p(`Hoi ${naam},`) +
          p('Morgen loopt je proefperiode af.') +
          p('Vanaf dan kun je je gegevens nog bekijken en exporteren, maar geen nieuwe offertes, facturen of klussen meer aanmaken. Zodra je een abonnement kiest, staat alles meteen weer open — precies zoals je het achterliet.') +
          knop('Kies je abonnement', abonnement) +
          naKnop('Kies je voor een jaarabonnement, dan krijg je 2 maanden gratis óf een gratis website. Je kiest zelf.') +
          ondertekening,
      }),
    }

    // ── DAG 15 ───────────────────────────────────────────────────────────────
    case 15: return {
      subject: 'Je account staat op pauze',
      html: mailTemplate({
        title: 'Je account staat op pauze',
        preheader: 'Alles wat je hebt opgebouwd blijft staan.',
        body:
          p(`Hoi ${naam},`) +
          p('Je proefperiode is afgelopen. Je account staat nu op pauze: je kunt alles nog bekijken en exporteren, maar niet meer aanpassen.') +
          p('Alles wat je hebt opgebouwd blijft staan. Kies een abonnement en je werkt direct verder waar je gebleven was.') +
          knop('Abonnement kiezen', abonnement) +
          naKnop('Liever eerst even sparren over welk pakket bij je past? Antwoord op deze mail, dan denken we mee.') +
          ondertekening,
      }),
    }

    // ── DAG 30 ───────────────────────────────────────────────────────────────
    case 30: return {
      subject: 'Je gegevens staan er nog',
      html: mailTemplate({
        title: 'Je gegevens staan er nog',
        preheader: 'Alles wat je hebt opgebouwd staat er nog precies zo bij.',
        body:
          p(`Hoi ${naam},`) +
          p('Het is twee weken geleden dat je proefperiode afliep. Je account staat nog steeds op pauze, en alles wat je hebt opgebouwd staat er nog precies zo bij.') +
          p('Misschien was het even te druk, of paste het toen niet. Beide prima. Mocht je het alsnog willen proberen: één klik en je werkt weer verder.') +
          knop('Abonnement kiezen', abonnement) +
          naKnop('Past BossBase toch niet bij je? Laat het gerust weten — we horen graag waarom, dan kunnen we het beter maken.') +
          ondertekening,
      }),
    }
  }
}
