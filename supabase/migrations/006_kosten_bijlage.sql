ALTER TABLE job_costs ADD COLUMN IF NOT EXISTS bijlage_url text;
ALTER TABLE job_costs ADD COLUMN IF NOT EXISTS klant_type text NOT NULL DEFAULT 'klant'
  CHECK (klant_type IN ('klant', 'algemeen'));
