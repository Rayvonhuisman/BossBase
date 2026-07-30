-- =============================================================================
-- 20260728160000_provision_account_subscription.sql
--
-- ROOT CAUSE-fix: provision_account() maakte wél een bedrijf en een profiel aan,
-- maar geen abonnementsrij. Daardoor viel bb_effective_tier() terug op 'starter'
-- en zat een gloednieuwe klant meteen op Starter-limieten (1 gebruiker) in
-- plaats van in de proefperiode.
--
-- De trigger uit 20260728150000 (trg_seed_trial_subscription op companies) dekt
-- dit al af, maar dan is provision_account() afhankelijk van een trigger die
-- iemand later kan weghalen. Deze migratie maakt de functie zelfstandig correct.
--
-- IDEMPOTENTIE — dit is de kern:
--   subscriptions heeft al UNIQUE (company_id), dus twee actieve rijen per
--   bedrijf zijn structureel onmogelijk. Beide schrijvers (de trigger én
--   provision_account) gebruiken ON CONFLICT (company_id) DO NOTHING, dus wie er
--   ook eerst is: het resultaat is precies één rij. De DO-blok hieronder legt de
--   constraint vast voor het geval hij ooit ontbreekt.
-- =============================================================================

BEGIN;

-- Harde garantie van "maximaal één abonnementsrij per bedrijf". Bestaat al sinds
-- 20260618010000; deze check maakt de aanname expliciet en zelfherstellend.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'subscriptions'
      AND c.contype IN ('u', 'p')
      AND pg_get_constraintdef(c.oid) LIKE '%(company_id)%'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_company_id_key UNIQUE (company_id);
    RAISE NOTICE 'UNIQUE (company_id) op subscriptions toegevoegd';
  END IF;
END $$;

-- Ongewijzigd overgenomen uit de live definitie, met alleen het abonnement erbij.
CREATE OR REPLACE FUNCTION public.provision_account(
  p_company_name text,
  p_full_name    text DEFAULT NULL::text,
  p_email        text DEFAULT NULL::text,
  p_phone        text DEFAULT NULL::text,
  p_kvk          text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_company_id UUID;
  v_existing   UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT company_id INTO v_existing FROM profiles WHERE id = v_user_id;
  IF v_existing IS NOT NULL THEN
    IF p_full_name IS NOT NULL THEN
      UPDATE profiles SET full_name = p_full_name WHERE id = v_user_id;
    END IF;
    -- Ook een bestaand bedrijf mag nooit zonder abonnement zitten (bv. een
    -- account van vóór deze fix dat opnieuw door de registratieflow komt).
    INSERT INTO subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
    VALUES (v_existing, 'groei', 'trial', 0, now(), now() + interval '14 days')
    ON CONFLICT (company_id) DO NOTHING;
    RETURN json_build_object('company_id', v_existing, 'status', 'existing');
  END IF;
  INSERT INTO companies (name, email, phone, kvk)
  VALUES (p_company_name, NULLIF(p_email, ''), NULLIF(p_phone, ''), NULLIF(p_kvk, ''))
  RETURNING id INTO v_company_id;
  INSERT INTO profiles (id, company_id, full_name, role)
  VALUES (v_user_id, v_company_id, COALESCE(NULLIF(p_full_name, ''), split_part(p_email, '@', 1), 'Gebruiker'), 'admin')
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    full_name  = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    role       = 'admin';

  -- Abonnement: 14 dagen proefperiode. De trigger op companies heeft dit bij de
  -- INSERT hierboven normaal gesproken al gedaan; ON CONFLICT maakt dat
  -- onschadelijk. Zonder trigger doet deze regel het werk. Eén van de twee wint,
  -- nooit allebei — UNIQUE (company_id) garandeert dat.
  INSERT INTO subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
  VALUES (v_company_id, 'groei', 'trial', 0, now(), now() + interval '14 days')
  ON CONFLICT (company_id) DO NOTHING;

  -- Pipeline-fasen: geseed door de AFTER INSERT-trigger op companies.
  PERFORM public.seed_default_email_templates(v_company_id);
  RETURN json_build_object('company_id', v_company_id, 'status', 'created');
END;
$function$;

COMMIT;
