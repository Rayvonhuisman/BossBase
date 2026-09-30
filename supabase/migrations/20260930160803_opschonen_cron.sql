-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Zet de opschoonjob (edge function `opschonen`, migratie 20260930083452) op de
-- dagelijkse cron. Stond als .pending tot de droogloop was bekeken; aangezet
-- op 30-09-2026 na een tweede droogloop (zelfde uitkomst).
--
-- Droogloop 30-09-2026 via de echte functie: 0 bedrijven, 2 verlopen
-- aanmeldcodes. Geen fouten.

begin;

select cron.unschedule('opschonen-daily') where exists (select 1 from cron.job where jobname = 'opschonen-daily');

-- Dagelijks 03:30, dezelfde opbouw als de andere cronjobs: sleutel en
-- cron_secret uit de vault.
select cron.schedule('opschonen-daily', '30 3 * * *', $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/opschonen',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object(
      'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')
    ),
    timeout_milliseconds := 120000
  );
$cron$);

select jobname, schedule from cron.job where jobname = 'opschonen-daily';

commit;
