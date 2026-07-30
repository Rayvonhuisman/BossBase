-- =============================================================================
-- 20260728150000_plan_matrix_fallback.sql
--
-- VERVOLG op 20260728120000_plan_matrix.sql, die al gepusht is. Die versie mist
-- twee dingen die in productie zijn gebleken:
--
--   1. Een bedrijf ZONDER subscriptions-rij viel terug op 'starter' en kreeg
--      daardoor meteen Starter-limieten (1 gebruiker!) in plaats van de
--      onbeperkte proefperiode. provision_account() maakt bij registratie geen
--      abonnementsrij aan, dus dat raakt élke nieuwe klant. In productie stond
--      op het moment van schrijven al één zo'n bedrijf.
--
--   2. Er was geen veiligheidsklep: ontbrekende of half geseede configuratie
--      leidde tot blokkeren in plaats van toestaan. Een limiet is een
--      commerciële grens, geen beveiligingsgrens — bij twijfel hoort hij open
--      te staan. (De echte beveiliging blijft het rechtensysteem en de
--      company-scoping; die vallen hier niet mee.)
--
-- Deze migratie herstelt beide en zet de gates opnieuw neer. De gates zijn
-- namelijk uitgezet met supabase/rollback/disable_plan_gates.sql toen bleek dat
-- ze zonder vangnet live stonden.
--
-- Alles is idempotent: opnieuw draaien kan zonder gevolgen.
-- =============================================================================

BEGIN;

-- ── 1. VEILIGHEIDSKLEP ────────────────────────────────────────────────────────
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

-- ── 2. LIMIET + FEATURE MET FALLBACK ──────────────────────────────────────────
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

GRANT EXECUTE ON FUNCTION public.bb_plan_geconfigureerd() TO authenticated;

-- ── 3. ELK BEDRIJF EEN ABONNEMENTSRIJ ─────────────────────────────────────────
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

-- ── 4. GATES OPNIEUW NEERZETTEN ───────────────────────────────────────────────
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

-- Feature-gates

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

COMMIT;
