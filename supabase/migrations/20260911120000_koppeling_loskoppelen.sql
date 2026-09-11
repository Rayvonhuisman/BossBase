-- Loskoppelen van een boekhoudkoppeling.
--
-- Waarom een eigen functie en niet save_accounting_connection met een lege
-- waarde: die doet sinds 20260902150000 bewust een coalesce op de geheime
-- kolommen. Geen secret meegeven betekent daar "niets wijzigen", en dat is er
-- met reden in gezet — een aanroep zonder secret wiste eerder de koppelsleutel
-- van een productiebedrijf. Loskoppelen moet dus expliciet zijn, niet een
-- bijwerking van opslaan.
--
-- Wat het WEL doet: de sleutel van dit bedrijf bij deze provider wissen.
-- Wat het NIET doet: de gesynchroniseerde gegevens weggooien. Facturen,
-- relaties en snelstart_id-verwijzingen blijven staan. Koppelt iemand later
-- opnieuw, dan sluit alles weer aan in plaats van dubbel te worden aangemaakt.
--
-- LET OP bij SnelStart: dit is onze kant. De koppelsleutel blijft geldig bij
-- SnelStart zelf tot de klant hem daar intrekt. De frontend zegt dat er ook bij.

create or replace function public.disconnect_accounting_connection(p_provider text)
returns table (
  provider            text,
  administration_id   text,
  afas_environment_id text,
  connected           boolean,
  last_synced_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
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

-- Rechten expliciet zetten: Supabase geeft EXECUTE op een NIEUWE functie
-- automatisch aan anon en authenticated, en `revoke from public` haalt die
-- rolgrants er niet af. Zie CLAUDE.md, "Een functie aanmaken".
revoke all on function public.disconnect_accounting_connection(text) from public, anon, authenticated;
grant execute on function public.disconnect_accounting_connection(text) to authenticated;

notify pgrst, 'reload schema';
