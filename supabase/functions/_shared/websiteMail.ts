// De twee mails rond een gratis-website-aanvraag: één naar de klant om de
// ontbrekende gegevens uit te vragen, één naar onszelf zodat we weten dat er
// iets ligt.
//
// Dit zijn mails VAN BossBase AAN onze klant. Dus BossBase-branding en
// -afzender, niet de huisstijl van het bedrijf zoals bij offerte- en
// factuurmails.
import { mailTemplate } from './mailTemplate.ts'

type Bedrijf = {
  id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  postal_code?: string | null
  city?: string | null
  kvk?: string | null
  btw_number?: string | null
  website?: string | null
  logo_url?: string | null
  branding_color?: string | null
}

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Wat we al hebben vullen we vast in; alleen wat ontbreekt vragen we uit. Zo
// hoeft de klant niet opnieuw te typen wat hij bij de registratie al gaf.
function splitsGegevens(b: Bedrijf) {
  const velden: { label: string; waarde: string | null | undefined }[] = [
    { label: 'Bedrijfsnaam',   waarde: b.name },
    { label: 'E-mailadres',    waarde: b.email },
    { label: 'Telefoonnummer', waarde: b.phone },
    // Een adres telt alleen als compleet met straat én plaats. Anders zouden we
    // bij alleen een plaatsnaam denken dat we het adres al hebben en er niet meer
    // naar vragen.
    { label: 'Adres', waarde: (b.address && (b.postal_code || b.city))
        ? [b.address, [b.postal_code, b.city].filter(Boolean).join('  ')].filter(Boolean).join(', ')
        : null },
    { label: 'KvK-nummer',     waarde: b.kvk },
    { label: 'BTW-nummer',     waarde: b.btw_number },
    { label: 'Logo',           waarde: b.logo_url ? 'aangeleverd' : null },
    { label: 'Huisstijlkleur', waarde: b.branding_color },
    { label: 'Bestaande website', waarde: b.website },
  ]
  return {
    bekend:    velden.filter(v => v.waarde && String(v.waarde).trim()),
    ontbreekt: velden.filter(v => !v.waarde || !String(v.waarde).trim()),
  }
}

