-- Instelbaar antwoord-(reply-to)-adres per bedrijf.
-- Mails worden verzonden vanaf noreply@bossbase.nl; antwoorden van klanten
-- gaan via de reply-to header naar dit adres.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS reply_to_email text;
