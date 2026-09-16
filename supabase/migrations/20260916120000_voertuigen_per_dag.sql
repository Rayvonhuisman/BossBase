-- Voertuigen inplannen zoals medewerkers: per werkbon, per dag, met eigen
-- tijden, en mensen aan een voertuig koppelen.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een werkbon had één voertuig (werkbonnen.voertuig_id), voor de hele klus.
-- In de praktijk gaan er meerdere bussen mee, verschilt dat per dag, en rijdt
-- een bus soms alleen 's middags. En de medewerker wil weten in welke bus hij
-- zit. Dit brengt de voertuigen op hetzelfde model als de ploeg
-- (20260911181500 werkbon_dag_medewerkers, 20260912093000 werkbon_dag_tijden):
--
--   werkbonnen.voertuig_ids         de voertuigen van de werkbon
--   werkbon_dagen.voertuig_ids      NULL = alle voertuigen van de werkbon,
--                                   een lijst = een deel, '{}' = geen
--   werkbon_dagen.voertuig_tijden   eigen tijd per voertuig, alleen afwijkers:
--                                   {"<voertuig-id>": {"starttijd", "eindtijd"}}
--   werkbon_dagen.medewerker_voertuig
--                                   wie in welk voertuig zit op die dag:
--                                   {"<profiel-id>": "<voertuig-id>"}. Eén
--                                   voertuig per persoon per dag; wie er niet in
--                                   staat, heeft geen voertuig. Niet verplicht.
--   voertuigen.zitplaatsen          NULL = geen limiet; inclusief de bestuurder
--
-- De tijd van een voertuig op een dag: zijn eigen tijd → de tijd van de dag →
-- de tijd van de werkbon. Precies zoals bij een persoon.
--
-- ── Wat de database afdwingt ────────────────────────────────────────────────
-- Alleen bij een NIEUWE koppeling (iemand die nog niet, of in een ander
-- voertuig zat):
--   * de tijd van de persoon valt binnen de tijd van het voertuig;
--   * op geen moment binnen de tijd van die persoon zitten er meer mensen in
--     het voertuig dan er plekken zijn.
-- Tijden zijn van begin tot eind, zonder het eindpunt: 10:00–12:00 en
-- 12:00–17:00 overlappen niet.
--
-- Bestaande koppelingen worden NIET opnieuw getoetst. Verandert later de tijd
-- van iemand of van de bus, of gaan de zitplaatsen omlaag, dan gaat dat door;
-- de app toont dan een waarschuwing. Blokkeren zou elke tijdswijziging (ook
-- slepen in de planning) laten vastlopen op een koppeling waar de gebruiker
-- op dat moment niet naar kijkt.
--
-- Verder, zoals bij de ploeg:
--   * voertuigen toevoegen vereist bb_has_feature('voertuigen') — in aparte
--     trg_…_feature-triggers, zodat de noodrem ze los kan uitzetten;
--   * alleen voertuigen van het eigen bedrijf, en een dag alleen voertuigen
--     die ook op de werkbon staan;
--   * gaat een voertuig van de werkbon of van de dag, of gaat iemand van de
--     (dag)ploeg, dan verdwijnen de eigen tijd en de koppeling mee;
--   * een voertuig verwijderen haalt het van alle werkbonnen af;
--   * de eigen tijd van een voertuig valt onder het slot van een ondertekende
--     werkbon en onder het planning-recht (20260916090000, 20260916091000),
--     net als de eigen tijd van een persoon. Voertuigen en koppelingen niet —
--     de ploeg valt daar ook niet onder.
--
-- ── bb_werkbon_dagen_zetten ─────────────────────────────────────────────────
-- Neemt de drie nieuwe velden mee. Een dag in de JSON ZONDER zo'n sleutel
-- houdt wat er stond. Dat is nodig: de planning verzet blokken via dezelfde
-- functie en stuurt geen voertuigen mee; zonder deze regel zou elke keer
-- slepen de voertuigen van die dag wissen. Voor de bestaande velden verandert
-- niets (zonder medewerker_ids = de hele ploeg, zoals altijd).
--
-- De functie werkte met insert … on conflict do update. Een BEFORE INSERT-
-- trigger vuurt dan ook voor een dag die al bestaat, met de nieuwe waarden
-- alsof alles nieuw is — de koppelcontrole zou dan elke bestaande koppeling
-- opnieuw toetsen. Daarom nu: bestaande dag → update (alleen als er iets
-- verandert), nieuwe dag → insert.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Raakt geen data. Alle nieuwe kolommen beginnen leeg. werkbonnen.voertuig_id
-- (148 rijen, waarvan 142 van het testbedrijf, gemeten 16-09-2026) blijft
-- staan tot de app het niet meer gebruikt; een volgende migratie haalt hem weg.


