-- Herkomst van agenda-items (calendar_events)
-- ──────────────────────────────────────────────────────────────────────────────
-- Legt vast waar een agenda-item vandaan komt:
--   'planning' — aangemaakt via de Planning-pagina (werkbon-/activiteit-sync)
--   'zelf'     — door de gebruiker zelf rechtstreeks in de agenda toegevoegd
--
-- Dit is de basis voor een later bewerkrecht op planning-items. Nu nog GEEN
-- rechten/gedrag — puur de herkomst vastleggen en uitleesbaar maken.

-- Veilige default: een los aangemaakt item is 'zelf'. De planning-sync zet
-- expliciet 'planning' bij het aanmaken.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS herkomst text NOT NULL DEFAULT 'zelf';

-- Backfill bestaande items: alles wat aan een werkbon of activiteit uit de
-- planning hangt → 'planning'. De rest blijft op de default 'zelf'.
-- (werkbon_id en activiteit_id zijn de sync-sleutels tussen agenda en planning.)
UPDATE calendar_events
  SET herkomst = 'planning'
  WHERE werkbon_id IS NOT NULL
     OR activiteit_id IS NOT NULL;
