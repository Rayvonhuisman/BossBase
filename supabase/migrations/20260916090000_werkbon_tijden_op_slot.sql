-- Ondertekende werkbon: ook de dagen en tijden op slot.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een ondertekende werkbon stond in de database alleen op slot voor uren,
-- taken en materiaal (bb_werkbon_op_slot). De geplande dagen en de tijden kon
-- je nog wél wijzigen: via het werkbonformulier, en straks door een blok in de
-- planning te verslepen. De klant heeft getekend voor een klus op een bepaald
-- moment; een correctie hoort, net als bij uren en materiaal, op een nieuwe
-- werkbon.
--
-- ── Wat er op slot gaat ─────────────────────────────────────────────────────
-- werkbon_dagen: een dag erbij, een dag weg, een andere datum, een andere tijd
-- van de dag, of een andere eigen tijd per persoon.
-- werkbonnen: starttijd, eindtijd en gepland_op (de startdatum; die schuift
-- de dagen mee).
--
-- Wat NIET op slot gaat: de ploeg. Een medewerker van de werkbon halen ruimt de
-- dagploeg en diens eigen tijd op via triggers (bb_werkbon_ploeg_opschonen,
-- bb_werkbon_dag_tijden). Dat was al toegestaan en blijft zo; daarom telt een
-- wijziging van medewerker_tijden alleen als hij direct is (pg_trigger_depth
-- = 1), niet als hij uit die opschoning komt.
--
-- Een ondertekende werkbon verwijderen blijft werken: bij de cascade is de
-- werkbon zelf al weg, dus de trigger vindt geen ondertekening.
--
-- De ondertekenfunctie (sign-werkbon) zet ondertekend_op, status en de
-- handtekening, geen tijden. Het slot kijkt naar de OUDE ondertekend_op, dus de
-- update waarin getekend wordt gaat altijd door.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Raakt geen data. Gemeten vóór deze migratie: 3 ondertekende werkbonnen, alle
-- drie met geplande dagen.

create or replace function public.bb_werkbon_dag_op_slot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ondertekend timestamptz;
begin
  select ondertekend_op into v_ondertekend
    from public.werkbonnen
   where id = case when tg_op = 'DELETE' then old.werkbon_id else new.werkbon_id end;

  if v_ondertekend is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- bb_werkbon_dagen_zetten slaat dagen op met insert … on conflict do update,
  -- en een BEFORE INSERT-trigger vuurt ook voor een rij die daarna op een
  -- bestaande dag botst. Elke keer opslaan van een ondertekende werkbon (een
  -- andere titel) liep daardoor vast. Een bestaande datum gaat hier dus door:
  -- is hij echt anders, dan komt hij als UPDATE langs en wordt hij daar
  -- tegengehouden. Alleen een écht nieuwe dag wordt hier geweigerd.
  if tg_op = 'INSERT' and exists (
    select 1 from public.werkbon_dagen d where d.werkbon_id = new.werkbon_id and d.datum = new.datum
  ) then
    return new;
  end if;

  -- Een wijziging die datum en tijden laat staan (de dagploeg, of de opschoning
  -- van eigen tijden als iemand van de ploeg af gaat) mag door.
  if tg_op = 'UPDATE'
     and new.werkbon_id = old.werkbon_id
     and new.datum = old.datum
     and new.starttijd is not distinct from old.starttijd
     and new.eindtijd is not distinct from old.eindtijd
     and (new.medewerker_tijden is not distinct from old.medewerker_tijden or pg_trigger_depth() > 1) then
    return new;
  end if;

  raise exception
    'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
    to_char(v_ondertekend, 'DD-MM-YYYY')
    using errcode = 'check_violation';
end;
$function$;

-- De naam sorteert vóór bb_werkbon_dag_ploeg en bb_werkbon_dag_tijden: het slot
-- kijkt naar wat er binnenkomt, vóórdat die triggers de rij bijwerken.
drop trigger if exists bb_werkbon_dag_op_slot on public.werkbon_dagen;
create trigger bb_werkbon_dag_op_slot
  before insert or update or delete on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dag_op_slot();

create or replace function public.bb_werkbon_tijden_op_slot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.ondertekend_op is not null
     and (new.starttijd is distinct from old.starttijd
          or new.eindtijd is distinct from old.eindtijd
          or new.gepland_op is distinct from old.gepland_op) then
    raise exception
      'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
      to_char(old.ondertekend_op, 'DD-MM-YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger if exists bb_werkbon_tijden_op_slot on public.werkbonnen;
create trigger bb_werkbon_tijden_op_slot
  before update of starttijd, eindtijd, gepland_op on public.werkbonnen
  for each row execute function public.bb_werkbon_tijden_op_slot();

-- Triggerfuncties hoeft niemand zelf aan te roepen. Zonder deze revoke staan ze
-- via de default privileges open voor anon en authenticated (zie CLAUDE.md).
revoke all on function public.bb_werkbon_dag_op_slot()    from public, anon, authenticated;
revoke all on function public.bb_werkbon_tijden_op_slot() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen.
select
  (select count(*) from pg_trigger
    where tgname in ('bb_werkbon_dag_op_slot', 'bb_werkbon_tijden_op_slot') and not tgisinternal) as triggers,
  (select string_agg(r.rolname || ':' || p.proname, ', ') from pg_proc p cross join pg_roles r
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('bb_werkbon_dag_op_slot', 'bb_werkbon_tijden_op_slot')
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as uitvoerbaar_door;
