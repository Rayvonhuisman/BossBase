-- Kostregel van werkbonmateriaal: in de database bijhouden, en afschermen voor
-- wie de inkoopprijs niet mag zien.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Elk materiaal op een werkbon heeft een spiegelregel in job_costs. Sinds
-- migratie 20260914120000 is het bedrag daarvan aantal x inkoopprijs. Iedereen
-- met het recht 'kosten' las dat bedrag, en met het aantal van de werkbon
-- erbij reken je de inkoopprijs terug — precies wat werkbon_materiaal_inkoop
-- met eigen RLS afschermt.
--
-- Afschermen kan alleen per rij: RLS verbergt geen kolom. De spiegelregels zijn
-- dus onzichtbaar voor wie bb_mag_inkoopprijs_zien() niet heeft. Voor de
-- Kosten-pagina is dat precies goed: die toont de boekhouding, en werkbon-
-- materiaal wordt niet geboekt.
--
-- ── Waarom de database de spiegelregel nu zelf bijhoudt ────────────────────
-- Tot nu toe schreef de browser de spiegelregel, en rekende hij het bedrag uit
-- met de inkoopprijs die híj kon zien. Voor wie het recht niet heeft is dat
-- null. Drie gevolgen, alle drie al mogelijk vóór deze migratie:
--
--   1. Een monteur die het aantal aanpaste, zette de kost terug op de
--      VERKOOPprijs: de browser zag geen inkoop en viel terug.
--   2. Materiaal uit de bibliotheek, toegevoegd door iemand zonder het recht,
--      kreeg geen inkoopprijs mee — de browser kreeg die nooit binnen.
--   3. Met de spiegelregels afgeschermd kan zo iemand ze niet eens meer
--      vinden om bij te werken.
--
-- Een trigger rekent met de echte inkoopprijs, ongeacht wie er klikt.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Gemeten vóór deze migratie: 9 materiaalregels, 9 spiegelregels, en alle
-- bedragen al gelijk aan aantal x (inkoop, anders verkoop). De herberekening
-- onderaan zou dus niets mogen veranderen; de afsluitende select laat zien of
-- dat zo is. Geen van de 9 komt uit de bibliotheek, dus punt 2 heeft nog niets
-- gekost.


-- ── 1. Btw op de materiaalregel zelf ────────────────────────────────────────
-- Het btw-percentage stond alleen op de spiegelregel, en de werkbon las het
-- daar via een join. Voor wie de spiegelregel niet meer ziet zou elk materiaal
-- dan op 21% staan. Het hoort bij het materiaal, dus het gaat daarheen.
alter table public.werkbon_materialen
  add column if not exists btw_percentage numeric not null default 21;

update public.werkbon_materialen m
   set btw_percentage = j.btw_percentage
  from public.job_costs j
 where j.werkbon_materiaal_id = m.id
   and j.btw_percentage is distinct from m.btw_percentage;


-- ── 2. Inkoopprijs uit de bibliotheek meenemen bij aanmaken ─────────────────
-- Zelfde functie als hiervoor, met de bibliotheekprijs erbij. Dezelfde
-- signatuur, dus create or replace houdt de bestaande rechten.
create or replace function public.wm_inkoop_aanmaken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into werkbon_materiaal_inkoop (werkbon_materiaal_id, company_id, inkoopprijs_per)
  values (
    new.id,
    new.company_id,
    (select mi.inkoopprijs from materiaal_inkoop mi
      where mi.materiaal_id = new.materiaal_id and mi.company_id = new.company_id)
  )
  on conflict (werkbon_materiaal_id) do nothing;
  return new;
end;
$function$;


