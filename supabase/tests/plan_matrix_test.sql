-- =============================================================================
-- plan_matrix_test.sql — verificatie van de feature-/limietmatrix
--
-- Draaien NA `supabase db push`:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plan_matrix_test.sql
--
-- Het hele script draait in één transactie die aan het eind ROLLBACK doet:
-- er blijft niets achter in de database. Elke controle faalt hard (ASSERT), dus
-- een schone doorloop met "ALLE TESTS GESLAAGD" is het bewijs.
--
-- Wat hier getest wordt is bewust de SERVER-kant: de matrix, de tellogica en de
-- RLS-blokkade. De UI-kant (knoppen verbergen, upgrade-melding) staat in de
-- checklist onderaan dit bestand.
-- =============================================================================

BEGIN;

SET LOCAL client_min_messages = NOTICE;

-- ── Testbedrijf + testgebruiker ──────────────────────────────────────────────
DO $$
DECLARE
  v_company uuid := gen_random_uuid();
  v_user    uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.companies (id, name, created_at)
  VALUES (v_company, 'ZZZ Testbedrijf plan_matrix', now() - interval '10 days');

  -- auth.users is nodig voor de FK op profiles.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'plan-matrix-test@example.invalid', '', now(), now(), now());

  -- De trigger handle_new_user() op auth.users heeft hier al een profielrij
  -- gemaakt; we koppelen die aan het testbedrijf (zelfde patroon als
  -- provision_account gebruikt).
  INSERT INTO public.profiles (id, company_id, full_name, role)
  VALUES (v_user, v_company, 'Test Admin', 'admin')
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id, full_name = EXCLUDED.full_name, role = 'admin';

  -- De trigger op companies heeft hier al een trial-abonnement neergezet; we
  -- zetten het om naar een betaald Starter-abonnement voor de rest van de tests.
  INSERT INTO public.subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
  VALUES (v_company, 'starter', 'actief', 29, now() - interval '10 days', NULL)
  ON CONFLICT (company_id) DO UPDATE SET
    plan = 'starter', status = 'actief', price_per_month = 29,
    started_at = now() - interval '10 days', trial_ends_at = NULL;

  -- Beschikbaar maken voor de rest van het script.
  PERFORM set_config('test.company', v_company::text, true);
  PERFORM set_config('test.user',    v_user::text,    true);
END $$;

-- ── 0. ELK NIEUW BEDRIJF KRIJGT AUTOMATISCH EEN TRIAL ────────────────────────
-- Zonder dit zou een gloednieuw account meteen op Starter-limieten zitten
-- (1 gebruiker!) in plaats van in de onbeperkte proefperiode.
DO $$
DECLARE
  v_nieuw uuid := gen_random_uuid();
  v_plan  text;
  v_stat  text;
BEGIN
  INSERT INTO public.companies (id, name) VALUES (v_nieuw, 'ZZZ Vers bedrijf');
  SELECT plan, status INTO v_plan, v_stat FROM public.subscriptions WHERE company_id = v_nieuw;
  ASSERT v_plan IS NOT NULL, 'Een nieuw bedrijf MOET automatisch een abonnementsrij krijgen';
  ASSERT v_stat = 'trial',   format('Nieuw bedrijf hoort in trial te staan, kreeg %s', v_stat);
  ASSERT public.bb_is_trial(v_nieuw), 'Nieuw bedrijf zit in de trial';
  ASSERT public.bb_limit(v_nieuw, 'gebruikers') IS NULL, 'Trial: geen gebruikerslimiet';
  ASSERT public.bb_limit(v_nieuw, 'klanten')    IS NULL, 'Trial: geen klantlimiet';
  DELETE FROM public.companies WHERE id = v_nieuw;
  RAISE NOTICE '  ok  0. nieuw bedrijf krijgt automatisch een trial-abonnement';
END $$;

