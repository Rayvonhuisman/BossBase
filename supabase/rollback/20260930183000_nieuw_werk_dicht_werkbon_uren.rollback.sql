-- ── Terugdraaien van 20260930183000_nieuw_werk_dicht_werkbon_uren ───────────
-- Haalt alleen de restrictive INSERT-policy weg. Geen data.
begin;
drop policy if exists readonly_werkbon_uren on public.werkbon_uren;
select count(*) as over from pg_policies where tablename = 'werkbon_uren' and policyname = 'readonly_werkbon_uren';
commit;
notify pgrst, 'reload schema';
