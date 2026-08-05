-- =============================================================================
-- 20260805120000_trial_mails.sql
--
-- DE TRIAL-MAILSEQUENTIE.
--
-- Vijf mails die de 14 gratis dagen begeleiden en de weken erna. Ze gaan van
-- BossBase naar onze klant — niet te verwarren met check-herinneringen, dat
-- mails van ONZE klant naar ZIJN klanten verstuurt. Andere afzender, andere
-- branding, andere ontvanger; daarom een eigen functie en een eigen cron.
--
-- WANNEER. De dagnummers zijn intern; de teksten zijn de afspraak met de klant.
-- Waar die twee botsen wint de tekst. Alles hangt daarom aan trial_ends_at:
--
--   mail 7   trial_ends_at − 7    "je bent nu een week bezig"
--   mail 11  trial_ends_at − 3    "je proefperiode loopt nog 3 dagen"
--   mail 14  trial_ends_at − 1    "morgen loopt je proefperiode af"
--   mail 15  trial_ends_at + 1    "je proefperiode is afgelopen"
--   mail 30  trial_ends_at + 15   "het is twee weken geleden dat…"
--
-- Let op mail 14: die valt op dag 13 vanaf de start, niet op dag 14. Anders zou
-- "morgen loopt je proefperiode af" op de laatste dag zelf aankomen, en dan
-- klopt het woord morgen niet meer. En mail 15 gaat een dag ná trial_ends_at,
-- zodat het account op dat moment gegarandeerd read-only is — de mail zegt
-- immers dat het op pauze staat.
--
-- ALLEEN ZONDER ABONNEMENT. Sluit iemand op dag 9 af, dan stopt de reeks daar.
-- Dat is geen filter achteraf maar de kern van bb_trial_mail_kandidaten().
--
-- IDEMPOTENT via een primaire sleutel op (company_id, mail), niet via een
-- SELECT-dan-INSERT. Twee cronruns die elkaar overlappen leveren dan nooit twee
-- mails op — dezelfde aanpak als bb_claim_welkomstmail.
-- =============================================================================

BEGIN;

-- ── 1. WAT IS ER AL VERSTUURD ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trial_mails (
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mail         smallint    NOT NULL,
  verstuurd_op timestamptz NOT NULL DEFAULT now(),
  naar         text,
  message_id   text,
  PRIMARY KEY (company_id, mail)
);

COMMENT ON TABLE public.trial_mails IS
  'Welke trial-mail wanneer naar welk bedrijf is gegaan. De primaire sleutel is de idempotentiegrendel: één mail per nummer per bedrijf, ooit.';
COMMENT ON COLUMN public.trial_mails.mail IS
  'Dagnummer van de mail in de reeks: 7, 11, 14, 15 of 30.';

ALTER TABLE public.trial_mails ENABLE ROW LEVEL SECURITY;

-- Alleen de service-role (de cron) schrijft hier. Een bedrijf mag zien wat het
-- zelf heeft gekregen; dat kan later van pas komen in het super-admin portaal.
DROP POLICY IF EXISTS trial_mails_select ON public.trial_mails;
CREATE POLICY trial_mails_select ON public.trial_mails
  FOR SELECT TO authenticated
  USING (company_id = public.bb_current_company());

-- ── 1b. UITSLUITEN ───────────────────────────────────────────────────────────
-- Sommige bedrijven horen deze reeks nooit te krijgen. Glasmeesters is onze
-- testpartner; een mail "je proefperiode loopt af" hoort daar niet te landen,
-- ook niet als hun abonnementsstatus ooit verandert.
--
-- Bewust een EXPLICIETE vlag en geen afleiding uit de status. Een regel als
-- "sla bedrijven met status actief over" klapt om zodra iemand een status
-- handmatig terugzet of een abonnement afloopt — precies de momenten waarop je
-- er niet aan denkt. Een vlag zegt wat hij doet en blijft staan.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_mails_uitgesloten boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.trial_mails_uitgesloten IS
  'Dit bedrijf krijgt nooit trial-mails. Voor testpartners en voor bedrijven van vóór de invoering van de reeks. Raakt alleen deze campagne — transactionele mail (bevestiging, betaalprobleem) gaat altijd door.';

