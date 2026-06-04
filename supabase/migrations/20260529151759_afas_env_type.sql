-- Hernoem afas_subdomain naar afas_env_type en migreer bestaande waarden
ALTER TABLE accounting_connections RENAME COLUMN afas_subdomain TO afas_env_type;
-- Stel 'rest' in als standaard voor bestaande rijen zonder waarde
UPDATE accounting_connections SET afas_env_type = 'rest' WHERE afas_env_type IS NULL AND provider = 'afas';
