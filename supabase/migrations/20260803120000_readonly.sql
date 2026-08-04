-- =============================================================================
-- 20260803120000_readonly.sql
--
-- READ-ONLY VOOR ACCOUNTS ZONDER GELDIG ABONNEMENT.
--
-- Na de 14 gratis dagen moet er een abonnement zijn. Is dat er niet — of is het
-- opgezegd of onbetaald — dan gaat het account NIET op slot maar in read-only.
-- De klant blijft bij zijn eigen administratie: bekijken, zoeken, filteren,
-- exporteren. Alleen nieuw werk vastleggen kan niet meer.
--
-- Dat onderscheid is bewust. Een lockout maakt van een betaalprobleem een
-- gijzeling van andermans gegevens; read-only laat de klant zijn boekhouding
-- houden en maakt tegelijk duidelijk dat er iets geregeld moet worden.
--
-- WAT BLIJFT WERKEN — en waarom:
--   • Alles lezen, zoeken, exporteren        het is zijn eigen administratie
--   • Upgraden en betalen                    een klant die WIL betalen maar niet
--                                            KAN is het ergste faalscenario dat
--                                            er is; billing raakt deze gates niet
--   • Inkomende leads (formulier/mail)       lopen via service_role en omzeilen
--                                            RLS — zelfde regel als de klantcap
--   • Factuur op betaald zetten              dat is geld dat binnenkomt
--   • Creditfactuur                          een correctie op geleverd werk, geen
--                                            nieuw werk (zelfde uitzondering als
--                                            in de facturenlimiet)
--   • Uitloggen, wachtwoord, profiel         raakt de administratie niet
--
-- WAT DICHT GAAT: nieuwe klant, offerte, factuur, werkbon, afspraak, project of
-- deal aanmaken; offertes/facturen versturen; uren boeken; notities toevoegen;
-- foto's uploaden; teamleden uitnodigen.
--
-- VEILIGHEIDSKLEP — hetzelfde principe als bb_plan_geconfigureerd(): bij
-- ontbrekende of onbekende abonnementsgegevens is het antwoord NIET read-only.
-- Een bug in deze code mag nooit een betalende klant het werken beletten. Elke
-- tak die niet met zekerheid "dit abonnement is verlopen" zegt, valt terug op
-- open. Zie bb_readonly_reden() hieronder: alleen expliciet herkende toestanden
-- geven een reden terug, al het overige NULL.
--
-- Noodrem: supabase/rollback/disable_readonly.sql zet alles in één keer uit.
-- =============================================================================

BEGIN;

