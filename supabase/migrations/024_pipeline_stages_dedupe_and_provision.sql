-- =============================================================================
-- 016_pipeline_stages_dedupe_and_provision.sql
--
-- Fixes the pipeline:
--   1. 003_seed_pipeline_stages.sql ran twice. There was no UNIQUE constraint,
--      so `ON CONFLICT DO NOTHING` was a no-op and every stage got inserted
--      twice → duplicate kanban columns, deals split across the twins.
--   2. New companies never get pipeline_stages (003 only seeded one hardcoded
--      company), so a fresh account opens an empty / broken pipeline.
--
-- Strategy (idempotent, non-destructive):
--   * Re-point any deal sitting on a duplicate stage to the canonical row
--     BEFORE removing duplicates → no deal loses its stage.
--   * Delete only the redundant duplicate rows (keep one per company+position).
--   * Add UNIQUE (company_id, position) so seeding is truly idempotent.
--   * Add a seed function + AFTER INSERT trigger on companies, and backfill
--     every existing company that has no stages.
--
-- Re-runnable: every step is guarded. No customer/deal data is deleted.
-- =============================================================================

-- 1. Re-point deals off duplicate stages onto the canonical stage ------------
WITH ranked AS (
  SELECT id, company_id, position,
         first_value(id) OVER (
           PARTITION BY company_id, position
           ORDER BY created_at, id
         ) AS keep_id
  FROM pipeline_stages
)
UPDATE deals d
SET stage_id = r.keep_id
FROM ranked r
WHERE d.stage_id = r.id
  AND r.id <> r.keep_id;

-- 2. Remove the now-redundant duplicate stage rows --------------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY company_id, position
           ORDER BY created_at, id
         ) AS rn
  FROM pipeline_stages
)
DELETE FROM pipeline_stages ps
USING ranked r
WHERE ps.id = r.id
  AND r.rn > 1;

-- 3. Prevent recurrence: one stage per (company_id, position) ---------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pipeline_stages_company_position_key'
  ) THEN
    ALTER TABLE pipeline_stages
      ADD CONSTRAINT pipeline_stages_company_position_key
      UNIQUE (company_id, position);
  END IF;
END;
$$;

-- 4. Per-company default-stage provisioning --------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages(p_company uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO pipeline_stages (company_id, name, position)
  SELECT p_company, s.name, s.position
  FROM (VALUES
    ('Nieuwe lead',        1),
    ('Contact nodig',      2),
    ('Info compleet',      3),
    ('Offerte maken',      4),
    ('Offerte verstuurd',  5),
    ('Wacht op akkoord',   6),
    ('Akkoord',            7),
    ('Gepland',            8),
    ('In uitvoering',      9),
    ('Afgerond',          10),
    ('Betaald / Gesloten',11),
    ('Verloren',          12)
  ) AS s(name, position)
  WHERE p_company IS NOT NULL
  ON CONFLICT (company_id, position) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_pipeline_stages()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.seed_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_seed_pipeline_stages ON companies;
CREATE TRIGGER companies_seed_pipeline_stages
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seed_pipeline_stages();

-- 5. Backfill any existing company that has no stages ----------------------
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    PERFORM public.seed_default_pipeline_stages(c.id);
  END LOOP;
END;
$$;
