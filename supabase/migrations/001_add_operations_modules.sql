-- =============================================================================
-- BossBase: Operations Modules Migration
-- Bestand : supabase/migrations/001_add_operations_modules.sql
-- Uitvoer : Handmatig in de Supabase SQL Editor
-- Veilig  : Alle statements gebruiken IF NOT EXISTS / ON CONFLICT DO NOTHING
--           Geen DROP, TRUNCATE of destructieve DELETE statements aanwezig.
-- =============================================================================


-- =============================================================================
-- 1. BEDRIJFSINSTELLINGEN
--    Standaardwaarden per bedrijf voor offertes en urenregistratie.
-- =============================================================================

CREATE TABLE IF NOT EXISTS bedrijfsinstellingen (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uurtarief            NUMERIC     NOT NULL DEFAULT 55,
  reiskosten_per_km    NUMERIC     NOT NULL DEFAULT 0.23,
  standaard_marge      NUMERIC     NOT NULL DEFAULT 25,
  btw_pct              NUMERIC     NOT NULL DEFAULT 21,
  offerte_geldig_dagen INTEGER     NOT NULL DEFAULT 14,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bedrijfsinstellingen_company_id_key UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_bedrijfsinstellingen_company
  ON bedrijfsinstellingen (company_id);

ALTER TABLE bedrijfsinstellingen ENABLE ROW LEVEL SECURITY;

-- SELECT: leden van dezelfde company
DROP POLICY IF EXISTS "bedrijfsinstellingen_select" ON bedrijfsinstellingen;
CREATE POLICY "bedrijfsinstellingen_select" ON bedrijfsinstellingen
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- INSERT: alleen admins
DROP POLICY IF EXISTS "bedrijfsinstellingen_insert" ON bedrijfsinstellingen;
CREATE POLICY "bedrijfsinstellingen_insert" ON bedrijfsinstellingen
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- UPDATE: alleen admins
DROP POLICY IF EXISTS "bedrijfsinstellingen_update" ON bedrijfsinstellingen;
CREATE POLICY "bedrijfsinstellingen_update" ON bedrijfsinstellingen
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- DELETE: alleen admins
DROP POLICY IF EXISTS "bedrijfsinstellingen_delete" ON bedrijfsinstellingen;
CREATE POLICY "bedrijfsinstellingen_delete" ON bedrijfsinstellingen
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );


-- =============================================================================
-- 2. EMAIL_TEMPLATES
--    Aanpasbare e-mailteksten per company per trigger-type.
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  onderwerp  TEXT,
  body       TEXT,
  actief     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_templates_company_type_key UNIQUE (company_id, type)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_company
  ON email_templates (company_id);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_templates_select" ON email_templates;
CREATE POLICY "email_templates_select" ON email_templates
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "email_templates_insert" ON email_templates;
CREATE POLICY "email_templates_insert" ON email_templates
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "email_templates_update" ON email_templates;
CREATE POLICY "email_templates_update" ON email_templates
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "email_templates_delete" ON email_templates;
CREATE POLICY "email_templates_delete" ON email_templates
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );


-- =============================================================================
-- 3. COMPANY_MEMBERS
--    Teamleden en uitnodigingen per company.
--    profile_id is NULL zolang de uitnodiging nog niet geaccepteerd is.
-- =============================================================================

