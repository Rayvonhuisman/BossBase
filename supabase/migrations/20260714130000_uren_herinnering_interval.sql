-- Uren-herinnering: instelbaar interval (bedrijfsinstelling)
-- ──────────────────────────────────────────────────────────────────────────────
-- Interval in minuten waarmee de "vul je uren in"-pop-up voor medewerkers
-- terugkeert zolang er over een verstreken geplande dag nog geen uren zijn
-- geboekt. 0 = herinnering uit. Standaard 60 minuten. Company-scoped, net als de
-- overige bedrijfsinstellingen. Alleen de admin kan dit wijzigen (bestaande
-- bedrijfsinstellingen-UPDATE-RLS = admin-only).

ALTER TABLE bedrijfsinstellingen
  ADD COLUMN IF NOT EXISTS uren_herinnering_interval_min integer NOT NULL DEFAULT 60;
