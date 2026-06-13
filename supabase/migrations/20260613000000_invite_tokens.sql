-- ── INVITE TOKENS OP COMPANY_MEMBERS ────────────────────────────────────────
ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS invite_token uuid,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_company_name text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_members_invite_token
  ON company_members (invite_token)
  WHERE invite_token IS NOT NULL;
