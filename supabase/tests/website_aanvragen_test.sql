-- =============================================================================
-- website_aanvragen_test.sql — RLS, rechten en kruistenant-sloten van
-- website_forms, inquiries en website_inquiry_attempts.
--
-- Draait in één transactie en eindigt op ROLLBACK: er blijft niets achter.
-- Alle bedrijven en gebruikers zijn wegwerpspul met een WA-TEST-prefix.
--
--   supabase db query --linked -f supabase/tests/website_aanvragen_test.sql
--
-- Vereist dat migratie 20260915150000 gedraaid is. Een gefaalde test breekt de
-- transactie af met de namen van wat er niet klopte (zelfde opzet als
-- readonly_test.sql: via de Management API komen NOTICE-regels niet terug).
-- =============================================================================

BEGIN;

CREATE TEMP TABLE wa_resultaat (
  nr       serial primary key,
  naam     text,
  geslaagd boolean,
  detail   text
) ON COMMIT DROP;
GRANT ALL ON wa_resultaat TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE wa_resultaat_nr_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.check(p_naam text, p_werkelijk anyelement, p_verwacht anyelement)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ok boolean := p_werkelijk IS NOT DISTINCT FROM p_verwacht;
BEGIN
  INSERT INTO wa_resultaat (naam, geslaagd, detail)
  VALUES (p_naam, ok, CASE WHEN ok THEN NULL
    ELSE format('verwacht %s, kreeg %s', p_verwacht, COALESCE(p_werkelijk::text, 'NULL')) END);
END $$;