CREATE TABLE IF NOT EXISTS company_members (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- TODO: validate profile_id belongs to the same company after acceptance
  profile_id    UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  full_name     TEXT,
  phone         TEXT,
  role          TEXT        NOT NULL DEFAULT 'medewerker',
  status        TEXT        NOT NULL DEFAULT 'uitgenodigd',
  hours_per_week NUMERIC    NOT NULL DEFAULT 0,
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_members_company_email_key UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_company_members_company
  ON company_members (company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_profile
  ON company_members (profile_id);
CREATE INDEX IF NOT EXISTS idx_company_members_status
  ON company_members (company_id, status);

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- SELECT: alle leden van dezelfde company mogen het team zien
DROP POLICY IF EXISTS "company_members_select" ON company_members;
CREATE POLICY "company_members_select" ON company_members
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- INSERT: alleen admins mogen teamleden uitnodigen
DROP POLICY IF EXISTS "company_members_insert" ON company_members;
CREATE POLICY "company_members_insert" ON company_members
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- UPDATE: alleen admins — medewerkers mogen hun eigen rij NIET bewerken om rol-escalatie te voorkomen
DROP POLICY IF EXISTS "company_members_update" ON company_members;
CREATE POLICY "company_members_update" ON company_members
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- DELETE: alleen admins
DROP POLICY IF EXISTS "company_members_delete" ON company_members;
CREATE POLICY "company_members_delete" ON company_members
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );


-- =============================================================================
-- 4. OFFERTES
--    Offertes per klant, optioneel gekoppeld aan een deal.
-- =============================================================================

CREATE TABLE IF NOT EXISTS offertes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- TODO: validate customer_id belongs to the same company
  customer_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,
  -- TODO: validate deal_id belongs to the same company
  deal_id         UUID        REFERENCES deals(id) ON DELETE SET NULL,
  nummer          TEXT,
  omschrijving    TEXT,
  status          TEXT        NOT NULL DEFAULT 'concept',
  arbeidsuren     NUMERIC     NOT NULL DEFAULT 0,
  uurtarief       NUMERIC     NOT NULL DEFAULT 55,
  materiaalkosten NUMERIC     NOT NULL DEFAULT 0,
  reiskosten      NUMERIC     NOT NULL DEFAULT 0,
  marge_pct       NUMERIC     NOT NULL DEFAULT 25,
  btw_pct         NUMERIC     NOT NULL DEFAULT 21,
  totaal_excl     NUMERIC     NOT NULL DEFAULT 0,
  totaal_incl     NUMERIC     NOT NULL DEFAULT 0,
  geldig_tot      DATE,
  verzonden_op    TIMESTAMPTZ,
  geaccepteerd_op TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offertes_company
  ON offertes (company_id);
CREATE INDEX IF NOT EXISTS idx_offertes_customer
  ON offertes (customer_id);
CREATE INDEX IF NOT EXISTS idx_offertes_status
  ON offertes (company_id, status);
CREATE INDEX IF NOT EXISTS idx_offertes_created
  ON offertes (company_id, created_at DESC);

ALTER TABLE offertes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offertes_select" ON offertes;
CREATE POLICY "offertes_select" ON offertes
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- INSERT/UPDATE: alleen admins en planners mogen offertes aanmaken en wijzigen
DROP POLICY IF EXISTS "offertes_insert" ON offertes;
CREATE POLICY "offertes_insert" ON offertes
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );

DROP POLICY IF EXISTS "offertes_update" ON offertes;
CREATE POLICY "offertes_update" ON offertes
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );

-- DELETE: alleen admin
DROP POLICY IF EXISTS "offertes_delete" ON offertes;
CREATE POLICY "offertes_delete" ON offertes
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );


-- =============================================================================
-- 5. OFFERTE_ITEMS
--    Losse regelitems per offerte.
-- =============================================================================

CREATE TABLE IF NOT EXISTS offerte_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offerte_id   UUID        NOT NULL REFERENCES offertes(id) ON DELETE CASCADE,
  company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  omschrijving TEXT        NOT NULL,
  eenheid      TEXT,
  aantal       NUMERIC     NOT NULL DEFAULT 1,
  prijs_per    NUMERIC     NOT NULL DEFAULT 0,
  subtotaal    NUMERIC     NOT NULL DEFAULT 0,
  volgorde     INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offerte_items_offerte
  ON offerte_items (offerte_id);
CREATE INDEX IF NOT EXISTS idx_offerte_items_company
  ON offerte_items (company_id);

