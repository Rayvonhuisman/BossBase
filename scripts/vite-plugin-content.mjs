// Contentpagina's (functies, branches, integraties, kennisbank) staan als
// Markdown in src/content. Deze plugin zet ze tijdens de build om naar een
// JS-module met `meta` (de JSON-kop) en `html` (de tekst). Zo komt er geen
// markdown-parser in de bundle van de bezoeker.
//
// Bestandsopbouw:
//   ---
//   { "path": "/werkbonnen", "title": "...", ... }
//   ---
//   Markdown-tekst
//
// Met de query ?meta levert hij alleen de kop. Daarmee bouwt routes.js de
// lijst van pagina's zonder alle teksten in de eerste bundle te laden.

import { Marked } from 'marked';

export function slugify(tekst) {
  return String(tekst)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitDoc(bron, id) {
  const m = bron.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) throw new Error(`${id}: kop tussen --- ontbreekt`);
  let meta;
  try {
    meta = JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`${id}: kop is geen geldige JSON (${e.message})`);
  }
  return { meta, body: m[2] };
}

function maakMarked() {
  const toc = [];
  const gebruikt = new Set();
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const inhoud = this.parser.parseInline(tokens);
        let id = slugify(inhoud);
        while (gebruikt.has(id)) id += '-2';
        gebruikt.add(id);
        if (depth === 2) toc.push({ id, tekst: inhoud.replace(/<[^>]+>/g, '') });
        return `<h${depth} id="${id}">${inhoud}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const tekst = this.parser.parseInline(tokens);
        const t = title ? ` title="${title}"` : '';
        if (/^https?:\/\//.test(href)) {
          return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${tekst}</a>`;
        }
        return `<a href="${href}"${t}>${tekst}</a>`;
      },
    },
  });
  return { md, toc };
}

export function renderMarkdown(body) {
  const { md, toc } = maakMarked();
  let html = md.parse(body);
  // Brede tabellen scrollen op een telefoon binnen hun eigen kader.
  html = html
    .replace(/<table>/g, '<div class="bb-table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
    // Een citaatblok is bij ons een kader (voorbeeld, tip, let op).
    .replace(/<blockquote>/g, '<blockquote class="bb-callout">')
    // Vakjes in een checklist zijn opmaak, geen formulier: verbergen voor
    // schermlezers, de tekst van het item blijft gewoon leesbaar.
    .replace(/<input (checked="" )?disabled="" type="checkbox">/g, (m) => m.replace('<input ', '<input aria-hidden="true" tabindex="-1" '));
  return { html, toc };
}

export default function contentPlugin() {
  return {
    name: 'bb-content',
    transform(code, id) {
      const [pad, query = ''] = id.split('?');
      if (!pad.endsWith('.md')) return null;
      const { meta: kop, body } = splitDoc(code, pad);
      // Leestijd: ongeveer 200 woorden per minuut.
      const woorden = body.replace(/[#>*_|`\[\]()-]/g, ' ').split(/\s+/).filter(Boolean).length;
      const meta = { ...kop, leestijd: Math.max(1, Math.round(woorden / 200)) };
      if (query.includes('meta')) {
        return { code: `const meta = ${JSON.stringify(meta)};\nexport default meta;\nexport { meta };`, map: null };
      }
      const { html, toc } = renderMarkdown(body);
      return {
        code: `export const meta = ${JSON.stringify(meta)};\nexport const html = ${JSON.stringify(html)};\nexport const toc = ${JSON.stringify(toc)};\nexport default { meta, html, toc };`,
        map: null,
      };
    },
  };
}
