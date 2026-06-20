-- =============================================================================
-- Fix registratie-flow: kip-en-ei RLS-probleem + email-confirmatie-flow
--
-- Problemen:
--  1. insertWithFallback doet .select() na company INSERT, maar de SELECT-policy
--     kijkt naar profiles.company_id — die nog niet bestaat → 0 rows → crash.
--  2. Als Supabase email-confirmatie vereist, geeft signUp() geen session terug.
--     Alle INSERT-pogingen draaien dan als anon → RLS blokkeert ze.
--
-- Oplossing:
--  A. Trigger: maak minimaal profiel aan zodra auth.users een rij krijgt
--     (SECURITY DEFINER, bypast RLS volledig).
--  B. provision_account(): SECURITY DEFINER RPC die company + profiel atomair
--     aanmaakt/bijwerkt. App roept dit aan na login, niet tijdens signUp.
--  C. Backfill: maak profielen aan voor bestaande auth-users zonder profiel.
-- =============================================================================

-- ── A. Trigger: profiel aanmaken bij nieuwe auth-user ────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── B. provision_account(): atomaire company + profiel aanmaken ───────────────
-- Bypast RLS volledig dankzij SECURITY DEFINER.
-- Wordt aangeroepen vanuit de app nadat de user daadwerkelijk is ingelogd.

CREATE OR REPLACE FUNCTION public.provision_account(
  p_company_name TEXT,
  p_full_name    TEXT    DEFAULT NULL,
  p_email        TEXT    DEFAULT NULL,
  p_phone        TEXT    DEFAULT NULL,
  p_kvk          TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_company_id UUID;
  v_existing   UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Profiel heeft al een company? Dan alleen full_name bijwerken.
  SELECT company_id INTO v_existing
  FROM profiles
  WHERE id = v_user_id;

  IF v_existing IS NOT NULL THEN
    IF p_full_name IS NOT NULL THEN
      UPDATE profiles SET full_name = p_full_name WHERE id = v_user_id;
    END IF;
    RETURN json_build_object('company_id', v_existing, 'status', 'existing');
  END IF;

  -- Nieuwe company aanmaken
  INSERT INTO companies (name, email, phone, kvk)
  VALUES (
    p_company_name,
    NULLIF(p_email, ''),
    NULLIF(p_phone, ''),
    NULLIF(p_kvk, '')
  )
  RETURNING id INTO v_company_id;

  -- Profiel aanmaken of bijwerken met company_id
  INSERT INTO profiles (id, company_id, full_name, role)
  VALUES (
    v_user_id,
    v_company_id,
    COALESCE(NULLIF(p_full_name, ''), split_part(p_email, '@', 1), 'Gebruiker'),
    'admin'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    full_name  = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    role       = 'admin';

  -- Default pipeline-fasen aanmaken
  INSERT INTO pipeline_stages (company_id, name, position)
  VALUES
    (v_company_id, 'Nieuwe aanvraag',    0),
    (v_company_id, 'Contact opgenomen',  1),
    (v_company_id, 'Afspraak gepland',   2),
    (v_company_id, 'Offerte verstuurd',  3),
    (v_company_id, 'Akkoord',            4),
    (v_company_id, 'In uitvoering',      5),
    (v_company_id, 'Afgerond',           6)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('company_id', v_company_id, 'status', 'created');
END;
$$;

-- ── C. Backfill: minimale profielen voor bestaande users zonder profiel ───────
-- (waaronder poepje200@gmail.com, id 2a65e241-d936-4c39-81bd-9bf8eb87902c)

INSERT INTO public.profiles (id, full_name, role)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    split_part(u.email, '@', 1),
    'Gebruiker'
  ),
  'admin'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
