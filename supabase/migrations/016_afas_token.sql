ALTER TABLE accounting_connections ADD COLUMN IF NOT EXISTS afas_environment_id text;
ALTER TABLE accounting_connections ADD COLUMN IF NOT EXISTS afas_token text;
