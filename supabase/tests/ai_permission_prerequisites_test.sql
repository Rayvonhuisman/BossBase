-- =============================================================================
-- ai_permission_prerequisites_test.sql
--
-- De rechtenaannames waar de AI-assistent op gaat leunen, als test.
--
--     supabase db query --db-url "<TESTDATABASE>" -f supabase/tests/ai_permission_prerequisites_test.sql
--
-- ⚠ NIET TEGEN PRODUCTIE DRAAIEN — OOK NIET MET ROLLBACK.
--   Deze test maakt bedrijven, auth-gebruikers, klanten, offertes, facturen,
--   werkbonnen en uren aan. De transactie draait aan het eind alles terug, maar
--   dat is geen garantie: triggers kunnen buiten de transactie werken (pg_net,
--   pg_cron), sequences lopen door, en één verkeerd getypte ROLLBACK is genoeg.
--   Draai dit uitsluitend tegen een wegwerpdatabase die aantoonbaar niet de
--   productie-ref is. Zie docs/DATABASE_BASELINE_STRATEGY.md §9.
--
-- WAAROM DEZE TEST BESTAAT
-- De AI-assistent gaat straks vragen beantwoorden over echte bedrijfsdata. Het
-- uitgangspunt is dat hij nooit méér ziet dan de ingelogde gebruiker. Dat
-- uitgangspunt is precies zo veel waard als de RLS eronder. Uit de audit van
-- 8 september kwamen twee gaten die dat uitgangspunt vandaag breken:
--
--   1. bb_has_permission() is `role IN ('admin','planner') OR <expliciet recht>`.
--      Een planner slaagt dus voor ELKE rechtencontrole — ook `facturen` en
--      `offertes`. Vraagt een planner de AI straks naar de omzet, dan krijgt
--      hij die, zonder dat iemand hem dat recht ooit gaf.
--   2. De SELECT-policy op werkbon_uren is puur `company_id = current_company_id()`.
--      De werkbon zelf zit achter toewijzing, de uren erop niet. Elke
--      medewerker kan dus de uren van elke collega lezen.
--
-- STATUS — hardening v3, op het schema van 4 oktober 2026 (origin/main 3cee394)
-- De compagnon heeft op 2 en 3 oktober de rol planner afgeschaft
-- (20261002135952: geen bypass, geen rolpolicies, profiles.role is admin of
-- medewerker) en het schrijven op werkbon_uren aan zeggenschap gebonden
-- (20261002135712). Drie dingen stonden daarna nog open en zijn het onderwerp
-- van de migraties 20261004190000, 20261004200000 en 20261004201000:
--
--   * een recht telde ook als de rij bij een ander bedrijf hoorde, en een
--     beheerder kon zo'n rij aanmaken;
--   * de gedeelde werkruimte (Groei) gaf inzage in deals, offertes, facturen,
--     kosten, tijdlijn, mailarchief, PDF's en bijlagen zonder recht, en Groei
--     had geen rechtenbeheer om het recht te geven;
--   * werkbon_uren_select was alleen een company_id-controle.
--
-- Het model dat deze tests vastleggen:
--   admin        alles binnen het eigen bedrijf
--   medewerker   toegewezen werk en eigen uren; financieel alleen met een recht
--   planning     teamuren bekijken en beheren
--   gedeelde_werkruimte   operationele samenwerking, NOOIT financiele inzage
--   niemand      ziet iets van een ander bedrijf, en geen recht telt daarbuiten
--
-- Elke test is een gewone `check`: rood is een lek of een regressie.
-- Voormeting en eindmeting staan in docs/security/.
--
-- De helper check_rood() blijft staan voor een toekomstig bekend gat. Vindt
-- iemand later een nieuw gat, dan kan hij het op dezelfde manier vastleggen:
-- eerst als beschrijving van het probleem, daarna als bewijs van de oplossing,
-- zonder dat er iets aan de test verandert behalve die ene functienaam.
--
-- WAT DE TEST NIET DOET
-- Er wordt geen enkel recht toegekend aan een bestaande gebruiker en geen
-- enkele policy of functie gewijzigd. Alles wat hier gebeurt is fixture-data
-- binnen één transactie die eindigt op ROLLBACK.
-- =============================================================================

BEGIN;

SET LOCAL client_min_messages TO NOTICE;

-- ── Testhulp ─────────────────────────────────────────────────────────────────
-- Uitslagen gaan in een tabel, niet in RAISE NOTICE: we draaien deze scripts via
-- de Management API en die geeft NOTICE- en WARNING-regels niet terug. Zou een
-- test falen met alleen een WARNING, dan zag je "geen fout" en dus ten onrechte
-- groen. Nu is elke uitslag een RIJ die je terugkrijgt.
CREATE TEMP TABLE ap_resultaat (
  nr           serial primary key,
  naam         text,
  geslaagd     boolean,
  verwacht_rood boolean NOT NULL DEFAULT false,
  detail       text
) ON COMMIT DROP;

GRANT ALL ON ap_resultaat TO authenticated, service_role;
GRANT ALL ON SEQUENCE ap_resultaat_nr_seq TO authenticated, service_role;

-- Moet nu groen zijn.
CREATE OR REPLACE FUNCTION pg_temp.check(p_naam text, p_werkelijk anyelement, p_verwacht anyelement)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ok boolean := p_werkelijk IS NOT DISTINCT FROM p_verwacht;
BEGIN
  INSERT INTO ap_resultaat (naam, geslaagd, verwacht_rood, detail)
  VALUES (p_naam, ok, false, CASE WHEN ok THEN NULL
    ELSE format('verwacht %s, kreeg %s', COALESCE(p_verwacht::text,'NULL'), COALESCE(p_werkelijk::text,'NULL')) END);
  IF ok THEN RAISE NOTICE 'PASS  %', p_naam;
  ELSE RAISE WARNING 'FAIL  %  (verwacht %, kreeg %)', p_naam,
    COALESCE(p_verwacht::text,'NULL'), COALESCE(p_werkelijk::text,'NULL');
  END IF;
END $$;

-- Documenteert een bekend gat. Rood = zoals verwacht. Groen = de fix is er.
CREATE OR REPLACE FUNCTION pg_temp.check_rood(p_naam text, p_werkelijk anyelement, p_verwacht anyelement)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ok boolean := p_werkelijk IS NOT DISTINCT FROM p_verwacht;
BEGIN
  INSERT INTO ap_resultaat (naam, geslaagd, verwacht_rood, detail)
  VALUES (p_naam, ok, true, CASE WHEN ok THEN 'FIX GELAND — zet check_rood om naar check'
    ELSE format('nog open: verwacht %s, kreeg %s', COALESCE(p_verwacht::text,'NULL'), COALESCE(p_werkelijk::text,'NULL')) END);
  IF ok THEN RAISE NOTICE 'GROEN (was rood)  %  → fix geland', p_naam;
  ELSE RAISE NOTICE 'ROOD (verwacht)   %  → %', p_naam,
    format('verwacht %s, kreeg %s', COALESCE(p_verwacht::text,'NULL'), COALESCE(p_werkelijk::text,'NULL'));
  END IF;
END $$;

