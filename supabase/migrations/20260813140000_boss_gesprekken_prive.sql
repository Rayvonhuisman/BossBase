-- =============================================================================
-- 20260813140000_boss_gesprekken_prive.sql
--
-- Gesprekken met Boss worden privé.
--
-- De eerste opzet liet iedereen binnen hetzelfde bedrijf elkaars gesprekken
-- lezen. Dat is niet wat je wilt: wie aan Boss vraagt hoe hij zijn abonnement
-- opzegt, of hoe hij een factuur crediteert die hij fout heeft verstuurd, laat
-- dat achter voor zijn collega's en zijn baas. Een helpvraag is persoonlijk.
--
-- Vanaf nu ziet iedereen alleen zijn eigen gesprekken. De company_id blijft op de
-- rij staan — die is nodig om te weten bij welk bedrijf een gesprek hoort en om
-- gesprekken mee te verwijderen als een bedrijf verdwijnt.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS boss_conversations_select ON public.boss_conversations;

CREATE POLICY boss_conversations_select ON public.boss_conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON POLICY boss_conversations_select ON public.boss_conversations IS
  'Iedereen leest alleen zijn eigen gesprekken met Boss. Bewust niet op bedrijfsniveau: een helpvraag is persoonlijk.';

COMMIT;
