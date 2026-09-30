// Gerichte test van de statuscontrole in Edge Functions met service_role
// (_shared/actieveGebruiker.ts) en van alleen-lezen aan de serverkant.
//
// Per functie drie aanroepers: actieve gebruiker, gedeactiveerd profiel met nog
// geldige sessie, en een actief lid van een gesloten bedrijf. Bij een weigering
// wordt gecontroleerd dat er geen externe aanroep (alle externe hosts zijn
// gemockt in router.ts) en geen databasewijziging plaatsvond.
//
// Echt: Postgres, PostgREST, de functiecode. Nagebootst: Auth (/auth/v1/user).
import { createClient } from '../../../node_modules/@supabase/supabase-js/dist/index.mjs';
import { sql } from './gateway.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const URL_ = 'http://localhost:54321';
const env = Object.fromEntries(fs.readFileSync(`${process.env.LOKAAL}/sleutels.env`, 'utf8').trim().split('\n').map(r => r.split(/=(.*)/s).slice(0, 2)));
const LOG = `${process.env.LOKAAL}/stripe_aanroepen.jsonl`;
const extern = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0;
const wacht = ms => new Promise(r => setTimeout(r, ms));
// Som van alle rijwijzigingen volgens de statistieken; PostgREST-backends
// schrijven die hooguit elke seconde weg, daarom even wachten.
// Exacte schrijfmeting (alleen in de lokale testdatabase): een rij-trigger op
// elke tabel in public en op storage.objects schrijft elke wijziging weg in
// test_schrijflog. Synchroon, dus geen last van vertraagde statistieken.
sql(`create table if not exists public.test_schrijflog (tabel text, op text, op_tijd timestamptz default clock_timestamp());
  create or replace function public.test_schrijflog_trg() returns trigger language plpgsql security definer as $f$
  begin insert into public.test_schrijflog (tabel, op) values (tg_table_schema || '.' || tg_table_name, tg_op); return null; end $f$;
  do $d$ declare t record; begin
    for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'test_schrijflog' loop
      execute format('drop trigger if exists test_schrijflog on public.%I', t.relname);
      execute format('create trigger test_schrijflog after insert or update or delete on public.%I for each row execute function public.test_schrijflog_trg()', t.relname);
    end loop;
    drop trigger if exists test_schrijflog on storage.objects;
    create trigger test_schrijflog after insert or update or delete on storage.objects for each row execute function public.test_schrijflog_trg();
  end $d$`);
async function schrijfteller() { return Number(sql(`select count(*) from public.test_schrijflog`)[0]); }