-- ── Kolommen ────────────────────────────────────────────────────────────────
alter table public.voertuigen
  add column zitplaatsen integer
    constraint voertuigen_zitplaatsen_check check (zitplaatsen is null or zitplaatsen between 1 and 99);
comment on column public.voertuigen.zitplaatsen is
  'Aantal plekken, inclusief de bestuurder. NULL = geen limiet.';

alter table public.werkbonnen
  add column voertuig_ids uuid[] not null default '{}';
comment on column public.werkbonnen.voertuig_ids is
  'De voertuigen van de werkbon. Per dag een deel ervan via werkbon_dagen.voertuig_ids.';

alter table public.werkbon_dagen
  add column voertuig_ids uuid[],
  add column voertuig_tijden jsonb,
  add column medewerker_voertuig jsonb;
comment on column public.werkbon_dagen.voertuig_ids is
  'Voertuigen op deze dag. NULL = alle voertuigen van de werkbon; een lijst = een deel; leeg = geen.';
comment on column public.werkbon_dagen.voertuig_tijden is
  'Eigen tijd per voertuig op deze dag, alleen voor afwijkers: {"<voertuig-id>": {"starttijd": "HH:MM", "eindtijd": "HH:MM"}}.';
comment on column public.werkbon_dagen.medewerker_voertuig is
  'Wie in welk voertuig zit op deze dag: {"<profiel-id>": "<voertuig-id>"}. Niet iedereen hoeft erin te staan.';


-- ── Hulpfunctie: te vol op enig moment? ─────────────────────────────────────
-- Krijgt de tijden van iedereen in één voertuig (p_start[i]–p_eind[i]) en geeft
-- het eerste aaneengesloten stuk terug waarin er meer dan p_plekken tegelijk in
-- zitten én dat overlapt met p_van–p_tot (de tijd van de nieuwe persoon).
-- Geen rij = past. Tijden zonder eindpunt: 12:00 eind en 12:00 begin tellen
-- niet samen. Dezelfde rekenregel staat in src/utils/voertuigDagen.js.
create function public.bb_voertuig_te_vol(
  p_start time[], p_eind time[], p_plekken integer, p_van time, p_tot time
)
returns table (van time, tot time, aantal integer)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_punten time[];
  v_a time;
  v_b time;
  v_n integer;
begin
  select array_agg(distinct t order by t) into v_punten
    from unnest(coalesce(p_start, '{}') || coalesce(p_eind, '{}')) t
   where t is not null;
  if p_plekken is null or coalesce(array_length(v_punten, 1), 0) < 2 then
    return;
  end if;

  for i in 1 .. array_length(v_punten, 1) - 1 loop
    v_a := v_punten[i];
    v_b := v_punten[i + 1];
    select count(*) into v_n
      from generate_subscripts(p_start, 1) k
     where p_start[k] <= v_a and v_a < p_eind[k];
    if v_n > p_plekken and v_a < p_tot and v_b > p_van then
      if van is null then
        van := v_a;
        aantal := v_n;
      end if;
      aantal := greatest(aantal, v_n);
      tot := v_b;
    elsif van is not null then
      exit;
    end if;
  end loop;

  if van is not null then
    return next;
  end if;
end;
$$;

revoke all on function public.bb_voertuig_te_vol(time[], time[], integer, time, time) from public, anon, authenticated;


-- ── Trigger: voertuigen van de werkbon ──────────────────────────────────────
create function public.bb_werkbon_voertuigen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Zonder dubbelen en lege waarden, in de volgorde waarin ze gekozen zijn.
  new.voertuig_ids := array(
    select x from unnest(coalesce(new.voertuig_ids, '{}'::uuid[])) with ordinality u(x, n)
     where x is not null group by x order by min(n)
  );

  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if exists (
       select 1 from unnest(new.voertuig_ids) x
        where not exists (select 1 from public.voertuigen v where v.id = x and v.company_id = new.company_id)) then
    raise exception 'Dit voertuig hoort niet bij dit bedrijf.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.bb_werkbon_voertuigen() from public, anon, authenticated;

