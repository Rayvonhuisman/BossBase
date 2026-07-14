-- Gedeelde agenda bij Groei
-- ──────────────────────────────────────────────────────────────────────────────
-- Groei (1-2 personen, geen planning-pagina) is een gedeelde werkomgeving: beide
-- teamleden zien elkaars agenda-items (calendar_events, werkbonnen, activiteiten)
-- en kunnen werkbonnen op naam van de ander of samen inplannen.
--
-- We breiden de bestaande SELECT-policies (en werkbonnen UPDATE, nodig om een
-- werkbon in te plannen) uit met één extra tak: `get_company_tier() = 'groei'`.
-- Dat is dezelfde tier-bron als de frontend (useTier / get_company_tier) — geen
-- parallel systeem. Starter en Team veranderen niet: voor hen geeft
-- get_company_tier() 'starter'/'team' en valt de tak weg, dus de bestaande
-- rol/eigenaarschap-regels blijven onverkort gelden.

-- ── calendar_events: SELECT ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own company calendar events" ON calendar_events;
CREATE POLICY "Users can view own company calendar events" ON calendar_events
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      get_company_tier() = 'groei'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM activities a WHERE a.id = calendar_events.activiteit_id AND (a.assigned_to = auth.uid() OR auth.uid() = ANY(a.assigned_to_ids)))
      OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = calendar_events.werkbon_id AND (w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids)))
    )
  );

-- ── activities: SELECT ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own company activities" ON activities;
CREATE POLICY "Users can view own company activities" ON activities
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      get_company_tier() = 'groei'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
      OR auth.uid() = ANY(assigned_to_ids)
    )
  );

-- ── werkbonnen: SELECT ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "werkbonnen_select" ON werkbonnen;
CREATE POLICY "werkbonnen_select" ON werkbonnen
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      get_company_tier() = 'groei'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.permission = 'planning' AND up.granted = true)
      OR assigned_to = auth.uid()
      OR auth.uid() = ANY(assigned_to_ids)
    )
  );

-- ── werkbonnen: UPDATE (nodig om vanuit de agenda in te plannen bij Groei) ─────
DROP POLICY IF EXISTS "werkbonnen_update" ON werkbonnen;
CREATE POLICY "werkbonnen_update" ON werkbonnen
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      get_company_tier() = 'groei'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR auth.uid() = ANY(verantwoordelijke_ids)
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      get_company_tier() = 'groei'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR auth.uid() = ANY(verantwoordelijke_ids)
    )
  );
