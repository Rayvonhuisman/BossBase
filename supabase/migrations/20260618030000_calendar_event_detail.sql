-- Agenda-item detail: bewerkbaar type, koppeling naar werkbon, en
-- notities/communicatie als JSON-array op het calendar_events record.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS werkbon_id uuid REFERENCES werkbonnen(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb;
