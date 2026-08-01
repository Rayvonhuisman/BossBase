-- =============================================================================
-- 20260731130000_stopt_op.sql
--
-- We legden wél vast DAT er opgezegd is (cancel_at_period_end), maar niet
-- WANNEER het abonnement stopt. Bij een maandabonnement is dat het einde van de
-- lopende periode, maar bij een jaarabonnement het einde van de looptijd — en
-- dat verschil is precies wat de klant wil zien. Zonder die datum kunnen we het
-- ook niet controleren.
-- =============================================================================

BEGIN;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stopt_op timestamptz;

COMMENT ON COLUMN public.subscriptions.stopt_op IS
  'Moment waarop het abonnement daadwerkelijk stopt (Stripe cancel_at). NULL = loopt door.';

CREATE OR REPLACE FUNCTION public.bb_stripe_sync_stopdatum(
  p_subscription_id text,
  p_stopt_op        timestamptz
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.subscriptions
  WHERE stripe_subscription_id = p_subscription_id;
  IF v_company IS NULL THEN RETURN 'genegeerd'; END IF;
  UPDATE public.subscriptions SET stopt_op = p_stopt_op WHERE company_id = v_company;
  RETURN COALESCE(p_stopt_op::text, 'geen stopdatum');
END;
$$;

REVOKE ALL ON FUNCTION public.bb_stripe_sync_stopdatum(text, timestamptz) FROM public, anon, authenticated;

-- get_billing_status uitbreiden met de echte stopdatum.
CREATE OR REPLACE FUNCTION public.get_billing_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tier', public.bb_effective_tier(c.id), 'status', s.status,
    'stripeStatus', s.stripe_status, 'heeftStripe', (s.stripe_subscription_id IS NOT NULL),
    'billingInterval', s.billing_interval, 'extraGebruikers', s.extra_gebruikers,
    'trial', public.bb_is_trial(c.id), 'trialEindigtOp', s.trial_ends_at,
    'periodeStart', s.current_period_start, 'verlengtOp', s.current_period_end,
    'opzeggenPerEindePeriode', s.cancel_at_period_end,
    'stoptOp', s.stopt_op,
    'magBeheren', public.bb_mag_abonnement_beheren(),
    'welkomstactie', s.welkomstactie, 'welkomstactieGekozenOp', s.welkomstactie_gekozen_op,
    'heeftVerplichting', (s.verplichting_tot IS NOT NULL AND s.verplichting_tot > now()),
    'verplichtingTot', s.verplichting_tot, 'stoptNaLooptijd', s.stopt_na_looptijd,
    'magDirectOpzeggen', public.bb_mag_direct_opzeggen(c.id),
    'opzegbaarPer', public.bb_opzegbaar_per(c.id),
    'websiteAanvraag', (SELECT jsonb_build_object('status', w.status, 'aangevraagdOp', w.aangevraagd_op)
                        FROM public.website_aanvragen w WHERE w.company_id = c.id),
    'modules', COALESCE((SELECT jsonb_agg(cm.module_key) FROM public.company_modules cm
                         WHERE cm.company_id = c.id AND cm.actief), '[]'::jsonb),
    'limieten', COALESCE((SELECT jsonb_object_agg(pl.limit_key, jsonb_build_object(
                            'max', public.bb_limit(c.id, pl.limit_key),
                            'gebruikt', public.bb_usage(c.id, pl.limit_key)))
                          FROM public.plan_limits pl
                          WHERE pl.plan = public.bb_effective_tier(c.id)), '{}'::jsonb)
  )
  FROM public.companies c JOIN public.subscriptions s ON s.company_id = c.id
  WHERE c.id = public.bb_current_company()
$$;

REVOKE ALL ON FUNCTION public.get_billing_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_status() TO authenticated;

COMMIT;