-- ── 3. De spiegelregel bijhouden ────────────────────────────────────────────
-- Bedrag = aantal x inkoopprijs, en de verkoopprijs als de inkoop onbekend is.
-- Terugvallen en niet op nul: nul laat de kost stil verdwijnen en blaast de
-- marge op; terugvallen maakt hem te laag, en de kostentab meldt hoeveel regels
-- dat betreft. Komt het bedrag op nul (vrij materiaal, nog niet geprijsd), dan
-- is er geen kostregel — die komt vanzelf zodra er een prijs is.
create or replace function public.wm_spiegel_kost(p_materiaal_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m         werkbon_materialen%rowtype;
  v_inkoop  numeric;
  v_bedrag  numeric;
  v_project uuid;
  v_klant   uuid;
begin
  select * into m from werkbon_materialen where id = p_materiaal_id;
  -- Materiaal weg: de foreign key (on delete cascade) ruimt de kost al op.
  if not found then return; end if;

  select inkoopprijs_per into v_inkoop
    from werkbon_materiaal_inkoop where werkbon_materiaal_id = p_materiaal_id;

  v_bedrag := round(coalesce(m.aantal, 0) * coalesce(v_inkoop, m.prijs_per, 0), 2);

  if v_bedrag <= 0 then
    delete from job_costs where werkbon_materiaal_id = p_materiaal_id;
    return;
  end if;

  update job_costs
     set amount         = v_bedrag,
         description    = 'Materiaal: ' || m.naam,
         btw_percentage = m.btw_percentage,
         leverancier_id = m.leverancier_id
   where werkbon_materiaal_id = p_materiaal_id;

  if not found then
    select project_id, customer_id into v_project, v_klant
      from werkbonnen where id = m.werkbon_id;

    insert into job_costs (
      company_id, werkbon_id, werkbon_materiaal_id, project_id, customer_id,
      description, amount, btw_percentage, btw_inclusief, category, cost_date, leverancier_id
    ) values (
      m.company_id, m.werkbon_id, m.id, v_project, v_klant,
      'Materiaal: ' || m.naam, v_bedrag, m.btw_percentage, false, 'Materiaal', current_date, m.leverancier_id
    );
  end if;
end;
$function$;

create or replace function public.wm_spiegel_na_materiaal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform wm_spiegel_kost(new.id);
  return null;
end;
$function$;

create or replace function public.wm_spiegel_na_inkoop()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform wm_spiegel_kost(new.werkbon_materiaal_id);
  return null;
end;
$function$;

-- Na de insert van het materiaal maakt wm_inkoop_bij_insert de prijsrij aan,
-- en die vuurt de inkoop-trigger. Welke van de twee het eerst loopt maakt niet
-- uit: beide rekenen het bedrag volledig opnieuw uit.
drop trigger if exists wm_spiegel_kost_materiaal on public.werkbon_materialen;
create trigger wm_spiegel_kost_materiaal
  after insert or update of naam, aantal, prijs_per, btw_percentage, leverancier_id
  on public.werkbon_materialen
  for each row execute function public.wm_spiegel_na_materiaal();

drop trigger if exists wm_spiegel_kost_inkoop on public.werkbon_materiaal_inkoop;
create trigger wm_spiegel_kost_inkoop
  after insert or update of inkoopprijs_per
  on public.werkbon_materiaal_inkoop
  for each row execute function public.wm_spiegel_na_inkoop();

-- Niemand hoeft deze functies zelf aan te roepen; de triggers draaien ze als
-- eigenaar. Zonder deze revoke zou elke ingelogde gebruiker wm_spiegel_kost via
-- de API kunnen aanroepen (default privileges, zie CLAUDE.md).
revoke all on function public.wm_spiegel_kost(uuid)       from public, anon, authenticated;
revoke all on function public.wm_spiegel_na_materiaal()   from public, anon, authenticated;
revoke all on function public.wm_spiegel_na_inkoop()      from public, anon, authenticated;


-- ── 4. Afschermen ───────────────────────────────────────────────────────────
-- Restrictief, dus bovenop de bestaande policies: wie de spiegelregel mocht
-- zien, moet nu óók de inkoopprijs mogen zien.
drop policy if exists werkbonmateriaal_kost_alleen_met_inkoop on public.job_costs;
create policy werkbonmateriaal_kost_alleen_met_inkoop on public.job_costs
  as restrictive for select to authenticated
  using (werkbon_materiaal_id is null or bb_mag_inkoopprijs_zien());

-- De browser maakt geen spiegelregels meer aan; dat doet de trigger. Een
-- browser die het tóch probeert (een open tabblad met de oude versie van de
-- app) zou een dubbele regel maken. Die insert wordt hier geweigerd; de oude
-- code vangt de fout al stil af.
drop policy if exists werkbonmateriaal_kost_alleen_via_trigger on public.job_costs;
create policy werkbonmateriaal_kost_alleen_via_trigger on public.job_costs
  as restrictive for insert to authenticated
  with check (werkbon_materiaal_id is null);


-- ── 5. Bestaande spiegelregels één keer gelijktrekken ───────────────────────
select public.wm_spiegel_kost(id) from public.werkbon_materialen;


notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen.
select
  (select count(*) from public.werkbon_materialen)                                   as materiaalregels,
  (select count(*) from public.job_costs where werkbon_materiaal_id is not null)       as spiegelregels,
  (select count(*) from public.werkbon_materialen m
     left join public.werkbon_materiaal_inkoop i on i.werkbon_materiaal_id = m.id
     left join public.job_costs j on j.werkbon_materiaal_id = m.id
    where round(m.aantal * coalesce(i.inkoopprijs_per, m.prijs_per), 2) > 0
      and j.amount is distinct from round(m.aantal * coalesce(i.inkoopprijs_per, m.prijs_per), 2)) as afwijkend,
  (select string_agg(r.rolname, ',') from pg_roles r
    where r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, 'public.wm_spiegel_kost(uuid)', 'EXECUTE')) as spiegel_uitvoerbaar_door;
