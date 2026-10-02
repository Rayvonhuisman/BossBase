-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, sec-rollen 7 (laag), live bevestigd op Team in de
-- fix-ronde: elke medewerker kon via de API alle rechten van alle collega's
-- lezen (28 rijen, ook als kale medewerker). De app heeft dat niet nodig: een
-- medewerker leest alleen zijn eigen rechten (usePermissions), het
-- rechtenvenster in Team is alleen voor beheerders, en edge functions lezen met
-- de service-rol. Voortaan: je eigen rijen, of alle rijen van je bedrijf als je
-- beheerder bent.

begin;

drop policy if exists permissions_select on public.user_permissions;
create policy permissions_select on public.user_permissions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      company_id = (select p.company_id from public.profiles p where p.id = (select auth.uid()))
      and (select p.role from public.profiles p where p.id = (select auth.uid())) = 'admin'
    )
  );

notify pgrst, 'reload schema';

select count(*) as select_policies
  from pg_policies where tablename = 'user_permissions' and cmd = 'SELECT';

commit;
