// Test van de opzeg-, deactivatie- en opschoonroute in de lokale omgeving
// (Postgres met productiestructuur + migraties van de branch, echte PostgREST,
// echte Edge Function-code; Auth en Storage nagebootst, zie gateway.mjs).
// Alle accounts, bedrijven en bestanden zijn verzonnen.
import { createClient } from '../../../node_modules/@supabase/supabase-js/dist/index.mjs';
import { sql } from './gateway.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const URL_ = 'http://localhost:54321';
const env = Object.fromEntries(fs.readFileSync(`${process.env.LOKAAL}/sleutels.env`, 'utf8').trim().split('\n').map(r => r.split(/=(.*)/s).slice(0, 2)));
const STRIPE_LOG = `${process.env.LOKAAL}/stripe_aanroepen.jsonl`;
const stripeAanroepen = () => fs.existsSync(STRIPE_LOG) ? fs.readFileSync(STRIPE_LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

let fouten = 0;
const resultaten = [];
function check(groep, naam, ok, detail) {
  resultaten.push({ groep, naam, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${groep}] ${naam}${ok ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) fouten++;
}

// ── Verzonnen gegevens ───────────────────────────────────────────────────────
const id = () => crypto.randomUUID();
const A = id(), B = id();
const U = { Ea: id(), Aa: id(), Ma: id(), Sa: id(), Eb: id(), Mb: id() };
const mail = k => `test-${k.toLowerCase()}-${A.slice(0, 6)}@example.test`;
const bestand = { aEigen: `${A}/f-1.pdf`, bEigen: `${B}/f-1.pdf`, aWerkbon: `${A}/werkbon-WB-001-ondertekend.pdf`,
  bOud: 'werkbon-WB-001-ondertekend.pdf', gedeeld: `gedeeld-${A.slice(0, 6)}.png` };

sql(`
  insert into storage.buckets (id, name, public) values ('factuur-pdfs','factuur-pdfs',false), ('signed-werkbonnen','signed-werkbonnen',false), ('signatures','signatures',false) on conflict do nothing;
  insert into auth.users (id, email, aud, role) values
    ${Object.entries(U).map(([k, v]) => `('${v}', '${mail(k)}', 'authenticated', 'authenticated')`).join(',')};
  insert into companies (id, name, status) values ('${A}', 'Testbedrijf A', 'actief'), ('${B}', 'Testbedrijf B', 'actief');
  insert into profiles (id, company_id, role, actief, is_super_admin, full_name) values
    ('${U.Ea}', '${A}', 'admin', true, false, 'Eigenaar A'),
    ('${U.Aa}', '${A}', 'admin', true, false, 'Beheerder A'),
    ('${U.Ma}', '${A}', 'medewerker', true, false, 'Medewerker A'),
    ('${U.Sa}', '${A}', 'admin', true, true,  'Superbeheerder'),
    ('${U.Eb}', '${B}', 'admin', true, false, 'Eigenaar B'),
    ('${U.Mb}', '${B}', 'medewerker', true, false, 'Medewerker B');
  update companies set eigenaar_id = '${U.Ea}' where id = '${A}';
  update companies set eigenaar_id = '${U.Eb}' where id = '${B}';
  update subscriptions set status = 'actief', plan = 'team', stripe_subscription_id = 'sub_test', stripe_customer_id = 'cus_test',
    billing_interval = 'month', current_period_end = now() + interval '20 days' where company_id = '${A}';
  insert into customers (company_id, name) values ('${A}', 'Klant van A'), ('${B}', 'Klant van B');
  insert into werkbonnen (id, company_id, titel, nummer, ondertekende_pdf_url, handtekening_url) values
    ('${id()}', '${A}', 'Werkbon A', 'WB-001', 'http://x/storage/v1/object/sign/signed-werkbonnen/${bestand.aWerkbon}?token=a', 'http://x/storage/v1/object/sign/signatures/${bestand.gedeeld}?token=a'),
    ('${id()}', '${B}', 'Werkbon B', 'WB-001', 'http://x/storage/v1/object/sign/signed-werkbonnen/${bestand.bOud}?token=b', 'http://x/storage/v1/object/sign/signatures/${bestand.gedeeld}?token=b');
  delete from storage.objects where name in ('${bestand.bOud}', '${bestand.gedeeld}');
  insert into storage.objects (bucket_id, name) values
    ('factuur-pdfs', '${bestand.aEigen}'), ('factuur-pdfs', '${bestand.bEigen}'),
    ('signed-werkbonnen', '${bestand.aWerkbon}'), ('signed-werkbonnen', '${bestand.bOud}'), ('signatures', '${bestand.gedeeld}')`);

// ── Inloggen via (nagebootste) Auth ──────────────────────────────────────────
const client = () => createClient(URL_, env.ANON, { auth: { persistSession: false, autoRefreshToken: false } });
async function login(k) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email: mail(k), password: 'test-wachtwoord' });
  return { c, sessie: data?.session, error };
}
const alsToken = token => createClient(URL_, env.ANON, { auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } } });
async function functie(naam, token, body = {}) {
  const r = await fetch(`${URL_}/functions/v1/${naam}`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: env.ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function storageLijst(token, bucket, prefix) {
  const r = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix }) });
  return (await r.json()).length;
}
async function toegang(token) {
  const c = alsToken(token);
  const klanten = await c.from('customers').select('name');
  const profiel = await c.from('profiles').select('actief');
  const rpc = await c.rpc('get_billing_status');
  const bestanden = await storageLijst(token, 'factuur-pdfs', `${A}/`);
  const user = await fetch(`${URL_}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
  return { klanten: klanten.error ? `fout ${klanten.status}` : klanten.data.length, profiel: profiel.data?.length ?? `fout ${profiel.status}`,
           rpc: rpc.error ? `fout ${rpc.status}` : 'ok', bestandenA: bestanden, authUser: user.status };
}
const staat = u => JSON.parse(sql(`select json_build_object('actief', p.actief, 'geband', coalesce(a.banned_until > now(), false),
  'sessies', (select count(*) from auth.sessions s where s.user_id = a.id)) from profiles p join auth.users a on a.id = p.id where p.id = '${u}'`)[0]);

const S = {};
for (const k of Object.keys(U)) {
  S[k] = await login(k);
  if (S[k].error) throw new Error(`login ${k}: ${S[k].error.message}`);
}

// ── 1. Wie mag het abonnement opzeggen (rechtstreeks verzoek) ────────────────
const voor = stripeAanroepen().length;
for (const k of ['Ma', 'Aa', 'Mb']) {
  const r = await functie('billing-cancel', S[k].sessie.access_token);
  check('stripe', `${k === 'Ma' ? 'medewerker' : k === 'Aa' ? 'niet-eigenaar-beheerder' : 'medewerker ander bedrijf'}: billing-cancel geweigerd`, r.status === 403, r);
}
for (const k of ['Ma', 'Aa']) {
  const r = await functie('billing-portal', S[k].sessie.access_token);
  check('stripe', `${k === 'Ma' ? 'medewerker' : 'niet-eigenaar-beheerder'}: billing-portal geweigerd`, r.status === 403, r);
}
const r0 = await fetch(`${URL_}/functions/v1/billing-cancel`, { method: 'POST', headers: { apikey: env.ANON } });
check('stripe', 'zonder login: billing-cancel geweigerd', r0.status === 401, r0.status);
check('stripe', 'geen enkele Stripe-aanroep door geweigerde verzoeken', stripeAanroepen().length === voor, stripeAanroepen().slice(voor));

if (process.env.MODUS === 'stripe') {
  const n = stripeAanroepen().length;
  const e = await functie('billing-cancel', S.Ea.sessie.access_token);
  check('stripe', 'eigenaar: billing-cancel toegestaan', e.status === 200 && stripeAanroepen().length > n, e);
  console.log(fouten ? `\n${fouten} van ${resultaten.length} mislukt` : `\nAlle ${resultaten.length} controles geslaagd`);
  process.exit(fouten ? 1 : 0);
}

// ── 2. Rechten binnen de database (rechtstreeks via PostgREST) ───────────────
{
  const c = alsToken(S.Ma.sessie.access_token);
  const upd = await c.from('profiles').update({ actief: false }).eq('id', U.Aa).select('id');
  check('rechten', 'medewerker kan een ander profiel niet deactiveren', (upd.data?.length ?? 0) === 0 && staat(U.Aa).actief === true, upd);
  const opz = await c.rpc('cancel_company_account');
  check('rechten', 'medewerker kan het bedrijf niet opzeggen', !!opz.error && sql(`select status from companies where id='${A}'`)[0] === 'actief', opz.error?.message);
  const c2 = alsToken(S.Aa.sessie.access_token);
  const opz2 = await c2.rpc('cancel_company_account');
  check('rechten', 'niet-eigenaar-beheerder kan het bedrijf niet opzeggen', !!opz2.error && sql(`select status from companies where id='${A}'`)[0] === 'actief', opz2.error?.message);
  const own = await c2.from('companies').update({ status: 'opgezegd' }).eq('id', A).select('id');
  check('rechten', 'niet-eigenaar-beheerder kan companies.status niet rechtstreeks op opgezegd zetten', sql(`select status from companies where id='${A}'`)[0] === 'actief', own);
  const eig = await c2.from('companies').update({ eigenaar_id: U.Aa }).eq('id', A).select('id');
  check('rechten', 'niet-eigenaar-beheerder kan zichzelf niet eigenaar maken', sql(`select eigenaar_id from companies where id='${A}'`)[0] === U.Ea, eig);
  // De superbeheerder mag de opzegvelden via de API wijzigen (zijn eigen bedrijf is
  // zichtbaar; andere bedrijven kon hij via de API al niet bijwerken, ook zonder
  // deze migraties — zie rapport).
  await alsToken(S.Sa.sessie.access_token).from('companies').update({ opgezegd_op: '2026-01-01T00:00:00Z' }).eq('id', A);
  check('rechten', 'superbeheerder wordt door de bewaking niet tegengehouden', sql(`select opgezegd_op::date from companies where id='${A}'`)[0] === '2026-01-01');
  sql(`update companies set opgezegd_op = null where id = '${A}'`);
  const naam = await c2.from('companies').update({ name: 'Testbedrijf A (nieuw)' }).eq('id', A).select('id');
  check('rechten', 'beheerder kan de bedrijfsnaam nog wel wijzigen', sql(`select name from companies where id='${A}'`)[0] === 'Testbedrijf A (nieuw)', naam);
}

// ── 3. Medewerker deactiveert zichzelf; toegang met het oude token ───────────
const maVoor = await toegang(S.Ma.sessie.access_token);
check('toegang', 'vóór: medewerker ziet klanten, profielen en bestanden van A', maVoor.klanten === 1 && maVoor.bestandenA === 1 && maVoor.rpc === 'ok' && maVoor.authUser === 200, maVoor);
{
  const del = await alsToken(S.Ma.sessie.access_token).rpc('delete_own_account');
  check('toegang', 'medewerker deactiveert eigen account', !del.error, del.error?.message);
  check('toegang', 'medewerker: profiel inactief, geblokkeerd, sessies weg', JSON.stringify(staat(U.Ma)) === '{"actief":false,"geband":true,"sessies":0}', staat(U.Ma));
  check('toegang', 'alleen het eigen account geraakt', ['Ea', 'Aa', 'Sa', 'Eb', 'Mb'].every(k => staat(U[k]).actief && !staat(U[k]).geband), Object.fromEntries(['Ea','Aa','Sa','Eb','Mb'].map(k => [k, staat(U[k])])));
  const na = await toegang(S.Ma.sessie.access_token);
  check('toegang', 'oud access token: geen klanten (database weigert)', na.klanten !== 1, na);
  check('toegang', 'oud access token: eigen profiel nog leesbaar (app ziet "gedeactiveerd")', na.profiel === 1, na);
  check('toegang', 'oud access token: RPC geweigerd', String(na.rpc).startsWith('fout'), na);
  check('toegang', 'oud access token: geen bestanden (Storage-policy)', na.bestandenA === 0, na);
  check('toegang', 'oud access token: Auth /user weigert (sessie weg)', na.authUser === 403, na);
  const f = await functie('billing-cancel', S.Ma.sessie.access_token);
  check('toegang', 'oud access token: Edge Function weigert', f.status === 401, f);
  const ref = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: S.Ma.sessie.refresh_token }) });
  check('toegang', 'refresh met oude refresh token geweigerd', ref.status === 400, ref.status);
  const opnieuw = await login('Ma');
  check('toegang', 'opnieuw inloggen geweigerd (user_banned)', !!opnieuw.error && /banned/i.test(opnieuw.error.message), opnieuw.error?.message);
  const zelf = await alsToken(S.Ma.sessie.access_token).from('profiles').update({ actief: true }).eq('id', U.Ma).select('id');
  check('toegang', 'oud access token: kan zichzelf niet heractiveren', staat(U.Ma).actief === false, zelf);
}

// ── 4. Eigenaar zegt het bedrijf op (zoals de app: eerst Stripe, dan de database)
{
  const n = stripeAanroepen().length;
  const f = await functie('billing-cancel', S.Ea.sessie.access_token);
  const nieuw = stripeAanroepen().slice(n);
  check('opzeggen', 'eigenaar: billing-cancel toegestaan', f.status === 200, f);
  check('opzeggen', 'Stripe: opzegging aan het einde van de periode (cancel_at_period_end)', nieuw.some(a => a.methode === 'POST' && a.url.startsWith('/v1/subscriptions/sub_test')), nieuw);
  check('opzeggen', 'melding noemt einde van de lopende maand', /einde van de lopende maand/.test(f.body?.bericht || ''), f.body);
  const o = await alsToken(S.Ea.sessie.access_token).rpc('cancel_company_account');
  check('opzeggen', 'eigenaar: cancel_company_account toegestaan', !o.error, o.error?.message);
  check('opzeggen', 'bedrijf A opgezegd', sql(`select status from companies where id='${A}'`)[0] === 'opgezegd');
  check('opzeggen', 'eigenaar en beheerder A: inactief, geblokkeerd, sessies weg', ['Ea', 'Aa'].every(k => JSON.stringify(staat(U[k])) === '{"actief":false,"geband":true,"sessies":0}'), { Ea: staat(U.Ea), Aa: staat(U.Aa) });
  check('opzeggen', 'superbeheerder niet geraakt', JSON.stringify(staat(U.Sa)) === '{"actief":true,"geband":false,"sessies":1}', staat(U.Sa));
  const aa = await toegang(S.Aa.sessie.access_token);
  check('opzeggen', 'beheerder A met oud token: geen klanten, geen bestanden', aa.klanten !== 1 && aa.bestandenA === 0, aa);
  const sa = await toegang(S.Sa.sessie.access_token);
  check('opzeggen', 'superbeheerder: toegang blijft', sa.klanten === 1 && sa.rpc === 'ok', sa);
  const mb = await alsToken(S.Mb.sessie.access_token).from('customers').select('name');
  const bB = await storageLijst(S.Mb.sessie.access_token, 'factuur-pdfs', `${B}/`);
  check('opzeggen', 'bedrijf B: medewerker ziet eigen klanten en bestanden', mb.data?.length === 1 && mb.data[0].name === 'Klant van B' && bB === 1, { mb: mb.data, bB });
  check('opzeggen', 'bedrijf B: niemand geraakt', ['Eb', 'Mb'].every(k => staat(U[k]).actief && !staat(U[k]).geband));
}

// ── 5. Opschoonjob: droogloop en uitvoering (echte functie `opschonen`) ───────
{
  // Stripe heeft het abonnement beëindigd (webhook) en de termijn is verstreken:
  sql(`update subscriptions set status = 'opgezegd', cancelled_at = now() - interval '3 years' where company_id = '${A}'`);
  const d = await fetch(`${URL_}/functions/v1/opschonen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cron_secret: 'lokaal-cron', droogloop: true }) });
  const dj = await d.json();
  const kandidaat = (dj.bedrijven || []).find(b => b.company_id === A);
  check('opschonen', 'droogloop: bedrijf A is kandidaat, B niet', !!kandidaat && !(dj.bedrijven || []).some(b => b.company_id === B), dj);
  check('opschonen', 'droogloop: 2 bestanden van A (eigen map), niet het oude of gedeelde', kandidaat && JSON.stringify(kandidaat.bestanden) === '{"factuur-pdfs":1,"signed-werkbonnen":1}', kandidaat?.bestanden);
  check('opschonen', 'droogloop: 3 inlogaccounts (superbeheerder niet)', kandidaat?.inlogaccounts === 3, kandidaat);
  check('opschonen', 'droogloop verwijdert niets', sql(`select count(*) from companies where id='${A}'`)[0] === '1');
  const zonder = await fetch(`${URL_}/functions/v1/opschonen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ droogloop: true }) });
  check('opschonen', 'zonder cron_secret geweigerd', zonder.status === 403, zonder.status);

  const e = await fetch(`${URL_}/functions/v1/opschonen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cron_secret: 'lokaal-cron' }) });
  const ej = await e.json();
  check('opschonen', 'uitvoering zonder fouten', e.status === 200 && (ej.fouten || []).length === 0, ej);
  const nog = n => sql(`select count(*) from storage.objects where name = '${n}'`)[0];
  check('opschonen', 'bestanden van A weg', nog(bestand.aEigen) === '0' && nog(bestand.aWerkbon) === '0');
  check('opschonen', 'bestand van B, gelijknamig oud bestand van B en gedeeld bestand blijven', nog(bestand.bEigen) === '1' && nog(bestand.bOud) === '1' && nog(bestand.gedeeld) === '1');
  check('opschonen', 'bedrijf A, klanten en werkbonnen van A weg', sql(`select (select count(*) from companies where id='${A}') + (select count(*) from customers where company_id='${A}') + (select count(*) from werkbonnen where company_id='${A}')`)[0] === '0');
  check('opschonen', 'inlogaccounts van A weg, superbeheerder blijft (profiel losgekoppeld)',
    sql(`select count(*) from auth.users where id in ('${U.Ea}','${U.Aa}','${U.Ma}')`)[0] === '0'
    && sql(`select coalesce(company_id::text, 'los') from profiles where id='${U.Sa}'`)[0] === 'los', sql(`select id from auth.users where id='${U.Sa}'`));
  check('opschonen', 'bedrijf B volledig intact', sql(`select (select count(*) from customers where company_id='${B}') || '/' || (select count(*) from werkbonnen where company_id='${B}') || '/' || (select count(*) from profiles where company_id='${B}')`)[0] === '1/1/2');
}