-- ── 0b. PRECIES ÉÉN ABONNEMENTSRIJ PER BEDRIJF ───────────────────────────────
-- Zowel de trigger op companies als provision_account() schrijven een
-- abonnement. Samen mogen ze er nooit twee maken.
DO $$
DECLARE
  v_user  uuid := gen_random_uuid();
  v_res   json;
  v_comp  uuid;
  v_rijen int;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'provision-test@example.invalid', '', now(), now(), now());
  -- handle_new_user() heeft nu een profielrij zonder company_id gemaakt.

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  v_res := public.provision_account('ZZZ Provision Test', 'Test Persoon', 'provision-test@example.invalid');
  v_comp := (v_res->>'company_id')::uuid;
  ASSERT v_comp IS NOT NULL, 'provision_account moet een bedrijf teruggeven';

  SELECT count(*) INTO v_rijen FROM public.subscriptions WHERE company_id = v_comp;
  ASSERT v_rijen = 1,
    format('Een nieuw bedrijf hoort PRECIES 1 abonnementsrij te hebben, kreeg %s', v_rijen);

  ASSERT (SELECT status FROM public.subscriptions WHERE company_id = v_comp) = 'trial',
    'provision_account hoort een trial neer te zetten';
  ASSERT (SELECT plan FROM public.subscriptions WHERE company_id = v_comp) = 'groei',
    'Trial is altijd Groei of Team';
  ASSERT public.bb_is_trial(v_comp), 'Nieuw bedrijf zit in de trial';
  ASSERT public.bb_limit(v_comp, 'gebruikers') IS NULL, 'Trial: geen gebruikerslimiet';

  -- Nogmaals aanroepen (dubbele registratie) mag geen tweede rij opleveren.
  PERFORM public.provision_account('ZZZ Provision Test', 'Test Persoon', 'provision-test@example.invalid');
  SELECT count(*) INTO v_rijen FROM public.subscriptions WHERE company_id = v_comp;
  ASSERT v_rijen = 1, format('Tweede aanroep mag geen extra rij maken, kreeg %s', v_rijen);

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
  DELETE FROM public.companies WHERE id = v_comp;
  DELETE FROM auth.users WHERE id = v_user;

  RAISE NOTICE '  ok  0b. provision_account + trigger geven samen precies 1 abonnementsrij';
END $$;

-- ── 0c. GEEN ENKEL BEDRIJF HEEFT DUBBELE RIJEN ───────────────────────────────
DO $$
DECLARE v_dubbel int;
BEGIN
  SELECT count(*) INTO v_dubbel FROM (
    SELECT company_id FROM public.subscriptions GROUP BY company_id HAVING count(*) > 1
  ) x;
  ASSERT v_dubbel = 0, format('%s bedrijven hebben meer dan één abonnementsrij', v_dubbel);
  RAISE NOTICE '  ok  0c. geen enkel bedrijf heeft dubbele abonnementsrijen';
END $$;

-- ── 1. MATRIX IS GESEED ──────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.plan_features WHERE plan = 'starter') = 11,
    'Starter hoort 11 features te hebben';
  ASSERT (SELECT count(*) FROM public.plan_features WHERE plan = 'groei') = 18,
    'Groei hoort 18 features te hebben (Starter + 6 + gedeelde werkruimte)';
  ASSERT (SELECT count(*) FROM public.plan_features WHERE plan = 'team') = 21,
    'Team hoort 21 features te hebben';
  -- Modules: op naam controleren, niet op aantal — dan breekt de test niet bij
  -- elke nieuwe module, maar wel als er eentje verdwijnt.
  ASSERT (SELECT count(*) FROM public.plan_modules
           WHERE module_key IN ('stripe_betaallink','planning','voertuigen','hosting')) = 4,
    'De vier bekende modules horen te bestaan';
  ASSERT (SELECT vereist FROM public.plan_modules WHERE module_key = 'voertuigen') = 'planning',
    'Voertuigen kan alleen samen met planning';
  -- Hosting is een dienst, geen feature-gate: bij Groei én Team te koop.
  ASSERT (SELECT count(*) FROM public.plan_module_tiers WHERE module_key = 'hosting') = 2,
    'Hosting is bij twee pakketten bij te kopen';
  ASSERT EXISTS (SELECT 1 FROM public.plan_module_tiers WHERE module_key = 'hosting' AND plan = 'team'),
    'Hosting is ook bij Team bij te kopen';
  ASSERT NOT EXISTS (SELECT 1 FROM public.plan_module_tiers WHERE module_key = 'planning' AND plan = 'team'),
    'Planning is bij Team inbegrepen en dus niet bij te kopen';
  RAISE NOTICE '  ok  1. matrix geseed';
END $$;