-- Telt hoeveel rijen de huidige rol ziet. Eén helper, zodat elke zichtbaarheids-
-- test er hetzelfde uitziet en er geen count-query's uit de bocht vliegen.
CREATE OR REPLACE FUNCTION pg_temp.zichtbaar(p_sql text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  EXECUTE p_sql INTO n;
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;   -- geen leesrecht op tabelniveau; anders dan "nul rijen"
END $$;

-- Voert een schrijfactie uit en meldt of hij erdoor kwam. Alleen de twee fouten
-- die een policy oplevert worden gevangen; al het andere (typefout, ontbrekende
-- kolom) knalt door, want dat is een fout in de test zelf. Zelfde patroon als
-- readonly_test.sql.
CREATE OR REPLACE FUNCTION pg_temp.lukt(p_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RETURN false;
END $$;

-- Roept een RPC aan en meldt of hij erdoor kwam. Een functie die de aanroeper
-- weigert doet dat met RAISE EXCEPTION (P0001) of met 42501; die twee worden
-- gevangen, al het andere knalt door.
CREATE OR REPLACE FUNCTION pg_temp.rpc_lukt(p_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
  RETURN false;
END $$;

-- Hoeveel rijen raakte deze schrijfactie werkelijk? `lukt()` meet alleen of er
-- geen fout kwam, en een UPDATE die door RLS nul rijen te pakken krijgt is geen
-- fout. Voor "hij mag er niet bij" is het aantal geraakte rijen de juiste maat.
CREATE OR REPLACE FUNCTION pg_temp.geraakt(p_sql text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RETURN -1;   -- geweigerd door een policy; anders dan "nul rijen geraakt"
END $$;

-- Wisselt naar een gebruiker. Zelfde aanpak als readonly_test.sql: de claims in
-- de sessie zetten en dan pas de rol wisselen, want na SET ROLE mag je set_config
-- niet meer aanroepen.
CREATE OR REPLACE FUNCTION pg_temp.word(p_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
END $$;

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- Twee bedrijven met identieke inhoud. Alles met de prefix AP-TEST.
--
-- BELANGRIJK — het abonnement staat op `team` en niet op `groei`.
-- bb_gedeelde_werkruimte() is bb_has_feature('gedeelde_werkruimte'), en die
-- feature zit op `groei`. Op dat plan ziet iedereen binnen het bedrijf alles en
-- zijn de granulaire rechten uitgeschakeld — dan meet deze test niets. `team`
-- heeft juist `rollen_rechten` en géén gedeelde werkruimte; dat is het plan
-- waar het rechtenmodel echt geldt.
DO $$
DECLARE
  ca uuid := '00000000-0000-4000-a000-0000000a0001';   -- bedrijf A
  cb uuid := '00000000-0000-4000-a000-0000000b0001';   -- bedrijf B
  -- bedrijf A
  ua_admin   uuid := '00000000-0000-4000-a000-0000000a0011';
  ua_planner uuid := '00000000-0000-4000-a000-0000000a0012';  -- (ex-)planner: medewerker ZONDER enig recht
  ua_plan_ok uuid := '00000000-0000-4000-a000-0000000a0016';  -- medewerker MET expliciet recht 'planning'
  ua_mw      uuid := '00000000-0000-4000-a000-0000000a0013';
  ua_mw2     uuid := '00000000-0000-4000-a000-0000000a0014';  -- collega, om urenlekken te meten
  ua_fin     uuid := '00000000-0000-4000-a000-0000000a0015';  -- medewerker MET expliciet recht 'facturen'
  -- bedrijf B
  ub_admin   uuid := '00000000-0000-4000-a000-0000000b0011';
  ub_mw      uuid := '00000000-0000-4000-a000-0000000b0013';
  -- bedrijf C: pakket `groei`, dus MET gedeelde werkruimte
  cc         uuid := '00000000-0000-4000-a000-0000000c0001';
  uc_admin   uuid := '00000000-0000-4000-a000-0000000c0011';
  uc_mw      uuid := '00000000-0000-4000-a000-0000000c0013';  -- tweede persoon, geen enkel recht
  -- bedrijf A, gedeactiveerd
  ua_inact   uuid := '00000000-0000-4000-a000-0000000a0017';
  v_stage_a uuid;
  v_stage_b uuid;
  v_stage_c uuid;
BEGIN
  INSERT INTO public.companies (id, name) VALUES
    (ca, 'AP-TEST bedrijf A'),
    (cb, 'AP-TEST bedrijf B'),
    (cc, 'AP-TEST bedrijf C (groei)');

  -- bb_seed_trial_subscription() heeft al een trial-rij gezet. Naar `team`, en
  -- ver genoeg in de toekomst dat bb_is_readonly() niet aanslaat.
  UPDATE public.subscriptions
     SET plan = 'team', status = 'actief',
         trial_ends_at = now() + interval '365 days',
         current_period_end = now() + interval '365 days'
   WHERE company_id IN (ca, cb);

  -- Bedrijf C op `groei`: het enige pakket met gedeelde_werkruimte. Hier meten
  -- we dat de feature samenwerking geeft en geen financiele inzage.
  UPDATE public.subscriptions
     SET plan = 'groei', status = 'actief',
         trial_ends_at = now() + interval '365 days',
         current_period_end = now() + interval '365 days'
   WHERE company_id = cc;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.mail, '', now(), now(), now(), '', '', '', ''
  FROM (VALUES
    (ua_admin,   'ap-test-a-admin@bossbase.test'),
    (ua_planner, 'ap-test-a-planner@bossbase.test'),
    (ua_plan_ok, 'ap-test-a-planner-ok@bossbase.test'),
    (ua_mw,      'ap-test-a-mw@bossbase.test'),
    (ua_mw2,     'ap-test-a-mw2@bossbase.test'),
    (ua_fin,     'ap-test-a-fin@bossbase.test'),
    (ub_admin,   'ap-test-b-admin@bossbase.test'),
    (ub_mw,      'ap-test-b-mw@bossbase.test'),
    (uc_admin,   'ap-test-c-admin@bossbase.test'),
    (uc_mw,      'ap-test-c-mw@bossbase.test'),
    (ua_inact,   'ap-test-a-inactief@bossbase.test')
  ) AS u(id, mail)
  ON CONFLICT (id) DO NOTHING;

  -- handle_new_user() maakt al een profielrij; hier zetten we bedrijf en rol.
  INSERT INTO public.profiles (id, company_id, full_name, role) VALUES
    (ua_admin,   ca, 'AP-TEST A admin',        'admin'),
    -- Sinds 20261002135952 bestaat de rol planner niet meer; profiles.role is
    -- admin of medewerker. ua_planner is een medewerker ZONDER recht (de naam
    -- bleef, zodat de tests leesbaar blijven voor wie de historie kent) en
    -- ua_plan_ok een medewerker MET het recht planning.
    (ua_planner, ca, 'AP-TEST A planner',      'medewerker'),
    (ua_plan_ok, ca, 'AP-TEST A planner+recht', 'medewerker'),
    (ua_mw,      ca, 'AP-TEST A medewerker',   'medewerker'),
    (ua_mw2,     ca, 'AP-TEST A collega',      'medewerker'),
    (ua_fin,     ca, 'AP-TEST A fin',          'medewerker'),
    (ub_admin,   cb, 'AP-TEST B admin',        'admin'),
    (ub_mw,      cb, 'AP-TEST B medewerker',   'medewerker'),
    (uc_admin,   cc, 'AP-TEST C admin',        'admin'),
    (uc_mw,      cc, 'AP-TEST C medewerker',   'medewerker'),
    (ua_inact,   ca, 'AP-TEST A inactief',     'medewerker')
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id, role = EXCLUDED.role;

  -- Gedeactiveerd teamlid: de restrictive policy bb_alleen_actieve_gebruikers
  -- (20260930182000) hoort hem overal buiten te houden, ook bij zijn eigen rijen.
  UPDATE public.profiles SET actief = false WHERE id = ua_inact;

  -- Rechten. Bewust minimaal:
  --   planner_a krijgt NIETS. Dat is de kern van de test — vandaag komt hij
  --   overal langs puur omdat hij planner heet, niet omdat iemand hem een recht
  --   gaf. Hem hier `alles_inzien` of `facturen` geven zou precies verhullen
  --   wat we willen meten.
  --   mw_a krijgt NIETS.
  --   fin_a krijgt ALLEEN `facturen`, om te bewijzen dat een expliciet recht
  --   werkt zonder dat de rol iets doet.
  --   plan_ok krijgt ALLEEN `planning` — een operationeel recht, geen financieel.
  --   Zo is te zien hoe een planner er NA de fix uit hoort te zien: hij houdt
  --   zijn planningswerk via een expliciet recht, en krijgt de financiele kant
  --   daar niet gratis bij. Bewust GEEN `alles_inzien` en geen financieel recht.
  INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
  VALUES (ca, ua_fin,     'facturen', true),
         (ca, ua_plan_ok, 'planning', true);

  -- Inhoud per bedrijf. Identiek van vorm, zodat "ziet nul rijen van de ander"
  -- betekenisvol is.
  SELECT id INTO v_stage_a FROM public.pipeline_stages WHERE company_id = ca ORDER BY position LIMIT 1;
  SELECT id INTO v_stage_b FROM public.pipeline_stages WHERE company_id = cb ORDER BY position LIMIT 1;

  INSERT INTO public.customers (id, company_id, name) VALUES
    ('00000000-0000-4000-a000-0000000a0021', ca, 'AP-TEST klant A'),
    ('00000000-0000-4000-a000-0000000b0021', cb, 'AP-TEST klant B');

  INSERT INTO public.deals (id, company_id, customer_id, stage_id, title, expected_revenue) VALUES
    ('00000000-0000-4000-a000-0000000a0031', ca, '00000000-0000-4000-a000-0000000a0021', v_stage_a, 'AP-TEST deal A', 5000),
    ('00000000-0000-4000-a000-0000000b0031', cb, '00000000-0000-4000-a000-0000000b0021', v_stage_b, 'AP-TEST deal B', 7000);

  INSERT INTO public.offertes (id, company_id, customer_id, nummer, status, totaal_excl, totaal_incl) VALUES
    ('00000000-0000-4000-a000-0000000a0041', ca, '00000000-0000-4000-a000-0000000a0021', 'AP-A-O1', 'verzonden', 1000, 1210),
    ('00000000-0000-4000-a000-0000000b0041', cb, '00000000-0000-4000-a000-0000000b0021', 'AP-B-O1', 'verzonden', 2000, 2420);

  INSERT INTO public.facturen (id, company_id, customer_id, nummer, status, totaal_excl, totaal_incl) VALUES
    ('00000000-0000-4000-a000-0000000a0051', ca, '00000000-0000-4000-a000-0000000a0021', 'AP-A-F1', 'verzonden', 1000, 1210),
    ('00000000-0000-4000-a000-0000000b0051', cb, '00000000-0000-4000-a000-0000000b0021', 'AP-B-F1', 'verzonden', 2000, 2420);

  -- Regels onder de offertes en facturen. Zonder deze regels zouden de RODE
  -- tests op factuur_regels en offerte_items nul tellen voor iedereen, en dan
  -- lijkt het gat gedicht terwijl er alleen niets te zien viel.
  INSERT INTO public.offerte_items (offerte_id, company_id, omschrijving, aantal, prijs_per, subtotaal) VALUES
    ('00000000-0000-4000-a000-0000000a0041', ca, 'AP-TEST regel A', 1, 1000, 1000),
    ('00000000-0000-4000-a000-0000000b0041', cb, 'AP-TEST regel B', 1, 2000, 2000);

  INSERT INTO public.factuur_regels (factuur_id, company_id, omschrijving, aantal, eenheidsprijs, regelprijs) VALUES
    ('00000000-0000-4000-a000-0000000a0051', ca, 'AP-TEST regel A', 1, 1000, 1000),
    ('00000000-0000-4000-a000-0000000b0051', cb, 'AP-TEST regel B', 1, 2000, 2000);

  -- Werkbonnen: in bedrijf A één toegewezen aan mw en één aan de collega. Zo is
  -- te meten of "geen toegang tot de bon" ook echt "geen toegang tot de uren"
  -- betekent.
  INSERT INTO public.werkbonnen (id, company_id, customer_id, titel, status, assigned_to_ids) VALUES
    ('00000000-0000-4000-a000-0000000a0061', ca, '00000000-0000-4000-a000-0000000a0021', 'AP-TEST bon A (mw)',      'gepland', ARRAY[ua_mw]),
    ('00000000-0000-4000-a000-0000000a0062', ca, '00000000-0000-4000-a000-0000000a0021', 'AP-TEST bon A (collega)', 'gepland', ARRAY[ua_mw2]),
    ('00000000-0000-4000-a000-0000000b0061', cb, '00000000-0000-4000-a000-0000000b0021', 'AP-TEST bon B',           'gepland', ARRAY[ub_mw]);

  -- Werkbonuren: van mw op zijn eigen bon, van de collega op de zijne.
  -- Let op de derde regel: de collega boekt ook uren op de bon waar de
  -- medewerker OP STAAT. Dat is de scherpste vorm van de regel die we willen:
  -- toegang tot een werkbon mag geen toegang tot andermans uren opleveren, ook
  -- niet op je eigen bon.
  INSERT INTO public.werkbon_uren (company_id, werkbon_id, profile_id, datum, uren) VALUES
    (ca, '00000000-0000-4000-a000-0000000a0061', ua_mw,  current_date, 6),
    (ca, '00000000-0000-4000-a000-0000000a0062', ua_mw2, current_date, 8),
    (ca, '00000000-0000-4000-a000-0000000a0061', ua_mw2, current_date, 3),
    (cb, '00000000-0000-4000-a000-0000000b0061', ub_mw,  current_date, 5);

  -- Werkdaguren (de andere urentabel: loon en verlof, geen werkbon).
  INSERT INTO public.urenregistratie (company_id, profile_id, datum, uren) VALUES
    (ca, ua_mw,  current_date, 8),
    (ca, ua_mw2, current_date, 8),
    (cb, ub_mw,  current_date, 8);

  -- ── Aanvullingen hardening v2 ─────────────────────────────────────────────
  -- Facturen tellen pas mee in de dashboardtotalen als ze geen concept zijn en
  -- een factuurdatum hebben; die staan hierboven al goed (status 'verzonden',
  -- factuurdatum default vandaag).

  -- Project in A, met de bon van mw eraan: bb_uren_per_project() telt per
  -- project, en daar mag een medewerker de uren van de collega niet uit afleiden.
  INSERT INTO public.projects (id, company_id, name) VALUES
    ('00000000-0000-4000-a000-0000000a0071', ca, 'AP-TEST project A'),
    ('00000000-0000-4000-a000-0000000b0071', cb, 'AP-TEST project B');
  UPDATE public.werkbonnen SET project_id = '00000000-0000-4000-a000-0000000a0071'
   WHERE id = '00000000-0000-4000-a000-0000000a0061';

  -- Kosten: een losse post en een post op de bon van mw, per bedrijf.
  INSERT INTO public.job_costs (id, company_id, description, amount, cost_date, werkbon_id, externe_referentie) VALUES
    ('00000000-0000-4000-a000-0000000a0081', ca, 'AP-TEST kosten A los',    100, current_date, NULL, 'AP-TEST-1'),
    ('00000000-0000-4000-a000-0000000a0082', ca, 'AP-TEST kosten A op bon', 50,  current_date, '00000000-0000-4000-a000-0000000a0061', 'AP-TEST-2'),
    ('00000000-0000-4000-a000-0000000b0081', cb, 'AP-TEST kosten B los',    200, current_date, NULL, 'AP-TEST-3');
  INSERT INTO public.project_kosten (company_id, project_id, naam, aantal, prijs_per) VALUES
    (ca, '00000000-0000-4000-a000-0000000a0071', 'AP-TEST projectkosten A', 1, 75),
    (cb, '00000000-0000-4000-a000-0000000b0071', 'AP-TEST projectkosten B', 1, 80);

  -- Websiteaanvragen (20260915180001): hangen aan het recht `verkoop`.
  INSERT INTO public.inquiries (company_id, name, email, message) VALUES
    (ca, 'AP-TEST aanvraag A', 'ap-test-aanvraag-a@bossbase.test', 'AP-TEST-4'),
    (cb, 'AP-TEST aanvraag B', 'ap-test-aanvraag-b@bossbase.test', 'AP-TEST-5');

  -- Notitie en taak op de bon van mw, voor de directe rolcontroles.
  INSERT INTO public.werkbon_taken (id, werkbon_id, company_id, omschrijving) VALUES
    ('00000000-0000-4000-a000-0000000a0091', '00000000-0000-4000-a000-0000000a0061', ca, 'AP-TEST taak A');

  -- Werkdaguren van het gedeactiveerde teamlid.
  INSERT INTO public.urenregistratie (company_id, profile_id, datum, uren) VALUES
    (ca, ua_inact, current_date, 8);

  -- ── Bedrijf C (groei, gedeelde werkruimte) ────────────────────────────────
  SELECT id INTO v_stage_c FROM public.pipeline_stages WHERE company_id = cc ORDER BY position LIMIT 1;
  INSERT INTO public.customers (id, company_id, name) VALUES
    ('00000000-0000-4000-a000-0000000c0021', cc, 'AP-TEST klant C');
  INSERT INTO public.deals (id, company_id, customer_id, stage_id, title, expected_revenue) VALUES
    ('00000000-0000-4000-a000-0000000c0031', cc, '00000000-0000-4000-a000-0000000c0021', v_stage_c, 'AP-TEST deal C', 9000);
  INSERT INTO public.offertes (id, company_id, customer_id, nummer, status, totaal_excl, totaal_incl) VALUES
    ('00000000-0000-4000-a000-0000000c0041', cc, '00000000-0000-4000-a000-0000000c0021', 'AP-C-O1', 'verzonden', 3000, 3630);
  INSERT INTO public.facturen (id, company_id, customer_id, nummer, status, totaal_excl, totaal_incl) VALUES
    ('00000000-0000-4000-a000-0000000c0051', cc, '00000000-0000-4000-a000-0000000c0021', 'AP-C-F1', 'verzonden', 3000, 3630);
  INSERT INTO public.offerte_items (offerte_id, company_id, omschrijving, aantal, prijs_per, subtotaal) VALUES
    ('00000000-0000-4000-a000-0000000c0041', cc, 'AP-TEST regel C', 1, 3000, 3000);
  INSERT INTO public.factuur_regels (factuur_id, company_id, omschrijving, aantal, eenheidsprijs, regelprijs) VALUES
    ('00000000-0000-4000-a000-0000000c0051', cc, 'AP-TEST regel C', 1, 3000, 3000);
  -- De bon staat op naam van de admin: de medewerker ziet hem dus alleen dankzij
  -- de gedeelde werkruimte, niet door toewijzing.
  INSERT INTO public.werkbonnen (id, company_id, customer_id, titel, status, assigned_to_ids) VALUES
    ('00000000-0000-4000-a000-0000000c0061', cc, '00000000-0000-4000-a000-0000000c0021', 'AP-TEST bon C', 'gepland', ARRAY[uc_admin]);
  INSERT INTO public.werkbon_uren (company_id, werkbon_id, profile_id, datum, uren) VALUES
    (cc, '00000000-0000-4000-a000-0000000c0061', uc_admin, current_date, 4),
    (cc, '00000000-0000-4000-a000-0000000c0061', uc_mw,    current_date, 2);
  INSERT INTO public.urenregistratie (company_id, profile_id, datum, uren) VALUES
    (cc, uc_admin, current_date, 8),
    (cc, uc_mw,    current_date, 8);
  -- externe_referentie: de check job_costs_leverancier_verplicht wil een herkomst,
  -- en sinds 20261002132455 is hij uniek per bedrijf.
  INSERT INTO public.job_costs (company_id, description, amount, cost_date, werkbon_id, externe_referentie) VALUES
    (cc, 'AP-TEST kosten C los',    300, current_date, NULL, 'AP-TEST-6'),
    (cc, 'AP-TEST kosten C op bon', 60,  current_date, '00000000-0000-4000-a000-0000000c0061', 'AP-TEST-7');
  INSERT INTO public.project_kosten (company_id, werkbon_id, naam, aantal, prijs_per) VALUES
    (cc, '00000000-0000-4000-a000-0000000c0061', 'AP-TEST projectkosten C', 1, 90);
  -- Project en taak van de admin: operationeel werk dat de tweede persoon via de
  -- gedeelde werkruimte hoort te zien.
  INSERT INTO public.projects (id, company_id, name) VALUES
    ('00000000-0000-4000-a000-0000000c0071', cc, 'AP-TEST project C');
  INSERT INTO public.werkbon_taken (werkbon_id, company_id, omschrijving) VALUES
    ('00000000-0000-4000-a000-0000000c0061', cc, 'AP-TEST taak C');
END $$;

-- =============================================================================
-- 0. VOORWAARDE — is de planmatrix geseed?
--
--    Dit blok is er omdat de test zonder matrix STIL het verkeerde meet, en dat
--    is erger dan een test die faalt. bb_has_feature() heeft een veiligheidsklep:
--
--      NOT bb_plan_geconfigureerd(company) AND NOT <feature is intern>  →  true
--
--    Staat plan_features leeg, dan is ELKE feature aan — ook
--    `gedeelde_werkruimte`. En die zet in de RLS-policies van werkbonnen,
--    activities, calendar_events en projects de hele rechtencontrole buitenspel:
--    iedereen binnen het bedrijf ziet dan alles. De granulaire tests hieronder
--    meten dan niets en kleuren vrolijk groen.
--
--    Dat is precies wat er op 15-09-2026 gebeurde bij de eerste lokale run:
--    de baseline is schema-only, dus plan_features was leeg, en de medewerker
--    "zag" beide werkbonnen. Geen bug in de policy — een lege configuratietabel.
--
--    Seeden doe je met de generator die de app en de database al delen:
--      node scripts/gen-plan-matrix.mjs | docker exec -i <db-container> \
--        psql -U postgres -d postgres
-- =============================================================================
DO $$
DECLARE
  ca uuid := '00000000-0000-4000-a000-0000000a0001';
  v_rijen integer;
BEGIN
  SELECT count(*) INTO v_rijen FROM public.plan_features;

  IF v_rijen = 0 THEN
    RAISE EXCEPTION 'plan_features is leeg. Zonder planmatrix staat elke feature aan (veiligheidsklep in bb_has_feature) en meet deze test niets. Seed eerst: node scripts/gen-plan-matrix.mjs';
  END IF;

  IF NOT public.bb_plan_geconfigureerd(ca) THEN
    RAISE EXCEPTION 'bb_plan_geconfigureerd() is onwaar voor het testbedrijf; de planmatrix is onvolledig geseed.';
  END IF;

  IF public.bb_has_feature(ca, 'gedeelde_werkruimte') THEN
    RAISE EXCEPTION 'het testbedrijf heeft gedeelde_werkruimte; dan zetten de RLS-policies de rechtencontrole buitenspel en meet deze test niets. Verwacht: plan team.';
  END IF;

  -- En andersom voor bedrijf C: staat de feature daar NIET aan, dan meet blok 6
  -- niets en kleurt het groen om de verkeerde reden.
  IF NOT public.bb_has_feature('00000000-0000-4000-a000-0000000c0001'::uuid, 'gedeelde_werkruimte') THEN
    RAISE EXCEPTION 'bedrijf C (groei) heeft GEEN gedeelde_werkruimte; blok 6 meet dan niets. Is de planmatrix van nu geseed?';
  END IF;
  IF (SELECT count(*) FROM public.plan_limits) = 0
     OR (SELECT count(*) FROM public.plan_modules) = 0
     OR (SELECT count(*) FROM public.plan_module_tiers) = 0
     OR (SELECT count(*) FROM public.plan_feature_defs) = 0 THEN
    RAISE EXCEPTION 'plan_limits, plan_modules, plan_module_tiers of plan_feature_defs is leeg; de configuratieseed is onvolledig. Draai: npm run db:seed:local';
  END IF;

  RAISE NOTICE '── 0. planmatrix geseed (% rijen); gedeelde_werkruimte uit voor A (team), aan voor C (groei) ──', v_rijen;
END $$;

-- =============================================================================
-- 1. BEDRIJFSISOLATIE — moet NU groen zijn
--    Dit is de harde grens. Gaat hier iets rood, dan is er geen sprake van een
--    "aandachtspunt" maar van een lek tussen klanten.
-- =============================================================================
DO $$
DECLARE
  ua_admin   uuid := '00000000-0000-4000-a000-0000000a0011';
  ua_planner uuid := '00000000-0000-4000-a000-0000000a0012';
  ua_mw      uuid := '00000000-0000-4000-a000-0000000a0013';
  cb         uuid := '00000000-0000-4000-a000-0000000b0001';
BEGIN
  RAISE NOTICE '── 1. bedrijfsisolatie ──';

  -- ADMIN van A
  PERFORM pg_temp.word(ua_admin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('admin A: sessie hoort bij bedrijf A',
    public.bb_current_company() = '00000000-0000-4000-a000-0000000a0001'::uuid, true);
  PERFORM pg_temp.check('admin A ziet 0 klanten van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.customers WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 deals van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.deals WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 offertes van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offertes WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 facturen van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 werkbonnen van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 werkbonuren van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 urenregistraties van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 profielen van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.profiles WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 rechten van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.user_permissions WHERE company_id = %L', cb)), 0);
  RESET ROLE;

  -- PLANNER van A
  PERFORM pg_temp.word(ua_planner);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('planner A ziet 0 klanten van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.customers WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('planner A ziet 0 deals van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.deals WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('planner A ziet 0 offertes van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offertes WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('planner A ziet 0 facturen van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('planner A ziet 0 werkbonnen van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('planner A ziet 0 werkbonuren van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', cb)), 0);
  RESET ROLE;

  -- MEDEWERKER van A
  PERFORM pg_temp.word(ua_mw);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('medewerker A ziet 0 klanten van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.customers WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('medewerker A ziet 0 werkbonnen van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('medewerker A ziet 0 werkbonuren van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('medewerker A ziet 0 urenregistraties van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE company_id = %L', cb)), 0);
  RESET ROLE;
END $$;

-- =============================================================================
-- 2. PLANNERRECHTEN — hier staan de RODE tests
--
--    De beslisregel voor fase 0C-B:
--      • planner mag operationele planning, agenda, klanten en werkbonnen zien;
--      • planner mag NIET automatisch facturen, offertes, omzet, tarieven of
--        marges zien;
--      • financiële toegang bestaat alleen via een expliciet, specifiek recht;
--      • bb_is_admin_or_permission() is het model dat dat wél afdwingt.
-- =============================================================================
DO $$
DECLARE
  ua_planner uuid := '00000000-0000-4000-a000-0000000a0012';  -- geen enkel recht
  ua_plan_ok uuid := '00000000-0000-4000-a000-0000000a0016';  -- expliciet recht 'planning'
  ca         uuid := '00000000-0000-4000-a000-0000000a0001';
BEGIN
  RAISE NOTICE '── 2a. planner ZONDER enig recht ──';

  PERFORM pg_temp.word(ua_planner);
  SET LOCAL ROLE authenticated;

  -- Klanten zijn bedrijfsbreed leesbaar zonder rechtencontrole (de policy op
  -- customers is puur company_id). Dat staat los van deze fix en hoort dus voor
  -- en na 0C-B hetzelfde te zijn.
  -- Twee: de klant uit de fixture, plus de klant die de websiteaanvraag via zijn
  -- trigger heeft aangemaakt (20260930131450, aanvraag naar de pipeline).
  PERFORM pg_temp.check('planner ziet klanten van het eigen bedrijf',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.customers WHERE company_id = %L', ca)), 2);

  -- Het model dat we willen. bb_is_admin_or_permission() kent de rol-bypass niet
  -- en weigert deze planner nu al alles wat hij niet expliciet gekregen heeft.
  PERFORM pg_temp.check('bb_is_admin_or_permission weigert deze planner facturen',
    public.bb_is_admin_or_permission('facturen'), false);
  PERFORM pg_temp.check('bb_is_admin_or_permission weigert deze planner bedrijfsfinancien',
    public.bb_is_admin_or_permission('bedrijfsfinancien'), false);
  PERFORM pg_temp.check('bb_is_admin_or_permission weigert deze planner planning',
    public.bb_is_admin_or_permission('planning'), false);

  -- ── ROOD ── het model dat we hebben. bb_has_permission() is vandaag
  -- `role IN ('admin','planner') OR <expliciet recht>`, dus komt deze planner
  -- overal langs zonder dat iemand hem iets gaf.
  PERFORM pg_temp.check('bb_has_permission geeft deze planner GEEN facturen',
    public.bb_has_permission('facturen'), false);
  PERFORM pg_temp.check('bb_has_permission geeft deze planner GEEN offertes',
    public.bb_has_permission('offertes'), false);
  PERFORM pg_temp.check('bb_has_permission geeft deze planner GEEN kosten',
    public.bb_has_permission('kosten'), false);
  PERFORM pg_temp.check('bb_has_permission geeft deze planner GEEN verkoop',
    public.bb_has_permission('verkoop'), false);
  PERFORM pg_temp.check('bb_has_permission geeft deze planner GEEN alles_inzien',
    public.bb_has_permission('alles_inzien'), false);
  PERFORM pg_temp.check('bb_has_permission geeft deze planner GEEN planning',
    public.bb_has_permission('planning'), false);

  -- ── ROOD ── en wat dat in de praktijk oplevert: de hele financiele
  -- administratie, zonder recht.
  PERFORM pg_temp.check('planner zonder recht ziet GEEN facturen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planner zonder recht ziet GEEN factuurregels',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.factuur_regels WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planner zonder recht ziet GEEN offertes',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offertes WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planner zonder recht ziet GEEN offerteregels',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offerte_items WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planner zonder recht ziet GEEN deals',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.deals WHERE company_id = %L', ca)), 0);

  -- ── ROOD ── de vraag die iemand straks aan de AI stelt: "wat is onze omzet".
  PERFORM pg_temp.check('planner zonder recht kan GEEN omzet optellen',
    pg_temp.zichtbaar(format(
      'SELECT COALESCE(sum(totaal_excl),0)::int FROM public.facturen WHERE company_id = %L', ca)), 0);

  -- ── ROOD ── ook zijn eigenlijke werk krijgt hij vandaag gratis. Na de fix
  -- hoort dit 0 te zijn voor een planner zonder `planning`-recht; hij komt dan
  -- via een expliciete toekenning binnen, niet via zijn rolnaam.
  PERFORM pg_temp.check('planner zonder recht ziet GEEN werkbonnen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', ca)), 0);

  RESET ROLE;

  RAISE NOTICE '── 2b. planner MET expliciet recht ''planning'' ──';

  -- Dit is hoe een planner er na 0C-B uit hoort te zien: operationeel werk via
  -- een expliciet, specifiek recht — en de financiele kant niet erbij.
  PERFORM pg_temp.word(ua_plan_ok);
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.check('planner met recht: bb_is_admin_or_permission(planning) is waar',
    public.bb_is_admin_or_permission('planning'), true);
  PERFORM pg_temp.check('planner met recht ziet de werkbonnen van het bedrijf',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', ca)), 2);
  PERFORM pg_temp.check('planner met recht ziet klanten',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.customers WHERE company_id = %L', ca)), 2);

  -- Het planning-recht is geen sleutel tot de financien.
  PERFORM pg_temp.check('planning-recht geeft GEEN bb_is_admin_or_permission(facturen)',
    public.bb_is_admin_or_permission('facturen'), false);
  PERFORM pg_temp.check('planning-recht geeft GEEN bb_is_admin_or_permission(offertes)',
    public.bb_is_admin_or_permission('offertes'), false);

  -- ── ROOD ── maar zolang de rol-bypass bestaat, lekt het toch.
  PERFORM pg_temp.check('planning-recht geeft GEEN toegang tot facturen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planning-recht geeft GEEN toegang tot offertes',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offertes WHERE company_id = %L', ca)), 0);

  RESET ROLE;
END $$;

-- =============================================================================
-- 3. UREN
--    Twee tabellen, bewust gescheiden (zie CLAUDE.md):
--      urenregistratie — de werkdag: loon en verlof
--      werkbon_uren    — uren op een klus: nacalculatie en facturatie
--    De AI-tool get_hours_summary gaat allebei lezen, dus allebei moeten kloppen.
-- =============================================================================
DO $$
DECLARE
  ua_admin   uuid := '00000000-0000-4000-a000-0000000a0011';
  ua_planner uuid := '00000000-0000-4000-a000-0000000a0012';
  ua_plan_ok uuid := '00000000-0000-4000-a000-0000000a0016';
  ua_mw      uuid := '00000000-0000-4000-a000-0000000a0013';
  ua_mw2     uuid := '00000000-0000-4000-a000-0000000a0014';
  ca         uuid := '00000000-0000-4000-a000-0000000a0001';
  bon_mw     uuid := '00000000-0000-4000-a000-0000000a0061';
BEGIN
  RAISE NOTICE '── 3. uren ──';

  -- MEDEWERKER: eigen werkdag, en niet die van de collega.
  PERFORM pg_temp.word(ua_mw);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('medewerker ziet zijn eigen werkdaguren',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE profile_id = %L', ua_mw)), 1);
  PERFORM pg_temp.check('medewerker ziet de werkdaguren van de collega NIET',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE profile_id = %L', ua_mw2)), 0);

  -- Werkbonnen: hij staat op bon 1, niet op bon 2. Dat werkt vandaag goed.
  PERFORM pg_temp.check('medewerker ziet alleen de werkbon waar hij op staat',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', ca)), 1);

  -- ── ROOD ── het gat. De bon van de collega is onzichtbaar, de uren erop niet:
  -- de SELECT-policy op werkbon_uren kijkt alleen naar company_id. Toegang tot
  -- een werkbon zou moeten bepalen of je de uren erop mag zien.
  PERFORM pg_temp.check('medewerker ziet GEEN werkbonuren van de collega',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE profile_id = %L', ua_mw2)), 0);
  PERFORM pg_temp.check('medewerker ziet alleen werkbonuren van zijn eigen bonnen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', ca)), 1);
  PERFORM pg_temp.check('medewerker kan GEEN totaal van andermans uren optellen',
    pg_temp.zichtbaar(format(
      'SELECT COALESCE(sum(uren),0)::int FROM public.werkbon_uren WHERE profile_id = %L', ua_mw2)), 0);

  -- Het scherpste geval, en de reden dat deze policy niet simpelweg
  -- werkbonnen_select mag spiegelen: de collega heeft óók uren geboekt op de bon
  -- waar deze medewerker zelf op staat. Toegang tot de bon is er dus wél,
  -- toegang tot de uren van de ander hoort er niet te zijn.
  PERFORM pg_temp.check('medewerker ziet op zijn EIGEN bon alleen zijn eigen uren',
    pg_temp.zichtbaar(format(
      'SELECT count(*)::int FROM public.werkbon_uren WHERE werkbon_id = %L', bon_mw)), 1);


  RESET ROLE;

  -- PLANNER zonder recht: geen uren van anderen. Hij heeft zelf geen uren, dus
  -- alles wat hij ziet zou van een collega zijn.
  PERFORM pg_temp.word(ua_planner);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('planner zonder recht ziet GEEN werkbonuren',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', ca)), 0);
  RESET ROLE;

  -- PLANNER met het expliciete planning-recht: wél, want inplannen zonder zicht
  -- op de geboekte uren is geen planning. Dat recht is toegekend, niet geërfd
  -- van een rolnaam.
  PERFORM pg_temp.word(ua_plan_ok);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('planner MET planning-recht ziet de werkbonuren van het bedrijf',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', ca)), 3);
  PERFORM pg_temp.check('planner MET planning-recht ziet 0 werkbonuren van bedrijf B',
    pg_temp.zichtbaar('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = ''00000000-0000-4000-a000-0000000b0001'''), 0);
  RESET ROLE;

  -- ADMIN: mag de uren van het hele eigen bedrijf zien. Dat is geen gat.
  PERFORM pg_temp.word(ua_admin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('admin ziet alle werkdaguren van het eigen bedrijf',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE company_id = %L', ca)), 3);
  PERFORM pg_temp.check('admin ziet alle werkbonuren van het eigen bedrijf',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', ca)), 3);
  RESET ROLE;

  -- SCHRIJFPADEN — als laatste, want deze voegen een rij toe en zouden de
  -- tellingen hierboven verstoren als ze eerder kwamen.
  --
  -- bb_mag_werkbon_uren_beheren() is niet aangeraakt door migratie
  -- 20260915180000, maar een strengere SELECT kan een INSERT ... RETURNING
  -- alsnog laten stranden: de service-laag doet
  -- .insert(...).select().single() (werkbonUrenService.js), en dat leest de
  -- zojuist geschreven rij terug.
  PERFORM pg_temp.word(ua_mw);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('medewerker kan uren boeken op zijn eigen werkbon', pg_temp.lukt(format(
    $q$INSERT INTO public.werkbon_uren (company_id, werkbon_id, profile_id, datum, uren)
       VALUES (%L, %L, %L, current_date, 2) RETURNING id$q$, ca, bon_mw, ua_mw)), true);

  PERFORM pg_temp.check('medewerker kan zijn eigen uren bijwerken', pg_temp.lukt(format(
    $q$UPDATE public.werkbon_uren SET uren = 7 WHERE profile_id = %L AND werkbon_id = %L
       RETURNING id$q$, ua_mw, bon_mw)), true);

  -- En niet bij die van de collega. Gemeten op het aantal GERAAKTE rijen, niet op
  -- "kwam er een foutmelding": een UPDATE die door RLS niets te pakken krijgt
  -- slaagt gewoon met nul rijen, en dat leest anders ten onrechte als toegang.
  PERFORM pg_temp.check('medewerker raakt 0 urenregels van de collega (op naam)',
    pg_temp.geraakt(format(
      $q$UPDATE public.werkbon_uren SET uren = 9 WHERE profile_id = %L$q$, ua_mw2)), 0);

  -- Ook niet als hij het id al kent. De bon is van hem, de urenregel niet.
  PERFORM pg_temp.check('medewerker raakt 0 urenregels van de collega (op id)',
    pg_temp.geraakt(format(
      $q$UPDATE public.werkbon_uren SET uren = 9
          WHERE id = (SELECT id FROM public.werkbon_uren WHERE profile_id = %L LIMIT 1)$q$, ua_mw2)), 0);

  PERFORM pg_temp.check('medewerker verwijdert 0 urenregels van de collega',
    pg_temp.geraakt(format(
      $q$DELETE FROM public.werkbon_uren WHERE profile_id = %L$q$, ua_mw2)), 0);
  RESET ROLE;
END $$;

-- =============================================================================
-- 4. EXPLICIETE RECHTEN
--    Het model dat overeind moet blijven: toegang komt van een specifiek recht,
--    niet van hoe een rol toevallig heet.
-- =============================================================================
DO $$
DECLARE
  ua_fin uuid := '00000000-0000-4000-a000-0000000a0015';  -- medewerker MET 'facturen'
  ua_mw  uuid := '00000000-0000-4000-a000-0000000a0013';  -- medewerker ZONDER
  ca     uuid := '00000000-0000-4000-a000-0000000a0001';
BEGIN
  RAISE NOTICE '── 4. expliciete rechten ──';

  -- MET het recht: toegang. Dit is de positieve kant van het bewijs — de fix in
  -- 0C-B mag deze weg niet dichtgooien.
  PERFORM pg_temp.word(ua_fin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('expliciet recht: bb_has_permission(facturen) is waar',
    public.bb_has_permission('facturen'), true);
  PERFORM pg_temp.check('expliciet recht: bb_is_admin_or_permission(facturen) is waar',
    public.bb_is_admin_or_permission('facturen'), true);
  PERFORM pg_temp.check('expliciet recht geeft toegang tot facturen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', ca)), 1);
  -- en niet meer dan dat: één recht is geen sleutel tot alles.
  PERFORM pg_temp.check('recht op facturen geeft GEEN toegang tot offertes',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offertes WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('recht op facturen geeft GEEN toegang tot deals',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.deals WHERE company_id = %L', ca)), 0);
  RESET ROLE;

  -- ZONDER het recht: geweigerd. Dit is vandaag al groen en moet dat blijven.
  PERFORM pg_temp.word(ua_mw);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('zonder recht: bb_has_permission(facturen) is onwaar',
    public.bb_has_permission('facturen'), false);
  PERFORM pg_temp.check('zonder recht geen toegang tot facturen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('zonder recht geen toegang tot offertes',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offertes WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('zonder recht geen toegang tot deals',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.deals WHERE company_id = %L', ca)), 0);
  RESET ROLE;
END $$;

-- =============================================================================
-- 5. DIRECTE ROLCONTROLES
--    bb_has_permission() dichtzetten is niet genoeg: 23 policies en
--    bb_mag_werkbon_uren_beheren() keken zelf naar role IN ('admin','planner').
--    Daarmee kon een planner zonder enig recht offerte- en factuurregels
--    schrijven, alle werkdaguren lezen en uren voor anderen boeken.
-- =============================================================================
DO $$
DECLARE
  ua_planner uuid := '00000000-0000-4000-a000-0000000a0012';  -- geen recht (alleen het standaardrecht)
  ua_plan_ok uuid := '00000000-0000-4000-a000-0000000a0016';  -- 'planning'
  ua_mw      uuid := '00000000-0000-4000-a000-0000000a0013';
  ca         uuid := '00000000-0000-4000-a000-0000000a0001';
  bon_mw     uuid := '00000000-0000-4000-a000-0000000a0061';
  off_a      uuid := '00000000-0000-4000-a000-0000000a0041';
  fac_a      uuid := '00000000-0000-4000-a000-0000000a0051';
  v_n integer;
  v_lijst text;
BEGIN
  RAISE NOTICE '── 5. directe rolcontroles ──';

  PERFORM pg_temp.word(ua_planner);
  SET LOCAL ROLE authenticated;

  -- Financieel schrijven.
  PERFORM pg_temp.check('planner zonder recht kan GEEN offerteregel toevoegen', pg_temp.lukt(format(
    $q$INSERT INTO public.offerte_items (offerte_id, company_id, omschrijving, aantal, prijs_per, subtotaal)
       VALUES (%L, %L, 'AP-TEST via rol', 1, 1, 1)$q$, off_a, ca)), false);
  PERFORM pg_temp.check('planner zonder recht wijzigt 0 offerteregels', pg_temp.geraakt(format(
    $q$UPDATE public.offerte_items SET omschrijving = 'AP-TEST gewijzigd' WHERE company_id = %L$q$, ca)), 0);
  PERFORM pg_temp.check('planner zonder recht verwijdert 0 offerteregels', pg_temp.geraakt(format(
    $q$DELETE FROM public.offerte_items WHERE company_id = %L AND omschrijving = 'AP-TEST bestaat niet'$q$, ca)
    ) + pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offerte_items WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planner zonder recht kan GEEN factuurregel toevoegen', pg_temp.lukt(format(
    $q$INSERT INTO public.factuur_regels (factuur_id, company_id, omschrijving, aantal, eenheidsprijs, regelprijs)
       VALUES (%L, %L, 'AP-TEST via rol', 1, 1, 1)$q$, fac_a, ca)), false);
  PERFORM pg_temp.check('planner zonder recht wijzigt 0 factuurregels', pg_temp.geraakt(format(
    $q$UPDATE public.factuur_regels SET omschrijving = 'AP-TEST gewijzigd' WHERE company_id = %L$q$, ca)), 0);

  -- Financieel lezen buiten facturen en offertes om.
  PERFORM pg_temp.check('planner zonder recht ziet GEEN kosten (job_costs)',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.job_costs WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planner zonder recht ziet GEEN projectkosten',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.project_kosten WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planner zonder recht ziet GEEN websiteaanvragen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.inquiries WHERE company_id = %L', ca)), 0);

  -- Uren: de rolnaam gaf inzage in alle werkdaguren en mocht voor iedereen boeken.
  PERFORM pg_temp.check('planner zonder recht ziet GEEN werkdaguren van anderen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('planner zonder recht kan GEEN werkdaguren voor een ander boeken', pg_temp.lukt(format(
    $q$INSERT INTO public.urenregistratie (company_id, profile_id, datum, uren)
       VALUES (%L, %L, current_date - 1, 1)$q$, ca, ua_mw)), false);
  PERFORM pg_temp.check('planner zonder recht kan GEEN werkbonuren voor een ander boeken', pg_temp.lukt(format(
    $q$INSERT INTO public.werkbon_uren (company_id, werkbon_id, profile_id, datum, uren)
       VALUES (%L, %L, %L, current_date - 1, 1)$q$, ca, bon_mw, ua_mw)), false);

  -- Operationeel schrijven op een bon waar hij niet op staat.
  PERFORM pg_temp.check('planner zonder recht kan GEEN werkbontaak toevoegen', pg_temp.lukt(format(
    $q$INSERT INTO public.werkbon_taken (werkbon_id, company_id, omschrijving)
       VALUES (%L, %L, 'AP-TEST via rol')$q$, bon_mw, ca)), false);
  PERFORM pg_temp.check('planner zonder recht verwijdert 0 werkbontaken', pg_temp.geraakt(format(
    $q$DELETE FROM public.werkbon_taken WHERE company_id = %L AND omschrijving = 'AP-TEST taak A'$q$, ca)), 0);
  RESET ROLE;

  -- De planner MET `planning` houdt zijn operationele werk, via het recht.
  PERFORM pg_temp.word(ua_plan_ok);
  SET LOCAL ROLE authenticated;
  -- Taken op een bon horen bij werkbonnen_bewerken (of verantwoordelijke van de
  -- bon), niet bij planning: zo heeft 20261002135952 het gezet, gelijk aan de
  -- update-policy. Planning gaat over de agenda en de uren.
  PERFORM pg_temp.check('planning-recht alleen geeft GEEN werkbontaak (dat is werkbonnen_bewerken)', pg_temp.lukt(format(
    $q$INSERT INTO public.werkbon_taken (werkbon_id, company_id, omschrijving)
       VALUES (%L, %L, 'AP-TEST via recht')$q$, bon_mw, ca)), false);
  PERFORM pg_temp.check('planner met planning-recht ziet de werkdaguren van het bedrijf',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE company_id = %L', ca)), 3);
  PERFORM pg_temp.check('planner met planning-recht kan werkbonuren voor een ander boeken', pg_temp.lukt(format(
    $q$INSERT INTO public.werkbon_uren (company_id, werkbon_id, profile_id, datum, uren)
       VALUES (%L, %L, %L, current_date - 2, 1)$q$, ca, bon_mw, ua_mw)), true);
  -- ...en nog steeds niets financieels.
  PERFORM pg_temp.check('planner met planning-recht kan GEEN offerteregel toevoegen', pg_temp.lukt(format(
    $q$INSERT INTO public.offerte_items (offerte_id, company_id, omschrijving, aantal, prijs_per, subtotaal)
       VALUES (%L, %L, 'AP-TEST via planning', 1, 1, 1)$q$, off_a, ca)), false);
  PERFORM pg_temp.check('planner met planning-recht ziet GEEN kosten',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.job_costs WHERE company_id = %L AND werkbon_id IS NULL', ca)), 0);
  PERFORM pg_temp.check('planner met planning-recht ziet GEEN deals',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.deals WHERE company_id = %L', ca)), 0);
  RESET ROLE;
  -- De uren die de planner net voor mw boekte weer weg, zodat de tellingen in
  -- de blokken hierna kloppen.
  DELETE FROM public.werkbon_uren WHERE datum = current_date - 2 AND werkbon_id = bon_mw;
  DELETE FROM public.werkbon_taken WHERE omschrijving = 'AP-TEST via recht';

  -- Statisch, op de catalogus: er mag geen enkele policy of functie over zijn
  -- die een planner op zijn rolnaam doorlaat. Dit vangt ook policies die geen
  -- van de tests hierboven toevallig raakt, en elke nieuwe die erbij komt.
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
    INTO v_n, v_lijst
    FROM pg_policies
   WHERE schemaname IN ('public', 'storage')
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'planner';
  PERFORM pg_temp.check('geen enkele policy noemt de rol planner' || coalesce(' (' || left(v_lijst, 400) || ')', ''), v_n, 0);

  -- bb_teamlid_bijwerken() mag het woord bevatten: die valideert welke rol een
  -- beheerder mag toekennen en geeft zelf geen toegang.
  SELECT count(*), string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_n, v_lijst
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prosrc ~ 'planner'
     AND p.proname <> 'bb_teamlid_bijwerken';
  PERFORM pg_temp.check('geen enkele functie geeft toegang op de rol planner' || coalesce(' (' || v_lijst || ')', ''), v_n, 0);
END $$;

-- =============================================================================
-- 6. GEDEELDE WERKRUIMTE (bedrijf C, pakket groei)
--    Een abonnementsfeature is geen gebruikersrecht. De gedeelde werkruimte
--    laat de tweede persoon meekijken in agenda, projecten en werkbonnen. Geen
--    deals, offertes, facturen, kosten of andermans uren.
-- =============================================================================
DO $$
DECLARE
  uc_admin uuid := '00000000-0000-4000-a000-0000000c0011';
  uc_mw    uuid := '00000000-0000-4000-a000-0000000c0013';
  cc       uuid := '00000000-0000-4000-a000-0000000c0001';
  ca       uuid := '00000000-0000-4000-a000-0000000a0001';
  v_n integer;
  v_lijst text;
BEGIN
  RAISE NOTICE '── 6. gedeelde werkruimte ──';

  PERFORM pg_temp.word(uc_mw);
  SET LOCAL ROLE authenticated;

  -- Wat de feature WEL doet: operationeel meekijken zonder toewijzing.
  PERFORM pg_temp.check('gedeelde werkruimte: medewerker ziet de werkbon van de ander',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', cc)), 1);
  PERFORM pg_temp.check('gedeelde werkruimte: medewerker ziet klanten',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.customers WHERE company_id = %L', cc)), 1);

  -- Wat hij NIET doet.
  PERFORM pg_temp.check('gedeelde werkruimte geeft GEEN facturen',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', cc)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte geeft GEEN factuurregels',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.factuur_regels WHERE company_id = %L', cc)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte geeft GEEN offertes',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offertes WHERE company_id = %L', cc)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte geeft GEEN offerteregels',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offerte_items WHERE company_id = %L', cc)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte geeft GEEN deals',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.deals WHERE company_id = %L', cc)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte geeft GEEN kosten (job_costs)',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.job_costs WHERE company_id = %L', cc)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte geeft GEEN projectkosten',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.project_kosten WHERE company_id = %L', cc)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte: GEEN omzet op te tellen',
    pg_temp.zichtbaar(format('SELECT COALESCE(sum(totaal_excl),0)::int FROM public.facturen WHERE company_id = %L', cc)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte: medewerker kan GEEN kosten op een bon boeken', pg_temp.lukt(format(
    $q$INSERT INTO public.job_costs (company_id, description, amount, werkbon_id, externe_referentie)
       VALUES (%L, 'AP-TEST via werkruimte', 1, '00000000-0000-4000-a000-0000000c0061', 'AP-TEST-8')$q$, cc)), false);

  -- Uren: alleen de eigen, ook in een gedeelde werkruimte.
  PERFORM pg_temp.check('gedeelde werkruimte: medewerker ziet alleen eigen werkbonuren',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', cc)), 1);
  PERFORM pg_temp.check('gedeelde werkruimte: medewerker ziet alleen eigen werkdaguren',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE company_id = %L', cc)), 1);

  -- En de bedrijfsgrens blijft de bedrijfsgrens.
  PERFORM pg_temp.check('gedeelde werkruimte: 0 werkbonnen van bedrijf A',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('gedeelde werkruimte: 0 klanten van bedrijf A',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.customers WHERE company_id = %L', ca)), 0);
  RESET ROLE;

  -- De admin van C ziet alles van C.
  PERFORM pg_temp.word(uc_admin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('admin C ziet de facturen van C',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', cc)), 1);
  PERFORM pg_temp.check('admin C ziet de kosten van C',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.job_costs WHERE company_id = %L', cc)), 2);
  PERFORM pg_temp.check('admin C ziet alle werkbonuren van C',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', cc)), 2);
  RESET ROLE;

  -- Statisch: geen enkele policy op een financiele tabel of urentabel mag de
  -- feature als toegangsgrond gebruiken.
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
    INTO v_n, v_lijst
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('deals', 'offertes', 'offerte_items', 'facturen', 'factuur_regels',
                       'job_costs', 'project_kosten', 'inquiries', 'website_forms',
                       'werkbon_uren', 'urenregistratie')
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'bb_gedeelde_werkruimte';
  PERFORM pg_temp.check('geen financiele policy leunt op gedeelde_werkruimte' || coalesce(' (' || left(v_lijst, 400) || ')', ''), v_n, 0);
END $$;

-- =============================================================================
-- 7. RPC'S EN TOTALEN
--    Een rij niet mogen zien en het totaal wel kunnen opvragen is hetzelfde lek
--    met een omweg. SECURITY INVOKER-functies volgen de RLS vanzelf; SECURITY
--    DEFINER-functies moeten het recht zelf controleren.
-- =============================================================================
DO $$
DECLARE
  ua_admin uuid := '00000000-0000-4000-a000-0000000a0011';
  ua_mw    uuid := '00000000-0000-4000-a000-0000000a0013';
  ua_fin   uuid := '00000000-0000-4000-a000-0000000a0015';
  uc_mw    uuid := '00000000-0000-4000-a000-0000000c0013';
  ca       uuid := '00000000-0000-4000-a000-0000000a0001';
  proj_a   text := '00000000-0000-4000-a000-0000000a0071';
  fac_a    uuid := '00000000-0000-4000-a000-0000000a0051';
  fac_b    uuid := '00000000-0000-4000-a000-0000000b0051';
  off_a    uuid := '00000000-0000-4000-a000-0000000a0041';
  v_eigen integer;
  v_alle  integer;
BEGIN
  RAISE NOTICE '── 7. rpc''s en totalen ──';

  -- De verwachting komt uit de data zelf (als tabeleigenaar gelezen, dus zonder
  -- RLS): blok 3 boekt en wijzigt uren, en bij een lek wijzigt het ook die van
  -- de collega. Vaste getallen zouden dan om de verkeerde reden kloppen.
  SELECT COALESCE(sum(u.uren) FILTER (WHERE u.profile_id = ua_mw), 0)::int, COALESCE(sum(u.uren), 0)::int
    INTO v_eigen, v_alle
    FROM public.werkbon_uren u JOIN public.werkbonnen w ON w.id = u.werkbon_id
   WHERE w.project_id = proj_a::uuid;
  PERFORM pg_temp.check('fixture: op het project staan ook uren van de collega', v_alle > v_eigen AND v_eigen > 0, true);

  -- MEDEWERKER zonder recht.
  PERFORM pg_temp.word(ua_mw);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('bb_uren_per_project: medewerker telt alleen zijn eigen uren',
    pg_temp.zichtbaar(format('SELECT COALESCE((public.bb_uren_per_project() ->> %L)::numeric, 0)::int', proj_a)), v_eigen);
  -- bb_factuurtotalen() en bb_offertetotalen() zijn SECURITY DEFINER en kijken
  -- alleen naar het bedrijf, niet naar een recht. Dat is veilig zolang ze niet
  -- voor authenticated uitvoerbaar zijn (zichtbaar() geeft dan -1). Deze test
  -- bewaakt dat: krijgt iemand hier ooit een rij terug, dan is de grant verruimd
  -- zonder dat de functie een rechtencontrole heeft gekregen.
  PERFORM pg_temp.check('bb_factuurtotalen: medewerker zonder recht krijgt niets',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.bb_factuurtotalen(%L)', fac_a)) <= 0, true);
  PERFORM pg_temp.check('bb_offertetotalen: medewerker zonder recht krijgt niets',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.bb_offertetotalen(%L)', off_a)) <= 0, true);
  PERFORM pg_temp.check('bb_financien_kpi: medewerker zonder recht ziet geen omzet',
    pg_temp.zichtbaar('SELECT COALESCE((public.bb_financien_kpi(current_date - 365, current_date + 1) ->> ''gefactureerd'')::numeric, 0)::int'), 0);
  RESET ROLE;

  -- GEDEELDE WERKRUIMTE: de totalen-RPC's volgen de RLS en mogen dus ook niets geven.
  PERFORM pg_temp.word(uc_mw);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('bb_financien_kpi: gedeelde werkruimte geeft geen omzet',
    pg_temp.zichtbaar('SELECT COALESCE((public.bb_financien_kpi(current_date - 365, current_date + 1) ->> ''gefactureerd'')::numeric, 0)::int'), 0);
  PERFORM pg_temp.check('bb_factuurtotalen: gedeelde werkruimte geeft niets',
    pg_temp.zichtbaar('SELECT count(*)::int FROM public.bb_factuurtotalen(''00000000-0000-4000-a000-0000000c0051'')') <= 0, true);
  RESET ROLE;

  -- MET het recht `facturen`: de KPI's volgen de RLS en geven het bedrag.
  PERFORM pg_temp.word(ua_fin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('bb_financien_kpi: met recht facturen komt de omzet terug',
    pg_temp.zichtbaar('SELECT COALESCE((public.bb_financien_kpi(current_date - 365, current_date + 1) ->> ''gefactureerd'')::numeric, 0)::int'), 1210);
  RESET ROLE;

  -- ADMIN: alles van het eigen bedrijf, niets van een ander.
  PERFORM pg_temp.word(ua_admin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('bb_uren_per_project: admin telt alle uren van het project',
    pg_temp.zichtbaar(format('SELECT COALESCE((public.bb_uren_per_project() ->> %L)::numeric, 0)::int', proj_a)), v_alle);
  PERFORM pg_temp.check('bb_factuurtotalen: admin A krijgt niets voor een factuur van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.bb_factuurtotalen(%L)', fac_b)) <= 0, true);
  PERFORM pg_temp.check('bb_financien_kpi: admin A telt alleen de omzet van A',
    pg_temp.zichtbaar('SELECT COALESCE((public.bb_financien_kpi(current_date - 365, current_date + 1) ->> ''gefactureerd'')::numeric, 0)::int'), 1210);
  PERFORM pg_temp.check('admin A wijzigt 0 facturen van B', pg_temp.geraakt(format(
    $q$UPDATE public.facturen SET nummer = nummer WHERE id = %L$q$, fac_b)), 0);
  PERFORM pg_temp.check('mark_factuur_betaald: admin A kan een factuur van B niet op betaald zetten', pg_temp.rpc_lukt(format(
    $q$SELECT public.mark_factuur_betaald(%L)$q$, fac_b)), false);
  RESET ROLE;

  -- Als laatste, want bij een lek verandert dit de factuur: een medewerker
  -- zonder recht mag een factuur niet op betaald zetten.
  PERFORM pg_temp.word(ua_mw);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('mark_factuur_betaald: medewerker zonder recht wordt geweigerd', pg_temp.rpc_lukt(format(
    $q$SELECT public.mark_factuur_betaald(%L)$q$, fac_a)), false);
  RESET ROLE;
END $$;

-- =============================================================================
-- 8. STANDAARDRECHTEN, RESTRICTIVE POLICIES EN DE REST VAN DE BEDRIJFSGRENS
-- =============================================================================
DO $$
DECLARE
  ua_admin uuid := '00000000-0000-4000-a000-0000000a0011';
  ua_mw    uuid := '00000000-0000-4000-a000-0000000a0013';
  ua_inact uuid := '00000000-0000-4000-a000-0000000a0017';
  ca       uuid := '00000000-0000-4000-a000-0000000a0001';
  cb       uuid := '00000000-0000-4000-a000-0000000b0001';
  v_n integer;
BEGIN
  RAISE NOTICE '── 8. standaardrechten, restrictive policies, bedrijfsgrens ──';

  -- De trigger bb_standaardrechten_medewerker (20261001140105) geeft een nieuwe
  -- medewerker precies `projecten`. Geen financieel recht, geen alles_inzien.
  SELECT count(*) INTO v_n FROM public.user_permissions
   WHERE user_id = ua_mw AND granted AND permission = 'projecten';
  PERFORM pg_temp.check('standaardrecht: nieuwe medewerker krijgt projecten', v_n, 1);
  SELECT count(*) INTO v_n FROM public.user_permissions
   WHERE user_id = ua_mw AND granted AND permission <> 'projecten';
  PERFORM pg_temp.check('standaardrecht: nieuwe medewerker krijgt verder niets', v_n, 0);
  SELECT count(*) INTO v_n FROM public.user_permissions
   WHERE company_id = ca AND granted
     AND user_id IN (SELECT id FROM public.profiles WHERE role = 'planner')
     AND permission IN ('alles_inzien', 'facturen', 'offertes', 'verkoop', 'kosten',
                        'bedrijfsfinancien', 'projectbedragen', 'inkoopprijzen');
  PERFORM pg_temp.check('geen planner heeft ongevraagd een financieel recht of alles_inzien', v_n, 0);

  -- Gedeactiveerd teamlid: ziet niets, ook niet zijn eigen werkdaguren. En een
  -- recht dat hij nog als rij heeft telt niet meer (20261002132803); die regel
  -- moet de herschreven bb_has_permission() van 20261004200000 overleven.
  INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
  VALUES (ca, ua_inact, 'facturen', true);
  PERFORM pg_temp.word(ua_inact);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('gedeactiveerd teamlid: bb_has_permission geeft niets, ook niet met een recht',
    public.bb_has_permission('facturen'), false);
  PERFORM pg_temp.check('gedeactiveerd teamlid: bb_is_admin_or_permission geeft niets',
    public.bb_is_admin_or_permission('facturen'), false);
  PERFORM pg_temp.check('gedeactiveerd teamlid: geen inkoopprijzen',
    public.bb_mag_inkoopprijs_zien(), false);
  PERFORM pg_temp.check('gedeactiveerd teamlid ziet GEEN eigen werkdaguren',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.urenregistratie WHERE profile_id = %L', ua_inact)), 0);
  PERFORM pg_temp.check('gedeactiveerd teamlid ziet GEEN klanten',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.customers WHERE company_id = %L', ca)), 0);
  PERFORM pg_temp.check('gedeactiveerd teamlid ziet GEEN werkbonuren',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_uren WHERE company_id = %L', ca)), 0);
  RESET ROLE;

  -- De restrictive insert-policy op werkbon_uren (20260930183000) moet er staan.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'werkbon_uren'
     AND permissive = 'RESTRICTIVE';
  PERFORM pg_temp.check('werkbon_uren heeft beide restrictive policies (actief + beperking na afloop)', v_n, 2);

  -- Bedrijfsgrens voor de tabellen die er sinds 15-09 bij zijn gekomen.
  PERFORM pg_temp.word(ua_admin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('admin A ziet 0 kosten van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.job_costs WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 projectkosten van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.project_kosten WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 websiteaanvragen van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.inquiries WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 projecten van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.projects WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 factuurregels van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.factuur_regels WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('admin A ziet 0 offerteregels van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.offerte_items WHERE company_id = %L', cb)), 0);
  -- En wat hij van het eigen bedrijf hoort te zien, om te bewijzen dat de nullen
  -- hierboven niet komen doordat hij nergens bij kan.
  PERFORM pg_temp.check('admin A ziet de kosten van A',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.job_costs WHERE company_id = %L', ca)), 2);
  PERFORM pg_temp.check('admin A ziet de websiteaanvraag van A',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.inquiries WHERE company_id = %L', ca)), 1);
  -- 1 factuur, 1 offerte, 2 deals (die uit de fixture en die van de websiteaanvraag).
  PERFORM pg_temp.check('admin A ziet facturen, offertes en deals van A',
    pg_temp.zichtbaar(format('SELECT (SELECT count(*) FROM public.facturen WHERE company_id = %L)::int + (SELECT count(*) FROM public.offertes WHERE company_id = %L)::int + (SELECT count(*) FROM public.deals WHERE company_id = %L)::int', ca, ca, ca)), 4);
  RESET ROLE;
END $$;

-- =============================================================================
-- 9. RECHTENBEHEER IN GROEI
--    Productbesluit 1-10-2026: abonnementsfeatures bepalen welke functionaliteit
--    er is, rechten bepalen welke gebruiker gevoelige data ziet. Groei heeft de
--    gedeelde werkruimte voor het operationele werk EN rollen_rechten, zodat de
--    beheerder de financiele kant per persoon open kan zetten.
--
--    Elke stap loopt door een echte RLS-sessie: de beheerder schrijft zelf in
--    user_permissions, de medewerker leest zelf de tabellen.
-- =============================================================================
DO $$
DECLARE
  uc_admin uuid := '00000000-0000-4000-a000-0000000c0011';
  uc_mw    uuid := '00000000-0000-4000-a000-0000000c0013';
  ua_admin uuid := '00000000-0000-4000-a000-0000000a0011';
  ub_mw    uuid := '00000000-0000-4000-a000-0000000b0013';
  ca       uuid := '00000000-0000-4000-a000-0000000a0001';
  cb       uuid := '00000000-0000-4000-a000-0000000b0001';
  cc       uuid := '00000000-0000-4000-a000-0000000c0001';
  v_recht  text;
  v_zicht  text;
  v_n      integer;
  -- Wat de medewerker van C ziet, als één tekst: deals/offertes/facturen/kosten.
  -- Kosten = losse kostenposten; de post op een werkbon heeft een eigen regel.
  c_zicht constant text := format($q$
    SELECT (SELECT count(*) FROM public.deals     WHERE company_id = %1$L)::text || '/' ||
           (SELECT count(*) FROM public.offertes  WHERE company_id = %1$L)::text || '/' ||
           (SELECT count(*) FROM public.facturen  WHERE company_id = %1$L)::text || '/' ||
           (SELECT count(*) FROM public.job_costs WHERE company_id = %1$L AND werkbon_id IS NULL)::text
  $q$, '00000000-0000-4000-a000-0000000c0001');
BEGIN
  RAISE NOTICE '── 9. rechtenbeheer in Groei ──';

  PERFORM pg_temp.check('Groei heeft de gedeelde werkruimte',
    public.bb_has_feature(cc, 'gedeelde_werkruimte'), true);
  PERFORM pg_temp.check('Groei heeft rollen_rechten',
    public.bb_has_feature(cc, 'rollen_rechten'), true);

  -- De beheerder van C kan het rechtenbeheer openen: de feature staat voor zijn
  -- sessie aan en hij ziet de rechten van zijn team.
  PERFORM pg_temp.word(uc_admin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('Groei-admin: rollen_rechten staat aan in zijn sessie',
    public.bb_has_feature('rollen_rechten'), true);
  PERFORM pg_temp.check('Groei-admin ziet de rechten van zijn team',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.user_permissions WHERE company_id = %L', cc)) >= 1, true);
  RESET ROLE;

  -- Uitgangspunt: de tweede persoon heeft alleen het standaardrecht en ziet
  -- operationeel alles, financieel niets.
  SELECT count(*) INTO v_n FROM public.user_permissions
   WHERE user_id = uc_mw AND granted AND permission <> 'projecten';
  PERFORM pg_temp.check('Groei-medewerker begint met alleen het standaardrecht projecten', v_n, 0);

  PERFORM pg_temp.word(uc_mw);
  SET LOCAL ROLE authenticated;
  EXECUTE c_zicht INTO v_zicht;
  PERFORM pg_temp.check('Groei-medewerker zonder grant: deals/offertes/facturen/kosten', v_zicht, '0/0/0/0');
  PERFORM pg_temp.check('Groei-medewerker zonder grant mag geen inkoopprijzen zien',
    public.bb_mag_inkoopprijs_zien(), false);
  -- Twee: het project uit de fixture en het project dat de deal via zijn trigger
  -- kreeg (20260921190434, project bij elke aanvraag).
  PERFORM pg_temp.check('Groei, operationeel: medewerker ziet de projecten van de ander',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.projects WHERE company_id = %L', cc)), 2);
  PERFORM pg_temp.check('Groei, operationeel: medewerker ziet de werkbon van de ander',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbonnen WHERE company_id = %L', cc)), 1);
  PERFORM pg_temp.check('Groei, operationeel: medewerker ziet de taken op die bon',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.werkbon_taken WHERE company_id = %L', cc)), 1);
  -- Zichzelf een recht geven kan niet.
  PERFORM pg_temp.check('Groei-medewerker kan zichzelf GEEN recht geven', pg_temp.lukt(format(
    $q$INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
       VALUES (%L, %L, 'facturen', true)$q$, cc, uc_mw)), false);
  RESET ROLE;

  -- Per financieel recht: toekennen, precies die ene module zien, intrekken,
  -- weer niets zien.
  FOREACH v_recht IN ARRAY ARRAY['verkoop', 'offertes', 'facturen', 'kosten'] LOOP
    PERFORM pg_temp.word(uc_admin);
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.check(format('Groei-admin kent %s toe', v_recht), pg_temp.lukt(format(
      $q$INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
         VALUES (%L, %L, %L, true)$q$, cc, uc_mw, v_recht)), true);
    RESET ROLE;

    PERFORM pg_temp.word(uc_mw);
    SET LOCAL ROLE authenticated;
    EXECUTE c_zicht INTO v_zicht;
    PERFORM pg_temp.check(format('met alleen %s: deals/offertes/facturen/kosten', v_recht), v_zicht,
      CASE v_recht WHEN 'verkoop' THEN '1/0/0/0' WHEN 'offertes' THEN '0/1/0/0'
                   WHEN 'facturen' THEN '0/0/1/0' WHEN 'kosten' THEN '0/0/0/1' END);
    RESET ROLE;

    PERFORM pg_temp.word(uc_admin);
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.check(format('Groei-admin trekt %s in', v_recht), pg_temp.geraakt(format(
      $q$DELETE FROM public.user_permissions WHERE user_id = %L AND permission = %L$q$, uc_mw, v_recht)), 1);
    RESET ROLE;

    PERFORM pg_temp.word(uc_mw);
    SET LOCAL ROLE authenticated;
    EXECUTE c_zicht INTO v_zicht;
    PERFORM pg_temp.check(format('na intrekken van %s: weer niets', v_recht), v_zicht, '0/0/0/0');
    RESET ROLE;
  END LOOP;

  -- Intrekken door het recht uit te zetten (granted = false) werkt net zo direct
  -- als de rij verwijderen.
  PERFORM pg_temp.word(uc_admin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('Groei-admin kent facturen opnieuw toe', pg_temp.lukt(format(
    $q$INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
       VALUES (%L, %L, 'facturen', true)$q$, cc, uc_mw)), true);
  PERFORM pg_temp.check('Groei-admin zet facturen uit (granted = false)', pg_temp.geraakt(format(
    $q$UPDATE public.user_permissions SET granted = false WHERE user_id = %L AND permission = 'facturen'$q$, uc_mw)), 1);
  RESET ROLE;
  PERFORM pg_temp.word(uc_mw);
  SET LOCAL ROLE authenticated;
  EXECUTE c_zicht INTO v_zicht;
  PERFORM pg_temp.check('uitgezet recht geeft geen toegang', v_zicht, '0/0/0/0');
  RESET ROLE;

  -- Niemand heeft alles_inzien gekregen zonder dat deze test het gaf: niet van
  -- de standaardrechtentrigger, niet van de plannermigratie, niet van Groei.
  SELECT count(*) INTO v_n FROM public.user_permissions
   WHERE company_id IN (ca, cb, cc) AND permission = 'alles_inzien';
  PERFORM pg_temp.check('niemand heeft automatisch alles_inzien', v_n, 0);
  SELECT count(*) INTO v_n FROM public.user_permissions
   WHERE user_id = ub_mw AND granted
     AND permission IN ('verkoop', 'offertes', 'facturen', 'kosten', 'bedrijfsfinancien',
                        'projectbedragen', 'inkoopprijzen', 'alles_inzien');
  PERFORM pg_temp.check('standaardrechtentrigger gaf geen financieel recht', v_n, 0);

  -- ── De bedrijfsgrens in het rechtenbeheer zelf ────────────────────────────
  -- De beheerder van A probeert rechten te zetten voor een medewerker van B.
  PERFORM pg_temp.word(ua_admin);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('admin A kan GEEN recht zetten in bedrijf B', pg_temp.lukt(format(
    $q$INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
       VALUES (%L, %L, 'facturen', true)$q$, cb, ub_mw)), false);
  -- De scherpe variant: een rij in het EIGEN bedrijf, maar op naam van iemand
  -- van een ander bedrijf. De policy keek alleen naar company_id, en
  -- bb_has_permission() alleen naar user_id: zo'n rij gaf de ander dus het recht
  -- in ZIJN bedrijf. Wie een eigen (proef)account heeft kon daarmee een
  -- medewerker elders financiele inzage geven.
  PERFORM pg_temp.check('admin A kan GEEN recht zetten op naam van iemand uit B', pg_temp.lukt(format(
    $q$INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
       VALUES (%L, %L, 'facturen', true)$q$, ca, ub_mw)), false);
  PERFORM pg_temp.check('admin A wijzigt 0 rechten van B', pg_temp.geraakt(format(
    $q$UPDATE public.user_permissions SET granted = true WHERE user_id = %L$q$, ub_mw)), 0);
  PERFORM pg_temp.check('admin A verwijdert 0 rechten van B', pg_temp.geraakt(format(
    $q$DELETE FROM public.user_permissions WHERE user_id = %L$q$, ub_mw)), 0);
  RESET ROLE;

  -- En mocht zo'n rij er toch staan (van vóór de fix, of via een andere weg):
  -- hij mag niet tellen. Hier als tabeleigenaar neergezet, buiten RLS om.
  DELETE FROM public.user_permissions WHERE user_id = ub_mw AND permission IN ('facturen', 'kosten');
  INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
  VALUES (ca, ub_mw, 'kosten', true);
  PERFORM pg_temp.word(ub_mw);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('een recht uit een ander bedrijf telt niet (bb_has_permission)',
    public.bb_has_permission('kosten'), false);
  PERFORM pg_temp.check('een recht uit een ander bedrijf telt niet (bb_is_admin_or_permission)',
    public.bb_is_admin_or_permission('kosten'), false);
  PERFORM pg_temp.check('medewerker B ziet geen kosten van B door een recht uit A',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.job_costs WHERE company_id = %L', cb)), 0);
  PERFORM pg_temp.check('medewerker B ziet geen facturen van B',
    pg_temp.zichtbaar(format('SELECT count(*)::int FROM public.facturen WHERE company_id = %L', cb)), 0);
  RESET ROLE;
  DELETE FROM public.user_permissions WHERE user_id = ub_mw AND company_id = ca;
END $$;

-- De uitslag als rijen: dit is wat je terugkrijgt, ook via de Management API,
-- en wat als voor- en nameting bewaard wordt.
SELECT nr, CASE WHEN geslaagd THEN 'PASS' ELSE 'FAIL' END AS uitslag, naam, coalesce(detail, '') AS detail
  FROM ap_resultaat ORDER BY nr;
SELECT count(*) AS totaal,
       count(*) FILTER (WHERE geslaagd) AS geslaagd,
       count(*) FILTER (WHERE NOT geslaagd) AS gefaald
  FROM ap_resultaat;

-- =============================================================================
-- SLOT
--
-- Onverwacht rood → de transactie breekt af met de namen erbij. Zonder dit blok
-- zou een gefaalde test alleen een WARNING zijn, en die komt niet terug via de
-- Management API.
--
-- Verwacht rood → wordt opgesomd, maar breekt niets af. Dat is de huidige stand
-- van zaken, niet een regressie.
--
-- Verwacht rood dat tóch groen is → de fix is geland. Ook dat wordt gemeld,
-- want dan hoort `check_rood` in dit bestand `check` te worden.
-- =============================================================================
DO $$
DECLARE
  v_onverwacht text[];
  v_open       text[];
  v_gefixt     text[];
  v_totaal     integer;
BEGIN
  SELECT array_agg(naam || ' → ' || COALESCE(detail, '')) INTO v_onverwacht
    FROM ap_resultaat WHERE NOT geslaagd AND NOT verwacht_rood;

  SELECT array_agg(naam) INTO v_open
    FROM ap_resultaat WHERE NOT geslaagd AND verwacht_rood;

  SELECT array_agg(naam) INTO v_gefixt
    FROM ap_resultaat WHERE geslaagd AND verwacht_rood;

  SELECT count(*) INTO v_totaal FROM ap_resultaat;

  IF v_open IS NOT NULL THEN
    RAISE NOTICE '── % als bekend gat gemarkeerde tests zijn nog rood: %',
      cardinality(v_open), array_to_string(v_open, ' | ');
  END IF;

  IF v_gefixt IS NOT NULL THEN
    RAISE NOTICE '── % als rood gemarkeerde tests zijn GROEN — fix geland, zet check_rood om naar check: %',
      cardinality(v_gefixt), array_to_string(v_gefixt, ' | ');
  END IF;

  IF v_onverwacht IS NOT NULL THEN
    RAISE EXCEPTION 'RECHTENTESTS GEFAALD (%): %',
      cardinality(v_onverwacht), array_to_string(v_onverwacht, ' | ');
  END IF;

  RAISE NOTICE '── % tests gedraaid, geen onverwachte fouten ──', v_totaal;
END $$;

-- Alles terugdraaien. Er blijft niets van deze test achter in de database.
ROLLBACK;
