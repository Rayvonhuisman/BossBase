-- =============================================================================
-- BossBase: Fix deals foreign keys + RLS policies
-- Bestand : supabase/migrations/002_fix_deals_fk_and_rls.sql
-- Uitvoer : Handmatig in de Supabase SQL Editor
-- Veilig  : Geen DROP TABLE, TRUNCATE of destructieve DELETE.
--           Alleen constraints toevoegen als er geen orphan rows zijn.
--           Policies worden veilig vervangen via DROP POLICY IF EXISTS.
-- =============================================================================


-- =============================================================================
-- STAP 1: ORPHAN CHECKS
-- Voer deze SELECT-queries handmatig uit om te verifiëren of FK's veilig
-- toegevoegd kunnen worden. Als een query rijen teruggeeft, los die eerst op.
-- =============================================================================

-- 1A. Orphan deals: customer_id gevuld maar klant bestaat niet in customers
--     Als dit rijen teruggeeft: los op via UPDATE deals SET customer_id = NULL WHERE ...
--     (zie de veilige optionele sectie onderaan dit bestand)
SELECT d.id, d.customer_id, d.title
FROM deals d
LEFT JOIN customers c ON c.id = d.customer_id
WHERE d.customer_id IS NOT NULL
  AND c.id IS NULL;

-- 1B. Orphan deals: company_id gevuld maar bedrijf bestaat niet in companies
SELECT d.id, d.company_id, d.title
FROM deals d
LEFT JOIN companies c ON c.id = d.company_id
WHERE d.company_id IS NOT NULL
  AND c.id IS NULL;

-- 1C. Orphan deals: stage_id gevuld maar fase bestaat niet in pipeline_stages
SELECT d.id, d.stage_id, d.title
FROM deals d
LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
WHERE d.stage_id IS NOT NULL
  AND ps.id IS NULL;


-- =============================================================================
-- STAP 2: FK CONSTRAINT — deals.customer_id → customers.id
-- Wordt ALLEEN toegevoegd als de constraint nog niet bestaat.
-- Voer dit pas uit nadat stap 1A geen rijen heeft teruggegeven.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_deals_customer'
      AND table_name = 'deals'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT fk_deals_customer
      FOREIGN KEY (customer_id)
      REFERENCES customers(id)
      ON DELETE SET NULL;
    RAISE NOTICE 'FK fk_deals_customer toegevoegd.';
  ELSE
    RAISE NOTICE 'FK fk_deals_customer bestaat al, overgeslagen.';
  END IF;
END $$;


-- =============================================================================
-- STAP 3: FK CONSTRAINT — deals.company_id → companies.id
-- Wordt ALLEEN toegevoegd als de constraint nog niet bestaat.
-- Voer dit pas uit nadat stap 1B geen rijen heeft teruggegeven.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_deals_company'
      AND table_name = 'deals'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT fk_deals_company
      FOREIGN KEY (company_id)
      REFERENCES companies(id)
      ON DELETE CASCADE;
    RAISE NOTICE 'FK fk_deals_company toegevoegd.';
  ELSE
    RAISE NOTICE 'FK fk_deals_company bestaat al, overgeslagen.';
  END IF;
END $$;


-- =============================================================================
-- STAP 4: FK CONSTRAINT — deals.stage_id → pipeline_stages.id
-- Wordt ALLEEN toegevoegd als de constraint nog niet bestaat.
-- Voer dit pas uit nadat stap 1C geen rijen heeft teruggegeven.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_deals_stage'
      AND table_name = 'deals'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT fk_deals_stage
      FOREIGN KEY (stage_id)
      REFERENCES pipeline_stages(id)
      ON DELETE SET NULL;
    RAISE NOTICE 'FK fk_deals_stage toegevoegd.';
  ELSE
    RAISE NOTICE 'FK fk_deals_stage bestaat al, overgeslagen.';
  END IF;
END $$;


-- =============================================================================
-- STAP 5: RLS POLICIES — deals
-- Vervangt bestaande policies veilig via DROP POLICY IF EXISTS.
-- Alleen policies worden vervangen, geen data.
-- Stijl identiek aan customers, activities en andere tabellen in dit project.
-- =============================================================================

-- Zorg dat RLS aan staat op de deals tabel
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- SELECT: leden van dezelfde company mogen deals lezen
DROP POLICY IF EXISTS "deals_select" ON deals;
CREATE POLICY "deals_select" ON deals
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- INSERT: leden van dezelfde company mogen deals aanmaken
DROP POLICY IF EXISTS "deals_insert" ON deals;
CREATE POLICY "deals_insert" ON deals
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- UPDATE: leden mogen eigen company-deals aanpassen, company_id mag niet veranderen
DROP POLICY IF EXISTS "deals_update" ON deals;
CREATE POLICY "deals_update" ON deals
  FOR UPDATE
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- DELETE: alleen admins mogen deals verwijderen
DROP POLICY IF EXISTS "deals_delete" ON deals;
CREATE POLICY "deals_delete" ON deals
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );


-- =============================================================================
-- OPTIONELE VEILIGE OPRUIM-STATEMENTS (standaard uitgecommentarieerd)
-- Activeer alleen als de orphan checks hierboven rijen teruggeven.
-- Controleer de output van stap 1A/1B/1C voordat je dit uitvoert.
-- =============================================================================

-- Veilige NULL-reset voor orphan deals (klant bestaat niet meer):
-- UPDATE deals SET customer_id = NULL
-- WHERE customer_id IS NOT NULL
--   AND customer_id NOT IN (SELECT id FROM customers);

-- Veilige NULL-reset voor orphan stage_id:
-- UPDATE deals SET stage_id = NULL
-- WHERE stage_id IS NOT NULL
--   AND stage_id NOT IN (SELECT id FROM pipeline_stages);
