-- =============================================================================
-- billing_test.sql — verificatie van de Stripe Billing-databaseregels
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing_test.sql
--
-- Draait in één transactie die eindigt op ROLLBACK: er blijft niets achter.
-- Elke controle faalt hard (ASSERT); een schone doorloop is het bewijs.
--
-- Zwaartepunt: de bron-van-waarheid-regel. Een bedrijf in de gratis 14-daagse
-- proefperiode (zonder Stripe-abonnement) mag door geen enkel webhook-event
-- geraakt worden.
-- =============================================================================

BEGIN;

SET LOCAL client_min_messages = NOTICE;

DO $$
DECLARE
  v_trial   uuid := gen_random_uuid();  -- bedrijf in DB-proefperiode, geen Stripe
  v_betaald uuid := gen_random_uuid();  -- bedrijf mét Stripe-abonnement
BEGIN
  INSERT INTO public.companies (id, name) VALUES
    (v_trial,   'ZZZ Billing trial'),
    (v_betaald, 'ZZZ Billing betaald');
  -- De trigger uit 20260728150000 heeft beide een trial-abonnement gegeven.
  PERFORM set_config('t.trial', v_trial::text, true);
  PERFORM set_config('t.betaald', v_betaald::text, true);
END $$;

-- ── 1. DE KERNREGEL: DB-PROEFPERIODE IS ONAANRAAKBAAR ────────────────────────
DO $$
DECLARE
  c       uuid := current_setting('t.trial')::uuid;
  v_res   text;
  v_plan  text;
  v_stat  text;
  v_sub   text;
BEGIN
  ASSERT (SELECT stripe_subscription_id FROM public.subscriptions WHERE company_id = c) IS NULL,
    'Uitgangspunt: dit bedrijf hangt niet aan Stripe';

  -- Een gewoon vervolg-event (p_bind = false) moet worden genegeerd.
  v_res := public.bb_stripe_sync_subscription(
    c, 'sub_vreemd', 'cus_vreemd', 'starter', 'active', 'price_x', 3, 'maand',
    now(), now() + interval '1 month', false, false);
  ASSERT v_res LIKE 'genegeerd%', format('Verwacht genegeerd, kreeg: %s', v_res);

  SELECT plan, status, stripe_subscription_id INTO v_plan, v_stat, v_sub
  FROM public.subscriptions WHERE company_id = c;
  ASSERT v_sub IS NULL,        'De koppeling mag NIET gelegd zijn';
  ASSERT v_stat = 'trial',     format('De proefperiode moet intact blijven, kreeg %s', v_stat);
  ASSERT v_plan = 'groei',     format('Het pakket mag niet gewijzigd zijn, kreeg %s', v_plan);
  ASSERT public.bb_is_trial(c),'Het bedrijf zit nog steeds in de proefperiode';
  ASSERT public.bb_limit(c, 'gebruikers') IS NULL, 'Proefperiode kent geen limieten';

  -- Ook een opzeg-event mag de proefperiode niet raken.
  v_res := public.bb_stripe_sync_subscription(
    c, 'sub_vreemd', 'cus_vreemd', NULL, 'canceled', NULL, NULL, NULL,
    NULL, NULL, NULL, false);
  ASSERT v_res LIKE 'genegeerd%', 'Ook een opzegging mag genegeerd worden';
  ASSERT (SELECT status FROM public.subscriptions WHERE company_id = c) = 'trial',
    'De proefperiode is nog steeds intact na een opzeg-event';

  -- En modules blijven eraf.
  ASSERT public.bb_stripe_sync_modules(c, '[{"module_key":"planning","item_id":"si_1","price_id":"p1"}]'::jsonb) = 0,
    'Zonder Stripe-abonnement worden er geen modules gezet';
  ASSERT NOT EXISTS (SELECT 1 FROM public.company_modules WHERE company_id = c),
    'Er is geen module aangezet voor een bedrijf zonder Stripe-abonnement';

  RAISE NOTICE '  ok  1. DB-proefperiode wordt door geen enkel event geraakt';
END $$;

-- ── 2. BINDEN EN DAARNA VOLGEN ───────────────────────────────────────────────
DO $$
DECLARE
  c      uuid := current_setting('t.betaald')::uuid;
  v_res  text;
  v_eind timestamptz := now() + interval '30 days';
