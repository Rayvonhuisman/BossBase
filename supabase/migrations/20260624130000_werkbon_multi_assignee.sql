-- =============================================================================
-- 20260624130000_werkbon_multi_assignee.sql
--
-- Meerdere medewerkers aan één werkbon kunnen koppelen.
--
-- - Nieuwe kolom assigned_to_ids uuid[] houdt de volledige set toegewezen
--   medewerkers vast.
-- - assigned_to blijft bestaan als "primaire" medewerker (= eerste in de lijst)
--   voor o.a. de kleur/legenda in de planning en bestaande logica.
-- - RLS: een medewerker ziet een werkbon als hij de primaire OF één van de
--   toegewezen medewerkers is (admin/planner/planning-recht zien alles).
-- =============================================================================

ALTER TABLE werkbonnen
  ADD COLUMN IF NOT EXISTS assigned_to_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill: bestaande enkele toewijzing → array.
UPDATE werkbonnen
SET assigned_to_ids = ARRAY[assigned_to]
WHERE assigned_to IS NOT NULL
  AND (assigned_to_ids IS NULL OR assigned_to_ids = '{}');

-- RLS: array-lidmaatschap meenemen in de bestaande eigen-only-policy.
DROP POLICY IF EXISTS "werkbonnen_select" ON werkbonnen;
CREATE POLICY "werkbonnen_select" ON werkbonnen
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
      OR auth.uid() = ANY(assigned_to_ids)
    )
  );
