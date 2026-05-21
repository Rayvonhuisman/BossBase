ALTER TABLE customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS postcode text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS kvk_number text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS btw_number text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS iban text;
