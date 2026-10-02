-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (sec-dbfuncties E2):
-- 1. delete_own_account deactiveerde het eigen account zonder te kijken of je de
--    eigenaar of de laatste actieve beheerder bent. bb_profiel_bewaken vangt
--    alleen DELETE en rolwissel, niet actief=false. Een bedrijf kon zo zonder
--    beheerder achterblijven. De eigenaar gebruikt "Bedrijf sluiten".
-- 2. meld_mail_fout: elke ingelogde gebruiker kon onbeperkt rijen (2000 tekens)
--    in mail_fouten zetten, die in het super-admin-overzicht verschijnen. Nu:
--    alleen met een bedrijf, korte velden afgekapt, hooguit 30 per bedrijf per
--    uur (daarboven stil genegeerd: het is een best-effort log, de app mag er
--    nooit op stuklopen).
-- 3. get_invite_company_for_current_user wordt sinds 20261002131154 nergens meer
--    gebruikt (lidmaatschap alleen via accept-invite). Weg ermee.

begin;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_profiel record;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd';
  end if;
  select company_id, role into v_profiel from public.profiles where id = v_uid;
  if v_profiel.company_id is not null then
    if exists (select 1 from public.companies where id = v_profiel.company_id and eigenaar_id = v_uid) then
      raise exception 'Je bent de eigenaar van dit bedrijf. Draag het eigenaarschap over of gebruik "Bedrijf sluiten".'
        using errcode = '42501';
    end if;
    if v_profiel.role = 'admin' and not exists (
         select 1 from public.profiles
          where company_id = v_profiel.company_id and role = 'admin'
            and actief is distinct from false and id <> v_uid) then
      raise exception 'Je bent de laatste beheerder van dit bedrijf. Maak eerst iemand anders beheerder.'
        using errcode = '42501';
    end if;
  end if;
  update public.profiles
     set actief = false, verwijderd_op = coalesce(verwijderd_op, now())
   where id = v_uid;
  perform public.bb_toegang_beeindigen(array[v_uid]);
end;
$function$;

create or replace function public.meld_mail_fout(p_soort text, p_fout text, p_bron text, p_ontvanger text default null::text, p_gerelateerd_type text default null::text, p_gerelateerd_id uuid default null::uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_naam    text;
begin
  select company_id into v_company from public.profiles where id = auth.uid();
  if v_company is null then
    return;
  end if;
  if (select count(*) from public.mail_fouten
       where company_id = v_company and opgetreden_op > now() - interval '1 hour') >= 30 then
    return;
  end if;
  select name into v_naam from public.companies where id = v_company;

  insert into public.mail_fouten
    (soort, ontvanger, company_id, bedrijf_naam, fout, bron, gerelateerd_type, gerelateerd_id)
  values
    (left(coalesce(nullif(p_soort, ''), 'onbekend'), 60),
     left(p_ontvanger, 200),
     v_company,
     v_naam,
     left(coalesce(nullif(p_fout, ''), 'onbekende fout'), 2000),
     left(coalesce(nullif(p_bron, ''), 'onbekend'), 60),
     left(p_gerelateerd_type, 40),
     p_gerelateerd_id);
end;
$function$;

drop function if exists public.get_invite_company_for_current_user();

notify pgrst, 'reload schema';

select
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'delete_own_account' and p.pronamespace = 'public'::regnamespace
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE') and r.rolname in ('anon','authenticated','service_role')) as delete_rechten,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'meld_mail_fout' and p.pronamespace = 'public'::regnamespace
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE') and r.rolname in ('anon','authenticated','service_role')) as mailfout_rechten,
  (select count(*) from pg_proc where proname = 'get_invite_company_for_current_user') as invite_functie_moet_0;

commit;
