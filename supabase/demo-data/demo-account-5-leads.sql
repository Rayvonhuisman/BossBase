-- =============================================================================
-- BossBase Demo Data — 5 demo-leads in bestaand demo-account
-- Uitvoeren via: Supabase Dashboard → SQL Editor → New Query → Run
--
-- WAT DIT SCRIPT DOET:
--   • Voegt 5 demo-leads toe aan het bestaande demo-account
--   • Alle data binnen dezelfde company_id (geen nieuwe tenant/company)
--   • Vult: customers, deals, activities, calendar_events, notes,
--           job_costs, offertes, offerte_items, werkbonnen, werkbon_taken,
--           werkbon_materialen, urenregistratie
--
-- VEILIGHEIDSREGELS:
--   • Geen echte persoonsgegevens
--   • Geen echte e-mailadressen — alleen @example.com
--   • Alle namen/titels/omschrijvingen starten met 'Demo'
--   • Alleen INSERT — geen DELETE, UPDATE, DROP
--   • Alle records zijn gekoppeld aan company_id
--   • Maakt geen nieuwe company of tenant aan
--   • Idempotent: tweede uitvoering doet niets (EXISTS-check)
-- =============================================================================

DO $$
DECLARE
  cid UUID := '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca';
  uid UUID;  -- profile_id van het demo-account

  -- Pipeline stage IDs (opgehaald op naam, met fallbacks)
  stage_nieuwe_lead    UUID;
  stage_offerte_maken  UUID;
  stage_offerte_verst  UUID;  -- "Offerte verstuurd" of "Wacht op akkoord"
  stage_akkoord        UUID;  -- "Akkoord" of "Wacht op akkoord"
  stage_in_uitvoering  UUID;

  -- Klant IDs
  klant_jansen    UUID;
  klant_devries   UUID;
  klant_bakker    UUID;
  klant_meijer    UUID;
  klant_peters    UUID;

  -- Deal IDs
  deal_badkamer   UUID;
  deal_schilder   UUID;
  deal_verhuizing UUID;
  deal_cv         UUID;
  deal_keuken     UUID;

  -- Offerte IDs
  off_badkamer    UUID;
  off_schilder    UUID;
  off_verhuizing  UUID;
  off_cv          UUID;
  off_keuken      UUID;

  -- Werkbon IDs
  wb_badkamer     UUID;
  wb_schilder     UUID;
  wb_verhuizing   UUID;
  wb_cv           UUID;
  wb_keuken       UUID;

