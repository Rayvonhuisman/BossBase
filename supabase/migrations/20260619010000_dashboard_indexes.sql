-- Ontbrekende company_id-indexes op de dashboard-kerntabellen. Elke query op
-- deze tabellen filtert via RLS op company_id; zonder index = sequential scan.
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_activities_company ON activities(company_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_company ON calendar_events(company_id);
