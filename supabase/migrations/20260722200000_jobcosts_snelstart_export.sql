-- =============================================================================
-- BossBase: handmatige kosten exporteren naar SnelStart (inkoopboekingen)
-- Bestand : supabase/migrations/20260722200000_jobcosts_snelstart_export.sql
--
-- job_costs.snelstart_id = id van de aangemaakte inkoopboeking in SnelStart
-- (zelfde patroon als facturen.snelstart_id): maakt de export idempotent.
-- Alleen handmatige kosten (externe_referentie is null) komen in aanmerking.
-- =============================================================================

alter table public.job_costs add column if not exists snelstart_id text;
