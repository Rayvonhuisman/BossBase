-- "Koppeling opnieuw opbouwen" zette de bijlagevlag van facturen niet terug.
--
-- reset_snelstart_koppeling() wist snelstart_id bij klanten, leveranciers,
-- facturen en kosten, en zet job_costs.snelstart_bijlage_gesynct terug. Die
-- laatste regel is er destijds bewust bij gezet; facturen.snelstart_bijlage_
-- gesynct bestond toen nog niet. Gevolg: na een reset dacht de sync dat de PDF
-- van elke factuur al verstuurd was en sloeg hij hem over — de boekingen kwamen
-- opnieuw in SnelStart, maar zonder brondocument.
--
-- Alles op false, niet alleen de facturen waar nu een PDF van bestaat. Een
-- boeking zonder document is een echt gemis, en de nastuurlus meldt precies
-- welke facturen dat zijn. Stilzwijgend op "klaar" zetten zou dat verbergen.

create or replace function public.reset_snelstart_koppeling()
returns table(klanten integer, leveranciers integer, facturen integer, kosten integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Ook de bijlagevlag terug, zodat de factuur-PDF opnieuw wordt meegestuurd.
  update public.facturen
     set snelstart_id = null,
         snelstart_bijlage_gesynct = false
   where company_id = v_company
     and (snelstart_id is not null or snelstart_bijlage_gesynct);
  get diagnostics n_fact = row_count;

  -- Idem voor kosten: een bon die ooit verstuurd is moet na een reset opnieuw
  -- mee. Kosten zonder bon blijven op true, die hebben niets na te sturen.
  update public.job_costs
     set snelstart_id = null,
         snelstart_bijlage_gesynct = (bijlage_url is null)
   where company_id = v_company and snelstart_id is not null;
  get diagnostics n_kost = row_count;

  return query select n_klant, n_lev, n_fact, n_kost;
end;
$function$;

comment on function public.reset_snelstart_koppeling() is
  'Wist alle SnelStart-verwijzingen van het eigen bedrijf zodat er opnieuw geboekt kan worden, inclusief de bijlagevlaggen van facturen en kosten.';
