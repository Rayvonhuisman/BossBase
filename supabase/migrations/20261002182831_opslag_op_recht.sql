-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (sec-publiek-opslag O5): factuur-PDF's en kostenbonnen
-- in de opslag waren leesbaar voor iedereen van het bedrijf, ook voor een
-- medewerker zonder het recht facturen of kosten (op Team). De tabellen zelf
-- schermen dat wél af; de bestanden liepen erachter aan.
--
-- Nu volgen de SELECT-policies dezelfde regel als facturen_select en de
-- kosten-policy: gedeelde werkruimte (Groei) of het recht (admin telt mee via
-- bb_is_admin_or_permission, inactieve accounts niet). Voor kostenbonnen telt
-- ook werkbonnen_bewerken mee, omdat die werkbonkosten mag zien (gemeten: 0
-- werkbonkosten met een bon, dus dat pad is nu leeg).
-- Upload/verwijderen blijven ongewijzigd (die gaan via de eigen INSERT/DELETE-
-- policies en de app).

begin;

drop policy if exists factuur_pdfs_select on storage.objects;
create policy factuur_pdfs_select on storage.objects for select to authenticated
  using (
    bucket_id = 'factuur-pdfs'
    and (storage.foldername(name))[1] = (public.current_user_company_id())::text
    and (select public.bb_gedeelde_werkruimte() or public.bb_is_admin_or_permission('facturen'))
  );

drop policy if exists kosten_bijlagen_select on storage.objects;
create policy kosten_bijlagen_select on storage.objects for select to authenticated
  using (
    bucket_id = 'kosten-bijlagen'
    and (storage.foldername(name))[1] = (public.current_user_company_id())::text
    and (select public.bb_gedeelde_werkruimte()
             or public.bb_is_admin_or_permission('kosten')
             or public.bb_has_permission('werkbonnen_bewerken'))
  );

notify pgrst, 'reload schema';

select policyname, roles::text from pg_policies
 where schemaname = 'storage' and policyname in ('factuur_pdfs_select', 'kosten_bijlagen_select');

commit;
