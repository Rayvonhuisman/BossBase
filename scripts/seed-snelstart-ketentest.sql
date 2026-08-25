-- Testdata voor de volledige SnelStart-ketentest.
--
-- Alles krijgt het voorvoegsel KT- zodat het in één keer op te ruimen is.
-- Idempotent: draait het script opnieuw, dan wordt eerst alles met dat
-- voorvoegsel verwijderd.
--
-- Bedrijf: TEST SnelStart BV (7e57c0de-0000-4000-a000-000000000002)

do $$
declare
  v_co    uuid := '7e57c0de-0000-4000-a000-000000000002';
  v_lev1  uuid;  -- volledig ingevuld
  v_lev2  uuid;  -- volledig ingevuld
  v_lev3  uuid;  -- alleen een naam
  v_klant uuid;
  v_fact  uuid;
  v_cred  uuid;
begin
  -- ── opruimen van een vorige run ────────────────────────────────────────────
  delete from public.job_costs
   where company_id = v_co and description like 'KT-%';
  delete from public.factuur_regels
   where factuur_id in (select id from public.facturen where company_id = v_co and nummer like 'KT-%');
  delete from public.facturen where company_id = v_co and nummer like 'KT-%';
  delete from public.materialen where company_id = v_co and naam like 'KT-%';
  delete from public.leveranciers where company_id = v_co and naam like 'KT-%';

  select id into v_klant from public.customers
   where company_id = v_co and name = 'Testklant 2' limit 1;
  if v_klant is null then
    select id into v_klant from public.customers where company_id = v_co limit 1;
  end if;

  -- ── 1. Leveranciers ────────────────────────────────────────────────────────
  insert into public.leveranciers
    (company_id, naam, contactpersoon, email, telefoon, mobiel, website,
     address, postcode, city, kvk_number, btw_number, iban, betaaltermijn_dagen, notities)
  values (v_co, 'KT-Bouwmaat Volledig', 'Jan de Vries', 'inkoop@bouwmaat.test',
          '010-1234567', '06-11223344', 'www.bouwmaat.test',
          'Industrieweg 12', '3044 AS', 'Rotterdam', '24123456', 'NL123456782B02',
          'NL91ABNA0417164300', 30, 'Volledige leverancier voor de ketentest.')
  returning id into v_lev1;

  insert into public.leveranciers
    (company_id, naam, contactpersoon, email, telefoon, website,
     address, postcode, city, kvk_number, btw_number, iban, betaaltermijn_dagen)
  values (v_co, 'KT-Elektro Groothandel', 'Petra Jansen', 'verkoop@elektro.test',
          '020-7654321', 'www.elektro.test',
          'Kabelstraat 5', '1101 BX', 'Amsterdam', '34567890', 'NL123456782B01',
          'NL39RABO0300065264', 14)
  returning id into v_lev2;

  -- Alleen een naam: toetst of SnelStart een relatie zonder adres accepteert.
  insert into public.leveranciers (company_id, naam)
  values (v_co, 'KT-Kleine Leverancier') returning id into v_lev3;

  -- ── 2. Kosten met leverancier ──────────────────────────────────────────────
  -- (a) mét bon — het bijlagepad
  insert into public.job_costs
    (company_id, description, amount, category, cost_date, klant_type, customer_id,
     btw_percentage, btw_inclusief, leverancier_id, bijlage_url, snelstart_bijlage_gesynct)
  values (v_co, 'KT-Kosten met bon', 250.00, 'Materiaal', current_date - 5, 'klant', v_klant,
          21, false, v_lev1, '["7e57c0de-0000-4000-a000-000000000002/kt-testbon.pdf"]', false);

  -- (b) zonder bon
  insert into public.job_costs
    (company_id, description, amount, category, cost_date, klant_type,
     btw_percentage, btw_inclusief, leverancier_id, snelstart_bijlage_gesynct)
  values (v_co, 'KT-Kosten zonder bon', 120.00, 'Gereedschap', current_date - 4, 'algemeen',
          21, false, v_lev2, true);

  -- (c) krijgt later pas een bon — toetst het nasturen
  insert into public.job_costs
    (company_id, description, amount, category, cost_date, klant_type,
     btw_percentage, btw_inclusief, leverancier_id, snelstart_bijlage_gesynct)
  values (v_co, 'KT-Kosten bon volgt later', 89.50, 'Inkoopfactuur', current_date - 3, 'algemeen',
          21, false, v_lev3, true);

  -- ── 3. Eén kost per categorie — toetst de grootboekmapping ────────────────
  insert into public.job_costs
    (company_id, description, amount, category, cost_date, klant_type,
     btw_percentage, btw_inclusief, leverancier_id, snelstart_bijlage_gesynct)
  values
    (v_co, 'KT-Cat Materiaal',       75.00, 'Materiaal',       current_date - 2, 'algemeen', 21, false, v_lev1, true),
    (v_co, 'KT-Cat Reiskosten',      45.00, 'Reiskosten',      current_date - 2, 'algemeen',  9, false, v_lev1, true),
    (v_co, 'KT-Cat Gereedschap',    310.00, 'Gereedschap',     current_date - 2, 'algemeen', 21, false, v_lev2, true),
    (v_co, 'KT-Cat Inkoopfactuur',  199.00, 'Inkoopfactuur',   current_date - 2, 'algemeen', 21, false, v_lev2, true),
    (v_co, 'KT-Cat Algemene kosten', 60.00, 'Algemene kosten', current_date - 2, 'algemeen', 21, false, v_lev3, true),
    (v_co, 'KT-Cat Overig',          35.00, 'Overig',          current_date - 2, 'algemeen',  0, false, v_lev3, true);

  -- ── 4. Factuur met 21% / 9% / verlegd ─────────────────────────────────────
  insert into public.facturen
    (company_id, customer_id, nummer, status, factuurdatum, vervaldatum,
     totaal_excl, totaal_incl, betaaltermijn_dagen)
  values (v_co, v_klant, 'KT-FACT-001', 'verzonden', current_date - 7, current_date + 7,
          600.00, 700.00, 14)
  returning id into v_fact;

  insert into public.factuur_regels
    (factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs, btw_pct, btw_regime, regelprijs, volgorde)
  values
    (v_fact, v_co, 'vast', 'KT-Regel 21% normaal',   1, 300.00, 21, 'normaal',  300.00, 0),
    (v_fact, v_co, 'vast', 'KT-Regel 9% verlaagd',   1, 200.00,  9, 'verlaagd', 200.00, 1),
    (v_fact, v_co, 'vast', 'KT-Regel btw verlegd',   1, 100.00,  0, 'verlegd',  100.00, 2);

  -- ── 5. Creditfactuur op die factuur ───────────────────────────────────────
  insert into public.facturen
    (company_id, customer_id, nummer, status, factuurdatum, vervaldatum,
     totaal_excl, totaal_incl, is_credit, credit_van_factuur_id, betaaltermijn_dagen)
  values (v_co, v_klant, 'KT-CRED-001', 'verzonden', current_date - 1, current_date + 13,
          -100.00, -121.00, true, v_fact, 14)
  returning id into v_cred;

  insert into public.factuur_regels
    (factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs, btw_pct, btw_regime, regelprijs, volgorde)
  values (v_cred, v_co, 'vast', 'KT-Creditregel 21%', 1, -100.00, 21, 'normaal', -100.00, 0);

  update public.facturen set gecrediteerd = true where id = v_fact;

  raise notice 'Leveranciers: 3 (2 volledig, 1 alleen naam)';
  raise notice 'Kosten: 3 met bon-scenario + 6 categorieen = 9';
  raise notice 'Facturen: KT-FACT-001 (21/9/verlegd) + KT-CRED-001';
end $$;
