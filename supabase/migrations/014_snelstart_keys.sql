ALTER TABLE accounting_connections ADD COLUMN IF NOT EXISTS subscription_key text;
ALTER TABLE accounting_connections ADD COLUMN IF NOT EXISTS secondary_key text;
