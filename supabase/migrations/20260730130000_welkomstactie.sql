-- =============================================================================
-- 20260730130000_welkomstactie.sql
--
-- WELKOMSTACTIE bij een jaarabonnement.
--
-- Een jaarabonnement is gewoon 12 maanden maandelijks betalen. Het voordeel zit
-- in één welkomstactie die de klant daarbij kiest:
--   A) gratis_maanden — de eerste 2 maanden gratis (60 dagen proefperiode in
--                       Stripe, daarna de normale maandprijs).
--   B) gratis_website — wij bouwen eenmalig een website. GEEN proefperiode:
--                       betalen vanaf maand 1. Niet beschikbaar bij Starter.
--
-- Precies één van de twee, en achteraf niet meer te wisselen. Dat laatste is
-- geen detail: zonder die grendel neemt iemand eerst de twee gratis maanden en
-- claimt daarna alsnog de website. De grendel zit daarom in een trigger op de
-- tabel, niet in de edge function — dan kan geen enkele route eromheen.
-- =============================================================================

BEGIN;

-- ── 1. DE KEUZE ───────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS welkomstactie            text,
  ADD COLUMN IF NOT EXISTS welkomstactie_gekozen_op timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_welkomstactie_chk') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_welkomstactie_chk
      CHECK (welkomstactie IS NULL OR welkomstactie IN ('gratis_maanden', 'gratis_website'));
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.welkomstactie IS
  'Eenmalige welkomstactie bij een jaarabonnement: gratis_maanden of gratis_website. NULL = maandabonnement of nog niets gekozen. Onwijzigbaar zodra gezet.';

-- ── 2. DE GRENDEL ─────────────────────────────────────────────────────────────
-- Eenmaal gekozen blijft gekozen. Terugzetten naar NULL mag ook niet: dat zou de
-- grendel omzeilbaar maken in twee stappen.
CREATE OR REPLACE FUNCTION public.bb_welkomstactie_onwijzigbaar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.welkomstactie IS NOT NULL
     AND NEW.welkomstactie IS DISTINCT FROM OLD.welkomstactie THEN
    RAISE EXCEPTION 'De welkomstactie is al gekozen (%) en kan niet meer worden gewijzigd', OLD.welkomstactie
      USING ERRCODE = 'check_violation', HINT = 'welkomstactie_vast';
  END IF;
  IF NEW.welkomstactie IS NOT NULL AND NEW.welkomstactie_gekozen_op IS NULL THEN
    NEW.welkomstactie_gekozen_op := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_welkomstactie_onwijzigbaar ON public.subscriptions;
CREATE TRIGGER trg_welkomstactie_onwijzigbaar BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.bb_welkomstactie_onwijzigbaar();

-- ── 3. KEUZE VASTLEGGEN ───────────────────────────────────────────────────────
-- Eén doorgang voor de webhook, met alle regels erin. Geeft terug wat er is
-- gebeurd zodat de aanroeper weet of er nog iets moet volgen (de website-mail).
CREATE OR REPLACE FUNCTION public.bb_registreer_welkomstactie(
  p_company_id uuid,
  p_actie      text,
  p_interval   text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_huidig text;
  v_tier   text;
BEGIN
  IF p_actie IS NULL OR p_actie = '' THEN RETURN 'geen actie'; END IF;

  -- Een welkomstactie hoort uitsluitend bij een jaarabonnement.
  IF p_interval IS DISTINCT FROM 'jaar' THEN
    RETURN 'genegeerd: welkomstactie hoort bij een jaarabonnement';
  END IF;

  SELECT welkomstactie INTO v_huidig FROM public.subscriptions WHERE company_id = p_company_id;
  IF NOT FOUND THEN RETURN 'genegeerd: bedrijf zonder abonnementsrij'; END IF;

  -- Al gekozen: nooit stilzwijgend vervangen (de trigger zou het ook weigeren,
  -- maar zo krijgt de webhook een net antwoord in plaats van een fout).
  IF v_huidig IS NOT NULL THEN
    RETURN CASE WHEN v_huidig = p_actie
      THEN 'ongewijzigd: ' || v_huidig
      ELSE 'geweigerd: er is al een andere welkomstactie gekozen (' || v_huidig || ')' END;
  END IF;

  v_tier := public.bb_effective_tier(p_company_id);

  -- De gratis website is niet beschikbaar bij Starter.
  IF p_actie = 'gratis_website' AND v_tier = 'starter' THEN
    RETURN 'geweigerd: de gratis website hoort niet bij Starter';
  END IF;

  UPDATE public.subscriptions
     SET welkomstactie = p_actie, welkomstactie_gekozen_op = now()
   WHERE company_id = p_company_id;

  RETURN 'vastgelegd: ' || p_actie;
END;
$$;

REVOKE ALL ON FUNCTION public.bb_registreer_welkomstactie(uuid, text, text) FROM public, anon, authenticated;

-- ── 4. WEBSITE-AANVRAGEN ──────────────────────────────────────────────────────
-- Eén aanvraag per bedrijf (de actie is eenmalig). De UNIQUE op company_id maakt
-- het aanmaken vanuit de webhook meteen idempotent bij een herhaalde levering.
CREATE TABLE IF NOT EXISTS public.website_aanvragen (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'open',
  aangevraagd_op    timestamptz NOT NULL DEFAULT now(),
  mail_verstuurd_op timestamptz,
  opgeleverd_op     timestamptz,
  notitie           text,
  CONSTRAINT website_aanvragen_status_chk
    CHECK (status IN ('open', 'gegevens_gevraagd', 'in_behandeling', 'opgeleverd', 'geannuleerd'))
);

CREATE INDEX IF NOT EXISTS idx_website_aanvragen_status
  ON public.website_aanvragen (status, aangevraagd_op DESC);

ALTER TABLE public.website_aanvragen ENABLE ROW LEVEL SECURITY;

-- Het bedrijf mag zijn eigen aanvraag zien (status in de abonnementssectie).
DROP POLICY IF EXISTS website_aanvragen_eigen ON public.website_aanvragen;
CREATE POLICY website_aanvragen_eigen ON public.website_aanvragen FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Beheren doet BossBase zelf, via het super-admin portaal.
DROP POLICY IF EXISTS website_aanvragen_super_admin ON public.website_aanvragen;
CREATE POLICY website_aanvragen_super_admin ON public.website_aanvragen FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin))
  WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin));

