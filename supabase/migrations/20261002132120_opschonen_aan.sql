-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De privacyverklaring (versie 2026-10, geldig vanaf 1 oktober 2026), de
-- verwerkersovereenkomst en de voorwaarden beloven automatische verwijdering na
-- vaste termijnen. Dat doet edge function `opschonen` via cron
-- `opschonen-daily`, maar die stond sinds 20260930170500 op pauze in afwachting
-- van een besluit over de termijnen (audit 2026-10-01, H13). Dat besluit is
-- genomen: de gepubliceerde termijnen gelden. De cron gaat weer aan.
--
-- Daarnaast belooft de privacyverklaring dat de misbruikteller van het
-- websiteformulier (website_inquiry_attempts, gehashte IP/e-mail) na 1 dag weg
-- is. Dat gebeurde alleen willekeurig in 2% van de formulieraanroepen; bij
-- weinig verkeer bleven rijen weken staan. Nu deterministisch in de dagelijkse job.
--
-- Gemeten vóór het draaien (2026-10-02, bb_opschoning_* en droogloop):
--   bedrijven 2 jaar na einde abonnement: 0 (eerste mogelijke datum augustus 2028)
--   contactformulier 0 · Boss-gesprekken 0 · meldpunt 0 (0 schermafbeeldingen)
--   resettokens 2 · aanmeldcodes 3 (allemaal ouder dan 24 uur)
--   website_inquiry_attempts: 7 van 8 ouder dan 1 dag
-- De eerste run raakt dus geen bedrijfsgegevens van klanten.

begin;

create or replace function public.bb_opschoning_termijnen()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v jsonb := '{}'::jsonb;
  n int;
begin
  delete from public.inquiries i
   where i.created_at < now() - interval '1 year'
     and i.company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca'::uuid;  -- BossBase Admin
  get diagnostics n = row_count; v := v || jsonb_build_object('contactformulier', n);

  delete from public.boss_conversations
   where coalesce(updated_at, created_at) < now() - interval '12 months';
  get diagnostics n = row_count; v := v || jsonb_build_object('boss_gesprekken', n);

  delete from public.meldingen
   where aangemaakt_op < now() - interval '2 years';
  get diagnostics n = row_count; v := v || jsonb_build_object('meldpunt', n);

  delete from public.password_reset_tokens    where created_at < now() - interval '24 hours';
  get diagnostics n = row_count; v := v || jsonb_build_object('resettokens', n);
  delete from public.email_verification_codes where created_at < now() - interval '24 hours';
  get diagnostics n = row_count; v := v || jsonb_build_object('aanmeldcodes', n);
  delete from public.password_reset_attempts     where window_start < now() - interval '24 hours';
  delete from public.email_verification_attempts where window_start < now() - interval '24 hours';

  -- Misbruikteller websiteformulier: belofte "1 dag".
  delete from public.website_inquiry_attempts where window_start < now() - interval '1 day';
  get diagnostics n = row_count; v := v || jsonb_build_object('formulier_tellers', n);

  return v;
end;
$function$;

create or replace function public.bb_opschoning_termijnen_te_verwijderen()
 returns table(soort text, aantal bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select 'contactformulier', count(*) from public.inquiries i
   where i.created_at < now() - interval '1 year'
     and i.company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca'::uuid  -- BossBase Admin
  union all
  select 'boss_gesprekken', count(*) from public.boss_conversations
   where coalesce(updated_at, created_at) < now() - interval '12 months'
  union all
  select 'meldpunt', count(*) from public.meldingen
   where aangemaakt_op < now() - interval '2 years'
  union all
  select 'resettokens', count(*) from public.password_reset_tokens
   where created_at < now() - interval '24 hours'
  union all
  select 'aanmeldcodes', count(*) from public.email_verification_codes
   where created_at < now() - interval '24 hours'
  union all
  select 'formulier_tellers', count(*) from public.website_inquiry_attempts
   where window_start < now() - interval '1 day'
$function$;

revoke all on function public.bb_opschoning_termijnen() from public, anon, authenticated;
grant execute on function public.bb_opschoning_termijnen() to service_role;
revoke all on function public.bb_opschoning_termijnen_te_verwijderen() from public, anon, authenticated;
grant execute on function public.bb_opschoning_termijnen_te_verwijderen() to service_role;

select cron.alter_job(job_id := j.jobid, active := true)
  from cron.job j
 where j.jobname = 'opschonen-daily';

notify pgrst, 'reload schema';

select
  (select active from cron.job where jobname = 'opschonen-daily') as cron_aan,
  (select json_agg(t) from public.bb_opschoning_termijnen_te_verwijderen() t) as eerste_run,
  (select count(*) from public.bb_opschoning_kandidaten(2)) as bedrijven_eerste_run,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'bb_opschoning_termijnen' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rechten;

commit;
