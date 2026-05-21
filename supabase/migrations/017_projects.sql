-- =============================================================================
-- BossBase: Projecten module
-- Bestand : supabase/migrations/017_projects.sql
-- Veilig  : Alleen IF NOT EXISTS / IDEMPOTENT statements.
--           Geen DROP, geen TRUNCATE, geen CASCADE op bestaande tabellen.
-- Opmerking nummering:
--   Het ontwikkelplan noemde 011_projects.sql, maar er bestaan al twee
--   migraties met nummer 011 (cron_moneybird_sync + klanten_moneybird_id).
--   Om volgordeproblemen te voorkomen krijgt deze migratie nummer 017
--   (na 016_pipeline_stages_dedupe_and_provision).
-- =============================================================================


-- =============================================================================
-- 0. HELPERS
--    Generieke updated_at trigger function. CREATE OR REPLACE is veilig:
--    bestaande triggers blijven werken, alleen de body wordt vervangen.
-- =============================================================================

CREATE OR REPLACE FUNCTION bb_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
-- =============================================================================
-- 1. PROJECTS
--    Centrale projecttabel: gekoppeld aan klant en optioneel aan deal/offerte.
--    Bedoeld als opvolger van een gewonnen deal of geaccepteerde offerte.
-- =============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id   UUID         REFERENCES customers(id) ON DELETE SET NULL,
  deal_id       UUID         REFERENCES deals(id) ON DELETE SET NULL,
  -- offerte_id verwijst naar offertes(id); offertes-tabel bestaat sinds 001.
  offerte_id    UUID         REFERENCES offertes(id) ON DELETE SET NULL,
  name          TEXT         NOT NULL,
  description   TEXT,
  status        TEXT         NOT NULL DEFAULT 'concept',
  project_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  quoted_hours  NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- used_hours wordt actueel berekend uit time_entries in de service-laag.
  -- Deze kolom is een optionele cache; UI gebruikt de live som.
  used_hours    NUMERIC(10,2) NOT NULL DEFAULT 0,
  start_date    DATE,
  deadline      DATE,
  owner_id      UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_by    UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_company
  ON projects (company_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer
  ON projects (customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_deal
  ON projects (deal_id);
CREATE INDEX IF NOT EXISTS idx_projects_offerte
  ON projects (offerte_id);
CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (company_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_deadline
  ON projects (company_id, deadline);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
-- INSERT / UPDATE: admin en planner mogen projecten beheren
DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );
DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );
-- DELETE: alleen admin
DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
DROP TRIGGER IF EXISTS projects_set_updated_at ON projects;
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();
-- =============================================================================
-- 2. TIME_ENTRIES
--    Urenregistraties per project. Naast de bestaande `urenregistratie`-tabel
--    omdat de Projecten-module een eigen, eenvoudiger model nodig heeft
--    (per-project, billable + tarief). De bestaande urenregistratie blijft
--    onaangetast en kan op termijn worden samengevoegd.
-- =============================================================================

CREATE TABLE IF NOT EXISTS time_entries (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  description  TEXT,
  hours        NUMERIC(10,2) NOT NULL DEFAULT 0,
  entry_date   DATE         NOT NULL DEFAULT current_date,
  billable     BOOLEAN      NOT NULL DEFAULT true,
  hourly_rate  NUMERIC(10,2),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_company
  ON time_entries (company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project
  ON time_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user
  ON time_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date
  ON time_entries (company_id, entry_date DESC);
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
-- SELECT: admin/planner zien alles; medewerkers alleen eigen regels
DROP POLICY IF EXISTS "time_entries_select" ON time_entries;
CREATE POLICY "time_entries_select" ON time_entries
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR user_id = auth.uid()
    )
  );
-- INSERT: iedereen mag eigen uren registreren; admin/planner ook namens anderen
DROP POLICY IF EXISTS "time_entries_insert" ON time_entries;
CREATE POLICY "time_entries_insert" ON time_entries
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "time_entries_update" ON time_entries;
CREATE POLICY "time_entries_update" ON time_entries
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR user_id = auth.uid()
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "time_entries_delete" ON time_entries;
CREATE POLICY "time_entries_delete" ON time_entries
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR user_id = auth.uid()
    )
  );
DROP TRIGGER IF EXISTS time_entries_set_updated_at ON time_entries;
CREATE TRIGGER time_entries_set_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();
-- =============================================================================
-- 3. PROJECT_NOTES
--    Vrije notities per project. Bewust geen koppeling aan de bestaande
--    `notes`-tabel om te voorkomen dat we daar schema-aanpassingen op moeten
--    doen. Indien gewenst kan dit later geconsolideerd worden.
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_notes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  note        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_notes_company
  ON project_notes (company_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_project
  ON project_notes (project_id);
ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_notes_select" ON project_notes;
CREATE POLICY "project_notes_select" ON project_notes
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "project_notes_insert" ON project_notes;
CREATE POLICY "project_notes_insert" ON project_notes
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "project_notes_update" ON project_notes;
CREATE POLICY "project_notes_update" ON project_notes
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      created_by = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "project_notes_delete" ON project_notes;
CREATE POLICY "project_notes_delete" ON project_notes
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      created_by = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    )
  );
DROP TRIGGER IF EXISTS project_notes_set_updated_at ON project_notes;
CREATE TRIGGER project_notes_set_updated_at
  BEFORE UPDATE ON project_notes
  FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();
-- =============================================================================
-- 4. FACTUREN.project_id
--    Veilige additieve uitbreiding: facturen kunnen optioneel aan een project
--    gekoppeld worden. ADD COLUMN IF NOT EXISTS is niet-destructief en volgt
--    hetzelfde patroon als 010_facturen_externe_referentie.sql.
--    project_invoices is daarmee overbodig en wordt NIET toegevoegd.
-- =============================================================================

ALTER TABLE facturen
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_facturen_project
  ON facturen (project_id);
