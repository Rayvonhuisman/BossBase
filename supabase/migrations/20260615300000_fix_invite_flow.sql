-- ── CONSTRAINT FIX: profiles.role uitbreiden naar huidige codebase-waarden ──
-- De oude constraint stond alleen 'admin' en 'employee' toe; de codebase
-- gebruikt 'medewerker' en 'planner'. Dit veroorzaakte de invite-flow-fout.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin','employee','medewerker','planner']));

-- ── FIX 1: handle_new_user trigger ──────────────────────────────────────────
-- Previous version always set company_id = NULL and role = 'admin'.
-- New version: if a pending invite exists for the email, link to that company.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_company_id uuid;
  v_role       text;
BEGIN
  -- Check for an active, non-expired, non-consumed invite for this email
  SELECT cm.company_id, cm.role
    INTO v_company_id, v_role
    FROM company_members cm
   WHERE cm.email            = NEW.email
     AND cm.invite_token     IS NOT NULL
     AND cm.invite_expires_at > now()
   LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    -- Invited team member: link directly to the existing company
    INSERT INTO profiles (id, full_name, company_id, role)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      v_company_id,
      COALESCE(v_role, 'medewerker')
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      role       = EXCLUDED.role;
  ELSE
    -- New owner: minimal profile, company_id set later via provision_account
    INSERT INTO profiles (id, full_name, role)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      'admin'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── FIX 3 helper: SECURITY DEFINER RPC ──────────────────────────────────────
-- createMissingProfile() can't read company_members via RLS when company_id
-- is NULL (RLS blocks it). This SECURITY DEFINER function bypasses RLS and
-- returns the company_id from any invite for the current user's email.
CREATE OR REPLACE FUNCTION get_invite_company_for_current_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email      text;
  v_company_id uuid;
BEGIN
  -- Get email from auth.users (accessible via SECURITY DEFINER)
  SELECT email INTO v_email
    FROM auth.users
   WHERE id = auth.uid();

  IF v_email IS NULL THEN RETURN NULL; END IF;

  -- Return the company_id from any invite (active or accepted)
  SELECT cm.company_id INTO v_company_id
    FROM company_members cm
   WHERE cm.email      = v_email
     AND cm.company_id IS NOT NULL
   ORDER BY cm.invited_at DESC
   LIMIT 1;

  RETURN v_company_id;
END;
$$;

-- ── FIX 4: correcteer het poepje200@gmail.com account ───────────────────────
-- Profielrij verwijzen naar Niels zijn bedrijf + juiste rol
UPDATE profiles
   SET company_id = 'd32740ee-3980-4742-8d45-f99eb3ae7101',
       role       = 'medewerker'
 WHERE id = 'd83ad96a-42f1-40b9-8c43-e45dbb42d3bc';

-- Opruimen: alle tabellen met een company_id FK (DELETE is no-op als rijen al leeg zijn)
DELETE FROM bedrijfsinstellingen      WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
DELETE FROM pipeline_stages           WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
DELETE FROM dashboard_widgets         WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
DELETE FROM email_templates           WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
DELETE FROM accounting_connections    WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
DELETE FROM google_calendar_connections WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
DELETE FROM notifications             WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
DELETE FROM sent_emails               WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
DELETE FROM company_members           WHERE company_id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';

-- Nu het lege bedrijf verwijderen (geen FK-referenties meer)
DELETE FROM companies WHERE id = 'b15931d8-65f3-4f1e-a721-1f89f53146e5';
