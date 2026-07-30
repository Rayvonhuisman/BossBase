-- =============================================================================
-- 20260728120000_plan_matrix.sql
--
-- FEATURE- EN LIMIETMATRIX — server-side afgedwongen.
--
-- Eén bron van waarheid voor "welke features en limieten horen bij welk
-- abonnement". De matrix zelf staat in src/lib/features.js; het seed-blok
-- hieronder is daaruit GEGENEREERD met `node scripts/gen-plan-matrix.mjs`.
-- Wijzig de matrix nooit met de hand in SQL — pas features.js aan en genereer
-- een nieuwe migratie.
--
-- Hergebruikt het bestaande patroon van het rechtensysteem (bb_has_permission):
--   • SECURITY DEFINER helpers die zonder RLS-recursie de waarheid ophalen
--   • afdwinging in RLS-policies, niet in de UI
--
-- Nieuw hier: de plan-gates zijn RESTRICTIVE policies. Die worden ge-AND'd met
-- alle bestaande (permissive) rechten-policies. Zo blijft het rechtensysteem
-- onaangeroerd en kan er geen oude permissive policy zijn die de limiet alsnog
-- toelaat.
--
-- service_role (edge functions, webhooks, inkomende leads) omzeilt RLS en wordt
-- dus NIET geblokkeerd — dat is bewust: binnenkomende leads moeten altijd
-- binnenkomen, ook boven de klantcap.
-- =============================================================================

BEGIN;

-- ── 1. MATRIX-TABELLEN ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_feature_defs (
  feature text PRIMARY KEY,
  label   text NOT NULL,
  uitleg  text NOT NULL DEFAULT '',
  -- intern = gedrag dat wel van het tier afhangt maar geen verkoopbare functie
  -- is (bv. de gedeelde werkruimte bij Groei). Blijft uit prijskaarten en
  -- upgrade-meldingen.
  intern  boolean NOT NULL DEFAULT false
);
ALTER TABLE public.plan_feature_defs ADD COLUMN IF NOT EXISTS intern boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.plan_features (
  plan    text NOT NULL,
  feature text NOT NULL,
  PRIMARY KEY (plan, feature)
);

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan        text NOT NULL,
  limit_key   text NOT NULL,
  limit_value integer,               -- NULL = onbeperkt
  telwijze    text NOT NULL,         -- 'voorraad' | 'periode'
  PRIMARY KEY (plan, limit_key),
  CONSTRAINT plan_limits_telwijze_chk CHECK (telwijze IN ('voorraad', 'periode'))
);

CREATE TABLE IF NOT EXISTS public.plan_modules (
  module_key text PRIMARY KEY,
  label      text NOT NULL,
  feature    text NOT NULL,
  price      numeric NOT NULL DEFAULT 0,
  vereist    text                    -- module die eerst aan moet staan
);

CREATE TABLE IF NOT EXISTS public.plan_module_tiers (
  plan       text NOT NULL,
  module_key text NOT NULL,
  PRIMARY KEY (plan, module_key)
);

-- De matrix is niet geheim: iedere ingelogde gebruiker mag hem lezen (de UI
-- toont er de upgrade-melding en de prijskaarten mee). Schrijven kan alleen
-- via migraties (service_role).
ALTER TABLE public.plan_feature_defs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_modules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_module_tiers  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_feature_defs_read ON public.plan_feature_defs;
DROP POLICY IF EXISTS plan_features_read     ON public.plan_features;
DROP POLICY IF EXISTS plan_limits_read       ON public.plan_limits;
DROP POLICY IF EXISTS plan_modules_read      ON public.plan_modules;
DROP POLICY IF EXISTS plan_module_tiers_read ON public.plan_module_tiers;
CREATE POLICY plan_feature_defs_read ON public.plan_feature_defs FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_features_read     ON public.plan_features     FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_limits_read       ON public.plan_limits       FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_modules_read      ON public.plan_modules      FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_module_tiers_read ON public.plan_module_tiers FOR SELECT TO authenticated USING (true);

-- ── 2. BIJGEKOCHTE MODULES PER BEDRIJF ────────────────────────────────────────
-- Alleen te muteren door super-admin / service_role: het bijkopen van een module
-- is een facturatie-actie en loopt straks via Stripe Billing (fase 2).
CREATE TABLE IF NOT EXISTS public.company_modules (
  company_id uuid    NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key text    NOT NULL,
  actief     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, module_key)
);

ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_modules_select ON public.company_modules;
CREATE POLICY company_modules_select ON public.company_modules FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS company_modules_super_admin ON public.company_modules;
CREATE POLICY company_modules_super_admin ON public.company_modules FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin))
  WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin));

-- ── 3. FACTURATIEPERIODE ──────────────────────────────────────────────────────
-- De teller reset op de facturatiedatum van het abonnement, niet op de
-- kalendermaand. Stripe Billing bestaat nog niet; tot die tijd valt het anker
-- terug op subscriptions.started_at en anders companies.created_at. Zodra Stripe
-- er is vult de webhook companies.periode_start — de tellogica verandert dan
-- niet mee.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS periode_start date;
COMMENT ON COLUMN public.companies.periode_start IS
  'Startdatum van de lopende facturatieperiode. Wordt straks door Stripe Billing gezet; NULL = val terug op subscriptions.started_at, anders companies.created_at.';

-- ── 3b. ELK BEDRIJF HEEFT EEN ABONNEMENTSRIJ ──────────────────────────────────
-- provision_account() (registratie) maakt wél een company + profiel aan, maar
-- GEEN subscriptions-rij. Zonder die rij zou bb_effective_tier() terugvallen op
-- 'starter' en zou een gloednieuw account meteen op 1 gebruiker en 100 klanten
-- zitten — terwijl het in de 14-daagse trial hoort te zitten zonder limieten.
--
-- We repareren dat bij de bron met een trigger op companies, zodat het niet
-- uitmaakt via welke weg een bedrijf ontstaat (registratie, super-admin, import).
-- De veiligheidsklep in bb_plan_geconfigureerd() blijft daarnaast bestaan als
-- vangnet; deze trigger zorgt dat we er in de praktijk nooit op hoeven leunen.
CREATE OR REPLACE FUNCTION public.bb_seed_trial_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Trial is altijd Groei of Team; we starten op Groei.
  INSERT INTO public.subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
  VALUES (NEW.id, 'groei', 'trial', 0, now(), now() + interval '14 days')
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_trial_subscription ON public.companies;
CREATE TRIGGER trg_seed_trial_subscription AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.bb_seed_trial_subscription();

