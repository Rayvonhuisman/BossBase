-- =============================================================================
-- NOODREM — zet read-only in één keer uit.
--
-- Draai dit als blijkt dat accounts ten onrechte op read-only staan. Het haalt
-- alleen de afdwinging weg; de helpers (bb_is_readonly, bb_readonly_reden) en de
-- stand in get_plan_status() blijven staan, zodat de banner nog klopt en je
-- rustig kunt uitzoeken wat er misging.
--
--   supabase db query --linked "$(cat supabase/rollback/disable_readonly.sql)"
--
-- Terugzetten: supabase/migrations/20260803120000_readonly.sql opnieuw draaien —
-- die is idempotent.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS readonly_customers           ON public.customers;
DROP POLICY IF EXISTS readonly_deals               ON public.deals;
DROP POLICY IF EXISTS readonly_offertes            ON public.offertes;
DROP POLICY IF EXISTS readonly_offerte_items       ON public.offerte_items;
DROP POLICY IF EXISTS readonly_facturen            ON public.facturen;
DROP POLICY IF EXISTS readonly_factuur_regels      ON public.factuur_regels;
DROP POLICY IF EXISTS readonly_werkbonnen          ON public.werkbonnen;
DROP POLICY IF EXISTS readonly_werkbon_taken       ON public.werkbon_taken;
DROP POLICY IF EXISTS readonly_werkbon_materialen  ON public.werkbon_materialen;
DROP POLICY IF EXISTS readonly_werkbon_meerwerk    ON public.werkbon_meerwerk;
DROP POLICY IF EXISTS readonly_werkbon_fotos       ON public.werkbon_fotos;
DROP POLICY IF EXISTS readonly_calendar_events     ON public.calendar_events;
DROP POLICY IF EXISTS readonly_activities          ON public.activities;
DROP POLICY IF EXISTS readonly_projects            ON public.projects;
DROP POLICY IF EXISTS readonly_urenregistratie     ON public.urenregistratie;
DROP POLICY IF EXISTS readonly_job_costs           ON public.job_costs;
DROP POLICY IF EXISTS readonly_notes               ON public.notes;
DROP POLICY IF EXISTS readonly_project_notes       ON public.project_notes;
DROP POLICY IF EXISTS readonly_activiteit_notities ON public.activiteit_notities;
DROP POLICY IF EXISTS readonly_werkbon_notities    ON public.werkbon_notities;
DROP POLICY IF EXISTS readonly_voertuigen          ON public.voertuigen;
DROP POLICY IF EXISTS readonly_company_members     ON public.company_members;
DROP POLICY IF EXISTS readonly_uploads             ON storage.objects;

DROP TRIGGER IF EXISTS trg_readonly_offerte_versturen ON public.offertes;
DROP TRIGGER IF EXISTS trg_readonly_factuur_versturen ON public.facturen;

COMMIT;
