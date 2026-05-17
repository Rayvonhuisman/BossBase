-- Zorg dat pg_cron en pg_net extensies actief zijn
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Verwijder bestaande cron jobs als die er zijn
SELECT cron.unschedule('moneybird-sync-kosten') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'moneybird-sync-kosten'
);
SELECT cron.unschedule('moneybird-sync-contacten') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'moneybird-sync-contacten'
);

-- Kosten en facturen importeren: elke nacht om 02:00
SELECT cron.schedule(
  'moneybird-sync-kosten',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url') || '/functions/v1/moneybird-import-kosten'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);

-- Contacten synchroniseren: elke nacht om 02:30
SELECT cron.schedule(
  'moneybird-sync-contacten',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url') || '/functions/v1/moneybird-sync-contacten'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);
