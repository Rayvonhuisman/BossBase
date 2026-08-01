-- =============================================================================
-- 20260730120000_stripe_billing.sql
--
-- STRIPE BILLING voor de BossBase-abonnementen zelf.
--
-- Let op het verschil met de bestaande Stripe CONNECT-integratie:
--   • Connect  → betalingen van ONZE klanten aan HÚN klanten, op het connected
--                account van het bedrijf (stripe_connections, facturen).
--   • Billing  → abonnementsbetalingen aan BOSSBASE, op ons eigen
--                platform-account. Dat is deze migratie. Geen Stripe-Account
--                header, geen connected account.
--
-- BRON VAN WAARHEID — de kernregel:
--   Zolang subscriptions.stripe_subscription_id LEEG is, is onze database
--   leidend. Dat is de gratis 14-daagse proefperiode uit provision_account,
--   waar nog helemaal geen Stripe-customer bestaat. De webhook mag zo'n rij
--   NOOIT aanraken of "corrigeren". Zodra het veld gevuld is (dat gebeurt
--   uitsluitend bij checkout.session.completed, met onze eigen metadata), is
--   Stripe leidend en volgt de database.
-- =============================================================================

BEGIN;

-- ── 1. ABONNEMENTSKOLOMMEN ────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text,
  ADD COLUMN IF NOT EXISTS stripe_price_id         text,
  ADD COLUMN IF NOT EXISTS stripe_status           text,
  ADD COLUMN IF NOT EXISTS billing_interval        text NOT NULL DEFAULT 'maand',
  ADD COLUMN IF NOT EXISTS extra_gebruikers        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_period_start    timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end      timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end    boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscriptions.stripe_subscription_id IS
  'Leeg = onze database is leidend (gratis DB-proefperiode). Gevuld = Stripe is leidend. Wordt uitsluitend gezet bij checkout.session.completed.';
COMMENT ON COLUMN public.subscriptions.billing_interval IS
  '"maand" of "jaar". Jaar = dezelfde maandprijs met de eerste 2 maanden gratis (60 dagen Stripe-trial), geen aparte jaarprijs.';
COMMENT ON COLUMN public.subscriptions.extra_gebruikers IS
  'Aantal betaalde extra gebruikers bovenop de ene inbegrepen gebruiker. Wordt uit de Stripe-subscription items afgeleid.';

-- Eén bedrijf per Stripe-customer en per Stripe-subscription. Voorkomt dat een
-- webhook-event per ongeluk op twee bedrijven landt.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_customer_key
  ON public.subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_key
  ON public.subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Modules krijgen hun Stripe-item, zodat bijkopen/opzeggen terug te herleiden is.
ALTER TABLE public.company_modules
  ADD COLUMN IF NOT EXISTS stripe_item_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- ── 2. IDEMPOTENTIE ───────────────────────────────────────────────────────────
-- Stripe levert events soms meer dan eens af. De webhook claimt een event door
-- de id hier weg te schrijven; lukt dat niet (unique violation), dan is het al
-- verwerkt en stopt de verwerking.
CREATE TABLE IF NOT EXISTS public.stripe_billing_events (
  event_id     text PRIMARY KEY,
  type         text NOT NULL,
  company_id   uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  verwerkt_op  timestamptz NOT NULL DEFAULT now(),
  resultaat    text
);

ALTER TABLE public.stripe_billing_events ENABLE ROW LEVEL SECURITY;
-- Geen enkele policy: alleen service_role (de webhook) komt erbij.

-- ── 3. WIE MAG HET ABONNEMENT BEHEREN ─────────────────────────────────────────
-- Een APARTE gate, los van het rechtensysteem. Het rechtensysteem gaat over
-- werk (offertes, planning, klanten); dit gaat over geld. Een medewerker met
-- álle werkrechten mag hier dus nog steeds niet bij — alleen de admin/eigenaar
-- van het bedrijf.
CREATE OR REPLACE FUNCTION public.bb_mag_abonnement_beheren(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT p.role = 'admin' AND p.actief IS DISTINCT FROM false
    FROM public.profiles p WHERE p.id = p_user_id
  ), false)
$$;

GRANT EXECUTE ON FUNCTION public.bb_mag_abonnement_beheren(uuid) TO authenticated;

