-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Op een dag gold één tijd voor de hele dagploeg. In de praktijk werkt de een
-- 's ochtends en de ander 's middags: 08:00–12:00 en 13:00–17:00 op dezelfde
-- dag. Dit maakt een eigen tijd per persoon per dag mogelijk.
--
-- Het model: werkbon_dagen.medewerker_tijden, een uitzondering op de standaard.
--   { "<profiel-id>": { "starttijd": "08:00", "eindtijd": "12:00" }, … }
-- Alleen wie afwijkt staat erin. De tijd van iemand op een dag is dus:
--   zijn eigen tijd op die dag → anders de tijd van die dag → anders de
--   standaardtijd van de werkbon.
-- NULL of leeg = iedereen de tijd van de dag, zoals nu. Bestaande dagen
-- veranderen daardoor niet.
--
-- Afdwinging (trigger bb_werkbon_dag_tijden):
--   * alleen iemand uit de dagploeg kan een eigen tijd hebben (de dagploeg is
--     medewerker_ids, of — als die leeg is — de ploeg van de werkbon);
--   * begin- en eindtijd allebei ingevuld, eind na begin;
--   * alleen met de planningsmodule, net als de rest van de meerdaagse planning.
-- Gaat iemand van de ploeg of de dagploeg af, dan verdwijnt zijn eigen tijd mee.
--
-- Agenda-items: waren er één per werkbon-dag (unieke index op werkbon_dag_id).
-- Met een tijd per persoon wordt dat één per persoon per dag, zodat ieder zijn
-- eigen tijd in zijn eigen agenda ziet. De unieke index gaat daarom over
-- (werkbon_dag_id, assigned_to), met NULLS NOT DISTINCT: een dag zonder
-- ploeg houdt precies één item zonder eigenaar.
--
-- Bestaande agenda-items: elke dag had er één, van de eerste uit de dagploeg.
-- Dat item blijft staan (met eventuele opmerkingen erop) en hoort voortaan bij
-- díé persoon. Voor de andere mensen in de dagploeg komt er een item bij, met de
-- tijd van de dag. Gemeten vóór het draaien (12-09-2026): 16 items aan een
-- werkbon-dag, nooit meer dan één per dag; hierdoor komen er 5 bij.


-- ── De kolom ────────────────────────────────────────────────────────────────
alter table public.werkbon_dagen add column medewerker_tijden jsonb;

comment on column public.werkbon_dagen.medewerker_tijden is
  'Eigen tijd per persoon op deze dag, alleen voor wie afwijkt: {"<profiel-id>": {"starttijd": "HH:MM", "eindtijd": "HH:MM"}}. NULL = iedereen de tijd van de dag.';


-- ── Trigger: eigen tijden controleren ───────────────────────────────────────
-- Draait na bb_werkbon_dag_bedrijf en bb_werkbon_dag_ploeg (triggers gaan op
-- alfabet), dus company_id en de dagploeg staan al goed.
--
-- Komt de wijziging van buiten (diepte 1: de app, de RPC), dan wordt een
-- ongeldige tijd geweigerd. Komt hij uit het opschonen na een ploegwijziging
-- (diepte > 1), dan vallen tijden van mensen die er niet meer bij horen stil
-- weg — dat moet ook lukken bij een bedrijf dat de module heeft opgezegd.
create function public.bb_werkbon_dag_tijden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ploeg uuid[];
  v_sleutel text;
  v_waarde jsonb;
  v_start time;
  v_eind time;
