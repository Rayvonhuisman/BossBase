-- =============================================================================
-- readonly_test.sql — read-only voor accounts zonder geldig abonnement.
--
-- Draait in één transactie en eindigt op ROLLBACK: er blijft niets achter.
-- Raakt geen productiedata aan; alle bedrijven en gebruikers hieronder zijn
-- wegwerpspul met een vaste RO-TEST-prefix en eigen uuid's.
--
--   supabase db query --linked "$(cat supabase/tests/readonly_test.sql)"
--
-- Elke test print PASS of FAIL. Eén FAIL is er één te veel: dan zit er een gat
-- in de afdwinging, of erger — dan staat er iemand ten onrechte op slot.
-- =============================================================================

BEGIN;

SET LOCAL client_min_messages TO NOTICE;

-- ── Testhulp ─────────────────────────────────────────────────────────────────
-- De uitslag gaat in een tabel, niet in RAISE NOTICE. Reden: we draaien deze
-- droogloop via de Management API, en die geeft NOTICE- en WARNING-regels niet
-- terug. Zou een test falen met alleen een WARNING, dan zag je "geen fout" en
-- dus ten onrechte groen. Nu is elke uitslag een RIJ die je terugkrijgt, en
-- struikelt de transactie aan het eind alsnog over de eerste FAIL.
CREATE TEMP TABLE ro_resultaat (
  nr       serial primary key,
  naam     text,
  geslaagd boolean,
  detail   text
) ON COMMIT DROP;