-- Bestaande bedrijven zonder abonnementsrij alsnog voorzien. Zonder deze
-- backfill zouden juist de accounts die nu al in de lucht zijn geraakt worden.
INSERT INTO public.subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
SELECT c.id, 'groei', 'trial', 0, c.created_at, GREATEST(c.created_at + interval '14 days', now() + interval '14 days')
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.company_id = c.id)
ON CONFLICT (company_id) DO NOTHING;

-- ── 4. VERBRUIKSLEDGER ────────────────────────────────────────────────────────
-- Offertes en facturen tellen bij AANMAKEN. Verwijderen geeft de teller niet
-- vrij — daarom een apart ledger in plaats van een count() op de tabellen zelf.
-- Rijen worden nooit verwijderd (geen DELETE-policy, geen FK-cascade op ref_id).
CREATE TABLE IF NOT EXISTS public.plan_usage_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  soort         text NOT NULL,
  periode_start date NOT NULL,
  ref_id        uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_usage_events_soort_chk CHECK (soort IN ('offerte', 'factuur'))
);

CREATE INDEX IF NOT EXISTS idx_plan_usage_events_lookup
  ON public.plan_usage_events (company_id, soort, periode_start);

ALTER TABLE public.plan_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_usage_events_select ON public.plan_usage_events;
CREATE POLICY plan_usage_events_select ON public.plan_usage_events FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
-- Geen INSERT/UPDATE/DELETE-policy: alleen de SECURITY DEFINER-trigger schrijft.

-- ── 5. HELPERS ────────────────────────────────────────────────────────────────
-- Elke helper bestaat in twee vormen:
--   bb_x(p_company_id)  → kern, ook bruikbaar vanuit triggers en service_role
--   bb_x()              → gemak, lost het bedrijf op uit auth.uid()
-- Allemaal SECURITY DEFINER zodat ze subscriptions/companies lezen zonder dat de
-- RLS daarop hoeft te versoepelen (zelfde patroon als bb_has_permission).

CREATE OR REPLACE FUNCTION public.bb_current_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Effectief tier. Trial is altijd Groei of Team; staat er nog 'trial' (of iets
-- onbekends) in subscriptions.plan, dan geldt Groei. Geen abonnement bekend →
-- Starter (least privilege).
CREATE OR REPLACE FUNCTION public.bb_effective_tier(p_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE WHEN s.plan IN ('starter', 'groei', 'team') THEN s.plan ELSE 'groei' END
    FROM public.subscriptions s WHERE s.company_id = p_company_id LIMIT 1
  ), 'starter')
$$;

CREATE OR REPLACE FUNCTION public.bb_effective_tier()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_effective_tier(public.bb_current_company())
$$;

CREATE OR REPLACE FUNCTION public.bb_is_trial(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT s.status = 'trial' AND (s.trial_ends_at IS NULL OR s.trial_ends_at > now())
    FROM public.subscriptions s WHERE s.company_id = p_company_id LIMIT 1
  ), false)
$$;

-- ── VEILIGHEIDSKLEP ───────────────────────────────────────────────────────────
-- Is er bruikbare abonnementsconfiguratie voor dit bedrijf? Nee = we WETEN het
-- niet, en dan mag er nooit geblokkeerd worden. Dat kan gebeuren bij:
--   • een bedrijf zonder subscriptions-rij (bv. een registratie die halverwege
--     strandde, of data die met de hand is aangepast),
--   • een matrix die niet (volledig) geseed is.
-- In beide gevallen geldt: toestaan, niet blokkeren. Een lege configuratie mag
-- nooit het dashboard op slot zetten — de limiet is een commerciële grens, geen
-- beveiligingsgrens (die blijft bij het rechtensysteem en de company-scoping).
CREATE OR REPLACE FUNCTION public.bb_plan_geconfigureerd(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_company_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.company_id = p_company_id)
     AND EXISTS (SELECT 1 FROM public.plan_limits   pl WHERE pl.plan = public.bb_effective_tier(p_company_id))
     AND EXISTS (SELECT 1 FROM public.plan_features pf WHERE pf.plan = public.bb_effective_tier(p_company_id))
$$;

CREATE OR REPLACE FUNCTION public.bb_plan_geconfigureerd()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_plan_geconfigureerd(public.bb_current_company())
$$;

CREATE OR REPLACE FUNCTION public.bb_is_trial()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_is_trial(public.bb_current_company())
$$;

-- Bestaande reader — blijft bestaan voor de frontend (profileService), maar
-- geeft nu het EFFECTIEVE tier terug: trial telt als Groei. De RLS gebruikt hem
-- niet meer om gedrag te bepalen; die loopt vanaf sectie 12 via de matrix
-- (bb_has_feature / bb_gedeelde_werkruimte).
CREATE OR REPLACE FUNCTION public.get_company_tier()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_effective_tier(public.bb_current_company())
$$;

-- Start van de lopende facturatieperiode.
CREATE OR REPLACE FUNCTION public.bb_periode_start(p_company_id uuid)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anker   date;
  v_maanden int;
  v_start   date;
BEGIN
  SELECT COALESCE(c.periode_start, s.started_at::date, c.created_at::date)
    INTO v_anker
  FROM public.companies c
  LEFT JOIN public.subscriptions s ON s.company_id = c.id
  WHERE c.id = p_company_id
  LIMIT 1;

  IF v_anker IS NULL THEN
    RETURN date_trunc('month', current_date)::date;
  END IF;
  IF v_anker > current_date THEN
    RETURN v_anker;
  END IF;

  v_maanden := (EXTRACT(YEAR  FROM age(current_date, v_anker)) * 12
              + EXTRACT(MONTH FROM age(current_date, v_anker)))::int;
  v_start := (v_anker + (v_maanden || ' months')::interval)::date;
  IF v_start > current_date THEN
    v_start := (v_anker + ((v_maanden - 1) || ' months')::interval)::date;
  END IF;
  RETURN v_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.bb_periode_start()
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_periode_start(public.bb_current_company())
$$;

