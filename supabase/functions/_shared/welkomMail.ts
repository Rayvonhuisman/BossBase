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
import { mailTemplate } from './mailTemplate.ts'

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
      wat: `${g.extraGebruikers} extra gebruiker${g.extraGebruikers === 1 ? '' : 's'}`,
      bedrag: g.extraGebruikers * g.extraGebruikerPrijs,
    })
  }
  for (const m of g.modules) regels.push({ wat: m.label, bedrag: m.prijs })

  const totaal = regels.reduce((s, r) => s + r.bedrag, 0)

  const regelsHtml = regels.map(r => `
    <tr>
      <td style="padding:5px 14px 5px 0;color:#374151">${esc(r.wat)}</td>
      <td style="padding:5px 0;text-align:right;color:#374151;white-space:nowrap">${euro(r.bedrag)}</td>
    </tr>`).join('')

  // De welkomstactie verdient een eigen alinea. Wie twee maanden gratis heeft,
  // ziet straks € 0,00 op zijn eerste facturen — zonder uitleg lijkt dat een
  // fout, en dat levert precies het supportgesprek op dat we niet willen.
  const actieHtml = g.welkomstactieLabel ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 14px;margin:0 0 18px 0">
      <p style="margin:0;font-size:14px;color:#166534"><strong>Welkomstactie: ${esc(g.welkomstactieLabel)}</strong></p>
      ${g.kortingMaanden > 0 ? `
      <p style="margin:6px 0 0 0;font-size:13px;color:#166534">
        Je eerste ${g.kortingMaanden} facturen staan op ${euro(0)}. Daarna betaal je het bedrag hierboven.
      </p>` : `
      <p style="margin:6px 0 0 0;font-size:13px;color:#166534">
        We nemen contact met je op over je website. Je hoeft zelf niets te doen.
      </p>`}
    </div>` : ''

  const looptijdHtml = g.interval === 'jaar' && g.verplichtingTot ? `
    <p style="margin:0 0 16px 0;font-size:14px;color:#374151">
      Je hebt een jaarabonnement: 12 maanden vast, tot en met
      <strong>${esc(datumNL(g.verplichtingTot))}</strong>. Daarna loopt het maandelijks
      door en kun je per maand opzeggen.
    </p>` : g.verlengtOp ? `
    <p style="margin:0 0 16px 0;font-size:14px;color:#374151">
      Je abonnement is maandelijks opzegbaar. De volgende incasso is op
      <strong>${esc(datumNL(g.verlengtOp))}</strong>.
    </p>` : ''

  const body = `
    <p style="margin:0 0 14px 0;font-size:15px;color:#111827">
      ${g.bedrijfsnaam ? `Hoi ${esc(g.bedrijfsnaam)},` : 'Hoi,'}
    </p>
    <p style="margin:0 0 18px 0;font-size:15px;color:#374151">
      Je abonnement is actief. Alles staat voor je open — je kunt meteen verder waar je gebleven was.
    </p>

    ${actieHtml}

    <p style="margin:0 0 6px 0;font-size:14px"><strong>Wat je hebt afgenomen</strong></p>
    <table role="presentation" style="border-collapse:collapse;margin:0 0 4px 0;font-size:14px;width:100%;max-width:360px">
      ${regelsHtml}
      <tr>
        <td style="padding:9px 14px 0 0;border-top:1px solid #e5e7eb;font-weight:700;color:#111827">Per maand</td>
        <td style="padding:9px 0 0 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;color:#111827;white-space:nowrap">${euro(totaal)}</td>
      </tr>
    </table>
    <p style="margin:0 0 18px 0;font-size:12px;color:#6b7280">Bedragen zijn exclusief btw.</p>

    ${looptijdHtml}

    <p style="margin:0 0 4px 0;font-size:14px;color:#374151">
      Je facturen, betaalmethode en abonnement vind je terug bij Instellingen → Abonnement.
    </p>
    <p style="margin:0;font-size:14px;color:#374151">
      Vragen? Antwoord gewoon op deze mail.
    </p>`

  return {
    subject: `Je BossBase ${g.tierLabel}-abonnement is actief`,
    html: mailTemplate({
      title: 'Je abonnement is actief',
      preheader: `BossBase ${g.tierLabel} — ${euro(totaal)} per maand, excl. btw`,
      body,
      buttonText: 'Naar je abonnement',
      buttonUrl: `${g.appUrl}/dashboard/instellingen?tab=abonnement`,
      footerText: 'Je ontvangt deze mail omdat je een BossBase-abonnement hebt afgesloten.',
    }),
  }
}