-- Delen van de tests draaien als `authenticated` om RLS écht te raken; die rol
-- moet zijn uitslag wel kwijt kunnen in deze tabel.
GRANT ALL ON ro_resultaat TO authenticated, service_role;
GRANT ALL ON SEQUENCE ro_resultaat_nr_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.check(p_naam text, p_werkelijk boolean, p_verwacht boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ok boolean := p_werkelijk IS NOT DISTINCT FROM p_verwacht;
BEGIN
  INSERT INTO ro_resultaat (naam, geslaagd, detail)
  VALUES (p_naam, ok, CASE WHEN ok THEN NULL
    ELSE format('verwacht %s, kreeg %s', p_verwacht, COALESCE(p_werkelijk::text, 'NULL')) END);
  IF ok THEN RAISE NOTICE 'PASS  %', p_naam;
  ELSE RAISE WARNING 'FAIL  %  (verwacht %, kreeg %)', p_naam, p_verwacht, COALESCE(p_werkelijk::text, 'NULL');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.check_tekst(p_naam text, p_werkelijk text, p_verwacht text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ok boolean := p_werkelijk IS NOT DISTINCT FROM p_verwacht;
BEGIN
  INSERT INTO ro_resultaat (naam, geslaagd, detail)
  VALUES (p_naam, ok, CASE WHEN ok THEN COALESCE(p_werkelijk, 'geen')
    ELSE format('verwacht %s, kreeg %s', COALESCE(p_verwacht, 'NULL'), COALESCE(p_werkelijk, 'NULL')) END);
  IF ok THEN RAISE NOTICE 'PASS  %  (%)', p_naam, COALESCE(p_werkelijk, 'geen');
  ELSE RAISE WARNING 'FAIL  %  (verwacht %, kreeg %)', p_naam, COALESCE(p_verwacht, 'NULL'), COALESCE(p_werkelijk, 'NULL');
  END IF;
END $$;

-- Voert een INSERT/UPDATE uit en meldt of hij erdoor kwam. Alleen de twee fouten
-- die een gate oplevert worden gevangen; al het andere (typefout, ontbrekende
-- kolom) knalt gewoon door, want dat is een fout in de test zelf.
CREATE OR REPLACE FUNCTION pg_temp.lukt(p_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RETURN false;
END $$;

-- ── Testbedrijven en -gebruikers ─────────────────────────────────────────────
DO $$
DECLARE
  v_trial     uuid := '00000000-0000-4000-a000-000000000101';
  v_verlopen  uuid := '00000000-0000-4000-a000-000000000102';
  v_betalend  uuid := '00000000-0000-4000-a000-000000000103';
  v_pastdue   uuid := '00000000-0000-4000-a000-000000000104';
  v_opgezegd  uuid := '00000000-0000-4000-a000-000000000105';
  v_geenconf  uuid := '00000000-0000-4000-a000-000000000106';
  v_rand      uuid := '00000000-0000-4000-a000-000000000107';
  v_uro       uuid := '00000000-0000-4000-a000-00000000020a';
  v_uok       uuid := '00000000-0000-4000-a000-00000000020b';
  v_utr       uuid := '00000000-0000-4000-a000-00000000020c';
BEGIN
  INSERT INTO public.companies (id, name) VALUES
    (v_trial,    'RO-TEST proefperiode loopt'),
    (v_verlopen, 'RO-TEST proefperiode verlopen'),
    (v_betalend, 'RO-TEST betalend'),
    (v_pastdue,  'RO-TEST betaling mislukt'),
    (v_opgezegd, 'RO-TEST opgezegd'),
    (v_geenconf, 'RO-TEST geen configuratie'),
    (v_rand,     'RO-TEST randgevallen');

  -- bb_seed_trial_subscription() heeft er al een trial-rij bij gezet; die
  -- werken we per bedrijf bij naar de toestand die we willen testen.
  UPDATE public.subscriptions SET plan='groei', status='trial',
         trial_ends_at = now() + interval '5 days'
   WHERE company_id = v_trial;

  UPDATE public.subscriptions SET plan='groei', status='trial',
         trial_ends_at = now() - interval '3 days'
   WHERE company_id = v_verlopen;

  UPDATE public.subscriptions SET plan='groei', status='actief',
         trial_ends_at = now() - interval '40 days',
         stripe_customer_id='cus_ROTEST3', stripe_subscription_id='sub_ROTEST3',
         stripe_status='active', current_period_end = now() + interval '20 days'
   WHERE company_id = v_betalend;

  UPDATE public.subscriptions SET plan='groei', status='betaalprobleem',
         trial_ends_at = now() - interval '40 days',
         stripe_customer_id='cus_ROTEST4', stripe_subscription_id='sub_ROTEST4',
         stripe_status='past_due'
   WHERE company_id = v_pastdue;

  UPDATE public.subscriptions SET plan='groei', status='opgezegd',
         trial_ends_at = now() - interval '90 days',
         stripe_customer_id='cus_ROTEST5', stripe_subscription_id='sub_ROTEST5',
         stripe_status='canceled'
   WHERE company_id = v_opgezegd;

  -- Veiligheidsklep-scenario: bedrijf ZONDER abonnementsrij. Zo ziet een
  -- registratie eruit die halverwege strandde, of data die met de hand is
  -- aangepast.
  DELETE FROM public.subscriptions WHERE company_id = v_geenconf;

  -- Gebruikers. auth.users wil lege strings in de tokenkolommen, geen NULL —
  -- anders struikelt GoTrue er later over.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  VALUES
    (v_uro, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ro-test-readonly@bossbase.test', '', now(), now(), now(), '', '', '', ''),
    (v_uok, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ro-test-betalend@bossbase.test', '', now(), now(), now(), '', '', '', ''),
    (v_utr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ro-test-trial@bossbase.test', '', now(), now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  -- handle_new_user() maakt bij een auth-insert al een profielrij aan.
  INSERT INTO public.profiles (id, company_id, full_name, role) VALUES
    (v_uro, v_verlopen, 'RO-TEST read-only', 'admin'),
    (v_uok, v_betalend, 'RO-TEST betalend',  'admin'),
    (v_utr, v_trial,    'RO-TEST proef',     'admin')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, role = EXCLUDED.role;
END $$;

-- ── 1. WIE IS READ-ONLY, EN WAAROM? ──────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '── 1. bb_is_readonly / bb_readonly_reden ──';

  PERFORM pg_temp.check('lopende 14-daagse proefperiode is NIET read-only',
    public.bb_is_readonly('00000000-0000-4000-a000-000000000101'), false);

  PERFORM pg_temp.check('verlopen proefperiode zonder abonnement IS read-only',
    public.bb_is_readonly('00000000-0000-4000-a000-000000000102'), true);
  PERFORM pg_temp.check_tekst('  reden',
    public.bb_readonly_reden('00000000-0000-4000-a000-000000000102'), 'proefperiode_verlopen');

  PERFORM pg_temp.check('betalend bedrijf is NIET read-only',
    public.bb_is_readonly('00000000-0000-4000-a000-000000000103'), false);

  PERFORM pg_temp.check('past_due IS read-only',
    public.bb_is_readonly('00000000-0000-4000-a000-000000000104'), true);
  PERFORM pg_temp.check_tekst('  reden',
    public.bb_readonly_reden('00000000-0000-4000-a000-000000000104'), 'betaling_mislukt');

  PERFORM pg_temp.check('opgezegd (Stripe canceled) IS read-only',
    public.bb_is_readonly('00000000-0000-4000-a000-000000000105'), true);
  PERFORM pg_temp.check_tekst('  reden',
    public.bb_readonly_reden('00000000-0000-4000-a000-000000000105'), 'opgezegd');

  -- De belangrijkste test van dit bestand.
  PERFORM pg_temp.check('VEILIGHEIDSKLEP: bedrijf zonder abonnementsrij is NIET read-only',
    public.bb_is_readonly('00000000-0000-4000-a000-000000000106'), false);
END $$;

-- ── 2. VEILIGHEIDSKLEP, HARDER GETEST ────────────────────────────────────────
-- Niet alleen "geen abonnementsrij", maar élk moment waarop we het niet zeker
-- weten: onbekende status, ontbrekende status, ontbrekende einddatum, lege
-- matrix. Stuk voor stuk hoort het antwoord dan "open" te zijn.
DO $$
DECLARE
  v_rand   uuid := '00000000-0000-4000-a000-000000000107';
  v_verl   uuid := '00000000-0000-4000-a000-000000000102';
  v_limits int;
BEGIN
  RAISE NOTICE '── 2. veiligheidsklep ──';

  UPDATE public.subscriptions SET plan='groei', status='actief',
         trial_ends_at = now() - interval '40 days',
         stripe_subscription_id='sub_ROTEST7', stripe_status='iets_nieuws_van_stripe'
   WHERE company_id = v_rand;
  PERFORM pg_temp.check('onbekende Stripe-status → niet read-only',
    public.bb_is_readonly(v_rand), false);

  UPDATE public.subscriptions SET stripe_status = NULL WHERE company_id = v_rand;
  PERFORM pg_temp.check('Stripe-abonnement zonder status (webhook onderweg) → niet read-only',
    public.bb_is_readonly(v_rand), false);

  UPDATE public.subscriptions SET stripe_status = 'incomplete' WHERE company_id = v_rand;
  PERFORM pg_temp.check('stripe_status incomplete (vlak na checkout) → niet read-only',
    public.bb_is_readonly(v_rand), false);

  UPDATE public.subscriptions SET stripe_subscription_id = NULL, stripe_status = NULL,
         status = 'trial', trial_ends_at = NULL
   WHERE company_id = v_rand;
  PERFORM pg_temp.check('proefperiode zonder einddatum → niet read-only',
    public.bb_is_readonly(v_rand), false);

  UPDATE public.subscriptions SET status = 'actief', trial_ends_at = now() - interval '200 days'
   WHERE company_id = v_rand;
  PERFORM pg_temp.check('handmatig op actief zonder Stripe → niet read-only',
    public.bb_is_readonly(v_rand), false);

  -- Lege matrix. Even weghalen, controleren, en netjes terugzetten — andere
  -- tests in deze transactie hebben hem ook nodig.
  CREATE TEMP TABLE ro_backup_limits ON COMMIT DROP AS SELECT * FROM public.plan_limits;
  SELECT count(*) INTO v_limits FROM public.plan_limits;
  DELETE FROM public.plan_limits;
  PERFORM pg_temp.check('lege plan_limits → verlopen bedrijf is NIET read-only',
    public.bb_is_readonly(v_verl), false);
  INSERT INTO public.plan_limits SELECT * FROM ro_backup_limits;
  PERFORM pg_temp.check('matrix hersteld → verlopen bedrijf weer read-only',
    public.bb_is_readonly(v_verl), true);
  PERFORM pg_temp.check('  en de matrix is compleet teruggezet',
    (SELECT count(*) FROM public.plan_limits) = v_limits, true);
END $$;

-- ── 3. READ-ONLY BEDRIJF: WAT GAAT DICHT ─────────────────────────────────────
-- Vanaf hier draaien we als echte ingelogde gebruiker (rol authenticated met
-- JWT-claim). Dat is de enige manier om RLS écht te raken — als superuser lopen
-- we er dwars overheen en kleurt alles ten onrechte groen.
DO $$
DECLARE
  c    uuid := '00000000-0000-4000-a000-000000000102';
  u    uuid := '00000000-0000-4000-a000-00000000020a';
BEGIN
  RAISE NOTICE '── 3. read-only bedrijf: aanmaken geblokkeerd ──';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.check('sessie hoort bij het testbedrijf', public.bb_current_company() = c, true);
  PERFORM pg_temp.check('server ziet dit bedrijf als read-only', public.bb_is_readonly(), true);

  PERFORM pg_temp.check('klant aanmaken geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.customers (company_id, name) VALUES (%L, 'RO-TEST klant')$q$, c)), false);

  PERFORM pg_temp.check('offerte aanmaken geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.offertes (company_id, nummer, status) VALUES (%L, 'RO-T-1', 'concept')$q$, c)), false);

  PERFORM pg_temp.check('factuur aanmaken geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.facturen (company_id, nummer, status) VALUES (%L, 'RO-F-1', 'concept')$q$, c)), false);

  PERFORM pg_temp.check('werkbon aanmaken geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.werkbonnen (company_id, titel) VALUES (%L, 'RO-TEST werkbon')$q$, c)), false);

  PERFORM pg_temp.check('afspraak aanmaken geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.calendar_events (company_id, title, start_at, end_at)
       VALUES (%L, 'RO-TEST afspraak', now(), now() + interval '1 hour')$q$, c)), false);

  PERFORM pg_temp.check('project aanmaken geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.projects (company_id, name) VALUES (%L, 'RO-TEST project')$q$, c)), false);

  PERFORM pg_temp.check('uren boeken geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.urenregistratie (company_id, profile_id, datum, uren)
       VALUES (%L, %L, current_date, 4)$q$, c, u)), false);

  PERFORM pg_temp.check('notitie toevoegen geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.notes (company_id, content) VALUES (%L, 'RO-TEST notitie')$q$, c)), false);

  PERFORM pg_temp.check('kosten toevoegen geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.job_costs (company_id, description, amount) VALUES (%L, 'RO-TEST kosten', 50)$q$, c)), false);

  PERFORM pg_temp.check('teamlid uitnodigen geblokkeerd', pg_temp.lukt(format(
    $q$INSERT INTO public.company_members (company_id, email) VALUES (%L, 'ro-test-lid@bossbase.test')$q$, c)), false);

  RESET ROLE;
END $$;

-- ── 4. READ-ONLY BEDRIJF: WAT MOET BLIJVEN WERKEN ────────────────────────────
DO $$
DECLARE
  c        uuid := '00000000-0000-4000-a000-000000000102';
  u        uuid := '00000000-0000-4000-a000-00000000020a';
  v_klant  uuid;
  v_fact   uuid;
  v_off    uuid;
  v_credit uuid;
  v_aantal int;
  v_gelukt boolean;
BEGIN
  RAISE NOTICE '── 4. read-only bedrijf: lezen, corrigeren, geld ──';

  -- Gegevens die er al stonden toen het abonnement nog liep.
  INSERT INTO public.customers (company_id, name) VALUES (c, 'RO-TEST bestaande klant')
    RETURNING id INTO v_klant;
  INSERT INTO public.facturen (company_id, nummer, status, customer_id)
    VALUES (c, 'RO-F-BESTAAND', 'concept', v_klant) RETURNING id INTO v_fact;
  INSERT INTO public.offertes (company_id, nummer, status, customer_id)
    VALUES (c, 'RO-T-BESTAAND', 'concept', v_klant) RETURNING id INTO v_off;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  SET LOCAL ROLE authenticated;

  -- Lezen en exporteren: het is zijn eigen administratie.
  SELECT count(*) INTO v_aantal FROM public.customers WHERE company_id = c;
  PERFORM pg_temp.check('bestaande klanten blijven zichtbaar', v_aantal > 0, true);
  SELECT count(*) INTO v_aantal FROM public.facturen WHERE company_id = c;
  PERFORM pg_temp.check('bestaande facturen blijven zichtbaar', v_aantal > 0, true);
  SELECT count(*) INTO v_aantal FROM public.offertes WHERE company_id = c;
  PERFORM pg_temp.check('bestaande offertes blijven zichtbaar', v_aantal > 0, true);

  -- Corrigeren mag: een typefout hoort niet achter een betaalmuur.
  UPDATE public.customers SET name = 'RO-TEST bestaande klant (gecorrigeerd)' WHERE id = v_klant;
  PERFORM pg_temp.check('bestaande klant bewerken werkt',
    (SELECT name LIKE '%gecorrigeerd%' FROM public.customers WHERE id = v_klant), true);

  -- Versturen gaat dicht.
  BEGIN
    UPDATE public.offertes SET status = 'verzonden' WHERE id = v_off;
    v_gelukt := true;
  EXCEPTION WHEN check_violation THEN v_gelukt := false;
  END;
  PERFORM pg_temp.check('offerte versturen geblokkeerd', v_gelukt, false);

  BEGIN
    UPDATE public.facturen SET status = 'verzonden' WHERE id = v_fact;
    v_gelukt := true;
  EXCEPTION WHEN check_violation THEN v_gelukt := false;
  END;
  PERFORM pg_temp.check('factuur versturen geblokkeerd', v_gelukt, false);

  -- Maar geld dat binnenkomt: altijd.
  BEGIN
    UPDATE public.facturen SET status = 'betaald' WHERE id = v_fact;
    v_gelukt := true;
  EXCEPTION WHEN check_violation THEN v_gelukt := false;
  END;
  PERFORM pg_temp.check('factuur op betaald zetten werkt', v_gelukt, true);
  PERFORM pg_temp.check('  en staat ook echt op betaald',
    (SELECT status = 'betaald' FROM public.facturen WHERE id = v_fact), true);

  -- Creditfactuur: correctie op geleverd werk, geen nieuwe omzet.
  PERFORM pg_temp.check('creditfactuur aanmaken mag wél', pg_temp.lukt(format(
    $q$INSERT INTO public.facturen (company_id, nummer, status, is_credit)
       VALUES (%L, 'RO-F-CREDIT', 'concept', true)$q$, c)), true);
  SELECT id INTO v_credit FROM public.facturen WHERE company_id = c AND nummer = 'RO-F-CREDIT';
  PERFORM pg_temp.check('  en de regels van die creditfactuur ook', pg_temp.lukt(format(
    $q$INSERT INTO public.factuur_regels (company_id, factuur_id, omschrijving, aantal, eenheidsprijs)
       VALUES (%L, %L, 'Creditregel', 1, -100)$q$, c, v_credit)), true);

  RESET ROLE;
END $$;

-- ── 5. INKOMENDE LEAD KOMT ALTIJD BINNEN ─────────────────────────────────────
-- Websiteformulier en mailkoppeling schrijven via service_role en omzeilen RLS.
-- Zelfde regel als bij de klantcap: een aanvraag van een potentiële klant weiger
-- je nooit, wat de abonnementsstand ook is.
DO $$
DECLARE
  c      uuid := '00000000-0000-4000-a000-000000000102';
  k_lead uuid := gen_random_uuid();
BEGIN
  RAISE NOTICE '── 5. inkomende lead ──';
  PERFORM pg_temp.check('bedrijf staat op read-only', public.bb_is_readonly(c), true);

  SET LOCAL ROLE service_role;
  INSERT INTO public.customers (id, company_id, name, email)
  VALUES (k_lead, c, 'RO-TEST binnengekomen lead', 'lead@voorbeeld.invalid');
  INSERT INTO public.deals (company_id, customer_id, title)
  VALUES (c, k_lead, 'RO-TEST aanvraag via websiteformulier');
  RESET ROLE;

  PERFORM pg_temp.check('inkomende lead komt binnen ondanks read-only',
    EXISTS (SELECT 1 FROM public.customers WHERE id = k_lead), true);
  PERFORM pg_temp.check('bijbehorende deal komt ook binnen',
    EXISTS (SELECT 1 FROM public.deals WHERE customer_id = k_lead), true);
END $$;

-- ── 6. BETALEND BEDRIJF MERKT NIETS ──────────────────────────────────────────
DO $$
DECLARE
  c uuid := '00000000-0000-4000-a000-000000000103';
  u uuid := '00000000-0000-4000-a000-00000000020b';
  v_off uuid;
  v_gelukt boolean;
BEGIN
  RAISE NOTICE '── 6. betalend bedrijf ──';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.check('server ziet dit bedrijf NIET als read-only', public.bb_is_readonly(), false);

  PERFORM pg_temp.check('klant aanmaken werkt', pg_temp.lukt(format(
    $q$INSERT INTO public.customers (company_id, name) VALUES (%L, 'RO-TEST klant betalend')$q$, c)), true);
  PERFORM pg_temp.check('offerte aanmaken werkt', pg_temp.lukt(format(
    $q$INSERT INTO public.offertes (company_id, nummer, status) VALUES (%L, 'RO-OK-1', 'concept')$q$, c)), true);
  PERFORM pg_temp.check('werkbon aanmaken werkt', pg_temp.lukt(format(
    $q$INSERT INTO public.werkbonnen (company_id, titel) VALUES (%L, 'RO-TEST werkbon betalend')$q$, c)), true);
  PERFORM pg_temp.check('uren boeken werkt', pg_temp.lukt(format(
    $q$INSERT INTO public.urenregistratie (company_id, profile_id, datum, uren)
       VALUES (%L, %L, current_date, 4)$q$, c, u)), true);

  SELECT id INTO v_off FROM public.offertes WHERE company_id = c AND nummer = 'RO-OK-1';
  BEGIN
    UPDATE public.offertes SET status = 'verzonden' WHERE id = v_off;
    v_gelukt := true;
  EXCEPTION WHEN check_violation THEN v_gelukt := false;
  END;
  PERFORM pg_temp.check('offerte versturen werkt', v_gelukt, true);

  RESET ROLE;
END $$;

-- ── 7. BEDRIJF IN DE 14-DAAGSE PROEFPERIODE MERKT NIETS ──────────────────────
DO $$
DECLARE
  c uuid := '00000000-0000-4000-a000-000000000101';
  u uuid := '00000000-0000-4000-a000-00000000020c';
BEGIN
  RAISE NOTICE '── 7. bedrijf in de gratis proefperiode ──';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.check('proefperiode is NIET read-only', public.bb_is_readonly(), false);
  PERFORM pg_temp.check('klant aanmaken werkt', pg_temp.lukt(format(
    $q$INSERT INTO public.customers (company_id, name) VALUES (%L, 'RO-TEST klant proef')$q$, c)), true);
  PERFORM pg_temp.check('offerte aanmaken werkt', pg_temp.lukt(format(
    $q$INSERT INTO public.offertes (company_id, nummer, status) VALUES (%L, 'RO-TR-1', 'concept')$q$, c)), true);

  RESET ROLE;
END $$;

-- ── 8. ABONNEMENT AFSLUITEN OPENT HET ACCOUNT DIRECT ─────────────────────────
-- Het scenario dat écht moet kloppen: klant zit vast, betaalt, en kan meteen
-- weer verder. Geen wachttijd, geen opnieuw inloggen.
DO $$
DECLARE
  c uuid := '00000000-0000-4000-a000-000000000102';
  u uuid := '00000000-0000-4000-a000-00000000020a';
BEGIN
  RAISE NOTICE '── 8. van read-only naar betalend ──';

  PERFORM pg_temp.check('vóór betaling: read-only', public.bb_is_readonly(c), true);

  -- Precies wat bb_stripe_sync_subscription doet na een geslaagde checkout.
  UPDATE public.subscriptions SET
    status = 'actief', stripe_customer_id = 'cus_RONIEUW',
    stripe_subscription_id = 'sub_RONIEUW', stripe_status = 'active',
    current_period_start = now(), current_period_end = now() + interval '1 month'
  WHERE company_id = c;

  PERFORM pg_temp.check('ná betaling: niet meer read-only', public.bb_is_readonly(c), false);
  PERFORM pg_temp.check_tekst('  en er is geen reden meer', public.bb_readonly_reden(c), NULL);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.check('klant aanmaken werkt weer', pg_temp.lukt(format(
    $q$INSERT INTO public.customers (company_id, name) VALUES (%L, 'RO-TEST na betaling')$q$, c)), true);
  PERFORM pg_temp.check('offerte aanmaken werkt weer', pg_temp.lukt(format(
    $q$INSERT INTO public.offertes (company_id, nummer, status) VALUES (%L, 'RO-NA-1', 'concept')$q$, c)), true);
  PERFORM pg_temp.check('uren boeken werkt weer', pg_temp.lukt(format(
    $q$INSERT INTO public.urenregistratie (company_id, profile_id, datum, uren)
       VALUES (%L, %L, current_date, 8)$q$, c, u)), true);

  RESET ROLE;
END $$;

-- ── 9. DEKKING: STAAT ER OP ELKE BEDOELDE TABEL EEN GATE? ────────────────────
DO $$
DECLARE
  v_tabel text;
  v_mist  text[] := '{}';
  v_tabellen text[] := ARRAY[
    'customers','deals','offertes','offerte_items','facturen','factuur_regels',
    'werkbonnen','werkbon_taken','werkbon_materialen','werkbon_meerwerk','werkbon_fotos',
    'werkbon_notities','calendar_events','activities','activiteit_notities','projects',
    'project_notes','urenregistratie','job_costs','notes','voertuigen','company_members'];
BEGIN
  RAISE NOTICE '── 9. dekking ──';
  FOREACH v_tabel IN ARRAY v_tabellen LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tabel
        AND policyname = 'readonly_' || v_tabel AND permissive = 'RESTRICTIVE'
    ) THEN
      v_mist := v_mist || v_tabel;
    END IF;
  END LOOP;

  PERFORM pg_temp.check_tekst('elke bedoelde tabel heeft een restrictive gate',
    CASE WHEN cardinality(v_mist) = 0 THEN 'compleet' ELSE array_to_string(v_mist, ', ') END,
    'compleet');

  PERFORM pg_temp.check('uploads-gate staat op storage.objects',
    EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
              AND policyname = 'readonly_uploads'), true);

  PERFORM pg_temp.check('verstuur-trigger staat op offertes',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_readonly_offerte_versturen'), true);
  PERFORM pg_temp.check('verstuur-trigger staat op facturen',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_readonly_factuur_versturen'), true);
END $$;

-- ── 10. BETALEN KAN ALTIJD ───────────────────────────────────────────────────
-- Het ergste faalscenario is een klant die wil betalen maar niet kan. Op de
-- billing-tabellen hoort dus geen enkele read-only-gate te staan.
DO $$
DECLARE v_fout text[];
BEGIN
  RAISE NOTICE '── 10. betalen kan altijd ──';

  SELECT array_agg(tablename || '.' || policyname) INTO v_fout
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('subscriptions','company_modules','upgrade_requests',
                      'website_aanvragen','stripe_billing_events','profiles')
    AND policyname LIKE 'readonly%';

  PERFORM pg_temp.check_tekst('geen read-only gate op de billing-tabellen',
    CASE WHEN v_fout IS NULL THEN 'schoon' ELSE array_to_string(v_fout, ', ') END, 'schoon');

  PERFORM pg_temp.check('get_plan_status geeft readonly terug',
    (SELECT pg_get_functiondef(p.oid) LIKE '%readonly%' FROM pg_proc p
      WHERE p.proname = 'get_plan_status' AND pronamespace = 'public'::regnamespace LIMIT 1), true);
  PERFORM pg_temp.check('get_billing_status geeft readonly terug',
    (SELECT pg_get_functiondef(p.oid) LIKE '%readonly%' FROM pg_proc p
      WHERE p.proname = 'get_billing_status' AND pronamespace = 'public'::regnamespace LIMIT 1), true);
END $$;

-- ── SLOT: FALEN MOET ZICHTBAAR ZIJN ──────────────────────────────────────────
-- Zonder dit blok zou een gefaalde test alleen een WARNING zijn — onzichtbaar
-- via de Management API. Nu breekt de transactie met de namen van de tests die
-- niet klopten, en dat kun je niet over het hoofd zien.
DO $$
DECLARE
  v_fout  text[];
  v_totaal int;
BEGIN
  SELECT array_agg(naam || ' → ' || COALESCE(detail, '')) INTO v_fout
  FROM ro_resultaat WHERE NOT geslaagd;

  IF v_fout IS NOT NULL THEN
    RAISE EXCEPTION 'READ-ONLY TESTS GEFAALD (%): %',
      cardinality(v_fout), array_to_string(v_fout, ' | ');
  END IF;

  SELECT count(*) INTO v_totaal FROM ro_resultaat;
  RAISE NOTICE '── alle % read-only-tests geslaagd ──', v_totaal;
END $$;

-- =============================================================================
-- Alles terugdraaien. Er blijft niets van deze test achter in de database.
-- =============================================================================
ROLLBACK;
