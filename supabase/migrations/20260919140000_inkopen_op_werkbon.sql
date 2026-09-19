-- Inkopen (project_kosten) kunnen ook bij een werkbon horen.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De werkbon krijgt een blok "Kosten" met dezelfde invoerregel als project en
-- klantkaart. Een inkoop die je daar toevoegt hoort bij díé werkbon, en moet
-- doortellen in het project en op de klantkaart — zonder dubbeltelling.
--
-- Het is één rij in project_kosten met een werkbon_id erbij. Het project leest
-- hem via project_id, de klantkaart via het project óf via de werkbon. Nooit
-- twee rijen, dus niets om dubbel te tellen.
--
-- Werkbonnen zonder project komen veel voor. Gemeten vóór deze migratie:
--   TEST Stamvol Bouw BV   220 werkbonnen, 20 zonder project
--   Dakdekker Niels          7 werkbonnen,  2 zonder project
--   BossBase Admin          10 werkbonnen,  8 zonder project
--   TEST SnelStart BV        1 werkbon,     1 zonder project
-- Daarom mag project_id leeg zijn zolang er een werkbon is; één van de twee is
-- verplicht.
--
-- ── Het project volgt de werkbon ───────────────────────────────────────────
-- Staat er een werkbon_id, dan is project_id altijd het project van die werkbon.
-- Twee triggers houden dat vast:
--   * bij het schrijven van een inkoop wordt project_id uit de werkbon gezet;
--   * wordt een werkbon naar een ander project verplaatst, dan verhuizen zijn
--     inkopen mee.
-- Zonder dat zou een inkoop op project A kunnen blijven staan terwijl zijn
-- werkbon bij project B hoort, en telde hij bij de klant van A.
-- De tweede trigger is SECURITY DEFINER: wie een werkbon verplaatst heeft niet
-- per se het recht 'kosten', en dan zou RLS de update stil overslaan.
--
-- Wordt een werkbon verwijderd, dan gaan zijn inkopen mee (on delete cascade),
-- net als zijn materiaal (werkbon_materialen_werkbon_id_fkey is ook cascade).
--
-- Raakt geen bestaande data: alle huidige rijen hebben een project_id en geen
-- werkbon_id.

alter table public.project_kosten
  add column werkbon_id uuid references public.werkbonnen(id) on delete cascade;

alter table public.project_kosten alter column project_id drop not null;

alter table public.project_kosten
  add constraint project_kosten_project_of_werkbon
  check (project_id is not null or werkbon_id is not null);

create index project_kosten_werkbon_idx on public.project_kosten (werkbon_id) where werkbon_id is not null;

comment on column public.project_kosten.werkbon_id is
  'Werkbon waar deze inkoop bij hoort. Is hij gezet, dan is project_id altijd het project van die werkbon (trigger), of leeg als de werkbon geen project heeft.';

-- ── Project uit de werkbon ──────────────────────────────────────────────────
create or replace function public.bb_project_kosten_project_uit_werkbon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_company uuid;
begin
  if new.werkbon_id is null then
    return new;
  end if;
  select w.project_id, w.company_id into v_project, v_company
  from public.werkbonnen w where w.id = new.werkbon_id;
  -- Security definer ziet elke werkbon, dus hier zelf het bedrijf bewaken:
  -- anders kon je met een geraden id andermans werkbon koppelen.
  if v_company is null or v_company <> new.company_id then
    raise exception 'Werkbon hoort niet bij dit bedrijf' using errcode = '42501';
  end if;
  new.project_id := v_project;
  return new;
end;
$$;

revoke all on function public.bb_project_kosten_project_uit_werkbon() from public, anon, authenticated;

drop trigger if exists project_kosten_project_uit_werkbon on public.project_kosten;
create trigger project_kosten_project_uit_werkbon
  before insert or update of werkbon_id, project_id on public.project_kosten
  for each row execute function public.bb_project_kosten_project_uit_werkbon();

-- ── Werkbon verplaatst → inkopen verhuizen mee ──────────────────────────────
create or replace function public.bb_werkbon_project_naar_inkopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.project_kosten
     set project_id = new.project_id, updated_at = now()
   where werkbon_id = new.id
     and project_id is distinct from new.project_id;
  return new;
end;
$$;

revoke all on function public.bb_werkbon_project_naar_inkopen() from public, anon, authenticated;

drop trigger if exists werkbon_project_naar_inkopen on public.werkbonnen;
create trigger werkbon_project_naar_inkopen
  after update of project_id on public.werkbonnen
  for each row
  when (old.project_id is distinct from new.project_id)
  execute function public.bb_werkbon_project_naar_inkopen();

-- ── RLS: project óf werkbon, allebei van dit bedrijf ────────────────────────
-- De with check draait ná de BEFORE-trigger, dus project_id is dan al het
-- project van de werkbon.
drop policy if exists project_kosten_insert on public.project_kosten;
create policy project_kosten_insert on public.project_kosten
  for insert to authenticated
  with check (
    company_id = current_company_id()
    and bb_has_permission('kosten')
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.company_id = current_company_id()))
    and (werkbon_id is null or exists (select 1 from public.werkbonnen w where w.id = werkbon_id and w.company_id = current_company_id()))
    and (leverancier_id is null or exists (
      select 1 from public.leveranciers l where l.id = leverancier_id and l.company_id = current_company_id()))
  );

drop policy if exists project_kosten_update on public.project_kosten;
create policy project_kosten_update on public.project_kosten
  for update to authenticated
  using (company_id = current_company_id() and bb_has_permission('kosten'))
  with check (
    company_id = current_company_id()
    and bb_has_permission('kosten')
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.company_id = current_company_id()))
    and (werkbon_id is null or exists (select 1 from public.werkbonnen w where w.id = werkbon_id and w.company_id = current_company_id()))
    and (leverancier_id is null or exists (
      select 1 from public.leveranciers l where l.id = leverancier_id and l.company_id = current_company_id()))
  );


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- project_kosten
notify pgrst, 'reload schema';
