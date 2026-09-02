-- Restwerk van de SnelStart-verbouwing opruimen.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Er zijn de afgelopen weken drie dingen vervallen die in de database zijn
-- blijven staan. Dat is niet onschuldig: een kolom die er nog is maar niemand
-- leest, leest de volgende die hier komt als "dit doet iets", en een ongebruikte
-- SECURITY DEFINER-functie is aanvalsoppervlak dat je gratis weggeeft.
--
--   1. accounting_connections.import_costs en .sync_paid_only — de twee
--      schakelaars die op 2026-08-28 zijn vervangen door vast gedrag (kosten
--      gaan altijd mee, alle facturen behalve concepten worden geboekt). Sinds
--      die dag leest geen enkele codepad ze nog.
--   2. reset_snelstart_koppeling() — hing onder de knop "Koppeling opnieuw
--      opbouwen". Die knop is weggehaald omdat er zonder opruimen aan de
--      SnelStart-kant dubbele boekingen van kwamen; snelstart-administratie-check
--      doet het herstel nu zelf. De functie is sindsdien onbereikbaar via de UI,
--      maar wél nog uitvoerbaar door elke ingelogde admin via de REST-API.
--
-- Gemeten vóór het draaien: 4 koppelingen, 0 met import_costs uit, 0 met
-- sync_paid_only aan. Er gaat dus geen enkele werkende instelling verloren.
--
-- ── VOLGORDE ────────────────────────────────────────────────────────────────
-- Deze migratie MOET ná de bijbehorende frontend-release. De drie RPC's geven
-- de twee velden nu nog terug en de servicelaag las ze tot deze release; draai
-- je dit eerder, dan valt het opslaan van een koppeling om.

-- ── 1. De drie RPC's zonder de vervallen velden ─────────────────────────────
-- Het retourtype wijzigt, dus drop-and-create; CREATE OR REPLACE weigert dat.

drop function if exists public.get_accounting_status();

create function public.get_accounting_status()
returns table(
  provider text, administration_id text, afas_environment_id text,
  connected boolean, last_synced_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
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
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = (select company_id from public.profiles where id = auth.uid());
$$;

revoke all on function public.get_accounting_status() from public;
grant execute on function public.get_accounting_status() to authenticated, service_role;


drop function if exists public.save_accounting_connection(text, text, text, text);

create function public.save_accounting_connection(
  p_provider text,
  p_secret text default null,
  p_administration_id text default null,
  p_afas_environment_id text default null
)
returns table(
  provider text, administration_id text, afas_environment_id text,
  connected boolean, last_synced_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
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
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = v_company and ac.provider = p_provider;
end;
$$;

revoke all on function public.save_accounting_connection(text, text, text, text) from public;
grant execute on function public.save_accounting_connection(text, text, text, text) to authenticated, service_role;


-- Cron-doelen. Geeft de koppelsleutel van ÁLLE bedrijven terug en is daarom
-- uitsluitend voor service_role — die grant blijft precies zoals hij was.
drop function if exists public.get_snelstart_sync_targets();

create function public.get_snelstart_sync_targets()
returns table(company_id uuid, client_key text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select ac.company_id, ac.client_key
  from public.accounting_connections ac
  where ac.provider = 'snelstart'
    and ac.client_key is not null
    and ac.client_key <> ''
$$;

-- LET OP — dit is geen formaliteit. Supabase heeft default privileges staan die
-- EXECUTE op een NIEUWE functie automatisch aan anon en authenticated geven.
-- `revoke ... from public` haalt die expliciete rolgrants er NIET af. Zonder de
-- regel hieronder zou deze functie, die de koppelsleutel van álle bedrijven
-- teruggeeft, na deze migratie voor elke ingelogde gebruiker aanroepbaar zijn.
-- Een droogloop op de acceptatie liet precies dat zien.
revoke all on function public.get_snelstart_sync_targets() from public, anon, authenticated;
grant execute on function public.get_snelstart_sync_targets() to service_role;


-- ── 2. De vervallen kolommen ────────────────────────────────────────────────
alter table public.accounting_connections
  drop column if exists import_costs,
  drop column if exists sync_paid_only;


-- ── 3. De weesfunctie ───────────────────────────────────────────────────────
-- Onbereikbaar via de UI sinds de knop weg is, maar nog wél aanroepbaar door
-- elke admin via de REST-API — en hij wist in één klap alle snelstart_id's van
-- een bedrijf. Weg ermee.
drop function if exists public.reset_snelstart_koppeling();


-- ── 4. Overbodige rechten van `anon` op de boekhoudtabellen ─────────────────
-- Supabase kent standaard alle tabelrechten toe aan anon en authenticated, met
-- RLS als beschermlaag. Voor SELECT/INSERT/UPDATE/DELETE werkt dat: gemeten met
-- een anon-sessie filtert RLS alles weg.
--
-- TRUNCATE is de uitzondering — dáár kijkt RLS niet naar. In een teruggedraaide
-- transactie kon de anon-rol `truncate accounting_connections cascade` gewoon
-- uitvoeren, en dat wist de boekhoudkoppeling van élk bedrijf. Er is op dit
-- moment geen route waarlangs een buitenstaander dat kan aanroepen (PostgREST
-- biedt geen TRUNCATE), maar het is een recht dat niemand nodig heeft.
--
-- Alleen deze vier tabellen: geen enkele publieke pagina schrijft erin. Elders
-- ligt dat anders — de ondertekenpagina van een offerte schrijft als anon een
-- regel in klant_tijdlijn — dus dit is bewust géén schemabrede revoke.
revoke insert, update, delete, truncate on
    public.accounting_connections,
    public.grootboek_voorkeuren,
    public.import_genegeerd,
    public.accounting_sync_runs
  from anon;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Vaste afsluiting van elke migratie; zie CLAUDE.md, "Database en migraties".
-- Hier onmisbaar: er verdwijnen kolommen én functies uit de API.
notify pgrst, 'reload schema';