ALTER TABLE offerte_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offerte_items_select" ON offerte_items;
CREATE POLICY "offerte_items_select" ON offerte_items
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- INSERT/UPDATE/DELETE: alleen admins en planners (zelfde beperking als offertes)
DROP POLICY IF EXISTS "offerte_items_insert" ON offerte_items;
CREATE POLICY "offerte_items_insert" ON offerte_items
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );

DROP POLICY IF EXISTS "offerte_items_update" ON offerte_items;
CREATE POLICY "offerte_items_update" ON offerte_items
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );

DROP POLICY IF EXISTS "offerte_items_delete" ON offerte_items;
CREATE POLICY "offerte_items_delete" ON offerte_items
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );


-- =============================================================================
-- 6. WERKBONNEN
--    Uitvoeropdrachten voor medewerkers op locatie.
-- =============================================================================

CREATE TABLE IF NOT EXISTS werkbonnen (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- TODO: validate customer_id belongs to the same company
  customer_id  UUID        REFERENCES customers(id) ON DELETE SET NULL,
  -- TODO: validate deal_id belongs to the same company
  deal_id      UUID        REFERENCES deals(id) ON DELETE SET NULL,
  offerte_id   UUID        REFERENCES offertes(id) ON DELETE SET NULL,
  -- TODO: validate assigned_to is a member of the same company
  assigned_to  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  titel        TEXT        NOT NULL,
  omschrijving TEXT,
  status       TEXT        NOT NULL DEFAULT 'gepland',
  gepland_op   DATE,
  starttijd    TIME,
  eindtijd     TIME,
  locatie      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_werkbonnen_company
  ON werkbonnen (company_id);
CREATE INDEX IF NOT EXISTS idx_werkbonnen_status
  ON werkbonnen (company_id, status);
CREATE INDEX IF NOT EXISTS idx_werkbonnen_customer
  ON werkbonnen (customer_id);
CREATE INDEX IF NOT EXISTS idx_werkbonnen_assigned
  ON werkbonnen (assigned_to);
CREATE INDEX IF NOT EXISTS idx_werkbonnen_datum
  ON werkbonnen (company_id, gepland_op);

ALTER TABLE werkbonnen ENABLE ROW LEVEL SECURITY;

-- SELECT: admins/planners zien alle werkbonnen; medewerkers alleen eigen
DROP POLICY IF EXISTS "werkbonnen_select" ON werkbonnen;
CREATE POLICY "werkbonnen_select" ON werkbonnen
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "werkbonnen_insert" ON werkbonnen;
CREATE POLICY "werkbonnen_insert" ON werkbonnen
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );

-- UPDATE: admins/planners altijd; medewerkers mogen alleen status bijwerken op eigen bon
-- TODO: verfijn deze policy voor medewerkers zodat ze alleen status/notes mogen updaten
DROP POLICY IF EXISTS "werkbonnen_update" ON werkbonnen;
CREATE POLICY "werkbonnen_update" ON werkbonnen
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR assigned_to = auth.uid()
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR assigned_to = auth.uid()
    )
  );

-- DELETE: alleen admin
DROP POLICY IF EXISTS "werkbonnen_delete" ON werkbonnen;
CREATE POLICY "werkbonnen_delete" ON werkbonnen
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );


-- =============================================================================
-- 7. WERKBON_TAKEN
--    Checklist-items per werkbon.
--    Toegang via EXISTS-join op werkbonnen zodat medewerkers alleen taken zien
--    van werkbonnen die aan hen zijn toegewezen.
-- =============================================================================

CREATE TABLE IF NOT EXISTS werkbon_taken (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  werkbon_id   UUID        NOT NULL REFERENCES werkbonnen(id) ON DELETE CASCADE,
  company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  omschrijving TEXT        NOT NULL,
  afgerond     BOOLEAN     NOT NULL DEFAULT false,
  volgorde     INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_werkbon_taken_werkbon
  ON werkbon_taken (werkbon_id);
CREATE INDEX IF NOT EXISTS idx_werkbon_taken_company
  ON werkbon_taken (company_id);

ALTER TABLE werkbon_taken ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/planner zien alles; medewerkers alleen voor hun toegewezen werkbonnen
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
        )
    )
  );

