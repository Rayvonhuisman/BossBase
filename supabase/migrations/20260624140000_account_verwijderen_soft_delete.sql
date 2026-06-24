-- Account verwijderen (soft delete, AVG-bewust).
--
-- Databewaarbeleid:
--  * Soft delete: account wordt gedeactiveerd (actief = false), toegang vervalt
--    direct (App.jsx-sessiecontrole logt uit). Niets wordt hard verwijderd.
--  * profiles.verwijderd_op / companies.opgezegd_op leggen het moment vast.
--  * Gegevens blijven 2 jaar bewaard (reactiveerbaar); financiële administratie
--    wettelijk 7 jaar. De daadwerkelijke opschoning na die termijnen gebeurt
--    later via een cron job — deze migratie legt alleen de soft-delete vast.

alter table public.profiles  add column if not exists verwijderd_op timestamptz;
alter table public.companies add column if not exists opgezegd_op  timestamptz;

-- Eigen account verwijderen (medewerker): markeert alleen het eigen profiel.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set actief = false,
         verwijderd_op = coalesce(verwijderd_op, now())
   where id = auth.uid();
end;
$$;

-- Bedrijf opzeggen (alleen admin/eigenaar): zet het bedrijf op 'opgezegd' en
-- deactiveert alle teamleden van dat bedrijf.
create or replace function public.cancel_company_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_role    text;
begin
  select company_id, role into v_company, v_role
    from public.profiles where id = auth.uid();

  if v_role is distinct from 'admin' then
    raise exception 'Alleen een beheerder kan het bedrijf opzeggen';
  end if;
  if v_company is null then
    raise exception 'Geen bedrijf gekoppeld aan dit account';
  end if;

  update public.companies
     set status = 'opgezegd',
         opgezegd_op = coalesce(opgezegd_op, now())
   where id = v_company;

  update public.profiles
     set actief = false,
         verwijderd_op = coalesce(verwijderd_op, now())
   where company_id = v_company;
end;
$$;

revoke all on function public.delete_own_account()     from public;
revoke all on function public.cancel_company_account()  from public;
grant execute on function public.delete_own_account()    to authenticated;
grant execute on function public.cancel_company_account() to authenticated;