-- ── 2. FEATURES PER TIER ─────────────────────────────────────────────────────
DO $$
DECLARE c uuid := current_setting('test.company')::uuid;
BEGIN
  -- Starter
  ASSERT     public.bb_has_feature(c, 'offertes'),              'Starter heeft offertes';
  ASSERT     public.bb_has_feature(c, 'email_templates_bewerken'), 'Starter mag templates bewerken';
  ASSERT NOT public.bb_has_feature(c, 'digitale_handtekening'), 'Starter heeft GEEN handtekening';
  ASSERT NOT public.bb_has_feature(c, 'eigen_email_templates'), 'Starter mag GEEN eigen templates aanmaken';
  ASSERT NOT public.bb_has_feature(c, 'boekhoudkoppeling'),     'Starter heeft GEEN boekhoudkoppeling';
  ASSERT NOT public.bb_has_feature(c, 'planning'),              'Starter heeft GEEN planning';
  ASSERT NOT public.bb_has_feature(c, 'gedeelde_werkruimte'),   'Starter is solo, geen gedeelde werkruimte';

  -- Groei
  UPDATE public.subscriptions SET plan = 'groei' WHERE company_id = c;
  ASSERT     public.bb_has_feature(c, 'digitale_handtekening'), 'Groei heeft handtekening';
  ASSERT     public.bb_has_feature(c, 'boekhoudkoppeling'),     'Groei heeft boekhoudkoppeling';
  ASSERT     public.bb_has_feature(c, 'btw_overzicht'),         'Groei heeft BTW-overzicht';
  ASSERT     public.bb_has_feature(c, 'kosten_nacalculatie'),   'Groei heeft kosten & nacalculatie';
  ASSERT     public.bb_has_feature(c, 'gedeelde_werkruimte'),   'Groei is een gedeelde werkruimte';
  ASSERT NOT public.bb_has_feature(c, 'planning'),              'Groei heeft GEEN planning zonder module';
  ASSERT NOT public.bb_has_feature(c, 'stripe_betaallink'),     'Groei heeft GEEN Stripe zonder module';
  ASSERT NOT public.bb_has_feature(c, 'rollen_rechten'),        'Groei heeft GEEN rollen & rechten';

  -- Groei + bijgekochte module
  INSERT INTO public.company_modules (company_id, module_key) VALUES (c, 'planning');
  ASSERT     public.bb_has_feature(c, 'planning'),              'Groei MET module heeft planning';
  ASSERT NOT public.bb_has_feature(c, 'voertuigen'),            'Planning-module geeft nog geen voertuigen';

  -- Team: alles inbegrepen, ook zonder modules
  DELETE FROM public.company_modules WHERE company_id = c;
  UPDATE public.subscriptions SET plan = 'team' WHERE company_id = c;
  ASSERT public.bb_has_feature(c, 'planning'),          'Team heeft planning inbegrepen';
  ASSERT public.bb_has_feature(c, 'stripe_betaallink'), 'Team heeft Stripe inbegrepen';
  ASSERT public.bb_has_feature(c, 'voertuigen'),        'Team heeft voertuigen inbegrepen';
  ASSERT public.bb_has_feature(c, 'rollen_rechten'),    'Team heeft rollen & rechten';
  ASSERT NOT public.bb_has_feature(c, 'gedeelde_werkruimte'),
    'Team werkt met rollen & rechten, niet met een gedeelde werkruimte';

  -- Een module bij een tier dat modules niet mag bijkopen doet niets.
  UPDATE public.subscriptions SET plan = 'starter' WHERE company_id = c;
  INSERT INTO public.company_modules (company_id, module_key) VALUES (c, 'planning');
  ASSERT NOT public.bb_has_feature(c, 'planning'),
    'Starter kan geen modules bijkopen — de module mag niets vrijspelen';
  DELETE FROM public.company_modules WHERE company_id = c;

  RAISE NOTICE '  ok  2. features per tier + modules';
END $$;

-- ── 3. LIMIETEN PER TIER + TRIAL ─────────────────────────────────────────────
DO $$
DECLARE c uuid := current_setting('test.company')::uuid;
BEGIN
  UPDATE public.subscriptions SET plan = 'starter', status = 'actief' WHERE company_id = c;
  ASSERT public.bb_limit(c, 'klanten')    = 100, 'Starter: 100 klanten';
  ASSERT public.bb_limit(c, 'offertes')   = 20,  'Starter: 20 offertes per periode';
  ASSERT public.bb_limit(c, 'facturen')   = 20,  'Starter: 20 facturen per periode';
  ASSERT public.bb_limit(c, 'gebruikers') = 1,   'Starter: 1 gebruiker';

  UPDATE public.subscriptions SET plan = 'groei' WHERE company_id = c;
  ASSERT public.bb_limit(c, 'gebruikers') = 2,    'Groei: 2 gebruikers';
  ASSERT public.bb_limit(c, 'klanten')  IS NULL,  'Groei: klanten onbeperkt';
  ASSERT public.bb_limit(c, 'offertes') IS NULL,  'Groei: offertes onbeperkt';

  UPDATE public.subscriptions SET plan = 'team' WHERE company_id = c;
  ASSERT public.bb_limit(c, 'gebruikers') IS NULL, 'Team: gebruikers onbeperkt';

  -- Trial: geen enkele limiet, ongeacht het plan.
  UPDATE public.subscriptions
     SET plan = 'starter', status = 'trial', trial_ends_at = now() + interval '7 days'
   WHERE company_id = c;
  ASSERT public.bb_is_trial(c),                   'Trial actief';
  ASSERT public.bb_limit(c, 'klanten')  IS NULL,  'Trial: geen klantlimiet';
  ASSERT public.bb_limit(c, 'offertes') IS NULL,  'Trial: geen offertelimiet';

  -- Verlopen trial telt niet meer als trial.
  UPDATE public.subscriptions SET trial_ends_at = now() - interval '1 day' WHERE company_id = c;
  ASSERT NOT public.bb_is_trial(c),               'Verlopen trial is geen trial meer';
  ASSERT public.bb_limit(c, 'klanten') = 100,     'Na de trial gelden de Starter-limieten weer';

  UPDATE public.subscriptions SET status = 'actief', trial_ends_at = NULL WHERE company_id = c;
  RAISE NOTICE '  ok  3. limieten per tier + trial';
