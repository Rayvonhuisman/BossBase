-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Migratie 20260919220742 opende facturen en offertes voor de gedeelde
-- werkruimte (Groei: iedereen ziet alles), maar niet hun regels. Een medewerker
-- op Groei zag daardoor een factuur of offerte zonder regels; een PDF of
-- herberekening vanuit zijn sessie was leeg (audit 2026-10-01, sec-rollen 6:
-- facturen 164 zichtbaar, factuur_regels 0).
--
-- De SELECT op de regels volgt nu precies de SELECT op de kop. Schrijven blijft
-- ongewijzigd aan het recht gekoppeld.

begin;

drop policy if exists factuur_regels_select on public.factuur_regels;
create policy factuur_regels_select on public.factuur_regels for select
  using ((company_id = current_company_id()) and (select (bb_gedeelde_werkruimte() or bb_has_permission('facturen'::text))));

drop policy if exists offerte_items_select on public.offerte_items;
create policy offerte_items_select on public.offerte_items for select
  using ((company_id = current_company_id()) and (select (bb_gedeelde_werkruimte() or bb_has_permission('offertes'::text))));

notify pgrst, 'reload schema';

select tablename, policyname, qual from pg_policies
 where tablename in ('factuur_regels', 'offerte_items') and cmd = 'SELECT';

commit;
