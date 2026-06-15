-- check-herinneringen: elke dag om 08:00 UTC
SELECT cron.schedule(
  'check-herinneringen-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url') || '/functions/v1/check-herinneringen'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);

-- moneybird-sync-btw: elke dag om 06:00 UTC
SELECT cron.schedule(
  'moneybird-sync-btw-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url') || '/functions/v1/moneybird-sync-btw'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);
