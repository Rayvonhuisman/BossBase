-- Voeg meta jsonb toe aan klant_tijdlijn (tabel aangemaakt in 032)
ALTER TABLE klant_tijdlijn ADD COLUMN IF NOT EXISTS meta jsonb;
