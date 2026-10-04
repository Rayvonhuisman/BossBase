-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, H6 (sec-rollen 1) en M12.
--
-- Deactiveren zette profiles.actief=false en bande het auth-account. Nieuwe
-- logins en refreshes stopten, maar een al uitgegeven access-token blijft tot
-- een uur geldig, en SECURITY DEFINER-functies omzeilen de restrictieve policy
-- bb_alleen_actieve_gebruikers. Gesimuleerd: een net gedeactiveerde beheerder
-- maakte via bb_teamlid_bijwerken een medewerker admin.
--
-- Daarom:
--   * bb_has_permission en bb_is_admin_or_permission geven false voor een
--     inactief account — elke functie en policy die daarop leunt, valt dicht;
--   * de vier definer-functies die zelf de rol uit profiles lezen
--     (bb_teamlid_bijwerken, save_/disconnect_accounting_connection,
--     snelstart_referentie) weigeren een inactief account expliciet;
--   * bb_sessies_intrekken(user) verwijdert de auth-sessies (refresh-tokens
--     cascaderen mee). delete-team-member roept hem aan bij deactiveren, en
--     apply-password-reset na een wachtwoordreset (M12): wie een gestolen
--     sessie had, kan die niet meer verversen.

begin;

create or replace function public.bb_has_permission(p_permission text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((select role in ('admin','planner') and actief is not false from profiles where id = auth.uid()), false)
    or (exists (select 1 from user_permissions where user_id = auth.uid() and permission = p_permission and granted)
        and coalesce((select actief is not false from profiles where id = auth.uid()), false));
$function$;

create or replace function public.bb_is_admin_or_permission(p_permission text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((select role = 'admin' and actief is not false from profiles where id = auth.uid()), false)
    or (exists (select 1 from user_permissions where user_id = auth.uid() and permission = p_permission and granted)
        and coalesce((select actief is not false from profiles where id = auth.uid()), false));
$function$;

CREATE OR REPLACE FUNCTION public.bb_teamlid_bijwerken(p_profile_id uuid, p_rol text DEFAULT NULL::text, p_naam text DEFAULT NULL::text, p_telefoon text DEFAULT NULL::text, p_uren numeric DEFAULT NULL::numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller         uuid := auth.uid();
  v_caller_rol     text;
  v_caller_company uuid;
  v_caller_super   boolean;
  v_company        uuid;
  v_rol_nu         text;
  v_eigenaar       uuid;
BEGIN
  -- Een gedeactiveerde gebruiker mag niets meer, ook niet met een access-token
  -- dat nog niet verlopen is (audit 2026-10-01, H6).
  if not public.bb_ik_ben_actief() then
    raise exception 'Dit account is gedeactiveerd.' using errcode = '42501';
  end if;
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd' USING ERRCODE = '28000';
  END IF;

  SELECT role, company_id, coalesce(is_super_admin, false)
    INTO v_caller_rol, v_caller_company, v_caller_super
    FROM public.profiles WHERE id = v_caller;

  SELECT company_id, role INTO v_company, v_rol_nu
    FROM public.profiles WHERE id = p_profile_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Teamlid niet gevonden' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_caller_super
     AND (v_caller_rol IS DISTINCT FROM 'admin' OR v_caller_company IS DISTINCT FROM v_company) THEN
    RAISE EXCEPTION 'Alleen een beheerder van dit bedrijf kan teamleden aanpassen.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_rol IS NOT NULL AND p_rol NOT IN ('admin', 'medewerker', 'planner') THEN
    RAISE EXCEPTION 'Onbekende rol: %', p_rol USING ERRCODE = 'check_violation';
  END IF;

  SELECT eigenaar_id INTO v_eigenaar FROM public.companies WHERE id = v_company;

  -- De eigenaar is van zichzelf. Een andere beheerder blijft eraf.
  IF v_eigenaar IS NOT NULL AND p_profile_id = v_eigenaar
     AND v_caller <> v_eigenaar AND NOT v_caller_super THEN
    RAISE EXCEPTION 'De eigenaar van het account kan alleen door de eigenaar zelf worden aangepast.'
      USING ERRCODE = 'insufficient_privilege', HINT = 'eigenaar';
  END IF;

  -- De trigger vangt dit ook af; hier staat het voor de nette melding.
  IF p_rol IS NOT NULL AND v_rol_nu = 'admin' AND p_rol <> 'admin'
     AND public.bb_actieve_admins(v_company, p_profile_id) = 0 THEN
    RAISE EXCEPTION 'Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan.'
      USING ERRCODE = 'check_violation', HINT = 'laatste_admin';
  END IF;

  UPDATE public.profiles
     SET role      = coalesce(p_rol, role),
         full_name = coalesce(nullif(btrim(p_naam), ''), full_name)
   WHERE id = p_profile_id;

  -- Telefoon en uren staan niet op profiles maar op company_members. Bestaat
  -- die rij (lang niet altijd), houd hem dan gelijk.
  UPDATE public.company_members
     SET phone          = coalesce(p_telefoon, phone),
         hours_per_week = coalesce(p_uren, hours_per_week),
         full_name      = coalesce(nullif(btrim(p_naam), ''), full_name),
         role           = coalesce(p_rol, role),
         updated_at     = now()
   WHERE profile_id = p_profile_id;

  RETURN (SELECT row_to_json(x) FROM (
    SELECT p.id, p.company_id, p.full_name, p.role, p.actief, p.avatar_url, p.created_at
      FROM public.profiles p WHERE p.id = p_profile_id) x);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_accounting_connection(p_provider text, p_secret text DEFAULT NULL::text, p_administration_id text DEFAULT NULL::text, p_afas_environment_id text DEFAULT NULL::text)
 RETURNS TABLE(provider text, administration_id text, afas_environment_id text, connected boolean, last_synced_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_company uuid;
  v_role    text;
  v_secret  text := nullif(btrim(coalesce(p_secret, '')), '');
begin
  -- Een gedeactiveerde gebruiker mag niets meer, ook niet met een access-token
  -- dat nog niet verlopen is (audit 2026-10-01, H6).
  if not public.bb_ik_ben_actief() then
    raise exception 'Dit account is gedeactiveerd.' using errcode = '42501';
  end if;
  select p.company_id, p.role into v_company, v_role
  from public.profiles p where p.id = auth.uid();

  if v_company is null then
    raise exception 'Geen bedrijf gevonden';
  end if;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen admins kunnen koppelingen beheren';
  end if;
  if p_provider not in ('moneybird', 'snelstart', 'afas') then
    raise exception 'Onbekende provider: %', p_provider;
  end if;

  insert into public.accounting_connections as ac
    (company_id, provider, api_token, client_key, afas_token,
     administration_id, afas_environment_id, is_connected, updated_at)
  values (
    v_company, p_provider,
    case when p_provider = 'moneybird' then v_secret end,
    case when p_provider = 'snelstart' then v_secret end,
    case when p_provider = 'afas'      then v_secret end,
    p_administration_id, p_afas_environment_id,
    false, now()
  )
  on conflict (company_id, provider) do update set
    -- coalesce, niet case-else: geen secret meegegeven = niets wijzigen.
    api_token           = case when p_provider = 'moneybird' then coalesce(v_secret, ac.api_token)  else ac.api_token  end,
    client_key          = case when p_provider = 'snelstart' then coalesce(v_secret, ac.client_key) else ac.client_key end,
    afas_token          = case when p_provider = 'afas'      then coalesce(v_secret, ac.afas_token) else ac.afas_token end,
    administration_id   = coalesce(p_administration_id, ac.administration_id),
    afas_environment_id = coalesce(p_afas_environment_id, ac.afas_environment_id),
    -- AFAS is pas verbonden na een geslaagde test. Alleen terugzetten op false
    -- als er écht een nieuw token is opgeslagen; anders zou het bijwerken van
    -- alleen het environment-id de koppeling onterecht verbreken.
    is_connected        = case when p_provider = 'afas' and v_secret is not null then false else ac.is_connected end,
    updated_at          = now();

  return query
  select
    ac.provider,
    ac.administration_id,
    ac.afas_environment_id,
    case ac.provider
      when 'moneybird' then (ac.api_token is not null and ac.api_token <> '')
      when 'snelstart' then (ac.client_key is not null and ac.client_key <> '')
      when 'afas'      then coalesce(ac.is_connected, false)
      else coalesce(ac.is_connected, false)
    end as connected,
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = v_company and ac.provider = p_provider;
end;
$function$;

CREATE OR REPLACE FUNCTION public.disconnect_accounting_connection(p_provider text)
 RETURNS TABLE(provider text, administration_id text, afas_environment_id text, connected boolean, last_synced_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_company uuid;
  v_role    text;
begin
  -- Een gedeactiveerde gebruiker mag niets meer, ook niet met een access-token
  -- dat nog niet verlopen is (audit 2026-10-01, H6).
  if not public.bb_ik_ben_actief() then
    raise exception 'Dit account is gedeactiveerd.' using errcode = '42501';
  end if;
  select p.company_id, p.role into v_company, v_role
  from public.profiles p where p.id = auth.uid();

  if v_company is null then
    raise exception 'Geen bedrijf gevonden';
  end if;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen admins kunnen koppelingen beheren';
  end if;
  if p_provider not in ('moneybird', 'snelstart', 'afas') then
    raise exception 'Onbekende provider: %', p_provider;
  end if;

  update public.accounting_connections ac
     set api_token    = case when p_provider = 'moneybird' then null else ac.api_token  end,
         client_key   = case when p_provider = 'snelstart' then null else ac.client_key end,
         afas_token   = case when p_provider = 'afas'      then null else ac.afas_token end,
         is_connected = false,
         updated_at   = now()
   where ac.company_id = v_company
     and ac.provider   = p_provider;

  return query
  select
    ac.provider,
    ac.administration_id,
    ac.afas_environment_id,
    case ac.provider
      when 'moneybird' then (ac.api_token is not null and ac.api_token <> '')
      when 'snelstart' then (ac.client_key is not null and ac.client_key <> '')
      when 'afas'      then coalesce(ac.is_connected, false)
      else coalesce(ac.is_connected, false)
    end as connected,
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = v_company and ac.provider = p_provider;
end;
$function$;

CREATE OR REPLACE FUNCTION public.snelstart_referentie()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_company uuid;
  v_role    text;
  v_key     text;
begin
  -- Een gedeactiveerde gebruiker mag niets meer, ook niet met een access-token
  -- dat nog niet verlopen is (audit 2026-10-01, H6).
  if not public.bb_ik_ben_actief() then
    raise exception 'Dit account is gedeactiveerd.' using errcode = '42501';
  end if;
  select p.company_id, p.role into v_company, v_role
  from public.profiles p where p.id = auth.uid();

  if v_company is null then
    raise exception 'Geen bedrijf gevonden';
  end if;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen admins kunnen koppelingen beheren';
  end if;

  insert into public.snelstart_referenties (company_id, reference_key)
  values (v_company, 'bb_' || encode(gen_random_bytes(24), 'hex'))
  on conflict (company_id) do nothing;

  select r.reference_key into v_key
  from public.snelstart_referenties r where r.company_id = v_company;
  return v_key;
end;
$function$;

create or replace function public.bb_sessies_intrekken(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.bb_sessies_intrekken(uuid) from public, anon, authenticated;
grant execute on function public.bb_sessies_intrekken(uuid) to service_role;

notify pgrst, 'reload schema';

select r.rolname, p.proname
  from pg_roles r, pg_proc p
 where p.proname in ('bb_sessies_intrekken')
   and p.pronamespace = 'public'::regnamespace
   and r.rolname in ('anon', 'authenticated', 'service_role')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

commit;
