-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (sec-scheiding B6):
-- 1. Triggers draaien alfabetisch. bb_gebruikerslimiet kwam vóór
--    protect_privileges en keek naar het NIEUWE company_id; een buitenstaander die
--    zijn profiel naar een ander bedrijf probeerde te zetten, kreeg daardoor het
--    pakket van dat bedrijf in de foutmelding te zien.
-- 2. protect_profile_privileges zette rol/bedrijf/super-admin stil terug; de API
--    antwoordde "204 gelukt" terwijl er niets gebeurde.
--
-- Nu: de bescherming heet a0_… en draait als eerste, en ze geeft een fout. De
-- app wijzigt via een gewone profiel-update alleen full_name en avatar_url
-- (gecontroleerd); rollen gaan via bb_teamlid_bijwerken (definer, current_user is
-- dan de eigenaar) en edge functions (service_role) — die blijven werken.

begin;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if (new.is_super_admin is distinct from old.is_super_admin)
       or (new.role is distinct from old.role)
       or (new.company_id is distinct from old.company_id) then
      raise exception 'Rol, bedrijf en beheerrechten van een profiel kun je hier niet wijzigen.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_privileges on public.profiles;
drop trigger if exists a0_protect_privileges on public.profiles;
create trigger a0_protect_privileges before update on public.profiles
  for each row execute function public.protect_profile_privileges();

notify pgrst, 'reload schema';

select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal order by tgname;

commit;
