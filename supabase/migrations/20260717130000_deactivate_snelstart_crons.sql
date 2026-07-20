-- =============================================================================
-- SnelStart-crons deactiveren (voorlopig)
--
-- De twee SnelStart-cronjobs uit migratie 015 hebben nooit gewerkt en falen elke
-- 5 minuten:
--   * `ERROR: unrecognized configuration parameter "app.supabase_url"` — de GUCs
--     die de cron gebruikt om de edge function aan te roepen zijn niet gezet.
--   * Verkeerd auth-model: ze roepen per-company user-JWT-functies aan met een
--     service-role bearer, zonder iteratie over meerdere bedrijven.
-- Er is bovendien geen enkele actieve SnelStart-connectie.
--
-- We halen de jobs hier weg zodat ze stoppen met falen en de cron-logs niet
-- langer volspammen. De correcte scheduled-aanpak (één service-role functie die
-- over álle bedrijven met een SnelStart-koppeling loopt, zoals bij Moneybird)
-- pakken we later op, samen met de rest van de SnelStart-integratie.
--
-- Idempotent: unschedule alleen als de job bestaat.
-- =============================================================================

SELECT cron.unschedule('snelstart-import-kosten')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snelstart-import-kosten');

SELECT cron.unschedule('snelstart-sync-contacten')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snelstart-sync-contacten');
