-- =============================================================================
-- BossBase Demo Data — Fase 2: Aannemer
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
  stage_nieuwe_lead    UUID;
  stage_offerte_maken  UUID;
  stage_off_verstuurd  UUID;
  stage_in_uitvoering  UUID;
  stage_afgerond       UUID;
  stage_betaald        UUID;

  -- Klant IDs
  klant_vandenberg  UUID;
  klant_woonplus    UUID;
  klant_supermarkt  UUID;

  -- Deal IDs
  deal_badkamer   UUID;
  deal_woonplus   UUID;
  deal_supermarkt UUID;
  deal_dakkapel   UUID;

  -- Offerte IDs
  offerte1  UUID;
  offerte2  UUID;

  -- Werkbon IDs
  wb1  UUID;
  wb2  UUID;

BEGIN

  -- ── Stage IDs ophalen ──────────────────────────────────────────────────────
  SELECT id INTO stage_nieuwe_lead
    FROM pipeline_stages WHERE company_id = cid AND name = 'Nieuwe lead';
  SELECT id INTO stage_offerte_maken
    FROM pipeline_stages WHERE company_id = cid AND name = 'Offerte maken';
  SELECT id INTO stage_off_verstuurd
    FROM pipeline_stages WHERE company_id = cid AND name = 'Offerte verstuurd';
  SELECT id INTO stage_in_uitvoering
    FROM pipeline_stages WHERE company_id = cid AND name = 'In uitvoering';
  SELECT id INTO stage_afgerond
    FROM pipeline_stages WHERE company_id = cid AND name = 'Afgerond';
  SELECT id INTO stage_betaald
    FROM pipeline_stages WHERE company_id = cid AND name = 'Betaald / Gesloten';

  IF stage_nieuwe_lead IS NULL THEN
    RAISE EXCEPTION 'Pipeline stages niet gevonden voor company_id %. Voer eerst 003_seed_pipeline_stages.sql uit.', cid;
  END IF;

  -- ── 1. KLANTEN ──────────────────────────────────────────────────────────────
  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Familie Van den Berg',
               'demo.vandenberg@example.com',
               '06-44556677',
               'Demo Beukenlaan 34',
               'Demo Hilversum',
               'Demo particuliere klant. Badkamerrenovatie en dakkapel geplaatst. Vaste relatie.')
  RETURNING id INTO klant_vandenberg;

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Woningcorporatie Woonplus',
               'demo.woonplus@example.com',
               '035-6667788',
               'Demo Stationsplein 2',
               'Demo Hilversum',
               'Demo woningcorporatie met 800 huurwoningen. Jaarlijks renovatiecontract.')
  RETURNING id INTO klant_woonplus;

  INSERT INTO customers (company_id, name, email, phone, address, city, notes)
  VALUES (cid, 'Demo Supermarkt Holding BV',
               'demo.supermarkt.holding@example.com',
               '020-3334455',
               'Demo Handelsweg 100',
               'Demo Amsterdam',
               'Demo retailketen, 3 vestigingen. Verbouwingen bij heropening en uitbreiding.')
  RETURNING id INTO klant_supermarkt;

  -- ── 2. DEALS ────────────────────────────────────────────────────────────────
  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_vandenberg, stage_offerte_maken,
          'Demo Badkamerrenovatie Familie Van den Berg',
          10254.75, 'med',
          'Demo: Volledige badkamer verbouwen inclusief tegels, sanitair en tegelwerk. Klant wil oplevering voor zomer.')
  RETURNING id INTO deal_badkamer;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_woonplus, stage_off_verstuurd,
          'Demo Renovatie 12 huurwoningen Woonplus fase A',
          57934.80, 'high',
          'Demo: Fase A van groot renovatieproject — keuken + badkamer in 12 woningen. Woonplus beslist deze maand.')
  RETURNING id INTO deal_woonplus;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_supermarkt, stage_in_uitvoering,
          'Demo Verbouwing supermarkt vestiging Demo Amsterdam',
          24500.00, 'high',
          'Demo: Uitbreiding magazijn en nieuwe kassaruimte. Doorlooptijd 3 weken, winkel blijft open.')
  RETURNING id INTO deal_supermarkt;

  INSERT INTO deals (company_id, customer_id, stage_id, title, value, priority, notes)
  VALUES (cid, klant_vandenberg, stage_betaald,
          'Demo Dakkapel plaatsen Familie Van den Berg',
          8900.00, 'low',
          'Demo: Dakkapel geplaatst aan voorzijde, inclusief vergunning en dakwerk. Afgerond en betaald.')
  RETURNING id INTO deal_dakkapel;

  -- ── 3. OFFERTES ─────────────────────────────────────────────────────────────
  -- Offerte 1 — Badkamerrenovatie Van den Berg
  -- Berekening: (60u × €65 + €2800 mat + €80 reis) × 1.25 marge × 1.21 btw
  --   arbeid    = 60 × 65  = 3900
  --   subtotaal = 3900 + 2800 + 80 = 6780
  --   excl      = 6780 × 1.25 = 8475.00
  --   incl      = 8475 × 1.21 = 10254.75
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten,
    marge_pct, btw_pct, totaal_excl, totaal_incl, geldig_tot
  ) VALUES (
    cid, klant_vandenberg, deal_badkamer,
    'DEMO-003', 'Demo Offerte badkamerrenovatie Familie Van den Berg', 'concept',
    60, 65, 2800, 80,
    25, 21, 8475.00, 10254.75, '2026-06-30'
  ) RETURNING id INTO offerte1;

  -- Offerte 2 — Renovatie 12 huurwoningen Woonplus
  -- Berekening: (320u × €65 + €18500 mat + €600 reis) × 1.20 marge × 1.21 btw
  --   arbeid    = 320 × 65 = 20800
  --   subtotaal = 20800 + 18500 + 600 = 39900
  --   excl      = 39900 × 1.20 = 47880.00
  --   incl      = 47880 × 1.21 = 57934.80
  INSERT INTO offertes (
    company_id, customer_id, deal_id, nummer, omschrijving, status,
    arbeidsuren, uurtarief, materiaalkosten, reiskosten,
    marge_pct, btw_pct, totaal_excl, totaal_incl, geldig_tot
  ) VALUES (
    cid, klant_woonplus, deal_woonplus,
    'DEMO-004', 'Demo Offerte renovatie 12 huurwoningen Woonplus fase A', 'verstuurd',
    320, 65, 18500, 600,
    20, 21, 47880.00, 57934.80, '2026-05-31'
  ) RETURNING id INTO offerte2;

  -- ── 4. OFFERTE ITEMS ─────────────────────────────────────────────────────────
  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, offerte1, 'Demo Arbeidsuren aannemer en timmerman',      'uur',  60, 65.00, 3900.00, 1),
    (cid, offerte1, 'Demo Sanitair (douche, toilet, wastafel)',    'set',   1, 1600.00, 1600.00, 2),
    (cid, offerte1, 'Demo Wandtegels en vloertegels + lijm',       'set',   1, 1200.00, 1200.00, 3),
    (cid, offerte1, 'Demo Reiskosten',                             'rit',   8, 10.00,   80.00, 4);

  INSERT INTO offerte_items (company_id, offerte_id, omschrijving, eenheid, aantal, prijs_per, subtotaal, volgorde)
  VALUES
    (cid, offerte2, 'Demo Arbeidsuren renovatieploeg (2 man)',     'uur', 320, 65.00, 20800.00, 1),
    (cid, offerte2, 'Demo Keukeninstallaties 12 stuks',            'st',   12, 800.00, 9600.00, 2),
    (cid, offerte2, 'Demo Sanitair badkamer 12 stuks',             'st',   12, 450.00, 5400.00, 3),
    (cid, offerte2, 'Demo Overig bouwmateriaal',                   'ls',    1, 3500.00, 3500.00, 4),
    (cid, offerte2, 'Demo Reiskosten en coördinatie',              'ls',    1,  600.00,  600.00, 5);

  -- ── 5. WERKBONNEN ────────────────────────────────────────────────────────────
  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, titel, omschrijving,
    status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_supermarkt, deal_supermarkt,
    'Demo Werkbon verbouwing supermarkt — magazijn + kassa',
    'Demo: Uitbreiding magazijn 40m², nieuwe kassaruimte inclusief vloer, wanden en installaties.',
    'in_uitvoering', '2026-05-13', '06:00', '18:00',
    'Demo Handelsweg 100, Demo Amsterdam',
    'Demo: Coördinator ter plaatse is demo.manager@example.com. Werktijden buiten openingstijden winkel.'
  ) RETURNING id INTO wb1;

  INSERT INTO werkbonnen (
    company_id, customer_id, deal_id, titel, omschrijving,
    status, gepland_op, starttijd, eindtijd, locatie, notes
  ) VALUES (
    cid, klant_vandenberg, deal_dakkapel,
    'Demo Werkbon dakkapel plaatsen Familie Van den Berg',
    'Demo: Dakkapel geplaatst aan voorzijde, 2.4m × 1.2m. Inclusief dakbedekking en binnenwerkse afwerking.',
    'afgerond', '2026-04-14', '07:00', '17:00',
    'Demo Beukenlaan 34, Demo Hilversum',
    'Demo: Vergunning ontvangen 2 april. Burencontact voor steigerplaatsing geregeld.'
  ) RETURNING id INTO wb2;

  -- Werkbon taken
  INSERT INTO werkbon_taken (company_id, werkbon_id, omschrijving, afgerond, volgorde)
  VALUES
    (cid, wb1, 'Demo Sloopwerk bestaande wand magazijn',            false, 1),
    (cid, wb1, 'Demo Fundering en vloer nieuw gedeelte storten',    false, 2),
    (cid, wb1, 'Demo Wanden optrekken magazijnsectie',              false, 3),
    (cid, wb1, 'Demo Kassabalie plaatsen en afwerken',              false, 4),
    (cid, wb1, 'Demo Elektra en verlichting aansluiten',            false, 5),
    (cid, wb2, 'Demo Dakpannen verwijderen en onderplaat plaatsen', true,  1),
    (cid, wb2, 'Demo Dakkapelconstructie plaatsen en waterdicht',   true,  2),
    (cid, wb2, 'Demo Binnenwerkse afwerking en isolatie',           true,  3),
    (cid, wb2, 'Demo Schilderwerk buiten en kitwerk afdichten',     true,  4);

  -- Werkbon materialen
  INSERT INTO werkbon_materialen (company_id, werkbon_id, naam, eenheid, aantal, prijs_per, subtotaal)
  VALUES
    (cid, wb1, 'Demo Betonblokken 20cm',            'st',   80, 3.20,  256.00),
    (cid, wb1, 'Demo Betonstaal wapening',           'kg',  120, 1.85,  222.00),
    (cid, wb1, 'Demo Gipsplaat 120×260cm',           'plaat', 30, 12.50, 375.00),
    (cid, wb1, 'Demo Afwerkplamuur 25kg',            'emmer',  6, 24.00, 144.00),
    (cid, wb2, 'Demo Dakpannen keramisch',           'st',  180, 2.80,  504.00),
    (cid, wb2, 'Demo Dakkapelframe staal prefab',    'st',    1, 1850.00, 1850.00),
    (cid, wb2, 'Demo Isolatieplaat PIR 100mm',       'm²',  12, 28.00,  336.00);

  -- ── 6. ACTIVITEITEN ──────────────────────────────────────────────────────────
  INSERT INTO activities (company_id, customer_id, deal_id, title, type, due_at, completed)
  VALUES
    (cid, klant_vandenberg, deal_badkamer,
     'Demo Bezoek opmeten badkamer Familie Van den Berg',         'visit',
     '2026-05-07 10:00:00', true),
    (cid, klant_vandenberg, deal_badkamer,
     'Demo Offerte DEMO-003 opstellen en versturen',              'task',
     '2026-05-09 09:00:00', false),
    (cid, klant_woonplus, deal_woonplus,
     'Demo Presentatie renovatieplan Woonplus bestuur',           'visit',
     '2026-05-06 14:00:00', true),
    (cid, klant_woonplus, deal_woonplus,
     'Demo Follow-up bellen Woonplus na offerte DEMO-004',        'follow',
     '2026-05-20 09:00:00', false),
    (cid, klant_supermarkt, deal_supermarkt,
     'Demo Weekrapportage verbouwing supermarkt sturen',          'email',
     '2026-05-16 17:00:00', false),
    (cid, klant_supermarkt, deal_supermarkt,
     'Demo Oplevering supermarkt controleren en tekenen',         'task',
     '2026-05-30 10:00:00', false);

  -- ── 7. AGENDA ────────────────────────────────────────────────────────────────
  INSERT INTO calendar_events (company_id, customer_id, deal_id, title, start_at, end_at, location, description)
  VALUES
    (cid, klant_vandenberg, deal_badkamer,
     'Demo Opmeting badkamer Familie Van den Berg',
     '2026-05-07 10:00:00+02', '2026-05-07 11:30:00+02',
     'Demo Beukenlaan 34, Demo Hilversum',
     'Demo: Opmeten badkamer, bespreken gewenste indeling en materiaalwensen.'),
    (cid, klant_woonplus, deal_woonplus,
     'Demo Presentatie renovatieplan Woonplus',
     '2026-05-06 14:00:00+02', '2026-05-06 16:00:00+02',
     'Demo Stationsplein 2, Demo Hilversum',
     'Demo: Technische presentatie fase A aan bestuur en technische dienst Woonplus.'),
    (cid, klant_supermarkt, deal_supermarkt,
     'Demo Verbouwingsperiode supermarkt Amsterdam',
     '2026-05-13 06:00:00+02', '2026-05-30 18:00:00+02',
     'Demo Handelsweg 100, Demo Amsterdam',
     'Demo: Volledige verbouwingsperiode. Dagelijks check-in met locatiebeheerder.');

  -- ── 8. KOSTPRIJZEN ───────────────────────────────────────────────────────────
  INSERT INTO job_costs (company_id, deal_id, description, amount, category, cost_date)
  VALUES
    (cid, deal_badkamer,
     'Demo Sanitair inkoop badkamerrenovatie Van den Berg',       1480.00, 'materiaal',  '2026-05-08'),
    (cid, deal_woonplus,
     'Demo Proefstuk keuken aankoop voor Woonplus offerte',        320.00, 'materiaal',  '2026-05-05'),
    (cid, deal_supermarkt,
     'Demo Bouwmateriaal eerste week verbouwing supermarkt',      2840.00, 'materiaal',  '2026-05-13'),
    (cid, deal_supermarkt,
     'Demo Huur bouwlift en steiger verbouwing supermarkt',        950.00, 'materiaal',  '2026-05-13'),
    (cid, deal_supermarkt,
     'Demo Reiskosten ploeg week 20 supermarkt Amsterdam',         210.00, 'reiskosten', '2026-05-16'),
    (cid, deal_dakkapel,
     'Demo Dakkapelframe en dakpannen inkoop Van den Berg',       2354.00, 'materiaal',  '2026-04-10');

  -- ── 9. NOTITIES ─────────────────────────────────────────────────────────────
  INSERT INTO notes (company_id, customer_id, deal_id, body, author)
  VALUES
    (cid, klant_vandenberg, deal_badkamer,
     'Demo: Klant wil douche i.p.v. bad. Voorkeur voor inloopdouche met regendouche. Tegel kleur: lichte grijstint. Budget flexibel tot €11.000 incl. btw.',
     'Demo Gebruiker'),
    (cid, klant_woonplus, deal_woonplus,
     'Demo: Woonplus wil 5 jaar servicecontract als de renovatie akkoord is. Contact: demo.technisch@woonplus.example.com. Beslissing verwacht vóór 1 juni.',
     'Demo Gebruiker'),
    (cid, klant_supermarkt, deal_supermarkt,
     'Demo: Vloer kassasectie moet antislip zijn (HACCP-eis). Elektra kassabalie loopt via bestaande groep 12. Afstemmen met eigen elektricien klant.',
     'Demo Gebruiker'),
    (cid, klant_vandenberg, deal_dakkapel,
     'Demo: Dakkapel succesvol opgeleverd op 14 april. Factuur DEMO-F002 betaald op 28 april. Klant heeft positieve review gegeven.',
     'Demo Gebruiker');

  RAISE NOTICE '✓ Fase 2 Demo Aannemer aangemaakt:';
  RAISE NOTICE '  - 3 klanten (Van den Berg, Woonplus, Supermarkt Holding)';
  RAISE NOTICE '  - 4 deals (badkamer, Woonplus renovatie, supermarkt verbouwing, dakkapel)';
  RAISE NOTICE '  - 2 offertes met items (DEMO-003, DEMO-004)';
  RAISE NOTICE '  - 2 werkbonnen met taken + materialen';
  RAISE NOTICE '  - 6 activiteiten';
  RAISE NOTICE '  - 3 agenda-items';
  RAISE NOTICE '  - 6 kostprijsregels';
  RAISE NOTICE '  - 4 notities';

END $$;

-- Controleer het resultaat (gecombineerd met fase 1)
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
