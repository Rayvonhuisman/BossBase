-- Uitnodiging werd als 'uitgenodigd' weggeschreven, ook wanneer de
-- uitnodigingsmail faalde (send-email gaf 422). De beheerder zag dan
-- "Uitgenodigd" staan terwijl er nooit iets is aangekomen, en had geen manier om
-- dat te zien.
--
-- We houden de mislukking apart bij in plaats van de status te vervuilen: de rij
-- blijft een geldige uitnodiging (token en verloopdatum kloppen), alleen het
-- versturen is niet gelukt. Zo kan de beheerder gericht opnieuw versturen.

ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS invite_email_failed_at timestamptz;

ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS invite_email_error text;

COMMENT ON COLUMN company_members.invite_email_failed_at IS
  'Gezet wanneer het versturen van de uitnodigingsmail mislukte. NULL = mail is verstuurd (of er is nog geen poging gedaan).';
COMMENT ON COLUMN company_members.invite_email_error IS
  'Foutmelding van de laatste mislukte verzendpoging, voor weergave aan de beheerder.';
