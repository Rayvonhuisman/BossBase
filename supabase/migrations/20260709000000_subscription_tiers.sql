-- Abonnementstiers: Starter / Groei / Team
-- ──────────────────────────────────────────────────────────────────────────────
-- De tier leeft in de bestaande subscriptions.plan kolom (één rij per company).
-- Geen parallel systeem: dit is dezelfde structuur die het super-admin portaal
-- al gebruikt. We hernoemen de oude plan-ids en zetten alle bestaande accounts
-- op 'team' (dit zijn admin-accounts).

-- 1. Zorg dat elk bedrijf een subscription-rij heeft.
INSERT INTO subscriptions (company_id, plan, status, price_per_month)
SELECT id, 'team', 'actief', 59 FROM companies
ON CONFLICT (company_id) DO NOTHING;

-- 2. Hernoem oude plan-ids naar de nieuwe tiernamen (Vakman → Groei,
--    Onderneming → Team). Prijzen blijven ongewijzigd.
UPDATE subscriptions SET plan = 'groei' WHERE plan = 'vakman';
UPDATE subscriptions SET plan = 'team'  WHERE plan = 'onderneming';

-- 3. Alle huidige bestaande accounts zijn admin-accounts → tier 'team'.
UPDATE subscriptions SET plan = 'team', price_per_month = 59;

-- 4. Frontend-leesbaarheid.
--    Veilige reader (SECURITY DEFINER) die ALLEEN de tier van het bedrijf van de
--    ingelogde gebruiker teruggeeft. Zo kunnen gewone teamleden hun tier lezen
--    zonder dat de RLS op subscriptions billing/notities lekt.
CREATE OR REPLACE FUNCTION public.get_company_tier()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.plan
  FROM profiles p
  JOIN subscriptions s ON s.company_id = p.company_id
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_company_tier() TO authenticated;
