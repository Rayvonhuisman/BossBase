// Na `vite build` en de SSR-build: schrijft de websitepagina's als echte HTML.
//
//   dist/index.html, dist/functies.html, dist/voor-wie/schilders.html, …
//       elke pagina met eigen title, beschrijving, canonical, social preview,
//       structured data en de gerenderde inhoud in #root;
//   dist/404.html   de foutpagina (Vercel geeft hem met status 404);
//   dist/app.html   de lege app-shell voor dashboard, inloggen en klantlinks
//                   (vercel.json stuurt die paden naar /app), met noindex;
//   dist/sitemap.xml
//
// En het controleert het resultaat. Bij een kapotte interne link, een dubbele
// title of beschrijving, of een pagina zonder precies één H1 stopt de build:
// liever geen deploy dan een kapotte site.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAppPath, APP_PATHS, APP_PREFIXES } from '../src/lib/appRoutes.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const lees = f => fs.readFileSync(f, 'utf8');

// Het sjabloon is de index.html uit de Vite-build. Die wordt hieronder
// overschreven met de homepage; een kopie maakt een tweede run mogelijk.
const SJABLOON = path.join(DIST, '.vite/sjabloon.html');
if (!fs.existsSync(SJABLOON)) fs.copyFileSync(path.join(DIST, 'index.html'), SJABLOON);
const template = lees(SJABLOON);
const manifest = JSON.parse(lees(path.join(DIST, '.vite/manifest.json')));
const ssr = await import(pathToFileURL(path.join(ROOT, 'dist-ssr/entry-server.js')).href);
const { ROUTES, NIET_GEVONDEN, SITE_URL } = ssr;

if (!template.includes('<!--bb:head-->') || !template.includes('<!--bb:root-->')) {
  throw new Error('Het sjabloon (index.html uit de Vite-build) mist de <!--bb:head--> of <!--bb:root--> markering');
}

// ── Bestanden per pagina uit het Vite-manifest ─────────────────────────────
const hoofdScript = manifest['index.html'].file;

function verzamel(sleutel, js, css, gezien = new Set()) {
  const c = manifest[sleutel];
  if (!c || gezien.has(sleutel)) return;
  gezien.add(sleutel);
  if (c.file !== hoofdScript) js.add(c.file);
  (c.css || []).forEach(f => css.add(f));
  (c.imports || []).forEach(k => verzamel(k, js, css, gezien));
}

// De ingangen die main.jsx dynamisch laadt staan in het manifest soms onder
// hun chunknaam (bijv. "_entry-client-abc.js") in plaats van hun bronpad.
function sleutelVoor(bron) {
  if (manifest[bron]) return bron;
  const naam = path.basename(bron).replace(/\.[jt]sx?$/, '');
  const kandidaten = Object.keys(manifest).filter(k => manifest[k].src === bron || (manifest[k].isDynamicEntry && manifest[k].name === naam));
  if (kandidaten.length !== 1) throw new Error(`Niet (eenduidig) in manifest: ${bron} → ${kandidaten.join(', ') || 'niets'}`);
  return kandidaten[0];
}

const lettertype = fs.readdirSync(path.join(DIST, 'assets')).find(f => /^inter-latin-wght-normal-.*\.woff2$/.test(f));

function bronLinks(sleutels) {
  const js = new Set();
  const css = new Set();
  for (const s of sleutels) verzamel(sleutelVoor(s), js, css);
  const regels = [];
  if (lettertype) regels.push(`<link rel="preload" href="/assets/${lettertype}" as="font" type="font/woff2" crossorigin />`);
  css.forEach(f => regels.push(`<link rel="stylesheet" href="/${f}" />`));
  js.forEach(f => regels.push(`<link rel="modulepreload" href="/${f}" />`));
  return regels.join('\n    ');
}

function vul(head, root) {
  return template
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace('<!--bb:head-->', head)
    .replace('<!--bb:root-->', root);
}

function uitvoerPad(pad) {
  if (pad === '/') return path.join(DIST, 'index.html');
  return path.join(DIST, `${pad.slice(1)}.html`);
}

function schrijf(bestand, inhoud) {
  fs.mkdirSync(path.dirname(bestand), { recursive: true });
  fs.writeFileSync(bestand, inhoud);
}

// ── App-shell ──────────────────────────────────────────────────────────────
const appHtml = template
  .replace('<!--bb:head-->', `<meta name="robots" content="noindex" />\n    ${bronLinks(['src/app-entry.jsx'])}`)
  .replace('<!--bb:root-->', '');

// ── Websitepagina's ────────────────────────────────────────────────────────
const gerenderd = [];
for (const route of [...ROUTES, NIET_GEVONDEN]) {
  const { html, head } = await ssr.render(route);
  const volledig = vul(`${head}\n    ${bronLinks(['src/marketing/entry-client.jsx', ...route.src])}`, html);
  gerenderd.push({ route, html: volledig });
}

