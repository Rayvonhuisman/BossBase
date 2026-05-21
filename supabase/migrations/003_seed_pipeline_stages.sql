-- =============================================================================
-- BossBase: Seed pipeline stages for company 8131d2e8-4190-4b5e-8ff2-c0c5aac68aca
-- Bestand : supabase/migrations/003_seed_pipeline_stages.sql
-- Uitvoer : Handmatig in de Supabase SQL Editor uitvoeren
-- Veilig  : Alleen INSERT met ON CONFLICT DO NOTHING — geen data gaat verloren.
--
-- Achtergrond:
--   De tabel pipeline_stages is leeg. Zonder rijen valt de UI terug op
--   hardcoded slug-IDs ('new_lead', etc.). Die slugs halen de UUID-check
--   niet — dus deals worden opgeslagen zonder stage_id en verschijnen
--   niet in de kanban-kolommen.
--
--   Voer dit script uit via de SQL Editor in Supabase (service-role, bypast RLS).
-- =============================================================================

INSERT INTO pipeline_stages (id, company_id, name, position)
VALUES
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Nieuwe lead',        1),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Contact nodig',      2),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Info compleet',      3),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Offerte maken',      4),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Offerte verstuurd',  5),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Wacht op akkoord',   6),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Akkoord',            7),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Gepland',            8),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'In uitvoering',      9),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Afgerond',          10),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Betaald / Gesloten',11),
  (gen_random_uuid(), '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca', 'Verloren',          12)
ON CONFLICT DO NOTHING;
-- Controleer het resultaat:
SELECT id, name, position FROM pipeline_stages
WHERE company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca'
ORDER BY position;
