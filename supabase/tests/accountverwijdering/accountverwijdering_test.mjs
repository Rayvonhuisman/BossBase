// Draaien (geïsoleerd, geen verbinding met productie):
//   npm i --no-save @electric-sql/pglite
//   node supabase/tests/accountverwijdering/accountverwijdering_test.mjs
//
// Bouwt een database in het geheugen met de structuur van productie (tabellen,
// foreign keys in productievolgorde, delete-triggers; zie opbouw.mjs) en laadt
// daarop de opschoonmigratie 20260930083452. Draait dezelfde scenario's twee
// keer: zonder en met de correctiemigratie 20260930181000. Alle gegevens zijn
// verzonnen.
import { bouw, migratie } from './opbouw.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIES = process.env.MIGRATIES || path.resolve(HIER, '../../migrations');
const OPSCHONING = path.join(MIGRATIES, '20260930083452_opschoning_bewaartermijnen.sql');
const CORRECTIE = path.join(MIGRATIES, '20260930181000_accountverwijdering_correcties.sql');

let fouten = 0;
const verwacht = [];
function check(naam, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${naam}${ok ? '' : `  → ${detail ?? ''}`}`);
  if (!ok) fouten++;
}

// Vaste, herkenbare test-id's.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BEDRIJF = { proef: id(1), getekend: id(2), superadmin: id(3), gedeeldA: id(4), gedeeldB: id(5), ander: id(6), opzeg: id(7) };
const P = {
  proefAdmin: id(101), getekendAdmin: id(102), getekendMw: id(103), superAdmin: id(104), superBedrijfAdmin: id(105),
  gedeeldA: id(106), gedeeldB: id(107), anderAdmin: id(108), anderMw: id(109),
  opzegEigenaar: id(110), opzegAdmin2: id(111), opzegMw: id(112), opzegSuper: id(113),
};
const LANG_GELEDEN = "now() - interval '3 years'";

async function vul(db) {
  const users = Object.values(P).map(u => `('${u}', 'test+${u.slice(-3)}@example.com')`).join(',');
  await db.exec(`insert into auth.users (id, email) values ${users};`);
  await db.exec(`insert into auth.sessions (user_id) select id from auth.users;`);

  const bedrijf = (b, status = 'actief', opgezegd = null, eigenaar = null) =>
    `insert into companies (id, name, status, opgezegd_op, eigenaar_id) values ('${b}', 'Testbedrijf ${b.slice(-2)}', '${status}', ${opgezegd ?? 'null'}, ${eigenaar ? `'${eigenaar}'` : 'null'});`;
  const profiel = (p, b, role = 'admin', extra = {}) =>
    `insert into profiles (id, company_id, role, actief, is_super_admin) values ('${p}', '${b}', '${role}', ${extra.actief ?? true}, ${extra.super ?? false});`;

  // 1. Proefperiode ruim 2 jaar geleden verlopen; niemand drukte op verwijderen.
  await db.exec(bedrijf(BEDRIJF.proef) + profiel(P.proefAdmin, BEDRIJF.proef) +
    `update companies set eigenaar_id = '${P.proefAdmin}' where id = '${BEDRIJF.proef}';
     insert into subscriptions (company_id, status, trial_ends_at, created_at) values ('${BEDRIJF.proef}', 'trial', ${LANG_GELEDEN}, ${LANG_GELEDEN});
     insert into customers (id, company_id, name) values ('${id(201)}', '${BEDRIJF.proef}', 'Klant proef');`);

  // 2. Opgezegd, met een ondertekende werkbon met uren, taak, materiaal en dag.
  await db.exec(bedrijf(BEDRIJF.getekend, 'opgezegd', LANG_GELEDEN) +
    profiel(P.getekendAdmin, BEDRIJF.getekend, 'admin', { actief: false }) +
    profiel(P.getekendMw, BEDRIJF.getekend, 'medewerker', { actief: false }) +
    `insert into werkbonnen (id, company_id, nummer) values ('${id(301)}', '${BEDRIJF.getekend}', 'WB-001');
     insert into werkbon_uren (id, company_id, werkbon_id, profile_id) values ('${id(302)}', '${BEDRIJF.getekend}', '${id(301)}', '${P.getekendMw}');
     insert into werkbon_taken (id, company_id, werkbon_id) values ('${id(303)}', '${BEDRIJF.getekend}', '${id(301)}');
     insert into werkbon_materialen (id, company_id, werkbon_id) values ('${id(304)}', '${BEDRIJF.getekend}', '${id(301)}');
     insert into werkbon_dagen (id, company_id, werkbon_id, datum) values ('${id(305)}', '${BEDRIJF.getekend}', '${id(301)}', current_date - 1100);
     update werkbonnen set ondertekend_op = now() - interval '3 years' where id = '${id(301)}';`);

  // 3. Opgezegd bedrijf met een superbeheerder als lid.
  await db.exec(bedrijf(BEDRIJF.superadmin, 'opgezegd', LANG_GELEDEN) +
    profiel(P.superBedrijfAdmin, BEDRIJF.superadmin, 'admin', { actief: false }) +
    profiel(P.superAdmin, BEDRIJF.superadmin, 'admin', { actief: false, super: true }));

  // 4. Bestanden zoals op productie gemeten. A (opgezegd) verwijst naar een
  //    werkbon-PDF in zijn eigen map; B (lopend) naar een gelijknamig oud
  //    bestand in de wortel. A's kostenbijlage staat als JSON-lijst opgeslagen.
  //    Beide verwijzen ook naar één écht gedeeld bestand.
  await db.exec(bedrijf(BEDRIJF.gedeeldA, 'opgezegd', LANG_GELEDEN) + profiel(P.gedeeldA, BEDRIJF.gedeeldA, 'admin', { actief: false }) +
    bedrijf(BEDRIJF.gedeeldB) + profiel(P.gedeeldB, BEDRIJF.gedeeldB) +
    `insert into werkbonnen (id, company_id, nummer, ondertekende_pdf_url, handtekening_url) values
       ('${id(401)}', '${BEDRIJF.gedeeldA}', 'WB-001', 'https://x.supabase.co/storage/v1/object/sign/signed-werkbonnen/${BEDRIJF.gedeeldA}/werkbon-WB-001-ondertekend.pdf?token=a', 'https://x.supabase.co/storage/v1/object/sign/signatures/gedeeld.png?token=a'),
       ('${id(402)}', '${BEDRIJF.gedeeldB}', 'WB-001', 'https://x.supabase.co/storage/v1/object/sign/signed-werkbonnen/werkbon-WB-001-ondertekend.pdf?token=b', 'https://x.supabase.co/storage/v1/object/sign/signatures/gedeeld.png?token=b');
     insert into job_costs (id, company_id, bijlage_url) values ('${id(403)}', '${BEDRIJF.gedeeldA}', '["https://x.supabase.co/storage/v1/object/public/kosten-bijlagen/bon-1.jpg"]');
     insert into storage.objects (bucket_id, name) values
       ('signed-werkbonnen', 'werkbon-WB-001-ondertekend.pdf'),
       ('signed-werkbonnen', '${BEDRIJF.gedeeldA}/werkbon-WB-001-ondertekend.pdf'),
       ('signed-werkbonnen', '${BEDRIJF.gedeeldA}/eigen.pdf'),
       ('kosten-bijlagen', 'bon-1.jpg'),
       ('signatures', 'gedeeld.png');`);

  // 5. Een lopend bedrijf dat nergens mee te maken heeft.
  await db.exec(bedrijf(BEDRIJF.ander) + profiel(P.anderAdmin, BEDRIJF.ander) + profiel(P.anderMw, BEDRIJF.ander, 'medewerker') +
    `update companies set eigenaar_id = '${P.anderAdmin}' where id = '${BEDRIJF.ander}';
     insert into customers (id, company_id, name) values ('${id(601)}', '${BEDRIJF.ander}', 'Klant ander');
     insert into werkbonnen (id, company_id, nummer) values ('${id(602)}', '${BEDRIJF.ander}', 'WB-001');
     insert into werkbon_uren (id, company_id, werkbon_id, profile_id) values ('${id(603)}', '${BEDRIJF.ander}', '${id(602)}', '${P.anderMw}');
     update werkbonnen set ondertekend_op = now() where id = '${id(602)}';
     insert into storage.objects (bucket_id, name) values ('factuur-pdfs', '${BEDRIJF.ander}/f1.pdf');`);

  // 6. Actief bedrijf voor "Account verwijderen": eigenaar, tweede beheerder,
  //    medewerker, superbeheerder.
  await db.exec(bedrijf(BEDRIJF.opzeg) +
    profiel(P.opzegEigenaar, BEDRIJF.opzeg) + profiel(P.opzegAdmin2, BEDRIJF.opzeg) +
    profiel(P.opzegMw, BEDRIJF.opzeg, 'medewerker') + profiel(P.opzegSuper, BEDRIJF.opzeg, 'admin', { super: true }) +
    `update companies set eigenaar_id = '${P.opzegEigenaar}' where id = '${BEDRIJF.opzeg}';`);
}

async function een(db, sql) { return (await db.query(sql)).rows[0]; }
async function probeer(db, sql) {
  try { await db.query(sql); return null; } catch (e) { return e.message; }
}
async function als(db, uid, sql) {
  await db.exec(`select set_config('test.uid', '${uid}', false);`);
  const f = await probeer(db, sql);
  await db.exec(`select set_config('test.uid', '', false);`);
  return f;
}

async function scenario(label, gecorrigeerd) {
  console.log(`\n── ${label} ──`);
  // Productieversie van delete_own_account en cancel_company_account (letterlijk).
  const extra = [fs.readFileSync(path.join(HIER, 'prod_rpc.sql'), 'utf8'), migratie(OPSCHONING)];
  if (gecorrigeerd) extra.push(migratie(CORRECTIE));
  const db = await bouw({ extraSql: extra });
  await vul(db);

  const anderVoor = await een(db, `select (select count(*) from customers where company_id='${BEDRIJF.ander}') k,
    (select count(*) from werkbon_uren where company_id='${BEDRIJF.ander}') u,
    (select count(*) from profiles where company_id='${BEDRIJF.ander}') p`);

  const kand = (await db.query(`select company_id from bb_opschoning_kandidaten(2)`)).rows.map(r => r.company_id);
  const r = {};
  r.kandidaten = [BEDRIJF.proef, BEDRIJF.getekend, BEDRIJF.superadmin, BEDRIJF.gedeeldA].every(b => kand.includes(b))
    && !kand.includes(BEDRIJF.ander) && !kand.includes(BEDRIJF.opzeg) && !kand.includes(BEDRIJF.gedeeldB);

  const bestA = (await db.query(`select bucket_id, name from bb_opschoning_bestanden('${BEDRIJF.gedeeldA}')`)).rows;
  const heeft = (bucket, naam) => bestA.some(b => b.bucket_id === bucket && b.name === naam);
  r.eigenBestand = heeft('signed-werkbonnen', `${BEDRIJF.gedeeldA}/eigen.pdf`) && heeft('signed-werkbonnen', `${BEDRIJF.gedeeldA}/werkbon-WB-001-ondertekend.pdf`);
  r.jsonBijlage = heeft('kosten-bijlagen', 'bon-1.jpg');
  r.gelijknamigVanAnderGespaard = !heeft('signed-werkbonnen', 'werkbon-WB-001-ondertekend.pdf');
  r.gedeeldBestandGespaard = !heeft('signatures', 'gedeeld.png');

  r.proefFout = await probeer(db, `select bb_opschoning_verwijder('${BEDRIJF.proef}')`);
  r.getekendFout = await probeer(db, `select bb_opschoning_verwijder('${BEDRIJF.getekend}')`);
  r.superFout = await probeer(db, `select bb_opschoning_verwijder('${BEDRIJF.superadmin}')`);
  r.superProfielBlijft = (await een(db, `select count(*)::int n from profiles where id='${P.superAdmin}'`)).n === 1;
  r.gedeeldFout = await probeer(db, `select bb_opschoning_verwijder('${BEDRIJF.gedeeldA}')`);
  r.lopendGeweigerd = !!(await probeer(db, `select bb_opschoning_verwijder('${BEDRIJF.ander}')`));

  const anderNa = await een(db, `select (select count(*) from customers where company_id='${BEDRIJF.ander}') k,
    (select count(*) from werkbon_uren where company_id='${BEDRIJF.ander}') u,
    (select count(*) from profiles where company_id='${BEDRIJF.ander}') p`);
  r.anderOngemoeid = JSON.stringify(anderVoor) === JSON.stringify(anderNa);

  // "Account verwijderen"
  r.anonFout = await als(db, '', `select delete_own_account()`);
  r.mwFout = await als(db, P.opzegMw, `select delete_own_account()`);
  const mw = await een(db, `select p.actief, u.banned_until is not null and u.banned_until > now() geband,
    (select count(*)::int from auth.sessions s where s.user_id='${P.opzegMw}') sessies
    from profiles p join auth.users u on u.id=p.id where p.id='${P.opzegMw}'`);
  r.mw = mw;
  r.admin2Fout = await als(db, P.opzegAdmin2, `select cancel_company_account()`);
  r.bedrijfNaAdmin2 = (await een(db, `select status from companies where id='${BEDRIJF.opzeg}'`)).status;
  r.eigenaarFout = await als(db, P.opzegEigenaar, `select cancel_company_account()`);
  r.naOpzeggen = (await db.query(`select p.id, p.actief, coalesce(u.banned_until > now(), false) geband,
    (select count(*)::int from auth.sessions s where s.user_id=p.id) sessies
    from profiles p join auth.users u on u.id=p.id where p.company_id='${BEDRIJF.opzeg}' order by p.id`)).rows;
  r.bedrijfNaEigenaar = (await een(db, `select status from companies where id='${BEDRIJF.opzeg}'`)).status;
  r.anderNaOpzeggen = (await een(db, `select count(*)::int n from profiles p join auth.users u on u.id=p.id
    where p.company_id='${BEDRIJF.ander}' and p.actief and u.banned_until is null`)).n;
  await db.close();
  return r;
}

const oud = await scenario('Huidige productieversie (20260930083452)', false);
const nieuw = await scenario('Met correctie (20260930181000)', true);

console.log('\nHuidige productieversie — vastgestelde fouten:');
console.log(`  proefbedrijf, beheerder nog actief:  ${oud.proefFout ?? 'verwijderd'}`);
console.log(`  bedrijf met ondertekende werkbon:    ${oud.getekendFout ?? 'verwijderd'}`);
console.log(`  profiel superbeheerder blijft:       ${oud.superProfielBlijft}`);
console.log(`  gelijknamig bestand van ander bedrijf gespaard: ${oud.gelijknamigVanAnderGespaard}`);
console.log(`  door twee bedrijven gebruikt bestand gespaard:  ${oud.gedeeldBestandGespaard}`);
console.log(`  medewerker na "verwijderen" geband:  ${oud.mw.geband}, sessies over: ${oud.mw.sessies}`);
console.log(`  tweede beheerder zegt bedrijf op:    ${oud.admin2Fout ?? 'toegestaan'} → status ${oud.bedrijfNaAdmin2}`);

console.log('\nMet correctie:');
check('kandidaten: alleen de vier afgelopen bedrijven', nieuw.kandidaten);
check('proefbedrijf met actieve beheerder wordt verwijderd', nieuw.proefFout === null, nieuw.proefFout);
check('bedrijf met ondertekende werkbon wordt verwijderd', nieuw.getekendFout === null, nieuw.getekendFout);
check('bedrijf met superbeheerder wordt verwijderd', nieuw.superFout === null, nieuw.superFout);
check('profiel van superbeheerder blijft (losgekoppeld)', nieuw.superProfielBlijft);
check('bestanden in eigen map worden gekozen', nieuw.eigenBestand);
check('kostenbijlage met verwijzing als JSON-lijst wordt gekozen', nieuw.jsonBijlage);
check('gelijknamig bestand van een ander bedrijf blijft', nieuw.gelijknamigVanAnderGespaard);
check('bestand waar ook een ander bedrijf naar verwijst blijft', nieuw.gedeeldBestandGespaard);
check('bedrijf met gedeeld bestand wordt verwijderd', nieuw.gedeeldFout === null, nieuw.gedeeldFout);
check('lopend bedrijf wordt geweigerd', nieuw.lopendGeweigerd);
check('ander bedrijf: klanten, uren en profielen ongemoeid', nieuw.anderOngemoeid);
check('zonder login: delete_own_account weigert', !!nieuw.anonFout, 'geen fout');
check('medewerker: gedeactiveerd, geblokkeerd, sessies weg', nieuw.mwFout === null && nieuw.mw.actief === false && nieuw.mw.geband && nieuw.mw.sessies === 0, JSON.stringify(nieuw.mw));
check('tweede beheerder kan het bedrijf niet opzeggen', !!nieuw.admin2Fout && nieuw.bedrijfNaAdmin2 === 'actief', nieuw.admin2Fout);
check('eigenaar kan het bedrijf opzeggen', nieuw.eigenaarFout === null && nieuw.bedrijfNaEigenaar === 'opgezegd', nieuw.eigenaarFout);
const sup = nieuw.naOpzeggen.find(x => x.id === P.opzegSuper);
const rest = nieuw.naOpzeggen.filter(x => x.id !== P.opzegSuper);
check('na opzeggen: teamleden gedeactiveerd, geblokkeerd, sessies weg', rest.length === 3 && rest.every(x => !x.actief && x.geband && x.sessies === 0), JSON.stringify(rest));
check('na opzeggen: superbeheerder niet geraakt', sup && sup.actief && !sup.geband && sup.sessies === 1, JSON.stringify(sup));
check('na opzeggen: ander bedrijf niet geraakt', nieuw.anderNaOpzeggen === 2, nieuw.anderNaOpzeggen);

console.log(fouten ? `\n${fouten} controle(s) mislukt` : '\nAlle controles geslaagd');
process.exit(fouten ? 1 : 0);