// index.html wordt zo overschreven met de homepage; app.html pas daarna.
for (const { route, html } of gerenderd) {
  schrijf(route === NIET_GEVONDEN ? path.join(DIST, '404.html') : uitvoerPad(route.path), html);
}
schrijf(path.join(DIST, 'app.html'), appHtml);

// ── Sitemap ────────────────────────────────────────────────────────────────
const inSitemap = ROUTES.filter(r => !r.noindex);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${inSitemap.map(r => {
  // lastmod alleen als er een echte inhoudelijke datum is (zie site.js).
  const datum = r.doc?.gewijzigd || r.doc?.gepubliceerd;
  return `  <url>
    <loc>${r.path === '/' ? `${SITE_URL}/` : SITE_URL + r.path}</loc>${datum ? `
    <lastmod>${datum}</lastmod>` : ''}
  </url>`;
}).join('\n')}
</urlset>
`;
schrijf(path.join(DIST, 'sitemap.xml'), sitemap);

// ── Controles ──────────────────────────────────────────────────────────────
const fouten = [];
const paden = new Set(ROUTES.map(r => r.path));
const titels = new Map();
const beschrijvingen = new Map();

for (const { route, html } of gerenderd) {
  const naam = route.path;
  const body = html.slice(html.indexOf('<div id="root">'));
  const h1 = (body.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fouten.push(`${naam}: ${h1} H1's (verwacht 1)`);
  if (!route.noindex) {
    if (titels.has(route.title)) fouten.push(`${naam}: zelfde title als ${titels.get(route.title)}`);
    titels.set(route.title, naam);
    if (beschrijvingen.has(route.description)) fouten.push(`${naam}: zelfde beschrijving als ${beschrijvingen.get(route.description)}`);
    beschrijvingen.set(route.description, naam);
    if (!/rel="canonical"/.test(html)) fouten.push(`${naam}: geen canonical`);
    if (route.title.length > 70) console.warn(`let op  ${naam}: title is ${route.title.length} tekens`);
    if (route.description.length > 170) console.warn(`let op  ${naam}: beschrijving is ${route.description.length} tekens`);
  }
  // Interne links: moeten naar een bestaande pagina, de app of een bestand.
  for (const [, href] of body.matchAll(/href="([^"]+)"/g)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const pad = href.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    const bestaat = paden.has(pad)
      || isAppPath(pad)
      || pad.startsWith('/api/')
      || fs.existsSync(path.join(DIST, pad));
    if (!bestaat) fouten.push(`${naam}: kapotte interne link ${href}`);
  }
}

// Elke websitepagina moet via een gewone link bereikbaar zijn, niet alleen via
// de sitemap.
const gelinkt = new Set();
for (const { html } of gerenderd) {
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) gelinkt.add(href.replace(/\/+$/, '') || '/');
}
for (const r of inSitemap) {
  if (r.path !== '/' && !gelinkt.has(r.path)) fouten.push(`${r.path}: nergens naartoe gelinkt (alleen via sitemap vindbaar)`);
}

// vercel.json moet elke app-route naar /app (app.html) sturen, anders krijgt die een 404.
const vercel = JSON.parse(lees(path.join(ROOT, 'vercel.json')));
// Met cleanUrls bedient Vercel app.html als /app. Een rewrite naar /app.html
// vindt dan niets (404 op elke app-route); vandaar /app.
const bronnen = new Set((vercel.rewrites || []).filter(r => r.destination === '/app').map(r => r.source));
if ((vercel.rewrites || []).some(r => r.destination.endsWith('.html')) && vercel.cleanUrls) {
  fouten.push('vercel.json: rewrite naar een .html-bestand werkt niet met cleanUrls; gebruik het pad zonder .html');
}
for (const p of APP_PATHS) if (!bronnen.has(p)) fouten.push(`vercel.json: rewrite voor ${p} ontbreekt`);
for (const p of APP_PREFIXES) {
  if (!bronnen.has(p) || !bronnen.has(`${p}/:pad*`)) fouten.push(`vercel.json: rewrites voor ${p} en ${p}/:pad* ontbreken`);
}

const zonderDatum = ROUTES.filter(r => r.type === 'artikel' && !r.doc.gepubliceerd).length;
if (zonderDatum) {
  console.warn(`let op  ${zonderDatum} artikel(en) zonder publicatiedatum. Zet die op de publicatiedag: npm run publicatiedatum -- JJJJ-MM-DD`);
}

if (fouten.length) {
  console.error(`\nPrerender: ${fouten.length} probleem/problemen\n  ${fouten.join('\n  ')}\n`);
  process.exit(1);
}
console.log(`Prerender: ${gerenderd.length - 1} pagina's + 404 + app.html, sitemap met ${inSitemap.length} URL's`);