-- Heeft dit bedrijf deze feature? Uit het tier, of uit een bijgekochte module
-- (alleen bij tiers die modules mogen bijkopen — zie plan_module_tiers).
--
-- Veiligheidsklep: is er geen bruikbare configuratie, dan staan we de feature TOE
-- in plaats van te blokkeren. Met één uitzondering — INTERNE features (zoals de
-- gedeelde werkruimte) vallen daar bewust buiten: die bepalen hoevéél een
-- medewerker ziet. "Bij twijfel toestaan" zou daar méér data zichtbaar maken, en
-- dat is precies de verkeerde kant om te falen. Voor die features is de
-- fallback dus: uit.
CREATE OR REPLACE FUNCTION public.bb_has_feature(p_company_id uuid, p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    NOT public.bb_plan_geconfigureerd(p_company_id)
    AND NOT COALESCE((SELECT pfd.intern FROM public.plan_feature_defs pfd WHERE pfd.feature = p_feature), false)
  ) OR EXISTS (
    SELECT 1 FROM public.plan_features pf
    WHERE pf.plan = public.bb_effective_tier(p_company_id) AND pf.feature = p_feature
  ) OR EXISTS (
    SELECT 1
    FROM public.company_modules cm
    JOIN public.plan_modules      pm  ON pm.module_key  = cm.module_key
    JOIN public.plan_module_tiers pmt ON pmt.module_key = cm.module_key
                                     AND pmt.plan = public.bb_effective_tier(p_company_id)
    WHERE cm.company_id = p_company_id AND cm.actief AND pm.feature = p_feature
  )
$$;

