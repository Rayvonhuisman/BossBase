-- Notitielogboek voor werkbonnen en activiteiten.
--
-- Tot nu toe hadden beide één tekstkolom (werkbonnen.werkbon_notities en
-- activities.notes) die bij elke opslag werd overschreven — geen log, geen
-- tijdstempel per notitie, geen auteur. Deze migratie geeft ze losse rijen,
-- exact volgens het patroon van project_notes.
--
-- De oude tekstkolommen blijven bewust staan: de bestaande tekst wordt
-- hieronder overgenomen als eerste logregel, maar we droppen niets zolang de
-- log niet in productie bevestigd is.

-- =============================================================================
-- WERKBON_NOTITIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS werkbon_notities (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  werkbon_id  UUID         NOT NULL REFERENCES werkbonnen(id) ON DELETE CASCADE,
  created_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  note        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_werkbon_notities_company
  ON werkbon_notities (company_id);
CREATE INDEX IF NOT EXISTS idx_werkbon_notities_werkbon
  ON werkbon_notities (werkbon_id);
ALTER TABLE werkbon_notities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "werkbon_notities_select" ON werkbon_notities;
CREATE POLICY "werkbon_notities_select" ON werkbon_notities
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "werkbon_notities_insert" ON werkbon_notities;
CREATE POLICY "werkbon_notities_insert" ON werkbon_notities
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "werkbon_notities_update" ON werkbon_notities;
CREATE POLICY "werkbon_notities_update" ON werkbon_notities
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      created_by = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "werkbon_notities_delete" ON werkbon_notities;
CREATE POLICY "werkbon_notities_delete" ON werkbon_notities
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      created_by = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    )
  );
DROP TRIGGER IF EXISTS werkbon_notities_set_updated_at ON werkbon_notities;
CREATE TRIGGER werkbon_notities_set_updated_at
  BEFORE UPDATE ON werkbon_notities
  FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();

-- =============================================================================
-- ACTIVITEIT_NOTITIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS activiteit_notities (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  activity_id  UUID         NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  created_by   UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  note         TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activiteit_notities_company
  ON activiteit_notities (company_id);
CREATE INDEX IF NOT EXISTS idx_activiteit_notities_activity
  ON activiteit_notities (activity_id);
ALTER TABLE activiteit_notities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activiteit_notities_select" ON activiteit_notities;
CREATE POLICY "activiteit_notities_select" ON activiteit_notities
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "activiteit_notities_insert" ON activiteit_notities;
CREATE POLICY "activiteit_notities_insert" ON activiteit_notities
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "activiteit_notities_update" ON activiteit_notities;
CREATE POLICY "activiteit_notities_update" ON activiteit_notities
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      created_by = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS "activiteit_notities_delete" ON activiteit_notities;
CREATE POLICY "activiteit_notities_delete" ON activiteit_notities
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      created_by = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    )
  );
DROP TRIGGER IF EXISTS activiteit_notities_set_updated_at ON activiteit_notities;
CREATE TRIGGER activiteit_notities_set_updated_at
  BEFORE UPDATE ON activiteit_notities
  FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();

-- =============================================================================
-- BACKFILL — bestaande tekst wordt de eerste logregel
-- =============================================================================
-- Aanpak: in de migratie zelf, niet als los script. Zo kan de log nooit live
-- gaan zonder dat de oude tekst mee is. created_by blijft NULL — wie de tekst
-- ooit schreef is niet te herleiden; de UI toont dan "Onbekend".
-- created_at = de aanmaakdatum van de werkbon/activiteit, als benadering.
-- De NOT EXISTS-guard maakt herhaald draaien onschadelijk.

INSERT INTO werkbon_notities (company_id, werkbon_id, note, created_at, updated_at)
SELECT w.company_id, w.id, btrim(w.werkbon_notities), w.created_at, w.created_at
FROM werkbonnen w
WHERE coalesce(btrim(w.werkbon_notities), '') <> ''
  AND w.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM werkbon_notities n WHERE n.werkbon_id = w.id
  );

INSERT INTO activiteit_notities (company_id, activity_id, note, created_at, updated_at)
SELECT a.company_id, a.id, btrim(a.notes), a.created_at, a.created_at
FROM activities a
WHERE coalesce(btrim(a.notes), '') <> ''
  AND a.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM activiteit_notities n WHERE n.activity_id = a.id
  );
