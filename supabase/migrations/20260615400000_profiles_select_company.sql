-- SECURITY DEFINER helper: haalt company_id op zonder RLS te triggeren.
-- Directe subquery op profiles binnen een profiles-policy veroorzaakt
-- infinite recursion; deze functie omzeilt dat door RLS te bypassen.
CREATE OR REPLACE FUNCTION current_user_company_id()
RETURNS uuid AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Verwijder eventuele eerdere (recursieve) versies van de policy
DROP POLICY IF EXISTS "profiles_select_same_company" ON profiles;
DROP POLICY IF EXISTS "profiles_select_company"      ON profiles;

-- Nieuwe policy: eigen profiel altijd leesbaar (ook bij company_id = NULL),
-- plus alle profielen binnen hetzelfde bedrijf via de helper functie.
CREATE POLICY "profiles_select_company" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR (company_id IS NOT NULL AND company_id = current_user_company_id())
  );
