-- =============================================================================
-- 20260813120000_boss_chat.sql
--
-- BOSS — de helpagent in het portaal.
--
-- Twee tabellen en twee helpers. De edge function boss-chat is de enige die
-- hierin schrijft; de frontend leest alleen zijn eigen gesprekken terug.
--
-- Plus: de AFAS-synchronisatie uitzetten. Die stond los van Boss op de rol, maar
-- gaat in dezelfde ronde mee (zie onderaan).
-- =============================================================================

BEGIN;

-- ── 1. GESPREKKEN ────────────────────────────────────────────────────────────
-- Eén rij per gesprek; de hele geschiedenis staat als jsonb in `messages`.
-- Vorm per bericht: {"rol": "gebruiker"|"boss", "tekst": "...", "op": "<iso>"}.
CREATE TABLE IF NOT EXISTS public.boss_conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  messages    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  titel       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.boss_conversations IS
  'Gesprekken met de helpagent Boss. Eén rij per gesprek, volledige geschiedenis in messages.';
COMMENT ON COLUMN public.boss_conversations.titel IS
  'Korte samenvatting voor in een gesprekkenlijst; afgeleid van de eerste vraag.';

CREATE INDEX IF NOT EXISTS boss_conversations_company_idx
  ON public.boss_conversations (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS boss_conversations_user_idx
  ON public.boss_conversations (user_id, updated_at DESC);

ALTER TABLE public.boss_conversations ENABLE ROW LEVEL SECURITY;

-- Lezen: alles binnen het eigen bedrijf.
--
-- Let op: dit betekent dat collega's elkaars vragen aan Boss kunnen teruglezen.
-- Zo is het gevraagd. Wil je dat een gesprek privé is voor wie het voerde, dan
-- moet `company_id = bb_current_company()` hieronder `user_id = auth.uid()`
-- worden — één regel, verder verandert er niets.
DROP POLICY IF EXISTS boss_conversations_select ON public.boss_conversations;
CREATE POLICY boss_conversations_select ON public.boss_conversations
  FOR SELECT TO authenticated
  USING (company_id = public.bb_current_company());

-- Schrijven: alleen je eigen gesprekken, binnen je eigen bedrijf. In de praktijk
-- schrijft alleen de edge function (met de service-role, die hier langs gaat);
-- deze policies zijn de grendel voor het geval de frontend het ooit zelf doet.
DROP POLICY IF EXISTS boss_conversations_insert ON public.boss_conversations;
CREATE POLICY boss_conversations_insert ON public.boss_conversations
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.bb_current_company() AND user_id = auth.uid());