create trigger bb_werkbon_voertuigen
  before insert or update of voertuig_ids, company_id on public.werkbonnen
  for each row execute function public.bb_werkbon_voertuigen();


-- ── Trigger: voertuigen, eigen tijden en koppelingen op een dag ─────────────
-- Draait na bb_werkbon_dag_bedrijf, _op_slot, _planning_recht, _ploeg en
-- _tijden (triggers gaan op alfabet), dus company_id, de dagploeg en de eigen
-- tijden per persoon staan al goed.
create function public.bb_werkbon_dag_voertuigen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_extern boolean := pg_trigger_depth() = 1;
  v_w record;
  v_ploeg uuid[];
  v_voertuigen uuid[];
  v_sleutel text;
  v_waarde jsonb;
  v_start time;
  v_eind time;
  v_pid uuid;
  v_vid uuid;
  v_p_start time;
  v_p_eind time;
  v_v_start time;
  v_v_eind time;
  v_naam text;
  v_voertuig text;
  v_plekken integer;
  v_starts time[];
  v_einden time[];
  v_vol record;
begin
  select w.assigned_to_ids, w.voertuig_ids, w.starttijd, w.eindtijd into v_w
    from public.werkbonnen w where w.id = new.werkbon_id;

  -- Leeg is hetzelfde als niets.
  if new.voertuig_tijden is not null
     and (jsonb_typeof(new.voertuig_tijden) = 'null' or new.voertuig_tijden = '{}'::jsonb) then
    new.voertuig_tijden := null;
  end if;
  if new.medewerker_voertuig is not null
     and (jsonb_typeof(new.medewerker_voertuig) = 'null' or new.medewerker_voertuig = '{}'::jsonb) then
    new.medewerker_voertuig := null;
  end if;
  if new.voertuig_tijden is not null and jsonb_typeof(new.voertuig_tijden) <> 'object' then
    raise exception 'voertuig_tijden moet een object zijn' using errcode = 'check_violation';
  end if;
  if new.medewerker_voertuig is not null and jsonb_typeof(new.medewerker_voertuig) <> 'object' then
    raise exception 'medewerker_voertuig moet een object zijn' using errcode = 'check_violation';
  end if;
  if new.voertuig_ids is not null then
    new.voertuig_ids := array(
      select x from unnest(new.voertuig_ids) with ordinality u(x, n)
       where x is not null group by x order by min(n)
    );
  end if;

  -- Een dag heeft alleen voertuigen van de werkbon.
  if new.voertuig_ids is not null
     and not (new.voertuig_ids <@ coalesce(v_w.voertuig_ids, '{}'::uuid[])) then
    if v_extern then
      raise exception 'Een voertuig op een dag moet ook op de werkbon staan.'
        using errcode = 'check_violation';
    end if;
    new.voertuig_ids := array(
      select x from unnest(new.voertuig_ids) x where x = any (coalesce(v_w.voertuig_ids, '{}'::uuid[]))
    );
  end if;

  v_ploeg := coalesce(new.medewerker_ids, v_w.assigned_to_ids, '{}'::uuid[]);
  v_voertuigen := coalesce(new.voertuig_ids, v_w.voertuig_ids, '{}'::uuid[]);

  -- Eigen tijden: wat niet (meer) op de dag staat valt weg; de rest moet kloppen.
  if new.voertuig_tijden is not null then
    new.voertuig_tijden := (
      select jsonb_object_agg(e.key, e.value)
        from jsonb_each(new.voertuig_tijden) e
       where e.key ~* c_uuid and e.key::uuid = any (v_voertuigen)
    );
    for v_sleutel, v_waarde in select e.key, e.value from jsonb_each(coalesce(new.voertuig_tijden, '{}'::jsonb)) e loop
      begin
        v_start := nullif(v_waarde->>'starttijd', '')::time;
        v_eind  := nullif(v_waarde->>'eindtijd', '')::time;
      exception when others then
        raise exception 'Ongeldige tijd bij een eigen tijd per voertuig.' using errcode = 'check_violation';
      end;
      if v_start is null or v_eind is null or v_eind <= v_start then
        raise exception 'Een eigen tijd per voertuig heeft een begin- en eindtijd nodig, met het eind na het begin.'
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  -- Koppelingen: alleen iemand uit de dagploeg, in een voertuig van die dag.
  if new.medewerker_voertuig is not null then
    new.medewerker_voertuig := (
      select jsonb_object_agg(e.key, e.value)
        from jsonb_each(new.medewerker_voertuig) e
       where e.key ~* c_uuid
         and jsonb_typeof(e.value) = 'string'
         and (e.value #>> '{}') ~* c_uuid
         and e.key::uuid = any (v_ploeg)
         and (e.value #>> '{}')::uuid = any (v_voertuigen)
    );
  end if;

  if not v_extern or new.medewerker_voertuig is null then
    return new;
  end if;

  -- Nieuwe koppelingen toetsen: binnen de tijd van het voertuig, en plek vrij.
  for v_sleutel, v_waarde in select e.key, e.value from jsonb_each(new.medewerker_voertuig) e loop
    v_pid := v_sleutel::uuid;
    v_vid := (v_waarde #>> '{}')::uuid;
    if tg_op = 'UPDATE'
       and (old.medewerker_voertuig ->> v_sleutel) is not null
       and (old.medewerker_voertuig ->> v_sleutel) ~* c_uuid
       and (old.medewerker_voertuig ->> v_sleutel)::uuid = v_vid then
      continue;
    end if;

    v_p_start := coalesce(nullif(new.medewerker_tijden -> v_sleutel ->> 'starttijd', '')::time, new.starttijd, v_w.starttijd);
    v_p_eind  := coalesce(nullif(new.medewerker_tijden -> v_sleutel ->> 'eindtijd', '')::time, new.eindtijd, v_w.eindtijd);
    v_v_start := coalesce(nullif(new.voertuig_tijden -> (v_vid::text) ->> 'starttijd', '')::time, new.starttijd, v_w.starttijd);
    v_v_eind  := coalesce(nullif(new.voertuig_tijden -> (v_vid::text) ->> 'eindtijd', '')::time, new.eindtijd, v_w.eindtijd);
    -- Een dag zonder tijd valt nergens binnen of buiten; niets te toetsen.
    if v_p_start is null or v_p_eind is null or v_v_start is null or v_v_eind is null then
      continue;
    end if;

    select v.naam, v.zitplaatsen into v_voertuig, v_plekken from public.voertuigen v where v.id = v_vid;

    if v_p_start < v_v_start or v_p_eind > v_v_eind then
      select p.full_name into v_naam from public.profiles p where p.id = v_pid;
      raise exception '% werkt %–%, % staat %–%.',
        coalesce(nullif(v_naam, ''), 'Deze medewerker'), left(v_p_start::text, 5), left(v_p_eind::text, 5),
        coalesce(v_voertuig, 'het voertuig'), left(v_v_start::text, 5), left(v_v_eind::text, 5)
        using errcode = 'check_violation';
    end if;

    if v_plekken is not null then
      select array_agg(q.s), array_agg(q.e) into v_starts, v_einden
        from (
          select coalesce(nullif(new.medewerker_tijden -> e.key ->> 'starttijd', '')::time, new.starttijd, v_w.starttijd) as s,
                 coalesce(nullif(new.medewerker_tijden -> e.key ->> 'eindtijd', '')::time, new.eindtijd, v_w.eindtijd) as e
            from jsonb_each(new.medewerker_voertuig) e
           where (e.value #>> '{}')::uuid = v_vid
        ) q
       where q.s is not null and q.e is not null;
      select * into v_vol from public.bb_voertuig_te_vol(v_starts, v_einden, v_plekken, v_p_start, v_p_eind);
      if v_vol.van is not null then
        raise exception '% heeft % %, tussen % en % zitten er % in.',
          coalesce(v_voertuig, 'Het voertuig'), v_plekken, case when v_plekken = 1 then 'plek' else 'plekken' end,
          left(v_vol.van::text, 5), left(v_vol.tot::text, 5), v_vol.aantal
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.bb_werkbon_dag_voertuigen() from public, anon, authenticated;

create trigger bb_werkbon_dag_voertuigen
  before insert or update of voertuig_ids, voertuig_tijden, medewerker_voertuig,
                             medewerker_ids, medewerker_tijden, starttijd, eindtijd, werkbon_id
  on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dag_voertuigen();


-- ── Abonnement: aparte triggers ─────────────────────────────────────────────
-- Los van de controles hierboven, met de naam trg_…_feature zoals de andere
-- abonnements-gates. Zo kan de noodrem (supabase/rollback/disable_plan_gates.sql)
-- alleen het abonnement uitzetten en blijven de koppel- en zitplaatsregels staan.
-- Ze draaien na de bb_…-triggers (alfabet), dus ze vergelijken opgeschoonde
-- waarden. Alleen van buiten (diepte 1): opschonen moet ook lukken als de
-- module is opgezegd. Dit blok is los opnieuw te draaien.
create or replace function public.bb_werkbon_voertuigen_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  -- Alleen toevoegen wordt tegengehouden. Weghalen mag altijd.
  if exists (
       select 1 from unnest(coalesce(new.voertuig_ids, '{}'::uuid[])) x
        where tg_op = 'INSERT' or not (x = any (coalesce(old.voertuig_ids, '{}'::uuid[]))))
     and not public.bb_has_feature(new.company_id, 'voertuigen') then
    raise exception 'Voertuigen horen niet bij dit abonnement'
      using errcode = 'check_violation', hint = 'feature:voertuigen';
  end if;
  return new;
end;
$$;

create or replace function public.bb_werkbon_dag_voertuigen_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or public.bb_has_feature(new.company_id, 'voertuigen') then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.voertuig_ids is not null or new.voertuig_tijden is not null or new.medewerker_voertuig is not null))
     or (tg_op = 'UPDATE' and (new.voertuig_ids, new.voertuig_tijden, new.medewerker_voertuig)
                              is distinct from (old.voertuig_ids, old.voertuig_tijden, old.medewerker_voertuig)) then
    raise exception 'Voertuigen horen niet bij dit abonnement'
      using errcode = 'check_violation', hint = 'feature:voertuigen';
  end if;
  return new;
end;
$$;

revoke all on function public.bb_werkbon_voertuigen_feature() from public, anon, authenticated;
revoke all on function public.bb_werkbon_dag_voertuigen_feature() from public, anon, authenticated;

drop trigger if exists trg_werkbon_voertuigen_feature on public.werkbonnen;
create trigger trg_werkbon_voertuigen_feature
  before insert or update of voertuig_ids on public.werkbonnen
  for each row execute function public.bb_werkbon_voertuigen_feature();

drop trigger if exists trg_werkbon_dag_voertuigen_feature on public.werkbon_dagen;
create trigger trg_werkbon_dag_voertuigen_feature
  before insert or update of voertuig_ids, voertuig_tijden, medewerker_voertuig on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dag_voertuigen_feature();


-- ── Trigger: opschonen na een wijziging van de werkbon ──────────────────────
-- Gaat er een voertuig of een persoon van de werkbon af, dan de dagen langs:
-- bb_werkbon_dag_voertuigen haalt er (op diepte 2) uit wat niet meer klopt.
-- Draait na bb_werkbon_ploeg_opschonen (alfabet), dus de dagploeg is al bij.
create function public.bb_werkbon_voertuigen_opschonen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.werkbon_dagen d
     set voertuig_ids = d.voertuig_ids
   where d.werkbon_id = new.id
     and (d.voertuig_ids is not null or d.voertuig_tijden is not null or d.medewerker_voertuig is not null);
  return null;
end;
$$;

revoke all on function public.bb_werkbon_voertuigen_opschonen() from public, anon, authenticated;

create trigger bb_werkbon_voertuigen_opschonen
  after update of voertuig_ids, assigned_to_ids on public.werkbonnen
  for each row
  when (old.voertuig_ids is distinct from new.voertuig_ids
        or old.assigned_to_ids is distinct from new.assigned_to_ids)
  execute function public.bb_werkbon_voertuigen_opschonen();


-- ── Trigger: een voertuig verwijderen ───────────────────────────────────────
-- Haalt het van elke werkbon af; de dagen volgen via de trigger hierboven.
create function public.bb_voertuig_verwijderd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.werkbonnen w
     set voertuig_ids = array_remove(w.voertuig_ids, old.id)
   where w.company_id = old.company_id
     and old.id = any (w.voertuig_ids);
  return old;
end;
$$;

revoke all on function public.bb_voertuig_verwijderd() from public, anon, authenticated;

create trigger bb_voertuig_verwijderd
  before delete on public.voertuigen
  for each row execute function public.bb_voertuig_verwijderd();


-- ── Slot en planning-recht: ook de eigen tijd van een voertuig ──────────────
-- Zelfde functies als in 20260916090000 en 20260916091000, met voertuig_tijden
-- erbij waar medewerker_tijden stond.
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

  if tg_op = 'INSERT' and exists (
    select 1 from public.werkbon_dagen d where d.werkbon_id = new.werkbon_id and d.datum = new.datum
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.werkbon_id = old.werkbon_id
     and new.datum = old.datum
     and new.starttijd is not distinct from old.starttijd
     and new.eindtijd is not distinct from old.eindtijd
     and ((new.medewerker_tijden is not distinct from old.medewerker_tijden
           and new.voertuig_tijden is not distinct from old.voertuig_tijden)
          or pg_trigger_depth() > 1) then
    return new;
  end if;

  raise exception
    'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
    to_char(v_ondertekend, 'DD-MM-YYYY')
    using errcode = 'check_violation';
end;
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

  if (new.datum, new.starttijd, new.eindtijd, new.medewerker_tijden, new.voertuig_tijden)
     is distinct from (old.datum, old.starttijd, old.eindtijd, old.medewerker_tijden, old.voertuig_tijden)
     and not public.bb_planning_recht_vereist() then
    raise exception 'Een geplande dag of tijd verzetten vraagt het planning-recht.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

drop trigger if exists bb_werkbon_dag_planning_recht on public.werkbon_dagen;
create trigger bb_werkbon_dag_planning_recht
  before update of datum, starttijd, eindtijd, medewerker_tijden, voertuig_tijden on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dag_planning_recht();

revoke all on function public.bb_werkbon_dag_op_slot() from public, anon, authenticated;
revoke all on function public.bb_werkbon_dag_planning_recht() from public, anon, authenticated;


-- ── RPC: dagen zetten, nu met voertuigen ────────────────────────────────────
-- Zelfde signatuur en retourtype, dus create or replace houdt de rechten; ze
-- worden hieronder toch opnieuw gezet.
--
-- p_dagen: [{ "datum", "starttijd", "eindtijd", "medewerker_ids", "medewerker_tijden",
--             "voertuig_ids"?, "voertuig_tijden"?, "medewerker_voertuig"? }, …]
-- Ontbreekt een voertuigsleutel, dan blijft de bestaande waarde staan.
create or replace function public.bb_werkbon_dagen_zetten(p_werkbon_id uuid, p_dagen jsonb)
returns setof public.werkbon_dagen
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aantal integer;
  v_company uuid;
  v_dag jsonb;
  v_datum date;
  v_bestaand public.werkbon_dagen%rowtype;
  v_starttijd time;
  v_eindtijd time;
  v_medewerker_ids uuid[];
  v_medewerker_tijden jsonb;
  v_voertuig_ids uuid[];
  v_voertuig_tijden jsonb;
  v_medewerker_voertuig jsonb;
begin
  select company_id into v_company from public.werkbonnen where id = p_werkbon_id;
  if not found then
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

  for v_dag in
    select distinct on ((d->>'datum')::date) d
      from jsonb_array_elements(coalesce(p_dagen, '[]'::jsonb)) d
  loop
    v_datum := (v_dag->>'datum')::date;
    v_starttijd := nullif(v_dag->>'starttijd', '')::time;
    v_eindtijd := nullif(v_dag->>'eindtijd', '')::time;
    v_medewerker_ids := case when jsonb_typeof(v_dag->'medewerker_ids') = 'array'
                             then array(select jsonb_array_elements_text(v_dag->'medewerker_ids'))::uuid[] end;
    v_medewerker_tijden := case when jsonb_typeof(v_dag->'medewerker_tijden') = 'object' and v_dag->'medewerker_tijden' <> '{}'::jsonb
                                then v_dag->'medewerker_tijden' end;
    v_voertuig_ids := case when jsonb_typeof(v_dag->'voertuig_ids') = 'array'
                           then array(select jsonb_array_elements_text(v_dag->'voertuig_ids'))::uuid[] end;
    v_voertuig_tijden := case when jsonb_typeof(v_dag->'voertuig_tijden') = 'object' and v_dag->'voertuig_tijden' <> '{}'::jsonb
                              then v_dag->'voertuig_tijden' end;
    v_medewerker_voertuig := case when jsonb_typeof(v_dag->'medewerker_voertuig') = 'object' and v_dag->'medewerker_voertuig' <> '{}'::jsonb
                                  then v_dag->'medewerker_voertuig' end;

    select * into v_bestaand from public.werkbon_dagen where werkbon_id = p_werkbon_id and datum = v_datum;
    if found then
      if not (v_dag ? 'voertuig_ids') then v_voertuig_ids := v_bestaand.voertuig_ids; end if;
      if not (v_dag ? 'voertuig_tijden') then v_voertuig_tijden := v_bestaand.voertuig_tijden; end if;
      if not (v_dag ? 'medewerker_voertuig') then v_medewerker_voertuig := v_bestaand.medewerker_voertuig; end if;

      if (v_bestaand.starttijd, v_bestaand.eindtijd, v_bestaand.medewerker_ids, v_bestaand.medewerker_tijden,
          v_bestaand.voertuig_ids, v_bestaand.voertuig_tijden, v_bestaand.medewerker_voertuig)
         is distinct from
         (v_starttijd, v_eindtijd, v_medewerker_ids, v_medewerker_tijden,
          v_voertuig_ids, v_voertuig_tijden, v_medewerker_voertuig) then
        update public.werkbon_dagen
           set starttijd = v_starttijd,
               eindtijd = v_eindtijd,
               medewerker_ids = v_medewerker_ids,
               medewerker_tijden = v_medewerker_tijden,
               voertuig_ids = v_voertuig_ids,
               voertuig_tijden = v_voertuig_tijden,
               medewerker_voertuig = v_medewerker_voertuig
         where id = v_bestaand.id;
      end if;
    else
      insert into public.werkbon_dagen (werkbon_id, company_id, datum, starttijd, eindtijd,
                                        medewerker_ids, medewerker_tijden,
                                        voertuig_ids, voertuig_tijden, medewerker_voertuig)
      values (p_werkbon_id, v_company, v_datum, v_starttijd, v_eindtijd,
              v_medewerker_ids, v_medewerker_tijden,
              v_voertuig_ids, v_voertuig_tijden, v_medewerker_voertuig);
    end if;
  end loop;

  return query
    select * from public.werkbon_dagen where werkbon_id = p_werkbon_id order by datum;
end;
$$;

revoke all on function public.bb_werkbon_dagen_zetten(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bb_werkbon_dagen_zetten(uuid, jsonb) to authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Zie _TEMPLATE.sql. Na het pushen:
--   npm run migratie:check -- werkbon_dagen werkbonnen voertuigen
notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (('voertuigen', 'zitplaatsen'), ('werkbonnen', 'voertuig_ids'),
                                        ('werkbon_dagen', 'voertuig_ids'), ('werkbon_dagen', 'voertuig_tijden'),
                                        ('werkbon_dagen', 'medewerker_voertuig'))) as kolommen,
  (select count(*) from pg_trigger
    where not tgisinternal
      and tgname in ('bb_werkbon_voertuigen', 'bb_werkbon_dag_voertuigen', 'bb_werkbon_voertuigen_opschonen',
                     'bb_voertuig_verwijderd', 'bb_werkbon_dag_planning_recht',
                     'trg_werkbon_voertuigen_feature', 'trg_werkbon_dag_voertuigen_feature')) as triggers,
  (select string_agg(r.rolname || ':' || p.proname, ', ') from pg_proc p cross join pg_roles r
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('bb_voertuig_te_vol', 'bb_werkbon_voertuigen', 'bb_werkbon_dag_voertuigen',
                        'bb_werkbon_voertuigen_opschonen', 'bb_voertuig_verwijderd',
                        'bb_werkbon_dag_op_slot', 'bb_werkbon_dag_planning_recht',
                        'bb_werkbon_voertuigen_feature', 'bb_werkbon_dag_voertuigen_feature')
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as uitvoerbaar_door_clients,
  (select string_agg(r.rolname, ', ') from pg_proc p cross join pg_roles r
    where p.pronamespace = 'public'::regnamespace and p.proname = 'bb_werkbon_dagen_zetten'
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as dagen_zetten_door;
