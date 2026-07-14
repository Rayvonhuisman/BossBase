-- =============================================================================
-- 20260714120000_rechten_herziening.sql
--
-- Herziening rechtensysteem: hoofdrechten met subrechten + gaten dichten.
-- Alles in één transactie zodat de data-remap en de policies consistent live gaan.
--
-- Hergebruikt bestaande helpers (geen parallel systeem):
--   bb_has_permission(x)  = rol in (admin,planner) OF user_permissions x granted
--   get_company_tier()    = 'starter' | 'groei' | 'team'  (Groei = gedeeld)
--   current_company_id() / current_user_company_id() = company van de gebruiker
--
-- Sleutelwijzigingen t.o.v. oud:
--   pipeline            → verkoop            (nu ook RLS op deals)
--   financieel          → bedrijfsfinancien + projectbedragen (split; UI-gates)
--   projecten (no-op)   → projecten_bewerken (echt: projects UPDATE/INSERT)
--   werkbonnen (no-op)  → werkbonnen_bewerken (echt: alle werkbonnen + child + storage + werkbon-job_costs)
--   nieuw: alles_inzien (alle projecten/werkbonnen zien), agenda_inzien (agenda's van collega's)
--   planning: werkbonnen mogen inplannen (UPDATE) + pagina open (frontend)
-- =============================================================================

-- ── 1. DATA-REMAP user_permissions (uniek = (user_id, permission)) ────────────

-- financieel → behoud toegang: split naar beide nieuwe rechten
INSERT INTO user_permissions (user_id, company_id, permission, granted)
SELECT user_id, company_id, 'bedrijfsfinancien', granted FROM user_permissions WHERE permission = 'financieel'
ON CONFLICT (user_id, permission) DO UPDATE SET granted = EXCLUDED.granted;
INSERT INTO user_permissions (user_id, company_id, permission, granted)
SELECT user_id, company_id, 'projectbedragen', granted FROM user_permissions WHERE permission = 'financieel'
ON CONFLICT (user_id, permission) DO UPDATE SET granted = EXCLUDED.granted;
DELETE FROM user_permissions WHERE permission = 'financieel';

-- pipeline → verkoop (hernoemen)
UPDATE user_permissions SET permission = 'verkoop' WHERE permission = 'pipeline';

-- oude no-ops verwijderen (beslissing: niet mappen)
DELETE FROM user_permissions WHERE permission IN ('projecten', 'werkbonnen');

-- Bestaande niet-admin leden eenmalig 'alles_inzien' (behoud huidige brede
-- projectzichtbaarheid; nieuwe leden krijgen dit voortaan NIET standaard).
INSERT INTO user_permissions (user_id, company_id, permission, granted)
SELECT p.id, p.company_id, 'alles_inzien', true
FROM profiles p
WHERE p.company_id IS NOT NULL AND p.role <> 'admin'
ON CONFLICT (user_id, permission) DO NOTHING;

-- ── 2. PROJECTEN: zien (eigen/all) vs. bewerken (recht) ───────────────────────
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      get_company_tier() = 'groei'
      OR bb_has_permission('alles_inzien')          -- dekt admin/planner
      OR assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM werkbonnen w
        WHERE w.project_id = projects.id
          AND (w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids))
      )
    )
  );

DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('projecten_bewerken')
  );

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('projecten_bewerken')
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('projecten_bewerken')
  );
-- projects_delete blijft admin-only (ongewijzigd).

-- ── 3. WERKBONNEN: brede inzage + bewerkrecht + planning mag inplannen ────────
DROP POLICY IF EXISTS "werkbonnen_select" ON werkbonnen;
CREATE POLICY "werkbonnen_select" ON werkbonnen
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      get_company_tier() = 'groei'
      OR bb_has_permission('planning')              -- dekt admin/planner + planning-recht
      OR bb_has_permission('alles_inzien')
      OR assigned_to = auth.uid()
      OR auth.uid() = ANY(assigned_to_ids)
    )
  );

DROP POLICY IF EXISTS "werkbonnen_update" ON werkbonnen;
CREATE POLICY "werkbonnen_update" ON werkbonnen
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      get_company_tier() = 'groei'
      OR bb_has_permission('planning')              -- planner mag inplannen
      OR bb_has_permission('werkbonnen_bewerken')
      OR auth.uid() = ANY(verantwoordelijke_ids)
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      get_company_tier() = 'groei'
      OR bb_has_permission('planning')
      OR bb_has_permission('werkbonnen_bewerken')
      OR auth.uid() = ANY(verantwoordelijke_ids)
    )
  );

-- ── 4. WERKBON CHILD-TABELLEN: inzage = gekoppelden; schrijven = werkbon-editor ─
-- Editor = werkbonnen_bewerken (dekt admin/planner) OF verantwoordelijke OF Groei.
-- Viewer = planning/alles_inzien/Groei OF eigen toewijzing.

