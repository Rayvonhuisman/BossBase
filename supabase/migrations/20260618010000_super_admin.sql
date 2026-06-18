-- profiles.is_super_admin
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

UPDATE profiles SET is_super_admin = true
WHERE id IN (
  SELECT p.id FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email IN ('info@bossbase.nl', 'nielsgrevink@gmail.com')
);

-- companies.status (actief / trial / geblokkeerd)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS status text DEFAULT 'actief';

-- Super admin mag companies updaten
CREATE POLICY "super_admin_update_companies" ON companies
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true));

-- subscriptions tabel (één per bedrijf)
CREATE TABLE IF NOT EXISTS subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan            text NOT NULL DEFAULT 'trial',
  status          text NOT NULL DEFAULT 'trial',
  price_per_month numeric DEFAULT 0,
  trial_ends_at   timestamptz DEFAULT now() + interval '14 days',
  started_at      timestamptz DEFAULT now(),
  cancelled_at    timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON subscriptions
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true));

-- Seed: geef elk bestaand bedrijf een trial subscription
INSERT INTO subscriptions (company_id, plan, status, price_per_month)
SELECT id, 'trial', 'trial', 0 FROM companies
ON CONFLICT (company_id) DO NOTHING;
