-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Na "Account deactiveren" of "Bedrijf sluiten" blokkeert 20260930181000 het
-- inlogaccount en verwijdert het de sessies. Volgens de broncode van Supabase
-- Auth (GoTrue) houdt dat tegen: opnieuw inloggen (token.go: IsBanned),
-- vernieuwen (tokens/service.go: IsBanned en "No Valid Session Found") en elke
-- Auth-aanroep met het oude access token (auth.go: session_not_found) — dus ook
-- elke Edge Function die de gebruiker met auth.getUser() controleert.
--
-- Wat het NIET tegenhoudt: PostgREST, Realtime en Storage controleren alleen de
-- handtekening en vervaldatum van het access token (tot een uur geldig). Met
-- zo'n token kwam een gedeactiveerde gebruiker nog overal bij, want de policies
-- kijken naar profiles.company_id en niet naar profiles.actief. Daarom:
--
-- 1. Een restrictive policy op elke tabel in public en op storage.objects: een
--    ingelogde gebruiker met een inactief profiel ziet en wijzigt niets. Op
--    profiles blijft alleen de eigen rij leesbaar, zodat de app kan zien dat
--    het account gedeactiveerd is en netjes uitlogt.
-- 2. Een pre-request-functie voor PostgREST: ook RPC's (security definer, die
--    RLS omzeilen) weigeren een inactief profiel. Behalve het lezen van het
--    eigen profiel (zie 1).
-- 3. bb_mag_abonnement_beheren volgt de eigenaarregel van billing-* en
--    cancel_company_account, zodat de app de abonnementsknoppen alleen aan de
--    eigenaar toont.
--
-- Superbeheerders: worden door opzeggen niet gedeactiveerd (20260930181000) en
-- houden dus hun toegang; een gewone gebruiker van een opgezegd bedrijf niet.
-- Een gebruiker zonder profiel (net geregistreerd) wordt niet geblokkeerd.
--
-- Nieuwe tabellen krijgen policy 1 niet vanzelf. De test
-- afsluitende select hieronder (tabellen_zonder_blokkade) en supabase/tests/lokaal
-- laten zien of elke tabel hem heeft; draai die na elke nieuwe tabel.

begin;

create or replace function public.bb_ik_ben_actief()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select p.actief from public.profiles p where p.id = auth.uid()), true)
$$;

do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists bb_alleen_actieve_gebruikers on public.%I', t.relname);
    if t.relname = 'profiles' then
      execute 'create policy bb_alleen_actieve_gebruikers on public.profiles as restrictive for all to authenticated
               using ((select public.bb_ik_ben_actief()) or id = auth.uid())
               with check ((select public.bb_ik_ben_actief()))';
    else
      execute format('create policy bb_alleen_actieve_gebruikers on public.%I as restrictive for all to authenticated
                      using ((select public.bb_ik_ben_actief())) with check ((select public.bb_ik_ben_actief()))', t.relname);
    end if;
  end loop;
end $$;

drop policy if exists bb_alleen_actieve_gebruikers on storage.objects;
create policy bb_alleen_actieve_gebruikers on storage.objects as restrictive for all to authenticated
  using ((select public.bb_ik_ben_actief())) with check ((select public.bb_ik_ben_actief()));

-- ── PostgREST: elke aanvraag ──────────────────────────────────────────────────
create or replace function public.bb_voor_verzoek()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.bb_ik_ben_actief() then
    return;
  end if;
  -- Het eigen profiel lezen mag (de restrictive policy laat alleen die rij zien).
  if current_setting('request.method', true) = 'GET'
     and current_setting('request.path', true) = '/profiles' then
    return;
  end if;
  raise exception 'Dit account is gedeactiveerd.' using errcode = '42501';
end;
$$;

revoke all on function public.bb_voor_verzoek() from public, anon, authenticated;
grant execute on function public.bb_voor_verzoek() to anon, authenticated, service_role;
revoke all on function public.bb_ik_ben_actief() from public, anon, authenticated;
grant execute on function public.bb_ik_ben_actief() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request to 'public.bb_voor_verzoek';

-- ── Abonnement: alleen de eigenaar (of een beheerder zonder vastgelegde eigenaar)
create or replace function public.bb_mag_abonnement_beheren(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select p.role = 'admin' and p.actief is distinct from false
           and (c.eigenaar_id is null or c.eigenaar_id = p.id)
      from public.profiles p
      left join public.companies c on c.id = p.company_id
     where p.id = p_user_id
  ), false)
$$;

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select count(*) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                        and p.policyname = 'bb_alleen_actieve_gebruikers')) as tabellen_zonder_blokkade,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'bb_alleen_actieve_gebruikers') as storage_blokkade,
  (select rolconfig::text from pg_roles where rolname = 'authenticator') as authenticator_config;

commit;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
