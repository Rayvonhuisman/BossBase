-- ── FACTUREN ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturen (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id      UUID        REFERENCES customers(id) ON DELETE SET NULL,
  nummer           TEXT        NOT NULL,
  factuurdatum     DATE        NOT NULL DEFAULT CURRENT_DATE,
  vervaldatum      DATE,
  betalingskenmerk TEXT,
  status           TEXT        NOT NULL DEFAULT 'concept',
  notities         TEXT,
  totaal_excl      NUMERIC     NOT NULL DEFAULT 0,
  totaal_incl      NUMERIC     NOT NULL DEFAULT 0,
  betaald_op       DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facturen_company
  ON facturen (company_id);
CREATE INDEX IF NOT EXISTS idx_facturen_customer
  ON facturen (customer_id);
CREATE INDEX IF NOT EXISTS idx_facturen_status
  ON facturen (company_id, status);
CREATE INDEX IF NOT EXISTS idx_facturen_created
  ON facturen (company_id, created_at DESC);

ALTER TABLE facturen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "facturen_select" ON facturen;
CREATE POLICY "facturen_select" ON facturen
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "facturen_insert" ON facturen;
CREATE POLICY "facturen_insert" ON facturen
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );

DROP POLICY IF EXISTS "facturen_update" ON facturen;
CREATE POLICY "facturen_update" ON facturen
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "facturen_delete" ON facturen;
CREATE POLICY "facturen_delete" ON facturen
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'planner')
  );

-- ── FACTUUR REGELS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS factuur_regels (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  factuur_id    UUID        NOT NULL REFERENCES facturen(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL DEFAULT 'stuks',
  omschrijving  TEXT        NOT NULL,
  aantal        NUMERIC     NOT NULL DEFAULT 1,
  eenheidsprijs NUMERIC     NOT NULL DEFAULT 0,
  btw_pct       NUMERIC     NOT NULL DEFAULT 21,
  regelprijs    NUMERIC     NOT NULL DEFAULT 0,
  volgorde      INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factuur_regels_factuur
  ON factuur_regels (factuur_id);
CREATE INDEX IF NOT EXISTS idx_factuur_regels_company
  ON factuur_regels (company_id);

ALTER TABLE factuur_regels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "factuur_regels_select" ON factuur_regels;
CREATE POLICY "factuur_regels_select" ON factuur_regels
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "factuur_regels_insert" ON factuur_regels;
CREATE POLICY "factuur_regels_insert" ON factuur_regels
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "factuur_regels_update" ON factuur_regels;
CREATE POLICY "factuur_regels_update" ON factuur_regels
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "factuur_regels_delete" ON factuur_regels;
CREATE POLICY "factuur_regels_delete" ON factuur_regels
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