BEGIN

  -- ── Idempotentieguard — voorkomt duplicaten bij heruitvoering ───────────
  IF EXISTS (
    SELECT 1 FROM customers
    WHERE company_id = cid AND name = 'Demo Klant Familie Jansen'
  ) THEN
    RAISE NOTICE 'Demo 5-leads al aanwezig — script overgeslagen om duplicaten te voorkomen.';
    RAISE NOTICE 'Verwijder eerst de bestaande demo-records als je opnieuw wilt seeden.';
    RETURN;
  END IF;

  -- ── Profile ID ophalen ──────────────────────────────────────────────────
  SELECT id INTO uid
  FROM profiles
  WHERE company_id = cid
  LIMIT 1;

  IF uid IS NULL THEN
    RAISE EXCEPTION
      'Geen profiel gevonden voor company_id %. '
      'Controleer of het demo-account correct is aangemaakt.',
      cid;
  END IF;

  RAISE NOTICE 'Profile ID gevonden: %', uid;

  -- ── Pipeline stage IDs ophalen ──────────────────────────────────────────
  SELECT id INTO stage_nieuwe_lead
    FROM pipeline_stages WHERE company_id = cid AND name = 'Nieuwe lead' LIMIT 1;

  SELECT id INTO stage_offerte_maken
    FROM pipeline_stages WHERE company_id = cid AND name = 'Offerte maken' LIMIT 1;

  SELECT id INTO stage_in_uitvoering
    FROM pipeline_stages WHERE company_id = cid AND name = 'In uitvoering' LIMIT 1;

  -- "Offerte verstuurd" met fallback naar "Wacht op akkoord"
  SELECT id INTO stage_offerte_verst
    FROM pipeline_stages WHERE company_id = cid AND name = 'Offerte verstuurd' LIMIT 1;
  IF stage_offerte_verst IS NULL THEN
    SELECT id INTO stage_offerte_verst
      FROM pipeline_stages WHERE company_id = cid AND name = 'Wacht op akkoord' LIMIT 1;
  END IF;

  -- "Akkoord" met fallback naar "Wacht op akkoord"
  SELECT id INTO stage_akkoord
    FROM pipeline_stages WHERE company_id = cid AND name = 'Akkoord' LIMIT 1;
  IF stage_akkoord IS NULL THEN
    SELECT id INTO stage_akkoord
      FROM pipeline_stages WHERE company_id = cid AND name = 'Wacht op akkoord' LIMIT 1;
  END IF;

  -- Validatie: alle stages gevonden?
  IF stage_nieuwe_lead IS NULL OR stage_offerte_maken IS NULL
     OR stage_offerte_verst IS NULL OR stage_akkoord IS NULL
     OR stage_in_uitvoering IS NULL THEN
    RAISE EXCEPTION
      'Een of meer pipeline stages niet gevonden voor company_id %. '
      'Verwacht: "Nieuwe lead", "Offerte maken", "Offerte verstuurd"/"Wacht op akkoord", '
      '"Akkoord"/"Wacht op akkoord", "In uitvoering". '
      'Controleer of 003_seed_pipeline_stages.sql is uitgevoerd.',
      cid;
  END IF;

  RAISE NOTICE 'Stages: Nieuwe lead=%, Offerte maken=%, Verstuurd=%, Akkoord=%, In uitvoering=%',
    stage_nieuwe_lead, stage_offerte_maken, stage_offerte_verst, stage_akkoord, stage_in_uitvoering;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. KLANTEN
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Klant Familie Jansen',
               'demo.klant.jansen@example.com',
               '06-11111100',
               'Demo Dorpsstraat 12',
               'Demo Amersfoort',
               'Demo Notitie Klant wil oplevering binnen 4 weken. Badkamertegels al gekozen bij bouwmarkt.')
  RETURNING id INTO klant_jansen;

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Klant De Vries',
               'demo.klant.devries@example.com',
               '06-22222200',
               'Demo Laanweg 5',
               'Demo Utrecht',
               'Demo Notitie Klant twijfelt tussen twee kleuren. Kleurstaal meegenomen bij inspectie.')
  RETURNING id INTO klant_devries;

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Klant Bakker',
               'demo.klant.bakker@example.com',
               '06-33333300',
               'Demo Kerkplein 3',
               'Demo Amsterdam',
               'Demo Notitie Klant heeft lift nodig in nieuw appartementengebouw.')
  RETURNING id INTO klant_bakker;

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Klant Meijer',
               'demo.klant.meijer@example.com',
               '06-44444400',
               'Demo Boslaan 8',
               'Demo Hilversum',
               'Demo Notitie Klant wil jaarlijks onderhoud CV. Servicecontract bespreken.')
  RETURNING id INTO klant_meijer;

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Klant Peters',
               'demo.klant.peters@example.com',
               '06-55555500',
               'Demo Velperweg 22',
               'Demo Bussum',
               'Demo Notitie Klant wil extra stopcontact in keuken.')
  RETURNING id INTO klant_peters;

  RAISE NOTICE '✓ 5 klanten aangemaakt';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. DEALS / LEADS  (verspreid over 5 pipeline stages)
  --
  --   Lead 1 → Nieuwe lead       (Badkamer renovatie)
  --   Lead 2 → Offerte maken     (Schilderwerk woning)
  --   Lead 3 → Offerte verstuurd (Verhuizing appartement)
  --   Lead 4 → Akkoord           (CV onderhoud)
  --   Lead 5 → In uitvoering     (Keuken montage)
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_jansen, stage_nieuwe_lead,
          'Demo Lead Badkamer renovatie', 6500.00, 'med',
          'Demo Deal aannemer — badkamer renovatie inclusief tegelwerk en sanitair.')
  RETURNING id INTO deal_badkamer;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_devries, stage_offerte_maken,
          'Demo Deal Schilderwerk woning', 2400.00, 'med',
          'Demo Deal schilderbedrijf — volledige buitengevel schilderen.')
  RETURNING id INTO deal_schilder;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_bakker, stage_offerte_verst,
          'Demo Deal Verhuizing appartement', 780.00, 'low',
          'Demo Deal verhuisbedrijf — verhuizing van en naar appartement met lift.')
  RETURNING id INTO deal_verhuizing;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_meijer, stage_akkoord,
          'Demo Deal CV onderhoud', 350.00, 'low',
          'Demo Deal installateur — jaarlijks CV ketel onderhoud en inspectie.')
  RETURNING id INTO deal_cv;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_peters, stage_in_uitvoering,
          'Demo Deal Keuken montage', 1850.00, 'high',
          'Demo Deal klusbedrijf — nieuwe keuken plaatsen inclusief extra stopcontact.')
  RETURNING id INTO deal_keuken;

  RAISE NOTICE '✓ 5 deals aangemaakt';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. ACTIVITEITEN
  --    Mix van: vandaag, deze week (toekomstig), verlopen (overdue)
  --    → Vult widgets: Acties vandaag, Agenda deze week, Taken te laat
  -- ══════════════════════════════════════════════════════════════════════════

  -- Lead 1: Badkamer renovatie — 3 activiteiten
  INSERT INTO activities (company_id, customer_id, deal_id, title, type, due_at, completed, notes)
  VALUES
    (cid, klant_jansen, deal_badkamer,
     'Demo Activiteit Offerte nabellen Jansen', 'call',
     CURRENT_DATE + interval '10 hours', false,
     'Demo Notitie bel om 10:00 om inmeting te plannen'),
    (cid, klant_jansen, deal_badkamer,
     'Demo Agenda Inmeten badkamer plannen', 'visit',
     CURRENT_DATE + interval '2 days 9 hours', false,
     'Demo Notitie inmeting voor offerte badkamer renovatie'),
    (cid, klant_jansen, deal_badkamer,
     'Demo Activiteit Aanvraag badkamer verwerken', 'task',
     CURRENT_DATE - interval '3 days' + interval '8 hours', false,
     'Demo Notitie aanvraag wacht op registratie en opvolging');

  -- Lead 2: Schilderwerk woning — 3 activiteiten
  INSERT INTO activities (company_id, customer_id, deal_id, title, type, due_at, completed, notes)
  VALUES
    (cid, klant_devries, deal_schilder,
     'Demo Activiteit Kleurkeuze bespreken De Vries', 'call',
     CURRENT_DATE + interval '14 hours', false,
     'Demo Notitie klant twijfelt, kleurstaal meenemen'),
    (cid, klant_devries, deal_schilder,
     'Demo Agenda Woninginspectie schilderwerk', 'visit',
     CURRENT_DATE + interval '1 day 10 hours', false,
     'Demo Notitie inspectie buitengevel voor definitieve offerte'),
    (cid, klant_devries, deal_schilder,
     'Demo Activiteit Offerte schilderwerk opstellen', 'task',
     CURRENT_DATE - interval '5 days' + interval '8 hours', false,
     'Demo Notitie te laat: offerte staat nog niet klaar');

  -- Lead 3: Verhuizing appartement — 2 activiteiten
  INSERT INTO activities (company_id, customer_id, deal_id, title, type, due_at, completed, notes)
  VALUES
    (cid, klant_bakker, deal_verhuizing,
     'Demo Activiteit Verhuisdatum bevestigen Bakker', 'call',
     CURRENT_DATE + interval '11 hours', false,
     'Demo Notitie klant moet datum bevestigen, lift reservering vereist'),
    (cid, klant_bakker, deal_verhuizing,
     'Demo Activiteit Offerte opvolgen verhuizing Bakker', 'follow',
     CURRENT_DATE + interval '3 days 9 hours', false,
     'Demo Notitie offerte al verstuurd, wacht op schriftelijke bevestiging');

  -- Lead 4: CV onderhoud — 2 activiteiten
  INSERT INTO activities (company_id, customer_id, deal_id, title, type, due_at, completed, notes)
  VALUES
    (cid, klant_meijer, deal_cv,
     'Demo Activiteit Onderhoudsafspraak plannen Meijer', 'call',
     CURRENT_DATE + interval '1 day 13 hours', false,
     'Demo Notitie klant wil jaarlijks onderhoud, servicecontract bespreken'),
    (cid, klant_meijer, deal_cv,
     'Demo Activiteit Materialen CV bestellen', 'task',
     CURRENT_DATE - interval '1 day' + interval '8 hours', false,
     'Demo Notitie te laat: CV onderdelen besteld maar niet ontvangen');

  -- Lead 5: Keuken montage — 3 activiteiten
  INSERT INTO activities (company_id, customer_id, deal_id, title, type, due_at, completed, notes)
  VALUES
    (cid, klant_peters, deal_keuken,
     'Demo Activiteit Montageplanning afstemmen Peters', 'call',
     CURRENT_DATE + interval '15 hours', false,
     'Demo Notitie extra stopcontact gewenst, electricien inplannen'),
    (cid, klant_peters, deal_keuken,
     'Demo Activiteit Keuken aflevering controleren', 'task',
     CURRENT_DATE + interval '4 days 9 hours', false,
     'Demo Notitie controleer levering vóór montagedatum'),
    (cid, klant_peters, deal_keuken,
     'Demo Activiteit Nabellen na montage Peters', 'follow',
     CURRENT_DATE + interval '7 days 10 hours', false,
     'Demo Notitie klanttevredenheid checken na oplevering keuken');

  RAISE NOTICE '✓ 13 activiteiten aangemaakt';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. AGENDA / CALENDAR EVENTS
  --    → Vult widget: Agenda deze week
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO calendar_events (company_id, customer_id, deal_id, title, start_at, end_at, location, description)
  VALUES
    (cid, klant_jansen, deal_badkamer,
     'Demo Agenda Inmeten badkamer Jansen',
     CURRENT_DATE + interval '2 days 9 hours',
     CURRENT_DATE + interval '2 days 10 hours',
     'Demo Dorpsstraat 12, Demo Amersfoort',
     'Demo Agenda inmeting voor offerte badkamer renovatie'),
    (cid, klant_devries, deal_schilder,
     'Demo Agenda Woninginspectie schilderwerk De Vries',
     CURRENT_DATE + interval '10 hours',
     CURRENT_DATE + interval '11 hours',
     'Demo Laanweg 5, Demo Utrecht',
     'Demo Agenda inspectie buitengevel voor schilderwerk offerte'),
    (cid, klant_bakker, deal_verhuizing,
     'Demo Agenda Verhuizing uitvoeren Bakker',
     CURRENT_DATE + interval '5 days 8 hours',
     CURRENT_DATE + interval '5 days 16 hours',
     'Demo Kerkplein 3, Demo Amsterdam',
     'Demo Agenda verhuizing hele dag, lift reserveren'),
    (cid, klant_meijer, deal_cv,
     'Demo Agenda CV onderhoud uitvoeren Meijer',
     CURRENT_DATE + interval '1 day 9 hours',
     CURRENT_DATE + interval '1 day 11 hours',
     'Demo Boslaan 8, Demo Hilversum',
     'Demo Agenda jaarlijks CV ketel onderhoud'),
    (cid, klant_peters, deal_keuken,
     'Demo Agenda Keuken montage Peters',
     CURRENT_DATE + interval '8 hours',
     CURRENT_DATE + interval '17 hours',
     'Demo Velperweg 22, Demo Bussum',
     'Demo Agenda keuken montage de hele dag inclusief extra stopcontact');

  RAISE NOTICE '✓ 5 agenda-items aangemaakt';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. NOTITIES
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO notes (company_id, customer_id, deal_id, body, author)
  VALUES
    (cid, klant_jansen, deal_badkamer,
     'Demo Notitie Klant wil oplevering binnen 4 weken. Tegels en sanitair al gekozen bij bouwmarkt in Demo Amersfoort. Afvoer moet worden verplaatst.',
     'Demo Account'),
    (cid, klant_devries, deal_schilder,
     'Demo Notitie Klant twijfelt tussen RAL 9010 wit en Levis 4252 crème. Kleurstaal meegenomen bij woninginspectie voor definitieve keuze.',
     'Demo Account'),
    (cid, klant_bakker, deal_verhuizing,
     'Demo Notitie Klant heeft lift nodig in nieuw appartementengebouw. Lift reservering bevestigen bij VVE vóór verhuisdatum.',
     'Demo Account'),
    (cid, klant_meijer, deal_cv,
     'Demo Notitie Klant wil jaarlijks onderhoud CV ketel. Servicecontract bespreken na uitvoering. CV ketel is 8 jaar oud, filter aan vervanging toe.',
     'Demo Account'),
    (cid, klant_peters, deal_keuken,
     'Demo Notitie Klant wil extra stopcontact links van de spoelbak. Elektriciën inplannen voor aanpassing groepenkast.',
     'Demo Account');

  RAISE NOTICE '✓ 5 notities aangemaakt';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 6. KOSTENREGELS / JOB COSTS
  --    → Vult widgets: Kosten per klus, Kosten per klant grafiek
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO job_costs (company_id, deal_id, description, amount, category, cost_date)
  VALUES
    (cid, deal_badkamer,   'Demo Kosten Tegels en sanitair badkamer Jansen',      850.00, 'materiaal',  CURRENT_DATE - 1),
    (cid, deal_schilder,   'Demo Kosten Verf en materiaal schilderwerk De Vries', 320.00, 'materiaal',  CURRENT_DATE - 2),
    (cid, deal_verhuizing, 'Demo Kosten Bus en brandstof verhuizing Bakker',       95.00, 'reiskosten', CURRENT_DATE),
    (cid, deal_cv,         'Demo Kosten Onderdelen CV ketel Meijer',              140.00, 'materiaal',  CURRENT_DATE - 1),
    (cid, deal_keuken,     'Demo Kosten Schroeven kit en kleinmateriaal Peters',   75.00, 'materiaal',  CURRENT_DATE);

  RAISE NOTICE '✓ 5 kostenregels aangemaakt';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. OFFERTES + OFFERTE ITEMS
  --    → Vult widgets: Open offertes, Openstaande facturen
  --
  --    DEMO-B001  Badkamer renovatie   → concept     (lead = Nieuwe lead)
  --    DEMO-S001  Schilderwerk woning  → verzonden   (lead = Offerte maken)
  --    DEMO-V001  Verhuizing           → verzonden   (lead = Offerte verstuurd)
  --    DEMO-C001  CV onderhoud         → geaccepteerd (lead = Akkoord)
  --    DEMO-K001  Keuken montage       → geaccepteerd (lead = In uitvoering)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Offerte badkamer: concept
  -- Arbeid: 20u × €55 = €1.100 | Mat: €1.200 | Reis: €35
  -- Subtotaal: €2.335 | Excl (×1.25): €2.918,75 | Incl (×1.21): €3.531,69
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten, marge_pct, btw_pct,
    totaal_excl, totaal_incl, geldig_tot
  ) VALUES (
    cid, klant_jansen, deal_badkamer,
    'DEMO-B001', 'Demo Offerte Badkamer renovatie Familie Jansen', 'concept',
    20, 55, 1200, 35, 25, 21,
    2918.75, 3531.69, CURRENT_DATE + 14
  ) RETURNING id INTO off_badkamer;

  -- Offerte schilderwerk: verzonden
  -- Arbeid: 16u × €55 = €880 | Mat: €320 | Reis: €20
  -- Subtotaal: €1.220 | Excl (×1.25): €1.525 | Incl (×1.21): €1.845,25
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten, marge_pct, btw_pct,
    totaal_excl, totaal_incl, geldig_tot, verzonden_op
  ) VALUES (
    cid, klant_devries, deal_schilder,
    'DEMO-S001', 'Demo Offerte Schilderwerk woning De Vries', 'verzonden',
    16, 55, 320, 20, 25, 21,
    1525.00, 1845.25, CURRENT_DATE + 14, now() - interval '2 days'
  ) RETURNING id INTO off_schilder;

  -- Offerte verhuizing: verzonden
  -- Arbeid: 6u × €55 = €330 | Mat: €95 | Reis: €45
  -- Subtotaal: €470 | Excl (×1.20): €564 | Incl (×1.21): €682,44
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten, marge_pct, btw_pct,
    totaal_excl, totaal_incl, geldig_tot, verzonden_op
  ) VALUES (
    cid, klant_bakker, deal_verhuizing,
    'DEMO-V001', 'Demo Offerte Verhuizing appartement Bakker', 'verzonden',
    6, 55, 95, 45, 20, 21,
    564.00, 682.44, CURRENT_DATE + 7, now() - interval '3 days'
  ) RETURNING id INTO off_verhuizing;

  -- Offerte CV onderhoud: geaccepteerd
  -- Arbeid: 3u × €55 = €165 | Mat: €140 | Reis: €15
  -- Subtotaal: €320 | Excl (×1.20): €384 | Incl (×1.21): €464,64
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten, marge_pct, btw_pct,
    totaal_excl, totaal_incl, geldig_tot, verzonden_op, geaccepteerd_op
  ) VALUES (
    cid, klant_meijer, deal_cv,
    'DEMO-C001', 'Demo Offerte CV onderhoud Meijer', 'geaccepteerd',
    3, 55, 140, 15, 20, 21,
    384.00, 464.64, CURRENT_DATE + 14, now() - interval '5 days', now() - interval '2 days'
  ) RETURNING id INTO off_cv;

  -- Offerte keuken montage: geaccepteerd
  -- Arbeid: 10u × €55 = €550 | Mat: €75 | Reis: €25
  -- Subtotaal: €650 | Excl (×1.25): €812,50 | Incl (×1.21): €983,13
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten, marge_pct, btw_pct,
    totaal_excl, totaal_incl, geldig_tot, verzonden_op, geaccepteerd_op
  ) VALUES (
    cid, klant_peters, deal_keuken,
    'DEMO-K001', 'Demo Offerte Keuken montage Peters', 'geaccepteerd',
    10, 55, 75, 25, 25, 21,
    812.50, 983.13, CURRENT_DATE + 14, now() - interval '7 days', now() - interval '4 days'
  ) RETURNING id INTO off_keuken;

  -- Offerte items: badkamer
  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, off_badkamer, 'Demo Item Arbeidsloon badkamer renovatie', 'uur',  20,    55.00, 1100.00, 1),
    (cid, off_badkamer, 'Demo Item Tegels en sanitair pakket',      'set',   1,  1200.00, 1200.00, 2),
    (cid, off_badkamer, 'Demo Item Reiskosten inmeting',            'rit',   1,    35.00,   35.00, 3);

  -- Offerte items: schilderwerk
  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, off_schilder, 'Demo Item Arbeidsloon buitengevel schilderwerk', 'uur', 16,  55.00,  880.00, 1),
    (cid, off_schilder, 'Demo Item Buitenverf en grondverf pakket',       'set',  1, 320.00,  320.00, 2),
    (cid, off_schilder, 'Demo Item Reiskosten',                           'rit',  1,  20.00,   20.00, 3);

  -- Offerte items: verhuizing
  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, off_verhuizing, 'Demo Item Arbeidsloon verhuisteam 2 personen', 'uur',  6,  55.00,  330.00, 1),
    (cid, off_verhuizing, 'Demo Item Vrachtbus huur en brandstof',        'rit',  1,  95.00,   95.00, 2),
    (cid, off_verhuizing, 'Demo Item Liftreservering gebouw',             'ls',   1,  45.00,   45.00, 3);

  -- Offerte items: CV onderhoud
  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, off_cv, 'Demo Item Arbeidsloon CV onderhoud en inspectie', 'uur', 3,  55.00, 165.00, 1),
    (cid, off_cv, 'Demo Item Onderdelen CV ketel service set',       'set', 1, 140.00, 140.00, 2),
    (cid, off_cv, 'Demo Item Reiskosten',                           'rit', 1,  15.00,  15.00, 3);

  -- Offerte items: keuken montage
  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, off_keuken, 'Demo Item Arbeidsloon keuken montage',              'uur', 10,  55.00, 550.00, 1),
    (cid, off_keuken, 'Demo Item Kleinmateriaal schroeven kit afdichting', 'set',  1,  75.00,  75.00, 2),
    (cid, off_keuken, 'Demo Item Reiskosten',                              'rit',  1,  25.00,  25.00, 3);

  RAISE NOTICE '✓ 5 offertes met items aangemaakt (DEMO-B001 t/m DEMO-K001)';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. WERKBONNEN + TAKEN + MATERIALEN
  --    → Vult widgets: Werkbonnen vandaag
  --
  --    wb_cv      → gepland_op = vandaag, status = in_uitvoering
  --    wb_keuken  → gepland_op = vandaag, status = in_uitvoering
  --    wb_schilder → gepland_op = morgen, status = gepland
  --    wb_badkamer → gepland_op = overmorgen, status = gepland
  --    wb_verhuizing → gepland_op = 5 dagen, status = gepland
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, offerte_id,
    titel, omschrijving, status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_jansen, deal_badkamer, off_badkamer,
    'Demo Werkbon Sloopwerk badkamer Jansen',
    'Demo omschrijving sloopwerk bestaande badkamer voor renovatie. Oude tegels, sanitair en afvoer verwijderen.',
    'gepland', CURRENT_DATE + 2, '09:00', '17:00',
    'Demo Dorpsstraat 12, Demo Amersfoort',
    'Demo Notitie bouwvuil naar container. Waterleiding afsluiten vóór aanvang.'
  ) RETURNING id INTO wb_badkamer;

  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, offerte_id,
    titel, omschrijving, status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_devries, deal_schilder, off_schilder,
    'Demo Werkbon Voorbereiding schilderwerk De Vries',
    'Demo omschrijving voorbereiding buitengevel schilderwerk. Kozijnen reinigen, kitvoegen controleren, masking tape.',
    'gepland', CURRENT_DATE + 1, '08:00', '12:00',
    'Demo Laanweg 5, Demo Utrecht',
    'Demo Notitie steiger staat al klaar. Klant is thuis voor toegang.'
  ) RETURNING id INTO wb_schilder;

  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, offerte_id,
    titel, omschrijving, status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_bakker, deal_verhuizing, off_verhuizing,
    'Demo Werkbon Verhuisteam ochtend Bakker',
    'Demo omschrijving verhuisteam ochtendshift. Inboedel inpakken en laden, transport naar nieuw adres.',
    'gepland', CURRENT_DATE + 5, '08:00', '13:00',
    'Demo Kerkplein 3, Demo Amsterdam',
    'Demo Notitie lift reservering bevestigd. Parkeervergunning aangevraagd.'
  ) RETURNING id INTO wb_verhuizing;

  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, offerte_id,
    titel, omschrijving, status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_meijer, deal_cv, off_cv,
    'Demo Werkbon CV controle Meijer',
    'Demo omschrijving jaarlijkse CV ketel controle en onderhoud. Reinigen, filter vervangen, waterdruk controleren.',
    'in_uitvoering', CURRENT_DATE, '09:00', '11:00',
    'Demo Boslaan 8, Demo Hilversum',
    'Demo Notitie CV bereikbaar in meterkast. Klant is thuis.'
  ) RETURNING id INTO wb_cv;

  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, offerte_id,
    titel, omschrijving, status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_peters, deal_keuken, off_keuken,
    'Demo Werkbon Keuken plaatsen Peters',
    'Demo omschrijving keuken montage inclusief plaatsen van kasten, werkblad en extra stopcontact spoelbak.',
    'in_uitvoering', CURRENT_DATE, '08:00', '17:00',
    'Demo Velperweg 22, Demo Bussum',
    'Demo Notitie keuken is afgeleverd. Electricien komt om 14:00 voor stopcontact.'
  ) RETURNING id INTO wb_keuken;

  -- Werkbon taken
  INSERT INTO werkbon_taken (company_id, werkbon_id, omschrijving, afgerond, volgorde)
  VALUES
    (cid, wb_badkamer, 'Demo Taak Oude tegels verwijderen vloer en wand', false, 1),
    (cid, wb_badkamer, 'Demo Taak Sanitair demonteren en afvoeren',        false, 2),
    (cid, wb_badkamer, 'Demo Taak Afvoer verplaatsen naar nieuwe positie', false, 3),
    (cid, wb_schilder, 'Demo Taak Kozijnen afschuren en reinigen',         false, 1),
    (cid, wb_schilder, 'Demo Taak Masking tape aanbrengen op glas',        false, 2),
    (cid, wb_verhuizing,'Demo Taak Dozen inpakken woonkamer',              false, 1),
    (cid, wb_verhuizing,'Demo Taak Meubels demonteren en laden in bus',    false, 2),
    (cid, wb_cv,       'Demo Taak CV ketel reinigen en filter vervangen',   true,  1),
    (cid, wb_cv,       'Demo Taak Waterdruk controleren en bijvullen',     false, 2),
    (cid, wb_keuken,   'Demo Taak Onderkastjes ophangen en waterpas zetten', true, 1),
    (cid, wb_keuken,   'Demo Taak Werkblad op maat zagen en bevestigen',   false, 2),
    (cid, wb_keuken,   'Demo Taak Extra stopcontact plaatsen spoelbak',    false, 3);

  -- Werkbon materialen
  INSERT INTO werkbon_materialen (company_id, werkbon_id, naam, eenheid, aantal, prijs_per, subtotaal)
  VALUES
    (cid, wb_badkamer,  'Demo Materiaal Tegellijm zak 25kg',        'kg',    2, 18.00,  36.00),
    (cid, wb_badkamer,  'Demo Materiaal Voegmiddel grijs 5kg',      'emmer', 1, 22.00,  22.00),
    (cid, wb_schilder,  'Demo Materiaal Buitenmuurverf 10L',        'emmer', 3, 45.00, 135.00),
    (cid, wb_schilder,  'Demo Materiaal Primer hechtlak 2.5L',      'blik',  2, 28.00,  56.00),
    (cid, wb_cv,        'Demo Materiaal CV service filter set',     'set',   1, 45.00,  45.00),
    (cid, wb_keuken,    'Demo Materiaal Schroeven assortiment set', 'set',   1, 15.00,  15.00);

  RAISE NOTICE '✓ 5 werkbonnen met taken en materialen aangemaakt';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 9. URENREGISTRATIE
  --    → Vult widgets: Uren deze week, Uren per week histogram
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO urenregistratie (
    company_id, profile_id, customer_id, werkbon_id, deal_id,
    datum, start_tijd, eind_tijd, uren, type, notitie
  )
  VALUES
    (cid, uid, klant_jansen,   wb_badkamer,   deal_badkamer,
     CURRENT_DATE - 1, '09:00', '12:00', 3.0, 'arbeid',
     'Demo Uren Voorbereiding sloopwerk badkamer Jansen'),
    (cid, uid, klant_devries,  wb_schilder,   deal_schilder,
     CURRENT_DATE - 2, '08:00', '12:00', 4.0, 'arbeid',
     'Demo Uren Inspectie en voorbereiding schilderwerk De Vries'),
    (cid, uid, klant_meijer,   wb_cv,         deal_cv,
     CURRENT_DATE, '09:00', '11:00', 2.0, 'arbeid',
     'Demo Uren CV onderhoud uitvoeren Meijer'),
    (cid, uid, klant_peters,   wb_keuken,     deal_keuken,
     CURRENT_DATE, '08:00', '13:00', 5.0, 'arbeid',
     'Demo Uren Keuken montage Peters ochtend'),
    (cid, uid, klant_bakker,   NULL,          deal_verhuizing,
     CURRENT_DATE - 3, '10:00', '11:00', 1.0, 'arbeid',
     'Demo Uren Verhuizing offerte bespreken Bakker');

  RAISE NOTICE '✓ 5 urenregistratie-items aangemaakt';

  -- ══════════════════════════════════════════════════════════════════════════
  -- SAMENVATTING
  -- ══════════════════════════════════════════════════════════════════════════

  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Demo 5-leads succesvol aangemaakt!';
  RAISE NOTICE '══════════════════════════════════════════════════════';
  RAISE NOTICE '  Klanten (5):';
  RAISE NOTICE '    Demo Klant Familie Jansen  (Amersfoort)';
  RAISE NOTICE '    Demo Klant De Vries        (Utrecht)';
  RAISE NOTICE '    Demo Klant Bakker          (Amsterdam)';
  RAISE NOTICE '    Demo Klant Meijer          (Hilversum)';
  RAISE NOTICE '    Demo Klant Peters          (Bussum)';
  RAISE NOTICE '  Deals (5) verspreid over pipeline stages:';
  RAISE NOTICE '    Demo Lead Badkamer renovatie    → Nieuwe lead      (€6.500)';
  RAISE NOTICE '    Demo Deal Schilderwerk woning   → Offerte maken    (€2.400)';
  RAISE NOTICE '    Demo Deal Verhuizing appartement→ Offerte verstuurd (€780)';
  RAISE NOTICE '    Demo Deal CV onderhoud          → Akkoord          (€350)';
  RAISE NOTICE '    Demo Deal Keuken montage        → In uitvoering    (€1.850)';
  RAISE NOTICE '  Activiteiten (13): mix van vandaag/verlopen/toekomstig';
  RAISE NOTICE '  Agenda-items (5): calendar_events';
  RAISE NOTICE '  Notities (5)';
  RAISE NOTICE '  Kostenregels (5): totaal €1.480';
  RAISE NOTICE '  Offertes (5): DEMO-B001 t/m DEMO-K001 + 15 regels';
  RAISE NOTICE '  Werkbonnen (5): met taken + materialen';
  RAISE NOTICE '  Urenregistratie (5): 15 uur totaal';
  RAISE NOTICE '══════════════════════════════════════════════════════';

END $$;

-- ── Controleer het resultaat ──────────────────────────────────────────────────
SELECT 'customers'       AS tabel, count(*) AS demo_records
  FROM customers         WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND name        LIKE 'Demo%'
UNION ALL
SELECT 'deals',            count(*) FROM deals
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND title       LIKE 'Demo%'
UNION ALL
SELECT 'activities',       count(*) FROM activities
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND title       LIKE 'Demo%'
UNION ALL
SELECT 'calendar_events',  count(*) FROM calendar_events
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND title       LIKE 'Demo%'
UNION ALL
SELECT 'notes',            count(*) FROM notes
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND body        LIKE 'Demo%'
UNION ALL
SELECT 'job_costs',        count(*) FROM job_costs
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND description LIKE 'Demo%'
UNION ALL
SELECT 'offertes',         count(*) FROM offertes
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND omschrijving LIKE 'Demo%'
UNION ALL
SELECT 'werkbonnen',       count(*) FROM werkbonnen
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND titel       LIKE 'Demo%'
UNION ALL
SELECT 'urenregistratie',  count(*) FROM urenregistratie
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND notitie     LIKE 'Demo%'
ORDER BY tabel;
