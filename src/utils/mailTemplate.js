// Centrale mailtemplate met twee branding-varianten:
//  - Zakelijke mail (bedrijf → klant): bedrijfslogo + bedrijfskleur, geen
//    "via BossBase". Geef companyName + logoUrl + brandColor mee.
//  - Systeemmail (BossBase → gebruiker): officieel BossBase-logo + groen.
//    companyName 'BossBase' (default) schakelt automatisch naar deze variant.
//
// Het BossBase-logo moet via een geldige publieke https-URL geladen worden
// (e-mailclients laden geen lokale assets en blokkeren data-URI's). icon-512.png
// staat in public/brand en wordt op www.bossbase.nl geserveerd (het app.-subdomein
// serveert dit asset NIET → kapot logo in e-mails).
const BOSSBASE_LOGO_URL = 'https://www.bossbase.nl/brand/icon-512.png';
const BOSSBASE_GREEN = '#1DDB62';

// Leesbare tekstkleur op een achtergrondkleur: donkere tekst op lichte kleuren
// (bv. geel), witte tekst op donkere kleuren. O.b.v. waargenomen helderheid.
export function readableTextColor(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#0a0a0a' : '#ffffff';
}

// HTML-escape voor door gebruikers/bedrijven ingevoerde tekst die als PLATTE
// tekst in de mail-HTML terechtkomt (titel, preheader, bedrijfsnaam, knoptekst).
// `body` en `footerText` blijven bewust rauwe HTML (developer-gecontroleerd).
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Alleen http(s)-URL's toestaan in href/src (blokkeert javascript:/data:), en
// daarna attribuut-escapen. Ongeldige URL → lege string (geen XSS-vector).
function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  return esc(s);
}

// Eén bron voor een mail-knop: achtergrond = bedrijfskleur (val terug op
// BossBase-groen, nooit een vaste oranje), tekstkleur o.b.v. leesbaarheid.
export function mailButton(text, url, brandColor) {
  const bg = brandColor || BOSSBASE_GREEN;
  const fg = readableTextColor(bg);
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:10px 0;"><tr><td style="border-radius:8px;background:${bg};"><a href="${safeUrl(url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:${fg};text-decoration:none;border-radius:8px;">${esc(text)}</a></td></tr></table>`;
}

export function mailTemplate({
  title,
  preheader,
  body,
  buttonText,
  buttonUrl,
  footerText,
  companyName = 'BossBase',
  logoUrl,
  brandColor,
}) {
  const isSystem = companyName === 'BossBase';
  // Zakelijke mail volgt de bedrijfskleur; systeemmail altijd BossBase-groen.
  const accent = isSystem ? BOSSBASE_GREEN : (brandColor || BOSSBASE_GREEN);

  // Header: systeem → BossBase-logo + woordmerk; zakelijk → bedrijfslogo of,
  // als dat ontbreekt, de bedrijfsnaam als tekst.
  let headerHtml;
  if (isSystem) {
    headerHtml = `<img src="${safeUrl(logoUrl) || BOSSBASE_LOGO_URL}" alt="BossBase" width="32" height="32" style="display:inline-block;vertical-align:middle;border-radius:8px;border:0;outline:none;text-decoration:none;"><span style="vertical-align:middle;margin-left:9px;font-size:20px;font-weight:700;color:#0a0a0a;letter-spacing:-0.5px;">BossBase</span>`;
  } else if (logoUrl) {
    headerHtml = `<img src="${safeUrl(logoUrl)}" alt="${esc(companyName)}" height="40" style="max-height:48px;max-width:220px;display:inline-block;border:0;outline:none;text-decoration:none;">`;
  } else {
    headerHtml = `<span style="font-size:20px;font-weight:700;color:#0a0a0a;letter-spacing:-0.5px;">${esc(companyName)}</span>`;
  }

  const footerLine = isSystem
    ? `BossBase &middot; <a href="https://www.bossbase.nl" style="color:#9ca3af;">bossbase.nl</a>`
    : `Verstuurd met <a href="https://www.bossbase.nl" style="color:#9ca3af;text-decoration:none;font-weight:600;">BossBase</a>`;

  const accentText = readableTextColor(accent);
  const buttonHtml = buttonText && buttonUrl ? `
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 0;">
                <tr>
                  <td style="border-radius:8px;background:${accent};">
                    <a href="${safeUrl(buttonUrl)}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${accentText};text-decoration:none;border-radius:8px;">
                      ${esc(buttonText)}
                    </a>
                  </td>
                </tr>
              </table>` : '';

  const footerTextHtml = footerText
    ? `<p style="margin:24px 0 0;font-size:13px;color:#6b7280;">${footerText}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(preheader || title)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #f3f4f6;">
              ${headerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0a0a0a;line-height:1.3;">${esc(title)}</h1>
              <div style="font-size:15px;color:#374151;line-height:1.6;">
                ${body}
              </div>
              ${buttonHtml}
              ${footerTextHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                ${footerLine}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
