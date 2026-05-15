-- =============================================================================
-- BossBase Demo Data — Fase 1: Schilderbedrijf
-- Uitvoeren via: Supabase Dashboard → SQL Editor → New Query → Run
--
-- VEILIGHEIDSREGELS:
--   • Geen echte persoonsgegevens
--   • Geen echte e-mailadressen — alleen @example.com
--   • Alle namen starten met 'Demo'
--   • Geen destructive actions (alleen INSERT, geen DELETE/UPDATE/DROP)
--   • Alle records zijn gekoppeld aan company_id
-- =============================================================================

DO $$
DECLARE
  cid UUID := '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca';

  -- Pipeline stage IDs (opgehaald op naam)
  stage_offerte_maken  UUID;
  stage_wacht_akkoord  UUID;
  stage_in_uitvoering  UUID;
  stage_afgerond       UUID;

  -- Klant IDs
  klant_jansen   UUID;
  klant_vve      UUID;
  klant_devries  UUID;

  -- Deal IDs
  deal_jansen1  UUID;
  deal_vve      UUID;
  deal_devries  UUID;
  deal_jansen2  UUID;

  -- Offerte IDs
  offerte1  UUID;
  offerte2  UUID;

  -- Werkbon IDs
  wb1  UUID;
  wb2  UUID;

