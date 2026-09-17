// Bouwt het document voor het mailvoorbeeld op de klantkaart.
//
// Waarom een apart document in een iframe en niet gewoon een <div>:
// een verstuurde mail is een compleet HTML-document met eigen <style>-blokken.
// Die selectors zijn niet afgeschermd — ze spreken `body`, `table`, `p` en `a`
// rechtstreeks aan. Zet je die HTML in de pagina, dan herschrijft de mail de
// opmaak van de klantkaart eromheen. Een class eromheen helpt daar niet tegen;
// alleen een eigen document doet dat.
//
// Daar komt bij dat mailsjablonen met tabellen van vaste breedte werken (meestal
// 600px). In een smal paneel duwt zo'n tabel het frame uit elkaar. De reset
// hieronder dwingt alles terug binnen de beschikbare breedte.
//
// De HTML gaat er al ge-sanitized in (DOMPurify op de aanroepplek); het
// sandbox-attribuut op de iframe houdt scripts sowieso tegen.
const RESET = `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      /* Zonder deze regel erft de mail niets van de app: dat is de bedoeling,
         maar een leesbare basis willen we wel. */
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      color: #1a1a1a;
      /* Geen horizontale scrollbalk: te brede inhoud wordt ingesnoerd, niet
         weggeschoven. */
      overflow-x: hidden;
    }
    /* Afbeeldingen en tabellen blijven binnen de breedte, ook met een vast
       width-attribuut in de HTML (CSS wint daarvan). */
    img, table, video, iframe {
      max-width: 100% !important;
      height: auto;
    }
    table {
      /* Een mailtabel met width="600" krimpt hiermee mee in plaats van uit te
         steken. box-sizing voorkomt dat padding er alsnog overheen gaat. */
      width: auto !important;
      box-sizing: border-box;
    }
    td, th {
      box-sizing: border-box;
      word-break: break-word;
    }
    /* Lange links en ongebroken woorden mogen het frame niet oprekken. */
    * {
      overflow-wrap: break-word;
    }
    pre {
      white-space: pre-wrap;
    }
  </style>
`;

/**
 * @param {string} html De (al opgeschoonde) HTML-body van de verstuurde mail.
 * @returns {string} Een volledig document voor het srcdoc-attribuut.
 */
export function mailVoorbeeldDocument(html) {
  return `<!doctype html><html lang="nl"><head>${RESET}</head><body>${html || ''}</body></html>`;
}
