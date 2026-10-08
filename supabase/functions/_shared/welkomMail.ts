// Bevestiging aan de klant dat zijn abonnement actief is.
//
// Eén mail, precies één keer per abonnement — bb_claim_welkomstmail() bewaakt
// dat, want customer.subscription.updated komt bij élke wijziging langs.
//
// Dit is een mail VAN BossBase AAN onze klant: BossBase-branding en -afzender,
// niet de huisstijl van het bedrijf zoals bij offerte- en factuurmails.
//
// Toon: bevestigend en praktisch. De klant heeft net betaald en wil twee dingen
// weten — klopt wat ik heb afgenomen, en wat kost het. Geen verkooppraat meer;
// hij is al klant.
import { bossbaseMail, bbHandtekening, bbKnop, bbKlein, bbP, bbUitgelicht, BB } from './bossbaseMail.ts'

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const euro = (n: number) => `€ ${Number(n || 0).toFixed(2).replace('.', ',')}`

const datumNL = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export type WelkomGegevens = {
  bedrijfsnaam?: string | null
  tierLabel: string
  tierPrijs: number
  extraGebruikers: number
  // Bij Team zit er geen gebruiker in de pakketprijs: dan is elke gebruiker
  // betaald en heet de regel "gebruikers", niet "extra gebruikers".
  inbegrepenGebruikers: number
  extraGebruikerPrijs: number
  modules: { label: string; prijs: number }[]
  interval: string | null
  verlengtOp?: string | null
  verplichtingTot?: string | null
  welkomstactieLabel?: string | null
  kortingMaanden: number
  appUrl: string
}

export function welkomMail(g: WelkomGegevens) {
  const regels: { wat: string; bedrag: number }[] = [
    { wat: `BossBase ${g.tierLabel}`, bedrag: g.tierPrijs },
  ]
  if (g.extraGebruikers > 0) {
    regels.push({
      wat: `${g.extraGebruikers}${g.inbegrepenGebruikers > 0 ? ' extra' : ''} gebruiker${g.extraGebruikers === 1 ? '' : 's'}`,
      bedrag: g.extraGebruikers * g.extraGebruikerPrijs,
    })
  }
  for (const m of g.modules) regels.push({ wat: m.label, bedrag: m.prijs })

  const totaal = regels.reduce((s, r) => s + r.bedrag, 0)

  // Overzicht van wat er is afgenomen, als nette tabel met het totaal op zwart.
  const cel = 'padding:12px 16px;font-size:15px;line-height:1.4;border-top:1px solid #e5e7eb;'
  const overzicht = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border:1px solid #e5e7eb;border-radius:14px;border-collapse:separate;border-spacing:0;">
    <tr>
      <td colspan="2" bgcolor="${BB.vlak}" style="padding:12px 16px;background:${BB.vlak};border-radius:13px 13px 0 0;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BB.grijs};">Wat je hebt afgenomen</td>
    </tr>
    ${regels.map(r => `
    <tr>
      <td style="${cel}color:${BB.zwart};font-weight:600;">${esc(r.wat)}</td>
      <td align="right" style="${cel}color:${BB.zwart};white-space:nowrap;">${euro(r.bedrag)}</td>
    </tr>`).join('')}
    <tr>
      <td bgcolor="${BB.zwart}" style="padding:14px 16px;background:${BB.zwart};border-radius:0 0 0 13px;font-size:15px;font-weight:700;color:#ffffff;">Per maand</td>
      <td align="right" bgcolor="${BB.zwart}" style="padding:14px 16px;background:${BB.zwart};border-radius:0 0 13px 0;font-size:17px;font-weight:800;color:${BB.groen};white-space:nowrap;">${euro(totaal)}</td>
    </tr>
  </table>
  ${bbKlein('Bedragen zijn exclusief btw.')}`

  // De welkomstactie verdient een eigen blok. Wie twee maanden gratis heeft,
  // ziet straks € 0,00 op zijn eerste facturen — zonder uitleg lijkt dat een
  // fout, en dat levert precies het supportgesprek op dat we niet willen.
  const actieHtml = g.welkomstactieLabel
    ? bbUitgelicht(
        'Welkomstactie',
        esc(g.welkomstactieLabel),
        g.kortingMaanden > 0
          ? `Je eerste ${g.kortingMaanden} facturen staan op ${euro(0)}. Daarna betaal je het bedrag hierboven.`
          : 'We nemen contact met je op over je website. Je hoeft zelf niets te doen.',
      )
    : ''

  const looptijdHtml = g.interval === 'jaar' && g.verplichtingTot
    ? bbP(`Je hebt een jaarabonnement: 12 maanden vast, tot en met <strong style="color:${BB.zwart};">${esc(datumNL(g.verplichtingTot))}</strong>. Daarna loopt het maandelijks door en kun je per maand opzeggen.`)
    : g.verlengtOp
      ? bbP(`Je abonnement is maandelijks opzegbaar. De volgende incasso is op <strong style="color:${BB.zwart};">${esc(datumNL(g.verlengtOp))}</strong>.`)
      : ''

  const subject = `Je BossBase ${g.tierLabel}-abonnement is actief`
  const inhoud =
    bbP(g.bedrijfsnaam ? `Hoi ${esc(g.bedrijfsnaam)},` : 'Hoi,') +
    bbP('Je abonnement is actief. Alles staat voor je open: je kunt meteen verder waar je gebleven was.') +
    overzicht +
    actieHtml +
    looptijdHtml +
    bbP('Je facturen, betaalmethode en abonnement vind je terug bij Instellingen → Abonnement.') +
    bbKnop('Naar je abonnement', `${g.appUrl}/dashboard/instellingen?tab=abonnement`) +
    // Van Niels, met handtekening: net als bij de proefperiodemails is dit het
    // moment waarop iemand klant wordt, en dan hoort er een mens bij.
    bbHandtekening({ titel: 'Vragen?', tekst: 'Antwoord gewoon op deze mail of bel me. Ik help je graag op weg.' })

  return {
    subject,
    html: bossbaseMail({
      titel: subject,
      label: { tekst: 'Abonnement actief' },
      bovenkop: `BossBase ${esc(g.tierLabel)}`,
      kop: 'Je abonnement is actief',
      voorvertoning: `BossBase ${g.tierLabel} — ${euro(totaal)} per maand, excl. btw`,
      inhoud,
      reden: 'Je ontvangt deze mail omdat je een BossBase-abonnement hebt afgesloten.',
    }),
  }
}
