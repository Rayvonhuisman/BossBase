-- ============================================================================
-- 010_google_calendar.sql
-- Google Calendar integration (one-way sync: BossBase -> Google Calendar).
--
-- Security model:
--   * google_calendar_connections holds OAuth tokens. RLS is ENABLED but NO
--     policies are granted to the `authenticated`/`anon` roles, so the
--     frontend (which uses the anon key + a user JWT) can NEVER read or write
--     this table directly — tokens are therefore never exposed to the client.
--   * Edge Functions use the SERVICE ROLE key, which bypasses RLS, to read
--     tokens and to write the connection row after the OAuth callback.
--   * The frontend interacts only through two SECURITY DEFINER RPCs that
--     return / mutate strictly non-sensitive columns for the calling user.
-- ============================================================================

-- ── Shared updated_at trigger fn (idempotent — also defined in earlier migs) ─
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── Connections table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  google_email        text,
  google_calendar_id  text        DEFAULT 'primary',
  access_token        text,
  refresh_token       text,
  token_expiry        timestamptz,
  is_connected        boolean     DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only the service role (Edge Functions) may touch
-- this table. The frontend uses the RPCs below.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'google_calendar_connections_updated_at') THEN
    CREATE TRIGGER google_calendar_connections_updated_at
      BEFORE UPDATE ON google_calendar_connections
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- ── Safe status RPC (no tokens) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.google_calendar_status()
RETURNS TABLE (
  connected          boolean,
  google_email       text,
  google_calendar_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(c.is_connected, false) AS connected,
    c.google_email,
    c.google_calendar_id
  FROM google_calendar_connections c
  WHERE c.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.google_calendar_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.google_calendar_status() TO authenticated;

-- ── Disconnect RPC (removes the row for the calling user) ───────────────────
CREATE OR REPLACE FUNCTION public.google_calendar_disconnect()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM google_calendar_connections WHERE user_id = auth.uid();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.google_calendar_disconnect() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.google_calendar_disconnect() TO authenticated;

-- ── Activities: per-activity sync state ─────────────────────────────────────
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS google_event_id           text,
  ADD COLUMN IF NOT EXISTS google_calendar_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_sync_status        text DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS google_sync_error         text;

-- ── Company-level auto-sync toggle (default ON for the MVP) ─────────────────
ALTER TABLE bedrijfsinstellingen
  ADD COLUMN IF NOT EXISTS auto_sync_google_calendar boolean NOT NULL DEFAULT true;
