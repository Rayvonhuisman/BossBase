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
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

// ── Juridische documenten ────────────────────────────────────────────────────
// docs/juridisch/*.md is de bron; de pagina's op de site importeren het bestand
// met ?juridisch. Zonder JSON-kop: de titel is de eerste kop, de versie staat op
// de regel "**Versie JJJJ-MM · geldig vanaf …**".
//
// De build weigert een document dat nog niet af is: een concept-markering of
// een plek tussen [vierkante haken] (links en `code` tellen niet mee). En voor
// de documenten waarmee je bij registratie akkoord gaat, moet de versie gelijk
// zijn aan die in supabase/functions/_shared/akkoord.ts; dat is de versie die
// bij het akkoord wordt vastgelegd.
const AKKOORD_SLEUTEL = {
  'algemene-voorwaarden': 'algemene_voorwaarden',
  'verwerkersovereenkomst': 'verwerkersovereenkomst',
  'privacyverklaring': 'privacyverklaring',
};

function akkoordVersies() {
  const bron = readFileSync(path.resolve('supabase/functions/_shared/akkoord.ts'), 'utf8');
  return Object.fromEntries([...bron.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map(m => [m[1], m[2]]));
}

export function juridischDocument(bron, id) {
  const naam = path.basename(id, '.md');
  const titel = bron.match(/^# (.+)$/m)?.[1];
  const versieRegel = bron.match(/^\*\*Versie (\S+) · geldig vanaf ([^*]+)\*\*\s*$/m);
  if (!titel) throw new Error(`${id}: eerste kop (# Titel) ontbreekt`);
  if (!versieRegel) throw new Error(`${id}: regel "**Versie JJJJ-MM · geldig vanaf …**" ontbreekt`);
  const [, versie, geldigVanaf] = versieRegel;

  if (/CONCEPT/.test(bron)) throw new Error(`${id}: bevat nog een concept-markering`);
  const zonderCodeEnLinks = bron.replace(/`[^`]*`/g, '').replace(/\[[^\]]*\]\([^)]*\)/g, '');
  const open = zonderCodeEnLinks.match(/\[[^\]]*\]/g);
  if (open) throw new Error(`${id}: nog niet ingevuld: ${[...new Set(open)].join(', ')}`);

  const sleutel = AKKOORD_SLEUTEL[naam.replace(/-CONCEPT$/, '')];
  if (sleutel) {
    const vastgelegd = akkoordVersies()[sleutel];
    if (vastgelegd !== versie) {
      throw new Error(`${id}: versie ${versie} op de pagina, maar bij het akkoord wordt ${vastgelegd} vastgelegd (supabase/functions/_shared/akkoord.ts)`);
    }
  }

  const body = bron.replace(/^# .+\n+/m, '').replace(versieRegel[0], '').trim();
  const { html } = renderMarkdown(body);
  return { titel, versie, geldigVanaf: geldigVanaf.trim(), html };
}

export default function contentPlugin() {
  return {
    name: 'bb-content',
    transform(code, id) {
      const [pad, query = ''] = id.split('?');
      if (!pad.endsWith('.md')) return null;
      if (query.includes('juridisch')) {
        const doc = juridischDocument(code, pad);
        return { code: `export default ${JSON.stringify(doc)};`, map: null };
      }
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
