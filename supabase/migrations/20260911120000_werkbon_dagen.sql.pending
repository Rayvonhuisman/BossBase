-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een werkbon had één datum (werkbonnen.gepland_op), terwijl een klus vaak
-- langer duurt: een aaneengesloten periode, of losse dagen (ma, wo, vr).
--
-- Gekozen is voor één tabel met de dagen zelf, niet voor een einddatum naast
-- de startdatum. Met alleen een einddatum kun je losse dagen niet opslaan, en
-- met allebei krijg je twee regels voor "op welke dagen staat deze klus" die
-- elke lezer (planning, agenda, dashboard, uren-herinnering) moet combineren.
-- Nu is er één regel: een werkbon staat op dag X als die dag hier staat. Een
-- periode invullen maakt gewoon een rij per dag aan.
--
-- starttijd/eindtijd op een dag zijn een AFWIJKING. Leeg = de tijden van de
-- werkbon zelf, die voor elke dag gelden.
--
-- werkbonnen.gepland_op blijft bestaan, als afgeleide startdatum: de vroegste
-- dag. Sorteren, lijsten, de PDF, de ondertekenfunctie en de demodata lezen
-- hem, en zo hoeven die niet mee te veranderen. Twee triggers houden de twee
-- kanten gelijk:
--   * dagen wijzigen → gepland_op wordt de vroegste dag;
--   * gepland_op rechtstreeks wijzigen (plekken in de app die maar één datum
--     kennen, zoals slepen op de planning) → een werkbon zonder dagen krijgt die
--     ene dag, een werkbon mét dagen schuift in zijn geheel mee.
--
-- Maximaal 60 dagen per werkbon. Dat voorkomt dat een typefout in een
-- einddatum (2027 i.p.v. 2026) honderden rijen en agenda-items oplevert. De app
-- meldt het al vóór het opslaan; de database is het vangnet.
--
-- Agenda: calendar_events had precies één item per werkbon (unieke index op
-- werkbon_id). Dat wordt één item per werkbon-DAG, via werkbon_dag_id. Het item
-- verdwijnt vanzelf met zijn dag (ON DELETE CASCADE).
--
-- Gemeten vóór het draaien (11-09-2026): 12 werkbonnen, waarvan 11 met een
-- gepland_op en 1 zonder (TEST SnelStart BV). Alle 11 krijgen precies één dag;
-- voor de gebruiker verandert er daarmee niets. 9 calendar_events hangen aan een
-- werkbon, elk aan een andere; die worden aan de ene dag van hun werkbon gekoppeld.
--
-- Openstaand, bewust niet in deze migratie: medewerkers per dag toewijzen.
-- assigned_to_ids van de werkbon geldt voor alle dagen.


-- ── De tabel ────────────────────────────────────────────────────────────────

create table public.werkbon_dagen (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  werkbon_id  uuid not null references public.werkbonnen(id) on delete cascade,
  datum       date not null,
  starttijd   time,
  eindtijd    time,
  created_at  timestamptz not null default now(),
  constraint werkbon_dagen_uniek unique (werkbon_id, datum)
);

-- De planning en de agenda vragen "wat staat er deze week", per bedrijf.
create index werkbon_dagen_company_datum on public.werkbon_dagen (company_id, datum);

alter table public.werkbon_dagen enable row level security;

-- Zien: wie de werkbon ziet. De subquery loopt zelf door de RLS van
-- werkbonnen, dus de leesregel van de werkbon geldt hier automatisch mee.
create policy werkbon_dagen_select on public.werkbon_dagen
  for select using (
    exists (select 1 from public.werkbonnen w where w.id = werkbon_dagen.werkbon_id)
  );

-- Wijzigen: wie de werkbon mag bewerken. Letterlijk dezelfde regel als
-- werkbonnen_update — de planning van een bon is een eigenschap van de bon.
create policy werkbon_dagen_insert on public.werkbon_dagen
  for insert with check (
    exists (
      select 1 from public.werkbonnen w
      where w.id = werkbon_dagen.werkbon_id
        and w.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
        and (public.bb_gedeelde_werkruimte()
             or public.bb_has_permission('planning')
             or public.bb_has_permission('werkbonnen_bewerken')
             or auth.uid() = any (w.verantwoordelijke_ids))
    )
  );

