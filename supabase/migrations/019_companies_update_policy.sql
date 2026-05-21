-- RLS UPDATE policy ontbrak op companies tabel:
-- INSERT en SELECT bestonden al, maar UPDATE werd stil geblokkeerd.
CREATE POLICY "Users can update own company"
  ON companies
  FOR UPDATE
  USING (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
