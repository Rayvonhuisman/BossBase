-- =============================================================================
-- 20261008093220_trial_mail_dag3.sql
--
-- Een extra proefperiodemail op dag 3: "Je eerste offerte staat in 5 minuten
-- klaar". Afgesproken met Niels op 2026-10-06, samen met de nieuwe opmaak van de
-- hele reeks (supabase/functions/_shared/trialMails.ts).
--
-- Net als de rest hangt hij aan trial_ends_at: de proef duurt 14 dagen, dus
-- dag 3 vanaf de start is trial_ends_at − 11. Alleen de waardenlijst in
-- bb_trial_mail_kandidaten verandert; claimen, vastleggen en vrijgeven werken
-- per nummer en kennen geen vaste lijst.
--
-- Wie op het moment van uitrollen al voorbij dag 3 is, krijgt hem niet meer:
-- de functie kijkt naar precies vandaag, niet naar "gemist". Dat is bewust; een
-- mail "je eerste offerte" op dag 9 klopt niet meer.
--
-- CREATE OR REPLACE met dezelfde signatuur en hetzelfde retourtype: de functie
-- blijft bestaan en houdt zijn rechten (alleen service_role). Toch zetten we ze
-- hieronder opnieuw, zodat dat niet van die aanname afhangt.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bb_trial_mail_kandidaten(p_vandaag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(company_id uuid, mail smallint, naar text, naam text, bedrijfsnaam text, trial_eindigt date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH schema AS (
    -- Verschuiving ten opzichte van trial_ends_at, per mail.
    SELECT * FROM (VALUES
      (3::smallint,  -11),
      (7::smallint,  -7),
      (11::smallint, -3),
      (14::smallint, -1),
      (15::smallint,  1),
      (30::smallint, 15)
    ) AS s(mail, verschuiving)
  ),
  -- De eigenaar/admin van het bedrijf. Bij meerdere admins de oudste, zodat het
  -- altijd dezelfde persoon is en niet per dag wisselt.
  eigenaar AS (
    SELECT DISTINCT ON (p.company_id)
           p.company_id, u.email AS email, p.full_name
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'admin'
      AND COALESCE(p.actief, true)
      AND p.verwijderd_op IS NULL
    ORDER BY p.company_id, p.created_at
  )
  SELECT
    c.id,
    s.mail,
    COALESCE(e.email, c.email)                                        AS naar,
    -- Voornaam van de eigenaar; anders de bedrijfsnaam. Nooit leeg, want
    -- "Hoi ," is erger dan een bedrijfsnaam in de aanhef.
    COALESCE(NULLIF(split_part(COALESCE(e.full_name, ''), ' ', 1), ''),
             NULLIF(c.name, ''), 'daar')                              AS naam,
    c.name                                                            AS bedrijfsnaam,
    sub.trial_ends_at::date                                           AS trial_eindigt
  FROM public.companies c
  JOIN public.subscriptions sub ON sub.company_id = c.id
  LEFT JOIN eigenaar e ON e.company_id = c.id
  CROSS JOIN schema s
  WHERE sub.status = 'trial'
    -- Uitgesloten bedrijven vallen er hier uit, vóór elke andere voorwaarde.
    AND NOT COALESCE(c.trial_mails_uitgesloten, false)
    -- Nooit een abonnement afgesloten. Zodra hier iets staat, stopt de reeks.
    AND sub.stripe_subscription_id IS NULL
    AND sub.stripe_customer_id IS NULL
    AND sub.trial_ends_at IS NOT NULL
    AND (sub.trial_ends_at::date + s.verschuiving) = p_vandaag
    AND COALESCE(e.email, c.email) IS NOT NULL
    AND COALESCE(e.email, c.email) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.trial_mails tm
      WHERE tm.company_id = c.id AND tm.mail = s.mail
    )
$function$
;

REVOKE ALL ON FUNCTION public.bb_trial_mail_kandidaten(date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bb_trial_mail_kandidaten(date) TO service_role;

COMMENT ON COLUMN public.trial_mails.mail IS
  'Dagnummer van de mail in de reeks: 3, 7, 11, 14, 15 of 30.';

COMMIT;

notify pgrst, 'reload schema';
