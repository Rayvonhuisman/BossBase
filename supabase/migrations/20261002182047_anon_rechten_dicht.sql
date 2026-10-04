-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (sec-scheiding B4, sec-dbfuncties E1): anon had nog
-- INSERT/UPDATE/DELETE/REFERENCES/TRIGGER op 65 tabellen en EXECUTE op 66
-- functies in public. Alleen RLS hield hem tegen, dus één fout in één policy was
-- direct uit te buiten (zo ging het bij project_fotos, K1).
--
-- Wat anon echt nodig heeft (gecontroleerd in de frontend): de publieke
-- ondertekenpagina's en de betaalpagina lezen via token-RPC's
-- (get_*_by_sign_token, get_*_by_werkbon_token, get_offerte_items_by_token,
-- get_payment_branding); al het andere publieke verkeer loopt via edge functions
-- met de service-rol. Plus bb_voor_verzoek: die draait als pgrst.db_pre_request
-- bij ELK verzoek, ook anoniem.
--
-- Aanpak voor functies: EXECUTE stond via PUBLIC open. "revoke from anon" haalt
-- dat niet weg (zie CLAUDE.md). Daarom per functie: onthouden wie hem nu mag
-- uitvoeren (authenticated, service_role), daarna alles van PUBLIC en anon
-- intrekken, en die rollen expliciet teruggeven. Voor authenticated verandert er
-- dus niets, behalve bij triggerfuncties: die zijn via de API niet aan te roepen
-- en een trigger controleert EXECUTE niet bij het afvuren.
--
-- Tabellen: anon houdt SELECT (RLS geeft 0 rijen), verder niets. authenticated
-- verliest REFERENCES en TRIGGER (zonder CREATE-recht toch zinloos).
-- De default privileges van postgres gaan mee, zodat nieuwe tabellen en
-- functies dit niet terugkrijgen. Een nieuwe publieke RPC moet anon dus
-- voortaan expliciet krijgen.

begin;

revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke references, trigger on all tables in schema public from authenticated;
revoke usage, select, update on all sequences in schema public from anon;

do $$
declare
  f record;
  v_auth boolean;
  v_service boolean;
  v_anon_hou boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  loop
    v_auth    := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    v_service := has_function_privilege('service_role', f.oid, 'EXECUTE');
    v_anon_hou := f.proname = 'bb_voor_verzoek'
               or f.proname = 'get_payment_branding'
               or f.proname = 'get_offerte_items_by_token'
               or f.proname like 'get\_%\_by\_sign\_token'
               or f.proname like 'get\_%\_by\_werkbon\_token';
    execute format('revoke all on function %s from public, anon', f.sig);
    if v_auth and not f.is_trigger then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.is_trigger then
      execute format('revoke all on function %s from authenticated', f.sig);
    end if;
    if v_service then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
    if v_anon_hou then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public
  revoke references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

notify pgrst, 'reload schema';

select
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
     and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE'))) as anon_schrijf_tabellen_moet_0,
  (select string_agg(p.proname, ',' order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_functies;

commit;