BEGIN
  -- Het bindmoment (checkout.session.completed) legt de koppeling.
  v_res := public.bb_stripe_sync_subscription(
    c, 'sub_123', 'cus_123', 'groei', 'active', 'price_groei', 1, 'maand',
    now(), v_eind, false, true);
  ASSERT v_res = 'gekoppeld', format('Verwacht gekoppeld, kreeg: %s', v_res);

  ASSERT (SELECT stripe_subscription_id FROM public.subscriptions WHERE company_id = c) = 'sub_123';
  ASSERT (SELECT status  FROM public.subscriptions WHERE company_id = c) = 'actief';
  ASSERT (SELECT plan    FROM public.subscriptions WHERE company_id = c) = 'groei';
  ASSERT (SELECT extra_gebruikers FROM public.subscriptions WHERE company_id = c) = 1;
  ASSERT (SELECT price_per_month  FROM public.subscriptions WHERE company_id = c) = 39;
  ASSERT NOT public.bb_is_trial(c), 'Na binden geen proefperiode meer';

  -- periode_start op het bedrijf volgt Stripe (de tellers ankeren erop).
  ASSERT (SELECT periode_start FROM public.companies WHERE id = c) = current_date,
    'companies.periode_start volgt de factuurperiode van Stripe';

  -- Vervolg-events werken nu wél, zonder bind.
  v_res := public.bb_stripe_sync_subscription(
    c, 'sub_123', 'cus_123', 'team', 'active', 'price_team', 4, 'maand',
    now(), v_eind, false, false);
  ASSERT v_res = 'bijgewerkt', format('Verwacht bijgewerkt, kreeg: %s', v_res);
  ASSERT (SELECT plan FROM public.subscriptions WHERE company_id = c) = 'team';
  ASSERT (SELECT extra_gebruikers FROM public.subscriptions WHERE company_id = c) = 4;
  ASSERT (SELECT price_per_month  FROM public.subscriptions WHERE company_id = c) = 59;

  RAISE NOTICE '  ok  2. binden en daarna Stripe volgen';
END $$;

-- ── 3. GEEN KRUISBESMETTING TUSSEN ABONNEMENTEN ──────────────────────────────
DO $$
DECLARE
  c     uuid := current_setting('t.betaald')::uuid;
  v_res text;
BEGIN
  v_res := public.bb_stripe_sync_subscription(
    c, 'sub_ANDERS', 'cus_anders', 'starter', 'active', 'price_starter', 0, 'maand',
    now(), now() + interval '1 month', false, false);
  ASSERT v_res LIKE 'genegeerd%', format('Een ander abonnement mag niet overschrijven, kreeg: %s', v_res);
  ASSERT (SELECT plan FROM public.subscriptions WHERE company_id = c) = 'team',
    'Het pakket is niet gewijzigd door een vreemd abonnement';
  RAISE NOTICE '  ok  3. een vreemd Stripe-abonnement wordt geweigerd';
END $$;

-- ── 4. STATUSVERTALING + JAARABONNEMENT ──────────────────────────────────────
DO $$
DECLARE
  c uuid := current_setting('t.betaald')::uuid;
  v_trial_eind timestamptz := now() + interval '60 days';
BEGIN
  -- Jaarabonnement = 60 dagen proefperiode, daarna de gewone maandprijs.
  PERFORM public.bb_stripe_sync_subscription(
    c, 'sub_123', 'cus_123', 'groei', 'trialing', 'price_groei', 0, 'jaar',
    now(), v_trial_eind, false, false);
  ASSERT (SELECT status FROM public.subscriptions WHERE company_id = c) = 'trial';
  ASSERT (SELECT billing_interval FROM public.subscriptions WHERE company_id = c) = 'jaar';
  ASSERT public.bb_is_trial(c), 'Tijdens de gratis maanden geldt de proefperiode';
  ASSERT (SELECT trial_ends_at::date FROM public.subscriptions WHERE company_id = c) = v_trial_eind::date,
    'De einddatum van de gratis periode komt uit Stripe';

  -- Betaling mislukt.
  PERFORM public.bb_stripe_sync_subscription(
    c, 'sub_123', 'cus_123', 'groei', 'past_due', 'price_groei', 0, 'jaar',
    now(), now() + interval '30 days', false, false);
  ASSERT (SELECT status FROM public.subscriptions WHERE company_id = c) = 'betaalprobleem';

  -- Opzegging per einde periode.
  PERFORM public.bb_stripe_sync_subscription(
    c, 'sub_123', 'cus_123', 'groei', 'active', 'price_groei', 0, 'jaar',
    now(), now() + interval '30 days', true, false);
  ASSERT (SELECT cancel_at_period_end FROM public.subscriptions WHERE company_id = c),
    'Opzegging per einde periode is vastgelegd';
  ASSERT (SELECT status FROM public.subscriptions WHERE company_id = c) = 'actief',
    'Tot het einde van de periode blijft het abonnement actief';

  -- Definitief opgezegd.
  PERFORM public.bb_stripe_sync_subscription(
    c, 'sub_123', 'cus_123', 'groei', 'canceled', 'price_groei', 0, 'jaar',
    now(), now(), false, false);
  ASSERT (SELECT status FROM public.subscriptions WHERE company_id = c) = 'opgezegd';
  ASSERT (SELECT cancelled_at FROM public.subscriptions WHERE company_id = c) IS NOT NULL;

  RAISE NOTICE '  ok  4. statusvertaling, jaarabonnement, opzegging';
