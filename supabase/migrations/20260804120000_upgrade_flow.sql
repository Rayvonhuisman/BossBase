-- =============================================================================
-- 20260804120000_upgrade_flow.sql
--
-- Twee kleine dingen die de upgradeflow nodig heeft.
--
-- 1. BEVESTIGINGSMAIL PRECIES ÉÉN KEER.
--    De webhook krijgt customer.subscription.updated bij elke wijziging: een
--    betaalmethode, een prijswijziging, een opzegging. Zou de "je abonnement is
--    actief"-mail daaraan hangen, dan kreeg de klant hem tien keer. Een vlag op
--    het abonnement die maar één keer geclaimd kan worden lost dat op — en
--    overleeft, anders dan een in-memory check, een herstart van de functie.
--
-- 2. MAG DIT BEDRIJF NAAR DIT PAKKET?
--    De UI moet vóór de klik weten of een overstap gaat lukken. Die kennis zat
--    verspreid: bb_downgrade_blokkades() voor de limieten, en de looptijdregel
--    alleen in de edge function. Eén functie die het hele antwoord geeft,
--    zodat scherm en server niet uit elkaar kunnen lopen.
-- =============================================================================

BEGIN;

-- ── 1. WELKOMSTMAIL ──────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS welkomstmail_op timestamptz;

COMMENT ON COLUMN public.subscriptions.welkomstmail_op IS
  'Wanneer de bevestigingsmail "je abonnement is actief" is verstuurd. Eén keer per abonnement; bb_claim_welkomstmail() bewaakt dat.';

-- Claimt het recht om de mail te sturen. Geeft true terug aan wie hem als
-- eerste te pakken krijgt en false aan alle volgende aanroepen. De UPDATE met
-- `WHERE welkomstmail_op IS NULL` is atomair, dus twee webhook-events die
-- tegelijk binnenkomen leveren nooit twee mails op.
CREATE OR REPLACE FUNCTION public.bb_claim_welkomstmail(p_subscription_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_geclaimd boolean := false;
BEGIN
  UPDATE public.subscriptions
     SET welkomstmail_op = now()
   WHERE stripe_subscription_id = p_subscription_id
     AND welkomstmail_op IS NULL
  RETURNING true INTO v_geclaimd;

  RETURN COALESCE(v_geclaimd, false);
END;
$$;

REVOKE ALL ON FUNCTION public.bb_claim_welkomstmail(text) FROM public, anon, authenticated;

-- ── 2. MAG DIT BEDRIJF NAAR DIT PAKKET? ──────────────────────────────────────
-- Geeft één samengesteld antwoord: mag het, en zo nee waarom niet. De UI toont
-- het vóór de klik, billing-wijzig weigert het erna. Zelfde functie, dus ze
-- kunnen niet uit elkaar lopen.
--
-- Richting is hier het hele verhaal. UPGRADEN mag altijd — ook binnen de
-- 12-maandsverplichting van een jaarabonnement. Dat is geen uitholling van die
-- verplichting maar een verhoging ervan: de klant gaat méér betalen, niet
-- minder. Hem daarvoor laten wachten tot zijn looptijd om is, is de enige
-- variant waarbij iedereen verliest.
--
-- DOWNGRADEN binnen die looptijd is wél uitholling en gaat dus niet door.
-- Buiten de looptijd mag het, mits het bedrijf onder de limieten van het
-- doelpakket zit — die controle blijft bb_downgrade_blokkades().
CREATE OR REPLACE FUNCTION public.bb_mag_wisselen(p_company_id uuid, p_doel_tier text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_huidig      text;
  v_rang_nu     int;
  v_rang_doel   int;
  v_verplicht   timestamptz;
  v_blokkades   jsonb;
BEGIN
  IF p_doel_tier NOT IN ('starter', 'groei', 'team') THEN
    RETURN jsonb_build_object('mag', false, 'code', 'onbekend_pakket',
                              'reden', 'Onbekend pakket.');
  END IF;

  SELECT public.bb_effective_tier(p_company_id) INTO v_huidig;
  SELECT s.verplichting_tot INTO v_verplicht
    FROM public.subscriptions s WHERE s.company_id = p_company_id;

  v_rang_nu   := array_position(ARRAY['starter','groei','team'], v_huidig);
  v_rang_doel := array_position(ARRAY['starter','groei','team'], p_doel_tier);

  IF v_rang_doel = v_rang_nu THEN
    RETURN jsonb_build_object('mag', true, 'richting', 'gelijk');
  END IF;

  -- Omhoog: altijd goed. Geen limietcontrole nodig — een ruimer pakket kan per
  -- definitie alles wat het huidige kan.
  IF v_rang_doel > v_rang_nu THEN
    RETURN jsonb_build_object('mag', true, 'richting', 'omhoog');
  END IF;

  -- Omlaag binnen de looptijd van een jaarabonnement: nee.
  IF v_verplicht IS NOT NULL AND v_verplicht > now() THEN
    RETURN jsonb_build_object(
      'mag', false, 'richting', 'omlaag', 'code', 'binnen_looptijd',
      'verplichtingTot', v_verplicht,
      'reden', format('Je jaarabonnement loopt tot %s. Naar een kleiner pakket kan daarna; upgraden kan wel meteen.',
                      to_char(v_verplicht, 'DD-MM-YYYY')));
  END IF;

  -- Omlaag buiten de looptijd: mag, zolang het past.
  SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_blokkades
    FROM public.bb_downgrade_blokkades(p_company_id, p_doel_tier) b;

  IF jsonb_array_length(v_blokkades) > 0 THEN
    RETURN jsonb_build_object(
      'mag', false, 'richting', 'omlaag', 'code', 'boven_limiet',
      'blokkades', v_blokkades,
      'reden', 'Je zit boven de limiet van dit pakket.');
  END IF;

  RETURN jsonb_build_object('mag', true, 'richting', 'omlaag');
END;
$$;

CREATE OR REPLACE FUNCTION public.bb_mag_wisselen(p_doel_tier text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bb_mag_wisselen(public.bb_current_company(), p_doel_tier)
$$;

GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(text)       TO authenticated;

COMMIT;
