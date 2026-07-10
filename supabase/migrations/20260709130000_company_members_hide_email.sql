-- =============================================================================
-- COMPANY_MEMBERS — SELECT-policy aanscherpen zodat gewone gebruikers niet
-- langer de e-mailadressen (en overige gegevens) van andere teamleden kunnen
-- uitlezen via de frontend.
--
-- AANLEIDING
--   Mailverzending gebeurt inmiddels volledig server-side (o.a. de
--   create-notification edge function) met de service-role. De frontend heeft
--   teamled-e-mailadressen daardoor niet meer nodig.
--
--   De oude policy liet ELK bedrijfslid ALLE rijen én ALLE kolommen van
--   company_members lezen:
--       USING ( company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) )
--   Omdat RLS row-level is (niet column-level) en de kolom-grants standaard open
--   staan, kon een gewone gebruiker zo simpelweg `select email from
--   company_members` draaien en alle e-mailadressen van collega's harvesten.
--
-- NIEUWE POLICY
--   * Een gewone gebruiker mag alleen zijn EIGEN lidmaatschapsrij lezen.
--   * Admins mogen (zoals voorheen) het volledige team + openstaande
--     uitnodigingen zien; teambeheer (uitnodigen/bewerken/verwijderen) is in de
--     INSERT/UPDATE/DELETE-policies al uitsluitend voor admins.
--
-- WAAROM DIT NIETS BREEKT
--   Geaccepteerde teamleden worden in de UI via `profiles` getoond (getTeamMembers
--   leest echte leden uit profiles, zónder e-mail). Alleen openstaande
--   uitnodigingen komen uit company_members, en die zijn puur voor admin-teambeheer.
--   Inplannen/selecteren/@mentionen van teamleden gebruikt de profiles-bron en
--   blijft dus volledig werken. Service-role (edge functions) omzeilt RLS en is
--   niet geraakt.
-- =============================================================================

DROP POLICY IF EXISTS "company_members_select" ON company_members;
CREATE POLICY "company_members_select" ON company_members
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      -- eigen lidmaatschapsrij (je eigen gegevens mag je zien)
      profile_id = auth.uid()
      -- admins beheren het team en zien openstaande uitnodigingen incl. e-mail
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  );
