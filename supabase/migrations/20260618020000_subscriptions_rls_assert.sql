-- Herbevestig dat alleen super admins de subscriptions tabel kunnen lezen/schrijven.
-- Idempotent: verwijdert beide mogelijke policy-namen en zet de canonieke terug.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_only" ON subscriptions;
DROP POLICY IF EXISTS "super_admin_all"  ON subscriptions;

CREATE POLICY "super_admin_only" ON subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_super_admin = true
    )
  );
