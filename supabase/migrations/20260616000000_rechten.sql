-- Rechten per gebruiker (granulaire permissies, niet via vaste rollen)
CREATE TABLE user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted boolean DEFAULT true,
  UNIQUE(user_id, permission)
);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Alle gebruikers van het bedrijf mogen hun eigen rechten zien
CREATE POLICY "permissions_select" ON user_permissions
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Alleen admins mogen rechten aanmaken / wijzigen / verwijderen
CREATE POLICY "permissions_admin_insert" ON user_permissions
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "permissions_admin_update" ON user_permissions
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "permissions_admin_delete" ON user_permissions
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Beschikbare rechten (als referentie):
-- offertes, facturen, financieel, kosten, btw
-- klanten_bewerken, klanten_verwijderen, projecten, werkbonnen
-- planning, database, instellingen, team
