-- Sta toe dat gebruikers alle profielen binnen hetzelfde bedrijf kunnen lezen.
-- Nodig voor @mention autocomplete (getTeamMembers) en teamoverzicht.
-- De bestaande policy "Users can view own profile" (id = auth.uid()) blijft
-- behouden voor het geval company_id nog NULL is (bv. tijdens onboarding).
CREATE POLICY "profiles_select_same_company" ON profiles
  FOR SELECT USING (
    company_id IS NOT NULL
    AND company_id = (
      SELECT p2.company_id FROM profiles p2 WHERE p2.id = auth.uid()
    )
  );