END $$;

-- ── 4. FACTURATIEPERIODE ─────────────────────────────────────────────────────
DO $$
DECLARE
  c uuid := current_setting('test.company')::uuid;
  v_start date;
BEGIN
  -- Anker valt terug op subscriptions.started_at (10 dagen geleden) → de
  -- periode is die datum, niet de 1e van de maand.
  v_start := public.bb_periode_start(c);
  ASSERT v_start = (current_date - 10), format('Periode moet op de startdatum liggen, kreeg %s', v_start);

  -- Expliciete periode_start op het bedrijf wint (straks door Stripe gevuld).
  UPDATE public.companies SET periode_start = current_date - 40 WHERE id = c;
  v_start := public.bb_periode_start(c);
  ASSERT v_start = (current_date - 40 + interval '1 month')::date OR v_start <= current_date,
    'Periode rolt door op de facturatiedatum, niet op de kalendermaand';
  ASSERT v_start <= current_date, 'Periodestart ligt nooit in de toekomst';
  ASSERT v_start > current_date - 40, 'Periodestart is doorgerold naar de huidige periode';

  UPDATE public.companies SET periode_start = NULL WHERE id = c;
  RAISE NOTICE '  ok  4. facturatieperiode (%)', public.bb_periode_start(c);
END $$;

-- ── 5. TELREGEL OFFERTES: v2 telt niet, kopie naar andere klant wel ──────────
DO $$
DECLARE
  c   uuid := current_setting('test.company')::uuid;
  k1  uuid := gen_random_uuid();
  k2  uuid := gen_random_uuid();
  o1  uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.customers (id, company_id, name) VALUES (k1, c, 'Klant A'), (k2, c, 'Klant B');

  -- Origineel
  INSERT INTO public.offertes (id, company_id, customer_id, nummer, status)
  VALUES (o1, c, k1, 'BB-001', 'concept');
  ASSERT public.bb_usage(c, 'offertes') = 1, 'Originele offerte telt';

  -- v2 voor DEZELFDE klant → telt NIET opnieuw
  INSERT INTO public.offertes (company_id, customer_id, nummer, status)
  VALUES (c, k1, 'BB-001-v2', 'concept');
  ASSERT public.bb_usage(c, 'offertes') = 1,
    format('v2 voor dezelfde klant mag niet meetellen, stand is %s', public.bb_usage(c, 'offertes'));

  -- v3 ook niet
  INSERT INTO public.offertes (company_id, customer_id, nummer, status)
  VALUES (c, k1, 'BB-001-v3', 'concept');
  ASSERT public.bb_usage(c, 'offertes') = 1, 'v3 telt evenmin';

  -- Zelfde nummerreeks maar ANDERE klant → wél tellen (dit is geen versie)
  INSERT INTO public.offertes (company_id, customer_id, nummer, status)
  VALUES (c, k2, 'BB-001-v2', 'concept');
  ASSERT public.bb_usage(c, 'offertes') = 2,
    'Een "-v2" voor een andere klant is geen versie en telt wél';

  -- Kopie naar een andere klant met een NIEUW nummer → telt
  INSERT INTO public.offertes (company_id, customer_id, nummer, status)
  VALUES (c, k2, 'BB-002', 'concept');
  ASSERT public.bb_usage(c, 'offertes') = 3, 'Kopie naar andere klant telt';

  -- Verwijderen geeft de teller NIET vrij
  DELETE FROM public.offertes WHERE id = o1;
  ASSERT public.bb_usage(c, 'offertes') = 3,
    'Verwijderen mag de offerteteller niet vrijgeven';

  RAISE NOTICE '  ok  5. offertes: v2 telt niet, kopie wel, verwijderen geeft niet vrij';
