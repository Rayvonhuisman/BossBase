-- Koppeling activiteit ↔ calendar_event (parallel aan werkbon_id), zodat een
-- in de planning ingeplande activiteit precies één agenda-item krijgt dat
-- meegesynchroniseerd wordt bij wijzigingen.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS activiteit_id uuid REFERENCES activities(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_activiteit
  ON calendar_events(activiteit_id)
  WHERE activiteit_id IS NOT NULL;
