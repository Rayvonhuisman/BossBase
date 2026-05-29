-- Tijdlijn per klant: losse entries voor notities, statuswijzigingen, etc.
CREATE TABLE IF NOT EXISTS klant_tijdlijn (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES companies(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type          text NOT NULL DEFAULT 'notitie_toegevoegd',
  omschrijving  text,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS klant_tijdlijn_customer_idx ON klant_tijdlijn(customer_id);
CREATE INDEX IF NOT EXISTS klant_tijdlijn_company_idx  ON klant_tijdlijn(company_id);

ALTER TABLE klant_tijdlijn ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage klant_tijdlijn"
  ON klant_tijdlijn
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );
