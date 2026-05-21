CREATE TABLE IF NOT EXISTS accounting_connections (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider          text        NOT NULL DEFAULT 'moneybird',
  api_token         text,
  administration_id text,
  last_synced_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);
ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_accounting_connections"
  ON accounting_connections FOR SELECT
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "insert_accounting_connections"
  ON accounting_connections FOR INSERT
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
CREATE POLICY "update_accounting_connections"
  ON accounting_connections FOR UPDATE
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
CREATE POLICY "delete_accounting_connections"
  ON accounting_connections FOR DELETE
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