END $$;

-- ── 5. MODULES VOLGEN DE STRIPE-ITEMS ────────────────────────────────────────
DO $$
DECLARE c uuid := current_setting('t.betaald')::uuid;
BEGIN
  PERFORM public.bb_stripe_sync_modules(c, '[
    {"module_key":"planning","item_id":"si_p","price_id":"price_mod_planning"},
    {"module_key":"voertuigen","item_id":"si_v","price_id":"price_mod_voertuigen"}
  ]'::jsonb);
  ASSERT (SELECT count(*) FROM public.company_modules WHERE company_id = c AND actief) = 2;

  -- Module weggehaald in Stripe → gaat hier ook uit.
  PERFORM public.bb_stripe_sync_modules(c, '[
    {"module_key":"planning","item_id":"si_p","price_id":"price_mod_planning"}
  ]'::jsonb);
  ASSERT (SELECT actief FROM public.company_modules WHERE company_id = c AND module_key = 'voertuigen') = false,
    'Een module die niet meer in Stripe zit, gaat uit';
  ASSERT (SELECT actief FROM public.company_modules WHERE company_id = c AND module_key = 'planning') = true;

  -- Alles weg.
  PERFORM public.bb_stripe_sync_modules(c, '[]'::jsonb);
  ASSERT NOT EXISTS (SELECT 1 FROM public.company_modules WHERE company_id = c AND actief),
    'Zonder module-items staat alles uit';

  RAISE NOTICE '  ok  5. modules volgen de Stripe-items';
END $$;

-- ── 6. DOWNGRADE-BLOKKADES ───────────────────────────────────────────────────
DO $$
DECLARE
  c      uuid := current_setting('t.betaald')::uuid;
  v_user uuid;
  v_n    int;
BEGIN
  -- Vijf actieve gebruikers erbij zetten.
  FOR i IN 1..5 LOOP
    v_user := gen_random_uuid();
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'billing-test-' || i || '@example.invalid', '', now(), now(), now());
    INSERT INTO public.profiles (id, company_id, full_name, role)
    VALUES (v_user, c, 'Tester ' || i, 'medewerker')
    ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, role = 'medewerker';
  END LOOP;

  ASSERT public.bb_usage(c, 'gebruikers') >= 5, 'Vijf gebruikers aanwezig';

  -- Team → Groei (max 2) moet geblokkeerd zijn, mét het aantal dat weg moet.
  SELECT count(*) INTO v_n FROM public.bb_downgrade_blokkades(c, 'groei') WHERE limiet = 'gebruikers';
  ASSERT v_n = 1, 'Downgrade naar Groei is geblokkeerd op gebruikers';
  ASSERT (SELECT teveel FROM public.bb_downgrade_blokkades(c, 'groei') WHERE limiet = 'gebruikers') >= 3,
    'Er moeten er minstens 3 weg';
  ASSERT (SELECT maximum FROM public.bb_downgrade_blokkades(c, 'groei') WHERE limiet = 'gebruikers') = 2;

  -- Naar Starter (max 1 gebruiker) ook geblokkeerd.
  ASSERT EXISTS (SELECT 1 FROM public.bb_downgrade_blokkades(c, 'starter') WHERE limiet = 'gebruikers'),
    'Downgrade naar Starter is geblokkeerd';

  -- Naar Team (onbeperkt) mag.
  ASSERT NOT EXISTS (SELECT 1 FROM public.bb_downgrade_blokkades(c, 'team')),
    'Naar Team is er niets dat blokkeert';

  -- Klantenlimiet bij Starter: 101 klanten → geblokkeerd.
  INSERT INTO public.customers (company_id, name)
  SELECT c, 'ZZZ Billing klant ' || g FROM generate_series(1, 101) g;
  ASSERT (SELECT teveel FROM public.bb_downgrade_blokkades(c, 'starter') WHERE limiet = 'klanten') >= 1,
    'Boven de klantcap kan er niet naar Starter';

  RAISE NOTICE '  ok  6. downgrade-blokkades met aantallen';
