-- =============================================================================
-- BossBase: boekhoud-tokens server-side afschermen (accounting_connections)
-- Bestand : supabase/migrations/20260722140000_accounting_tokens_server_side.sql
--
-- Probleem: accounting_connections.(api_token, subscription_key, secondary_key,
-- afas_token) was leesbaar door ELKE ingelogde medewerker via de PostgREST-API
-- (de SELECT-policy is company-scoped maar niet kolom-beperkt). Een gewone
-- medewerker kon zo het Moneybird/SnelStart/AFAS-token uitlezen = volledige
-- toegang tot de boekhouding buiten BossBase om.
--
-- Aanpak (zelfde principe als google_calendar_connections): de gevoelige
-- kolommen zijn niet langer leesbaar voor authenticated/anon; alleen de
-- service-role (edge functions) leest ze nog. De frontend leest de connectie-
-- STATUS via een SECURITY DEFINER-RPC die NOOIT de tokenwaarde teruggeeft, maar
-- een server-side berekende `connected`-boolean.
--
-- Behoudt: INSERT/UPDATE (admin-only, RLS) blijven, zodat de koppel-flow (token
-- invoeren) blijft werken. De idempotente row-scoping (RLS SELECT-policy) blijft.
-- =============================================================================

-- ── 1. Token-kolommen niet meer leesbaar voor de client ─────────────────────
-- De table-level SELECT-grant dekt alle kolommen; die trekken we in en geven
-- vervolgens alleen SELECT op de NIET-geheime kolommen terug. INSERT/UPDATE
-- blijven ongemoeid (admins mogen tokens schrijven; RLS dwingt company+rol af).
revoke select on public.accounting_connections from authenticated, anon;

grant select (
  id, company_id, provider, administration_id, afas_environment_id,
  is_connected, last_synced_at, created_at, updated_at
) on public.accounting_connections to authenticated;

-- ── 2. Veilige status-RPC (geen tokens) ─────────────────────────────────────
-- Geeft per provider de niet-geheime status terug plus een server-berekende
-- `connected`-boolean (o.b.v. tokenaanwezigheid, resp. is_connected voor AFAS).
-- Scoped op het bedrijf van de aanroeper. De tokenwaarde verlaat de database
-- nooit.
create or replace function public.get_accounting_status()
returns table (
  provider            text,
  administration_id   text,
  afas_environment_id text,
  connected           boolean,
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
      when 'snelstart' then (ac.subscription_key is not null and ac.subscription_key <> '')
      when 'afas'      then coalesce(ac.is_connected, false)
      else coalesce(ac.is_connected, (ac.api_token is not null and ac.api_token <> ''))
    end as connected,
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = (select company_id from public.profiles where id = auth.uid());
$$;

revoke all on function public.get_accounting_status() from public, anon;
grant execute on function public.get_accounting_status() to authenticated;
