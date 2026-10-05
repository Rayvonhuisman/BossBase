-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Stap 2 van de Moneybird-herbouw: koppelen via OAuth in plaats van een
-- geplakt persoonlijk token. De klant klikt "Koppel met Moneybird", logt in bij
-- Moneybird, geeft toestemming en kiest een administratie. Moneybird stuurt de
-- browser terug naar https://www.bossbase.nl/dashboard/koppelen/moneybird; de
-- edge function moneybird-oauth wisselt de code in voor tokens.
--
-- Wat er verandert:
--
-- 1. accounting_connections krijgt de kolommen die OAuth nodig heeft:
--    refresh_token (geheim, zoals api_token: authenticated krijgt er geen
--    SELECT op — de tabel heeft sinds 20260722140000 alleen kolomrechten op de
--    niet-geheime kolommen, en een nieuwe kolom valt daar niet onder),
--    administratie_naam, webhook_id/webhook_secret (voor stap 6),
--    koppeling_fout (gezet als vernieuwen van het token mislukt: dan moet de
--    klant opnieuw koppelen, en dat hoort hij te zien) en volledig_gesynct_op
--    (de nachtelijke run verdeelt een grote eerste import over meerdere rondes;
--    dit veld zegt wanneer een bedrijf voor het laatst helemaal bij was).
--
-- 2. moneybird_oauth_states: de "state" van een lopende koppelpoging, met de
--    tokens totdat de klant een administratie heeft gekozen. Alleen de
--    service-rol komt erbij (RLS aan, geen policies, geen rechten).
--
-- 3. Kolommen voor de synchronisatie (stap 3–5), hier al aangelegd zodat de
--    administratie-check bij het koppelen ze kan terugzetten:
--      customers/leveranciers.moneybird_versie + moneybird_hash
--        versie = Moneybird's versienummer bij de laatste sync (zo halen we
--        alleen op wat daar veranderd is); hash = vingerafdruk van onze velden
--        bij de laatste sync (zo zien we wat hier veranderd is — customers
--        heeft geen updated_at).
--      facturen.moneybird_bijlage_gesynct, job_costs.moneybird_id en
--        job_costs.moneybird_bijlage_gesynct: zelfde patroon als SnelStart.
--
-- 4. Het oude persoonlijke token wordt gewist. Gemeten vóór deze migratie:
--    één Moneybird-koppeling, van BossBase Admin (intern), met token en
--    administratie, is_connected = false. Het administratienummer blijft staan:
--    koppelt BossBase Admin opnieuw met dezelfde administratie, dan blijven de
--    Moneybird-id's van de 9 klanten en 2 kostenposten geldig.
--
-- 5. save_accounting_connection weigert voortaan 'moneybird': een token
--    plakken bestaat niet meer, en zonder deze weigering kon een admin via de
--    REST-API alsnog een persoonlijk token zetten dat de OAuth-koppeling
--    omzeilt. disconnect_accounting_connection wist voor Moneybird ook de
--    nieuwe geheime kolommen.
--
-- 6. get_moneybird_sync_targets() eiste is_connected = true, wat nooit werd
--    gezet (audit M35). Hij wordt vervangen door get_moneybird_sync_doelen(),
--    met het refresh-token erbij (ander retourtype, dus drop-and-create — de
--    rechten worden hieronder opnieuw en expliciet gezet).
--
-- 7. get_moneybird_koppeling(): status voor het scherm, zonder geheimen.


-- ── 1. accounting_connections ───────────────────────────────────────────────
alter table public.accounting_connections
  add column if not exists refresh_token        text,
  add column if not exists administratie_naam   text,
  add column if not exists webhook_id           text,
  add column if not exists webhook_secret       text,
  add column if not exists koppeling_fout       text,
  add column if not exists volledig_gesynct_op  timestamptz;

-- Niet-geheime kolommen mag de app lezen, net als administration_id.
grant select (administratie_naam, koppeling_fout, volledig_gesynct_op)
  on public.accounting_connections to authenticated;


