-- TRUNCATE weghalen bij anon en authenticated, schemabreed.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Supabase kent standaard alle tabelrechten toe aan anon en authenticated, met
-- RLS als beschermlaag. Voor SELECT, INSERT, UPDATE en DELETE werkt dat: een
-- policy filtert de rijen en een client komt niet buiten zijn eigen bedrijf.
--
-- TRUNCATE is de uitzondering. Postgres past er geen RLS op toe — het is geen
-- rij-operatie maar een tabel-operatie. Gemeten in een teruggedraaide
-- transactie kon de anon-rol `truncate accounting_connections cascade` gewoon
-- uitvoeren, en dat wist de boekhoudkoppeling van élk bedrijf in één keer.
--
-- Er is op dit moment geen route waarlangs een buitenstaander dat aanroept:
-- PostgREST biedt geen TRUNCATE. Het is dus geen open gat maar een recht dat
-- klaarligt voor het moment dat er wél zo'n route ontstaat — een nieuwe RPC, een
-- functie die dynamische SQL uitvoert. Zulke rechten hoor je niet te bewaren
-- voor later.
--
-- Gecontroleerd vóór het schrijven: nergens in de app, de edge functions, de
-- scripts, de seeds of de bestaande migraties staat een TRUNCATE. De enige
-- treffers waren commentaarregels die juist vastleggen dat er niet getruncate't
-- wordt. Dit neemt dus niets weg wat in gebruik is.
--
-- Alleen TRUNCATE, bewust niets anders: de publieke ondertekenpagina van een
-- offerte schrijft als anon een regel in klant_tijdlijn, dus een bredere revoke
-- op INSERT zou dat breken.

do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as tabel
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')   -- gewone en gepartitioneerde tabellen
  loop
    execute format('revoke truncate on table %s from anon, authenticated', r.tabel);
  end loop;
end $$;

-- Zonder dit krijgt elke NIEUWE tabel het recht via de default privileges weer
-- terug. Migraties draaien als `postgres`, dus dit dekt alles wat wij aanmaken.
--
-- Wat het NIET dekt: een tabel die door een andere rol wordt aangemaakt — een
-- tabel via het Supabase-dashboard komt van `supabase_admin`, en op diens
-- default privileges hebben wij geen recht (`permission denied to change default
-- privileges`; geprobeerd, werkt niet). Maak je een tabel in het dashboard, doe
-- de revoke er dan zelf bij. Het sjabloon in supabase/migrations/_TEMPLATE.sql
-- wijst daar ook op.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Vaste afsluiting van elke migratie; zie CLAUDE.md, "Database en migraties".
-- Hier van belang omdat deze migratie uitsluitend uit REVOKE bestaat, en juist
-- dat commando staat niet in de lijst waar pgrst_ddl_watch op luistert.
notify pgrst, 'reload schema';
