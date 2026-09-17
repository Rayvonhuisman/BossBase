import DOMPurify from 'dompurify';

// ── Gedeeld notitie-formaat ───────────────────────────────────────────────────
// Notities worden opgeslagen als HTML. Een mention is een niet-bewerkbare span:
//   <span class="bb-mention" data-id="u123" data-name="Jan">@Jan</span>
// Opmaak is beperkt tot vet/cursief/onderstreept + regelovergangen.
//
// Bestaande (legacy) notities staan opgeslagen als platte tekst met
// @[Naam](id) markup. normalizeToHtml() zet die om naar spans, zodat oude
// notities zonder DB-migratie leesbaar blijven.

export const NOTE_ALLOWED_TAGS = ['b', 'i', 'u', 'strong', 'em', 'br', 'div', 'p', 'span'];
export const NOTE_ALLOWED_ATTR = ['class', 'data-id', 'data-name'];

// HTML-escape voor platte tekst die we in HTML injecteren.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// @[Naam](id) markup → HTML met mention-spans (identiek aan MentionEditor).
export function markupToHtml(text) {
  if (!text) return '';
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let html = '', last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      html += esc(text.slice(last, m.index)).replace(/\n/g, '<br>');
    }
    html += `<span class="bb-mention" data-id="${esc(m[2])}" data-name="${esc(m[1])}" contenteditable="false">@${esc(m[1])}</span>`;
    last = m.index + m[0].length;
  }
  if (last < text.length) html += esc(text.slice(last)).replace(/\n/g, '<br>');
  return html;
}

// Sanitize HTML met de strikte notitie-allowlist (XSS-veilig).
export function sanitizeNoteHtml(html) {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: NOTE_ALLOWED_TAGS,
    ALLOWED_ATTR: NOTE_ALLOWED_ATTR,
  });
}

// Detecteert of een string al HTML-opmaak bevat.
export function looksLikeHtml(value) {
  return /<[a-zA-Z]/.test(value);
}

// Platte tekst (met \n) → editor-HTML (<div> per regel, zoals Chrome's
// contentEditable). Bestaande HTML wordt ongewijzigd teruggegeven.
// Gebruikt voor de mail-modus (mentions={false}), waar opmaak/links behouden
// blijven en NIET de strikte notitie-allowlist geldt.
export function plainToEditorHtml(text) {
  if (!text) return '';
  if (looksLikeHtml(text)) return text;
  return text
    .split('\n')
    .map(line => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<div>${escaped || '<br>'}</div>`;
    })
    .join('');
}

// Legacy markup of HTML → veilige, genormaliseerde HTML voor opslag/weergave.
export function normalizeToHtml(value) {
  if (!value) return '';
  if (looksLikeHtml(value)) return sanitizeNoteHtml(value);
  return sanitizeNoteHtml(markupToHtml(value));
}

// HTML → tekst voor een PDF of e-mail: leesbaar, zonder tags.
//
// Bewust iets anders dan htmlToPlain hieronder. Die plet álle witruimte tot één
// spatie, want hij bestaat voor leeg-detectie en korte previews. In een PDF is
// de indeling juist de leesbaarheid: alinea's, regeleinden en opsommingen
// moeten blijven staan. Zonder deze functie belandde de opgemaakte HTML
// letterlijk — met tags en al — in de werkbon-PDF.
//
// Een mention wordt de naam zelf: een klant leest "Jan", geen "@Jan" en al
// helemaal geen span met een data-id.
export function htmlToPdfText(value) {
  if (!value) return '';
  let s = String(value);

  // Legacy markup @[Naam](id) → Naam (oude notities zonder HTML).
  s = s.replace(/@\[([^\]]+)\]\([^)]*\)/g, '$1');

  if (!looksLikeHtml(s)) return netteRegels(s);

  // Mention-spans → de naam. data-name is leidend; anders de inhoud zonder @.
  s = s.replace(/<span[^>]*class="[^"]*bb-mention[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    (tag, inhoud) => {
      const naam = /data-name="([^"]*)"/i.exec(tag);
      return naam ? naam[1] : inhoud.replace(/^@/, '');
    });

  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')   // opsomming houdt zijn bolletje
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');           // als laatste, anders ontstaat &lt; opnieuw

  return netteRegels(s);
}

// Regeleinden opschonen zonder de indeling te verliezen: spaties samenvouwen,
// maar \n laten staan en hooguit één lege regel tussen alinea's.
function netteRegels(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// HTML → platte tekst (voor leeg-detectie en korte previews).
export function htmlToPlain(value) {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
