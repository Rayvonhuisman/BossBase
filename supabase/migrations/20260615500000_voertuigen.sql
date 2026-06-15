-- Voertuigen tabel voor de planning pagina
CREATE TABLE IF NOT EXISTS voertuigen (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  naam        text        NOT NULL,
  kenteken    text,
  kleur       text        DEFAULT '#1DDB62',
  actief      boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE voertuigen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voertuigen_select" ON voertuigen FOR SELECT
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "voertuigen_insert" ON voertuigen FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "voertuigen_update" ON voertuigen FOR UPDATE
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "voertuigen_delete" ON voertuigen FOR DELETE
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Koppel voertuig aan werkbon
ALTER TABLE werkbonnen ADD COLUMN IF NOT EXISTS voertuig_id uuid REFERENCES voertuigen(id);
