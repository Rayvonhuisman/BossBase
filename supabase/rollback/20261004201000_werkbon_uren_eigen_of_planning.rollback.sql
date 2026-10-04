-- ── Terugdraaien van 20261004201000_werkbon_uren_eigen_of_planning ─────────
-- Zet select en delete op werkbon_uren terug zoals ze op 4-10-2026 stonden.
-- LET OP: daarmee leest elke medewerker weer de werkbonuren van alle collega's.
begin;

alter policy "werkbon_uren_delete" on public.werkbon_uren
  using (((company_id = current_company_id()) AND bb_mag_werkbon_uren_beheren(werkbon_id)));

--
alter policy "werkbon_uren_select" on public.werkbon_uren
  using ((company_id = current_company_id()));

comment on policy werkbon_uren_select on public.werkbon_uren is null;

select policyname, qual from pg_policies
 where tablename = 'werkbon_uren' and policyname in ('werkbon_uren_select', 'werkbon_uren_delete');

commit;

notify pgrst, 'reload schema';
