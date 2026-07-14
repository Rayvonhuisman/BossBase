-- =============================================================================
-- BossBase: pg_cron → edge function authenticatie repareren (check-herinneringen)
-- Bestand : supabase/migrations/20260714120000_fix_cron_edge_auth.sql
--
-- Probleem:
--   De cron-jobs riepen current_setting('app.supabase_url') /
--   current_setting('app.service_role_key') aan, maar die GUC-settings bestaan
--   NIET op dit project. Elke run faalde met:
--     ERROR: unrecognized configuration parameter "app.supabase_url"
--   Gevolg: sinds 10 juli werden betaal- en afspraakherinneringen niet verstuurd
--   (check-herinneringen draaide nooit).
--
-- Oplossing:
--   De edge functions authenticeren zichzelf al met hun EIGEN
--   SUPABASE_SERVICE_ROLE_KEY uit de function-env; de cron-aanroep hoeft alleen
--   de API-gateway / verify_jwt te passeren. Daarvoor volstaat de publieke
--   anon-JWT (publishable key). Die bewaren we in Vault (nette rotatie, geen key
--   in de cron-definitie) en lezen we in de job. De project-URL is publiek en
--   wordt hardcoded.
--
--   check-herinneringen heeft geen user-check in de code, dus de anon-bearer is
--   voldoende. (moneybird-sync-btw valideert wél een echte gebruikers-JWT en kan
--   niet vanuit een cron draaien zonder function-wijziging — bewust NIET hier.)
--
-- Veilig / idempotent: extensies guarded, Vault-secret alleen als hij ontbreekt,
-- cron eerst unschedule dan schedule. Geen bestaande data gewijzigd.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Anon (publishable) JWT — publiek, veilig te committen. Wordt door pg_cron als
-- Bearer meegestuurd; de functions gebruiken hun eigen service-role uit env.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'edge_cron_key') then
    perform vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hd3pxcG5zbHVsanhwYmFyaG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODQzMTYsImV4cCI6MjA5MzU2MDMxNn0.yJeP2p0go9wttF9hAiNgYd1fMi71KIcnb7KbEdhrNaw',
      'edge_cron_key',
      'Anon JWT voor pg_cron -> edge function auth (functions gebruiken hun eigen service-role uit env)'
    );
  end if;
end $$;

-- Herplan check-herinneringen met hardcoded URL + anon-bearer uit Vault.
select cron.unschedule('check-herinneringen-daily')
where exists (select 1 from cron.job where jobname = 'check-herinneringen-daily');

select cron.schedule(
  'check-herinneringen-daily',
  '0 8 * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/check-herinneringen',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $cron$
);
