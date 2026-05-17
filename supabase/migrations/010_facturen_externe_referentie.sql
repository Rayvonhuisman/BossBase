ALTER TABLE facturen ADD COLUMN IF NOT EXISTS externe_referentie TEXT;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS moneybird_id TEXT;
CREATE INDEX IF NOT EXISTS idx_facturen_externe_ref ON facturen (company_id, externe_referentie);