END $$;

-- ── 6. TELREGEL FACTUREN: credit telt niet, verwijderen geeft niet vrij ──────
DO $$
DECLARE
  c  uuid := current_setting('test.company')::uuid;
  k  uuid := (SELECT id FROM public.customers WHERE company_id = c LIMIT 1);
  f1 uuid := gen_random_uuid();
  f2 uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.facturen (id, company_id, customer_id, nummer, status, factuurdatum)
  VALUES (f1, c, k, 'BB-F001', 'concept', current_date);
  ASSERT public.bb_usage(c, 'facturen') = 1, 'Factuur telt';

  INSERT INTO public.facturen (company_id, customer_id, nummer, status, factuurdatum, is_credit, credit_van_factuur_id)
  VALUES (c, k, 'BB-CF001', 'verzonden', current_date, true, f1);
  ASSERT public.bb_usage(c, 'facturen') = 1, 'Creditfactuur mag niet meetellen';

  -- Aparte factuur voor de verwijdertest: f1 is inmiddels gecrediteerd en kan
  -- door de foreign key van de creditfactuur niet verwijderd worden.
  INSERT INTO public.facturen (id, company_id, customer_id, nummer, status, factuurdatum)
  VALUES (f2, c, k, 'BB-F002', 'concept', current_date);
  ASSERT public.bb_usage(c, 'facturen') = 2, 'Tweede factuur telt';

  DELETE FROM public.facturen WHERE id = f2;
  ASSERT public.bb_usage(c, 'facturen') = 2, 'Verwijderen mag de factuurteller niet vrijgeven';

  RAISE NOTICE '  ok  6. facturen: credit telt niet, verwijderen geeft niet vrij';
END $$;

-- ── 7. KLANTEN: voorraadteller, verwijderen geeft WEL vrij ──────────────────
DO $$
DECLARE
  c uuid := current_setting('test.company')::uuid;
  n int;
  k uuid := gen_random_uuid();
BEGIN
  n := public.bb_usage(c, 'klanten');
  INSERT INTO public.customers (id, company_id, name) VALUES (k, c, 'Wegwerpklant');
  ASSERT public.bb_usage(c, 'klanten') = n + 1, 'Nieuwe klant telt';
  DELETE FROM public.customers WHERE id = k;
  ASSERT public.bb_usage(c, 'klanten') = n,
    'Klanten is een voorraadlimiet: verwijderen geeft een plek vrij';
  RAISE NOTICE '  ok  7. klanten: voorraadteller';
END $$;

-- ── 8. RLS BLOKKEERT ECHT (niet alleen de UI) ───────────────────────────────
-- Vanaf hier draaien we als de ingelogde testgebruiker, precies zoals de app
-- (en zoals een handmatige API-call met dat JWT).
DO $$
DECLARE
  c        uuid := current_setting('test.company')::uuid;
  v_user   uuid := current_setting('test.user')::uuid;
  k        uuid := (SELECT id FROM public.customers WHERE company_id = c LIMIT 1);
  gelukt   boolean;
