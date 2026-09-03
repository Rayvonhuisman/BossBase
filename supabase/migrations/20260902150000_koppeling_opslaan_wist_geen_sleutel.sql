-- save_accounting_connection wiste de sleutel bij elke aanroep zonder secret.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De RPC schreef de drie geheime kolommen zo:
--
--     client_key = case when p_provider = 'snelstart' then p_secret else ac.client_key end
--
-- Wordt p_secret niet meegegeven, dan is dat `client_key = null` — de sleutel is
-- weg. `administration_id` deed het al goed met coalesce; de drie kolommen die
-- er écht toe doen niet.
--
-- Dat is niet theoretisch. Bij het controleren van deze RPC is op 02-09 de
-- SnelStart-koppelsleutel van een productiebedrijf hierdoor gewist, en die is
-- nergens meer terug te halen — we bewaren hem bewust niet in logs of backups
-- buiten de tabel. Voor een klant is dezelfde route open: sla je bij Moneybird
-- alleen een administratie-ID op, dan gaat het api_token eraf.
--
-- Nu voor alle drie: alleen overschrijven als er daadwerkelijk iets is
-- meegegeven. Een lege tekenreeks telt óók als "niets" — een leeggelaten
-- invoerveld hoort een bestaande koppeling niet te slopen.
--
-- Wat dit NIET meer kan: een sleutel wissen via deze RPC. Er is geen enkele
-- flow die dat doet (Stripe en Google hebben hun eigen ontkoppel-RPC's, en de
-- boekhoudkoppelingen kennen geen ontkoppelknop). Komt die knop er, dan hoort
-- daar een eigen functie bij die het expliciet doet — niet een lege parameter
-- die per ongeluk hetzelfde bereikt.

create or replace function public.save_accounting_connection(
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
  v_secret  text := nullif(btrim(coalesce(p_secret, '')), '');
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
$$;

-- Het retourtype wijzigt niet, dus create or replace houdt de bestaande grants.
-- Toch expliciet, want dat is de afspraak — zie CLAUDE.md.
revoke all on function public.save_accounting_connection(text, text, text, text) from public, anon;
grant execute on function public.save_accounting_connection(text, text, text, text) to authenticated, service_role;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
