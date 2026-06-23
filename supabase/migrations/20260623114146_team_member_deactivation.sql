-- Teamlid deactiveren/verwijderen.
-- `actief = false` betekent: account is gedeactiveerd → kan niet inloggen en
-- wordt bij de eerstvolgende profiel-load uitgelogd (gate in App.jsx).
-- Omkeerbaar via heractiveren. Verwijderen gebeurt hard via de
-- edge function delete-team-member (auth.users + profiel weg).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS actief boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- Sneller filteren op actieve teamleden per bedrijf (dropdowns/planning).
CREATE INDEX IF NOT EXISTS idx_profiles_company_actief
  ON public.profiles (company_id, actief);

COMMENT ON COLUMN public.profiles.actief IS
  'false = gedeactiveerd: account kan niet inloggen en wordt bij volgende profiel-load uitgelogd. Omkeerbaar via heractiveren.';
