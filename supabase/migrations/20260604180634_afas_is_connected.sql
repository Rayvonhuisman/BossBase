ALTER TABLE accounting_connections ADD COLUMN IF NOT EXISTS is_connected boolean DEFAULT false;
