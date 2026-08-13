-- =============================================================================
-- 20260813160000_boss_doorzetten.sql
--
-- Boss kan een vraag doorzetten naar het team.
--
-- Twee grenzen, allebei in de database en niet in de frontend:
--   • maximaal één doorzet-mail per gesprek
--   • maximaal vijf per gebruiker per rollende 24 uur
--
-- Waarom hier en niet in de edge function: de frontend levert de
-- gespreksgeschiedenis aan en kan dus beweren wat hij wil. Een vlag op het
-- gesprek en een teller in een tabel zijn niet van buitenaf te beïnvloeden.
-- =============================================================================

BEGIN;

-- ── 1. ÉÉN PER GESPREK ───────────────────────────────────────────────────────
ALTER TABLE public.boss_conversations
  ADD COLUMN IF NOT EXISTS doorzet_verstuurd_op timestamptz;

COMMENT ON COLUMN public.boss_conversations.doorzet_verstuurd_op IS
  'Wanneer de vraag uit dit gesprek naar het team is doorgezet. Eén keer per gesprek; NULL = nog niet.';

-- ── 2. VIJF PER GEBRUIKER PER 24 UUR ─────────────────────────────────────────
-- Rollend venster, net als bij de berichtenlimiet. Geen kalenderdag: iemand die
-- om 23:50 vastloopt zou anders om 00:05 weer vijf mails kunnen sturen.
CREATE TABLE IF NOT EXISTS public.boss_doorzet_limiet (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  aantal       integer     NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.boss_doorzet_limiet IS
  'Teller voor het aantal doorzet-mails per gebruiker per 24 uur. Alleen de edge function raakt dit aan.';

ALTER TABLE public.boss_doorzet_limiet ENABLE ROW LEVEL SECURITY;
-- Bewust geen policies: alleen de service-role komt erbij.

-- ── 3. CLAIMEN ───────────────────────────────────────────────────────────────
-- Doet beide controles in één keer en zet de vlag. Geeft terug of het doorgaat
-- en zo nee waarom niet, zodat Boss dat eerlijk kan vertellen.
--
-- Belangrijk: dit claimt VOORAF. Mislukt de mail daarna, dan geeft de edge
-- function de claim terug met bb_boss_geef_doorzet_vrij() — anders zou een
-- storing bij de mailprovider iemands enige poging opsouperen.
CREATE OR REPLACE FUNCTION public.bb_boss_claim_doorzet(
  p_conversation_id uuid,
  p_user_id         uuid,
  p_max_per_dag     integer DEFAULT 5
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bestaat      boolean;
  v_al_verstuurd timestamptz;
  v_start        timestamptz;
  v_aantal       integer;
BEGIN
  -- Bestaat dit gesprek en is het van deze gebruiker?
  --
  -- Deze controle stond er eerst niet, en dat was fout: bij een gesprek van
  -- iemand anders bleef v_al_verstuurd gewoon NULL, viel de functie door naar de
  -- dagteller en gaf hij alsnog toestemming. De vlag belandde dan nergens, maar
  -- de mail zou wel de deur uit gaan en de teller van het slachtoffer oplopen.
  SELECT true, doorzet_verstuurd_op INTO v_bestaat, v_al_verstuurd
  FROM public.boss_conversations
  WHERE id = p_conversation_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT COALESCE(v_bestaat, false) THEN
    RETURN jsonb_build_object(
      'toegestaan', false,
      'code',       'geen_gesprek',
      'reden',      'Dit gesprek bestaat niet of hoort niet bij jou.'
    );
  END IF;

  IF v_al_verstuurd IS NOT NULL THEN
    RETURN jsonb_build_object(
      'toegestaan', false,
      'code',       'al_doorgezet',
      'reden',      'In dit gesprek is de vraag al doorgezet naar het team.'
    );
  END IF;

  -- Dagteller.
  INSERT INTO public.boss_doorzet_limiet (user_id, window_start, aantal)
  VALUES (p_user_id, now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT window_start, aantal INTO v_start, v_aantal
  FROM public.boss_doorzet_limiet WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_start < now() - interval '24 hours' THEN
    v_start := now();
    v_aantal := 0;
  END IF;

  IF v_aantal >= p_max_per_dag THEN
    RETURN jsonb_build_object(
      'toegestaan', false,
      'code',       'dagmaximum',
      'reden',      format('Er zijn vandaag al %s vragen doorgezet. Dat kan weer na %s.',
                           p_max_per_dag, to_char(v_start + interval '24 hours', 'HH24:MI')),
      'opnieuw_op', v_start + interval '24 hours'
    );
  END IF;

  UPDATE public.boss_doorzet_limiet
     SET window_start = v_start, aantal = v_aantal + 1
   WHERE user_id = p_user_id;

  UPDATE public.boss_conversations
     SET doorzet_verstuurd_op = now()
   WHERE id = p_conversation_id AND user_id = p_user_id;

  RETURN jsonb_build_object('toegestaan', true, 'gebruikt', v_aantal + 1, 'maximum', p_max_per_dag);
END;
$$;

REVOKE ALL ON FUNCTION public.bb_boss_claim_doorzet(uuid, uuid, integer) FROM public, anon, authenticated;

-- Claim teruggeven als het versturen mislukt.
CREATE OR REPLACE FUNCTION public.bb_boss_geef_doorzet_vrij(
  p_conversation_id uuid,
  p_user_id         uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.boss_conversations
     SET doorzet_verstuurd_op = NULL
   WHERE id = p_conversation_id AND user_id = p_user_id;

  UPDATE public.boss_doorzet_limiet
     SET aantal = GREATEST(0, aantal - 1)
   WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bb_boss_geef_doorzet_vrij(uuid, uuid) FROM public, anon, authenticated;

-- ── 4. GESPREK AANMAKEN AAN HET BEGIN ────────────────────────────────────────
-- De bestaande logfunctie maakte een gesprek aan óf werkte er een bij, met de
-- volledige berichtenlijst. Voor de doorzet-vlag hebben we het gespreks-id al
-- nodig vóórdat het antwoord er is. Deze variant maakt alleen een lege huls, of
-- geeft het bestaande id terug als het gesprek al van deze gebruiker is.
CREATE OR REPLACE FUNCTION public.bb_boss_start_gesprek(
  p_conversation_id uuid,
  p_company_id      uuid,
  p_user_id         uuid,
  p_titel           text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_conversation_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.boss_conversations
     WHERE id = p_conversation_id AND user_id = p_user_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.boss_conversations (company_id, user_id, messages, titel)
  VALUES (p_company_id, p_user_id, '[]'::jsonb, p_titel)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bb_boss_start_gesprek(uuid, uuid, uuid, text) FROM public, anon, authenticated;

COMMIT;
