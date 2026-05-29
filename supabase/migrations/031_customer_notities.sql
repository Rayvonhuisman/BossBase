-- Voeg notities kolom toe aan customers tabel
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notities text;