// ── 6. Normale werking: geen onbedoelde blokkade ────────────────────────────
{
  // Klantlink (anon): offerte van bedrijf B via het teken-token.
  const O = id(), T = id();
  sql(`insert into offertes (id, company_id, nummer, status, sign_token) values ('${O}', '${B}', 'OF-001', 'verstuurd', '${T}')`);
  const anon = await client().rpc('get_offerte_by_sign_token', { p_token: T });
  check('normaal', 'klantlink (anon): offerte via token leesbaar', !anon.error && anon.data?.length === 1, anon.error?.message);
  const ingelogd = await alsToken(S.Eb.sessie.access_token).rpc('get_offerte_by_sign_token', { p_token: T });
  check('normaal', 'klantlink geopend door een actieve ingelogde gebruiker: werkt', !ingelogd.error && ingelogd.data?.length === 1, ingelogd.error?.message);

  // Registratie: inlogaccount zonder profiel (nog geen bedrijf).
  const N = id();
  sql(`insert into auth.users (id, email, aud, role) values ('${N}', 'test-nieuw-${N.slice(0, 6)}@example.test', 'authenticated', 'authenticated')`);
  const nieuw = await client().auth.signInWithPassword({ email: `test-nieuw-${N.slice(0, 6)}@example.test`, password: 'test-wachtwoord' });
  const np = await alsToken(nieuw.data.session.access_token).from('profiles').select('id');
  const nr = await alsToken(nieuw.data.session.access_token).rpc('get_billing_status');
  check('normaal', 'nieuwe gebruiker zonder profiel: REST en RPC niet geweigerd', !np.error && !nr.error, { rest: np.error?.message, rpc: nr.error?.message });

  // Serverfuncties: service_role wordt niet door pre-request of policies geraakt.
  const sr = await createClient(URL_, env.SERVICE, { auth: { persistSession: false } }).from('companies').select('id').eq('id', B);
  check('normaal', 'service_role (cron, serverfuncties): leest gewoon', !sr.error && sr.data?.length === 1, sr.error?.message);

  // Actieve gebruiker van een ander bedrijf: alles werkt.
  const eb = await alsToken(S.Eb.sessie.access_token).from('customers').select('name');
  const ebr = await alsToken(S.Eb.sessie.access_token).rpc('get_billing_status');
  check('normaal', 'actieve gebruiker: tabellen en RPC werken', !eb.error && eb.data?.length === 1 && !ebr.error, { t: eb.error?.message, r: ebr.error?.message });

  // Edge Function met service_role (stripe-connection-status, _shared/actieveGebruiker.ts).
  const ok = await functie('stripe-connection-status', S.Eb.sessie.access_token);
  check('edge', 'actieve gebruiker: functie met service_role werkt', ok.status === 200, ok);
  // Inactief gemaakt buiten de nieuwe route om (sessie bestaat nog): de functie zelf weigert.
  sql(`update profiles set actief = false where id = '${U.Mb}'`);
  const mb = await functie('stripe-connection-status', S.Mb.sessie.access_token);
  check('edge', 'inactief profiel met geldige sessie: functie weigert (403)', mb.status === 403 && /gedeactiveerd/.test(mb.body?.error || ''), mb);
  sql(`update profiles set actief = true where id = '${U.Mb}'`);
  // Gesloten bedrijf met een nog actief lid: de functie weigert.
  sql(`update companies set status = 'opgezegd' where id = '${B}'`);
  const eb2 = await functie('stripe-connection-status', S.Eb.sessie.access_token);
  check('edge', 'lid van gesloten bedrijf: functie weigert (403)', eb2.status === 403 && /gesloten/.test(eb2.body?.error || ''), eb2);
  sql(`update companies set status = 'actief' where id = '${B}'`);
}

