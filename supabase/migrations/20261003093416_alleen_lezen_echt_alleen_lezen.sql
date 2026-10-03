-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M6. Een account zonder lopend abonnement (proef verlopen,
-- opgezegd, betaling mislukt — bb_readonly_reden) kon alleen geen NIEUWE rijen
-- maken; bestaande klanten, offertes, facturen en werkbonnen wijzigen en
-- verwijderen ging gewoon door. De algemene voorwaarden (art. 3.2, 9.1) zeggen:
-- je kunt dan niet meer werken in je account, alleen je gegevens inzien en
-- exporteren. Besluit gebruiker 2026-10-03: alleen lezen en exporteren.
--
-- Uitvoering: één BEFORE-trigger op elke tabel met bedrijfsgegevens die een
-- gebruiker zelf bewerkt. Een trigger en geen policy, omdat een UPDATE die door
-- RLS wordt weggefilterd stil "0 rijen" geeft — de app denkt dan dat het
-- opslaan lukte. Deze trigger geeft een duidelijke Nederlandse fout (hint
-- 'readonly').
--
-- Wat blijft werken (bewust):
--   * Alles wat niet namens de gebruiker gebeurt: service_role (Stripe-webhook
--     zet een betaalde factuur op betaald, ondertekenen door de klant, website-
--     aanvragen, imports) en cronjobs (geen auth.uid()).
--   * Persoonlijke en systeemtabellen staan niet in de lijst: profiles,
--     notifications, dashboard_widgets, rondleiding_gezien, boss_*, meldingen,
--     upgrade_requests (een upgrade aanvragen moet juist kunnen), juridisch_akkoord,
--     abonnement/billing-tabellen, logtabellen.
--   * Super-admin (beheer door BossBase).
--   * Bedrijf sluiten (cancel_company_account) zet zelf een uitzondering voor
--     de duur van zijn eigen transactie.
-- Uploads waren al dicht (readonly_uploads/readonly_*-INSERT-policies); voor
-- verwijderen en overschrijven in de werkbuckets komt er hieronder een
-- restrictieve policy bij.

begin;

create or replace function public.bb_readonly_bewaken()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
     or current_setting('bb.readonly_uitzondering', true) = 'aan'
     or exists (select 1 from profiles where id = auth.uid() and is_super_admin)
     or public.bb_mag_schrijven() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Je account staat op alleen-lezen: je kunt alles bekijken en exporteren, maar niets toevoegen, wijzigen of verwijderen. Kies een abonnement om weer te werken.'
    using errcode = '42501', hint = 'readonly';
end;
$$;

revoke all on function public.bb_readonly_bewaken() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounting_connections', 'activiteit_notities', 'activities', 'bedrijfsinstellingen',
    'btw_periodes', 'calendar_events', 'companies', 'company_members', 'customers',
    'deal_notities', 'deals', 'eigen_eenheden', 'email_templates', 'facturen', 'factuur_regels',
    'google_calendar_connections', 'grootboek_voorkeuren', 'import_genegeerd', 'inquiries',
    'job_costs', 'klant_tijdlijn', 'kosten_categorieen', 'leverancier_tijdlijn', 'leveranciers',
    'lost_reasons', 'materiaal_inkoop', 'materialen', 'offerte_items', 'offertes',
    'pipeline_koppelingen', 'pipeline_stages', 'project_fotos', 'project_kosten',
    'project_notes', 'projects', 'urenregistratie', 'user_permissions', 'voertuigen',
    'website_aanvragen', 'website_forms', 'werkbon_dagen', 'werkbon_fotos',
    'werkbon_materiaal_inkoop', 'werkbon_materialen', 'werkbon_notities', 'werkbon_taken',
    'werkbon_uren', 'werkbonnen'
  ] loop
    execute format('drop trigger if exists a00_readonly_bewaken on public.%I', t);
    execute format('create trigger a00_readonly_bewaken before insert or update or delete on public.%I
                    for each row execute function public.bb_readonly_bewaken()', t);
  end loop;
end $$;

-- Bedrijf sluiten moet ook in alleen-lezen kunnen.
create or replace function public.cancel_company_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid; v_role text; v_eigenaar uuid;
  v_users uuid[];
begin
  select company_id, role into v_company, v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen een beheerder kan het bedrijf opzeggen';
  end if;
  if v_company is null then
    raise exception 'Geen bedrijf gekoppeld aan dit account';
  end if;
  select eigenaar_id into v_eigenaar from public.companies where id = v_company;
  if v_eigenaar is not null and v_eigenaar <> v_uid then
    raise exception 'Alleen de eigenaar kan het bedrijf opzeggen'
      using errcode = 'insufficient_privilege', hint = 'eigenaar';
  end if;

  -- Ook een account op alleen-lezen mag zijn bedrijf sluiten (bb_readonly_bewaken).
  perform set_config('bb.readonly_uitzondering', 'aan', true);

  update public.companies set status = 'opgezegd', opgezegd_op = coalesce(opgezegd_op, now()) where id = v_company;

  select coalesce(array_agg(id), '{}') into v_users
    from public.profiles
   where company_id = v_company and not coalesce(is_super_admin, false);
  update public.profiles
     set actief = false, verwijderd_op = coalesce(verwijderd_op, now())
   where id = any(v_users);
  perform public.bb_toegang_beeindigen(v_users);
end;
$function$;

revoke all on function public.cancel_company_account() from public, anon;
grant execute on function public.cancel_company_account() to authenticated, service_role;

-- Opslag: in alleen-lezen geen bestanden verwijderen of overschrijven in de
-- werkbuckets (lezen en downloaden blijft).
drop policy if exists readonly_uploads_wijzigen on storage.objects;
create policy readonly_uploads_wijzigen on storage.objects as restrictive
  for update to authenticated
  using (bucket_id <> all (array['werkbon-fotos', 'kosten-bijlagen', 'project-fotos', 'factuur-pdfs'])
         or public.bb_mag_schrijven());
drop policy if exists readonly_uploads_verwijderen on storage.objects;
create policy readonly_uploads_verwijderen on storage.objects as restrictive
  for delete to authenticated
  using (bucket_id <> all (array['werkbon-fotos', 'kosten-bijlagen', 'project-fotos', 'factuur-pdfs'])
         or public.bb_mag_schrijven());

notify pgrst, 'reload schema';

select
  (select count(*) from pg_trigger where tgname = 'a00_readonly_bewaken') as tabellen_met_bewaking,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'bb_readonly_bewaken' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as bewaken_rechten,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'cancel_company_account' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as opzeggen_rechten;

commit;