-- Voert een statement uit en meldt of hij erdoor kwam. Alleen de fouten die
-- een slot oplevert worden gevangen; al het andere knalt door (fout in de test).
CREATE OR REPLACE FUNCTION pg_temp.lukt(p_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR check_violation OR unique_violation THEN
  RETURN false;
END $$;

-- Aantal rijen dat een UPDATE raakt (0 = RLS hield hem tegen).
CREATE OR REPLACE FUNCTION pg_temp.geraakt(p_sql text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.check(text, anyelement, anyelement), pg_temp.lukt(text), pg_temp.geraakt(text)
  TO anon, authenticated, service_role;

-- Sessie wisselen. Zet ook de claims, zodat auth.uid() en daarmee
-- current_company_id() kloppen.
CREATE OR REPLACE FUNCTION pg_temp.als(p_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
END $$;

-- ── Testdata ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  a  uuid := '00000000-0000-4000-a000-00000000a001';  -- bedrijf A
  b  uuid := '00000000-0000-4000-a000-00000000b001';  -- bedrijf B
  ua uuid := '00000000-0000-4000-a000-00000000a0a1';  -- admin A
  um uuid := '00000000-0000-4000-a000-00000000a0a2';  -- medewerker A zonder verkooprecht
  uv uuid := '00000000-0000-4000-a000-00000000a0a3';  -- medewerker A mét verkooprecht
  ub uuid := '00000000-0000-4000-a000-00000000b0b1';  -- admin B
BEGIN
  INSERT INTO public.companies (id, name) VALUES (a, 'WA-TEST bedrijf A'), (b, 'WA-TEST bedrijf B');

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'wa-test-' || right(u::text, 4) || '@bossbase.test', '', now(), now(), now(), '', '', '', ''
    FROM unnest(array[ua, um, uv, ub]) u
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, company_id, full_name, role) VALUES
    (ua, a, 'WA-TEST admin A', 'admin'),
    (um, a, 'WA-TEST medewerker A', 'medewerker'),
    (uv, a, 'WA-TEST verkoper A', 'medewerker'),
    (ub, b, 'WA-TEST admin B', 'admin')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, role = EXCLUDED.role;

  INSERT INTO public.user_permissions (company_id, user_id, permission, granted)
  VALUES (a, uv, 'verkoop', true);

  INSERT INTO public.website_forms (id, company_id, name, public_token, allowed_domains) VALUES
    ('00000000-0000-4000-a000-00000000af01', a, 'WA-TEST formulier A', 'wf_watest_a_' || repeat('x', 40), array['https://a.example']),
    ('00000000-0000-4000-a000-00000000bf01', b, 'WA-TEST formulier B', 'wf_watest_b_' || repeat('x', 40), array['https://b.example']);

  INSERT INTO public.customers (id, company_id, name) VALUES
    ('00000000-0000-4000-a000-00000000ac01', a, 'WA-TEST klant A'),
    ('00000000-0000-4000-a000-00000000bc01', b, 'WA-TEST klant B');

  -- Zoals de Edge Function het doet: als service_role, company_id uit het formulier.
  INSERT INTO public.inquiries (id, company_id, form_id, name, email, message, source, is_test, submission_id)
  VALUES ('00000000-0000-4000-a000-00000000a1a1', a, '00000000-0000-4000-a000-00000000af01',
          'WA-TEST Jan', 'jan@a.example', 'Graag een demo', 'bossbase_website', true,
          '00000000-0000-4000-a000-0000000051d1');
END $$;

-- ── 1. De eigen admin ziet en beheert de aanvraag ─────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.als('00000000-0000-4000-a000-00000000a0a1');
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.check('admin A ziet de aanvraag van A',
    (SELECT count(*) FROM public.inquiries WHERE name LIKE 'WA-TEST%'), 1::bigint);
  PERFORM pg_temp.check('admin A ziet het formulier van A, niet dat van B',
    (SELECT string_agg(name, ',') FROM public.website_forms WHERE name LIKE 'WA-TEST%'), 'WA-TEST formulier A');
  PERFORM pg_temp.check('admin A kan de status wijzigen',
    pg_temp.geraakt($q$UPDATE public.inquiries SET status = 'in_behandeling' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), 1);
  PERFORM pg_temp.check('ongeldige status wordt geweigerd',
    pg_temp.lukt($q$UPDATE public.inquiries SET status = 'weg' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), false);
  PERFORM pg_temp.check('admin A kan een eigen klant koppelen',
    pg_temp.lukt($q$UPDATE public.inquiries SET customer_id = '00000000-0000-4000-a000-00000000ac01' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), true);

  -- company_id manipuleren vanuit de browser
  PERFORM pg_temp.check('admin A kan company_id niet wijzigen',
    pg_temp.lukt($q$UPDATE public.inquiries SET company_id = '00000000-0000-4000-a000-00000000b001' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), false);
  PERFORM pg_temp.check('admin A kan het bericht niet herschrijven',
    pg_temp.lukt($q$UPDATE public.inquiries SET message = 'anders' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), false);
  PERFORM pg_temp.check('admin A kan is_test niet omzetten',
    pg_temp.lukt($q$UPDATE public.inquiries SET is_test = false WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), false);
  PERFORM pg_temp.check('admin A kan zelf geen aanvraag invoegen',
    pg_temp.lukt($q$INSERT INTO public.inquiries (company_id, name, email, message) VALUES ('00000000-0000-4000-a000-00000000a001', 'x', 'x@x.nl', 'x')$q$), false);
  PERFORM pg_temp.check('admin A kan geen aanvraag verwijderen',
    pg_temp.lukt($q$DELETE FROM public.inquiries WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), false);
  PERFORM pg_temp.check('admin A kan het formulier niet wijzigen',
    pg_temp.lukt($q$UPDATE public.website_forms SET is_active = false WHERE company_id = '00000000-0000-4000-a000-00000000a001'$q$), false);

  -- Kruistenant: een klant van B aan een aanvraag van A hangen
  PERFORM pg_temp.check('KRUISTENANT: klant van B koppelen aan aanvraag van A geweigerd',
    pg_temp.lukt($q$UPDATE public.inquiries SET customer_id = '00000000-0000-4000-a000-00000000bc01' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), false);
  PERFORM pg_temp.check('KRUISTENANT: medewerker van B toewijzen geweigerd',
    pg_temp.lukt($q$UPDATE public.inquiries SET assigned_to = '00000000-0000-4000-a000-00000000b0b1' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), false);

  PERFORM pg_temp.check('rate-limitfunctie niet uitvoerbaar voor ingelogde gebruiker',
    pg_temp.lukt($q$SELECT public.bb_website_inquiry_claim('x', 1, 60)$q$), false);
  PERFORM pg_temp.check('limiettabel niet leesbaar voor ingelogde gebruiker',
    pg_temp.lukt($q$SELECT 1 FROM public.website_inquiry_attempts$q$), false);
  RESET ROLE;
END $$;

-- ── 2. Zonder verkooprecht of van een ander bedrijf: niets ─────────────────────
DO $$
BEGIN
  PERFORM pg_temp.als('00000000-0000-4000-a000-00000000a0a2');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('medewerker A zonder verkooprecht ziet geen aanvragen',
    (SELECT count(*) FROM public.inquiries WHERE name LIKE 'WA-TEST%'), 0::bigint);
  PERFORM pg_temp.check('medewerker A zonder verkooprecht kan de status niet wijzigen',
    pg_temp.geraakt($q$UPDATE public.inquiries SET status = 'spam' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), 0);
  RESET ROLE;

  PERFORM pg_temp.als('00000000-0000-4000-a000-00000000a0a3');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('medewerker A mét verkooprecht ziet de aanvraag',
    (SELECT count(*) FROM public.inquiries WHERE name LIKE 'WA-TEST%'), 1::bigint);
  RESET ROLE;

  PERFORM pg_temp.als('00000000-0000-4000-a000-00000000b0b1');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check('ANDER BEDRIJF: admin B ziet de aanvraag van A niet',
    (SELECT count(*) FROM public.inquiries WHERE id = '00000000-0000-4000-a000-00000000a1a1'), 0::bigint);
  PERFORM pg_temp.check('ANDER BEDRIJF: admin B kan de aanvraag van A niet wijzigen',
    pg_temp.geraakt($q$UPDATE public.inquiries SET status = 'spam' WHERE id = '00000000-0000-4000-a000-00000000a1a1'$q$), 0);
  PERFORM pg_temp.check('ANDER BEDRIJF: admin B ziet het formulier van A niet',
    (SELECT count(*) FROM public.website_forms WHERE company_id = '00000000-0000-4000-a000-00000000a001'), 0::bigint);
  RESET ROLE;
END $$;

-- ── 3. Anoniem: helemaal niets ─────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  PERFORM pg_temp.check('anon kan inquiries niet lezen',
    pg_temp.lukt($q$SELECT 1 FROM public.inquiries$q$), false);
  PERFORM pg_temp.check('anon kan niet rechtstreeks in inquiries schrijven',
    pg_temp.lukt($q$INSERT INTO public.inquiries (company_id, name, email, message) VALUES ('00000000-0000-4000-a000-00000000a001', 'x', 'x@x.nl', 'x')$q$), false);
  PERFORM pg_temp.check('anon kan inquiries niet wijzigen',
    pg_temp.lukt($q$UPDATE public.inquiries SET status = 'spam'$q$), false);
  PERFORM pg_temp.check('anon kan inquiries niet verwijderen',
    pg_temp.lukt($q$DELETE FROM public.inquiries$q$), false);
  PERFORM pg_temp.check('anon kan website_forms (en dus tokens) niet lezen',
    pg_temp.lukt($q$SELECT public_token FROM public.website_forms$q$), false);
  PERFORM pg_temp.check('anon kan de rate-limitfunctie niet aanroepen',
    pg_temp.lukt($q$SELECT public.bb_website_inquiry_claim('x', 1, 60)$q$), false);
  RESET ROLE;
END $$;

-- ── 4. Server-kant: sloten die ook voor de service_role gelden ─────────────────
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.check('company_id van B met formulier van A wordt geweigerd',
    pg_temp.lukt($q$INSERT INTO public.inquiries (company_id, form_id, name, email, message)
                   VALUES ('00000000-0000-4000-a000-00000000b001', '00000000-0000-4000-a000-00000000af01', 'x', 'x@x.nl', 'x')$q$), false);
  PERFORM pg_temp.check('dezelfde submission_id twee keer wordt geweigerd',
    pg_temp.lukt($q$INSERT INTO public.inquiries (company_id, form_id, name, email, message, submission_id)
                   VALUES ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a000-00000000af01', 'x', 'x@x.nl', 'x',
                           '00000000-0000-4000-a000-0000000051d1')$q$), false);
  PERFORM pg_temp.check('rate limit: 1e poging binnen max 2', public.bb_website_inquiry_claim('wa-test:k', 2, 600), true);
  PERFORM pg_temp.check('rate limit: 2e poging binnen max 2', public.bb_website_inquiry_claim('wa-test:k', 2, 600), true);
  PERFORM pg_temp.check('rate limit: 3e poging geblokkeerd',  public.bb_website_inquiry_claim('wa-test:k', 2, 600), false);
  PERFORM pg_temp.check('rate limit: andere sleutel los geteld', public.bb_website_inquiry_claim('wa-test:j', 2, 600), true);
  RESET ROLE;
END $$;

-- ── 5. Rechten zoals ze in de catalogus staan ──────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.check('RLS staat aan op inquiries',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.inquiries'::regclass), true);
  PERFORM pg_temp.check('RLS staat aan op website_forms',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.website_forms'::regclass), true);
  PERFORM pg_temp.check('RLS staat aan op website_inquiry_attempts',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.website_inquiry_attempts'::regclass), true);
  PERFORM pg_temp.check('bb_website_inquiry_claim: alleen service_role',
    (SELECT string_agg(r.rolname, ',' ORDER BY r.rolname) FROM pg_roles r, pg_proc p
      WHERE p.proname = 'bb_website_inquiry_claim' AND p.pronamespace = 'public'::regnamespace
        AND r.rolname IN ('anon', 'authenticated', 'service_role')
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')), 'service_role');
  PERFORM pg_temp.check('formulier van BossBase Admin bestaat met een geldig token (als het bedrijf bestaat)',
    (SELECT NOT EXISTS (SELECT 1 FROM public.companies WHERE id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca')
         OR EXISTS (SELECT 1 FROM public.website_forms
                     WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca'
                       AND settings->>'source' = 'bossbase_website'
                       AND is_active AND public_token ~ '^wf_[0-9a-f]{64}$'
                       AND 'https://bossbase.nl' = ANY (allowed_domains))), true);
END $$;

-- ── SLOT: FALEN MOET ZICHTBAAR ZIJN ──────────────────────────────────────────
DO $$
DECLARE
  v_fout  text[];
  v_totaal int;
BEGIN
  SELECT array_agg(naam || ' → ' || COALESCE(detail, '')) INTO v_fout
  FROM wa_resultaat WHERE NOT geslaagd;
  IF v_fout IS NOT NULL THEN
    RAISE EXCEPTION 'WEBSITEAANVRAAG-TESTS GEFAALD (%): %',
      cardinality(v_fout), array_to_string(v_fout, ' | ');
  END IF;
  SELECT count(*) INTO v_totaal FROM wa_resultaat;
  RAISE NOTICE '── alle % websiteaanvraag-tests geslaagd ──', v_totaal;
END $$;

ROLLBACK;