BEGIN

  -- ── Idempotentieguard — voorkomt duplicaten bij heruitvoering ──────────────
  IF EXISTS (
    SELECT 1 FROM customers WHERE company_id = cid AND name = 'Demo Familie Jansen'
  ) THEN
    RAISE NOTICE 'Fase 1 demo-data al aanwezig — script overgeslagen om duplicaten te voorkomen.';
    RAISE NOTICE 'Verwijder eerst de bestaande fase-1 demo-records als je opnieuw wilt seeden.';
    RETURN;
  END IF;

  -- ── Stage IDs ophalen ──────────────────────────────────────────────────────
  SELECT id INTO stage_offerte_maken
    FROM pipeline_stages WHERE company_id = cid AND name = 'Offerte maken';
  SELECT id INTO stage_wacht_akkoord
    FROM pipeline_stages WHERE company_id = cid AND name = 'Wacht op akkoord';
  SELECT id INTO stage_in_uitvoering
    FROM pipeline_stages WHERE company_id = cid AND name = 'In uitvoering';
  SELECT id INTO stage_afgerond
    FROM pipeline_stages WHERE company_id = cid AND name = 'Afgerond';

  IF stage_offerte_maken IS NULL OR stage_wacht_akkoord IS NULL
     OR stage_in_uitvoering IS NULL OR stage_afgerond IS NULL THEN
    RAISE EXCEPTION
      'Een of meer pipeline stages niet gevonden voor company_id %. '
      'Verwacht: "Offerte maken", "Wacht op akkoord", "In uitvoering", "Afgerond". '
      'Voer eerst migratie 003_seed_pipeline_stages.sql uit.',
      cid;
  END IF;

  -- ── 1. KLANTEN ──────────────────────────────────────────────────────────────
  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Familie Jansen',
               'demo.jansen@example.com',
               '06-11223344',
               'Demo Acacialaan 12',
               'Demo Amersfoort',
               'Demo particuliere klant. Wil binnenschilderwerk in woonkamer en slaapkamers.')
  RETURNING id INTO klant_jansen;

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo VVE Parkwijk',
               'demo.vve.parkwijk@example.com',
               '033-5556677',
               'Demo Parkweg 1',
               'Demo Amersfoort',
               'Demo VVE met 24 appartementen. Jaarlijks groot onderhoudscontract buitengevel.')
  RETURNING id INTO klant_vve;

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Bouwbedrijf De Vries BV',
               'demo.devries@example.com',
               '06-99887766',
               'Demo Industrieweg 55',
               'Demo Utrecht',
               'Demo bouwbedrijf dat schilderwerk uitbesteedt. Vaste opdrachtgever.')
  RETURNING id INTO klant_devries;

  -- ── 2. DEALS ────────────────────────────────────────────────────────────────
  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_jansen, stage_offerte_maken,
          'Demo Binnenschilderwerk woonkamer Familie Jansen',
          3812.50, 'med',
          'Demo: Matte lak gewenst, kleur nog te bevestigen. Klant wil alles in 1 week uitvoeren.')
  RETURNING id INTO deal_jansen1;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_vve, stage_wacht_akkoord,
          'Demo Buitenschilderwerk VVE Parkwijk 24 appartementen',
          20418.75, 'high',
          'Demo: Groot project, steigers nodig. VVE-bestuur vergadert 20 mei over akkoord.')
  RETURNING id INTO deal_vve;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_devries, stage_in_uitvoering,
          'Demo Renovatieschilderwerk kantoor De Vries BV',
          8712.00, 'med',
          'Demo: Kantoor volledig in bedrijfskleuren. Start week 20, doorlooptijd 1 week.')
  RETURNING id INTO deal_devries;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_jansen, stage_afgerond,
          'Demo Schilderwerk slaapkamers Familie Jansen',
          1250.00, 'low',
          'Demo: Eerder afgeronde opdracht — 2 slaapkamers en overloop, klant tevreden.')
  RETURNING id INTO deal_jansen2;

  -- ── 3. OFFERTES ─────────────────────────────────────────────────────────────
  -- Offerte 1 — Familie Jansen
  -- Berekening: (40u × €55 + €800 mat + €50 reiskosten) × 1.25 marge × 1.21 btw
  --   arbeid    = 40 × 55  = 2200
  --   subtotaal = 2200 + 800 + 50 = 3050
  --   excl      = 3050 × 1.25 = 3812.50
  --   incl      = 3812.50 × 1.21 = 4613.13
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten,
    marge_pct, btw_pct, totaal_excl, totaal_incl, geldig_tot
  ) VALUES (
    cid, klant_jansen, deal_jansen1,
    'DEMO-001', 'Demo Offerte binnenschilderwerk woonkamer Familie Jansen', 'verzonden',
    40, 55, 800, 50,
    25, 21, 3812.50, 4613.13, '2026-06-14'
  ) RETURNING id INTO offerte1;

  -- Offerte 2 — VVE Parkwijk
  -- Berekening: (160u × €55 + €4500 mat + €200 reiskosten) × 1.25 marge × 1.21 btw
  --   arbeid    = 160 × 55 = 8800
  --   subtotaal = 8800 + 4500 + 200 = 13500
  --   excl      = 13500 × 1.25 = 16875.00
  --   incl      = 16875 × 1.21 = 20418.75
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten,
    marge_pct, btw_pct, totaal_excl, totaal_incl, geldig_tot
  ) VALUES (
    cid, klant_vve, deal_vve,
    'DEMO-002', 'Demo Offerte buitenschilderwerk VVE Parkwijk 24 appartementen', 'verzonden',
    160, 55, 4500, 200,
    25, 21, 16875.00, 20418.75, '2026-06-01'
  ) RETURNING id INTO offerte2;

  -- ── 4. OFFERTE ITEMS ─────────────────────────────────────────────────────────
  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, offerte1, 'Demo Arbeidsuren schilder',                    'uur',  40, 55.00, 2200.00, 1),
    (cid, offerte1, 'Demo Verfmaterialen (grondverf + afwerklaag)', 'set',   1, 800.00,  800.00, 2),
    (cid, offerte1, 'Demo Reiskosten (5 ritten)',                   'rit',   5,  10.00,   50.00, 3);

  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, offerte2, 'Demo Arbeidsuren buitenschilderwerk',            'uur',  160, 55.00, 8800.00, 1),
    (cid, offerte2, 'Demo Verfmaterialen buitengevel 24 app.',        'set',    1, 4500.00, 4500.00, 2),
    (cid, offerte2, 'Demo Reiskosten en steigercoördinatie',          'ls',     1,  200.00,  200.00, 3);

  -- ── 5. WERKBONNEN ────────────────────────────────────────────────────────────
  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, titel, omschrijving,
    status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_devries, deal_devries,
    'Demo Werkbon kantoor De Vries BV — renovatieschilderwerk',
    'Demo: Volledig kantoor schilderen in RAL 9010 wit. Deuren en kozijnen in RAL 7016 antraciet.',
    'in_uitvoering', '2026-05-19', '07:30', '17:00',
    'Demo Industrieweg 55, Demo Utrecht',
    'Demo: Toegangspas ophalen bij receptie. Parkeren achter het gebouw.'
  ) RETURNING id INTO wb1;

  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, titel, omschrijving,
    status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_jansen, deal_jansen2,
    'Demo Werkbon slaapkamers Familie Jansen — afgerond',
    'Demo: Twee slaapkamers en overloop geschilderd in Levis kleur 4252. Inclusief plamuurwerk.',
    'afgerond', '2026-04-28', '08:00', '16:00',
    'Demo Acacialaan 12, Demo Amersfoort',
    'Demo: Oplevering zonder opmerkingen. Klant heeft na afronding bevestigd tevreden te zijn.'
  ) RETURNING id INTO wb2;

  -- Werkbon taken
  INSERT INTO werkbon_taken (company_id, werkbon_id, omschrijving, afgerond, volgorde)
  VALUES
    (cid, wb1, 'Demo Ondergrond schuren en reinigen',   false, 1),
    (cid, wb1, 'Demo Grondverf aanbrengen (1 laag)',    false, 2),
    (cid, wb1, 'Demo Afwerklak aanbrengen (2 lagen)',   false, 3),
    (cid, wb1, 'Demo Deuren en kozijnen lakken antraciet', false, 4),
    (cid, wb2, 'Demo Schuren en plamuren',              true,  1),
    (cid, wb2, 'Demo Slaapkamers verven (2 lagen)',     true,  2),
    (cid, wb2, 'Demo Overloop afwerken en opleveren',   true,  3);

  -- Werkbon materialen
  INSERT INTO werkbon_materialen (company_id, werkbon_id, naam, eenheid, aantal, prijs_per, subtotaal)
  VALUES
    (cid, wb1, 'Demo Muurverf RAL 9010 wit 10L',         'blik', 8, 45.00, 360.00),
    (cid, wb1, 'Demo Deurlak RAL 7016 antraciet 2.5L',   'blik', 4, 38.00, 152.00),
    (cid, wb1, 'Demo Grondverf universeel 10L',           'blik', 4, 32.00, 128.00),
    (cid, wb2, 'Demo Muurverf Levis 4252 kleur 5L',       'blik', 3, 42.00, 126.00),
    (cid, wb2, 'Demo Plamuur fijn 5kg',                   'emmer',2, 18.00,  36.00);

  -- ── 6. ACTIVITEITEN ──────────────────────────────────────────────────────────
  INSERT INTO activities (company_id, customer_id, deal_id, title, type, due_at, completed)
  VALUES
    (cid, klant_jansen,  deal_jansen1,
     'Demo Telefoongesprek intake binnenschilderwerk Jansen', 'call',
     '2026-05-08 10:00:00', true),
    (cid, klant_vve,     deal_vve,
     'Demo Opname ter plaatse buitengevel VVE Parkwijk',      'visit',
     '2026-05-12 14:00:00', true),
    (cid, klant_vve,     deal_vve,
     'Demo E-mail offerte DEMO-002 verstuurd naar VVE',       'email',
     '2026-05-13 09:00:00', true),
    (cid, klant_vve,     deal_vve,
     'Demo Follow-up bellen VVE Parkwijk na bestuursvergadering', 'follow',
     '2026-05-21 10:00:00', false),
    (cid, klant_devries, deal_devries,
     'Demo Verfmaterialen bestellen kantoor De Vries',        'task',
     '2026-05-15 08:00:00', false),
    (cid, klant_devries, deal_devries,
     'Demo Oplevering kantoor De Vries controleren',          'task',
     '2026-05-23 16:00:00', false);

  -- ── 7. AGENDA ────────────────────────────────────────────────────────────────
  INSERT INTO calendar_events (company_id, customer_id, deal_id, title, start_at, end_at, location, description)
  VALUES
    (cid, klant_vve, deal_vve,
     'Demo Opname buitengevel VVE Parkwijk',
     '2026-05-12 14:00:00+02', '2026-05-12 16:00:00+02',
     'Demo Parkweg 1, Demo Amersfoort',
     'Demo: Opmeten en bespreken werkzaamheden met VVE-bestuur.'),
    (cid, klant_devries, deal_devries,
     'Demo Schilderweek kantoor De Vries BV',
     '2026-05-19 07:30:00+02', '2026-05-23 17:00:00+02',
     'Demo Industrieweg 55, Demo Utrecht',
     'Demo: Volledige renovatieschilderweek. Toegangspas aanvragen, parkeren achter het pand.');

  -- ── 8. KOSTPRIJZEN ───────────────────────────────────────────────────────────
  INSERT INTO job_costs (company_id, deal_id, description, amount, category, cost_date)
  VALUES
    (cid, deal_jansen1, 'Demo Verfmaterialen aankoop binnenschilderwerk Jansen',     620.00, 'materiaal',  '2026-05-10'),
    (cid, deal_vve,     'Demo Steigerkosten buitengevel VVE Parkwijk (externe huur)', 1800.00, 'materiaal', '2026-05-13'),
    (cid, deal_devries, 'Demo Reiskosten week 20 kantoor De Vries',                   95.00, 'reiskosten',  '2026-05-16'),
    (cid, deal_devries, 'Demo Onderaannemer schuurwerk kantoor De Vries',            450.00, 'arbeid',      '2026-05-19');

  -- ── 9. NOTITIES ─────────────────────────────────────────────────────────────
  INSERT INTO notes (company_id, customer_id, deal_id, body, author)
  VALUES
    (cid, klant_jansen, deal_jansen1,
     'Demo: Klant geeft voorkeur aan matte lak in neutrale kleur. Kleurkeuze wordt per e-mail bevestigd na ontvangst staalkaart.',
     'Demo Gebruiker'),
    (cid, klant_vve, deal_vve,
     'Demo: Steigers beschikbaar in week 22. VVE-bestuur vergadert op 20 mei — verwacht akkoord na vergadering. Opdrachtbevestiging volgt per post.',
     'Demo Gebruiker'),
    (cid, klant_jansen, deal_jansen2,
     'Demo: Factuur verstuurd op 14 mei 2026. Betaaltermijn 14 dagen. Klant heeft telefonisch bevestigd tevreden te zijn met het eindresultaat.',
     'Demo Gebruiker');

  RAISE NOTICE '✓ Fase 1 Demo Schilderbedrijf aangemaakt:';
  RAISE NOTICE '  - 3 klanten (Jansen, VVE Parkwijk, De Vries BV)';
  RAISE NOTICE '  - 4 deals (2× Jansen, 1× VVE, 1× De Vries)';
  RAISE NOTICE '  - 2 offertes met items (DEMO-001, DEMO-002)';
  RAISE NOTICE '  - 2 werkbonnen met taken + materialen';
  RAISE NOTICE '  - 6 activiteiten';
  RAISE NOTICE '  - 2 agenda-items';
  RAISE NOTICE '  - 4 kostprijsregels';
  RAISE NOTICE '  - 3 notities';

END $$;

-- Controleer het resultaat
SELECT 'customers' AS tabel, count(*) AS demo_records
  FROM customers WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND name LIKE 'Demo%'
UNION ALL
SELECT 'deals', count(*) FROM deals
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND title LIKE 'Demo%'
UNION ALL
SELECT 'offertes', count(*) FROM offertes
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND omschrijving LIKE 'Demo%'
UNION ALL
SELECT 'werkbonnen', count(*) FROM werkbonnen
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND titel LIKE 'Demo%'
UNION ALL
SELECT 'activities', count(*) FROM activities
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND title LIKE 'Demo%'
UNION ALL
SELECT 'job_costs', count(*) FROM job_costs
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND description LIKE 'Demo%'
UNION ALL
SELECT 'notes', count(*) FROM notes
  WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca' AND body LIKE 'Demo%'
ORDER BY tabel;