-- ── 4. DOWNGRADE-BLOKKADES ────────────────────────────────────────────────────
-- Downgraden mag niet als het bedrijf boven de limiet van het DOELtier zit.
-- Geeft per limiet terug wat er te veel is, zodat de UI kan tonen wat er weg
-- moet. Lege uitkomst = downgraden mag.
--
-- Bewust NIET afhankelijk van bb_limit(): die geeft tijdens een proefperiode
-- altijd "onbeperkt" terug, en juist bij het afsluiten van een abonnement vanuit
-- de proefperiode moet je wél tegen de echte limiet van het doeltier aanlopen.
CREATE OR REPLACE FUNCTION public.bb_downgrade_blokkades(p_company_id uuid, p_doel_tier text)
RETURNS TABLE (limiet text, label text, gebruikt integer, maximum integer, teveel integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    pl.limit_key,
    CASE pl.limit_key
      WHEN 'gebruikers' THEN 'gebruikers'
      WHEN 'klanten'    THEN 'klanten'
      WHEN 'offertes'   THEN 'offertes deze periode'
      WHEN 'facturen'   THEN 'facturen deze periode'
      ELSE pl.limit_key
    END,
    public.bb_usage(p_company_id, pl.limit_key),
    pl.limit_value,
    public.bb_usage(p_company_id, pl.limit_key) - pl.limit_value
  FROM public.plan_limits pl
  WHERE pl.plan = p_doel_tier
    AND pl.limit_value IS NOT NULL
    AND public.bb_usage(p_company_id, pl.limit_key) > pl.limit_value
$$;

GRANT EXECUTE ON FUNCTION public.bb_downgrade_blokkades(uuid, text) TO authenticated;

-- Gemaksvariant voor de UI: het eigen bedrijf.
CREATE OR REPLACE FUNCTION public.bb_downgrade_blokkades(p_doel_tier text)
RETURNS TABLE (limiet text, label text, gebruikt integer, maximum integer, teveel integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.bb_downgrade_blokkades(public.bb_current_company(), p_doel_tier)
$$;

GRANT EXECUTE ON FUNCTION public.bb_downgrade_blokkades(text) TO authenticated;

-- ── 5. ABONNEMENTSSTATUS VOOR DE UI ───────────────────────────────────────────
-- Uitbreiding op get_plan_status(): dezelfde stand plus de billinggegevens.
-- Apart gehouden zodat get_plan_status() (die overal in de app hangt) niet van
-- vorm verandert.
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

-- ── 6. STRIPE SCHRIJFT TERUG ──────────────────────────────────────────────────
-- Eén plek waar de webhook de abonnementsstand wegschrijft, met de bron-van-
-- waarheid-regel er hard in gebakken. De webhook doet zelf GEEN losse updates op
-- subscriptions — alles loopt hierlangs, zodat de regel niet op één plek kan
-- worden vergeten.
--
-- p_bind = true  → dit is het moment waarop we het abonnement aan Stripe binden
--                  (checkout.session.completed, met onze eigen metadata).
-- p_bind = false → normaal vervolg-event: alleen toegestaan als deze company
--                  al aan DIT subscription-id gekoppeld is.
CREATE OR REPLACE FUNCTION public.bb_stripe_sync_subscription(
  p_company_id      uuid,
  p_subscription_id text,
  p_customer_id     text,
  p_plan            text,
  p_stripe_status   text,
  p_price_id        text,
  p_extra_gebruikers integer,
  p_interval        text,
  p_period_start    timestamptz,
  p_period_end      timestamptz,
  p_cancel_at_end   boolean,
  p_bind            boolean DEFAULT false
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_huidig text;
BEGIN
  IF p_company_id IS NULL OR p_subscription_id IS NULL THEN
    RETURN 'genegeerd: geen bedrijf of subscription';
  END IF;

  SELECT stripe_subscription_id INTO v_huidig
  FROM public.subscriptions WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN 'genegeerd: bedrijf zonder abonnementsrij';
  END IF;

  -- DE REGEL. Zonder gekoppeld abonnement is onze database leidend en blijft de
  -- gratis proefperiode met rust — behalve op het bindmoment zelf.
  IF v_huidig IS NULL AND NOT p_bind THEN
    RETURN 'genegeerd: DB-proefperiode zonder Stripe-abonnement';
  END IF;

  -- Nooit een bestaande koppeling stilzwijgend vervangen door een andere.
  IF v_huidig IS NOT NULL AND v_huidig IS DISTINCT FROM p_subscription_id THEN
    RETURN 'genegeerd: hoort bij een ander Stripe-abonnement';
  END IF;

  UPDATE public.subscriptions SET
    stripe_subscription_id = p_subscription_id,
    stripe_customer_id     = COALESCE(p_customer_id, stripe_customer_id),
    plan                   = COALESCE(p_plan, plan),
    stripe_status          = COALESCE(p_stripe_status, stripe_status),
    stripe_price_id        = COALESCE(p_price_id, stripe_price_id),
    extra_gebruikers       = COALESCE(p_extra_gebruikers, extra_gebruikers),
    billing_interval       = COALESCE(p_interval, billing_interval),
    current_period_start   = COALESCE(p_period_start, current_period_start),
    current_period_end     = COALESCE(p_period_end, current_period_end),
    cancel_at_period_end   = COALESCE(p_cancel_at_end, cancel_at_period_end),
    price_per_month        = COALESCE((SELECT t.prijs FROM (VALUES
                               ('starter', 29::numeric), ('groei', 39), ('team', 59)
                             ) AS t(plan, prijs) WHERE t.plan = p_plan), price_per_month),
    -- Onze eigen status volgt die van Stripe:
    --   trialing              → trial   (de 60-daagse jaarperiode valt hieronder)
    --   active               → actief
    --   past_due/unpaid      → betaalprobleem
    --   canceled/incomplete* → opgezegd
    status = CASE
      WHEN p_stripe_status = 'trialing'                       THEN 'trial'
      WHEN p_stripe_status = 'active'                         THEN 'actief'
      WHEN p_stripe_status IN ('past_due', 'unpaid')          THEN 'betaalprobleem'
      WHEN p_stripe_status IN ('canceled', 'incomplete_expired') THEN 'opgezegd'
      ELSE status
    END,
    -- Bij een Stripe-trial is trial_ends_at het einde van die periode; anders
    -- laten we de oude DB-waarde met rust (die is dan historie).
    trial_ends_at = CASE WHEN p_stripe_status = 'trialing' THEN p_period_end ELSE trial_ends_at END,
    cancelled_at  = CASE WHEN p_stripe_status = 'canceled' THEN now() ELSE cancelled_at END
  WHERE company_id = p_company_id;

  -- De verbrukstellers ankeren op companies.periode_start; die volgt nu de
  -- factuurperiode van Stripe in plaats van de aanmaakdatum van het bedrijf.
  IF p_period_start IS NOT NULL THEN
    UPDATE public.companies SET periode_start = p_period_start::date WHERE id = p_company_id;
  END IF;

  RETURN CASE WHEN v_huidig IS NULL THEN 'gekoppeld' ELSE 'bijgewerkt' END;
END;
$$;

REVOKE ALL ON FUNCTION public.bb_stripe_sync_subscription(uuid, text, text, text, text, text, integer, text, timestamptz, timestamptz, boolean, boolean) FROM public, anon, authenticated;

-- ── 7. MODULES SYNCHRONISEREN VANUIT STRIPE ───────────────────────────────────
-- De subscription-items zijn de waarheid: wat er niet meer in zit, gaat uit.
-- Zo kan een opzegging via het Customer Portal niet stilletjes een module laten
-- openstaan.
CREATE OR REPLACE FUNCTION public.bb_stripe_sync_modules(
  p_company_id uuid,
  p_modules    jsonb   -- [{"module_key":"planning","item_id":"si_...","price_id":"price_..."}]
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_aan text[];
BEGIN
  -- Alleen voor bedrijven die daadwerkelijk aan Stripe hangen.
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE company_id = p_company_id AND stripe_subscription_id IS NOT NULL
  ) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(array_agg(m->>'module_key'), '{}') INTO v_aan
  FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) m;

  INSERT INTO public.company_modules (company_id, module_key, actief, stripe_item_id, stripe_price_id)
  SELECT p_company_id, m->>'module_key', true, m->>'item_id', m->>'price_id'
  FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) m
  ON CONFLICT (company_id, module_key) DO UPDATE SET
    actief          = true,
    stripe_item_id  = EXCLUDED.stripe_item_id,
    stripe_price_id = EXCLUDED.stripe_price_id;

  UPDATE public.company_modules
     SET actief = false
   WHERE company_id = p_company_id
     AND NOT (module_key = ANY(v_aan))
     AND actief;

  RETURN array_length(v_aan, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.bb_stripe_sync_modules(uuid, jsonb) FROM public, anon, authenticated;

COMMIT;