-- ── 2. moneybird_oauth_states ───────────────────────────────────────────────
create table if not exists public.moneybird_oauth_states (
  state          text primary key,
  company_id     uuid not null references public.companies(id) on delete cascade,
  user_id        uuid not null,
  aangemaakt_op  timestamptz not null default now(),
  access_token   text,
  refresh_token  text,
  administraties jsonb
);
alter table public.moneybird_oauth_states enable row level security;
revoke all on table public.moneybird_oauth_states from public, anon, authenticated;
comment on table public.moneybird_oauth_states is
  'Lopende OAuth-koppelpogingen met Moneybird. Alleen service-rol. Rijen ouder dan 15 minuten zijn ongeldig.';


-- ── 3. Synchronisatiekolommen ───────────────────────────────────────────────
alter table public.customers
  add column if not exists moneybird_versie bigint,
  add column if not exists moneybird_hash   text;
alter table public.leveranciers
  add column if not exists moneybird_versie bigint,
  add column if not exists moneybird_hash   text;
alter table public.facturen
  add column if not exists moneybird_bijlage_gesynct boolean not null default false;
alter table public.job_costs
  add column if not exists moneybird_id              text,
  add column if not exists moneybird_bijlage_gesynct boolean not null default false;

-- Zelfde garanties als bij SnelStart: één BossBase-rij per Moneybird-record.
create unique index if not exists leveranciers_company_moneybird_uniek
  on public.leveranciers (company_id, moneybird_id) where moneybird_id is not null;
create unique index if not exists job_costs_company_moneybird_uniek
  on public.job_costs (company_id, moneybird_id) where moneybird_id is not null;

-- Na versturen staat een factuur op slot; de koppelvelden mogen wel blijven
-- veranderen. moneybird_bijlage_gesynct hoort daarbij, net als het SnelStart-
-- equivalent (de app zet hem terug op false als hij een nieuwe PDF wegschrijft).
create or replace function public.bb_factuur_verzonden_bevriezen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Wat na versturen nog mag veranderen: status (betaald/geboekt), betaling,
  -- crediteren, herinneringen en de koppelingen met Stripe en de boekhouding.
  v_vrij text[] := array['updated_at', 'status', 'betaald_op', 'gecrediteerd',
    'herinnering_1_verstuurd_at', 'herinnering_2_verstuurd_at',
    'stripe_payment_intent_id', 'stripe_checkout_session_id', 'stripe_payment_url',
    'stripe_payment_status', 'stripe_payment_token', 'stripe_checkout_aangemaakt_op',
    'moneybird_id', 'moneybird_payment_registered_at', 'moneybird_bijlage_gesynct',
    'snelstart_id', 'snelstart_bijlage_gesynct', 'externe_referentie'];
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'concept' or old.is_credit then
      raise exception 'Een verstuurde factuur of creditnota kun je niet verwijderen. Maak een creditnota om hem te corrigeren.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- Concept zonder regels kan niet op betaald.
  if old.status = 'concept' and new.status = 'betaald'
     and not exists (select 1 from factuur_regels where factuur_id = new.id) then
    raise exception 'Een factuur zonder regels kan niet op betaald.'
      using errcode = 'check_violation';
  end if;

  if old.status <> 'concept' then
    if new.status = 'concept' then
      raise exception 'Een verstuurde factuur kan niet terug naar concept.'
        using errcode = 'check_violation';
    end if;
    if (to_jsonb(new) - v_vrij) is distinct from (to_jsonb(old) - v_vrij) then
      raise exception 'Deze factuur is verstuurd en staat op slot. Corrigeer hem met een creditnota.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.bb_factuur_verzonden_bevriezen() from public, anon, authenticated;


-- ── 4. Oud persoonlijk token wissen ─────────────────────────────────────────
update public.accounting_connections
   set api_token = null, is_connected = false, updated_at = now()
 where provider = 'moneybird' and refresh_token is null;


