-- =============================================================================
-- BossBase: Verloren-redenen (lost_reasons)
-- Bestand : supabase/migrations/20260708130000_lost_reasons.sql
--
-- Achtergrond:
--   De pipeline liet al een "Markeer als verloren"-modal zien met een
--   HARDCODED lijst redenen, maar (1) de gekozen reden werd nergens opgeslagen
--   en (2) de lijst was niet per bedrijf instelbaar. Deze migratie voegt een
--   company-scoped, instelbare lijst toe — exact volgens het pipeline_stages-
--   patroon (RLS + seed-functie + AFTER INSERT trigger + backfill) — plus een
--   deals.lost_reason kolom waarin de gekozen reden bewaard blijft.
--
-- Veilig / idempotent:
--   * Alleen nieuwe tabel + nieuwe (nullable) kolom + policies/functies.
--   * Geen bestaande data wordt gewijzigd of verwijderd.
--   * Re-runnable: elke stap is guarded (IF NOT EXISTS / ON CONFLICT / DROP..).
-- =============================================================================

-- 1. Tabel -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lost_reasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label      text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lost_reasons_company_idx ON public.lost_reasons(company_id);

-- Eén reden-label per bedrijf → maakt seeden idempotent (ON CONFLICT DO NOTHING).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lost_reasons_company_label_key'
  ) THEN
    ALTER TABLE public.lost_reasons
      ADD CONSTRAINT lost_reasons_company_label_key UNIQUE (company_id, label);
  END IF;
END;
$$;

-- 2. RLS ---------------------------------------------------------------------
-- Zelfde policy-vorm als pipeline_stages: iedereen in de company mag lezen,
-- alleen admins mogen muteren.
ALTER TABLE public.lost_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lost_reasons_select" ON public.lost_reasons;
CREATE POLICY "lost_reasons_select" ON public.lost_reasons
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "lost_reasons_insert" ON public.lost_reasons;
CREATE POLICY "lost_reasons_insert" ON public.lost_reasons
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "lost_reasons_update" ON public.lost_reasons;
CREATE POLICY "lost_reasons_update" ON public.lost_reasons
  FOR UPDATE
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "lost_reasons_delete" ON public.lost_reasons;
CREATE POLICY "lost_reasons_delete" ON public.lost_reasons
  FOR DELETE USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 3. Standaardredenen per bedrijf provisionen -------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_lost_reasons(p_company uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.lost_reasons (company_id, label, position)
  SELECT p_company, s.label, s.position
  FROM (VALUES
    ('Te duur',                 0),
    ('Gekozen voor concurrent', 1),
    ('Geen reactie',            2),
    ('Timing niet goed',        3),
    ('Anders',                  4)
  ) AS s(label, position)
  WHERE p_company IS NOT NULL
  ON CONFLICT (company_id, label) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_lost_reasons()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.seed_default_lost_reasons(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_seed_lost_reasons ON public.companies;
CREATE TRIGGER companies_seed_lost_reasons
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seed_lost_reasons();

-- Backfill: elk bestaand bedrijf krijgt de standaardredenen.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_default_lost_reasons(c.id);
  END LOOP;
END;
$$;

-- 4. deals.lost_reason -------------------------------------------------------
-- We bewaren het reden-LABEL (tekst), niet een FK: zo blijft de reden leesbaar
-- ook als een bedrijf de reden later hernoemt of verwijdert (audit-waarde).
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS lost_reason text;
COMMENT ON COLUMN public.deals.lost_reason IS 'Reden waarom de lead/deal verloren is (label uit lost_reasons, als tekst bewaard).';