DROP POLICY IF EXISTS boss_conversations_update ON public.boss_conversations;
CREATE POLICY boss_conversations_update ON public.boss_conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS boss_conversations_delete ON public.boss_conversations;
CREATE POLICY boss_conversations_delete ON public.boss_conversations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 2. RATE LIMIT ────────────────────────────────────────────────────────────
-- Maximaal 30 berichten per gebruiker per uur.
--
-- Waarom een eigen tabel en niet tellen in boss_conversations: daar staat een
-- heel gesprek als één jsonb-blob. Berichten binnen een tijdvenster tellen zou
-- betekenen dat je door die blob heen moet zoeken op tijdstempels die de client
-- aanlevert — dus op iets wat de client zelf kan verzinnen. Een eigen teller is
-- kleiner, atomair en niet te beïnvloeden van buitenaf.
CREATE TABLE IF NOT EXISTS public.boss_rate_limit (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  aantal       integer     NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.boss_rate_limit IS
  'Teller voor het aantal Boss-berichten per gebruiker per uur. Alleen de edge function raakt dit aan.';

ALTER TABLE public.boss_rate_limit ENABLE ROW LEVEL SECURITY;
-- Bewust géén policies: alleen de service-role (de edge function) komt erbij.
-- Een gebruiker hoeft zijn eigen teller niet te kunnen lezen of aanpassen.

-- Claimt één bericht. Geeft terug of het mag, hoeveel er al op staat en wanneer
-- het venster opnieuw begint.
--
-- Telt alleen op als het bericht ook DOORGAAT. Zou een geweigerd bericht ook
-- meetellen, dan schuift het venster op bij elke poging en komt iemand die tegen
-- de grens aan zit er nooit meer overheen.
CREATE OR REPLACE FUNCTION public.bb_boss_claim_bericht(
  p_user_id uuid,
  p_max     integer DEFAULT 30
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start  timestamptz;
  v_aantal integer;
BEGIN
  INSERT INTO public.boss_rate_limit (user_id, window_start, aantal)
  VALUES (p_user_id, now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT window_start, aantal INTO v_start, v_aantal
  FROM public.boss_rate_limit WHERE user_id = p_user_id
  FOR UPDATE;

  -- Venster verlopen? Dan begint het opnieuw.
  IF v_start < now() - interval '1 hour' THEN
    v_start := now();
    v_aantal := 0;
  END IF;

  IF v_aantal >= p_max THEN
    RETURN jsonb_build_object(
      'toegestaan', false,
      'gebruikt',   v_aantal,
      'maximum',    p_max,
      'opnieuw_op', v_start + interval '1 hour'
    );
  END IF;

  UPDATE public.boss_rate_limit
     SET window_start = v_start, aantal = v_aantal + 1
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'toegestaan', true,
    'gebruikt',   v_aantal + 1,
    'maximum',    p_max,
    'opnieuw_op', v_start + interval '1 hour'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bb_boss_claim_bericht(uuid, integer) FROM public, anon, authenticated;

-- ── 3. GESPREK VASTLEGGEN ────────────────────────────────────────────────────
-- Nieuw gesprek of een bestaand gesprek bijwerken, in één aanroep. Geeft het id
-- terug zodat de frontend het volgende bericht aan hetzelfde gesprek kan hangen.
--
-- Een bestaand gesprek wordt alleen bijgewerkt als het van deze gebruiker is.
-- Stuurt iemand het id van een ander mee, dan ontstaat er gewoon een nieuw
-- gesprek in plaats van dat hij dat van een collega overschrijft.
CREATE OR REPLACE FUNCTION public.bb_boss_log_gesprek(
  p_conversation_id uuid,
  p_company_id      uuid,
  p_user_id         uuid,
  p_messages        jsonb,
  p_titel           text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_conversation_id IS NOT NULL THEN
    UPDATE public.boss_conversations
       SET messages   = p_messages,
           titel      = COALESCE(titel, p_titel),
           updated_at = now()
     WHERE id = p_conversation_id
       AND user_id = p_user_id
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.boss_conversations (company_id, user_id, messages, titel)
  VALUES (p_company_id, p_user_id, p_messages, p_titel)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bb_boss_log_gesprek(uuid, uuid, uuid, jsonb, text) FROM public, anon, authenticated;

-- ── 4. AFAS-SYNCHRONISATIE UITZETTEN ─────────────────────────────────────────
-- De twee AFAS-jobs draaiden elke 5 minuten en faalden élke keer op
-- `unrecognized configuration parameter "app.supabase_url"` — 576 mislukte runs
-- per dag, sinds ze bestaan. Ze hebben dus nooit iets gesynchroniseerd; de
-- koppeling is ook niet zichtbaar in het portaal.
--
-- We zetten ze op inactief in plaats van ze te verwijderen: schema en commando
-- blijven staan, zodat AFAS later met één regel weer aan kan. De edge functions
-- en migratie 017 blijven eveneens ongemoeid.
--
-- Dit hoort in een migratie en niet in een losse databasewijziging: anders staat
-- in git nog steeds een migratie die de jobs actief aanmaakt, en zet een
-- herbouw van de database ze zo weer aan.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid, jobname FROM cron.job
            WHERE jobname IN ('afas-import-kosten', 'afas-sync-contacten')
  LOOP
    PERFORM cron.alter_job(r.jobid, active := false);
    RAISE NOTICE 'cron-job % (id %) op inactief gezet', r.jobname, r.jobid;
  END LOOP;
END $$;

COMMIT;
