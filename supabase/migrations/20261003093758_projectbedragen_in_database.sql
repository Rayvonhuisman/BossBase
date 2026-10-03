-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M1. Het recht "Projectbedragen zien" (projectbedragen) was
-- alleen een schermafscherming: RLS bepaalt welke RIJEN je ziet, niet welke
-- kolommen. Een medewerker zonder het recht kon via de API gewoon
-- projects.project_value / geschatte_waarde en de verkoopprijzen van
-- werkbonmateriaal (prijs_per, subtotaal) lezen. Besluit gebruiker 2026-10-03:
-- ook in de database afschermen.
--
-- Uitvoering:
--   (Deel 1 van 2. De kolomrechten komen in een tweede migratie, NA de
--   frontend die de bedragen via deze functies leest — anders breekt elke
--   select('*') op projects bij alle gebruikers.)
--   1. authenticated verliest SELECT op die vier kolommen (kolomrechten; alle
--      andere kolommen blijven leesbaar). Schrijven blijft zoals het was —
--      RLS bepaalt wie dat mag.
--   2. De bedragen komen voortaan via twee functies die zelf controleren:
--      eigen bedrijf, actief account, en het recht (of admin, of de gedeelde
--      werkruimte van Groei, waar iedereen alles ziet — zoals de rest van RLS).
--   3. subtotaal rekent de database zelf uit (aantal × prijs_per); de app hoeft
--      de prijs dus niet meer te lezen om hem te berekenen.
-- Database-functies en triggers die deze kolommen lezen draaien allemaal als
-- eigenaar (SECURITY DEFINER, gecontroleerd) en merken hier niets van.

begin;

create or replace function public.bb_mag_projectbedragen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bb_ik_ben_actief()
     and (public.bb_gedeelde_werkruimte() or public.bb_is_admin_or_permission('projectbedragen'));
$$;
revoke all on function public.bb_mag_projectbedragen() from public, anon, authenticated;
grant execute on function public.bb_mag_projectbedragen() to authenticated, service_role;

-- 2. Bedragen alleen voor wie ze mag zien
create or replace function public.bb_projectbedragen(p_ids uuid[])
returns table (id uuid, project_value numeric, geschatte_waarde numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.project_value::numeric, p.geschatte_waarde::numeric
    from public.projects p
   where p.id = any (p_ids)
     and p.company_id = public.bb_current_company()
     and public.bb_mag_projectbedragen();
$$;
revoke all on function public.bb_projectbedragen(uuid[]) from public, anon, authenticated;
grant execute on function public.bb_projectbedragen(uuid[]) to authenticated, service_role;

create or replace function public.bb_werkbonmateriaal_bedragen(p_ids uuid[])
returns table (id uuid, prijs_per numeric, subtotaal numeric)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.prijs_per::numeric, m.subtotaal::numeric
    from public.werkbon_materialen m
   where m.id = any (p_ids)
     and m.company_id = public.bb_current_company()
     and public.bb_mag_projectbedragen();
$$;
revoke all on function public.bb_werkbonmateriaal_bedragen(uuid[]) from public, anon, authenticated;
grant execute on function public.bb_werkbonmateriaal_bedragen(uuid[]) to authenticated, service_role;

-- 3. subtotaal in de database
create or replace function public.bb_wm_subtotaal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.subtotaal := round(coalesce(new.aantal, 0) * coalesce(new.prijs_per, 0), 2);
  return new;
end;
$$;
revoke all on function public.bb_wm_subtotaal() from public, anon, authenticated;

drop trigger if exists a1_wm_subtotaal on public.werkbon_materialen;
create trigger a1_wm_subtotaal before insert or update of aantal, prijs_per, subtotaal
  on public.werkbon_materialen
  for each row execute function public.bb_wm_subtotaal();

notify pgrst, 'reload schema';

select
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'bb_projectbedragen' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE'))                                  as bedragen_rechten,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'bb_werkbonmateriaal_bedragen' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE'))                                  as materiaal_rechten;

commit;