END $$;

-- ── 7. ALLEEN DE EIGENAAR/ADMIN MAG HET ABONNEMENT BEHEREN ───────────────────
DO $$
DECLARE
  c        uuid := current_setting('t.betaald')::uuid;
  v_admin  uuid := gen_random_uuid();
  v_mede   uuid;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'billing-admin@example.invalid', '', now(), now(), now());
  INSERT INTO public.profiles (id, company_id, full_name, role)
  VALUES (v_admin, c, 'De eigenaar', 'admin')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, role = 'admin';

  SELECT id INTO v_mede FROM public.profiles WHERE company_id = c AND role = 'medewerker' LIMIT 1;

  ASSERT public.bb_mag_abonnement_beheren(v_admin), 'De admin mag het abonnement beheren';
  ASSERT NOT public.bb_mag_abonnement_beheren(v_mede), 'Een medewerker mag dat niet';

  -- Ook niet met alle werkrechten: dit staat volledig los van het rechtensysteem.
  INSERT INTO public.user_permissions (user_id, company_id, permission, granted)
  SELECT v_mede, c, unnest(ARRAY['offertes','facturen','kosten','planning','team','instellingen','bedrijfsfinancien']), true
  ON CONFLICT (user_id, permission) DO UPDATE SET granted = true;
  ASSERT NOT public.bb_mag_abonnement_beheren(v_mede),
    'Zelfs met alle werkrechten mag een medewerker niet aan het abonnement komen';

  -- Een gedeactiveerde admin ook niet.
  UPDATE public.profiles SET actief = false WHERE id = v_admin;
  ASSERT NOT public.bb_mag_abonnement_beheren(v_admin), 'Een gedeactiveerde admin mag niet meer';
  UPDATE public.profiles SET actief = true WHERE id = v_admin;

  RAISE NOTICE '  ok  7. abonnementsbeheer is voorbehouden aan de eigenaar/admin';
END $$;

-- ── 8. IDEMPOTENTIE VAN WEBHOOK-EVENTS ───────────────────────────────────────
DO $$
DECLARE v_fout boolean := false;
BEGIN
  INSERT INTO public.stripe_billing_events (event_id, type) VALUES ('evt_test_1', 'customer.subscription.updated');
  BEGIN
    INSERT INTO public.stripe_billing_events (event_id, type) VALUES ('evt_test_1', 'customer.subscription.updated');
  EXCEPTION WHEN unique_violation THEN v_fout := true;
  END;
  ASSERT v_fout, 'Hetzelfde event mag niet twee keer geclaimd worden';
  RAISE NOTICE '  ok  8. elk event wordt hooguit één keer verwerkt';
END $$;

-- ── 9. WELKOMSTACTIE ─────────────────────────────────────────────────────────
DO $$
DECLARE
  c     uuid := current_setting('t.betaald')::uuid;
  t2    uuid := current_setting('t.trial')::uuid;
  v_res text;
  v_fout boolean;
