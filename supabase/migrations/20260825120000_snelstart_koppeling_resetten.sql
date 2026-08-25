-- "Koppeling opnieuw opbouwen" voor SnelStart.
--
-- Aanleiding: de snelstart_id's die we terugschrijven zijn de enige rem op
-- dubbel boeken. Wordt de koppelsleutel ingetrokken of wijst hij naar een
-- ándere administratie, dan verwijzen al die id's naar niets — en omdat de
-- export ze als "al gesynchroniseerd" ziet, wordt alles stilzwijgend
-- overgeslagen. Precies wat er gebeurde toen er in SnelStart was opgeruimd:
-- de sync meldde overal 0 en er was geen andere uitweg dan met de hand SQL
-- draaien.
--
-- Deze functie zet alle koppelingen terug, zodat een volgende sync opnieuw
-- boekt. Bewust een RPC en geen losse updates vanuit de client: het raakt vier
-- tabellen en moet in één transactie, met een admin-controle erop.

create or replace function public.reset_snelstart_koppeling()
returns table(klanten integer, leveranciers integer, facturen integer, kosten integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_role    text;
  n_klant   integer;
  n_lev     integer;
  n_fact    integer;
  n_kost    integer;
begin
  select p.company_id, p.role into v_company, v_role
  from public.profiles p where p.id = auth.uid();

  if v_company is null then
    raise exception 'Geen bedrijf gevonden';
  end if;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen admins kunnen de koppeling opnieuw opbouwen';
  end if;

  update public.customers set snelstart_id = null
   where company_id = v_company and snelstart_id is not null;
  get diagnostics n_klant = row_count;

  update public.leveranciers set snelstart_id = null
   where company_id = v_company and snelstart_id is not null;
  get diagnostics n_lev = row_count;

  update public.facturen set snelstart_id = null
   where company_id = v_company and snelstart_id is not null;
  get diagnostics n_fact = row_count;

  -- Ook de bijlagevlag terug: anders zou een opnieuw geboekte kost zijn bon
  -- niet meesturen omdat die ooit al eens verstuurd was.
  update public.job_costs
     set snelstart_id = null,
         snelstart_bijlage_gesynct = (bijlage_url is null)
   where company_id = v_company and snelstart_id is not null;
  get diagnostics n_kost = row_count;

  return query select n_klant, n_lev, n_fact, n_kost;
end;
$$;

comment on function public.reset_snelstart_koppeling() is
  'Wist alle snelstart_id-verwijzingen van het eigen bedrijf, zodat een volgende sync opnieuw boekt. Voor na het intrekken van een sleutel of het wisselen van administratie. Alleen admins.';

revoke all on function public.reset_snelstart_koppeling() from public, anon;
grant execute on function public.reset_snelstart_koppeling() to authenticated;
