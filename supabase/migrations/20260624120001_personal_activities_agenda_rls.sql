-- =============================================================================
-- 20260624120000_personal_activities_agenda_rls.sql
--
-- Persoonlijke scheiding van activiteiten en agenda.
--
-- - Een medewerker mag via de API alleen ZIJN EIGEN activiteiten en agenda-items
--   ophalen (assigned_to = zichzelf). Admin/planner zien alles (nodig voor de
--   Planning-pagina = team-dispatch en het team-overzicht van activiteiten).
-- - werkbonnen waren al zo gescoped (001_add_operations_modules.sql).
--
-- De "persoonlijke agenda is alleen eigen, óók voor admin" gebeurt aanvullend
-- app-side (de Agenda-weergave filtert op de ingelogde gebruiker), omdat admin
-- via RLS juist alles MAG zien voor de Planning/Activiteiten-pagina.
-- =============================================================================

-- 1. calendar_events: persoonlijke eigenaar toevoegen + backfillen ------------
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Bestaande gekoppelde agenda-items erven de eigenaar van hun activiteit/werkbon.
UPDATE calendar_events ce
SET assigned_to = a.assigned_to
FROM activities a
WHERE ce.activiteit_id = a.id AND ce.assigned_to IS NULL AND a.assigned_to IS NOT NULL;

UPDATE calendar_events ce
SET assigned_to = w.assigned_to
FROM werkbonnen w
WHERE ce.werkbon_id = w.id AND ce.assigned_to IS NULL AND w.assigned_to IS NOT NULL;

-- 2. activities: medewerker alleen eigen, admin/planner alles -----------------
DROP POLICY IF EXISTS "Users can view own company activities" ON activities;
CREATE POLICY "Users can view own company activities" ON activities
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
    )
  );

-- 2b. werkbonnen: was al eigen-only voor medewerker, maar de escape keek alleen
--     naar role. Een medewerker MET planning-recht (de nieuwe "planner") moet
--     ook het hele team zien op de Planning-pagina → planning-recht toevoegen.
DROP POLICY IF EXISTS "werkbonnen_select" ON werkbonnen;
CREATE POLICY "werkbonnen_select" ON werkbonnen
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
    )
  );

-- 3. calendar_events: medewerker alleen eigen (direct toegewezen óf via de
--    gekoppelde activiteit/werkbon), admin/planner alles ----------------------
DROP POLICY IF EXISTS "Users can view own company calendar events" ON calendar_events;
CREATE POLICY "Users can view own company calendar events" ON calendar_events
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM activities a WHERE a.id = calendar_events.activiteit_id AND a.assigned_to = auth.uid())
      OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = calendar_events.werkbon_id AND w.assigned_to = auth.uid())
    )
  );
