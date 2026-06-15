-- Voeg assigned_to toe aan projects tabel voor medewerker toewijzing
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;