-- Aanmaken doet uitsluitend de webhook (service_role) via deze functie, zodat
-- een klant zichzelf geen website kan toekennen.
CREATE OR REPLACE FUNCTION public.bb_open_website_aanvraag(p_company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nieuw boolean := false;
BEGIN
  -- Alleen als de klant daadwerkelijk voor de website heeft gekozen.
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE company_id = p_company_id AND welkomstactie = 'gratis_website'
  ) THEN
    RETURN 'genegeerd: geen websitekeuze vastgelegd';
  END IF;

  INSERT INTO public.website_aanvragen (company_id, status)
  VALUES (p_company_id, 'open')
  ON CONFLICT (company_id) DO NOTHING;

  GET DIAGNOSTICS v_nieuw = ROW_COUNT;
  RETURN CASE WHEN v_nieuw THEN 'aangemaakt' ELSE 'bestond al' END;
END;
$$;

REVOKE ALL ON FUNCTION public.bb_open_website_aanvraag(uuid) FROM public, anon, authenticated;

-- ── 5. STATUS VOOR DE UI ──────────────────────────────────────────────────────
-- get_billing_status() uitbreiden met de keuze en de stand van de aanvraag.
CREATE OR REPLACE FUNCTION public.get_billing_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tier',               public.bb_effective_tier(c.id),
    'status',             s.status,
    'stripeStatus',       s.stripe_status,
    'heeftStripe',        (s.stripe_subscription_id IS NOT NULL),
    'billingInterval',    s.billing_interval,
    'extraGebruikers',    s.extra_gebruikers,
    'trial',              public.bb_is_trial(c.id),
    'trialEindigtOp',     s.trial_ends_at,
    'periodeStart',       s.current_period_start,
    'verlengtOp',         s.current_period_end,
    'opzeggenPerEindePeriode', s.cancel_at_period_end,
    'magBeheren',         public.bb_mag_abonnement_beheren(),
    'welkomstactie',      s.welkomstactie,
    'welkomstactieGekozenOp', s.welkomstactie_gekozen_op,
    'websiteAanvraag',    (SELECT jsonb_build_object('status', w.status, 'aangevraagdOp', w.aangevraagd_op)
                           FROM public.website_aanvragen w WHERE w.company_id = c.id),
    'modules',            COALESCE((SELECT jsonb_agg(cm.module_key)
                                    FROM public.company_modules cm
                                    WHERE cm.company_id = c.id AND cm.actief), '[]'::jsonb),
    'limieten',           COALESCE((SELECT jsonb_object_agg(pl.limit_key, jsonb_build_object(
                                      'max',      public.bb_limit(c.id, pl.limit_key),
                                      'gebruikt', public.bb_usage(c.id, pl.limit_key)))
                                    FROM public.plan_limits pl
                                    WHERE pl.plan = public.bb_effective_tier(c.id)), '{}'::jsonb)
  )
  FROM public.companies c
  JOIN public.subscriptions s ON s.company_id = c.id
  WHERE c.id = public.bb_current_company()
$$;

REVOKE ALL ON FUNCTION public.get_billing_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_status() TO authenticated;

-- ── 6. OVERZICHT VOOR BOSSBASE ────────────────────────────────────────────────
-- Welke aanvragen staan open? Alleen voor super-admins; geeft meteen de
-- bedrijfsgegevens mee zodat het portaal niets hoeft na te vragen.
CREATE OR REPLACE FUNCTION public.get_website_aanvragen()
RETURNS TABLE (
  id uuid, company_id uuid, bedrijf text, email text, telefoon text,
  status text, aangevraagd_op timestamptz, mail_verstuurd_op timestamptz,
  opgeleverd_op timestamptz, notitie text, plan text, hosting_actief boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.company_id, c.name, c.email, c.phone,
         w.status, w.aangevraagd_op, w.mail_verstuurd_op, w.opgeleverd_op, w.notitie,
         s.plan,
         EXISTS (SELECT 1 FROM public.company_modules m
                 WHERE m.company_id = c.id AND m.module_key = 'hosting' AND m.actief)
  FROM public.website_aanvragen w
  JOIN public.companies c     ON c.id = w.company_id
  LEFT JOIN public.subscriptions s ON s.company_id = c.id
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  ORDER BY (w.status = 'open') DESC, w.aangevraagd_op DESC
$$;

REVOKE ALL ON FUNCTION public.get_website_aanvragen() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_website_aanvragen() TO authenticated;

COMMIT;