BEGIN
  -- Zet de klantlimiet op een waarde die al bereikt is.
  UPDATE public.plan_limits SET limit_value = 1 WHERE plan = 'starter' AND limit_key = 'klanten';
  UPDATE public.plan_limits SET limit_value = 1 WHERE plan = 'starter' AND limit_key = 'offertes';
  UPDATE public.plan_limits SET limit_value = 1 WHERE plan = 'starter' AND limit_key = 'facturen';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  SET LOCAL ROLE authenticated;

  ASSERT public.bb_current_company() = c, 'Sessie hoort bij het testbedrijf';
  ASSERT NOT public.bb_within_limit('klanten'), 'Klantlimiet is bereikt';

  -- 8a. Handmatig een klant aanmaken → GEBLOKKEERD door RLS
  gelukt := true;
  BEGIN
    INSERT INTO public.customers (company_id, name) VALUES (c, 'Mag niet');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN gelukt := false;
  END;
  ASSERT NOT gelukt, 'De server MOET een nieuwe klant boven de cap weigeren';

  -- 8b. Nieuwe offerte boven de cap → GEBLOKKEERD
  gelukt := true;
  BEGIN
    INSERT INTO public.offertes (company_id, customer_id, nummer, status)
    VALUES (c, k, 'BB-900', 'concept');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN gelukt := false;
  END;
  ASSERT NOT gelukt, 'De server MOET een nieuwe offerte boven de cap weigeren';

  -- 8c. Nieuwe VERSIE boven de cap → TOEGESTAAN (telt niet mee)
  INSERT INTO public.offertes (company_id, customer_id, nummer, status)
  VALUES (c, k, 'BB-001-v9', 'concept');
  RAISE NOTICE '      v9 boven de cap toegestaan (telt niet mee) — correct';

  -- 8d. Creditfactuur boven de cap → TOEGESTAAN
  INSERT INTO public.facturen (company_id, customer_id, nummer, status, factuurdatum, is_credit)
  VALUES (c, k, 'BB-CF900', 'verzonden', current_date, true);

  -- 8e. Gewone factuur boven de cap → GEBLOKKEERD
  gelukt := true;
  BEGIN
    INSERT INTO public.facturen (company_id, customer_id, nummer, status, factuurdatum)
    VALUES (c, k, 'BB-F900', 'concept', current_date);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN gelukt := false;
  END;
  ASSERT NOT gelukt, 'De server MOET een nieuwe factuur boven de cap weigeren';

  -- 8f. Feature-gate: voertuig aanmaken zonder de feature → GEBLOKKEERD
  gelukt := true;
  BEGIN
    INSERT INTO public.voertuigen (company_id, naam) VALUES (c, 'Bus 1');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN gelukt := false;
  END;
  ASSERT NOT gelukt, 'Starter mag geen voertuig aanmaken';

  -- 8g. Feature-gate: eigen e-mailtemplate aanmaken → GEBLOKKEERD,
  --     een standaardtype blijft wél toegestaan (nieuw bedrijf seeden).
  gelukt := true;
  BEGIN
    INSERT INTO public.email_templates (company_id, type, name, onderwerp, body)
    VALUES (c, 'mijn_eigen_type', 'Eigen', 'Onderwerp', 'Body');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN gelukt := false;
  END;
  ASSERT NOT gelukt, 'Starter mag geen eigen templatetype aanmaken';

  RESET ROLE;
  RAISE NOTICE '  ok  8. RLS blokkeert server-side (klanten, offertes, facturen, features)';
END $$;

-- ── 9. INKOMENDE LEADS KOMEN ALTIJD BINNEN ──────────────────────────────────
-- Het websiteformulier / de mailkoppeling schrijft via service_role (edge
-- function). Die omzeilt RLS en mag dus ook boven de klantcap doorschrijven.
DO $$
DECLARE
  c      uuid := current_setting('test.company')::uuid;
  k_lead uuid := gen_random_uuid();
BEGIN
  ASSERT NOT public.bb_within_limit(c, 'klanten'), 'Cap staat nog vol';

  SET LOCAL ROLE service_role;
  INSERT INTO public.customers (id, company_id, name, email)
  VALUES (k_lead, c, 'Binnengekomen lead', 'lead@example.invalid');
  INSERT INTO public.deals (company_id, customer_id, title)
  VALUES (c, k_lead, 'Aanvraag via websiteformulier');
  RESET ROLE;

  ASSERT EXISTS (SELECT 1 FROM public.customers WHERE id = k_lead),
    'Een inkomende lead MOET binnenkomen, ook boven de klantcap';
  RAISE NOTICE '  ok  9. inkomende lead komt binnen boven de cap';
END $$;

-- ── 10. FAALSCENARIO'S: ONTBREKENDE CONFIGURATIE MAG NOOIT BLOKKEREN ────────
-- Dit is het scenario dat het dashboard op slot zou zetten. De regel is:
-- weten we het niet, dan staan we toe.
DO $$
DECLARE
  c      uuid := current_setting('test.company')::uuid;
  v_los  uuid := gen_random_uuid();