CREATE OR REPLACE FUNCTION public.bb_has_feature(p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_has_feature(public.bb_current_company(), p_feature)
$$;

-- Limiet voor dit bedrijf. NULL = onbeperkt. Onbeperkt bij:
--   • ontbrekende/onvolledige configuratie (veiligheidsklep — nooit blokkeren),
--   • een lopende trial,
--   • een limiet die simpelweg niet gezet is voor dit tier.
CREATE OR REPLACE FUNCTION public.bb_limit(p_company_id uuid, p_key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT public.bb_plan_geconfigureerd(p_company_id) THEN NULL
    WHEN public.bb_is_trial(p_company_id)                THEN NULL
    ELSE (
      SELECT pl.limit_value FROM public.plan_limits pl
      WHERE pl.plan = public.bb_effective_tier(p_company_id) AND pl.limit_key = p_key
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.bb_limit(p_key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_limit(public.bb_current_company(), p_key)
$$;

-- Huidige stand.
--   gebruikers — actieve profielen + openstaande uitnodigingen (voorraad)
--   klanten    — aantal klanten dat er nu is (voorraad; verwijderen geeft vrij)
--   offertes   — aangemaakt in de lopende periode (ledger; verwijderen niet vrij)
--   facturen   — idem
CREATE OR REPLACE FUNCTION public.bb_usage(p_company_id uuid, p_key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_key
    WHEN 'gebruikers' THEN (
      (SELECT count(*) FROM public.profiles p
        WHERE p.company_id = p_company_id AND p.actief IS DISTINCT FROM false)
      +
      (SELECT count(*) FROM public.company_members cm
        WHERE cm.company_id = p_company_id AND cm.accepted_at IS NULL AND cm.profile_id IS NULL)
    )
    WHEN 'klanten' THEN (
      SELECT count(*) FROM public.customers c WHERE c.company_id = p_company_id
    )
    WHEN 'offertes' THEN (
      SELECT count(*) FROM public.plan_usage_events e
      WHERE e.company_id = p_company_id AND e.soort = 'offerte'
        AND e.periode_start = public.bb_periode_start(p_company_id)
    )
    WHEN 'facturen' THEN (
      SELECT count(*) FROM public.plan_usage_events e
      WHERE e.company_id = p_company_id AND e.soort = 'factuur'
        AND e.periode_start = public.bb_periode_start(p_company_id)
    )
    ELSE 0
  END::integer
$$;

CREATE OR REPLACE FUNCTION public.bb_usage(p_key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_usage(public.bb_current_company(), p_key)
$$;

CREATE OR REPLACE FUNCTION public.bb_within_limit(p_company_id uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_limit(p_company_id, p_key) IS NULL
      OR public.bb_usage(p_company_id, p_key) < public.bb_limit(p_company_id, p_key)
$$;

CREATE OR REPLACE FUNCTION public.bb_within_limit(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_within_limit(public.bb_current_company(), p_key)
$$;

-- Telt deze offerte mee voor de limiet?
-- Een NIEUWE VERSIE van een bestaande offerte voor DEZELFDE klant (BB-005-v2)
-- telt niet opnieuw. Een kopie naar een ANDERE klant krijgt een nieuw regulier
-- nummer (BB-012) en telt dus wél. De regel wordt volledig uit de data afgeleid,
-- niet uit iets dat de client meestuurt — hij is dus niet te manipuleren.
CREATE OR REPLACE FUNCTION public.bb_offerte_telt_mee(
  p_company_id  uuid,
  p_nummer      text,
  p_customer_id uuid,
  p_id          uuid DEFAULT NULL
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT (
    COALESCE(p_nummer, '') ~ '-v[0-9]+$'
    AND EXISTS (
      SELECT 1 FROM public.offertes o
      WHERE o.company_id = p_company_id
        AND (p_id IS NULL OR o.id <> p_id)
        AND o.customer_id IS NOT DISTINCT FROM p_customer_id
        -- zelfde basisnummer: het origineel (BB-005) of een eerdere versie
        AND left(o.nummer, length(regexp_replace(p_nummer, '-v[0-9]+$', '')))
            = regexp_replace(p_nummer, '-v[0-9]+$', '')
        AND (o.nummer = regexp_replace(p_nummer, '-v[0-9]+$', '') OR o.nummer ~ '-v[0-9]+$')
    )
  )
$$;

GRANT EXECUTE ON FUNCTION public.bb_effective_tier()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_plan_geconfigureerd()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_is_trial()                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_periode_start()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_has_feature(text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_limit(text)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_usage(text)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_within_limit(text)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_offerte_telt_mee(uuid, text, uuid, uuid) TO authenticated;

-- ── 6. LEDGER-TRIGGERS ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bb_log_offerte_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.bb_offerte_telt_mee(NEW.company_id, NEW.nummer, NEW.customer_id, NEW.id) THEN
    INSERT INTO public.plan_usage_events (company_id, soort, periode_start, ref_id)
    VALUES (NEW.company_id, 'offerte', public.bb_periode_start(NEW.company_id), NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offerte_usage ON public.offertes;
CREATE TRIGGER trg_offerte_usage AFTER INSERT ON public.offertes
  FOR EACH ROW EXECUTE FUNCTION public.bb_log_offerte_usage();

-- Creditfacturen tellen niet mee. Herinneringen zijn geen factuurrij en komen
-- hier dus sowieso nooit langs.
CREATE OR REPLACE FUNCTION public.bb_log_factuur_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT COALESCE(NEW.is_credit, false) THEN
    INSERT INTO public.plan_usage_events (company_id, soort, periode_start, ref_id)
    VALUES (NEW.company_id, 'factuur', public.bb_periode_start(NEW.company_id), NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_factuur_usage ON public.facturen;
CREATE TRIGGER trg_factuur_usage AFTER INSERT ON public.facturen
  FOR EACH ROW EXECUTE FUNCTION public.bb_log_factuur_usage();

-- ── 7. LIMIETEN AFDWINGEN (restrictive policies) ──────────────────────────────
-- Alleen op INSERT: bestaande gegevens blijven volledig bruikbaar en bewerkbaar.

-- Klanten. Handmatig aanmaken wordt geblokkeerd bij een bereikte cap.
-- Inkomende leads lopen via service_role (websiteformulier/mailkoppeling) en
-- omzeilen RLS — die komen dus ALTIJD binnen, ook boven de cap.
DROP POLICY IF EXISTS plan_limiet_klanten ON public.customers;
CREATE POLICY plan_limiet_klanten ON public.customers AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.bb_within_limit('klanten'));

-- Offertes. Boven de limiet mag een nieuwe VERSIE nog steeds — die telt niet mee.
DROP POLICY IF EXISTS plan_limiet_offertes ON public.offertes;
CREATE POLICY plan_limiet_offertes ON public.offertes AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    public.bb_within_limit('offertes')
    OR NOT public.bb_offerte_telt_mee(company_id, nummer, customer_id, NULL)
  );

-- Facturen. Boven de limiet mag een creditfactuur nog steeds.
DROP POLICY IF EXISTS plan_limiet_facturen ON public.facturen;
CREATE POLICY plan_limiet_facturen ON public.facturen AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.bb_within_limit('facturen') OR COALESCE(is_credit, false));

-- Gebruikers. De uitnodiging is de poort: wie erdoor is, telt mee.
DROP POLICY IF EXISTS plan_limiet_gebruikers ON public.company_members;
CREATE POLICY plan_limiet_gebruikers ON public.company_members AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.bb_within_limit('gebruikers'));

-- ── 8. FEATURES AFDWINGEN (restrictive policies) ──────────────────────────────

-- Voertuigen (Team, of module bij Groei).
DROP POLICY IF EXISTS plan_feature_voertuigen_insert ON public.voertuigen;
CREATE POLICY plan_feature_voertuigen_insert ON public.voertuigen AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_has_feature('voertuigen'));
DROP POLICY IF EXISTS plan_feature_voertuigen_update ON public.voertuigen;
CREATE POLICY plan_feature_voertuigen_update ON public.voertuigen AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.bb_has_feature('voertuigen'));

-- Een werkbon aan een voertuig koppelen is onderdeel van dezelfde feature.
CREATE OR REPLACE FUNCTION public.bb_check_werkbon_voertuig()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gewijzigd boolean;
BEGIN
  IF NEW.voertuig_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- OLD bestaat niet bij INSERT, dus TG_OP eerst in een eigen IF (SQL's OR
  -- garandeert geen short-circuit).
  IF TG_OP = 'INSERT' THEN
    v_gewijzigd := true;
  ELSE
    v_gewijzigd := NEW.voertuig_id IS DISTINCT FROM OLD.voertuig_id;
  END IF;

  IF v_gewijzigd AND NOT public.bb_has_feature(NEW.company_id, 'voertuigen') THEN
    RAISE EXCEPTION 'Voertuigen horen niet bij dit abonnement'
      USING ERRCODE = 'check_violation', HINT = 'feature:voertuigen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_werkbon_voertuig_feature ON public.werkbonnen;
CREATE TRIGGER trg_werkbon_voertuig_feature BEFORE INSERT OR UPDATE ON public.werkbonnen
  FOR EACH ROW EXECUTE FUNCTION public.bb_check_werkbon_voertuig();

-- Eigen e-mailtemplates AANMAKEN (Groei+). De standaardtemplates bewerken mag
-- iedereen; een nieuw, zelfbedacht type aanmaken niet. De standaardtypes staan
-- hier expliciet zodat het seeden van een nieuw bedrijf blijft werken.
DROP POLICY IF EXISTS plan_feature_eigen_templates ON public.email_templates;
CREATE POLICY plan_feature_eigen_templates ON public.email_templates AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    public.bb_has_feature('eigen_email_templates')
    OR type IN ('offerte', 'offerte_geaccepteerd', 'factuur', 'herinnering_1',
                'herinnering_2', 'aanvraag_ontvangen', 'welkom',
                'afspraak_bevestiging', 'afspraak_herinnering')
  );

-- Kosten & nacalculatie (Groei+). Materiaalkosten die op een WERKBON worden
-- geboekt vallen hier bewust buiten: werkbonnen zitten in elk abonnement.
-- Alleen losse kosten (de Kosten-pagina, werkbon_id IS NULL) zijn gated.
DROP POLICY IF EXISTS plan_feature_kosten ON public.job_costs;
CREATE POLICY plan_feature_kosten ON public.job_costs AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (werkbon_id IS NOT NULL OR public.bb_has_feature('kosten_nacalculatie'));

-- Boekhoudkoppeling (Groei+).
DROP POLICY IF EXISTS plan_feature_boekhouding_insert ON public.accounting_connections;
CREATE POLICY plan_feature_boekhouding_insert ON public.accounting_connections AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_has_feature('boekhoudkoppeling'));
DROP POLICY IF EXISTS plan_feature_boekhouding_update ON public.accounting_connections;
CREATE POLICY plan_feature_boekhouding_update ON public.accounting_connections AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.bb_has_feature('boekhoudkoppeling'));

-- save_accounting_connection() is SECURITY DEFINER en omzeilt RLS; die route
-- moet dus zijn eigen check doen. Een trigger dekt beide paden in één keer.
CREATE OR REPLACE FUNCTION public.bb_check_accounting_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Alleen het OPZETTEN van een koppeling is gated. Bestaande koppelingen mogen
  -- blijven syncen (last_synced_at e.d.) zodat lopende jobs niet stukgaan.
  IF NOT public.bb_has_feature(NEW.company_id, 'boekhoudkoppeling') THEN
    RAISE EXCEPTION 'Boekhoudkoppeling hoort niet bij dit abonnement'
      USING ERRCODE = 'check_violation', HINT = 'feature:boekhoudkoppeling';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounting_feature ON public.accounting_connections;
CREATE TRIGGER trg_accounting_feature BEFORE INSERT ON public.accounting_connections
  FOR EACH ROW EXECUTE FUNCTION public.bb_check_accounting_feature();

-- BTW-overzicht (Groei+).
DROP POLICY IF EXISTS plan_feature_btw ON public.btw_periodes;
CREATE POLICY plan_feature_btw ON public.btw_periodes AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.bb_has_feature('btw_overzicht'));

-- Rollen & rechten (Team, of module bij Groei — staat niet in MODULES, dus
-- feitelijk alleen Team). Zonder deze feature kan niemand rechten verdelen.
DROP POLICY IF EXISTS plan_feature_rechten_insert ON public.user_permissions;
CREATE POLICY plan_feature_rechten_insert ON public.user_permissions AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_has_feature('rollen_rechten'));
DROP POLICY IF EXISTS plan_feature_rechten_update ON public.user_permissions;
CREATE POLICY plan_feature_rechten_update ON public.user_permissions AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.bb_has_feature('rollen_rechten'));
DROP POLICY IF EXISTS plan_feature_rechten_delete ON public.user_permissions;
CREATE POLICY plan_feature_rechten_delete ON public.user_permissions AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.bb_has_feature('rollen_rechten'));

