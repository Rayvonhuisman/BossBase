-- =============================================================================
-- BossBase: RLS policies voor pipeline_stages
-- Bestand : supabase/migrations/004_pipeline_stages_rls.sql
-- Uitvoer : Handmatig in de Supabase SQL Editor uitvoeren
-- Veilig  : Alleen policies toevoegen/vervangen — geen data gaat verloren.
--
-- Achtergrond:
--   pipeline_stages heeft RLS ingeschakeld, maar mist INSERT/UPDATE/DELETE
--   policies voor gewone gebruikers. Hierdoor kan een admin geen fasen
--   aanmaken of aanpassen via de Instellingen-pagina.
-- =============================================================================

-- Zorg dat RLS aan staat (idempotent)
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
-- SELECT: alle leden van de company mogen fasen lezen
DROP POLICY IF EXISTS "pipeline_stages_select" ON pipeline_stages;
CREATE POLICY "pipeline_stages_select" ON pipeline_stages
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
-- INSERT: admins mogen nieuwe fasen aanmaken
DROP POLICY IF EXISTS "pipeline_stages_insert" ON pipeline_stages;
CREATE POLICY "pipeline_stages_insert" ON pipeline_stages
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
-- UPDATE: admins mogen fasen aanpassen
DROP POLICY IF EXISTS "pipeline_stages_update" ON pipeline_stages;
CREATE POLICY "pipeline_stages_update" ON pipeline_stages
  FOR UPDATE
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
-- DELETE: admins mogen fasen verwijderen
DROP POLICY IF EXISTS "pipeline_stages_delete" ON pipeline_stages;
CREATE POLICY "pipeline_stages_delete" ON pipeline_stages
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
-- Controleer resultaat:
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'pipeline_stages';
