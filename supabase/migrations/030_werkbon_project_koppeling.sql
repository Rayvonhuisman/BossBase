-- Koppel werkbonnen aan projecten via een optionele project_id FK.
ALTER TABLE werkbonnen
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_werkbonnen_project ON werkbonnen (project_id);