-- ── 1. IS DIT BEDRIJF READ-ONLY, EN WAAROM? ──────────────────────────────────
-- Eén functie geeft de reden, een tweede maakt er een boolean van. De reden is
-- geen luxe: de banner in de app moet kunnen zeggen wát er aan de hand is, en
-- "je proefperiode is voorbij" vraagt een ander gesprek dan "je incasso is
-- mislukt". Waarden: 'proefperiode_verlopen', 'betaling_mislukt', 'opgezegd'.
-- NULL = niet read-only.
CREATE OR REPLACE FUNCTION public.bb_readonly_reden(p_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    -- Veiligheidsklep. Geen bruikbare configuratie = we WETEN het niet, en dan
    -- blokkeren we niet. Dekt onder meer een bedrijf zonder abonnementsrij en
    -- een matrix die (nog) niet geseed is.
    WHEN NOT public.bb_plan_geconfigureerd(p_company_id) THEN NULL

    -- Lopende proefperiode. Dekt zowel onze eigen 14 dagen als een Stripe-trial.
    -- Een bedrijf in de gratis periode is per definitie nooit read-only.
    WHEN public.bb_is_trial(p_company_id) THEN NULL

    ELSE (
      SELECT CASE
        -- ── Abonnement bij Stripe: Stripe is dan de waarheid ────────────────
        WHEN s.stripe_subscription_id IS NOT NULL THEN CASE
          -- Nog geen status binnen (webhook onderweg) → niet blokkeren.
          WHEN s.stripe_status IS NULL                                THEN NULL
          WHEN s.stripe_status IN ('active', 'trialing')               THEN NULL
          WHEN s.stripe_status IN ('past_due', 'unpaid')               THEN 'betaling_mislukt'
          -- 'canceled' krijgt Stripe pas ná afloop van de betaalde periode;
          -- tot dat moment blijft de status 'active' met een opzegdatum. De
          -- klant houdt dus waar hij voor betaald heeft.
          WHEN s.stripe_status IN ('canceled', 'incomplete_expired',
                                   'paused')                           THEN 'opgezegd'
          -- 'incomplete' = eerste betaling nog onderweg, vlak na de checkout.
          -- Dat is een moment, geen toestand — niet blokkeren.
          ELSE NULL
        END

        -- ── Geen Stripe-abonnement: onze eigen database is de waarheid ──────
        -- Handmatig op actief gezet (super admin, afspraak buiten Stripe om) →
        -- gewoon een klant.
        WHEN s.status = 'actief' THEN NULL
        WHEN s.status = 'trial' AND s.trial_ends_at IS NOT NULL
                                AND s.trial_ends_at <= now() THEN 'proefperiode_verlopen'
        WHEN s.status IN ('opgezegd', 'geannuleerd', 'cancelled') THEN 'opgezegd'
        -- Alles wat we niet herkennen: open laten.
        ELSE NULL
      END
      FROM public.subscriptions s WHERE s.company_id = p_company_id LIMIT 1
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.bb_readonly_reden()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_readonly_reden(public.bb_current_company())
$$;

CREATE OR REPLACE FUNCTION public.bb_is_readonly(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_readonly_reden(p_company_id) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.bb_is_readonly()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_readonly_reden(public.bb_current_company()) IS NOT NULL
$$;

-- Het tegenovergestelde, want dát is wat een policy nodig heeft. Een policy die
-- `NOT public.bb_is_readonly()` schrijft leest verkeerd om; `bb_mag_schrijven()`
-- zegt precies waar het over gaat.
CREATE OR REPLACE FUNCTION public.bb_mag_schrijven()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_readonly_reden(public.bb_current_company()) IS NULL
$$;

COMMENT ON FUNCTION public.bb_readonly_reden(uuid) IS
  'Waarom is dit bedrijf read-only? proefperiode_verlopen | betaling_mislukt | opgezegd. NULL = niet read-only. Bij onbekende of ontbrekende configuratie altijd NULL (veiligheidsklep).';
COMMENT ON FUNCTION public.bb_mag_schrijven() IS
  'Mag het huidige bedrijf nieuw werk vastleggen? False = read-only. Gebruikt in de restrictive policies.';

GRANT EXECUTE ON FUNCTION public.bb_readonly_reden(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_readonly_reden()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_is_readonly(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_is_readonly()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_mag_schrijven()      TO authenticated;

-- ── 2. NIEUW WERK VASTLEGGEN (restrictive policies op INSERT) ────────────────
-- Zelfde patroon als de plan-gates: RESTRICTIVE, dus ge-AND met de bestaande
-- permissive policies. Het rechtensysteem blijft onaangeroerd en geen enkele
-- oudere policy kan hier omheen.
--
-- Alleen INSERT. Bestaande gegevens blijven leesbaar én bewerkbaar: een typefout
-- in een adres corrigeren hoort niet achter de betaalmuur.

-- Klanten en pipeline. Inkomende leads lopen via service_role (websiteformulier,
-- mailkoppeling) en omzeilen RLS — die komen dus altijd binnen, precies zoals
-- bij de klantlimiet.
DROP POLICY IF EXISTS readonly_customers ON public.customers;
CREATE POLICY readonly_customers ON public.customers AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_deals ON public.deals;
CREATE POLICY readonly_deals ON public.deals AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

-- Offertes.
DROP POLICY IF EXISTS readonly_offertes ON public.offertes;
CREATE POLICY readonly_offertes ON public.offertes AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_offerte_items ON public.offerte_items;
CREATE POLICY readonly_offerte_items ON public.offerte_items AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

-- Facturen. De creditfactuur is de uitzondering: dat is een correctie op werk
-- dat al geleverd en gefactureerd is, geen nieuwe omzet. Hem blokkeren betekent
-- dat een foutieve factuur bij de klant niet rechtgezet kan worden. Dezelfde
-- uitzondering staat in plan_limiet_facturen.
DROP POLICY IF EXISTS readonly_facturen ON public.facturen;
CREATE POLICY readonly_facturen ON public.facturen AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.bb_mag_schrijven() OR COALESCE(is_credit, false));

DROP POLICY IF EXISTS readonly_factuur_regels ON public.factuur_regels;
CREATE POLICY readonly_factuur_regels ON public.factuur_regels AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    public.bb_mag_schrijven()
    OR EXISTS (SELECT 1 FROM public.facturen f
               WHERE f.id = factuur_id AND COALESCE(f.is_credit, false))
  );

-- Werkbonnen en alles wat eraan hangt.
DROP POLICY IF EXISTS readonly_werkbonnen ON public.werkbonnen;
CREATE POLICY readonly_werkbonnen ON public.werkbonnen AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_werkbon_taken ON public.werkbon_taken;
CREATE POLICY readonly_werkbon_taken ON public.werkbon_taken AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_werkbon_materialen ON public.werkbon_materialen;
CREATE POLICY readonly_werkbon_materialen ON public.werkbon_materialen AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_werkbon_meerwerk ON public.werkbon_meerwerk;
CREATE POLICY readonly_werkbon_meerwerk ON public.werkbon_meerwerk AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_werkbon_fotos ON public.werkbon_fotos;
CREATE POLICY readonly_werkbon_fotos ON public.werkbon_fotos AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

-- Agenda, projecten, activiteiten.
DROP POLICY IF EXISTS readonly_calendar_events ON public.calendar_events;
CREATE POLICY readonly_calendar_events ON public.calendar_events AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_activities ON public.activities;
CREATE POLICY readonly_activities ON public.activities AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_projects ON public.projects;
CREATE POLICY readonly_projects ON public.projects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

-- Uren en kosten.
DROP POLICY IF EXISTS readonly_urenregistratie ON public.urenregistratie;
CREATE POLICY readonly_urenregistratie ON public.urenregistratie AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_job_costs ON public.job_costs;
CREATE POLICY readonly_job_costs ON public.job_costs AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

-- Notities, in alle vier de smaken.
DROP POLICY IF EXISTS readonly_notes ON public.notes;
CREATE POLICY readonly_notes ON public.notes AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_project_notes ON public.project_notes;
CREATE POLICY readonly_project_notes ON public.project_notes AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_activiteit_notities ON public.activiteit_notities;
CREATE POLICY readonly_activiteit_notities ON public.activiteit_notities AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

DROP POLICY IF EXISTS readonly_werkbon_notities ON public.werkbon_notities;
CREATE POLICY readonly_werkbon_notities ON public.werkbon_notities AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

-- Voertuigen.
DROP POLICY IF EXISTS readonly_voertuigen ON public.voertuigen;
CREATE POLICY readonly_voertuigen ON public.voertuigen AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

-- Teamleden uitnodigen. Ook zonder limiet: een account zonder abonnement moet
-- niet groter kunnen worden.
DROP POLICY IF EXISTS readonly_company_members ON public.company_members;
CREATE POLICY readonly_company_members ON public.company_members AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.bb_mag_schrijven());

-- ── 3. UPLOADS ───────────────────────────────────────────────────────────────
-- Alleen de buckets die bij nieuw werk horen. Avatars, bedrijfslogo's,
-- handtekeningen en ondertekende offertes blijven open: dat is respectievelijk
-- het profiel, de instellingen, en een KLANT die een offerte accepteert — dat
-- laatste is inkomende omzet en gaat nooit dicht.
DROP POLICY IF EXISTS readonly_uploads ON storage.objects;
CREATE POLICY readonly_uploads ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id NOT IN ('werkbon-fotos', 'kosten-bijlagen')
    OR public.bb_mag_schrijven()
  );

-- ── 4. VERSTUREN ─────────────────────────────────────────────────────────────
-- Versturen is een statusovergang, geen INSERT — een policy kan dat niet zien.
-- Een WITH CHECK op UPDATE kijkt naar de nieuwe rij, en die staat óók op
-- 'verzonden' als de offerte allang verstuurd was; dat zou elke bewerking van een
-- verzonden offerte blokkeren. Een trigger ziet OLD en NEW en kan dus precies de
-- overgang pakken.
--
-- Cruciaal: naar 'betaald' mag ALTIJD. Dat is geld dat binnenkomt; dat blokkeren
-- zou tegen ons eigen belang in werken.
CREATE OR REPLACE FUNCTION public.bb_blokkeer_versturen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'verzonden'
     AND COALESCE(OLD.status, '') IS DISTINCT FROM 'verzonden'
     AND NOT public.bb_mag_schrijven()
  THEN
    RAISE EXCEPTION 'READONLY: versturen kan niet zonder actief abonnement'
      USING ERRCODE = 'check_violation',
            HINT    = 'readonly';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_readonly_offerte_versturen ON public.offertes;
CREATE TRIGGER trg_readonly_offerte_versturen BEFORE UPDATE ON public.offertes
  FOR EACH ROW EXECUTE FUNCTION public.bb_blokkeer_versturen();

DROP TRIGGER IF EXISTS trg_readonly_factuur_versturen ON public.facturen;
CREATE TRIGGER trg_readonly_factuur_versturen BEFORE UPDATE ON public.facturen
  FOR EACH ROW EXECUTE FUNCTION public.bb_blokkeer_versturen();

-- ── 5. STAND VOOR DE UI ──────────────────────────────────────────────────────
-- get_plan_status() hangt overal in de app; hier komt read-only bij, zodat de
-- banner en de knoppen dezelfde waarheid lezen als de policies afdwingen.
-- 'magBeheren' zit erbij omdat de banner voor een medewerker anders is dan voor
-- de eigenaar: alleen wie kan betalen, krijgt de betaalknop te zien.
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
    'readonly',      public.bb_is_readonly(c.id),
    'readonlyReden', public.bb_readonly_reden(c.id),
    'magBeheren',    public.bb_mag_abonnement_beheren(),
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

-- Ook in het abonnementsscherm zelf, want dat is de plek waar de klant het
-- oplost. Daar staat de reden naast de betaalknop.
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
    'readonly', public.bb_is_readonly(c.id),
    'readonlyReden', public.bb_readonly_reden(c.id),
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
