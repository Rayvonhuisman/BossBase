-- =============================================================================
-- 20260731120000_jaarverplichting.sql
--
-- JAARABONNEMENT = 12 MAANDEN VAST.
--
-- Tot nu toe was het jaarabonnement technisch een maandabonnement met korting:
-- de klant kon na één of drie maanden opzeggen en had dan de twee gratis maanden
-- of de gratis website al binnen. Dat wordt nu een echte verplichting via een
-- Stripe subscription_schedule met één fase van 12 maandelijkse termijnen.
--
-- De 12 termijnen lopen vanaf de START van het abonnement, inclusief de twee
-- gekorte maanden: periode 1 en 2 staan op € 0 door de coupon, periode 3 t/m 12
-- op € 39. Het einde ligt dus 12 maanden na aanvang — niet 14.
--
-- Na afloop van de fase geeft de schedule het abonnement vrij (end_behavior
-- 'release'): het loopt dan gewoon maandelijks door en is per maand opzegbaar.
-- Opzeggen tijdens de looptijd betekent: end_behavior op 'cancel', waardoor het
-- abonnement stopt aan het EINDE van de 12 maanden. Zo kan niemand tussentijds
-- weg, maar zit ook niemand vast aan een tweede jaar.
-- =============================================================================

BEGIN;

-- ── 1. KOLOMMEN ───────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_schedule_id text,
  ADD COLUMN IF NOT EXISTS verplichting_tot   timestamptz,
  ADD COLUMN IF NOT EXISTS stopt_na_looptijd  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscriptions.stripe_schedule_id IS
  'Stripe subscription_schedule die de 12-maandsverplichting afdwingt. NULL = maandabonnement, geen verplichting.';
COMMENT ON COLUMN public.subscriptions.verplichting_tot IS
  'Einde van de 12-maandsverplichting: 12 facturatieperiodes na aanvang (de twee gekorte maanden tellen mee). Vóór die datum kan de klant niet opzeggen.';
COMMENT ON COLUMN public.subscriptions.stopt_na_looptijd IS
  'Klant heeft opgezegd tegen het einde van de looptijd (schedule end_behavior = cancel). Anders loopt het na 12 maanden maandelijks door.';

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_schedule_key
  ON public.subscriptions (stripe_schedule_id) WHERE stripe_schedule_id IS NOT NULL;

-- ── 2. MAG DEZE KLANT NU OPZEGGEN? ────────────────────────────────────────────
-- Maandabonnement: altijd. Jaarabonnement: pas als de verplichting voorbij is.
-- Binnen de looptijd kan hij wél opzeggen TEGEN het einde ervan — dat is een
-- andere actie (stopt_na_looptijd) en geen directe beëindiging.
CREATE OR REPLACE FUNCTION public.bb_mag_direct_opzeggen(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT s.verplichting_tot IS NULL OR s.verplichting_tot <= now()
    FROM public.subscriptions s WHERE s.company_id = p_company_id
  ), true)
$$;

GRANT EXECUTE ON FUNCTION public.bb_mag_direct_opzeggen(uuid) TO authenticated;

-- Eerst mogelijke opzegdatum: nu (maand) of het einde van de looptijd (jaar).
CREATE OR REPLACE FUNCTION public.bb_opzegbaar_per(p_company_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.bb_mag_direct_opzeggen(p_company_id)
      THEN (SELECT s.current_period_end FROM public.subscriptions s WHERE s.company_id = p_company_id)
    ELSE (SELECT s.verplichting_tot FROM public.subscriptions s WHERE s.company_id = p_company_id)
  END
$$;

GRANT EXECUTE ON FUNCTION public.bb_opzegbaar_per(uuid) TO authenticated;

-- ── 3. SCHEDULE VASTLEGGEN VANUIT DE WEBHOOK ──────────────────────────────────
-- Zelfde grendel als bb_stripe_sync_subscription: alleen voor bedrijven die
-- daadwerkelijk aan Stripe hangen. Een bedrijf in de gratis 14-daagse
-- DB-proefperiode wordt hier nooit geraakt.
CREATE OR REPLACE FUNCTION public.bb_stripe_sync_schedule(
  p_subscription_id  text,
  p_schedule_id      text,
  p_verplichting_tot timestamptz,
  p_stopt_na         boolean
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company
  FROM public.subscriptions
  WHERE stripe_subscription_id = p_subscription_id;

  IF v_company IS NULL THEN
    RETURN 'genegeerd: geen gekoppeld bedrijf voor dit abonnement';
  END IF;

  UPDATE public.subscriptions SET
    stripe_schedule_id = COALESCE(p_schedule_id, stripe_schedule_id),
    verplichting_tot   = COALESCE(p_verplichting_tot, verplichting_tot),
    stopt_na_looptijd  = COALESCE(p_stopt_na, stopt_na_looptijd)
  WHERE company_id = v_company;

  RETURN 'schedule bijgewerkt';
END;
$$;

REVOKE ALL ON FUNCTION public.bb_stripe_sync_schedule(text, text, timestamptz, boolean) FROM public, anon, authenticated;

-- ── 4. STATUS VOOR DE UI ──────────────────────────────────────────────────────
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
    -- Jaarverplichting
    'heeftVerplichting',  (s.verplichting_tot IS NOT NULL AND s.verplichting_tot > now()),
    'verplichtingTot',    s.verplichting_tot,
    'stoptNaLooptijd',    s.stopt_na_looptijd,
    'magDirectOpzeggen',  public.bb_mag_direct_opzeggen(c.id),
    'opzegbaarPer',       public.bb_opzegbaar_per(c.id),
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

COMMIT;
