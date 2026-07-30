-- Instelbaar zichtbaar uurbereik voor de agenda.
--
-- De agenda toonde een hardgecodeerd venster van 07:00 t/m 20:00. Dat werkt niet
-- voor iedereen: een schoonmaakbedrijf begint om 05:00, een installateur draait
-- avonddiensten. De agenda wordt daarom een volledige 24-uurs agenda waarvan het
-- bedrijf zelf instelt welk deel standaard zichtbaar is.
--
-- Per bedrijf, dus in bedrijfsinstellingen (één rij per company_id) — niet in
-- companies, waar de bedrijfsgegevens staan.
--
-- Standaard blijft 07:00, zodat bestaande klanten niets zien veranderen.
-- Einduur 20:00 gelijk aan het oude hardgecodeerde AG_HOUR_END.

ALTER TABLE bedrijfsinstellingen
  ADD COLUMN IF NOT EXISTS agenda_start_uur integer NOT NULL DEFAULT 7;

ALTER TABLE bedrijfsinstellingen
  ADD COLUMN IF NOT EXISTS agenda_eind_uur integer NOT NULL DEFAULT 20;

-- Bereik afdwingen in de database, niet alleen in de UI: 0–24, en het einduur
-- moet ná het beginuur liggen (anders is de tijdlijn nul of negatief hoog).
ALTER TABLE bedrijfsinstellingen
  DROP CONSTRAINT IF EXISTS bedrijfsinstellingen_agenda_uren_check;

ALTER TABLE bedrijfsinstellingen
  ADD CONSTRAINT bedrijfsinstellingen_agenda_uren_check
  CHECK (
    agenda_start_uur >= 0 AND agenda_start_uur <= 23
    AND agenda_eind_uur >= 1 AND agenda_eind_uur <= 24
    AND agenda_eind_uur > agenda_start_uur
  );

COMMENT ON COLUMN bedrijfsinstellingen.agenda_start_uur IS
  'Eerste zichtbare uur in de agenda (0-23). De agenda beslaat altijd 24 uur; dit bepaalt alleen het standaard zichtbare venster.';
COMMENT ON COLUMN bedrijfsinstellingen.agenda_eind_uur IS
  'Laatste zichtbare uur in de agenda (1-24, exclusief). Moet groter zijn dan agenda_start_uur.';
