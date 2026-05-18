-- Verwijder bestaande cron jobs als die er zijn
SELECT cron.unschedule('afas-import-kosten') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'afas-import-kosten'
);
SELECT cron.unschedule('afas-sync-contacten') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'afas-sync-contacten'
);

-- Kosten importeren: elke 5 minuten
SELECT cron.schedule(
  'afas-import-kosten',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url') || '/functions/v1/afas-import-kosten'),
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
  'afas-sync-contacten',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url') || '/functions/v1/afas-sync-contacten'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);