begin
  if new.medewerker_tijden is null or new.medewerker_tijden = '{}'::jsonb then
    new.medewerker_tijden := null;
    return new;
  end if;

  if jsonb_typeof(new.medewerker_tijden) <> 'object' then
    raise exception 'medewerker_tijden moet een object zijn' using errcode = 'check_violation';
  end if;

  v_ploeg := coalesce(
    new.medewerker_ids,
    (select w.assigned_to_ids from public.werkbonnen w where w.id = new.werkbon_id),
    '{}'::uuid[]);

  if pg_trigger_depth() > 1 then
    new.medewerker_tijden := (
      select jsonb_object_agg(e.key, e.value)
        from jsonb_each(new.medewerker_tijden) e
       where e.key ~* '^[0-9a-f-]{36}$' and e.key::uuid = any (v_ploeg)
    );
    return new;
  end if;

  if (tg_op = 'INSERT' or new.medewerker_tijden is distinct from old.medewerker_tijden)
     and not public.bb_has_feature(new.company_id, 'planning') then
    raise exception 'Een eigen tijd per persoon zit in de planningsmodule (Team, of als module bij Groei).'
      using errcode = 'check_violation';
  end if;

  for v_sleutel, v_waarde in select e.key, e.value from jsonb_each(new.medewerker_tijden) e loop
    if v_sleutel !~* '^[0-9a-f-]{36}$' or not (v_sleutel::uuid = any (v_ploeg)) then
      raise exception 'Een eigen tijd kan alleen voor iemand die die dag in de ploeg staat.'
        using errcode = 'check_violation';
    end if;
    begin
      v_start := nullif(v_waarde->>'starttijd', '')::time;
      v_eind  := nullif(v_waarde->>'eindtijd', '')::time;
    exception when others then
      raise exception 'Ongeldige tijd bij een eigen tijd per persoon.' using errcode = 'check_violation';
    end;
    if v_start is null or v_eind is null or v_eind <= v_start then
      raise exception 'Een eigen tijd per persoon heeft een begin- en eindtijd nodig, met het eind na het begin.'
        using errcode = 'check_violation';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.bb_werkbon_dag_tijden() from public, anon, authenticated;

create trigger bb_werkbon_dag_tijden
  before insert or update of medewerker_tijden, medewerker_ids, werkbon_id on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dag_tijden();


-- ── Opschonen bij een ploegwijziging: ook de eigen tijden ───────────────────
-- Zelfde functie als in 20260911181500, met de eigen tijden erbij. Zelfde
-- signatuur; de rechten worden hieronder opnieuw gezet.
create or replace function public.bb_werkbon_ploeg_opschonen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.werkbon_dagen d
     set medewerker_ids = coalesce(
           (select array_agg(x) from unnest(d.medewerker_ids) x where x = any (new.assigned_to_ids)),
           '{}'::uuid[])
   where d.werkbon_id = new.id
     and d.medewerker_ids is not null
     and not (d.medewerker_ids <@ new.assigned_to_ids);

  -- Eigen tijden van wie niet meer in de (dag)ploeg staat.
  update public.werkbon_dagen d
     set medewerker_tijden = (
           select jsonb_object_agg(e.key, e.value)
             from jsonb_each(d.medewerker_tijden) e
            where e.key::uuid = any (coalesce(d.medewerker_ids, new.assigned_to_ids)))
   where d.werkbon_id = new.id
     and d.medewerker_tijden is not null;
  return null;
end;
$$;

revoke all on function public.bb_werkbon_ploeg_opschonen() from public, anon, authenticated;


