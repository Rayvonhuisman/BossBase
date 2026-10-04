-- ── Terugdraaien van 20261004190000_groei_rollen_rechten ────────────────────
-- Haalt rollen_rechten weer bij Groei weg en zet de twee policies op
-- user_permissions terug zoals ze op 4-10-2026 in de catalogus stonden.
--
-- Volgorde: NIET terugdraaien zolang 20261004200000 nog staat; dan heeft de
-- tweede persoon in een Groei-bedrijf geen financiele inzage en kan de
-- beheerder die ook niet geven. Rechten die intussen zijn toegekend blijven
-- staan en blijven werken.
begin;

delete from public.plan_features where plan = 'groei' and feature = 'rollen_rechten';

alter policy "permissions_admin_insert" on public.user_permissions
  with check (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

alter policy "permissions_admin_update" on public.user_permissions
  using (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  with check (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

select (select string_agg(plan, ',' order by plan) from public.plan_features
         where feature = 'rollen_rechten') as rollen_rechten_in;

commit;

notify pgrst, 'reload schema';
