-- =============================================================================
-- disable_plan_gates.sql — NOODREM
--
-- Zet in één keer ALLE abonnements-gates uit: de restrictive RLS-policies én de
-- triggers die op een feature controleren. Daarna blokkeert de abonnementsmatrix
-- niets meer; iedereen kan weer alles aanmaken.
--
-- Wat dit NIET doet, en bewust niet:
--   • het rechtensysteem aanraken (bb_has_permission-policies blijven staan) —
--     dat is de echte beveiliging en die moet nooit meevallen met een noodrem;
--   • tabellen, functies of data weggooien. De matrix, het ledger en de
--     helperfuncties blijven bestaan, dus er gaat geen verbruik verloren en de
--     UI blijft de stand kunnen lezen.
--
-- Draaien:
--   supabase db query --linked -f supabase/rollback/disable_plan_gates.sql
--
-- Terugzetten: draai migratie 20260728120000_plan_matrix.sql opnieuw; die maakt
-- alle policies en triggers idempotent opnieuw aan.
-- =============================================================================

BEGIN;

-- ── Limiet-gates ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS plan_limiet_klanten     ON public.customers;
DROP POLICY IF EXISTS plan_limiet_offertes    ON public.offertes;
DROP POLICY IF EXISTS plan_limiet_facturen    ON public.facturen;
DROP POLICY IF EXISTS plan_limiet_gebruikers  ON public.company_members;

-- ── Feature-gates (RLS) ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS plan_feature_voertuigen_insert   ON public.voertuigen;
DROP POLICY IF EXISTS plan_feature_voertuigen_update   ON public.voertuigen;
DROP POLICY IF EXISTS plan_feature_eigen_templates     ON public.email_templates;
DROP POLICY IF EXISTS plan_feature_kosten              ON public.job_costs;
DROP POLICY IF EXISTS plan_feature_boekhouding_insert  ON public.accounting_connections;
DROP POLICY IF EXISTS plan_feature_boekhouding_update  ON public.accounting_connections;
DROP POLICY IF EXISTS plan_feature_btw                 ON public.btw_periodes;
DROP POLICY IF EXISTS plan_feature_rechten_insert      ON public.user_permissions;
DROP POLICY IF EXISTS plan_feature_rechten_update      ON public.user_permissions;
DROP POLICY IF EXISTS plan_feature_rechten_delete      ON public.user_permissions;

-- ── Feature-gates (triggers die een fout opgooien) ───────────────────────────
DROP TRIGGER IF EXISTS trg_werkbon_voertuig_feature ON public.werkbonnen;
DROP TRIGGER IF EXISTS trg_accounting_feature       ON public.accounting_connections;
DROP TRIGGER IF EXISTS trg_herinnering_feature      ON public.facturen;
DROP TRIGGER IF EXISTS trg_handtekening_feature     ON public.offertes;

-- De verbruikstriggers blijven WEL staan: die blokkeren niets, ze tellen alleen.
-- Zo loopt de teller door en klopt de stand nog als je de gates weer aanzet.

COMMIT;

-- Controle: hierna hoort restrictive_gates 0 te zijn.
SELECT
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'plan\_limiet\_%') AS limiet_gates,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'plan\_feature\_%'
      AND permissive = 'RESTRICTIVE')                                 AS feature_gates,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('trg_werkbon_voertuig_feature', 'trg_accounting_feature',
                     'trg_herinnering_feature', 'trg_handtekening_feature'))
                                                                      AS feature_triggers;