-- Alle bedrijven die op dit moment bestaan, uitsluiten. De reeks is bedoeld voor
-- klanten die zich vanaf nu registreren; wie er al is, is de proefperiode allang
-- voorbij of heeft een andere afspraak. Dit dekt de vier bestaande bedrijven
-- (BossBase Admin, Dakdekker Niels, QA Demo Schilderwerken, Glasmeesters) en
-- meteen ook alles wat er tussen het schrijven en het draaien van deze migratie
-- nog bij mocht komen.
UPDATE public.companies SET trial_mails_uitgesloten = true;

-- ── 2. WIE KRIJGT VANDAAG WELKE MAIL? ────────────────────────────────────────
-- Eén functie die het hele antwoord geeft: bedrijf, mailnummer, ontvanger,
-- aanhef en de einddatum van de proefperiode. De edge function hoeft dan niets
-- meer te beslissen — die stuurt alleen nog.
--
-- Voorwaarden om in aanmerking te komen:
--   • niet uitgesloten (companies.trial_mails_uitgesloten);
--   • status 'trial' en nog nooit een Stripe-abonnement gehad;
--   • een trial_ends_at die op de juiste afstand van vandaag ligt;
--   • deze mail nog niet eerder gehad;
--   • een e-mailadres om naartoe te sturen.
CREATE OR REPLACE FUNCTION public.bb_trial_mail_kandidaten(p_vandaag date DEFAULT current_date)
RETURNS TABLE (
  company_id    uuid,
  mail          smallint,
  naar          text,
  naam          text,
  bedrijfsnaam  text,
  trial_eindigt date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH schema AS (
    -- Verschuiving ten opzichte van trial_ends_at, per mail.
    SELECT * FROM (VALUES
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
$$;

REVOKE ALL ON FUNCTION public.bb_trial_mail_kandidaten(date) FROM public, anon, authenticated;

-- ── 3. CLAIMEN ───────────────────────────────────────────────────────────────
-- Legt de mail vast vóór het versturen. Geeft true aan wie hem als eerste te
-- pakken krijgt; alle volgende aanroepen krijgen false. Zo kan een tweede
-- cronrun of een handmatige aanroep nooit een dubbele mail veroorzaken.
CREATE OR REPLACE FUNCTION public.bb_claim_trial_mail(
  p_company_id uuid,
  p_mail       smallint,
  p_naar       text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.trial_mails (company_id, mail, naar)
  VALUES (p_company_id, p_mail, p_naar);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.bb_claim_trial_mail(uuid, smallint, text) FROM public, anon, authenticated;

-- Mislukt het versturen, dan geven we de claim terug zodat morgen een nieuwe
-- poging volgt. Een klant zonder mail is vervelender dan een dag vertraging.
CREATE OR REPLACE FUNCTION public.bb_geef_trial_mail_vrij(p_company_id uuid, p_mail smallint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.trial_mails WHERE company_id = p_company_id AND mail = p_mail
$$;

REVOKE ALL ON FUNCTION public.bb_geef_trial_mail_vrij(uuid, smallint) FROM public, anon, authenticated;

-- Message-id vastleggen ná verzending, zodat je een mail kunt terugvinden.
CREATE OR REPLACE FUNCTION public.bb_trial_mail_verstuurd(
  p_company_id uuid, p_mail smallint, p_message_id text
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.trial_mails SET message_id = p_message_id
   WHERE company_id = p_company_id AND mail = p_mail
$$;

REVOKE ALL ON FUNCTION public.bb_trial_mail_verstuurd(uuid, smallint, text) FROM public, anon, authenticated;

-- ── 4. DAGELIJKSE CRON ───────────────────────────────────────────────────────
-- Kwartier na check-herinneringen, zodat de twee elkaar niet in de weg zitten
-- op de edge-functie-limieten. Zelfde vorm als de bestaande jobs.
SELECT cron.unschedule('trial-mails-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trial-mails-daily');

-- De sleutel komt uit de vault, net als bij check-herinneringen-daily. Let op:
-- de oudere migratie 20260615100000_cron_jobs.sql gebruikt hiervoor
-- current_setting('app.service_role_key'), en die instelling BESTAAT NIET in
-- deze database. De job die daar live draait is later met de hand omgezet naar
-- de vault; het bestand in de repo is nooit bijgewerkt. Wie dat patroon
-- overneemt bouwt een cron die bij de eerste run stukloopt op een ontbrekende
-- instelling — en dat merk je pas als er wekenlang geen mail is verstuurd.
SELECT cron.schedule(
  'trial-mails-daily',
  '15 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/trial-mails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_cron_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);

COMMIT;
