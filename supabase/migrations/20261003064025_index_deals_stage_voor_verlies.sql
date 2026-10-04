-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Eindhertest audit 2026-10-01 (H14): de kolom deals.stage_voor_verlies (fix-ronde,
-- heropenen naar de fase van vóór het verlies) kreeg een foreign key zonder
-- index. De advisor meldde hem als enige unindexed_foreign_key. Alleen toevoegend.

create index if not exists idx_deals_stage_voor_verlies on public.deals (stage_voor_verlies);

notify pgrst, 'reload schema';

select count(*) as fk_zonder_index_moet_0
  from pg_constraint c
 where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
   and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]);
