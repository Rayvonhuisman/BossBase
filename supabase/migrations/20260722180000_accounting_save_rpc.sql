-- =============================================================================
-- BossBase: opslag-RPC voor boekhoudkoppelingen
-- Bestand : supabase/migrations/20260722180000_accounting_save_rpc.sql
--
-- Probleem: sinds de token-afscherming (20260722140000) faalt de frontend-
-- upsert van een koppeling met "permission denied": PostgREST vertaalt upsert
-- naar INSERT ... ON CONFLICT DO UPDATE SET col = excluded.col, en het lezen
-- van EXCLUDED.<geheime kolom> vereist SELECT-recht op die kolom — dat is voor
-- authenticated juist ingetrokken. Dit raakt alle drie de providers.
--
-- Aanpak: één SECURITY DEFINER opslag-RPC (zelfde patroon als
-- get_accounting_status): de secret gaat er als parameter in en komt er nooit
-- meer uit. Admin-rol + company-scoping worden expliciet afgedwongen (de RPC
-- draait buiten RLS om). De frontend gebruikt geen directe upsert meer.
-- =============================================================================

create or replace function public.save_accounting_connection(
  p_provider            text,
  p_secret              text default null,
  p_administration_id   text default null,
  p_afas_environment_id text default null
)
returns table (
  provider            text,
  administration_id   text,
  afas_environment_id text,
  connected           boolean,
  import_costs        boolean,
  last_synced_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_role    text;
begin
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
    case when p_provider = 'moneybird' then p_secret end,
    case when p_provider = 'snelstart' then p_secret end,
    case when p_provider = 'afas'      then p_secret end,
    p_administration_id, p_afas_environment_id,
    -- AFAS is pas "connected" na een geslaagde test; overige providers volgen
    -- de aanwezigheid van hun secret (zie get_accounting_status).
    false, now()
  )
  on conflict (company_id, provider) do update set
    api_token           = case when p_provider = 'moneybird' then p_secret else ac.api_token end,
    client_key          = case when p_provider = 'snelstart' then p_secret else ac.client_key end,
    afas_token          = case when p_provider = 'afas'      then p_secret else ac.afas_token end,
    administration_id   = coalesce(p_administration_id, ac.administration_id),
    afas_environment_id = coalesce(p_afas_environment_id, ac.afas_environment_id),
    is_connected        = case when p_provider = 'afas' then false else ac.is_connected end,
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
    coalesce(ac.import_costs, false) as import_costs,
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = v_company and ac.provider = p_provider;
end;
$$;

revoke all on function public.save_accounting_connection(text, text, text, text) from public, anon;
grant execute on function public.save_accounting_connection(text, text, text, text) to authenticated;
