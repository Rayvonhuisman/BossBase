-- =============================================================================
-- Ketentest SnelStart — minimale testset met maximale variatie.
--
-- Vervangt de oude, veel grotere testset. Uitgangspunt: zo weinig mogelijk
-- rijen, maar elke variabele die de koppeling anders behandelt moet erin zitten.
-- Dat maakt een volledige ronde in een paar minuten te overzien in plaats van
-- in een tabel van dertig regels.
--
-- Company_id blijft bewust hetzelfde. accounting_connections hangt eraan en
-- bevat de SnelStart-koppelsleutel; het bedrijf weggooien zou betekenen dat de
-- koppeling opnieuw opgezet moet worden. Alle DATA gaat wel weg.
--
-- Draai daarna scripts/seed-ketentest-bijlagen.mjs voor de PDF's en de bon —
-- die kunnen niet vanuit SQL, want de bestanden zelf staan in de opslag.
--
-- IDEMPOTENT: herhaald draaien geeft altijd dezelfde stand.
-- =============================================================================

DO $$
DECLARE
  v_user    uuid := '7e57c0de-0000-4000-a000-000000000001';
  v_company uuid := '7e57c0de-0000-4000-a000-000000000002';
  -- Vaste id's: de bijlagen-uploader heeft ze nodig om de bestanden op de
  -- juiste paden te zetten, zonder ze eerst op te moeten zoeken.
  k1 uuid := '7e57c0de-0001-4000-a000-000000000001';  -- klant compleet
  k2 uuid := '7e57c0de-0001-4000-a000-000000000002';  -- klant zonder adres
  k3 uuid := '7e57c0de-0001-4000-a000-000000000003';  -- klant zonder factuur
  l1 uuid := '7e57c0de-0002-4000-a000-000000000001';  -- leverancier compleet
  l2 uuid := '7e57c0de-0002-4000-a000-000000000002';  -- leverancier foute btw
  l3 uuid := '7e57c0de-0002-4000-a000-000000000003';  -- leverancier kaal
  f1 uuid := '7e57c0de-0003-4000-a000-000000000001';  -- 21%
  f2 uuid := '7e57c0de-0003-4000-a000-000000000002';  -- 21 + 9 + vrijgesteld
  f3 uuid := '7e57c0de-0003-4000-a000-000000000003';  -- alleen verlegd
  f4 uuid := '7e57c0de-0003-4000-a000-000000000004';  -- verlegd + belast: WEIGEREN
  f5 uuid := '7e57c0de-0003-4000-a000-000000000005';  -- concept: OVERSLAAN
  fc uuid := '7e57c0de-0003-4000-a000-00000000000c';  -- creditfactuur
  c1 uuid := '7e57c0de-0004-4000-a000-000000000001';  -- kost met bon
