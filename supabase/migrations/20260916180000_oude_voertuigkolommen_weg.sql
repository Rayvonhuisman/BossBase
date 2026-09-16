-- Oude voertuigkolommen weg: werkbonnen.voertuig_id en activities.voertuig_id.
--
-- ── LET OP: volgorde ────────────────────────────────────────────────────────
-- Dit bestand stond als .sql.pending, zodat `supabase db push` het oversloeg.
-- De frontend van vóór 20260916120000 leest werkbonnen met de relatie
-- voertuigen(naam, kleur) — die loopt via werkbonnen.voertuig_id. Staat die
-- frontend nog live als deze migratie draait, dan faalt ELKE werkbon-select.
--
-- Uitrollen:
--   1. 20260916120000_voertuigen_per_dag.sql (via db push)
--   2. frontend naar main, Vercel-build klaar en live
--   3. dit bestand (stond als .sql.pending) actief maken, db push --dry-run, db push
--   4. npm run migratie:check -- werkbonnen activities
--
-- Heette eerst 20260916130000. Hernoemd naar 180000 omdat 20260916170000
-- (mailfouten) eerder in productie stond; zo klopt de volgorde van de bestanden
-- met de volgorde waarin ze gedraaid zijn.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een werkbon had één voertuig (voertuig_id). Sinds 20260916120000 staan
-- voertuigen per werkbon en per dag (werkbonnen.voertuig_ids,
-- werkbon_dagen.voertuig_ids / voertuig_tijden / medewerker_voertuig). Twee
-- plekken voor hetzelfde gegeven laten staan is vragen om een scherm dat de
-- verkeerde leest.
--
-- activities.voertuig_id stond in geen enkele migratie (alleen in productie),
-- had geen foreign key en geen abonnementscontrole, en is nooit gevuld.
-- Voertuigen worden ingepland op de dagen van een werkbon; een activiteit is
-- geen klus. Weghalen in plaats van dichttimmeren.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Gemeten 16-09-2026:
--   werkbonnen.voertuig_id  148 rijen gevuld, waarvan 142 van het testbedrijf
--                           TEST Stamvol Bouw BV; de overige 6 zijn ook testdata
--                           (akkoord gebruiker: "de huidige gegevens zijn
--                           testdata, mag weg"). Niet overgezet.
--   activities.voertuig_id  0 rijen gevuld.
-- Afhankelijkheden in productie: alleen de foreign key
-- werkbonnen_voertuig_id_fkey en de triggerfunctie bb_check_werkbon_voertuig
-- (trigger trg_werkbon_voertuig_feature). Geen views, policies of indexen.


-- ── De wijziging ────────────────────────────────────────────────────────────
drop trigger if exists trg_werkbon_voertuig_feature on public.werkbonnen;
drop function if exists public.bb_check_werkbon_voertuig();

-- De foreign key naar voertuigen gaat mee met de kolom.
alter table public.werkbonnen drop column if exists voertuig_id;
alter table public.activities drop column if exists voertuig_id;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Zie _TEMPLATE.sql. Na het pushen:
--   npm run migratie:check -- werkbonnen activities
notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name in ('werkbonnen', 'activities')
      and column_name = 'voertuig_id') as oude_kolommen,
  (select count(*) from pg_trigger where tgname = 'trg_werkbon_voertuig_feature') as oude_trigger,
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'bb_check_werkbon_voertuig') as oude_functie,
  (select count(*) from pg_constraint where confrelid = 'public.voertuigen'::regclass) as fks_naar_voertuigen;
