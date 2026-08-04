-- =============================================================================
-- 20260804140000_upgrade_verzoek_medewerker.sql
--
-- Een medewerker mag een upgradeverzoek indienen.
--
-- upgrade_requests kende alleen een INSERT-policy voor admins. Dat klopte toen
-- alleen de beheerder dat scherm te zien kreeg. Sinds de upgradeflow krijgt een
-- MEDEWERKER die tegen een limiet of ontbrekende functie aanloopt de knop "laat
-- mijn beheerder weten" — precies om te voorkomen dat hij doodloopt op een
-- betaalknop die hij niet mag gebruiken. Die knop werkte dus niet.
--
-- Betalen blijft voorbehouden aan de eigenaar/admin: dat wordt server-side
-- afgedwongen in billing-checkout, billing-wijzig, billing-portal en
-- billing-cancel (eisAbonnementsbeheerder). Dit gaat alleen over een seintje
-- doorgeven binnen het eigen bedrijf, niet over geld.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS upgrade_requests_insert ON public.upgrade_requests;

-- Iedereen die bij het bedrijf hoort mag een verzoek indienen, voor zijn eigen
-- bedrijf. De company-scoping blijft staan; alleen de rolbeperking gaat eraf.
--
-- Op naam zetten hoeft hier niet: de bestaande trigger
-- bb_set_upgrade_request_author() zet aangevraagd_door hard op auth.uid() en de
-- status op 'open', vóórdat deze WITH CHECK draait. Een verzoek op andermans
-- naam indienen kan dus sowieso niet — een extra clausule daarvoor zou alleen
-- maar suggereren dat het de policy is die dat tegenhoudt.
CREATE POLICY upgrade_requests_insert ON public.upgrade_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

COMMENT ON POLICY upgrade_requests_insert ON public.upgrade_requests IS
  'Elk teamlid mag een upgradeverzoek indienen voor zijn eigen bedrijf. Betalen blijft aan de eigenaar/admin — dat zit in de edge functions, niet hier.';

COMMIT;
