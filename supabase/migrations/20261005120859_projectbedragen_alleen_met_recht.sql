-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Productbesluit 4 oktober 2026 (PR #7, migraties 20261004190000/200000): de
-- gedeelde werkruimte van Groei is operationele samenwerking — agenda,
-- projecten, werkbonnen, taken, materialen, dagen, foto's. Financiële inzage
-- (pipeline, offertes, facturen, kosten, omzet, projectbedragen) vraagt ook op
-- Groei een expliciet recht; Groei heeft daarvoor sinds 20261004190000 het
-- rechtenbeheer, en INZAGE_RECHTEN in de frontend kent projectbedragen niet
-- meer als werkruimte-recht.
--
-- bb_mag_projectbedragen() (20261003093758, M1) liet de gedeelde werkruimte nog
-- door. Daardoor gaven bb_projectbedragen() en bb_werkbonmateriaal_bedragen()
-- op Groei iedereen de projectwaarde en de verkoopprijzen van werkbonmateriaal,
-- terwijl het scherm ze (terecht) verborg. Nu: actief, en admin of het recht
-- projectbedragen in het eigen bedrijf — dezelfde regel als de rest.
--
-- Gecontroleerd: dit was de enige plek buiten de operationele policies die nog
-- op bb_gedeelde_werkruimte() leunde voor iets financieels. bb_financien_kpi en
-- bb_openstaand_per_factuur zijn SECURITY INVOKER en volgen de (sinds PR #7
-- recht-gebonden) RLS van facturen en job_costs; bb_planning_recht_vereist is
-- planning en hoort bij de samenwerking.

begin;

create or replace function public.bb_mag_projectbedragen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bb_ik_ben_actief()
     and public.bb_is_admin_or_permission('projectbedragen');
$$;

-- Zelfde signatuur, dus de grants blijven; toch expliciet, zie CLAUDE.md.
revoke all on function public.bb_mag_projectbedragen() from public, anon, authenticated;
grant execute on function public.bb_mag_projectbedragen() to authenticated, service_role;

notify pgrst, 'reload schema';

select
  pg_get_functiondef('public.bb_mag_projectbedragen()'::regprocedure) !~ 'gedeelde' as zonder_werkruimte,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'bb_mag_projectbedragen' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rechten;

commit;
