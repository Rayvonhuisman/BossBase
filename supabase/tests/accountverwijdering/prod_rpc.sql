CREATE OR REPLACE FUNCTION public.cancel_company_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_company uuid; v_role text;
begin
  select company_id, role into v_company, v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'admin' then
    raise exception 'Alleen een beheerder kan het bedrijf opzeggen';
  end if;
  if v_company is null then
    raise exception 'Geen bedrijf gekoppeld aan dit account';
  end if;
  update public.companies set status = 'opgezegd', opgezegd_op = coalesce(opgezegd_op, now()) where id = v_company;
  update public.profiles set actief = false, verwijderd_op = coalesce(verwijderd_op, now()) where company_id = v_company;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.delete_own_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.profiles
     set actief = false, verwijderd_op = coalesce(verwijderd_op, now())
   where id = auth.uid();
end;
$function$
;
