-- =============================================================================
-- 20260728121000_upgrade_requests.sql
--
-- Aanhaakpunt voor de upgradeflow. Fase 1 legt alleen de wens vast (welk tier /
-- welke modules, en wat de aanleiding was — bv. "klantlimiet bereikt"). Fase 2
-- hangt hier Stripe Billing achter; de frontend-aanroep verandert dan niet.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.upgrade_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  aangevraagd_door uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  gewenst_plan     text,
  gewenste_modules text[] NOT NULL DEFAULT '{}',
  aanleiding       text,
  status           text NOT NULL DEFAULT 'open',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upgrade_requests_company
  ON public.upgrade_requests (company_id, created_at DESC);

ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- De aanvrager wordt server-side gezet; de client kan hem niet vervalsen.
CREATE OR REPLACE FUNCTION public.bb_set_upgrade_request_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.aangevraagd_door := auth.uid();
  NEW.status := 'open';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upgrade_request_author ON public.upgrade_requests;
CREATE TRIGGER trg_upgrade_request_author BEFORE INSERT ON public.upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.bb_set_upgrade_request_author();

DROP POLICY IF EXISTS upgrade_requests_select ON public.upgrade_requests;
CREATE POLICY upgrade_requests_select ON public.upgrade_requests FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Alleen de admin van het bedrijf kan een upgrade aanvragen (het is een
-- facturatiehandeling).
DROP POLICY IF EXISTS upgrade_requests_insert ON public.upgrade_requests;
CREATE POLICY upgrade_requests_insert ON public.upgrade_requests FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

COMMIT;
