-- ── Eigen wachtwoord-reset tokens (vervangt Supabase auth reset mail) ────────
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL,
  email      text NOT NULL,
  token      uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (token)
);

-- Alleen toegankelijk via service_role (edge functions)
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Helper: zoek auth user_id op via email (SECURITY DEFINER, bypast RLS op auth.users)
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;