export function klantMail(b: Bedrijf, hostingPrijs: number) {
  const { bekend, ontbreekt } = splitsGegevens(b)

  const bekendHtml = bekend.length ? `
    <p style="margin:0 0 6px 0"><strong>Dit hebben we al van je:</strong></p>
    <table role="presentation" style="border-collapse:collapse;margin:0 0 16px 0;font-size:14px">
      ${bekend.map(v => `
        <tr>
          <td style="padding:3px 14px 3px 0;color:#6b7280">${esc(v.label)}</td>
          <td style="padding:3px 0"><strong>${esc(v.waarde)}</strong></td>
        </tr>`).join('')}
    </table>
    <p style="margin:0 0 16px 0;color:#6b7280;font-size:13px">
      Klopt er iets niet? Zet het even in je antwoord, dan passen we het aan.
    </p>` : ''

  const ontbreektHtml = ontbreekt.length ? `
    <p style="margin:0 0 6px 0"><strong>Dit missen we nog:</strong></p>
    <ul style="margin:0 0 16px 0;padding-left:20px">
      ${ontbreekt.map(v => `<li>${esc(v.label)}</li>`).join('')}
    </ul>` : ''

  const body = `
    <p style="margin:0 0 14px 0">Hallo${b.name ? ` ${esc(b.name)}` : ''},</p>
    <p style="margin:0 0 16px 0">
      Leuk dat je voor het jaarabonnement hebt gekozen. Als welkomstactie bouwen we
      eenmalig een professionele website voor je bedrijf. Om te kunnen beginnen
      hebben we een paar dingen van je nodig.
    </p>

    ${bekendHtml}
    ${ontbreektHtml}

    <p style="margin:0 0 6px 0"><strong>En verder graag:</strong></p>
    <ul style="margin:0 0 18px 0;padding-left:20px">
      <li>Een korte tekst over je bedrijf — wie je bent en wat je doet</li>
      <li>De diensten die je wilt tonen, met per dienst een paar regels uitleg</li>
      <li>Foto's van je werk (hoe meer hoe beter; hoge resolutie graag)</li>
      <li>Eventuele reviews of klantervaringen die we mogen gebruiken</li>
      <li>Je openingstijden en werkgebied</li>
    </ul>

    <p style="margin:0 0 16px 0">
      Je kunt gewoon op deze mail antwoorden en de bestanden meesturen.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:0 0 16px 0">
      <p style="margin:0 0 8px 0"><strong>Goed om te weten</strong></p>
      <ul style="margin:0;padding-left:20px;font-size:14px;color:#374151">
        <li>De website zelf is gratis bij je jaarabonnement.</li>
        <li><strong>Hosting kost € ${hostingPrijs} per maand.</strong> Daarmee draaien en
            onderhouden wij de site. Die zetten we pas aan als de website live gaat.</li>
        <li>De website blijft beschikbaar zolang je abonnement loopt.</li>
      </ul>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:0 0 16px 0">
      <p style="margin:0 0 8px 0"><strong>Optioneel, tegen meerprijs</strong></p>
      <ul style="margin:0;padding-left:20px;font-size:14px;color:#374151">
        <li><strong>Logo-ontwerp</strong> — heb je nog geen logo, of wil je een nieuwe?
            Dan ontwerpen we er een. Laat het weten, dan sturen we een prijsopgave.</li>
        <li><strong>Domeinregistratie</strong> — wij kunnen je domeinnaam regelen en
            beheren. Heb je al een domein, dan koppelen we dat gratis.</li>
      </ul>
      <p style="margin:8px 0 0 0;font-size:13px;color:#6b7280">
        Beide zijn optioneel; zonder die opties gaat de website gewoon door.
      </p>
    </div>

    <p style="margin:0">Met vriendelijke groet,<br>Het team van BossBase</p>
  `

  return {
    subject: 'Je gratis website — welke gegevens we nog nodig hebben',
    html: mailTemplate({
      title: 'Je gratis website',
      preheader: 'We hebben nog een paar gegevens van je nodig om te kunnen starten.',
      body,
      companyName: 'BossBase',
      footerText: 'Je ontvangt deze mail omdat je bij je jaarabonnement voor de gratis website hebt gekozen.',
    }),
  }
}

export function internMail(b: Bedrijf, plan: string | null) {
  const { ontbreekt } = splitsGegevens(b)
  const body = `
    <p style="margin:0 0 12px 0"><strong>Er is een gratis website aangevraagd.</strong></p>
    <table role="presentation" style="border-collapse:collapse;font-size:14px;margin:0 0 14px 0">
      <tr><td style="padding:3px 14px 3px 0;color:#6b7280">Bedrijf</td><td style="padding:3px 0"><strong>${esc(b.name)}</strong></td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#6b7280">Pakket</td><td style="padding:3px 0">${esc(plan ?? 'onbekend')}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#6b7280">E-mail</td><td style="padding:3px 0">${esc(b.email ?? '—')}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#6b7280">Telefoon</td><td style="padding:3px 0">${esc(b.phone ?? '—')}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#6b7280">Bedrijfs-id</td><td style="padding:3px 0"><code>${esc(b.id)}</code></td></tr>
    </table>
    <p style="margin:0 0 6px 0">Ontbrekende gegevens die we hebben uitgevraagd:</p>
    <ul style="margin:0 0 14px 0;padding-left:20px">
      ${ontbreekt.length ? ontbreekt.map(v => `<li>${esc(v.label)}</li>`).join('') : '<li>geen — alles was al bekend</li>'}
    </ul>
    <p style="margin:0;color:#6b7280;font-size:13px">
      De aanvraag staat op <strong>open</strong> in het super-admin portaal onder Website-aanvragen.
    </p>
  `
  return {
    subject: `Website-aanvraag: ${b.name ?? 'onbekend bedrijf'}`,
    html: mailTemplate({
      title: 'Nieuwe website-aanvraag',
      preheader: `${b.name ?? 'Een klant'} heeft de gratis website gekozen.`,
      body,
      companyName: 'BossBase',
    }),
  }
}
