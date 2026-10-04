-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De twee (uitgeschakelde) AFAS-crons gebruikten nog het oude patroon:
-- current_setting('app.service_role_key') en 'app.supabase_url'. Dat zijn
-- instellingen die er niet (meer) zijn, en het zou een service-rolsleutel in een
-- databaseinstelling vereisen. Alle andere crons halen hun sleutel uit de vault
-- (edge_cron_key) en sturen het cron-geheim mee (edge_cron_secret); deze twee
-- nu ook (audit 2026-10-01, code/drift).
--
-- Ze blijven UIT. Let op: afas-import-kosten en afas-sync-contacten kennen nog
-- geen geplande modus (ze eisen een ingelogde gebruiker). AFAS is in de app
-- verborgen; aanzetten vraagt eerst een geplande modus in die functies, zoals
-- snelstart-import-kosten die heeft (isScheduledCall).

do $$
declare
  j record;
begin
  for j in select jobid, jobname from cron.job where jobname in ('afas-import-kosten', 'afas-sync-contacten') loop
    perform cron.alter_job(j.jobid, active := false, command := format($cmd$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object(
      'scheduled', true,
      'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')
    )
  );
$cmd$, 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/' || j.jobname));
  end loop;
end $$;

select jobname, active,
       command like '%app.service_role_key%' as oud_patroon_moet_false,
       command like '%edge_cron_key%' as vault_moet_true
  from cron.job where jobname like 'afas%' order by 1;
