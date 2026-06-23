-- =============================================================================
-- 20260623040000_pipeline_stage_colors.sql
--
-- Eén bron voor de fase-kleuren.
--
-- Probleem: pipeline_stages had geen kleur-kolom. De pipeline-weergave leidde
-- kleuren af uit een hardcoded array (dealService STAGE_COLORS, geïndexeerd op
-- position), terwijl de Instellingen-pagina een niet-bestaande `color_class`
-- kolom probeerde te lezen → alles grijs, en wijzigen in Instellingen werd
-- nooit opgeslagen. De twee weergaven konden dus nooit overeenkomen.
--
-- Oplossing:
--   1. Voeg `color_class` toe aan pipeline_stages.
--   2. Seed bestaande fases met exact de kleuren die de pipeline nu toont
--      (de oude STAGE_COLORS array, op position). Voor Niels' bedrijf én alle
--      bestaande bedrijven.
--   3. Laat de default-seed functie (nieuwe bedrijven) ook de kleur meegeven.
--
-- Hierna lezen zowel de pipeline als Instellingen dezelfde kolom, en wijzigen
-- in Instellingen wordt direct in de pipeline zichtbaar.
--
-- Re-runnable: idempotent (ADD COLUMN IF NOT EXISTS, seed alleen waar leeg).
-- =============================================================================

-- 1. Kleur-kolom toevoegen ---------------------------------------------------
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS color_class text NOT NULL DEFAULT 'b-gray';

-- 2. Bestaande fases seeden op position met de huidige pipeline-kleuren ------
--    Mapping = de oude hardcoded STAGE_COLORS (1-based position).
--    Alleen rijen die nog op de default 'b-gray' staan worden bijgewerkt, zodat
--    een eerdere handmatige keuze niet wordt overschreven.
UPDATE pipeline_stages
SET color_class = c.color_class
FROM (VALUES
  ( 1, 'b-new'),
  ( 2, 'b-orange'),
  ( 3, 'b-blue'),
  ( 4, 'b-blue'),
  ( 5, 'b-orange'),
  ( 6, 'b-orange'),
  ( 7, 'b-green'),
  ( 8, 'b-planned'),
  ( 9, 'b-progress'),
  (10, 'b-done'),
  (11, 'b-accepted'),
  (12, 'b-lost')
) AS c(position, color_class)
WHERE pipeline_stages.position = c.position
  AND pipeline_stages.color_class = 'b-gray';

-- 3. Default-seed functie bijwerken zodat nieuwe bedrijven gekleurde fases ----
--    krijgen (zelfde mapping als hierboven).
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages(p_company uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO pipeline_stages (company_id, name, position, color_class)
  SELECT p_company, s.name, s.position, s.color_class
  FROM (VALUES
    ('Nieuwe lead',        1,  'b-new'),
    ('Contact nodig',      2,  'b-orange'),
    ('Info compleet',      3,  'b-blue'),
    ('Offerte maken',      4,  'b-blue'),
    ('Offerte verstuurd',  5,  'b-orange'),
    ('Wacht op akkoord',   6,  'b-orange'),
    ('Akkoord',            7,  'b-green'),
    ('Gepland',            8,  'b-planned'),
    ('In uitvoering',      9,  'b-progress'),
    ('Afgerond',          10,  'b-done'),
    ('Betaald / Gesloten',11,  'b-accepted'),
    ('Verloren',          12,  'b-lost')
  ) AS s(name, position, color_class)
  WHERE p_company IS NOT NULL
  ON CONFLICT (company_id, position) DO NOTHING;
$$;