BEGIN
  -- Maandabonnement kent geen welkomstactie.
  v_res := public.bb_registreer_welkomstactie(c, 'gratis_maanden', 'maand');
  ASSERT v_res LIKE 'genegeerd%', format('Maandabonnement: verwacht genegeerd, kreeg %s', v_res);
  ASSERT (SELECT welkomstactie FROM public.subscriptions WHERE company_id = c) IS NULL;

  -- Jaarabonnement: keuze wordt vastgelegd.
  UPDATE public.subscriptions SET plan = 'groei' WHERE company_id = c;
  v_res := public.bb_registreer_welkomstactie(c, 'gratis_maanden', 'jaar');
  ASSERT v_res = 'vastgelegd: gratis_maanden', format('kreeg %s', v_res);
  ASSERT (SELECT welkomstactie FROM public.subscriptions WHERE company_id = c) = 'gratis_maanden';
  ASSERT (SELECT welkomstactie_gekozen_op FROM public.subscriptions WHERE company_id = c) IS NOT NULL,
    'Het keuzemoment wordt vastgelegd';

  -- DE KERN: niet achteraf wisselen naar de andere actie. Anders pakt iemand
  -- eerst de gratis maanden en claimt daarna alsnog de website.
  v_res := public.bb_registreer_welkomstactie(c, 'gratis_website', 'jaar');
  ASSERT v_res LIKE 'geweigerd%', format('Wisselen moet geweigerd worden, kreeg %s', v_res);
  ASSERT (SELECT welkomstactie FROM public.subscriptions WHERE company_id = c) = 'gratis_maanden';

  -- Ook een rechtstreekse UPDATE komt er niet langs (de grendel zit in een trigger).
  v_fout := false;
  BEGIN
    UPDATE public.subscriptions SET welkomstactie = 'gratis_website' WHERE company_id = c;
  EXCEPTION WHEN check_violation THEN v_fout := true;
  END;
  ASSERT v_fout, 'Een directe UPDATE naar de andere actie moet worden geweigerd';

  -- En terugzetten naar NULL ook niet (anders is de grendel in twee stappen te omzeilen).
  v_fout := false;
  BEGIN
    UPDATE public.subscriptions SET welkomstactie = NULL WHERE company_id = c;
  EXCEPTION WHEN check_violation THEN v_fout := true;
  END;
  ASSERT v_fout, 'Terugzetten naar NULL moet ook worden geweigerd';

  -- Dezelfde actie nogmaals is geen fout (herhaalde webhook-levering).
  v_res := public.bb_registreer_welkomstactie(c, 'gratis_maanden', 'jaar');
  ASSERT v_res LIKE 'ongewijzigd%', format('Herhaling: verwacht ongewijzigd, kreeg %s', v_res);

  -- Starter mag de gratis website niet kiezen.
  UPDATE public.subscriptions SET plan = 'starter' WHERE company_id = t2;
  UPDATE public.subscriptions SET stripe_subscription_id = 'sub_starter' WHERE company_id = t2;
  v_res := public.bb_registreer_welkomstactie(t2, 'gratis_website', 'jaar');
  ASSERT v_res LIKE 'geweigerd%', format('Starter + website: verwacht geweigerd, kreeg %s', v_res);
  ASSERT (SELECT welkomstactie FROM public.subscriptions WHERE company_id = t2) IS NULL;

  -- Maar de gratis maanden wel.
  v_res := public.bb_registreer_welkomstactie(t2, 'gratis_maanden', 'jaar');
  ASSERT v_res = 'vastgelegd: gratis_maanden', format('kreeg %s', v_res);

  RAISE NOTICE '  ok  9. welkomstactie: eenmalig, onwisselbaar, niet bij maand, website niet bij Starter';
END $$;

-- ── 10. WEBSITE-AANVRAAG ─────────────────────────────────────────────────────
DO $$
DECLARE
  c     uuid := gen_random_uuid();
  v_res text;
BEGIN
  INSERT INTO public.companies (id, name, email) VALUES (c, 'ZZZ Website bv', 'info@zzz.invalid');
  UPDATE public.subscriptions
     SET plan = 'groei', stripe_subscription_id = 'sub_web', billing_interval = 'jaar'
   WHERE company_id = c;

  -- Zonder vastgelegde keuze geen aanvraag.
  v_res := public.bb_open_website_aanvraag(c);
  ASSERT v_res LIKE 'genegeerd%', format('Zonder keuze geen aanvraag, kreeg %s', v_res);

  -- Met keuze wel.
  PERFORM public.bb_registreer_welkomstactie(c, 'gratis_website', 'jaar');
  v_res := public.bb_open_website_aanvraag(c);
  ASSERT v_res = 'aangemaakt', format('kreeg %s', v_res);
  ASSERT (SELECT status FROM public.website_aanvragen WHERE company_id = c) = 'open';

  -- Nog een keer (herhaalde webhook) mag geen tweede aanvraag of tweede mail geven.
  v_res := public.bb_open_website_aanvraag(c);
  ASSERT v_res = 'bestond al', format('Tweede aanroep: verwacht "bestond al", kreeg %s', v_res);
  ASSERT (SELECT count(*) FROM public.website_aanvragen WHERE company_id = c) = 1,
    'Er is precies één aanvraag per bedrijf';

  RAISE NOTICE '  ok  10. website-aanvraag: alleen bij keuze, en idempotent';
END $$;

SELECT
  'ALLE BILLING-TESTS GESLAAGD' AS resultaat,
  (SELECT count(*) FROM public.website_aanvragen)                                       AS website_aanvragen,
  (SELECT count(*) FROM public.subscriptions WHERE welkomstactie IS NOT NULL)           AS met_welkomstactie,
  (SELECT count(*) FROM public.subscriptions WHERE stripe_subscription_id IS NOT NULL) AS gekoppeld,
  (SELECT count(*) FROM public.stripe_billing_events)                                  AS events;

ROLLBACK;
