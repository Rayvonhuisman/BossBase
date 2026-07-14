-- Bewerkrecht op agenda-items (calendar_events) op basis van herkomst
-- ──────────────────────────────────────────────────────────────────────────────
-- Regel (server-side afgedwongen, niet alleen knoppen):
--   • herkomst = 'planning'  → alleen admin/planner (of iemand met het
--                              'planning'-recht) mag wijzigen/verwijderen.
--                              Een gewone medewerker kan het item wél zien
--                              (SELECT-policy blijft ongewijzigd), maar niet muteren.
--   • herkomst = 'zelf'      → de eigenaar (assigned_to) mag zijn eigen item
--                              wijzigen/verwijderen; admin/planner uiteraard ook.
--
-- Sluit aan op het werkbon-RLS-patroon "rol-check OR eigenaarschap" en hergebruikt
-- de bestaande helper bb_has_permission('planning') (= role in (admin,planner) OR
-- user_permissions 'planning' granted) — dezelfde privilege-bron als de calendar
-- SELECT-policy en de frontend (usePermissions().can('planning')). Geen parallel
-- systeem. SELECT/INSERT blijven ongewijzigd.

-- ── UPDATE ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own company calendar events" ON calendar_events;
CREATE POLICY "Users can update own company calendar events" ON calendar_events
  FOR UPDATE
  USING (
    company_id = current_company_id()
    AND (
      bb_has_permission('planning')
      OR (herkomst <> 'planning' AND assigned_to = auth.uid())
    )
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (
      bb_has_permission('planning')
      OR (herkomst <> 'planning' AND assigned_to = auth.uid())
    )
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can delete own company calendar events" ON calendar_events;
CREATE POLICY "Users can delete own company calendar events" ON calendar_events
  FOR DELETE
  USING (
    company_id = current_company_id()
    AND (
      bb_has_permission('planning')
      OR (herkomst <> 'planning' AND assigned_to = auth.uid())
    )
  );