-- Automatische betaalherinneringen (Groei+). Het versturen zelf loopt via mail;
-- de sporen ervan (herinnering_*_verstuurd_at) zijn wél data en worden hier
-- geblokkeerd, zodat de flow server-side stukloopt zonder de feature.
CREATE OR REPLACE FUNCTION public.bb_check_herinnering_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.herinnering_1_verstuurd_at IS DISTINCT FROM OLD.herinnering_1_verstuurd_at
      OR NEW.herinnering_2_verstuurd_at IS DISTINCT FROM OLD.herinnering_2_verstuurd_at)
     AND NOT public.bb_has_feature(NEW.company_id, 'betaalherinneringen') THEN
    RAISE EXCEPTION 'Automatische betaalherinneringen horen niet bij dit abonnement'
      USING ERRCODE = 'check_violation', HINT = 'feature:betaalherinneringen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_herinnering_feature ON public.facturen;
CREATE TRIGGER trg_herinnering_feature BEFORE UPDATE ON public.facturen
  FOR EACH ROW EXECUTE FUNCTION public.bb_check_herinnering_feature();

-- Digitale handtekening (Groei+). Ondertekenen loopt via de edge function
-- sign-offerte (service_role, omzeilt RLS) — die controleert de feature zelf.
-- Deze trigger dekt de directe route: signed_at/signature_url zetten.
CREATE OR REPLACE FUNCTION public.bb_check_handtekening_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.signed_at IS DISTINCT FROM OLD.signed_at
     AND NEW.signed_at IS NOT NULL
     AND NOT public.bb_has_feature(NEW.company_id, 'digitale_handtekening') THEN
    RAISE EXCEPTION 'Digitale handtekening hoort niet bij dit abonnement'
      USING ERRCODE = 'check_violation', HINT = 'feature:digitale_handtekening';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handtekening_feature ON public.offertes;
CREATE TRIGGER trg_handtekening_feature BEFORE UPDATE ON public.offertes
  FOR EACH ROW EXECUTE FUNCTION public.bb_check_handtekening_feature();

