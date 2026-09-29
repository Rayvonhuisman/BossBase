// Lokale test van dist/ met dezelfde regels als Vercel (vercel.json):
// redirects, cleanUrls, trailingSlash: false, rewrites naar /app (app.html), headers
// en 404.html met status 404. Alleen voor testen; Vercel zelf gebruikt dit niet.
//
//   npm run build && node scripts/serve-dist.mjs [poort]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const POORT = Number(process.argv[2] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

// Vercel-patronen ("/demo/:pad*", "/assets/(.*)") naar een reguliere expressie.
function patroon(bron) {
  const re = bron
    .replace(/[.+?^${}|[\]\\]/g, m => (m === '(' || m === ')' ? m : `\\${m}`))
    .replace(/\/:[a-z]+\*/gi, '(?:/.*)?')
    .replace(/:[a-z]+/gi, '[^/]+');
  return new RegExp(`^${re}$`);
}
const redirects = (cfg.redirects || []).map(r => ({ ...r, re: patroon(r.source) }));
const rewrites = (cfg.rewrites || []).map(r => ({ ...r, re: patroon(r.source) }));
// Regels met `has` (bijvoorbeeld alleen voor *.vercel.app-previews) gelden
// lokaal niet: localhost is geen preview-host.
const headers = (cfg.headers || []).filter(h => !h.has).map(h => ({ ...h, re: patroon(h.source) }));

function bestand(pad) {
  const f = path.join(DIST, pad);
  return f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}

function stuur(res, status, file, extra) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ...extra });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pad = decodeURIComponent(url.pathname);
  const extra = {};
  for (const h of headers) if (h.re.test(pad)) for (const { key, value } of h.headers) extra[key] = value;

  if (pad.length > 1 && pad.endsWith('/')) {
    res.writeHead(308, { Location: pad.replace(/\/+$/, '') + url.search }); return res.end();
  }
  if (pad.endsWith('.html')) {
    const schoon = pad.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
    res.writeHead(308, { Location: schoon + url.search }); return res.end();
  }
  for (const r of redirects) {
    if (r.re.test(pad)) { res.writeHead(r.permanent ? 308 : 307, { Location: r.destination }); return res.end(); }
  }
  // Bestanden eerst (zoals Vercel), met cleanUrls.
  const f = bestand(pad) || (pad === '/' ? bestand('/index.html') : bestand(`${pad}.html`));
  if (f) return stuur(res, 200, f, extra);
  // Zoals Vercel: een rewrite-doel wordt opgezocht als bestand, met cleanUrls.
  // Een doel dat niet bestaat geeft een 404 (zo vangt deze server ook een
  // rewrite naar "/app.html", die op Vercel met cleanUrls niets vindt).
  for (const r of rewrites) {
    if (!r.re.test(pad)) continue;
    const doel = cfg.cleanUrls && r.destination.endsWith('.html') ? null : (bestand(r.destination) || bestand(`${r.destination}.html`));
    return doel ? stuur(res, 200, doel, extra) : stuur(res, 404, bestand('/404.html'), extra);
  }
  stuur(res, 404, bestand('/404.html'), extra);
}).listen(POORT, () => console.log(`dist/ op http://localhost:${POORT} (Vercel-regels uit vercel.json)`));
