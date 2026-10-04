-- ── Waarom ──────────────────────────────────────────────────────────────────
-- check-herinneringen, uren-herinnering, planning-samenvatting en trial-mails
-- controleerden geen geheim: de cron authenticeert met de anon-sleutel, en die
-- is publiek (zit in de frontendbundel). Iedereen kon ze dus aanroepen; trial-
-- mails accepteerde bovendien een vrije `vandaag` en gaf namen en e-mailadressen
-- van proefklanten terug (audit 2026-10-01, H7).
--
-- De functies eisen voortaan `cron_secret` in de body (CRON_SECRET, gelijk aan
-- vault-secret edge_cron_secret — gecontroleerd op sha256). Deze migratie laat de
-- vier crons dat geheim meesturen, net als opschonen al deed. Eerst deze
-- migratie, dan de functies deployen: de huidige functies negeren het extra veld.

do $$
declare
  j record;
  v_url text;
  v_extra text;
begin
  for j in select jobid, jobname from cron.job
            where jobname in ('check-herinneringen-daily', 'uren-herinnering-mail',
                              'planning-samenvatting-daily', 'trial-mails-daily')
  loop
    v_url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/' || case j.jobname
      when 'check-herinneringen-daily'   then 'check-herinneringen'
      when 'uren-herinnering-mail'       then 'uren-herinnering'
      when 'planning-samenvatting-daily' then 'planning-samenvatting'
      when 'trial-mails-daily'           then 'trial-mails' end;
    -- uren-herinnering draait elk kwartier en alleen als er kandidaten zijn.
    v_extra := case when j.jobname = 'uren-herinnering-mail'
      then ' where exists (select 1 from public.bb_uren_herinnering_kandidaten())' else '' end;
    perform cron.alter_job(j.jobid, command := format($cmd$
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
  )%s;
$cmd$, v_url, v_extra));
  end loop;
end $$;

select jobname, command like '%cron_secret%' as met_geheim
  from cron.job
 where jobname in ('check-herinneringen-daily', 'uren-herinnering-mail',
                   'planning-samenvatting-daily', 'trial-mails-daily')
 order by 1;