create policy werkbon_dagen_update on public.werkbon_dagen
  for update using (
    exists (
      select 1 from public.werkbonnen w
      where w.id = werkbon_dagen.werkbon_id
        and w.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
        and (public.bb_gedeelde_werkruimte()
             or public.bb_has_permission('planning')
             or public.bb_has_permission('werkbonnen_bewerken')
             or auth.uid() = any (w.verantwoordelijke_ids))
    )
  ) with check (
    exists (
      select 1 from public.werkbonnen w
      where w.id = werkbon_dagen.werkbon_id
        and w.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
        and (public.bb_gedeelde_werkruimte()
             or public.bb_has_permission('planning')
             or public.bb_has_permission('werkbonnen_bewerken')
             or auth.uid() = any (w.verantwoordelijke_ids))
    )
  );

create policy werkbon_dagen_delete on public.werkbon_dagen
  for delete using (
    exists (
      select 1 from public.werkbonnen w
      where w.id = werkbon_dagen.werkbon_id
        and w.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
        and (public.bb_gedeelde_werkruimte()
             or public.bb_has_permission('planning')
             or public.bb_has_permission('werkbonnen_bewerken')
             or auth.uid() = any (w.verantwoordelijke_ids))
    )
  );

-- Alleen-lezen-modus (verlopen abonnement), zelfde als op werkbonnen.
create policy readonly_werkbon_dagen on public.werkbon_dagen
  as restrictive for insert with check (public.bb_mag_schrijven());


-- ── Trigger: company_id volgt de werkbon ────────────────────────────────────
-- Niet aan de client overlaten: een dag hoort bij hetzelfde bedrijf als zijn
-- werkbon, punt.
create function public.bb_werkbon_dag_bedrijf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select w.company_id into new.company_id
    from public.werkbonnen w where w.id = new.werkbon_id;
  return new;
end;
$$;

revoke all on function public.bb_werkbon_dag_bedrijf() from public, anon, authenticated;

create trigger bb_werkbon_dag_bedrijf
  before insert or update of werkbon_id on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dag_bedrijf();


-- ── Trigger: maximaal 60 dagen, en gepland_op = vroegste dag ────────────────
-- Draait na elke wijziging van een dag. Wordt hij aangeroepen vanuit de
-- trigger hieronder (pg_trigger_depth() > 1), dan zet die trigger gepland_op
-- zelf al goed en slaan we de synchronisatie over — anders gaan de twee
-- elkaar halverwege een verschuiving tegenspreken. Dat geldt ook voor het
-- cascade-verwijderen bij het wissen van een werkbon.
create function public.bb_werkbon_dagen_na()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_werkbon uuid := coalesce(new.werkbon_id, old.werkbon_id);
  v_aantal  integer;
  v_eerste  date;
begin
  if tg_op <> 'DELETE' then
    select count(*) into v_aantal from public.werkbon_dagen where werkbon_id = v_werkbon;
    if v_aantal > 60 then
      raise exception 'Een werkbon kan maximaal 60 dagen hebben (nu %). Verdeel een langere klus over meerdere werkbonnen.', v_aantal
        using errcode = 'check_violation';
    end if;
  end if;

  if pg_trigger_depth() > 1 then
    return null;
  end if;

  select min(datum) into v_eerste from public.werkbon_dagen where werkbon_id = v_werkbon;
  update public.werkbonnen
     set gepland_op = v_eerste
   where id = v_werkbon
     and gepland_op is distinct from v_eerste;

  -- Dag verplaatst naar een andere werkbon (komt in de app niet voor, maar
  -- dan klopt de oude ook weer).
  if tg_op = 'UPDATE' and old.werkbon_id <> new.werkbon_id then
    select min(datum) into v_eerste from public.werkbon_dagen where werkbon_id = old.werkbon_id;
    update public.werkbonnen
       set gepland_op = v_eerste
     where id = old.werkbon_id
       and gepland_op is distinct from v_eerste;
  end if;

  return null;
end;
$$;

revoke all on function public.bb_werkbon_dagen_na() from public, anon, authenticated;

create trigger bb_werkbon_dagen_na
  after insert or update or delete on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dagen_na();


-- ── Bestaande werkbonnen: één dag per geplande werkbon ──────────────────────
insert into public.werkbon_dagen (werkbon_id, company_id, datum)
select w.id, w.company_id, w.gepland_op
  from public.werkbonnen w
 where w.gepland_op is not null;