-- ── 9. STAND OPHALEN VOOR DE UI ───────────────────────────────────────────────
-- Eén call die alles teruggeeft wat de frontend nodig heeft: tier, trial,
-- periode, modules, features en per limiet de stand. De UI leest hiermee
-- dezelfde waarheid als de server afdwingt.
CREATE OR REPLACE FUNCTION public.get_plan_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tier',          public.bb_effective_tier(c.id),
    'plan',          COALESCE((SELECT s.plan   FROM public.subscriptions s WHERE s.company_id = c.id), 'trial'),
    'status',        COALESCE((SELECT s.status FROM public.subscriptions s WHERE s.company_id = c.id), 'trial'),
    'trial',         public.bb_is_trial(c.id),
    'trialEndsAt',   (SELECT s.trial_ends_at FROM public.subscriptions s WHERE s.company_id = c.id),
    'periodeStart',  public.bb_periode_start(c.id),
    'periodeEind',   (public.bb_periode_start(c.id) + interval '1 month' - interval '1 day')::date,
    'modules',       COALESCE((SELECT jsonb_agg(cm.module_key)
                               FROM public.company_modules cm
                               WHERE cm.company_id = c.id AND cm.actief), '[]'::jsonb),
    'features',      COALESCE((SELECT jsonb_agg(pfd.feature)
                               FROM public.plan_feature_defs pfd
                               WHERE public.bb_has_feature(c.id, pfd.feature)), '[]'::jsonb),
    'limits',        COALESCE((SELECT jsonb_object_agg(pl.limit_key, jsonb_build_object(
                                 'max',      public.bb_limit(c.id, pl.limit_key),
                                 'gebruikt', public.bb_usage(c.id, pl.limit_key),
                                 'telwijze', pl.telwijze
                               ))
                               FROM public.plan_limits pl
                               WHERE pl.plan = public.bb_effective_tier(c.id)), '{}'::jsonb)
  )
  FROM public.companies c
  WHERE c.id = public.bb_current_company()
$$;

REVOKE ALL ON FUNCTION public.get_plan_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_plan_status() TO authenticated;

COMMIT;

-- =============================================================================
-- 10. SEED — GEGENEREERD uit src/lib/features.js
--     node scripts/gen-plan-matrix.mjs
-- Niet met de hand bewerken.
-- =============================================================================

BEGIN;

DELETE FROM public.plan_feature_defs;
INSERT INTO public.plan_feature_defs (feature, label, uitleg, intern) VALUES
  ('crm_pipeline', 'CRM & pipeline', 'Verkooppijplijn met deals en leads.', false),
  ('klanten', 'Klanten', 'Klantenbeheer en klantkaart.', false),
  ('leads', 'Leads', 'Binnenkomende aanvragen als lead in de pipeline.', false),
  ('offertes', 'Offertes', 'Offertes opstellen, versturen en opvolgen.', false),
  ('facturen', 'Facturen', 'Facturen aanmaken, versturen en betaalstatus volgen.', false),
  ('werkbonnen', 'Werkbonnen', 'Werkbonnen met taken, materialen en foto’s.', false),
  ('uren', 'Urenregistratie', 'Uren schrijven per project of werkbon.', false),
  ('agenda', 'Agenda', 'Afspraken en ingeplande werkbonnen.', false),
  ('adres_autocomplete', 'Adres-autocomplete', 'Adressen automatisch aanvullen via PDOK.', false),
  ('afspraakherinnering', 'Afspraakherinnering', 'Automatische herinnering voor afspraken.', false),
  ('email_templates_bewerken', 'E-mailtemplates bewerken', 'De standaard e-mailtemplates aanpassen.', false),
  ('digitale_handtekening', 'Digitale handtekening', 'Offertes online laten ondertekenen door de klant.', false),
  ('betaalherinneringen', 'Automatische betaalherinneringen', 'Herinneringen bij openstaande facturen.', false),
  ('boekhoudkoppeling', 'Boekhoudkoppeling', 'Koppeling met Moneybird, SnelStart of AFAS.', false),
  ('btw_overzicht', 'BTW-overzicht', 'BTW per periode uit de boekhoudkoppeling.', false),
  ('kosten_nacalculatie', 'Kosten & nacalculatie', 'Kosten registreren en marge per project bewaken.', false),
  ('eigen_email_templates', 'Eigen e-mailtemplates', 'Zelf nieuwe e-mailtemplates aanmaken.', false),
  ('rollen_rechten', 'Rollen & rechten', 'Per teamlid instellen wat hij mag zien en doen.', false),
  ('planning', 'Planningsmodule', 'Weekplanning met drag & drop op medewerker en voertuig.', false),
  ('stripe_betaallink', 'Stripe betaallink', 'iDEAL-betaalknop op je facturen via Stripe.', false),
  ('voertuigen', 'Voertuigen', 'Voertuigen beheren en inplannen in de planning.', false),
  ('gedeelde_werkruimte', 'Gedeelde werkruimte', 'Iedereen ziet elkaars agenda, projecten en werkbonnen zonder rechtenbeheer. Past bij een bedrijf van één of twee personen.', true);

DELETE FROM public.plan_features;
INSERT INTO public.plan_features (plan, feature) VALUES
  ('starter', 'crm_pipeline'),
  ('starter', 'klanten'),
  ('starter', 'leads'),
  ('starter', 'offertes'),
  ('starter', 'facturen'),
  ('starter', 'werkbonnen'),
  ('starter', 'uren'),
  ('starter', 'agenda'),
  ('starter', 'adres_autocomplete'),
  ('starter', 'afspraakherinnering'),
  ('starter', 'email_templates_bewerken'),
  ('groei', 'crm_pipeline'),
  ('groei', 'klanten'),
  ('groei', 'leads'),
  ('groei', 'offertes'),
  ('groei', 'facturen'),
  ('groei', 'werkbonnen'),
  ('groei', 'uren'),
  ('groei', 'agenda'),
  ('groei', 'adres_autocomplete'),
  ('groei', 'afspraakherinnering'),
  ('groei', 'email_templates_bewerken'),
  ('groei', 'digitale_handtekening'),
  ('groei', 'betaalherinneringen'),
  ('groei', 'boekhoudkoppeling'),
  ('groei', 'btw_overzicht'),
  ('groei', 'kosten_nacalculatie'),
  ('groei', 'eigen_email_templates'),
  ('groei', 'gedeelde_werkruimte'),
  ('team', 'crm_pipeline'),
  ('team', 'klanten'),
  ('team', 'leads'),
  ('team', 'offertes'),
  ('team', 'facturen'),
  ('team', 'werkbonnen'),
  ('team', 'uren'),
  ('team', 'agenda'),
  ('team', 'adres_autocomplete'),
  ('team', 'afspraakherinnering'),
  ('team', 'email_templates_bewerken'),
  ('team', 'digitale_handtekening'),
  ('team', 'betaalherinneringen'),
  ('team', 'boekhoudkoppeling'),
  ('team', 'btw_overzicht'),
  ('team', 'kosten_nacalculatie'),
  ('team', 'eigen_email_templates'),
  ('team', 'rollen_rechten'),
  ('team', 'planning'),
  ('team', 'stripe_betaallink'),
  ('team', 'voertuigen');

