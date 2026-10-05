import DOMPurify from 'dompurify';
import { looksLikeHtml, htmlToPdfText } from '../../supabase/functions/_shared/notitieTekst.js';
export { looksLikeHtml, htmlToPdfText };

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


// Mail-modus: ruimer dan de notitie-allowlist (links, lijsten, koppen, de
// knop uit mailButton), maar nooit scripts, event-handlers of javascript:-links.
// Audit 2026-10-01, M8: een klantnaam met opmaakcode werd hier vroeger
// ongezien als HTML in de editor gezet en voerde dan code uit.
export const MAIL_ALLOWED_TAGS = ['b', 'i', 'u', 'strong', 'em', 'br', 'div', 'p', 'span', 'a',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'table', 'tbody', 'tr', 'td', 'img', 'hr'];
export const MAIL_ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'class', 'src', 'alt', 'width',
  'height', 'align', 'border', 'cellpadding', 'cellspacing', 'role'];

export function sanitizeMailHtml(html) {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: MAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: MAIL_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

// Platte tekst (met \n) → editor-HTML, ALTIJD ge-escaped: een regel per <div>,
// zoals Chrome's contentEditable. Gebruik dit voor tekst die je zelf opbouwt
// met gegevens erin (klantnaam, bedrijfsnaam).
export function tekstNaarEditorHtml(text) {
  if (!text) return '';
  return String(text)
    .split('\n')
    .map(line => `<div>${esc(line) || '<br>'}</div>`)
    .join('');
}

// Platte tekst of bestaande HTML → editor-HTML voor de mail-modus
// (mentions={false}). HTML gaat door de mail-allowlist; platte tekst wordt
// ge-escaped.
export function plainToEditorHtml(text) {
  if (!text) return '';
  if (looksLikeHtml(text)) return sanitizeMailHtml(text);
  return tekstNaarEditorHtml(text);
}

// Legacy markup of HTML → veilige, genormaliseerde HTML voor opslag/weergave.
export function normalizeToHtml(value) {
  if (!value) return '';
  if (looksLikeHtml(value)) return sanitizeNoteHtml(value);
  return sanitizeNoteHtml(markupToHtml(value));
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
