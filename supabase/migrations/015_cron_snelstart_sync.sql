-- Verwijder bestaande cron jobs als die er zijn
SELECT cron.unschedule('snelstart-import-kosten') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snelstart-import-kosten'
);
SELECT cron.unschedule('snelstart-sync-contacten') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snelstart-sync-contacten'
);

-- Kosten importeren: elke 5 minuten
SELECT cron.schedule(
  'snelstart-import-kosten',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url') || '/functions/v1/snelstart-import-kosten'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);

-- Contacten synchroniseren: elke 5 minuten
SELECT cron.schedule(
  'snelstart-sync-contacten',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url') || '/functions/v1/snelstart-sync-contacten'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);
