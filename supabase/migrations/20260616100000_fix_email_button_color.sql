-- Vervang oranje (#f97316) knopkleur door BossBase groen (#1DDB62)
-- in alle bestaande e-mailsjablonen.
UPDATE email_templates
SET body_html = REPLACE(body_html, '#f97316', '#1DDB62'),
    updated_at = NOW()
WHERE body_html LIKE '%f97316%';
