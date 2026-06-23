-- =============================================================================
-- 20260623170000_factuur_offerte_branding_snapshot.sql
--
-- Een verstuurde factuur / verstuurde of ondertekende offerte is een vastgelegd
-- document: de weergave (logo, brandingkleur, bedrijfsgegevens) mag niet meer
-- veranderen als het bedrijf later zijn logo/kleur aanpast.
--
-- Tot nu toe haalde de PDF-generatie deze gegevens LIVE uit `companies`, dus
-- wijzigde de weergave van OUDE documenten mee. Daarom leggen we de bedrijfs-
-- branding VAST op het document op het moment van versturen/ondertekenen.
--
-- Concept-documenten hebben (nog) geen snapshot en blijven de live waarden tonen.
-- =============================================================================

-- ── Facturen ────────────────────────────────────────────────────────────────
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_logo_url        text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_branding_color  text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_bedrijfsnaam    text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_adres           text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_postcode        text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_plaats          text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_email           text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_kvk             text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snapshot_btw             text;

-- ── Offertes ────────────────────────────────────────────────────────────────
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_logo_url        text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_branding_color  text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_bedrijfsnaam    text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_adres           text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_postcode        text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_plaats          text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_email           text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_kvk             text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS snapshot_btw             text;

-- ── Publieke ondertekenpagina: bevroren branding gebruiken ──────────────────
-- De publieke offerte-onderteken-pagina haalt de bedrijfsgegevens via deze RPC.
-- Zodra de offerte een snapshot heeft (verstuurd), tonen we de bevroren waarden
-- i.p.v. de live companies-waarden, zodat de ondertekende offerte er hetzelfde
-- uit blijft zien. Zelfde return-signatuur → geen frontend-wijziging nodig.
CREATE OR REPLACE FUNCTION public.get_company_by_sign_token(p_token uuid)
RETURNS TABLE(name text, logo_url text, email text, phone text, address text, city text, branding_color text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      COALESCE(o.snapshot_bedrijfsnaam, c.name),
      COALESCE(o.snapshot_logo_url, c.logo_url),
      COALESCE(o.snapshot_email, c.email),
      c.phone,
      COALESCE(o.snapshot_adres, c.address),
      COALESCE(o.snapshot_plaats, c.city),
      COALESCE(o.snapshot_branding_color, c.branding_color)
    FROM offertes o
    JOIN companies c ON c.id = o.company_id
    WHERE o.sign_token = p_token;
END;
$function$;