-- ── 5. Opslaan en loskoppelen ───────────────────────────────────────────────
create or replace function public.save_accounting_connection(p_provider text, p_secret text DEFAULT NULL::text, p_administration_id text DEFAULT NULL::text, p_afas_environment_id text DEFAULT NULL::text)
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
  -- Moneybird koppelt via OAuth (edge function moneybird-oauth). Een token
  -- rechtstreeks opslaan zou die koppeling omzeilen.
  if p_provider = 'moneybird' then
    raise exception 'Moneybird koppel je met de knop "Koppel met Moneybird".';
  end if;
  if p_provider not in ('snelstart', 'afas') then
    raise exception 'Onbekende provider: %', p_provider;
  end if;

  insert into public.accounting_connections as ac
    (company_id, provider, api_token, client_key, afas_token,
     administration_id, afas_environment_id, is_connected, updated_at)
  values (
    v_company, p_provider,
    null,
    case when p_provider = 'snelstart' then v_secret end,
    case when p_provider = 'afas'      then v_secret end,
    p_administration_id, p_afas_environment_id,
    false, now()
  )
  on conflict (company_id, provider) do update set
    -- coalesce, niet case-else: geen secret meegegeven = niets wijzigen.
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

create or replace function public.disconnect_accounting_connection(p_provider text)
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
     set api_token      = case when p_provider = 'moneybird' then null else ac.api_token  end,
         refresh_token  = case when p_provider = 'moneybird' then null else ac.refresh_token end,
         webhook_id     = case when p_provider = 'moneybird' then null else ac.webhook_id end,
         webhook_secret = case when p_provider = 'moneybird' then null else ac.webhook_secret end,
         koppeling_fout = case when p_provider = 'moneybird' then null else ac.koppeling_fout end,
         client_key     = case when p_provider = 'snelstart' then null else ac.client_key end,
         afas_token     = case when p_provider = 'afas'      then null else ac.afas_token end,
         is_connected   = false,
         updated_at     = now()
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


-- ── 6. Doelen voor de nachtelijke run ───────────────────────────────────────
drop function if exists public.get_moneybird_sync_targets();

create function public.get_moneybird_sync_doelen()
returns table(company_id uuid, api_token text, refresh_token text, administration_id text)
language sql
stable
security definer
set search_path to 'public'
as $$
  -- Eerst wie het langst niet helemaal bij is: een grote eerste import van één
  -- bedrijf mag de rest niet elke nacht achteraan zetten.
  select ac.company_id, ac.api_token, ac.refresh_token, ac.administration_id
  from public.accounting_connections ac
  where ac.provider = 'moneybird'
    and ac.api_token is not null and ac.api_token <> ''
    and ac.administration_id is not null and ac.administration_id <> ''
  order by ac.volledig_gesynct_op nulls first, ac.last_synced_at nulls first
$$;

-- Geeft de tokens van álle bedrijven terug: alleen de service-rol.
revoke all on function public.get_moneybird_sync_doelen() from public, anon, authenticated;
grant execute on function public.get_moneybird_sync_doelen() to service_role;


-- ── 7. Status voor het scherm ───────────────────────────────────────────────
create function public.get_moneybird_koppeling()
returns table(
  gekoppeld boolean, administration_id text, administratie_naam text,
  koppeling_fout text, last_synced_at timestamptz, volledig_gesynct_op timestamptz,
  webhook_actief boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (ac.api_token is not null and ac.api_token <> ''),
    ac.administration_id,
    ac.administratie_naam,
    ac.koppeling_fout,
    ac.last_synced_at,
    ac.volledig_gesynct_op,
    (ac.webhook_id is not null)
  from public.accounting_connections ac
  where ac.provider = 'moneybird'
    and ac.company_id = (select company_id from public.profiles where id = auth.uid())
$$;

revoke all on function public.get_moneybird_koppeling() from public, anon, authenticated;
grant execute on function public.get_moneybird_koppeling() to authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