DELETE FROM public.plan_limits;
INSERT INTO public.plan_limits (plan, limit_key, limit_value, telwijze) VALUES
  ('starter', 'gebruikers', 1, 'voorraad'),
  ('starter', 'klanten', 100, 'voorraad'),
  ('starter', 'offertes', 20, 'periode'),
  ('starter', 'facturen', 20, 'periode'),
  ('groei', 'gebruikers', 2, 'voorraad'),
  ('groei', 'klanten', NULL, 'voorraad'),
  ('groei', 'offertes', NULL, 'periode'),
  ('groei', 'facturen', NULL, 'periode'),
  ('team', 'gebruikers', NULL, 'voorraad'),
  ('team', 'klanten', NULL, 'voorraad'),
  ('team', 'offertes', NULL, 'periode'),
  ('team', 'facturen', NULL, 'periode');

DELETE FROM public.plan_modules;
INSERT INTO public.plan_modules (module_key, label, feature, price, vereist) VALUES
  ('stripe_betaallink', 'Stripe betaallink', 'stripe_betaallink', 10, NULL),
  ('planning', 'Planningsmodule', 'planning', 10, NULL),
  ('voertuigen', 'Voertuigen', 'voertuigen', 5, 'planning');

DELETE FROM public.plan_module_tiers;
INSERT INTO public.plan_module_tiers (plan, module_key) VALUES
  ('groei', 'stripe_betaallink'),
  ('groei', 'planning'),
  ('groei', 'voertuigen');

COMMIT;

-- ── 11. BESTAANDE DATA: LEDGER VULLEN VOOR DE LOPENDE PERIODE ─────────────────
-- Zonder dit zou de teller op 0 staan terwijl er deze periode al offertes en
-- facturen zijn aangemaakt. Alleen de lopende periode; oudere periodes doen er
-- niet meer toe.
BEGIN;

INSERT INTO public.plan_usage_events (company_id, soort, periode_start, ref_id, created_at)
SELECT o.company_id, 'offerte', public.bb_periode_start(o.company_id), o.id, o.created_at
FROM public.offertes o
WHERE o.created_at::date >= public.bb_periode_start(o.company_id)
  AND public.bb_offerte_telt_mee(o.company_id, o.nummer, o.customer_id, o.id)
  AND NOT EXISTS (SELECT 1 FROM public.plan_usage_events e WHERE e.ref_id = o.id AND e.soort = 'offerte');

INSERT INTO public.plan_usage_events (company_id, soort, periode_start, ref_id, created_at)
SELECT f.company_id, 'factuur', public.bb_periode_start(f.company_id), f.id, f.created_at
FROM public.facturen f
WHERE f.created_at::date >= public.bb_periode_start(f.company_id)
  AND NOT COALESCE(f.is_credit, false)
  AND NOT EXISTS (SELECT 1 FROM public.plan_usage_events e WHERE e.ref_id = f.id AND e.soort = 'factuur');

COMMIT;

-- ── 12. GEDEELDE WERKRUIMTE VIA DE MATRIX ─────────────────────────────────────
-- De RLS uit 20260714150000 gebruikte de losse tier-vergelijking
-- `get_company_tier() = 'groei'` voor de gedeelde werkruimte. Die vergelijking
-- verdwijnt hier: de policies zijn ongewijzigd overgenomen, met alleen die ene
-- expressie vervangen door bb_gedeelde_werkruimte() — dezelfde matrix die de
-- frontend leest. Wie het gedrag wil verplaatsen naar een ander tier, past
-- src/lib/features.js aan; de policies hoeven niet meer mee.
CREATE OR REPLACE FUNCTION public.bb_gedeelde_werkruimte()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_has_feature('gedeelde_werkruimte')
$$;

GRANT EXECUTE ON FUNCTION public.bb_gedeelde_werkruimte() TO authenticated;

BEGIN;

-- ── 12.2 PROJECTEN: zien (eigen/all) vs. bewerken (recht) ───────────────────────
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      bb_gedeelde_werkruimte()
      OR bb_has_permission('alles_inzien')          -- dekt admin/planner
      OR assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM werkbonnen w
        WHERE w.project_id = projects.id
          AND (w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids))
      )
    )
  );

DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('projecten_bewerken')
  );

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('projecten_bewerken')
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('projecten_bewerken')
  );
-- projects_delete blijft admin-only (ongewijzigd).

-- ── 12.3 WERKBONNEN: brede inzage + bewerkrecht + planning mag inplannen ────────
DROP POLICY IF EXISTS "werkbonnen_select" ON werkbonnen;
CREATE POLICY "werkbonnen_select" ON werkbonnen
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      bb_gedeelde_werkruimte()
      OR bb_has_permission('planning')              -- dekt admin/planner + planning-recht
      OR bb_has_permission('alles_inzien')
      OR assigned_to = auth.uid()
      OR auth.uid() = ANY(assigned_to_ids)
    )
  );

DROP POLICY IF EXISTS "werkbonnen_update" ON werkbonnen;
CREATE POLICY "werkbonnen_update" ON werkbonnen
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      bb_gedeelde_werkruimte()
      OR bb_has_permission('planning')              -- planner mag inplannen
      OR bb_has_permission('werkbonnen_bewerken')
      OR auth.uid() = ANY(verantwoordelijke_ids)
    )
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      bb_gedeelde_werkruimte()
      OR bb_has_permission('planning')
      OR bb_has_permission('werkbonnen_bewerken')
      OR auth.uid() = ANY(verantwoordelijke_ids)
    )
  );

-- ── 12.4 WERKBON CHILD-TABELLEN: inzage = gekoppelden; schrijven = werkbon-editor ─
-- Editor = werkbonnen_bewerken (dekt admin/planner) OF verantwoordelijke OF Groei.
-- Viewer = planning/alles_inzien/Groei OF eigen toewijzing.

