-- ── Rate-limit teller voor de send-email edge function ──────────────────────
-- Zelfde patroon als password_reset_attempts: RLS aan ZONDER policies, dus
-- uitsluitend benaderbaar door de service_role (de edge function). Per
-- ingelogde gebruiker wordt bijgehouden hoeveel mails er in het lopende
-- uurvenster zijn verstuurd, zodat een gekaapte/misbruikte sessie geen
-- ongelimiteerde mail kan versturen. Systeemmails (interne aanroepers met het
-- gedeelde secret) tellen hier NIET mee.
CREATE TABLE IF NOT EXISTS public.email_send_attempts (
  user_id       uuid PRIMARY KEY,
  last_attempt  timestamptz DEFAULT now(),
  attempt_count int DEFAULT 1,
  window_start  timestamptz DEFAULT now()
);

ALTER TABLE public.email_send_attempts ENABLE ROW LEVEL SECURITY;
-- Bewust geen policies: alleen service_role (edge function) mag lezen/schrijven.