-- INSERT: alleen admin/planner mogen taken aanmaken
DROP POLICY IF EXISTS "werkbon_taken_insert" ON werkbon_taken;
CREATE POLICY "werkbon_taken_insert" ON werkbon_taken
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

-- UPDATE: admin/planner altijd; medewerkers mogen afgerond-vlag omzetten op eigen werkbonnen
DROP POLICY IF EXISTS "werkbon_taken_update" ON werkbon_taken;
CREATE POLICY "werkbon_taken_update" ON werkbon_taken
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR w.assigned_to = auth.uid()
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR w.assigned_to = auth.uid()
        )
    )
  );

-- DELETE: alleen admin/planner
DROP POLICY IF EXISTS "werkbon_taken_delete" ON werkbon_taken;
CREATE POLICY "werkbon_taken_delete" ON werkbon_taken
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );


-- =============================================================================
-- 8. WERKBON_MATERIALEN
--    Gebruikte materialen en kosten per werkbon.
--    Toegang via EXISTS-join op werkbonnen (zelfde patroon als werkbon_taken).
-- =============================================================================

CREATE TABLE IF NOT EXISTS werkbon_materialen (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  werkbon_id UUID        NOT NULL REFERENCES werkbonnen(id) ON DELETE CASCADE,
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  naam       TEXT        NOT NULL,
  eenheid    TEXT,
  aantal     NUMERIC     NOT NULL DEFAULT 1,
  prijs_per  NUMERIC     NOT NULL DEFAULT 0,
  subtotaal  NUMERIC     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_werkbon_materialen_werkbon
  ON werkbon_materialen (werkbon_id);
CREATE INDEX IF NOT EXISTS idx_werkbon_materialen_company
  ON werkbon_materialen (company_id);

ALTER TABLE werkbon_materialen ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/planner zien alles; medewerkers alleen voor hun toegewezen werkbonnen
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
        )
    )
  );

-- INSERT: admin/planner altijd; medewerkers mogen materialen loggen op eigen werkbonnen
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
          OR w.assigned_to = auth.uid()
        )
    )
  );

-- UPDATE: admin/planner altijd; medewerkers op eigen werkbonnen
DROP POLICY IF EXISTS "werkbon_materialen_update" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_update" ON werkbon_materialen
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR w.assigned_to = auth.uid()
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
          OR w.assigned_to = auth.uid()
        )
    )
  );

-- DELETE: alleen admin/planner
DROP POLICY IF EXISTS "werkbon_materialen_delete" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_delete" ON werkbon_materialen
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );


-- =============================================================================
-- 9. URENREGISTRATIE
--    Gewerkte uren per medewerker, per klant/werkbon/deal.
-- =============================================================================

CREATE TABLE IF NOT EXISTS urenregistratie (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- TODO: validate profile_id is a member of the same company
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- TODO: validate customer_id belongs to the same company
  customer_id UUID        REFERENCES customers(id) ON DELETE SET NULL,
  werkbon_id  UUID        REFERENCES werkbonnen(id) ON DELETE SET NULL,
  -- TODO: validate deal_id belongs to the same company
  deal_id     UUID        REFERENCES deals(id) ON DELETE SET NULL,
  datum       DATE        NOT NULL,
  start_tijd  TIME,
  eind_tijd   TIME,
  uren        NUMERIC     NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'arbeid',
  notitie     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_urenregistratie_company
  ON urenregistratie (company_id);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_profile
  ON urenregistratie (profile_id);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_datum
  ON urenregistratie (company_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_werkbon
  ON urenregistratie (werkbon_id);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_customer
  ON urenregistratie (customer_id);

ALTER TABLE urenregistratie ENABLE ROW LEVEL SECURITY;

-- SELECT: admins/planners zien alles; medewerkers alleen eigen uren
DROP POLICY IF EXISTS "urenregistratie_select" ON urenregistratie;
CREATE POLICY "urenregistratie_select" ON urenregistratie
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR profile_id = auth.uid()
    )
  );