-- fotos: schrijven
DROP POLICY IF EXISTS "werkbon_fotos_insert" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_insert" ON werkbon_fotos
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_fotos.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_fotos_delete" ON werkbon_fotos;
CREATE POLICY "werkbon_fotos_delete" ON werkbon_fotos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_fotos.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- taken: inzage (gekoppelden + alles_inzien) / bewerken (editor)
DROP POLICY IF EXISTS "werkbon_taken_select" ON werkbon_taken;
CREATE POLICY "werkbon_taken_select" ON werkbon_taken
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning') OR bb_has_permission('alles_inzien')
             OR w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_taken_update" ON werkbon_taken;
CREATE POLICY "werkbon_taken_update" ON werkbon_taken
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_taken.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- materialen: inzage (gekoppelden + alles_inzien) / schrijven (editor)
DROP POLICY IF EXISTS "werkbon_materialen_select" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_select" ON werkbon_materialen
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning') OR bb_has_permission('alles_inzien')
             OR w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_materialen_insert" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_insert" ON werkbon_materialen
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_materialen_update" ON werkbon_materialen;
CREATE POLICY "werkbon_materialen_update" ON werkbon_materialen
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_materialen.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- meerwerk: schrijven (editor)
DROP POLICY IF EXISTS "werkbon_meerwerk_insert" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_insert" ON werkbon_meerwerk
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_meerwerk.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_meerwerk_delete" ON werkbon_meerwerk;
CREATE POLICY "werkbon_meerwerk_delete" ON werkbon_meerwerk
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = werkbon_meerwerk.werkbon_id
        AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- storage (werkbon-fotos): pad {company}/{werkbon}/{uuid}; foldername()[2]=werkbon_id
DROP POLICY IF EXISTS "werkbon_fotos_insert" ON storage.objects;
CREATE POLICY "werkbon_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid AND w.company_id = current_user_company_id()
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_fotos_update" ON storage.objects;
CREATE POLICY "werkbon_fotos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid AND w.company_id = current_user_company_id()
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  )
  WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid AND w.company_id = current_user_company_id()
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );
DROP POLICY IF EXISTS "werkbon_fotos_delete" ON storage.objects;
CREATE POLICY "werkbon_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
    AND EXISTS (
      SELECT 1 FROM werkbonnen w
      WHERE w.id = ((storage.foldername(name))[2])::uuid AND w.company_id = current_user_company_id()
        AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken') OR auth.uid() = ANY(w.verantwoordelijke_ids))
    )
  );

-- ── 12.5 job_costs: materiaalkosten op werkbon vallen onder werkbonnen_bewerken ──
-- Naast het bestaande 'kosten'-recht mag een werkbon-editor de aan díe werkbon
-- gekoppelde job_costs (werkbon_id) lezen/schrijven. Standalone kosten (geen
-- werkbon_id, Kosten-pagina) blijven puur onder 'kosten'.
DROP POLICY IF EXISTS "Users can view own company job costs" ON public.job_costs;
CREATE POLICY "Users can view own company job costs" ON public.job_costs FOR SELECT TO authenticated
  USING (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ));
DROP POLICY IF EXISTS "Users can insert own company job costs" ON public.job_costs;
CREATE POLICY "Users can insert own company job costs" ON public.job_costs FOR INSERT TO authenticated
  WITH CHECK (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ));
DROP POLICY IF EXISTS "Users can update own company job costs" ON public.job_costs;
CREATE POLICY "Users can update own company job costs" ON public.job_costs FOR UPDATE TO authenticated
  USING (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ))
  WITH CHECK (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ));
DROP POLICY IF EXISTS "Users can delete own company job costs" ON public.job_costs;
CREATE POLICY "Users can delete own company job costs" ON public.job_costs FOR DELETE TO authenticated
  USING (company_id = current_company_id() AND (
    bb_has_permission('kosten')
    OR (job_costs.werkbon_id IS NOT NULL AND (
         bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken')
         OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = job_costs.werkbon_id
                    AND w.company_id = current_company_id() AND auth.uid() = ANY(w.verantwoordelijke_ids))
       ))
  ));

-- ── 12.6 DEALS: verkooppijplijn server-side op 'verkoop' ────────────────────────
DROP POLICY IF EXISTS "deals_select" ON deals;
CREATE POLICY "deals_select" ON deals
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('verkoop')
  );
DROP POLICY IF EXISTS "deals_insert" ON deals;
CREATE POLICY "deals_insert" ON deals
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('verkoop')
  );
DROP POLICY IF EXISTS "deals_update" ON deals;
CREATE POLICY "deals_update" ON deals
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('verkoop')
  ) WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND bb_has_permission('verkoop')
  );
-- deals_delete blijft admin-only (ongewijzigd).

-- ── 12.7 AGENDA INZIEN: additieve SELECT-tak op calendar_events + activities ─────
DROP POLICY IF EXISTS "Users can view own company calendar events" ON calendar_events;
CREATE POLICY "Users can view own company calendar events" ON calendar_events
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      bb_gedeelde_werkruimte()
      OR bb_has_permission('planning')
      OR bb_has_permission('agenda_inzien')
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM activities a WHERE a.id = calendar_events.activiteit_id AND (a.assigned_to = auth.uid() OR auth.uid() = ANY(a.assigned_to_ids)))
      OR EXISTS (SELECT 1 FROM werkbonnen w WHERE w.id = calendar_events.werkbon_id AND (w.assigned_to = auth.uid() OR auth.uid() = ANY(w.assigned_to_ids)))
    )
  );

DROP POLICY IF EXISTS "Users can view own company activities" ON activities;
CREATE POLICY "Users can view own company activities" ON activities
  FOR SELECT USING (
    company_id = current_company_id()
    AND (
      bb_gedeelde_werkruimte()
      OR bb_has_permission('planning')
      OR bb_has_permission('agenda_inzien')
      OR assigned_to = auth.uid()
      OR auth.uid() = ANY(assigned_to_ids)
    )
  );

COMMIT;
