// De twee mails rond een melding uit het meldpunt: één naar ons met alles wat
// we nodig hebben om hem op te pakken, één naar de melder als bevestiging.
//
// De interne mail is werkpost, net als bossDoorzetMail: geen wervende taal,
// alleen de feiten. Het onderwerp begint met [BUG] of [IDEE] zodat een
// inboxfilter ze uit elkaar kan houden.
import { mailTemplate } from './mailTemplate.ts'

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export type Melding = {
  nummer: number
  soort: 'bug' | 'idee'
  omschrijving: string
  bedrijfNaam: string | null
  companyId: string | null
  gebruikerNaam: string | null
  gebruikerEmail: string | null
  gebruikerRol: string | null
  abonnement: string | null
  pagina: string | null
  paginaUrl: string | null
  browser: string | null
  userAgent: string | null
  scherm: string | null
  screenshot: boolean
  actieDeelname: boolean
}

const SOORT = {
  bug:  { tag: '[BUG]',  woord: 'Bug',  lidwoord: 'je bugmelding' },
  idee: { tag: '[IDEE]', woord: 'Idee', lidwoord: 'je idee' },
}

// Eerste regel van de omschrijving, ingekort: genoeg om in de inbox te zien waar
// het over gaat.
const kort = (s: string, n = 80) => {
  const eerste = String(s || '').split('\n').find(r => r.trim()) || ''
  const plat = eerste.replace(/\s+/g, ' ').trim()
  return plat.length > n ? plat.slice(0, n - 1).trimEnd() + '…' : plat
}

export function internMeldingMail(m: Melding) {
  const s = SOORT[m.soort]
  const regel = (label: string, waarde: string | null, html = false) => `
    <tr>
      <td style="padding:4px 14px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(label)}</td>
      <td style="padding:4px 0;color:#111827;word-break:break-word">${html ? (waarde || '—') : esc(waarde || '—')}</td>
    </tr>`

  const gebruiker = [m.gebruikerNaam, m.gebruikerEmail].filter(Boolean).join(' · ')
  const pagina = m.paginaUrl
    ? `${esc(m.pagina || '')}${m.pagina ? '<br>' : ''}<span style="color:#6b7280;font-size:12px">${esc(m.paginaUrl)}</span>`
    : esc(m.pagina || '—')
  const browser = `${esc(m.browser || '—')}${m.scherm ? ` · ${esc(m.scherm)}` : ''}`
    + (m.userAgent ? `<br><span style="color:#9ca3af;font-size:11px">${esc(m.userAgent)}</span>` : '')

  const body = `
    <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">
      ${esc(s.woord)} · melding ${m.nummer}
    </p>
    <div style="margin:0 0 20px 0;padding:14px 16px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb;font-size:15px;color:#111827;white-space:pre-wrap;line-height:1.55">${esc(m.omschrijving)}</div>

    <table role="presentation" style="border-collapse:collapse;margin:0 0 8px 0;font-size:14px;width:100%">
      ${regel('Bedrijf', m.bedrijfNaam)}
      ${regel('Gebruiker', gebruiker || null)}
      ${regel('Rol', m.gebruikerRol)}
      ${regel('Abonnement', m.abonnement)}
      ${regel('Pagina', pagina, true)}
      ${regel('Browser', browser, true)}
      ${regel('Schermafbeelding', m.screenshot ? 'bijgevoegd' : 'geen')}
      ${regel('Doet mee aan actie', m.actieDeelname ? 'ja' : 'nee')}
      ${regel('Bedrijfs-id', m.companyId ? `<code>${esc(m.companyId)}</code>` : null, true)}
    </table>
    <p style="margin:14px 0 0 0;color:#6b7280;font-size:13px">
      Antwoorden gaat rechtstreeks naar de melder. De melding staat ook in het super-admin portaal onder Meldingen.
    </p>`

  const onderwerpTekst = kort(m.omschrijving) || s.woord
  return {
    subject: `${s.tag} ${onderwerpTekst}${m.bedrijfNaam ? ` · ${m.bedrijfNaam}` : ''}`,
    html: mailTemplate({
      title: `${s.woord} gemeld`,
      preheader: `${m.bedrijfNaam ?? 'Onbekend bedrijf'}: ${onderwerpTekst}`,
      body,
      footerText: 'Automatisch verstuurd vanuit het meldpunt in het portaal.',
    }),
  }
}

export function bevestigingMail(m: Melding, prijzen: string[] | null) {
  const s = SOORT[m.soort]
  const voornaam = (m.gebruikerNaam || '').trim().split(/\s+/)[0]

  const actieHtml = prijzen && prijzen.length ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:0 0 16px 0">
      <p style="margin:0 0 6px 0"><strong>Je doet mee aan de actie</strong></p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#374151">Met deze melding maak je kans op:</p>
      <ul style="margin:0;padding-left:20px;font-size:14px;color:#374151">
        ${prijzen.map(p => `<li>${esc(p)}</li>`).join('')}
      </ul>
    </div>` : ''

  const body = `
    <p style="margin:0 0 14px 0">Hallo${voornaam ? ` ${esc(voornaam)}` : ''},</p>
    <p style="margin:0 0 16px 0">
      Bedankt! We hebben ${esc(s.lidwoord)} ontvangen, onder nummer <strong>${m.nummer}</strong>.
      We lezen elke melding en nemen contact met je op als we iets van je nodig hebben.
    </p>

    <p style="margin:0 0 6px 0;font-size:13px;color:#6b7280">Wat je ons stuurde:</p>
    <div style="margin:0 0 18px 0;padding:12px 14px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;color:#374151;white-space:pre-wrap;line-height:1.5">${esc(m.omschrijving)}</div>

    ${actieHtml}

    <p style="margin:0 0 16px 0">
      Wil je nog iets toevoegen, bijvoorbeeld een extra schermafbeelding? Antwoord dan gewoon op deze mail.
    </p>
    <p style="margin:0">Met vriendelijke groet,<br>Het team van BossBase</p>`

  return {
    subject: `We hebben ${s.lidwoord} ontvangen (melding ${m.nummer})`,
    html: mailTemplate({
      title: 'Melding ontvangen',
      preheader: `Bedankt, ${s.lidwoord} is bij ons binnengekomen.`,
      body,
      companyName: 'BossBase',
      footerText: 'Je ontvangt deze mail omdat je een melding hebt gedaan via het meldpunt in BossBase.',
    }),
  }
}
