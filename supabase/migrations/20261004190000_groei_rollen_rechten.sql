-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Productbesluit van 4 oktober 2026: abonnementsfeatures bepalen welke
-- functionaliteit beschikbaar is, rechten bepalen welke gebruiker gevoelige
-- data ziet. De gedeelde werkruimte (pakket Groei) geeft uitsluitend
-- operationele samenwerking; pipeline, offertes, facturen, kosten en omzet
-- vragen in elk pakket een expliciet recht.
--
-- Groei had `rollen_rechten` niet. Schrijven naar user_permissions zit met
-- restrictive policies (plan_feature_rechten_*) aan die feature vast, dus de
-- beheerder van een Groei-bedrijf kon niemand een recht geven. Zodra
-- 20261004200000 de financiele inzage van de werkruimte afhaalt, moet hij dat
-- wel kunnen. Daarom staat deze migratie EERST.
--
-- Gemeten op productie, 4-10-2026 (alleen aantallen): 7 Groei-bedrijven
-- (4 testbedrijf), 2 met meer dan één actieve gebruiker, 9 niet-admins (allen
-- medewerker), 8 daarvan met rijen in user_permissions, 0 rijen op naam van
-- iemand uit een ander bedrijf. Bestaande rijen blijven staan en blijven
-- tellen: wie nu `facturen` heeft, houdt facturen. Deze migratie kent niemand
-- iets toe en neemt niemand iets af.
--
-- ── Wat er verandert ────────────────────────────────────────────────────────
-- 1. Groei krijgt de feature rollen_rechten (één rij; de bron is
--    src/lib/features.js, GROEI_EXTRA).
-- 2. De insert- en update-policy op user_permissions controleren ook VOOR WIE
--    het recht is. Tot nu toe keken ze alleen naar company_id en de rol van de
--    schrijver. Een beheerder kon dus in zijn eigen bedrijf een rij aanmaken op
--    naam van iemand uit een ANDER bedrijf, en bb_has_permission() zocht alleen
--    op user_id, dus die rij gaf de ander daar het recht. Lokaal aangetoond
--    (admin A zet `kosten` op een medewerker van B; die ziet daarna de kosten
--    van B). De functies zelf krijgen de bedrijfscontrole in 20261004200000.
--
-- Terugdraaien: supabase/rollback/20261004190000_groei_rollen_rechten.rollback.sql

begin;

insert into public.plan_features (plan, feature)
values ('groei', 'rollen_rechten')
on conflict (plan, feature) do nothing;

-- ALTER POLICY: rollen en commando blijven staan. De subquery op profiles loopt
-- onder de RLS van de beheerder, die alleen zijn eigen bedrijf ziet.
alter policy permissions_admin_insert on public.user_permissions
  with check (
    company_id = public.current_company_id()
    and (select p.role from public.profiles p where p.id = auth.uid()) = 'admin'
    and exists (select 1 from public.profiles doel
                 where doel.id = user_permissions.user_id
                   and doel.company_id = user_permissions.company_id)
  );

alter policy permissions_admin_update on public.user_permissions
  using (
    company_id = public.current_company_id()
    and (select p.role from public.profiles p where p.id = auth.uid()) = 'admin'
  )
  with check (
    company_id = public.current_company_id()
    and (select p.role from public.profiles p where p.id = auth.uid()) = 'admin'
    and exists (select 1 from public.profiles doel
                 where doel.id = user_permissions.user_id
                   and doel.company_id = user_permissions.company_id)
  );

select
  (select string_agg(plan, ',' order by plan) from public.plan_features
    where feature = 'rollen_rechten')                                      as rollen_rechten_in,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'user_permissions'
      and cmd in ('INSERT', 'UPDATE') and permissive = 'PERMISSIVE'
      and with_check ~ 'doel')                                             as policies_met_doelcontrole,
  (select count(*) from public.user_permissions up
     join public.profiles p on p.id = up.user_id
    where up.company_id is distinct from p.company_id)                     as rechten_over_de_bedrijfsgrens;

commit;

-- pgrst_ddl_watch luistert niet op ALTER POLICY. Zie CLAUDE.md.
notify pgrst, 'reload schema';
