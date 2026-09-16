-- Planning verzetten vraagt het planning-recht — ook buiten de app om.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- In de planning kun je blokken verslepen en rekken. Dat hoort bij het
-- planning-recht: een medewerker die op een werkbon staat mag zijn eigen tijd
-- niet verzetten, ook niet als hij verantwoordelijke van die werkbon is.
--
-- De app schermt dat af, maar de database deed dat niet: de policies op
-- werkbon_dagen en werkbonnen laten wijzigen toe aan planning OF
-- werkbonnen_bewerken OF de verantwoordelijke. Met een directe API-aanroep kon
-- een medewerker zijn dag dus alsnog verschuiven. Een policy aanpassen zou ook
-- het aanmaken en de dagploeg raken; deze trigger kijkt alleen naar wat hier
-- telt: de datum en de tijden.
--
-- ── Wat er precies onder valt ───────────────────────────────────────────────
-- werkbon_dagen: datum, starttijd, eindtijd en de eigen tijden per persoon van
-- een BESTAANDE dag. Een werkbon voor het eerst inplannen (insert) en de
-- dagploeg wijzigen blijven zoals ze waren — dat is geen verzetten, en kantoor
-- moet een nieuwe werkbon kunnen inplannen.
-- werkbonnen: starttijd, eindtijd en gepland_op.
--
-- Twee uitzonderingen, allebei bewust:
--   * Gedeelde werkruimte (ZZP of duo): daar is geen aparte planner en doet
--     iedereen alles. Zelfde uitzondering als in de bestaande policies.
--   * Geen ingelogde gebruiker (auth.uid() is null): dat is de service-key —
--     edge functions, migraties en onderhoud. Die hebben geen rechtenrol.
--
-- Wijzigingen die uit een ANDERE trigger komen (pg_trigger_depth > 1) gaan
-- door: bb_werkbon_gepland_op_sync schuift de dagen mee met gepland_op, en
-- bb_werkbon_dag_tijden ruimt de eigen tijd op van wie van de ploeg af gaat.
-- De wijziging die dat veroorzaakte is zelf al getoetst.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Raakt geen data; alleen nieuwe wijzigingen worden getoetst.

create or replace function public.bb_planning_recht_vereist()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is null
      or public.bb_gedeelde_werkruimte()
      or public.bb_has_permission('planning');
$function$;

create or replace function public.bb_werkbon_dag_planning_recht()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if (new.datum, new.starttijd, new.eindtijd, new.medewerker_tijden)
     is distinct from (old.datum, old.starttijd, old.eindtijd, old.medewerker_tijden)
     and not public.bb_planning_recht_vereist() then
    raise exception 'Een geplande dag of tijd verzetten vraagt het planning-recht.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

drop trigger if exists bb_werkbon_dag_planning_recht on public.werkbon_dagen;
create trigger bb_werkbon_dag_planning_recht
  before update of datum, starttijd, eindtijd, medewerker_tijden on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dag_planning_recht();

create or replace function public.bb_werkbon_tijden_planning_recht()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if (new.starttijd, new.eindtijd, new.gepland_op)
     is distinct from (old.starttijd, old.eindtijd, old.gepland_op)
     and not public.bb_planning_recht_vereist() then
    raise exception 'De tijd of de datum van een werkbon verzetten vraagt het planning-recht.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

drop trigger if exists bb_werkbon_tijden_planning_recht on public.werkbonnen;
create trigger bb_werkbon_tijden_planning_recht
  before update of starttijd, eindtijd, gepland_op on public.werkbonnen
  for each row execute function public.bb_werkbon_tijden_planning_recht();

-- Triggerfuncties hoeft niemand zelf aan te roepen; zonder deze revoke staan ze
-- via de default privileges open voor anon en authenticated (zie CLAUDE.md).
revoke all on function public.bb_planning_recht_vereist()          from public, anon, authenticated;
revoke all on function public.bb_werkbon_dag_planning_recht()      from public, anon, authenticated;
revoke all on function public.bb_werkbon_tijden_planning_recht()   from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen.
select
  (select count(*) from pg_trigger
    where tgname in ('bb_werkbon_dag_planning_recht', 'bb_werkbon_tijden_planning_recht')
      and not tgisinternal) as triggers,
  (select string_agg(r.rolname || ':' || p.proname, ', ') from pg_proc p cross join pg_roles r
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('bb_planning_recht_vereist', 'bb_werkbon_dag_planning_recht', 'bb_werkbon_tijden_planning_recht')
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as uitvoerbaar_door;