-- fotos: schrijven
DROP POLICY IF EXISTS "werkbon_fotos_insert" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_insert" ON werkbon_fotos
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_fotos.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_fotos_delete" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_delete" ON werkbon_fotos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_fotos.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- taken: inzage (gekoppelden + alles_inzien) / bewerken (editor)
DROP POLICY IF EXISTS "werkbon_taken_select" ON werkbon_taken;
CREATE POLICY "werkbon_taken_select" ON werkbon_taken
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('planning') OR bb_has_permission('alles_inzien')
             OR w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_taken_update" ON werkbon_taken;
CREATE POLICY "werkbon_taken_update" ON werkbon_taken
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- materialen: inzage (gekoppelden + alles_inzien) / schrijven (editor)
DROP POLICY IF EXISTS "werkbon_materialen_select" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_select" ON werkbon_materialen
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('planning') OR bb_has_permission('alles_inzien')
             OR w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_materialen_insert" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_insert" ON werkbon_materialen
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_materialen_update" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_update" ON werkbon_materialen
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- meerwerk: schrijven (editor)
DROP POLICY IF EXISTS "werkbon_meerwerk_insert" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_insert" ON werkbon_meerwerk
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_meerwerk.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_meerwerk_delete" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_delete" ON werkbon_meerwerk
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_meerwerk.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- storage (werkbon-fotos): pad {company}/{werkbon}/{uuid}; foldername()[2]=werkbon_id
DROP POLICY IF EXISTS "werkbon_fotos_insert" ON storage.objects;
CREATE POLICY "werkbon_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid AND w.company_id = current_user_company_id()
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_fotos_update" ON storage.objects;
CREATE POLICY "werkbon_fotos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid AND w.company_id = current_user_company_id()
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  )
  WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid AND w.company_id = current_user_company_id()
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_fotos_delete" ON storage.objects;
CREATE POLICY "werkbon_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid AND w.company_id = current_user_company_id()
        AND (get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- ── 5. job_costs: materiaalkosten op werkbon vallen onder werkbonnen_bewerken ──
-- Naast het bestaande 'kosten'-recht mag een werkbon-editor de aan díe werkbon
-- gekoppelde job_costs (werkbon_id) lezen/schrijven. Standalone kosten (geen
-- werkbon_id, Kosten-pagina) blijven puur onder 'kosten'.
DROP POLICY IF EXISTS "Users can view own company job costs" ON public.job_costs;
CREATE POLICY "Users can view own company job costs" ON public.job_costs FOR SELECT TO authenticated
  USING (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ));
DROP POLICY IF EXISTS "Users can insert own company job costs" ON public.job_costs;
CREATE POLICY "Users can insert own company job costs" ON public.job_costs FOR INSERT TO authenticated
  WITH CHECK (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ));
DROP POLICY IF EXISTS "Users can update own company job costs" ON public.job_costs;
CREATE POLICY "Users can update own company job costs" ON public.job_costs FOR UPDATE TO authenticated
  USING (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ))
  WITH CHECK (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ));
DROP POLICY IF EXISTS "Users can delete own company job costs" ON public.job_costs;
CREATE POLICY "Users can delete own company job costs" ON public.job_costs FOR DELETE TO authenticated
  USING (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         get_company_tier() = 'groei' OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ));

-- ── 6. DEALS: verkooppijplijn server-side op 'verkoop' ────────────────────────
DROP POLICY IF EXISTS "deals_select" ON deals;
CREATE POLICY "deals_select" ON deals
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('verkoop')
  );
DROP POLICY IF EXISTS "deals_insert" ON deals;
CREATE POLICY "deals_insert" ON deals
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('verkoop')
  );
DROP POLICY IF EXISTS "deals_update" ON deals;
CREATE POLICY "deals_update" ON deals
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('verkoop')
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('verkoop')
  );
-- deals_delete blijft admin-only (ongewijzigd).

-- ── 7. AGENDA INZIEN: additieve SELECT-tak op calendar_events + activities ─────
DROP POLICY IF EXISTS "Users can view own company calendar events" ON calendar_events;
CREATE POLICY "Users can view own company calendar events" ON calendar_events
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      get_company_tier() = 'groei'
      OR bb_has_permission('planning')
      OR bb_has_permission('agenda_inzien')
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM activities a WHERE a.id = calendar_events.activiteit_id AND (a.assigned_to = auth.uid() OR auth.uid() = ANY(a.assigned_to_ids)))
      OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = calendar_events.werkbon_id AND (w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids)))
    )
  );

DROP POLICY IF EXISTS "Users can view own company activities" ON activities;
CREATE POLICY "Users can view own company activities" ON activities
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      get_company_tier() = 'groei'
      OR bb_has_permission('planning')
      OR bb_has_permission('agenda_inzien')
      OR assigned_to = auth.uid()
      OR auth.uid() = ANY(assigned_to_ids)
    )
  );