BEGIN
  -- ── 0. Alle data van dit bedrijf weg (bedrijf + gebruiker blijven) ─────────
  DELETE FROM public.job_costs      WHERE company_id = v_company;
  DELETE FROM public.factuur_regels WHERE company_id = v_company;
  DELETE FROM public.facturen       WHERE company_id = v_company;
  DELETE FROM public.offerte_items  WHERE company_id = v_company;
  DELETE FROM public.offertes       WHERE company_id = v_company;
  DELETE FROM public.leveranciers   WHERE company_id = v_company;
  DELETE FROM public.klant_tijdlijn WHERE company_id = v_company;
  DELETE FROM public.customers      WHERE company_id = v_company;

  -- ── 1. Klanten ────────────────────────────────────────────────────────────
  -- Drie stuks, elk met een eigen reden om te bestaan.
  INSERT INTO public.customers (id, company_id, name, email, phone, address, postcode, city) VALUES
    (k1, v_company, 'Test Klant Compleet',     'klant1@bossbase.test', '06-10000001', 'Testlaan 1', '1011 AA', 'Amsterdam'),
    -- Zonder adres: moet een adreswaarschuwing opleveren, maar wel geboekt worden.
    (k2, v_company, 'Test Klant Zonder Adres', 'klant2@bossbase.test', '06-10000002', NULL, NULL, NULL),
    -- Zonder factuur: hoort NIET in SnelStart te verschijnen. Relaties ontstaan
    -- pas als er een boeking aan hangt.
    (k3, v_company, 'Test Klant Ongebruikt',   'klant3@bossbase.test', NULL, 'Testlaan 3', '1011 CC', 'Amsterdam');

  -- ── 2. Leveranciers ───────────────────────────────────────────────────────
  INSERT INTO public.leveranciers (id, company_id, naam, email, telefoon, address, postcode, city, kvk_number, btw_number, iban, actief) VALUES
    -- Geldige elfproef en mod-97: alle velden horen te worden geaccepteerd.
    (l1, v_company, 'Test Leverancier Compleet', 'inkoop@lev1.test', '010-1234567', 'Industrieweg 1', '3044 AS', 'Rotterdam',
     '24123456', 'NL123456782B01', 'NL91ABNA0417164300', true),
    -- Bewust ONGELDIG btw-nummer. SnelStart weigert de relatie met REL-0088;
    -- de terugvalregel hoort het veld weg te laten, de relatie tóch aan te maken
    -- en te melden welk veld is overgeslagen.
    (l2, v_company, 'Test Leverancier Foute BTW', 'inkoop@lev2.test', NULL, NULL, NULL, NULL,
     NULL, 'NL999999999B99', NULL, true),
    -- Alleen een naam: het kale minimum.
    (l3, v_company, 'Test Leverancier Kaal', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true);

  -- ── 3. Facturen ───────────────────────────────────────────────────────────
  -- totaal_excl/totaal_incl worden door de trigger uit de regels afgeleid; de
  -- waarden hieronder zijn alleen een startpunt.
  INSERT INTO public.facturen (id, company_id, customer_id, nummer, status, factuurdatum, vervaldatum, totaal_excl, totaal_incl, betaaltermijn_dagen) VALUES
    (f1, v_company, k1, 'TF-001', 'verzonden', current_date - 10, current_date + 4,  0, 0, 14),
    (f2, v_company, k1, 'TF-002', 'verzonden', current_date - 8,  current_date + 6,  0, 0, 14),
    (f3, v_company, k2, 'TF-003', 'verzonden', current_date - 6,  current_date + 8,  0, 0, 14),
    (f4, v_company, k1, 'TF-004', 'verzonden', current_date - 4,  current_date + 10, 0, 0, 14),
    -- Concept: hoort te worden overgeslagen.
    (f5, v_company, k1, 'TF-005', 'concept',   current_date - 2,  current_date + 12, 0, 0, 14);

  INSERT INTO public.factuur_regels (factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs, btw_pct, btw_regime, regelprijs, volgorde) VALUES
    -- TF-001: het eenvoudigste geval. 21% → VerkopenOmzetHoog.
    (f1, v_company, 'vast', 'Werk 21%',            1, 100.00, 21, 'normaal',     100.00, 0),
    -- TF-002: drie tarieven die WEL samen mogen. Vrijgesteld krijgt geen
    -- btw-regel maar deelt het grootboek met verlegd.
    (f2, v_company, 'vast', 'Werk 21%',            1, 200.00, 21, 'normaal',     200.00, 0),
    (f2, v_company, 'vast', 'Werk 9%',             1, 100.00,  9, 'verlaagd',    100.00, 1),
    (f2, v_company, 'vast', 'Werk vrijgesteld',    1,  50.00,  0, 'vrijgesteld',  50.00, 2),
    -- TF-003: uitsluitend verlegd. Krijgt een VerkopenVerlegd-btwregel met
    -- bedrag 0, wat de boeking naar 1673/1674 stuurt.
    (f3, v_company, 'vast', 'Onderaanneming',      1, 300.00,  0, 'verlegd',     300.00, 0),
    -- TF-004: verlegd NAAST belast. SnelStart hoort dit te weigeren (BOE-0062).
    (f4, v_company, 'vast', 'Onderaanneming',      1, 100.00,  0, 'verlegd',     100.00, 0),
    (f4, v_company, 'vast', 'Werk 21%',            1, 100.00, 21, 'normaal',     100.00, 1),
    -- TF-005: concept.
    (f5, v_company, 'vast', 'Nog niet verstuurd',  1, 500.00, 21, 'normaal',     500.00, 0);

  -- ── 4. Creditfactuur op TF-001 ────────────────────────────────────────────
  INSERT INTO public.facturen (id, company_id, customer_id, nummer, status, factuurdatum, vervaldatum, totaal_excl, totaal_incl, is_credit, credit_van_factuur_id, betaaltermijn_dagen)
  VALUES (fc, v_company, k1, 'TC-001', 'verzonden', current_date - 1, current_date + 13, 0, 0, true, f1, 14);
  INSERT INTO public.factuur_regels (factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs, btw_pct, btw_regime, regelprijs, volgorde)
  VALUES (fc, v_company, 'vast', 'Creditering TF-001', 1, -100.00, 21, 'normaal', -100.00, 0);
  UPDATE public.facturen SET gecrediteerd = true WHERE id = f1;

  -- ── 5. Kosten ─────────────────────────────────────────────────────────────
  INSERT INTO public.job_costs (id, company_id, description, amount, category, cost_date, btw_percentage, btw_inclusief, leverancier_id, externe_referentie) VALUES
    -- Materiaal 21%, excl ingevoerd. Krijgt straks een bon → InkopenHoog.
    (c1, v_company, 'Test materiaal met bon', 200.00, 'Materiaal', current_date - 9, 21, false, l1, NULL),
    -- Materiaal 9%, INCLUSIEF ingevoerd: test het terugrekenen (109 → 100 excl).
    (gen_random_uuid(), v_company, 'Test materiaal incl btw', 109.00, 'Materiaal', current_date - 7, 9, true, l1, NULL),
    -- Inkoopfactuur 0% bij de leverancier met het foute btw-nummer: test of de
    -- boeking doorgaat nadat het veld is weggelaten.
    (gen_random_uuid(), v_company, 'Test inkoop 0%', 150.00, 'Inkoopfactuur', current_date - 5, 0, false, l2, NULL),
    -- Reiskosten: categorie waarbij een bon NIET verplicht is.
    (gen_random_uuid(), v_company, 'Test reiskosten', 50.00, 'Reiskosten', current_date - 3, 9, false, l3, NULL),
    -- Categorie zonder mapping: hoort op InkopenVraagPosten met markering.
    (gen_random_uuid(), v_company, 'Test algemene kosten', 80.00, 'Algemene kosten', current_date - 2, 21, false, l1, NULL),
    -- Geïmporteerd uit SnelStart: hoort te worden OVERGESLAGEN (terugkoppellus).
    (gen_random_uuid(), v_company, 'Test geimporteerd', 999.00, 'Materiaal', current_date - 1, 21, false, l1, 'snelstart_testref_1');

  RAISE NOTICE 'Klanten: 3 (2 met factuur, 1 ongebruikt)';
  RAISE NOTICE 'Leveranciers: 3 (1 compleet, 1 met fout btw-nummer, 1 kaal)';
  RAISE NOTICE 'Facturen: 4 verstuurd + 1 concept + 1 credit';
  RAISE NOTICE 'Kosten: 5 exporteerbaar + 1 geimporteerd';
END $$;
