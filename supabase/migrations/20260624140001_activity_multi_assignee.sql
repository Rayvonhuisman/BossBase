-- =============================================================================
-- 20260624140000_activity_multi_assignee.sql
--
-- Meerdere medewerkers aan één activiteit kunnen koppelen (zoals bij werkbonnen).
-- assigned_to blijft de "primaire" (= eerste) toegewezen medewerker.
-- =============================================================================

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS assigned_to_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE activities
SET assigned_to_ids = ARRAY[assigned_to]
WHERE assigned_to IS NOT NULL
  AND (assigned_to_ids IS NULL OR assigned_to_ids = '{}');

-- activities SELECT: medewerker ziet activiteiten waar hij primair óf in de lijst
-- staat; admin/planner/planning-recht zien alles.
DROP POLICY IF EXISTS "Users can view own company activities" ON activities;
CREATE POLICY "Users can view own company activities" ON activities
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
      OR auth.uid() = ANY(assigned_to_ids)
    )
  );

-- calendar_events SELECT: ook via de gekoppelde activiteit/werkbon nu de
-- volledige toewijzingslijst meenemen.
DROP POLICY IF EXISTS "Users can view own company calendar events" ON calendar_events;
CREATE POLICY "Users can view own company calendar events" ON calendar_events
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM activities a WHERE a.id = calendar_events.activiteit_id AND (a.assigned_to = auth.uid() OR auth.uid() = ANY(a.assigned_to_ids)))
      OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = calendar_events.werkbon_id AND (w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids)))
    )
  );
