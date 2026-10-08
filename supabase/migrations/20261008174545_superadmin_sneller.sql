-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De superadmin laadde traag (Vandaag 4 tot 8 seconden, gemeten in de
-- function-logs op 2026-10-08). Twee oorzaken in de database:
--
-- 1. Per aanvraag vroeg de edge function los, en na elkaar, bij welk bedrijf
--    het e-mailadres hoort en in welke fase dat bedrijf zit: twee rondreizen
--    per aanvraag. sa_aanvraag_koppelingen doet het voor alle adressen in één
--    keer.
-- 2. sa_cron_status zocht per taak de laatste run in cron.job_run_details
--    (125.000 rijen, alleen een index op runid): 650 ms. Nu kijkt hij alleen
--    naar de laatste 5.000 runs (runid loopt op met de tijd, dus de index doet
--    het werk; bij ±900 runs per dag ruim 5 dagen terug). Een taak die langer
--    niet draaide toont dan "laatst: onbekend" in plaats van een datum.

create function public.sa_aanvraag_koppelingen(p_emails text[])
returns table (email text, company_id uuid, fase text)
language sql
stable
security definer
set search_path = public
as $$
  select e.email, k.company_id, case when k.company_id is null then null else public.sa_fase_van_bedrijf(k.company_id) end
  from (select distinct lower(trim(x)) as email from unnest(p_emails) x where x is not null) e
  cross join lateral (select public.sa_bedrijf_bij_email(e.email) as company_id) k
$$;
revoke all on function public.sa_aanvraag_koppelingen(text[]) from public, anon, authenticated;
grant execute on function public.sa_aanvraag_koppelingen(text[]) to service_role;

create or replace function public.sa_cron_status()
returns table (naam text, schema text, actief boolean, laatst timestamptz, status text, duur_ms numeric, melding text, mislukt_24u bigint)
language sql
stable
security definer
set search_path = public, cron
as $$
  with recent as (
    select r.jobid, r.start_time, r.end_time, r.status, r.return_message
    from cron.job_run_details r
    where r.runid > (select coalesce(max(runid), 0) - 5000 from cron.job_run_details)
  ),
  laatste as (
    select distinct on (jobid) * from recent order by jobid, start_time desc
  ),
  fouten as (
    select jobid, count(*) as n from recent
    where status = 'failed' and start_time > now() - interval '24 hours'
    group by jobid
  )
  select j.jobname::text, j.schedule::text, j.active, l.start_time, l.status::text,
         round(extract(epoch from (l.end_time - l.start_time)) * 1000),
         left(l.return_message, 300),
         coalesce(f.n, 0)
  from cron.job j
  left join laatste l on l.jobid = j.jobid
  left join fouten f on f.jobid = j.jobid
  order by j.jobname
$$;
-- create or replace behoudt de rechten, maar zet ze voor de zekerheid opnieuw.
revoke all on function public.sa_cron_status() from public, anon, authenticated;
grant execute on function public.sa_cron_status() to service_role;

notify pgrst, 'reload schema';

select
  (select count(*) from public.sa_cron_status()) as taken,
  (select count(*) from public.sa_aanvraag_koppelingen(array['info@bossbase.nl'])) as koppeling_test,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('sa_aanvraag_koppelingen', 'sa_cron_status')
      and r.rolname in ('anon', 'authenticated') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as lek;
