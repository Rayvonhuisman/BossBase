-- =============================================================================
-- BossBase: instelling "alleen betaalde facturen synchroniseren" (per koppeling)
-- Bestand : supabase/migrations/20260722190000_sync_paid_only.sql
--
-- Nieuwe niet-geheime kolom sync_paid_only op accounting_connections (default
-- uit = verzonden + betaalde facturen syncen). Geldt voor Moneybird én
-- SnelStart. De status- en opslag-RPC's geven de vlag mee aan de frontend; de
-- SnelStart sync-targets krijgen hem voor de scheduled-modus.
-- =============================================================================

alter table public.accounting_connections
  add column if not exists sync_paid_only boolean not null default false;

grant select (sync_paid_only) on public.accounting_connections to authenticated;

-- ── Status-RPC: sync_paid_only mee teruggeven (return-type wijzigt → drop) ───
drop function if exists public.get_accounting_status();

create or replace function public.get_accounting_status()
returns table (
  provider            text,
  administration_id   text,
  afas_environment_id text,
  connected           boolean,
  import_costs        boolean,
  sync_paid_only      boolean,
  last_synced_at      timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ac.provider,
    ac.administration_id,
    ac.afas_environment_id,
    case ac.provider
      when 'moneybird' then (ac.api_token is not null and ac.api_token <> '')
      when 'snelstart' then (ac.client_key is not null and ac.client_key <> '')
      when 'afas'      then coalesce(ac.is_connected, false)
      else coalesce(ac.is_connected, (ac.api_token is not null and ac.api_token <> ''))
    end as connected,
    coalesce(ac.import_costs, false) as import_costs,
    coalesce(ac.sync_paid_only, false) as sync_paid_only,
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = (select company_id from public.profiles where id = auth.uid());
$$;

revoke all on function public.get_accounting_status() from public, anon;
grant execute on function public.get_accounting_status() to authenticated;

-- ── Opslag-RPC: zelfde statusrij teruggeven (return-type wijzigt → drop) ─────
drop function if exists public.save_accounting_connection(text, text, text, text);

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
  sync_paid_only      boolean,
  last_synced_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
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
    coalesce(ac.sync_paid_only, false) as sync_paid_only,
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = v_company and ac.provider = p_provider;
end;
$$;

revoke all on function public.save_accounting_connection(text, text, text, text) from public, anon;
grant execute on function public.save_accounting_connection(text, text, text, text) to authenticated;

-- ── SnelStart sync-targets: vlag mee voor de scheduled-modus ─────────────────
drop function if exists public.get_snelstart_sync_targets();

create or replace function public.get_snelstart_sync_targets()
returns table (company_id uuid, client_key text, import_costs boolean, sync_paid_only boolean)
language sql
stable
security definer
set search_path = public
as $$
  select ac.company_id, ac.client_key, coalesce(ac.import_costs, false), coalesce(ac.sync_paid_only, false)
  from accounting_connections ac
  where ac.provider = 'snelstart'
    and ac.client_key is not null
    and ac.client_key <> ''
$$;

comment on function public.get_snelstart_sync_targets() is
  'Minimale sync-doelen (company_id, client_key, import_costs, sync_paid_only) voor bedrijven met een SnelStart-koppelsleutel. Alleen service_role — nooit anon/authenticated (bevat geheime sleutels).';

revoke all     on function public.get_snelstart_sync_targets() from public;
revoke execute on function public.get_snelstart_sync_targets() from anon, authenticated;
grant  execute on function public.get_snelstart_sync_targets() to service_role;
