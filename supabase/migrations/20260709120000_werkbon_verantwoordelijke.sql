-- =============================================================================
-- 20260709120000_werkbon_verantwoordelijke.sql
--
-- Per werkbon één of meer VERANTWOORDELIJKEN aanwijzen uit de gekoppelde
-- medewerkers. Dit is een WERKBON-SPECIFIEK bewerk-recht en verandert het
-- algemene rechtensysteem NIET.
--
-- Gedrag:
--  - assigned_to_ids  = alle gekoppelde medewerkers (bestaand). Zij zien de bon.
--  - verantwoordelijke_ids = subset van gekoppelde medewerkers die de bon MAG
--    bewerken (gegevens, foto's, taken, materialen, meerwerk, notities, status).
--  - Niet-verantwoordelijke gekoppelde medewerkers hebben alleen INZAGE.
--  - admin/planner behouden volledige toegang (beheer).
--
-- De afdwinging is server-side via RLS: een niet-verantwoordelijke kan technisch
-- niet schrijven, ook niet buiten de UI om. Zowel de werkbon-rij, de gekoppelde
-- tabellen als de foto-uploads in storage vallen hieronder.
-- =============================================================================

-- ── 1. KOLOM + BACKFILL ──────────────────────────────────────────────────────
ALTER TABLE werkbonnen
  ADD COLUMN IF NOT EXISTS verantwoordelijke_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill: bestaande bonnen behouden exact hun huidige bewerk-recht. Onder de
-- oude RLS mocht alleen de primaire medewerker (assigned_to) bewerken, dus die
-- wordt de verantwoordelijke. Bonnen zonder toewijzing blijven leeg (alleen
-- admin/planner beheert ze).
UPDATE werkbonnen
SET verantwoordelijke_ids = ARRAY[assigned_to]
WHERE assigned_to IS NOT NULL
  AND (verantwoordelijke_ids IS NULL OR verantwoordelijke_ids = '{}');

-- Veiligheids-invariant: een verantwoordelijke moet ook een gekoppelde
-- medewerker zijn. Zo kan iemand nooit bewerk-recht houden buiten de koppeling
-- om (bv. na herplannen naar andere medewerkers).
ALTER TABLE werkbonnen DROP CONSTRAINT IF EXISTS werkbonnen_verantwoordelijke_subset;
ALTER TABLE werkbonnen
  ADD CONSTRAINT werkbonnen_verantwoordelijke_subset
  CHECK (verantwoordelijke_ids <@ assigned_to_ids);

-- Snellere array-membership checks in RLS.
CREATE INDEX IF NOT EXISTS idx_werkbonnen_verantwoordelijke
  ON werkbonnen USING gin (verantwoordelijke_ids);

-- ── 2. WERKBONNEN: UPDATE alleen door beheer of verantwoordelijke ─────────────
-- SELECT/INSERT/DELETE blijven ongewijzigd (SELECT toont de bon al aan alle
-- gekoppelde medewerkers via assigned_to_ids; INSERT/DELETE zijn beheer).
DROP POLICY IF EXISTS "werkbonnen_update" ON werkbonnen;
CREATE POLICY "werkbonnen_update" ON werkbonnen
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR auth.uid() = ANY(verantwoordelijke_ids)
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR auth.uid() = ANY(verantwoordelijke_ids)
    )
  );

-- ── 3. WERKBON_FOTOS: schrijven alleen door beheer of verantwoordelijke ───────
-- SELECT blijft op bedrijfsniveau (gekoppelde medewerkers zien de foto's).
DROP POLICY IF EXISTS "werkbon_fotos_insert" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_insert" ON werkbon_fotos
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_fotos.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );

DROP POLICY IF EXISTS "werkbon_fotos_delete" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_delete" ON werkbon_fotos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_fotos.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );

-- ── 4. WERKBON_TAKEN: inzage voor alle gekoppelden, bewerken voor verantw. ────
-- SELECT: verruimd van alleen de primaire naar alle gekoppelde medewerkers.
DROP POLICY IF EXISTS "werkbon_taken_select" ON werkbon_taken;
CREATE POLICY "werkbon_taken_select" ON werkbon_taken
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR w.assigned_to = auth.uid()
          OR auth.uid() = ANY(w.assigned_to_ids)
        )
    )
  );
-- UPDATE (o.a. afgerond-vlag): alleen beheer of verantwoordelijke.
DROP POLICY IF EXISTS "werkbon_taken_update" ON werkbon_taken;
CREATE POLICY "werkbon_taken_update" ON werkbon_taken
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );
-- INSERT/DELETE van taken blijven beheer (admin/planner) — ongewijzigd.

-- ── 5. WERKBON_MATERIALEN: inzage gekoppelden, schrijven verantwoordelijke ────
DROP POLICY IF EXISTS "werkbon_materialen_select" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_select" ON werkbon_materialen
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR w.assigned_to = auth.uid()
          OR auth.uid() = ANY(w.assigned_to_ids)
        )
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
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );
DROP POLICY IF EXISTS "werkbon_materialen_update" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_update" ON werkbon_materialen
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );
-- DELETE van materialen blijft beheer (admin/planner) — ongewijzigd.

-- ── 6. WERKBON_MEERWERK: schrijven alleen door beheer of verantwoordelijke ────
-- (SELECT blijft op bedrijfsniveau; INSERT/DELETE waren te ruim — nu vastgezet.)
DROP POLICY IF EXISTS "werkbon_meerwerk_insert" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_insert" ON werkbon_meerwerk
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_meerwerk.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );
DROP POLICY IF EXISTS "werkbon_meerwerk_delete" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_delete" ON werkbon_meerwerk
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_meerwerk.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );

-- ── 7. STORAGE (werkbon-fotos bucket): uploads/verwijderen server-side vast ───
-- Pad: {company_id}/{werkbon_id}/{uuid}.{ext}. foldername()[2] = werkbon_id.
-- Alleen beheer of verantwoordelijke van díe werkbon mag uploaden/wijzigen/
-- verwijderen. Bedrijfsscope blijft behouden via de eerste padsegment-check.
DROP POLICY IF EXISTS "werkbon_fotos_insert" ON storage.objects;
CREATE POLICY "werkbon_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid
        AND w.company_id = current_user_company_id()
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );

DROP POLICY IF EXISTS "werkbon_fotos_update" ON storage.objects;
CREATE POLICY "werkbon_fotos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid
        AND w.company_id = current_user_company_id()
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  )
  WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid
        AND w.company_id = current_user_company_id()
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );

DROP POLICY IF EXISTS "werkbon_fotos_delete" ON storage.objects;
CREATE POLICY "werkbon_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid
        AND w.company_id = current_user_company_id()
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR auth.uid() = ANY(w.verantwoordelijke_ids)
        )
    )
  );
