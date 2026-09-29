// Controle van de gebouwde website (dist/), na `npm run build`.
//
//   npm run seo:check
//
// Controleert per pagina: taal, title, beschrijving, canonical, social preview,
// structured data (geldige JSON, verplichte velden, geen beoordelingen),
// afbeeldingen (alt, afmetingen) en of de sitemap klopt. En of er geen
// geheimen in de buildbestanden staan. Exitcode 1 bij een fout.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.bossbase.nl';
const fouten = [];
const meldingen = [];

function alleBestanden(map, ext) {
  return fs.readdirSync(map, { withFileTypes: true }).flatMap(d => {
    const p = path.join(map, d.name);
    if (d.isDirectory()) return d.name === '.vite' ? [] : alleBestanden(p, ext);
    return p.endsWith(ext) ? [p] : [];
  });
}

const attr = (tag, naam) => (tag.match(new RegExp(`${naam}="([^"]*)"`)) || [])[1];

// ── Sitemap ────────────────────────────────────────────────────────────────
const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const robots = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fouten.push('robots.txt: Sitemap-regel ontbreekt');
if (/Disallow:\s*\/\s*$/m.test(robots)) fouten.push('robots.txt blokkeert de hele site');

function bestandVoor(url) {
  const pad = url.replace(SITE, '') || '/';
  return path.join(DIST, pad === '/' ? 'index.html' : `${pad.slice(1)}.html`);
}

for (const loc of locs) {
  if (!loc.startsWith(`${SITE}/`)) fouten.push(`sitemap: ${loc} is niet de canonieke host`);
  const f = bestandVoor(loc);
  if (!fs.existsSync(f)) { fouten.push(`sitemap: ${loc} heeft geen pagina`); continue; }
  const html = fs.readFileSync(f, 'utf8');
  const canon = (html.match(/<link[^>]*rel="canonical"[^>]*>/) || [''])[0];
  if (attr(canon, 'href') !== loc) fouten.push(`${loc}: canonical is ${attr(canon, 'href')}`);
  if (/name="robots"[^>]*noindex/.test(html)) fouten.push(`${loc}: staat in de sitemap maar heeft noindex`);
}

// ── Per pagina ─────────────────────────────────────────────────────────────
const paginas = alleBestanden(DIST, '.html').filter(f => !f.endsWith('app.html'));
let ldTeller = 0;
for (const f of paginas) {
  const naam = path.relative(DIST, f);
  const html = fs.readFileSync(f, 'utf8');
  if (!/<html lang="nl">/.test(html)) fouten.push(`${naam}: lang is niet nl`);
  const titel = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!titel) fouten.push(`${naam}: geen title`);
  if ((html.match(/<title>/g) || []).length !== 1) fouten.push(`${naam}: meer dan één title`);
  const desc = attr((html.match(/<meta[^>]*name="description"[^>]*>/) || [''])[0], 'content');
  if (!desc) fouten.push(`${naam}: geen beschrijving`);
  else if (desc.length < 70 || desc.length > 170) meldingen.push(`${naam}: beschrijving ${desc.length} tekens`);
  for (const og of ['og:title', 'og:description', 'og:image', 'og:type', 'twitter:card']) {
    if (!html.includes(`"${og}"`)) fouten.push(`${naam}: ${og} ontbreekt`);
  }

  for (const [, json] of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    ldTeller++;
    let data;
    try { data = JSON.parse(json); } catch (e) { fouten.push(`${naam}: structured data is geen geldige JSON (${e.message})`); continue; }
    const items = data['@graph'] || [data];
    for (const it of items) {
      const type = it['@type'];
      if (JSON.stringify(it).match(/aggregateRating|"review"/)) fouten.push(`${naam}: ${type} bevat beoordelingen`);
      if (type === 'Article') {
        for (const v of ['headline', 'author', 'image', 'publisher']) if (!it[v]) fouten.push(`${naam}: Article mist ${v}`);
        if (!it.datePublished) meldingen.push(`${naam}: Article zonder datePublished (nog geen publicatiedatum gezet)`);
        if (it.headline?.length > 110) meldingen.push(`${naam}: Article-headline is ${it.headline.length} tekens`);
      }
      if (type === 'BreadcrumbList') {
        it.itemListElement.forEach((el, i) => {
          if (el.position !== i + 1 || !el.name || !el.item?.startsWith(SITE)) fouten.push(`${naam}: kruimelpad-item ${i + 1} klopt niet`);
        });
      }
      if (type === 'SoftwareApplication') {
        for (const o of it.offers || []) if (!o.price || o.priceCurrency !== 'EUR') fouten.push(`${naam}: Offer zonder prijs of valuta`);
      }
      if (type === 'Organization' && !it.name) fouten.push(`${naam}: Organization zonder naam`);
    }
  }

  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(img)) fouten.push(`${naam}: afbeelding zonder alt ${img.slice(0, 80)}`);
    if (!/\swidth="/.test(img) || !/\sheight="/.test(img)) meldingen.push(`${naam}: afbeelding zonder vaste afmetingen ${attr(img, 'src')}`);
    const src = attr(img, 'src');
    if (src?.startsWith('/') && !fs.existsSync(path.join(DIST, src))) fouten.push(`${naam}: afbeelding ${src} bestaat niet`);
  }
}

// app.html: geen inhoud, wel noindex.
const app = fs.readFileSync(path.join(DIST, 'app.html'), 'utf8');
if (!/name="robots" content="noindex"/.test(app)) fouten.push('app.html: noindex ontbreekt');

// ── Geheimen ────────────────────────────────────────────────────────────────
const verdacht = [/service_role/i, /\bsk_live_[A-Za-z0-9]/, /\bsk_test_[A-Za-z0-9]/, /\bwhsec_[A-Za-z0-9]/, /\bre_[A-Za-z0-9]{20,}/, /SUPABASE_SERVICE/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
for (const f of [...alleBestanden(DIST, '.js'), ...alleBestanden(DIST, '.html')]) {
  const inhoud = fs.readFileSync(f, 'utf8');
  for (const re of verdacht) if (re.test(inhoud)) fouten.push(`${path.relative(DIST, f)}: mogelijk geheim (${re})`);
}

meldingen.forEach(m => console.warn(`let op  ${m}`));
if (fouten.length) {
  console.error(`\nSEO-controle: ${fouten.length} fout(en)\n  ${fouten.join('\n  ')}`);
  process.exit(1);
}
console.log(`SEO-controle: ${paginas.length} pagina's, ${locs.length} sitemap-URL's, ${ldTeller} structured-data-blokken — in orde.`);