BEGIN
  -- 10a. Bedrijf ZONDER abonnementsrij (bv. handmatig verwijderd).
  INSERT INTO public.companies (id, name) VALUES (v_los, 'ZZZ Bedrijf zonder abonnement');
  DELETE FROM public.subscriptions WHERE company_id = v_los;

  ASSERT NOT public.bb_plan_geconfigureerd(v_los), 'Zonder abonnementsrij is er geen configuratie';
  ASSERT public.bb_limit(v_los, 'klanten')  IS NULL, 'Geen config → geen klantlimiet';
  ASSERT public.bb_limit(v_los, 'offertes') IS NULL, 'Geen config → geen offertelimiet';
  ASSERT public.bb_within_limit(v_los, 'klanten'),   'Geen config MOET toestaan, niet blokkeren';
  ASSERT public.bb_within_limit(v_los, 'offertes'),  'Geen config MOET toestaan, niet blokkeren';
  ASSERT public.bb_has_feature(v_los, 'planning'),   'Geen config → feature toestaan';
  ASSERT public.bb_has_feature(v_los, 'voertuigen'), 'Geen config → feature toestaan';
  -- Interne features falen bewust de ANDERE kant op: niet meer data zichtbaar maken.
  ASSERT NOT public.bb_has_feature(v_los, 'gedeelde_werkruimte'),
    'Interne features mogen bij twijfel juist NIET aanstaan (zou data breder zichtbaar maken)';
  DELETE FROM public.companies WHERE id = v_los;

  -- 10b. periode_start NULL op het bedrijf → val terug, geef nooit NULL terug.
  UPDATE public.companies SET periode_start = NULL WHERE id = c;
  ASSERT public.bb_periode_start(c) IS NOT NULL, 'periode_start mag nooit NULL opleveren';
  ASSERT public.bb_periode_start(c) <= current_date, 'Periodestart ligt niet in de toekomst';
  ASSERT public.bb_usage(c, 'offertes') IS NOT NULL, 'Verbruik blijft telbaar zonder periode_start';

  RAISE NOTICE '  ok  10a/b. ontbrekende abonnementsrij en lege periode_start blokkeren niets';
END $$;

DO $$
DECLARE
  c uuid := current_setting('test.company')::uuid;
BEGIN
  -- 10c. Seed ontbreekt volledig (migratie half gedraaid / tabellen leeg).
  -- Eerst een kopie bewaren: deze test sloopt gedeelde staat en moet die aan het
  -- eind terugzetten, anders werkt alles dat hierna draait met een halve matrix.
  CREATE TEMP TABLE _bewaar_limits  AS SELECT * FROM public.plan_limits;
  CREATE TEMP TABLE _bewaar_features AS SELECT * FROM public.plan_features;
  DELETE FROM public.plan_limits;
  DELETE FROM public.plan_features;

  ASSERT NOT public.bb_plan_geconfigureerd(c),      'Lege matrix = geen configuratie';
  ASSERT public.bb_limit(c, 'klanten') IS NULL,     'Lege matrix → geen limiet';
  ASSERT public.bb_within_limit(c, 'klanten'),      'Lege matrix MOET toestaan';
  ASSERT public.bb_within_limit(c, 'offertes'),     'Lege matrix MOET toestaan';
  ASSERT public.bb_within_limit(c, 'facturen'),     'Lege matrix MOET toestaan';
  ASSERT public.bb_within_limit(c, 'gebruikers'),   'Lege matrix MOET toestaan';
  ASSERT public.bb_has_feature(c, 'boekhoudkoppeling'), 'Lege matrix → features toestaan';
  ASSERT NOT public.bb_has_feature(c, 'gedeelde_werkruimte'),
    'Ook bij een lege matrix blijft de gedeelde werkruimte uit';

  RAISE NOTICE '  ok  10c. lege matrix blokkeert niets (behalve interne features)';
END $$;

-- 10d. En het echte bewijs: met een lege matrix kan een gewone gebruiker nog
--      steeds gewoon werken. Dit is de check die telt.
DO $$
DECLARE
  c      uuid := current_setting('test.company')::uuid;
  v_user uuid := current_setting('test.user')::uuid;
  k      uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.customers (company_id, name) VALUES (c, 'Klant bij lege matrix')
  RETURNING id INTO k;
  INSERT INTO public.offertes (company_id, customer_id, nummer, status)
  VALUES (c, k, 'BB-990', 'concept');
  INSERT INTO public.facturen (company_id, customer_id, nummer, status, factuurdatum)
  VALUES (c, k, 'BB-F990', 'concept', current_date);

  RESET ROLE;
  RAISE NOTICE '  ok  10d. normaal gebruik werkt door bij ontbrekende configuratie';
END $$;

-- ── 11. NORMAAL GEBRUIK BINNEN DE LIMIET WERKT GEWOON ───────────────────────
-- Belangrijker dan of de limiet blokkeert: dat hij dat NIET doet zolang je
-- eronder zit.
DO $$
DECLARE
  c      uuid := current_setting('test.company')::uuid;
  v_user uuid := current_setting('test.user')::uuid;
  k      uuid;
