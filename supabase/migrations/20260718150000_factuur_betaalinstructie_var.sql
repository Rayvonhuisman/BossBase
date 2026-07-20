-- =============================================================================
-- BossBase: dynamische betaalinstructie in de standaard factuur-mailtemplate
-- Bestand : supabase/migrations/20260718150000_factuur_betaalinstructie_var.sql
--
-- Vervangt de vaste betaalzin door de {{betaalinstructie}}-variabele, zodat de
-- instructie zich bij het versturen aanpast aan de Stripe-status van het bedrijf
-- (met/zonder online-betaalknop). De template-structuur blijft verder gelijk.
--
-- Surgical & niet-destructief:
--   * alleen de EXACTE standaardzin wordt vervangen (via replace), de rest van de
--     template blijft ongemoeid;
--   * alleen factuur-templates die de zin nog bevatten worden geraakt → een
--     bedrijf dat zijn template zelf heeft aangepast (zin weg/veranderd) blijft
--     onaangeroerd. De code vult {{betaalinstructie}} bij het versturen, en valt
--     terug op net vóór de afsluiting als een template de variabele niet bevat.
-- =============================================================================

update public.email_templates
set body = replace(
      body,
      'Gelieve het totaalbedrag voor de betaaltermijn over te maken onder vermelding van {{factuur_nummer}}.',
      '{{betaalinstructie}}'
    ),
    updated_at = now()
where type = 'factuur'
  and body like '%Gelieve het totaalbedrag voor de betaaltermijn over te maken onder vermelding van {{factuur_nummer}}.%';