let fouten = 0; const res = [];
const check = (g, n, ok, d) => { res.push({ g, n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${g}] ${n}${ok ? '' : `  → ${JSON.stringify(d).slice(0, 400)}`}`); if (!ok) fouten++; };

const id = () => crypto.randomUUID();
const A = id(), D = id(), Z = id();
const U = { actief: id(), inactief: id(), gesloten: id() };
const mail = k => `fn-${k}-${A.slice(0, 6)}@example.test`;
sql(`insert into auth.users (id, email, aud, role) values ${Object.entries(U).map(([k, v]) => `('${v}', '${mail(k)}', 'authenticated', 'authenticated')`).join(',')};
  insert into companies (id, name, status) values ('${A}', 'Fn actief', 'actief'), ('${D}', 'Fn inactief', 'actief'), ('${Z}', 'Fn gesloten', 'actief');
  insert into profiles (id, company_id, role, actief) values ('${U.actief}', '${A}', 'admin', true), ('${U.inactief}', '${D}', 'admin', true), ('${U.gesloten}', '${Z}', 'admin', true);
  update companies set eigenaar_id = '${U.actief}' where id = '${A}'; update companies set eigenaar_id = '${U.inactief}' where id = '${D}'; update companies set eigenaar_id = '${U.gesloten}' where id = '${Z}'`);

const S = {};
for (const k of Object.keys(U)) {
  const { data, error } = await createClient(URL_, env.ANON, { auth: { persistSession: false } }).auth.signInWithPassword({ email: mail(k), password: 'test-wachtwoord' });
  if (error) throw error; S[k] = data.session.access_token;
}
// Inactief buiten de nieuwe route om (sessie blijft bestaan); bedrijf Z gesloten.
sql(`update profiles set actief = false where id = '${U.inactief}'; update companies set status = 'opgezegd' where id = '${Z}'`);

const FUNCTIES = {
  'afas-import-kosten': {}, 'afas-sync-contacten': {},
  'boss-chat': { messages: [{ role: 'user', content: 'hoi' }] },
  'create-notification': { userId: U.actief, title: 'test', type: 'info' },
  'getekende-pdf-nazenden': { soort: 'offerte', id: id() },
  'google-calendar-auth-url': {}, 'moneybird-update-contact': { customerId: id() },
  'offerte-pdf-url': { offerteId: id() },
  'send-email': { to: 'ontvanger@example.test', subject: 'test', html: '<p>test</p>' },
  'stripe-connect-start': {}, 'stripe-connection-status': {},
  'sync-activity-to-google': { activity_id: id() },
  'stripe-create-payment-link': { factuurId: id() },
  meldpunt: { soort: 'bug', omschrijving: 'test' },
  'document-url': { soort: 'werkbon_pdf', id: id() },
};
const ONZE = /gedeactiveerd|gesloten/;

async function roep(naam, token, body) {
  const r = await fetch(`${URL_}/functions/v1/${naam}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: env.ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const tekst = await r.text(); let j = null; try { j = JSON.parse(tekst); } catch {}
  return { status: r.status, fout: j?.error ?? (j ? null : tekst.slice(0, 80)) };
}

// Volgorde in de code: de controle staat vóór de eerste gegevens- of externe actie.
for (const naam of Object.keys(FUNCTIES)) {
  const src = fs.readFileSync(`../../functions/${naam}/index.ts`, 'utf8').split('\n');
  const g = src.findIndex(r => /auth\.getUser\(/.test(r) && !/getUserById/.test(r));
  const c = src.findIndex((r, i) => i > g && /inactiefReden\(/.test(r));
  const eerste = src.findIndex((r, i) => i > g && i !== c && /(\.from\(|\.rpc\(|fetch\(|stripeFetch|\.storage)/.test(r) && !/createClient/.test(r));
  check('volgorde', `${naam}: controle (regel ${c + 1}) vóór eerste data/externe actie (regel ${eerste + 1})`, g >= 0 && c > g && (eerste === -1 || c < eerste), { g, c, eerste });
}

for (const [naam, body] of Object.entries(FUNCTIES)) {
  // Eerst de weigeringen, dan de actieve gebruiker: anders telt een vertraagde
  // statistiek van de actieve aanroep mee als "databasewijziging".
  for (const soort of ['inactief', 'gesloten']) {
    const e0 = extern(); const w0 = await schrijfteller();
    const r = await roep(naam, S[soort], body);
    const w1 = await schrijfteller(); const e1 = extern();
    const verwacht = soort === 'inactief' ? /gedeactiveerd/ : /gesloten/;
    check('functie', `${naam}: ${soort === 'inactief' ? 'gedeactiveerd profiel' : 'gesloten bedrijf'} → 403, geen externe aanroep, geen databasewijziging`,
      r.status === 403 && verwacht.test(String(r.fout)) && e1 === e0 && w1 === w0, { r, extern: e1 - e0, db: w1 - w0 });
  }
  const a = await roep(naam, S.actief, body);
  check('functie', `${naam}: actieve gebruiker komt langs de controle (${a.status})`, !(a.status === 403 && ONZE.test(String(a.fout))) && a.status !== 401, a);
}

// ── Alleen-lezen na afloop van een opgezegd abonnement (serverkant) ─────────
{
  sql(`update subscriptions set stripe_subscription_id = 'sub_ro_${A.slice(0, 6)}', stripe_customer_id = 'cus_ro_${A.slice(0, 6)}', status = 'opgezegd', stripe_status = 'canceled' where company_id = '${A}';
       insert into customers (id, company_id, name) values ('${A}', '${A}', 'Bestaande klant')`);
  const c = createClient(URL_, env.ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${S.actief}` } } });
  const ro = await c.rpc('bb_is_readonly');
  check('alleen-lezen', 'bb_is_readonly = true na afloop', ro.data === true, ro);
  const lees = await c.from('customers').select('id, name');
  check('alleen-lezen', 'bekijken werkt (klanten lezen)', !lees.error && lees.data?.length === 1, lees.error?.message);
  const ins = await c.from('customers').insert({ company_id: A, name: 'Nieuw' }).select('id');
  check('alleen-lezen', 'database: nieuwe klant geweigerd', !!ins.error, ins.data);
  const W = id();
  sql(`insert into werkbonnen (id, company_id, titel) values ('${W}', '${A}', 'Bestaande werkbon')`);
  const uren = await c.from('werkbon_uren').insert({ company_id: A, werkbon_id: W, profile_id: U.actief, datum: '2026-09-30', uren: 1 }).select('id');
  check('alleen-lezen', 'database: uren boeken op een werkbon geweigerd', !!uren.error, uren.data);
  const upd = await c.from('customers').update({ name: 'Gewijzigd' }).eq('id', A).select('id');
  check('alleen-lezen (vastgelegd, niet geblokkeerd)', 'bestaande klant wijzigen is NIET geblokkeerd (ontwerp: alleen nieuw werk dicht)', !upd.error && upd.data?.length === 1, upd);
  const verstuur = await roep('send-email', S.actief, { to: 'x@example.test', subject: 't', html: 't' });
  check('alleen-lezen', 'Edge Function send-email: versturen geweigerd', verstuur.status >= 400 && /abonnement|readonly|alleen/i.test(String(verstuur.fout)), verstuur);
  const e0 = extern();
  const checkout = await roep('billing-checkout', S.actief, { tier: 'team', interval: 'month' });
  check('alleen-lezen', 'opnieuw abonneren (billing-checkout) blijft mogelijk voor de eigenaar', checkout.status !== 403, { checkout, stripe: extern() - e0 });
}

// ── document-url: korte links, alleen na controle ───────────────────────────
{
  const W = id(), T = id(), Wb = id();
  sql(`insert into storage.buckets (id, name, public) values ('signed-werkbonnen','signed-werkbonnen',false), ('signatures','signatures',false) on conflict do nothing;
       insert into storage.objects (bucket_id, name) values ('signed-werkbonnen', '${A}/werkbon-${W}.pdf'), ('signatures', 'werkbon-${W}.png'), ('signatures', 'werkbon-oud-${W}.png');
       insert into werkbonnen (id, company_id, titel, sign_token, ondertekende_pdf_url, handtekening_url) values
         ('${W}', '${A}', 'Doc-test', '${T}', 'signed-werkbonnen/${A}/werkbon-${W}.pdf', 'signatures/werkbon-${W}.png'),
         ('${Wb}', '${A}', 'Doc-test oud', '${id()}', null, 'https://x.supabase.co/storage/v1/object/sign/signatures/werkbon-oud-${W}.png?token=oud')`);
  const doc = async (token, body) => {
    const r = await fetch(`${URL_}/functions/v1/document-url`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: env.ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const eigen = await doc(S.actief, { soort: 'werkbon_pdf', id: W });
  check('document-url', 'eigen bedrijf (ingelogd): korte link, 600 seconden', eigen.status === 200 && /geldig=600/.test(eigen.body?.url || '') && eigen.body?.geldig_seconden === 600, eigen);
  const ander = await doc(S.gesloten, { soort: 'werkbon_pdf', id: W });
  check('document-url', 'lid van een ander (gesloten) bedrijf: geweigerd', ander.status === 403 || ander.status === 404, ander);
  sql(`update companies set status = 'actief' where id = '${Z}'`);
  const ander2 = await doc(S.gesloten, { soort: 'werkbon_pdf', id: W });
  check('document-url', 'actief lid van een ander bedrijf: niet gevonden', ander2.status === 404, ander2);
  sql(`update companies set status = 'opgezegd' where id = '${Z}'`);
  const klant = await doc(env.ANON, { soort: 'werkbon_handtekening', token: T });
  check('document-url', 'klantlink met juist token (anon): korte link', klant.status === 200 && /geldig=600/.test(klant.body?.url || ''), klant);
  const fout = await doc(env.ANON, { soort: 'werkbon_handtekening', token: id() });
  check('document-url', 'klantlink met verkeerd token: niet gevonden', fout.status === 404, fout);
  const zonder = await doc(env.ANON, { soort: 'werkbon_pdf', id: W });
  check('document-url', 'anon zonder token, met id: geweigerd', zonder.status === 401, zonder);
  const oud = await doc(S.actief, { soort: 'werkbon_handtekening', id: Wb });
  check('document-url', 'oude rij met lange URL: pad eruit gehaald, korte link', oud.status === 200 && /werkbon-oud-/.test(oud.body?.url || '') && /geldig=600/.test(oud.body.url), oud);
}

console.log(fouten ? `\n${fouten} van ${res.length} mislukt` : `\nAlle ${res.length} controles geslaagd`);
process.exit(fouten ? 1 : 0);