-- ── Trigger: gepland_op rechtstreeks gewijzigd ──────────────────────────────
-- Vangnet voor elke plek die alleen gepland_op kent (slepen op de planning,
-- inplannen vanuit de agenda, snel aanmaken op de projectkaart, oude
-- scripts). Alleen als de wijziging van buiten komt: de update die de trigger
-- hierboven zelf doet, draait op diepte 2 en wordt overgeslagen.
--
--   gepland_op leeg      → de werkbon is niet meer ingepland: dagen weg.
--   nog geen dagen       → die ene dag aanmaken.
--   vroegste dag anders  → alle dagen schuiven mee met hetzelfde aantal dagen.
--
-- Het schuiven gaat rij voor rij, in de looprichting: bij vooruit schuiven
-- eerst de laatste dag. Anders botst "ma → di" op de dinsdag die er nog staat
-- (unieke index op werkbon_id + datum).
create function public.bb_werkbon_gepland_op_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eerste date;
  v_delta  integer;
  r        record;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.gepland_op is null then
    delete from public.werkbon_dagen where werkbon_id = new.id;
    return null;
  end if;

  select min(datum) into v_eerste from public.werkbon_dagen where werkbon_id = new.id;

  if v_eerste is null then
    insert into public.werkbon_dagen (werkbon_id, company_id, datum)
    values (new.id, new.company_id, new.gepland_op);
  elsif v_eerste <> new.gepland_op then
    v_delta := new.gepland_op - v_eerste;
    if v_delta > 0 then
      for r in select id from public.werkbon_dagen where werkbon_id = new.id order by datum desc loop
        update public.werkbon_dagen set datum = datum + v_delta where id = r.id;
      end loop;
    else
      for r in select id from public.werkbon_dagen where werkbon_id = new.id order by datum asc loop
        update public.werkbon_dagen set datum = datum + v_delta where id = r.id;
      end loop;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.bb_werkbon_gepland_op_sync() from public, anon, authenticated;

create trigger bb_werkbon_gepland_op_sync
  after insert or update of gepland_op on public.werkbonnen
  for each row execute function public.bb_werkbon_gepland_op_sync();


-- ── RPC: de dagen van een werkbon in één keer zetten ────────────────────────
-- De app stuurt de complete lijst; wat er niet in staat verdwijnt, wat erbij
-- komt wordt aangemaakt, en bij bestaande dagen worden alleen de tijden
-- bijgewerkt. Bestaande dagen houden zo hun id, en daarmee hun agenda-item.
--
-- SECURITY INVOKER: de RLS op werkbon_dagen bepaalt wie dit mag. Een lege lijst
-- betekent "niet ingepland".
--
-- p_dagen: [{ "datum": "2026-09-14", "starttijd": "08:00", "eindtijd": "16:30" }, …]
-- starttijd/eindtijd leeg of weggelaten = tijden van de werkbon.
create function public.bb_werkbon_dagen_zetten(p_werkbon_id uuid, p_dagen jsonb)
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

  insert into public.werkbon_dagen (werkbon_id, company_id, datum, starttijd, eindtijd)
  select distinct on ((d->>'datum')::date)
         p_werkbon_id,
         w.company_id,
         (d->>'datum')::date,
         nullif(d->>'starttijd', '')::time,
         nullif(d->>'eindtijd', '')::time
    from jsonb_array_elements(coalesce(p_dagen, '[]'::jsonb)) d
    cross join public.werkbonnen w
   where w.id = p_werkbon_id
  on conflict (werkbon_id, datum) do update
     set starttijd = excluded.starttijd,
         eindtijd  = excluded.eindtijd
   where (werkbon_dagen.starttijd, werkbon_dagen.eindtijd)
         is distinct from (excluded.starttijd, excluded.eindtijd);

  return query
    select * from public.werkbon_dagen where werkbon_id = p_werkbon_id order by datum;
end;
$$;

revoke all on function public.bb_werkbon_dagen_zetten(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bb_werkbon_dagen_zetten(uuid, jsonb) to authenticated;


-- ── Agenda: één item per werkbon-dag ────────────────────────────────────────
alter table public.calendar_events
  add column werkbon_dag_id uuid references public.werkbon_dagen(id) on delete cascade;

-- De oude regel "één item per werkbon" vervalt; de nieuwe is "één per dag".
drop index if exists public.idx_calendar_events_werkbon;
create unique index idx_calendar_events_werkbon_dag
  on public.calendar_events (werkbon_dag_id)
  where werkbon_dag_id is not null;
-- Opzoeken per werkbon blijft nodig (alle items van één bon bijwerken).
create index idx_calendar_events_werkbon_id
  on public.calendar_events (werkbon_id)
  where werkbon_id is not null;

-- Bestaande items: elke werkbon heeft op dit moment precies één dag en had
-- hooguit één item (de oude unieke index), dus dit koppelt één op één.
update public.calendar_events ce
   set werkbon_dag_id = d.id
  from public.werkbon_dagen d
 where d.werkbon_id = ce.werkbon_id
   and ce.werkbon_dag_id is null;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Zie _TEMPLATE.sql. Na het pushen: npm run migratie:check -- werkbon_dagen
notify pgrst, 'reload schema';
