-- =============================================================================
-- BossBase: SnelStart-koppeling herbouwd op het juiste (productie)model
-- Bestand : supabase/migrations/20260722170000_snelstart_rebuild.sql
--
-- Het oude model (per tenant een subscription_key + "maatwerksleutel") was
-- gebaseerd op een verkeerd begrip van de SnelStart B2B-API. Het juiste model
-- (zie docs/snelstart-b2b-api-v2-openapi.json + developer portal):
--   * ÉÉN BossBase platform-subscriptionkey als edge-function secret
--     (SNELSTART_SUBSCRIPTION_KEY) — nooit per tenant, nooit in de database.
--   * Per bedrijf ÉÉN koppelsleutel (client_key), waarmee de edge functions een
--     bearer token halen (grant_type=clientkey). De sleutel bepaalt de
--     administratie; een apart administratie-ID is niet nodig.
--
-- client_key is een geheim en volgt dezelfde afscherming als de andere
-- boekhoud-tokens (20260722140000): NIET in de column-grant voor authenticated,
-- alleen service-role (edge functions) leest hem. Schrijven mag wel (admin-RLS),
-- zodat de koppel-flow werkt.
-- =============================================================================

-- ── 1. Nieuwe kolommen ───────────────────────────────────────────────────────
alter table public.accounting_connections add column if not exists client_key text;
-- Kosten-import (inkoopfacturen → job_costs) is optioneel per koppeling,
-- STANDAARD UIT. Alleen als de klant dit aanzet draait de kosten-import.
alter table public.accounting_connections add column if not exists import_costs boolean not null default false;

-- import_costs is niet geheim en mag door de frontend gelezen worden; de
-- column-grants uit 20260722140000 zijn expliciet, dus apart bijgeven.
grant select (import_costs) on public.accounting_connections to authenticated;

-- SnelStart-referenties voor idempotente sync (zelfde patroon als moneybird_id).
alter table public.customers add column if not exists snelstart_id text;
alter table public.facturen  add column if not exists snelstart_id text;

-- ── 2. Status-RPC vernieuwen ─────────────────────────────────────────────────
-- snelstart-connected hangt nu aan client_key; import_costs komt mee zodat de
-- instellingen-kaart het vinkje kan tonen. Return-type wijzigt → drop + create.
drop function if exists public.get_accounting_status();

create or replace function public.get_accounting_status()
returns table (
  provider            text,
  administration_id   text,
  afas_environment_id text,
  connected           boolean,
  import_costs        boolean,
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
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = (select company_id from public.profiles where id = auth.uid());
$$;

revoke all on function public.get_accounting_status() from public, anon;
grant execute on function public.get_accounting_status() to authenticated;

-- ── 3. Oude, foute sleutelkolommen verwijderen ───────────────────────────────
-- subscription_key wordt platform-secret; de "maatwerksleutel" (secondary_key)
-- bestond niet in het echte API-model. Waarden waren onbruikbaar → geen migratie
-- van data nodig.
alter table public.accounting_connections drop column if exists subscription_key;
alter table public.accounting_connections drop column if exists secondary_key;

-- ── 4. Afgebakende sync-doelen voor de scheduled-modus ───────────────────────
-- Spiegel van get_moneybird_sync_targets (20260718094500): alleen service_role,
-- alleen bedrijven met een koppelsleutel. import_costs komt mee zodat de
-- kosten-cron bedrijven met het vinkje uit kan overslaan.
create or replace function public.get_snelstart_sync_targets()
returns table (company_id uuid, client_key text, import_costs boolean)
language sql
stable
security definer
set search_path = public
as $$
  select ac.company_id, ac.client_key, coalesce(ac.import_costs, false)
  from accounting_connections ac
  where ac.provider = 'snelstart'
    and ac.client_key is not null
    and ac.client_key <> ''
$$;

comment on function public.get_snelstart_sync_targets() is
  'Minimale sync-doelen (company_id, client_key, import_costs) voor bedrijven met een SnelStart-koppelsleutel. Alleen service_role — nooit anon/authenticated (bevat geheime sleutels).';

revoke all     on function public.get_snelstart_sync_targets() from public;
revoke execute on function public.get_snelstart_sync_targets() from anon, authenticated;
grant  execute on function public.get_snelstart_sync_targets() to service_role;