// ── 7. Na afloop van een opgezegd abonnement: alleen-lezen, niet geblokkeerd ─
{
  sql(`update subscriptions set stripe_subscription_id = 'sub_b', stripe_customer_id = 'cus_b', status = 'actief', stripe_status = 'active' where company_id = '${B}'`);
  const voor = await alsToken(S.Eb.sessie.access_token).from('customers').insert({ company_id: B, name: 'Nieuw tijdens looptijd' }).select('id');
  check('na afloop', 'tijdens de betaalde periode (opgezegd, nog active): schrijven werkt', !voor.error, voor.error?.message);
  // Stripe meldt na de einddatum customer.subscription.deleted → stripe_status 'canceled'.
  sql(`update subscriptions set stripe_status = 'canceled', status = 'opgezegd' where company_id = '${B}'`);
  const lees = await alsToken(S.Eb.sessie.access_token).from('customers').select('name');
  const schrijf = await alsToken(S.Eb.sessie.access_token).from('customers').insert({ company_id: B, name: 'Na afloop' }).select('id');
  check('na afloop', 'na afloop: gegevens nog leesbaar', !lees.error && lees.data?.length >= 2, lees.error?.message);
  check('na afloop', 'na afloop: niets nieuws vastleggen (alleen-lezen)', !!schrijf.error, schrijf.data);
  check('na afloop', 'na afloop: gebruikers niet gedeactiveerd, bedrijf niet gesloten', staat(U.Eb).actief && !staat(U.Eb).geband && sql(`select status from companies where id='${B}'`)[0] === 'actief');
}

fs.writeFileSync(`${process.env.LOKAAL}/resultaat.json`, JSON.stringify(resultaten, null, 1));
console.log(fouten ? `\n${fouten} controle(s) mislukt van ${resultaten.length}` : `\nAlle ${resultaten.length} controles geslaagd`);
process.exit(fouten ? 1 : 0);
