-- Koppeling werkbon ↔ calendar_event opschonen en afdwingen: precies één
-- calendar_event per werkbon, en bij verwijderen van de werkbon het event mee.

-- 1. werkbon_id FK: CASCADE i.p.v. SET NULL (event verdwijnt met de werkbon)
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_werkbon_id_fkey;
ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_werkbon_id_fkey
  FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE CASCADE;

-- 2a. Verwijder dubbele werkbon-afgeleide events (hou de nieuwste per werkbon)
DELETE FROM calendar_events ce
USING (
  SELECT ce2.id,
         ROW_NUMBER() OVER (PARTITION BY w.id ORDER BY ce2.created_at DESC, ce2.id) AS rn
  FROM calendar_events ce2
  JOIN werkbonnen w ON w.titel = ce2.title AND w.gepland_op = ce2.start_at::date
  WHERE ce2.werkbon_id IS NULL
) dup
WHERE ce.id = dup.id AND dup.rn > 1;

-- 2b. Koppel resterende werkbon-afgeleide events aan hun werkbon
UPDATE calendar_events ce
SET werkbon_id = w.id
FROM werkbonnen w
WHERE ce.werkbon_id IS NULL
  AND w.titel = ce.title
  AND w.gepland_op = ce.start_at::date;

-- 3. Eén calendar_event per werkbon afdwingen (NULL blijft toegestaan)
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_werkbon
  ON calendar_events(werkbon_id)
  WHERE werkbon_id IS NOT NULL;
