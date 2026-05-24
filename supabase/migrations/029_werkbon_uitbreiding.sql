-- ─── WERKBON UITBREIDING ────────────────────────────────────────────────────
-- Fotos, meerwerk, uitvoerder-notities en afrondtijdstip per werkbon.

-- Storage bucket voor foto-uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('werkbon-fotos', 'werkbon-fotos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "werkbon-fotos public read" ON storage.objects;
CREATE POLICY "werkbon-fotos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'werkbon-fotos');

DROP POLICY IF EXISTS "werkbon-fotos auth upload" ON storage.objects;
CREATE POLICY "werkbon-fotos auth upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "werkbon-fotos auth delete" ON storage.objects;
CREATE POLICY "werkbon-fotos auth delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'werkbon-fotos'
    AND auth.role() = 'authenticated'
  );

-- ─── WERKBON_FOTOS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS werkbon_fotos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  werkbon_id  uuid        NOT NULL REFERENCES werkbonnen(id) ON DELETE CASCADE,
  company_id  uuid        NOT NULL REFERENCES companies(id),
  url         text        NOT NULL,
  categorie   text        CHECK (categorie IN ('voor', 'tijdens', 'na')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_werkbon_fotos_werkbon ON werkbon_fotos (werkbon_id);
CREATE INDEX IF NOT EXISTS idx_werkbon_fotos_company ON werkbon_fotos (company_id);

ALTER TABLE werkbon_fotos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "werkbon_fotos_select" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_select" ON werkbon_fotos
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "werkbon_fotos_insert" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_insert" ON werkbon_fotos
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "werkbon_fotos_delete" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_delete" ON werkbon_fotos
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ─── WERKBON_MEERWERK ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS werkbon_meerwerk (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  werkbon_id  uuid        NOT NULL REFERENCES werkbonnen(id) ON DELETE CASCADE,
  company_id  uuid        NOT NULL REFERENCES companies(id),
  omschrijving text,
  prijs       numeric     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_werkbon_meerwerk_werkbon ON werkbon_meerwerk (werkbon_id);
CREATE INDEX IF NOT EXISTS idx_werkbon_meerwerk_company ON werkbon_meerwerk (company_id);

ALTER TABLE werkbon_meerwerk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "werkbon_meerwerk_select" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_select" ON werkbon_meerwerk
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "werkbon_meerwerk_insert" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_insert" ON werkbon_meerwerk
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "werkbon_meerwerk_delete" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_delete" ON werkbon_meerwerk
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ─── EXTRA KOLOMMEN OP WERKBONNEN ────────────────────────────────────────────
ALTER TABLE werkbonnen ADD COLUMN IF NOT EXISTS werkbon_notities text;
ALTER TABLE werkbonnen ADD COLUMN IF NOT EXISTS afgerond_op      timestamptz;
