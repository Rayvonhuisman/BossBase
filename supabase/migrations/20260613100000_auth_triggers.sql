-- ── TRIGGER: auto-profiel bij nieuwe auth gebruiker ─────────────────────────
-- Draait als SECURITY DEFINER (postgres) zodat RLS op profiles omzeild wordt.
-- Profiles heeft geen email kolom, company_id is nullable (wordt later gezet).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    'admin'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── RLS FIX: companies INSERT ─────────────────────────────────────────────────
-- Bestaande policy staat authenticated inserts toe (with_check: true).
-- Vervang deze door een expliciete policy die ook werkt als profiel nog geen
-- company_id heeft (net geregistreerde gebruiker).
DROP POLICY IF EXISTS "Authenticated users can create companies" ON public.companies;
DROP POLICY IF EXISTS "companies_insert_own" ON public.companies;
CREATE POLICY "companies_insert_own" ON public.companies
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
  );

-- ── RLS FIX: profiles INSERT ─────────────────────────────────────────────────
-- Bestaande policy staat alleen eigen rij toe. Laat ook trigger-gecreëerde
-- rijen door UPDATE bijwerken (UPDATE policy staat dat al toe via auth.uid()).
DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());
