-- Prullenbak: UPDATE-policy erbij, zodat een upsert die op een conflict landt
-- niet omvalt.
--
-- negeerBijImport() schrijft met een upsert (ON CONFLICT DO UPDATE) op de
-- sleutel (company_id, provider, soort, externe_id). Bestaat die rij al, dan
-- voert Postgres een UPDATE uit — en daar had import_genegeerd geen policy
-- voor. Alleen select, insert en delete waren geregeld in
-- 20260827120000_import_uitbreiding.sql. Het gevolg is geen nette weigering
-- maar een harde fout:
--
--   ERROR 42501: new row violates row-level security policy (USING expression)
--                for table "import_genegeerd"
--
-- Geverifieerd op 28-08-2026 met een probe als rol `authenticated` binnen een
-- transactie die daarna is teruggedraaid.
--
-- Wanneer dat gebeurt: één inkoopfactuur uit SnelStart komt binnen als
-- meerdere kostenregels (snelstart_<factuur>_<n>), terwijl de prullenbak op het
-- FACTUURnummer werkt. Gooi je een tweede regel van dezelfde factuur weg, dan
-- bestaat de prullenbakregel al en loopt de upsert op het conflict.
--
-- De uitkomst bleef tot nu toe toevallig goed — de bestaande rij onderdrukt de
-- factuur immers al — maar de fout werd nergens gelezen. Samen met de
-- foutafhandeling in negeerBijImport() (die de melding nu wél toont) is dit het
-- soort fout dat je anders nooit ziet.
--
-- Rechten: gelijk aan de insert-policy. Wie iets mag verwijderen mag de
-- prullenbak bijwerken; die volgt gewoon die handeling. Leegmaken (= "Alles
-- opnieuw ophalen") blijft een admin-beslissing en houdt zijn eigen policy.

drop policy if exists import_genegeerd_update on public.import_genegeerd;
create policy import_genegeerd_update on public.import_genegeerd
  for update
  using (company_id = current_company_id())
  with check (company_id = current_company_id());
