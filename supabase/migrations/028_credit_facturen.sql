ALTER TABLE facturen ADD COLUMN IF NOT EXISTS is_credit boolean DEFAULT false;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS credit_van_factuur_id uuid REFERENCES facturen(id);
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS gecrediteerd boolean DEFAULT false;
