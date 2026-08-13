// De mail die Boss naar het team stuurt als hij een vraag doorzet.
//
// Dit is INTERNE post: van het systeem naar onszelf. Dus geen klantbranding,
// geen knop, geen wervende taal — alleen wat je nodig hebt om de klant terug te
// bellen zonder eerst te moeten uitzoeken wie hij is.
//
// Het volledige gesprek gaat mee. Dat lijkt veel, maar juist de aanloop vertelt
// wat iemand al geprobeerd heeft; alleen de samenvatting laat je de helft raden.
import { mailTemplate } from './mailTemplate.ts'

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export type DoorzetGegevens = {
  samenvatting: string
  reden: string
  naam: string | null
  email: string | null
  bedrijfsnaam: string | null
  gesprek: { rol: string; tekst: string }[]
}

export function doorzetMail(g: DoorzetGegevens) {
  const regel = (label: string, waarde: string | null) => `
    <tr>
      <td style="padding:4px 14px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(label)}</td>
      <td style="padding:4px 0;color:#111827">${esc(waarde || '—')}</td>
    </tr>`

  const gesprekHtml = (g.gesprek || []).map(m => {
    const isBoss = m.rol === 'boss'
    return `
    <div style="margin:0 0 10px 0;padding:10px 12px;border-radius:8px;background:${isBoss ? '#f3f4f6' : '#ffffff'};border:1px solid #e5e7eb">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">
        ${isBoss ? 'Boss' : 'Gebruiker'}
      </div>
      <div style="font-size:14px;color:#111827;white-space:pre-wrap;line-height:1.55">${esc(m.tekst)}</div>
    </div>`
  }).join('')

  const body = `
    <p style="margin:0 0 16px 0;font-size:15px;color:#111827">
      Boss kon deze vraag niet zelf beantwoorden en heeft hem doorgezet.
    </p>

    <table role="presentation" style="border-collapse:collapse;margin:0 0 18px 0;font-size:14px;width:100%">
      ${regel('Vraag', g.samenvatting)}
      ${regel('Reden', g.reden)}
      ${regel('Naam', g.naam)}
      ${regel('E-mail', g.email)}
      ${regel('Bedrijf', g.bedrijfsnaam)}
    </table>

    <p style="margin:0 0 8px 0;font-size:14px"><strong>Het gesprek</strong></p>
    ${gesprekHtml || '<p style="font-size:14px;color:#6b7280">Geen gespreksgeschiedenis meegekomen.</p>'}`

  // De samenvatting in het onderwerp, zodat je in de inbox al ziet waar het over
  // gaat. Afgekapt, want een onderwerpregel van driehonderd tekens leest niemand.
  const kort = String(g.samenvatting || 'vraag').replace(/\s+/g, ' ').trim().slice(0, 90)

  return {
    subject: `Boss zet door: ${kort}`,
    html: mailTemplate({
      title: 'Vraag doorgezet door Boss',
      preheader: `${kort} — ${g.reden}`,
      body,
      footerText: 'Automatisch verstuurd vanuit de helpagent in het portaal.',
    }),
  }
}
