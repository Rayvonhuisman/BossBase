-- =============================================================================
-- 20260804130000_looptijd_reset.sql
--
-- LOOPTIJD RESET BIJ EEN PAKKETUPGRADE VAN EEN JAARABONNEMENT.
--
-- Gaat een jaarklant naar een hoger pakket, dan begint de 12-maandsverplichting
-- opnieuw. Wie in maand 11 van Groei naar Team gaat, zit daarna weer 12 maanden
-- vast — niet nog één maand.
--
-- WEL resetten:  tier omhoog bij een jaarabonnement (starter→groei, groei→team).
-- NIET resetten: modules bijkopen en extra gebruikers. Dat zijn bijbestellingen,
--                geen nieuw abonnement; de looptijd resetten voor € 10 is
--                disproportioneel en remt precies de bijverkoop die we willen.
-- NIET van toepassing op maandabonnementen: die blijven maandelijks opzegbaar,
--                ook na een upgrade.
--
-- DE DATUM. Stripe verankert een subscription_schedule aan de factuurperiode,
-- niet aan het moment van klikken: een fase begint bij het begin van de lopende
-- periode. De nieuwe einddatum is dus de START VAN DE LOPENDE FACTUURPERIODE
-- plus 12 maanden — in de praktijk de upgradedatum, teruggerond naar de
-- periodestart. Dat is maximaal een maand eerder dan "upgradedatum + 12
-- maanden", en het is de enige variant die Stripe ook daadwerkelijk afdwingt.
--
-- Deze functie rekent hem vooraf uit zodat het upgradescherm de klant de
-- ECHTE datum kan tonen vóór hij bevestigt. Na afloop leest billing-wijzig de
-- werkelijke end_date van de schedule terug; die blijft de waarheid.
-- =============================================================================

BEGIN;

-- Wat wordt de nieuwe einddatum van de looptijd als dit bedrijf nú naar
-- p_doel_tier gaat? NULL = geen reset (maandabonnement, gelijk of lager pakket,
-- of geen lopende jaarverplichting).
CREATE OR REPLACE FUNCTION public.bb_nieuwe_looptijd(p_company_id uuid, p_doel_tier text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_huidig    text;
  v_interval  text;
  v_start     timestamptz;
  v_rang_nu   int;
  v_rang_doel int;
BEGIN
  IF p_doel_tier NOT IN ('starter', 'groei', 'team') THEN RETURN NULL; END IF;

  SELECT public.bb_effective_tier(p_company_id) INTO v_huidig;
  SELECT s.billing_interval, s.current_period_start
    INTO v_interval, v_start
    FROM public.subscriptions s WHERE s.company_id = p_company_id;

  -- Alleen jaarabonnementen kennen een looptijd om te resetten.
  IF COALESCE(v_interval, 'maand') <> 'jaar' THEN RETURN NULL; END IF;

  v_rang_nu   := array_position(ARRAY['starter','groei','team'], v_huidig);
  v_rang_doel := array_position(ARRAY['starter','groei','team'], p_doel_tier);

  -- Alleen omhoog. Gelijk blijven of omlaag gaan raakt de looptijd niet.
  IF v_rang_doel IS NULL OR v_rang_nu IS NULL OR v_rang_doel <= v_rang_nu THEN
    RETURN NULL;
  END IF;

  -- Verankerd aan de factuurperiode, want daar zet Stripe de fase ook op. Is er
  -- (nog) geen periodestart bekend, dan is nu het beste anker dat we hebben.
  RETURN COALESCE(v_start, now()) + interval '12 months';
END;
$$;

GRANT EXECUTE ON FUNCTION public.bb_nieuwe_looptijd(uuid, text) TO authenticated;

-- ── bb_mag_wisselen uitbreiden ───────────────────────────────────────────────
-- Eén antwoord waar zowel het scherm als billing-wijzig op draait. De reset
-- hoort daarin thuis en niet in een tweede aanroep: dan zou het scherm een
-- datum kunnen tonen die de server niet gebruikt.
CREATE OR REPLACE FUNCTION public.bb_mag_wisselen(p_company_id uuid, p_doel_tier text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_huidig      text;
  v_rang_nu     int;
  v_rang_doel   int;
  v_verplicht   timestamptz;
  v_blokkades   jsonb;
  v_nieuwe      timestamptz;
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
    RETURN jsonb_build_object('mag', true, 'richting', 'gelijk',
                              'looptijdReset', false);
  END IF;

  -- Omhoog: altijd goed. Geen limietcontrole nodig — een ruimer pakket kan per
  -- definitie alles wat het huidige kan. Bij een jaarabonnement start de
  -- looptijd wel opnieuw; die datum gaat mee zodat het scherm hem kan tonen
  -- vóór de klant bevestigt.
  IF v_rang_doel > v_rang_nu THEN
    v_nieuwe := public.bb_nieuwe_looptijd(p_company_id, p_doel_tier);
    RETURN jsonb_build_object(
      'mag', true, 'richting', 'omhoog',
      'looptijdReset', (v_nieuwe IS NOT NULL),
      'nieuweVerplichtingTot', v_nieuwe,
      'huidigeVerplichtingTot', v_verplicht);
  END IF;

  -- Omlaag binnen de looptijd van een jaarabonnement: nee.
  IF v_verplicht IS NOT NULL AND v_verplicht > now() THEN
    RETURN jsonb_build_object(
      'mag', false, 'richting', 'omlaag', 'code', 'binnen_looptijd',
      'looptijdReset', false,
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
      'looptijdReset', false,
      'blokkades', v_blokkades,
      'reden', 'Je zit boven de limiet van dit pakket.');
  END IF;

  RETURN jsonb_build_object('mag', true, 'richting', 'omlaag', 'looptijdReset', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(text)       TO authenticated;

COMMIT;
