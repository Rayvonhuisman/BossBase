-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een medewerker die tegen een limiet of een ontbrekende functie aanloopt, krijgt
-- op de abonnementspagina de knop "Laat mijn beheerder weten". Die legde een rij
-- in upgrade_requests en meldde daarna "Je beheerder ziet dit bij Instellingen →
-- Abonnement". Dat klopte niet: niemand las die tabel, er ging geen melding uit,
-- en de beheerder wist van niets.
--
-- Nu:
--   1. Bij een nieuw verzoek krijgt iedereen die het abonnement mag beheren
--      (de eigenaar, of een beheerder als er geen eigenaar is vastgelegd; zie
--      bb_mag_abonnement_beheren) een melding bij de bel. In een trigger, zodat
--      het niet afhangt van de browser van de medewerker en ook werkt als die
--      zelf geen andermans meldingen mag aanmaken.
--   2. Diezelfde beheerder mag een verzoek op 'afgehandeld' zetten, zodat het uit
--      de lijst onder Instellingen → Abonnement verdwijnt.
--
-- Bestaande data: upgrade_requests is in productie leeg (gemeten 2026-10-01).

begin;

-- ── 1. Melding naar de abonnementsbeheerder ─────────────────────────────────
create or replace function public.bb_upgrade_verzoek_melden()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_naam text;
begin
  select coalesce(nullif(trim(p.full_name), ''), 'Een teamlid')
    into v_naam
    from public.profiles p
   where p.id = new.aangevraagd_door;

  insert into public.notifications
    (company_id, user_id, type, title, body, link, related_type, related_id, created_by)
  select new.company_id,
         p.id,
         'upgrade_verzoek',
         coalesce(v_naam, 'Een teamlid') || ' vraagt om een uitbreiding van het abonnement',
         new.aanleiding,
         'instellingen/abonnement',
         'upgrade_verzoek',
         new.id,
         new.aangevraagd_door
    from public.profiles p
   where p.company_id = new.company_id
     and p.id is distinct from new.aangevraagd_door
     and public.bb_mag_abonnement_beheren(p.id);

  return new;
end;
$$;

revoke all on function public.bb_upgrade_verzoek_melden() from public, anon, authenticated;

drop trigger if exists trg_upgrade_verzoek_melden on public.upgrade_requests;
create trigger trg_upgrade_verzoek_melden
  after insert on public.upgrade_requests
  for each row execute function public.bb_upgrade_verzoek_melden();

-- ── 2. Afhandelen door de abonnementsbeheerder ──────────────────────────────
drop policy if exists upgrade_requests_update on public.upgrade_requests;
create policy upgrade_requests_update on public.upgrade_requests
  for update to authenticated
  using (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and public.bb_mag_abonnement_beheren()
  )
  with check (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and public.bb_mag_abonnement_beheren()
    and status in ('open', 'afgehandeld')
  );

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select count(*) from pg_trigger
    where tgrelid = 'public.upgrade_requests'::regclass
      and tgname = 'trg_upgrade_verzoek_melden') as trigger_staat,
  (select count(*) from pg_policies
    where tablename = 'upgrade_requests' and policyname = 'upgrade_requests_update') as update_policy,
  (select string_agg(r.rolname, ',') from pg_roles r
    where r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, 'public.bb_upgrade_verzoek_melden()', 'EXECUTE')) as uitvoerbaar_voor;

commit;

notify pgrst, 'reload schema';