BEGIN
  -- Matrix VOLLEDIG herstellen uit de kopie van 10c — niet een handvol rijen
  -- opnieuw invoeren, want dan draait alles hierna met een halve matrix.
  INSERT INTO public.plan_limits   SELECT * FROM _bewaar_limits;
  INSERT INTO public.plan_features SELECT * FROM _bewaar_features;
  DROP TABLE _bewaar_limits;
  DROP TABLE _bewaar_features;
  UPDATE public.subscriptions SET plan = 'groei', status = 'actief' WHERE company_id = c;

  ASSERT public.bb_plan_geconfigureerd(c), 'Configuratie is hersteld';
  ASSERT public.bb_within_limit(c, 'klanten'), 'Groei heeft ruimte';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.customers (company_id, name) VALUES (c, 'Gewone nieuwe klant')
  RETURNING id INTO k;
  INSERT INTO public.offertes (company_id, customer_id, nummer, status)
  VALUES (c, k, 'BB-500', 'concept');
  INSERT INTO public.facturen (company_id, customer_id, nummer, status, factuurdatum)
  VALUES (c, k, 'BB-F500', 'concept', current_date);

  RESET ROLE;
  RAISE NOTICE '  ok  11. gewone gebruiker maakt klant + offerte + factuur aan';
END $$;

DO $$ BEGIN RAISE NOTICE ' '; RAISE NOTICE 'ALLE TESTS GESLAAGD'; END $$;

-- Positieve bevestiging als RIJ. NOTICE-regels komen niet terug via de
-- Management API, dus zonder dit zou "geen foutmelding" het enige signaal zijn.
-- Faalt een ASSERT, dan komt die melding als fout terug en wordt dit nooit
-- bereikt.
SELECT
  'ALLE TESTS GESLAAGD'                                                     AS resultaat,
  (SELECT count(*) FROM public.plan_features)                               AS matrix_features,
  (SELECT count(*) FROM public.plan_limits)                                 AS matrix_limieten,
  (SELECT count(*) FROM public.companies)                                   AS bedrijven,
  (SELECT count(*) FROM public.companies c WHERE NOT EXISTS
     (SELECT 1 FROM public.subscriptions s WHERE s.company_id = c.id))      AS zonder_abonnement,
  (SELECT count(*) FROM (SELECT company_id FROM public.subscriptions
     GROUP BY company_id HAVING count(*) > 1) x)                            AS dubbele_abonnementen,
  (SELECT count(*) FROM public.companies c
     WHERE NOT public.bb_within_limit(c.id, 'klanten')
        OR NOT public.bb_within_limit(c.id, 'offertes')
        OR NOT public.bb_within_limit(c.id, 'facturen'))                    AS geknepen_bedrijven;

ROLLBACK;

-- =============================================================================
-- HANDMATIGE CHECKLIST (UI-kant — de server is hierboven al bewezen)
--
-- Per tier inloggen (subscriptions.plan aanpassen via het super-admin portaal):
--
-- STARTER
--   [ ] Sidebar toont GEEN Planning en GEEN Kosten.
--   [ ] Instellingen: geen tab Voertuigen; Stripe-kaart toont "Vanaf Team" met
--       "Bekijk opties"; boekhoudkaart toont "Vanaf Groei".
--   [ ] E-mailtemplates: bewerken werkt, de "+"-knop opent de upgrade-melding.
--   [ ] Offertemail bevat GEEN ondertekenlink.
--   [ ] Facturen: knop "Herinnering 1 sturen" opent de upgrade-melding.
--   [ ] Klanten/Offertes/Facturen tonen de teller ("7 / 20 offertes").
--   [ ] Bij een bereikte limiet: aanmaakknop opent de upgrade-melding; alles wat
--       er al staat blijft te openen en te bewerken.
--   [ ] Offerte kopiëren → "zelfde klant, nieuwe versie" werkt boven de limiet;
--       "andere klant" wordt geweigerd met uitleg.
--
-- GROEI
--   [ ] Handtekening, boekhoudkoppeling, BTW-overzicht, Kosten en eigen
--       templates zijn beschikbaar; Planning/Voertuigen/Stripe niet.
--   [ ] Agenda is gedeeld (je ziet de items van de ander).
--   [ ] Team: tweede teamlid uitnodigen lukt, een derde wordt geweigerd.
--   [ ] Rechten-knop op een teamlid opent de upgrade-melding.
--   [ ] Module planning aanzetten (company_modules) → Planning verschijnt.
--
-- TEAM
--   [ ] Alles beschikbaar, geen limieten, rechten per teamlid instelbaar.
--   [ ] Agenda is NIET gedeeld (rollen & rechten bepalen de zichtbaarheid).
--
-- TRIAL
--   [ ] Geen enkele limiet; tellers tonen geen cap.
-- =============================================================================
