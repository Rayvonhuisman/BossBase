-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een meerdaagse werkbon zette iedereen van de ploeg op élke dag. In de praktijk
-- werkt niet iedereen elke dag mee, en de uren-herinnering vroeg daardoor ook
-- iedereen om een werkdag voor dagen waarop hij er niet was.
--
-- Het model: werkbon_dagen.medewerker_ids.
--   NULL      = de hele ploeg van de werkbon (assigned_to_ids). Dit is de
--               standaard; alle bestaande dagen staan zo en veranderen dus niet.
--   een lijst = de dagploeg: wie er díé dag werkt. Altijd een deel van de ploeg.
--   '{}'      = niemand die dag (iedereen weggetikt).
--
-- Waarom NULL als standaard en niet de lijst altijd invullen: komt er later
-- iemand bij de ploeg, dan werkt die vanzelf mee op elke dag zonder afwijking.
-- Alleen de uitzonderingen kosten een klik — bij een klus van acht dagen tik je
-- weg wie er niet is, in plaats van acht keer iedereen aan te vinken.
--
-- Afdwinging:
--   * een dagploeg zetten vereist de planningsmodule, net als meerdere dagen
--     (20260911160000);
--   * een dagploeg valt binnen de ploeg van de werkbon;
--   * gaat iemand van de ploeg af, dan verdwijnt hij ook uit de dagploegen.
--
-- Bewust NIET in deze migratie: een beschikbaarheidscheck ("staat al ergens
-- anders"). Verlof en afwezigheid bestaan nog niet, dus zo'n check kent maar de
-- helft van de waarheid en stuurt mensen verkeerd. Die komt pas als verlof en
-- afwezigheid er zijn.
--
-- Raakt geen bestaande data: de kolom komt erbij als NULL voor elke dag.


-- ── De kolom ────────────────────────────────────────────────────────────────
alter table public.werkbon_dagen add column medewerker_ids uuid[];

comment on column public.werkbon_dagen.medewerker_ids is
  'Dagploeg. NULL = de hele ploeg van de werkbon (assigned_to_ids); een lijst = wie er die dag werkt; leeg = niemand.';


-- ── Trigger: dagploeg controleren ───────────────────────────────────────────
-- Draait na bb_werkbon_dag_bedrijf (triggers gaan op alfabet), dus company_id
-- staat al goed. De modulecontrole alleen bij een wijziging die van buiten komt
-- (diepte 1): het opschonen hieronder, na het wijzigen van de ploeg, moet ook
-- lukken bij een bedrijf dat de module inmiddels heeft opgezegd.
create function public.bb_werkbon_dag_ploeg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ploeg uuid[];
begin
  if new.medewerker_ids is null then
    return new;
  end if;

  new.medewerker_ids := array(
    select distinct x from unnest(new.medewerker_ids) x where x is not null
  );

  if pg_trigger_depth() = 1
     and (tg_op = 'INSERT' or new.medewerker_ids is distinct from old.medewerker_ids)
     and not public.bb_has_feature(new.company_id, 'planning') then
    raise exception 'Per dag medewerkers kiezen zit in de planningsmodule (Team, of als module bij Groei).'
      using errcode = 'check_violation';
  end if;

  select assigned_to_ids into v_ploeg from public.werkbonnen where id = new.werkbon_id;
  if not (new.medewerker_ids <@ coalesce(v_ploeg, '{}'::uuid[])) then
    raise exception 'Een dagploeg kan alleen bestaan uit medewerkers die aan de werkbon gekoppeld zijn.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.bb_werkbon_dag_ploeg() from public, anon, authenticated;

create trigger bb_werkbon_dag_ploeg
  before insert or update of medewerker_ids, werkbon_id on public.werkbon_dagen
  for each row execute function public.bb_werkbon_dag_ploeg();


-- ── Trigger: iemand gaat van de ploeg af ────────────────────────────────────
-- Dan ook uit elke dagploeg van die werkbon. Een dag waar hij de enige was,
-- houdt een lege dagploeg (niemand) — niet NULL, want dat zou juist weer de hele
-- ploeg betekenen.
create function public.bb_werkbon_ploeg_opschonen()
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
  return null;
end;
$$;

revoke all on function public.bb_werkbon_ploeg_opschonen() from public, anon, authenticated;

create trigger bb_werkbon_ploeg_opschonen
  after update of assigned_to_ids on public.werkbonnen
  for each row execute function public.bb_werkbon_ploeg_opschonen();


-- ── RPC: dagen zetten, nu met dagploeg ──────────────────────────────────────
-- Zelfde signatuur als in 20260911133000; create or replace houdt de rechten,
-- ze worden hieronder toch opnieuw gezet. Een dag zonder "medewerker_ids" in de
-- JSON krijgt NULL (hele ploeg), zodat een oudere frontend blijft werken.
--
-- p_dagen: [{ "datum": "2026-09-14", "starttijd": "08:00", "eindtijd": "16:30",
--             "medewerker_ids": ["<uuid>", …] | null }, …]
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

  insert into public.werkbon_dagen (werkbon_id, company_id, datum, starttijd, eindtijd, medewerker_ids)
  select distinct on ((d->>'datum')::date)
         p_werkbon_id,
         w.company_id,
         (d->>'datum')::date,
         nullif(d->>'starttijd', '')::time,
         nullif(d->>'eindtijd', '')::time,
         case when jsonb_typeof(d->'medewerker_ids') = 'array'
              then array(select jsonb_array_elements_text(d->'medewerker_ids'))::uuid[]
         end
    from jsonb_array_elements(coalesce(p_dagen, '[]'::jsonb)) d
    cross join public.werkbonnen w
   where w.id = p_werkbon_id
  on conflict (werkbon_id, datum) do update
     set starttijd      = excluded.starttijd,
         eindtijd       = excluded.eindtijd,
         medewerker_ids = excluded.medewerker_ids
   where (werkbon_dagen.starttijd, werkbon_dagen.eindtijd, werkbon_dagen.medewerker_ids)
         is distinct from (excluded.starttijd, excluded.eindtijd, excluded.medewerker_ids);

  return query
    select * from public.werkbon_dagen where werkbon_id = p_werkbon_id order by datum;
end;
$$;

revoke all on function public.bb_werkbon_dagen_zetten(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bb_werkbon_dagen_zetten(uuid, jsonb) to authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Zie _TEMPLATE.sql. Na het pushen: npm run migratie:check -- werkbon_dagen
notify pgrst, 'reload schema';
