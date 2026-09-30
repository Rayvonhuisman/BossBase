// UI-test van de gewijzigde frontend tegen de lokale omgeving (gateway 54321).
// Inloggen via het echte inlogscherm; Auth is nagebootst (zie gateway.mjs).
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright-core');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sql } from './gateway.mjs';

const DIST = process.env.DIST;
const OUT = process.env.OUT;
// Statische server: bestanden uit dist, anders index.html (SPA).
const server = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(DIST, 'index.html');
  if (f.endsWith('index.html') && path.extname(p)) { res.writeHead(404); return res.end(); }
  const typ = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': typ }); fs.createReadStream(f).pipe(res);
}).listen(4174);

let fouten = 0; const res = [];
const check = (naam, ok, detail) => { res.push({ naam, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  [ui] ${naam}${ok ? '' : `  → ${JSON.stringify(detail)}`}`); if (!ok) fouten++; };

const X = crypto.randomUUID();
const U = { E: crypto.randomUUID(), A2: crypto.randomUUID(), M: crypto.randomUUID() };
const mail = k => `ui-${k.toLowerCase()}-${X.slice(0, 6)}@example.test`;
sql(`insert into auth.users (id, email, aud, role) values ${Object.entries(U).map(([k, v]) => `('${v}', '${mail(k)}', 'authenticated', 'authenticated')`).join(',')};
  insert into companies (id, name, status) values ('${X}', 'UI-testbedrijf', 'actief');
  insert into profiles (id, company_id, role, actief, full_name) values ('${U.E}', '${X}', 'admin', true, 'Eigenaar UI'), ('${U.A2}', '${X}', 'admin', true, 'Beheerder UI'), ('${U.M}', '${X}', 'medewerker', true, 'Medewerker UI');
  update companies set eigenaar_id = '${U.E}' where id = '${X}';
  update subscriptions set status = 'actief', plan = 'team', stripe_subscription_id = 'sub_ui_${X.slice(0, 8)}', stripe_customer_id = 'cus_ui_${X.slice(0, 8)}', billing_interval = 'month', current_period_end = now() + interval '20 days' where company_id = '${X}'`);
const staat = u => JSON.parse(sql(`select json_build_object('actief', p.actief, 'geband', coalesce(a.banned_until > now(), false), 'sessies', (select count(*) from auth.sessions s where s.user_id = a.id)) from profiles p join auth.users a on a.id = p.id where p.id = '${u}'`)[0]);

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
async function sessie(k) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const fout = []; page.on('pageerror', e => fout.push(e.message));
  await page.goto('http://localhost:4174/login');
  await page.fill('input[type="email"]', mail(k));
  await page.fill('input[type="password"]', 'test-wachtwoord');
  await page.click('button.auth-submit');
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
  await page.goto('http://localhost:4174/dashboard/instellingen');
  await page.waitForTimeout(2500);
  const tab = page.getByText('Mijn profiel', { exact: false }).first();
  if (await tab.count()) await tab.click().catch(() => {});
  await page.waitForTimeout(800);
  return { ctx, page, fout };
}
async function gevarenzone(page) {
  const knop = page.locator('button', { hasText: /^(Bedrijf sluiten|Account deactiveren)$/ }).first();
  return (await knop.count()) ? (await knop.innerText()).trim() : 'geen knop';
}
async function bevestig(page) {
  await page.locator('button', { hasText: /^(Bedrijf sluiten|Account deactiveren)$/ }).first().click();
  await page.waitForTimeout(400);
  const tekst = await page.locator('.modal').innerText().catch(() => '');
  await page.fill('.modal input[type="text"]', 'VERWIJDEREN');
  await page.locator('.modal .btn-danger').click();
  await page.waitForTimeout(3500);
  return tekst;
}

// Medewerker
{
  const s = await sessie('M');
  check('medewerker ziet "Account deactiveren"', await gevarenzone(s.page) === 'Account deactiveren', await gevarenzone(s.page));
  const t = await bevestig(s.page);
  check('medewerker: dialoog noemt uitloggen en dat werk bij het bedrijf blijft', /direct uitgelogd/.test(t) && /hoort bij het bedrijf/.test(t), t);
  check('medewerker: na bevestigen uitgelogd (inlogscherm)', /\/login/.test(s.page.url()) || await s.page.locator('button.auth-submit').count() > 0, s.page.url());
  check('medewerker: in de database inactief, geblokkeerd, sessies weg', JSON.stringify(staat(U.M)) === '{"actief":false,"geband":true,"sessies":0}', staat(U.M));
  await s.page.goto('http://localhost:4174/login');
  await s.page.fill('input[type="email"]', mail('M')); await s.page.fill('input[type="password"]', 'test-wachtwoord');
  await s.page.click('button.auth-submit'); await s.page.waitForTimeout(2000);
  const melding = await s.page.locator('body').innerText();
  check('medewerker: opnieuw inloggen toont "gedeactiveerd"', /gedeactiveerd/i.test(melding), melding.slice(0, 300));
  await s.page.screenshot({ path: `${OUT}/ui-medewerker-opnieuw.png` });
  await s.ctx.close();
}
// Tweede beheerder
{
  const s = await sessie('A2');
  check('niet-eigenaar-beheerder ziet "Account deactiveren", niet "Bedrijf sluiten"', await gevarenzone(s.page) === 'Account deactiveren', await gevarenzone(s.page));
  await s.page.goto('http://localhost:4174/dashboard/instellingen?tab=abonnement');
  await s.page.waitForTimeout(2500);
  const ab = await s.page.locator('body').innerText();
  check('niet-eigenaar-beheerder: abonnementstab zonder opzeg-/wijzigknoppen', /Alleen de eigenaar van het bedrijf kan het abonnement/.test(ab) && !/Opzeggen\n|Abonnement wijzigen/.test(ab), ab.slice(ab.indexOf('Mijn profiel'), ab.indexOf('Mijn profiel') + 900));
  await s.ctx.close();
}
// Eigenaar
{
  const s = await sessie('E');
  check('eigenaar ziet "Bedrijf sluiten"', await gevarenzone(s.page) === 'Bedrijf sluiten', await gevarenzone(s.page));

  // Eerst alleen het abonnement opzeggen (Abonnement-tab): verlenging stopt,
  // niemand wordt geblokkeerd, het bedrijf blijft actief.
  const stripeLog = `${process.env.LOKAAL}/stripe_aanroepen.jsonl`;
  const n = fs.existsSync(stripeLog) ? fs.readFileSync(stripeLog, 'utf8').trim().split('\n').filter(Boolean).length : 0;
  let bevestiging = '';
  s.page.once('dialog', d => { bevestiging = d.message(); d.accept(); });
  await s.page.goto('http://localhost:4174/dashboard/instellingen?tab=abonnement');
  await s.page.waitForTimeout(2500);
  await s.page.locator('button', { hasText: /^Opzeggen$/ }).first().click();
  await s.page.waitForTimeout(2500);
  const nieuw = fs.readFileSync(stripeLog, 'utf8').trim().split('\n').filter(Boolean).slice(n).map(JSON.parse);
  check('abonnement opzeggen: bevestiging zegt doorwerken tot de einddatum, daarna geen nieuw werk en niets versturen', /tot die datum gewoon doorwerken/.test(bevestiging) && /niets meer versturen/.test(bevestiging) && !/alleen-lezen|bekijken en exporteren/.test(bevestiging), bevestiging);
  check('abonnement opzeggen: Stripe krijgt de opzegging', nieuw.some(a => a.methode === 'POST' && a.url.startsWith('/v1/subscriptions/')), nieuw);
  check('abonnement opzeggen: niemand geblokkeerd, bedrijf blijft actief', sql(`select status from companies where id='${X}'`)[0] === 'actief'
    && ['E', 'A2'].every(k => staat(U[k]).actief && !staat(U[k]).geband), { E: staat(U.E), A2: staat(U.A2) });

  // Volledige route "Ondertekende bon": knop → document-url → juiste document.
  // De rij heeft een opgeslagen link zoals de nieuwe sign-werkbon hem maakt
  // (24 uur); de app vraagt een link van 10 minuten op en opent die.
  const WB = crypto.randomUUID();
  sql(`insert into storage.buckets (id, name, public) values ('signed-werkbonnen','signed-werkbonnen',false) on conflict do nothing;
       insert into storage.objects (bucket_id, name) values ('signed-werkbonnen', '${X}/werkbon-UI-${WB.slice(0, 6)}.pdf');
       insert into werkbonnen (id, company_id, titel, nummer, status, ondertekende_pdf_url) values
         ('${WB}', '${X}', 'UI-bon', 'WB-UI', 'afgerond', 'http://localhost:54321/storage/v1/object/sign/signed-werkbonnen/${X}/werkbon-UI-${WB.slice(0, 6)}.pdf?token=opgeslagen');
       update werkbonnen set ondertekend_op = now(), ondertekend_door_naam = 'Klant UI' where id = '${WB}'`);
  await s.page.goto(`http://localhost:4174/dashboard/werkbonnen/${WB}`);
  await s.page.waitForTimeout(3000);
  const knop = s.page.locator('button', { hasText: /^Ondertekende bon$/ }).first();
  const heeftKnop = await knop.count() > 0;
  let popupUrl = '', popupTekst = '';
  if (heeftKnop) {
    const [popup] = await Promise.all([s.page.waitForEvent('popup', { timeout: 10000 }), knop.click()]);
    await popup.waitForLoadState().catch(() => {});
    await popup.waitForTimeout(1500);
    popupUrl = popup.url(); popupTekst = await popup.locator('body').innerText().catch(() => '');
    await popup.close();
  }
  check('ondertekende bon: knop aanwezig', heeftKnop);
  check('ondertekende bon: nieuwe korte link (10 min) aangevraagd, niet de opgeslagen link', /geldig=600/.test(popupUrl) && !/token=opgeslagen/.test(popupUrl), popupUrl);
  check('ondertekende bon: het juiste document geopend', popupTekst.trim() === `document:signed-werkbonnen/${X}/werkbon-UI-${WB.slice(0, 6)}.pdf`, popupTekst);
  await s.page.goto('http://localhost:4174/dashboard/instellingen?tab=abonnement');
  await s.page.waitForTimeout(1500);

  // Daarna, apart: het bedrijf sluiten.
  await s.page.goto('http://localhost:4174/dashboard/instellingen');
  await s.page.waitForTimeout(2000);
  const tab = s.page.getByText('Mijn profiel', { exact: false }).first();
  if (await tab.count()) await tab.click().catch(() => {});
  await s.page.waitForTimeout(800);
  const t0 = await (async () => { await s.page.locator('button', { hasText: /^Bedrijf sluiten$/ }).first().click(); await s.page.waitForTimeout(300); const t = await s.page.locator('.modal').innerText(); await s.page.locator('.modal .btn-ghost').click().catch(() => {}); await s.page.waitForTimeout(300); return t; })();
  check('bedrijf sluiten: vóór bevestigen staat er dat toegang direct stopt, ook in de betaalde periode', /ook niet in de periode die al betaald is/.test(t0), t0);
  const t = await bevestig(s.page);
  await s.page.screenshot({ path: `${OUT}/ui-eigenaar-na.png` });
  check('bedrijf sluiten: dialoog noemt toegang, abonnement (einde periode) en gegevens (niet verwijderd, 7 jaar)', /einde van de lopende maand/.test(t) && /direct uitgelogd/.test(t) && /niet verwijderd/.test(t) && /7 jaar/.test(t), t);
  check('bedrijf sluiten: bedrijf gesloten (status opgezegd), eigenaar en beheerder geblokkeerd', sql(`select status from companies where id='${X}'`)[0] === 'opgezegd'
    && ['E', 'A2'].every(k => JSON.stringify(staat(U[k])) === '{"actief":false,"geband":true,"sessies":0}'), { E: staat(U.E), A2: staat(U.A2) });
  check('eigenaar: geen JavaScript-fouten', s.fout.length === 0, s.fout);
  await s.ctx.close();
}
await browser.close(); server.close();
console.log(fouten ? `\n${fouten} van ${res.length} mislukt` : `\nAlle ${res.length} UI-controles geslaagd`);
process.exit(fouten ? 1 : 0);