-- ── RPC: dagen zetten, nu met eigen tijden per persoon ──────────────────────
-- Zelfde signatuur als in 20260911181500. Een dag zonder "medewerker_tijden"
-- in de JSON krijgt NULL (iedereen de tijd van de dag), zodat een oudere
-- frontend blijft werken.
create or replace function public.bb_werkbon_dagen_zetten(p_werkbon_id uuid, p_dagen jsonb)
returns setof public.werkbon_dagen
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aantal integer;
begin
  if not exists (select 1 from public.werkbonnen where id = p_werkbon_id) then
    raise exception 'Werkbon niet gevonden' using errcode = 'no_data_found';
  end if;

  select count(distinct (d->>'datum')::date) into v_aantal
    from jsonb_array_elements(coalesce(p_dagen, '[]'::jsonb)) d;
  if v_aantal > 60 then
    raise exception 'Een werkbon kan maximaal 60 dagen hebben (nu %). Verdeel een langere klus over meerdere werkbonnen.', v_aantal
      using errcode = 'check_violation';
  end if;

  delete from public.werkbon_dagen
   where werkbon_id = p_werkbon_id
     and datum not in (
       select (d->>'datum')::date from jsonb_array_elements(coalesce(p_dagen, '[]'::jsonb)) d
     );

  insert into public.werkbon_dagen (werkbon_id, company_id, datum, starttijd, eindtijd, medewerker_ids, medewerker_tijden)
  select distinct on ((d->>'datum')::date)
         p_werkbon_id,
         w.company_id,
         (d->>'datum')::date,
         nullif(d->>'starttijd', '')::time,
         nullif(d->>'eindtijd', '')::time,
         case when jsonb_typeof(d->'medewerker_ids') = 'array'
              then array(select jsonb_array_elements_text(d->'medewerker_ids'))::uuid[]
         end,
         case when jsonb_typeof(d->'medewerker_tijden') = 'object' and d->'medewerker_tijden' <> '{}'::jsonb
              then d->'medewerker_tijden'
         end
    from jsonb_array_elements(coalesce(p_dagen, '[]'::jsonb)) d
    cross join public.werkbonnen w
   where w.id = p_werkbon_id
  on conflict (werkbon_id, datum) do update
     set starttijd         = excluded.starttijd,
         eindtijd          = excluded.eindtijd,
         medewerker_ids    = excluded.medewerker_ids,
         medewerker_tijden = excluded.medewerker_tijden
   where (werkbon_dagen.starttijd, werkbon_dagen.eindtijd, werkbon_dagen.medewerker_ids, werkbon_dagen.medewerker_tijden)
         is distinct from (excluded.starttijd, excluded.eindtijd, excluded.medewerker_ids, excluded.medewerker_tijden);

  return query
    select * from public.werkbon_dagen where werkbon_id = p_werkbon_id order by datum;
end;
$$;

revoke all on function public.bb_werkbon_dagen_zetten(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bb_werkbon_dagen_zetten(uuid, jsonb) to authenticated;


-- ── Agenda: één item per persoon per dag ────────────────────────────────────
drop index if exists public.idx_calendar_events_werkbon_dag;
create unique index idx_calendar_events_werkbon_dag_persoon
  on public.calendar_events (werkbon_dag_id, assigned_to) nulls not distinct
  where werkbon_dag_id is not null;

-- Bestaande dagen: het item dat er al was hoort bij de persoon die erop staat;
-- voor de rest van de dagploeg komt er een bij, met de tijd van de dag (eigen
-- tijden bestaan nog niet). Nederlandse wandkloktijd, zoals de app ook schrijft.
insert into public.calendar_events
  (company_id, title, customer_id, notes, assigned_to, start_at, end_at, werkbon_id, werkbon_dag_id, herkomst)
select w.company_id,
       coalesce(nullif(w.titel, ''), 'Werkbon'),
       w.customer_id,
       nullif(w.omschrijving, ''),
       p.pid,
       (d.datum + coalesce(d.starttijd, w.starttijd)) at time zone 'Europe/Amsterdam',
       case when coalesce(d.eindtijd, w.eindtijd) is not null
            then (d.datum + coalesce(d.eindtijd, w.eindtijd)) at time zone 'Europe/Amsterdam'
            else ((d.datum + coalesce(d.starttijd, w.starttijd)) at time zone 'Europe/Amsterdam') + interval '1 hour'
       end,
       w.id,
       d.id,
       'planning'
  from public.werkbon_dagen d
  join public.werkbonnen w on w.id = d.werkbon_id
  cross join lateral unnest(coalesce(d.medewerker_ids, w.assigned_to_ids)) p(pid)
 where coalesce(d.starttijd, w.starttijd) is not null
   and not exists (
     select 1 from public.calendar_events ce
      where ce.werkbon_dag_id = d.id and ce.assigned_to is not distinct from p.pid
   );


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Zie _TEMPLATE.sql. Na het pushen: npm run migratie:check -- werkbon_dagen
notify pgrst, 'reload schema';
