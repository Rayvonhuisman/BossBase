ALTER TABLE job_costs ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_job_costs_customer_id ON job_costs (customer_id);