-- INSERT: iedereen mag eigen uren invoeren
DROP POLICY IF EXISTS "urenregistratie_insert" ON urenregistratie;
CREATE POLICY "urenregistratie_insert" ON urenregistratie
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR profile_id = auth.uid()
    )
  );

-- UPDATE: admins/planners altijd; medewerkers alleen eigen uren
DROP POLICY IF EXISTS "urenregistratie_update" ON urenregistratie;
CREATE POLICY "urenregistratie_update" ON urenregistratie
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR profile_id = auth.uid()
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR profile_id = auth.uid()
    )
  );

-- DELETE: admins/planners mogen verwijderen; medewerkers alleen eigen regels
DROP POLICY IF EXISTS "urenregistratie_delete" ON urenregistratie;
CREATE POLICY "urenregistratie_delete" ON urenregistratie
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
      OR profile_id = auth.uid()
    )
  );


-- =============================================================================
-- 10. SEED: STANDAARD DATA VOOR BESTAANDE COMPANIES
--     Voeg bedrijfsinstellingen en e-mailtemplates toe voor companies die ze
--     nog niet hebben. Veilig: ON CONFLICT DO NOTHING of WHERE NOT EXISTS.
-- =============================================================================

-- Bedrijfsinstellingen: één rij per company als die nog niet bestaat
INSERT INTO bedrijfsinstellingen (company_id)
SELECT id
FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM bedrijfsinstellingen b WHERE b.company_id = companies.id
)
ON CONFLICT (company_id) DO NOTHING;

-- E-mailtemplates: 5 standaardtypes per company als die nog niet bestaan
INSERT INTO email_templates (company_id, type, onderwerp, body)
SELECT
  c.id,
  t.type,
  t.onderwerp,
  t.body
FROM companies c
CROSS JOIN (
  VALUES
    (
      'lead_ontvangen',
      'Bedankt voor uw aanvraag',
      E'Beste {{klant_naam}},\n\nBedankt voor uw aanvraag. We nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\n{{bedrijf_naam}}'
    ),
    (
      'offerte_verstuurd',
      'Uw offerte van {{bedrijf_naam}}',
      E'Beste {{klant_naam}},\n\nHierbij ontvangt u de offerte voor {{offerte_omschrijving}}.\n\nDe offerte is geldig tot {{geldig_tot}}.\n\nMet vriendelijke groet,\n{{bedrijf_naam}}'
    ),
    (
      'offerte_herinnering',
      'Herinnering: uw offerte verloopt binnenkort',
      E'Beste {{klant_naam}},\n\nWe willen u eraan herinneren dat uw offerte verloopt op {{geldig_tot}}.\n\nNeem gerust contact op als u vragen heeft.\n\nMet vriendelijke groet,\n{{bedrijf_naam}}'
    ),
    (
      'klus_gepland',
      'Uw klus is ingepland',
      E'Beste {{klant_naam}},\n\nWe bevestigen dat uw klus is ingepland op {{datum}} om {{tijdstip}}.\n\nLocatie: {{locatie}}\n\nMet vriendelijke groet,\n{{bedrijf_naam}}'
    ),
    (
      'betaalherinnering',
      'Herinnering openstaande factuur',
      E'Beste {{klant_naam}},\n\nWe willen u herinneren aan de openstaande factuur van {{bedrag}}.\n\nGelieve dit bedrag over te maken voor {{vervaldatum}}.\n\nMet vriendelijke groet,\n{{bedrijf_naam}}'
    )
) AS t(type, onderwerp, body)
WHERE NOT EXISTS (
  SELECT 1
  FROM email_templates et
  WHERE et.company_id = c.id
    AND et.type = t.type
)
ON CONFLICT (company_id, type) DO NOTHING;
