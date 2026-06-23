-- ============================================================================
-- E-MAILVERIFICATIE met 6-cijferige code (eigen token-flow, Optie B)
-- Blauwdruk: password_reset_tokens / password_reset_attempts
-- ============================================================================

-- ── Codes (gehasht opgeslagen, 10 min geldig) ───────────────────────────────
-- RLS aan zonder client-policies = alleen de service-role (edge functions
-- request-verification-code / verify-code) kan lezen/schrijven.
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  email       text NOT NULL,
  code_hash   text NOT NULL,            -- SHA-256(code + ':' + user_id), nooit plain
  expires_at  timestamptz NOT NULL,
  verified_at timestamptz,
  attempts    int DEFAULT 0,            -- aantal foute pogingen op deze code
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_evc_user ON public.email_verification_codes (user_id);

-- ── Rate limiting per e-mailadres ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_verification_attempts (
  email        text PRIMARY KEY,
  last_sent    timestamptz DEFAULT now(),
  send_count   int DEFAULT 1,
  window_start timestamptz DEFAULT now()
);
ALTER TABLE public.email_verification_attempts ENABLE ROW LEVEL SECURITY;

-- ── Verificatiestatus op profiles ───────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- ── STAP 7 — bestaande accounts markeren als geverifieerd ───────────────────
-- Zo worden de huidige gebruikers niet plots buitengesloten.
UPDATE public.profiles SET email_verified_at = created_at WHERE email_verified_at IS NULL;
