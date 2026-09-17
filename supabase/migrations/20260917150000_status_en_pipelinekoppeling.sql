-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Pipeline, project en werkbon beweerden alle drie iets over dezelfde klus, en
-- niets hield ze gelijk. Projecten hadden zeven statussen die alleen in de
-- frontend bestonden (geen constraint), de pipeline had fasen die hetzelfde
-- zeiden, en de enige koppeling was een trigger die de fase op NAAM opzocht —
-- hernoem "Afgerond" en de koppeling viel stil, zonder foutmelding.
--
-- Nu krijgt elk onderdeel één rol:
--   • werkbon  = de klus zelf: gepland → in uitvoering → afgerond.
--   • project  = de verzameling werkbonnen; status wordt AFGELEID, niet getypt.
--   • pipeline = het verkoopverhaal richting de klant, tot en met betaald.
--
-- De koppeling is voortaan een instelling per bedrijf op fase-ID
-- (pipeline_koppelingen), niet op naam. Hernoemen breekt niets meer; een
-- verwijderde fase zet de koppeling op NULL (ON DELETE SET NULL) en Instellingen
-- meldt dat het moment niet meer gekoppeld is.
--
-- Richting is bewust eenzijdig: project/werkbon/factuur duwen de pipeline
-- vooruit, nooit andersom. Een deal handmatig verslepen verandert het project
-- niet. En de deal gaat nooit terug: staat hij al verder (hogere position), dan
-- gebeurt er niets. Een verloren deal blijft verloren.
--
-- Gemeten vóór het draaien (productie): 82 projecten — afgerond 38,
-- te_factureren 16, lopend 13, concept 8, wachten_op_klant 5, risico 1,
-- offerte_akkoord 1. Werkbonnen gebruikten al alleen de drie nieuwe waarden.
-- 15 deals in de fase "Verloren", waarvan 3 met status 'open' — die telden dus
-- ten onrechte als lopende omzet.

begin;

-- ── 1. Statussen: drie, en afgedwongen ──────────────────────────────────────
-- Alles wat nog niet begonnen is → gepland; wat liep of klemde → in uitvoering;
-- wat klaar of te factureren was → afgerond. Bestaande data is testdata.
update public.projects set status = case status
  when 'concept'          then 'gepland'
  when 'offerte_akkoord'  then 'gepland'
  when 'lopend'           then 'in_uitvoering'
  when 'wachten_op_klant' then 'in_uitvoering'
  when 'risico'           then 'in_uitvoering'
  when 'te_factureren'    then 'afgerond'
  when 'afgerond'         then 'afgerond'
  else 'gepland' end
where status is distinct from 'in_uitvoering' or status is null;

alter table public.projects   drop constraint if exists projects_status_check;
alter table public.projects   add  constraint projects_status_check
  check (status in ('gepland', 'in_uitvoering', 'afgerond'));

alter table public.werkbonnen drop constraint if exists werkbonnen_status_check;
alter table public.werkbonnen add  constraint werkbonnen_status_check
  check (status in ('gepland', 'in_uitvoering', 'afgerond'));

alter table public.projects alter column status set default 'gepland';

-- ── 2. De koppeling als instelling, op fase-ID ──────────────────────────────
create table if not exists public.pipeline_koppelingen (
  company_id uuid not null references public.companies(id) on delete cascade,
  moment     text not null check (moment in ('gepland', 'in_uitvoering', 'afgerond', 'gefactureerd', 'betaald')),
  -- SET NULL, niet CASCADE: de rij blijft bestaan zodat Instellingen kan tonen
  -- dát dit moment niet meer gekoppeld is, in plaats van het stil te verliezen.
  stage_id   uuid references public.pipeline_stages(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, moment)
);

comment on table public.pipeline_koppelingen is
  'Welke pipelinefase hoort bij welk moment in de uitvoering. Per bedrijf instelbaar, gekoppeld op fase-ID zodat hernoemen niets breekt.';

alter table public.pipeline_koppelingen enable row level security;

drop policy if exists pipeline_koppelingen_select on public.pipeline_koppelingen;
create policy pipeline_koppelingen_select on public.pipeline_koppelingen
  for select using (company_id = public.current_user_company_id());

drop policy if exists pipeline_koppelingen_schrijven on public.pipeline_koppelingen;
create policy pipeline_koppelingen_schrijven on public.pipeline_koppelingen
  for all
  using      (company_id = public.current_user_company_id() and public.bb_is_admin_or_permission('instellingen'))
  with check (company_id = public.current_user_company_id() and public.bb_is_admin_or_permission('instellingen'));

-- Backfill voor bestaande bedrijven: eenmalig op naam, daarna leeft de koppeling
-- op ID. Bedrijven zonder "Gefactureerd"/"Betaald" houden die momenten leeg.
insert into public.pipeline_koppelingen (company_id, moment, stage_id)
select s.company_id, m.moment, s.id
  from public.pipeline_stages s
  join (values
    ('gepland',       array['gepland']),
    ('in_uitvoering', array['in uitvoering']),
    ('afgerond',      array['afgerond']),
    ('gefactureerd',  array['gefactureerd']),
    ('betaald',       array['betaald', 'betaald / gesloten'])
  ) as m(moment, namen) on lower(s.name) = any (m.namen)
on conflict (company_id, moment) do nothing;

-- ── 3. Nieuwe bedrijven: fasen tot en met betaald, plus de koppeling ────────
create or replace function public.seed_default_pipeline_stages(p_company uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_company IS NULL THEN RETURN; END IF;

  INSERT INTO public.pipeline_stages (company_id, name, position, color_class)
  SELECT p_company, s.name, s.position, s.color_class
  FROM (VALUES
    ('Nieuwe aanvragen',  1,  'b-new'),
    ('Contact nodig',     2,  'b-orange'),
    ('Info compleet',     3,  'b-blue'),
    ('Offerte maken',     4,  'b-blue'),
    ('Offerte verstuurd', 5,  'b-orange'),
    ('Wacht op akkoord',  6,  'b-orange'),
    ('Akkoord',           7,  'b-green'),
    ('Gepland',           8,  'b-planned'),
    ('In uitvoering',     9,  'b-progress'),
    ('Afgerond',         10,  'b-done'),
    ('Gefactureerd',     11,  'b-blue'),
    ('Betaald',          12,  'b-accepted'),
    ('Verloren',         13,  'b-lost')
  ) AS s(name, position, color_class)
  ON CONFLICT (company_id, position) DO NOTHING;

  INSERT INTO public.pipeline_koppelingen (company_id, moment, stage_id)
  SELECT p_company, m.moment, s.id
    FROM public.pipeline_stages s
    JOIN (VALUES
      ('gepland', 'Gepland'), ('in_uitvoering', 'In uitvoering'), ('afgerond', 'Afgerond'),
      ('gefactureerd', 'Gefactureerd'), ('betaald', 'Betaald')
    ) AS m(moment, naam) ON s.name = m.naam
   WHERE s.company_id = p_company
  ON CONFLICT (company_id, moment) DO NOTHING;
END;
$$;

revoke all on function public.seed_default_pipeline_stages(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_pipeline_stages(uuid) to service_role;

-- ── 4. De deal vooruit duwen ────────────────────────────────────────────────
create or replace function public.bb_deal_naar_fase(p_deal uuid, p_moment text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company   uuid;
  v_nu        uuid;
  v_status    text;
  v_doel      uuid;
  v_pos_doel  int;
  v_pos_nu    int;
BEGIN
  IF p_deal IS NULL THEN RETURN; END IF;

  SELECT company_id, stage_id, status INTO v_company, v_nu, v_status
    FROM public.deals WHERE id = p_deal;
  IF v_company IS NULL THEN RETURN; END IF;

  -- Een verloren deal komt hier niet uit terug.
  IF v_status = 'lost' THEN RETURN; END IF;

  SELECT stage_id INTO v_doel
    FROM public.pipeline_koppelingen
   WHERE company_id = v_company AND moment = p_moment;
  IF v_doel IS NULL THEN RETURN; END IF;   -- moment niet gekoppeld: niets doen

  SELECT position INTO v_pos_doel FROM public.pipeline_stages WHERE id = v_doel;
  SELECT position INTO v_pos_nu   FROM public.pipeline_stages WHERE id = v_nu;

  -- Nooit terug: staat de deal al even ver of verder, dan blijft hij staan.
  IF v_pos_nu IS NOT NULL AND v_pos_doel <= v_pos_nu THEN RETURN; END IF;

  UPDATE public.deals SET stage_id = v_doel WHERE id = p_deal;
END;
$$;

revoke all on function public.bb_deal_naar_fase(uuid, text) from public, anon, authenticated;
grant execute on function public.bb_deal_naar_fase(uuid, text) to service_role;

-- ── 5. Projectstatus volgt de werkbonnen ────────────────────────────────────
create or replace function public.bb_project_status_bijwerken(p_project uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_totaal  int;
  v_klaar   int;
  v_gestart int;
  v_status  text;
BEGIN
  IF p_project IS NULL THEN RETURN; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status = 'afgerond'),
         count(*) FILTER (WHERE status IN ('in_uitvoering', 'afgerond'))
    INTO v_totaal, v_klaar, v_gestart
    FROM public.werkbonnen WHERE project_id = p_project;

  -- Zonder werkbonnen is er niets begonnen: gepland.
  v_status := CASE
    WHEN v_totaal = 0        THEN 'gepland'
    WHEN v_klaar = v_totaal  THEN 'afgerond'
    WHEN v_gestart > 0       THEN 'in_uitvoering'
    ELSE 'gepland' END;

  UPDATE public.projects SET status = v_status
   WHERE id = p_project AND status IS DISTINCT FROM v_status;
END;
$$;

revoke all on function public.bb_project_status_bijwerken(uuid) from public, anon, authenticated;
grant execute on function public.bb_project_status_bijwerken(uuid) to service_role;

-- ── 6. Triggers: werkbon → project → pipeline, en factuur → pipeline ────────
create or replace function public.bb_werkbon_status_gevolgen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deal uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.bb_project_status_bijwerken(OLD.project_id);
    RETURN OLD;
  END IF;

  PERFORM public.bb_project_status_bijwerken(NEW.project_id);
  IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    PERFORM public.bb_project_status_bijwerken(OLD.project_id);
  END IF;

  -- De werkbon duwt de pipeline zelf ook vooruit; via zijn eigen deal, of die
  -- van het project waar hij aan hangt.
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    v_deal := coalesce(NEW.deal_id, (SELECT deal_id FROM public.projects WHERE id = NEW.project_id));
    PERFORM public.bb_deal_naar_fase(v_deal, NEW.status);
  END IF;

  RETURN NEW;
END;
$$;

revoke all on function public.bb_werkbon_status_gevolgen() from public, anon, authenticated;

drop trigger if exists werkbonnen_sync_deal_afgerond on public.werkbonnen;
drop trigger if exists bb_werkbon_status_gevolgen on public.werkbonnen;
create trigger bb_werkbon_status_gevolgen
  after insert or update or delete on public.werkbonnen
  for each row execute function public.bb_werkbon_status_gevolgen();

create or replace function public.bb_project_status_gevolgen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.bb_deal_naar_fase(NEW.deal_id, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

revoke all on function public.bb_project_status_gevolgen() from public, anon, authenticated;

drop trigger if exists projects_sync_deal_afgerond on public.projects;
drop trigger if exists bb_project_status_gevolgen on public.projects;
create trigger bb_project_status_gevolgen
  after insert or update on public.projects
  for each row execute function public.bb_project_status_gevolgen();

-- Factuur: verstuurd → Gefactureerd, betaald → Betaald. De deal hangt aan het
-- project; facturen hebben zelf geen deal-kolom.
create or replace function public.bb_factuur_status_gevolgen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deal   uuid;
  v_moment text;
BEGIN
  IF coalesce(NEW.is_credit, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_moment := CASE NEW.status WHEN 'verzonden' THEN 'gefactureerd'
                              WHEN 'betaald'   THEN 'betaald' END;
  IF v_moment IS NULL THEN RETURN NEW; END IF;

  SELECT deal_id INTO v_deal FROM public.projects WHERE id = NEW.project_id;
  PERFORM public.bb_deal_naar_fase(v_deal, v_moment);
  RETURN NEW;
END;
$$;

revoke all on function public.bb_factuur_status_gevolgen() from public, anon, authenticated;

drop trigger if exists bb_factuur_status_gevolgen on public.facturen;
create trigger bb_factuur_status_gevolgen
  after insert or update on public.facturen
  for each row execute function public.bb_factuur_status_gevolgen();

-- De oude naam-gebaseerde koppeling kan weg.
drop function if exists public.sync_deal_stage_to_afgerond() cascade;

-- ── 7. Verloren deals rechtzetten ───────────────────────────────────────────
-- Stonden in de fase "Verloren" maar telden als open omzet, omdat markDealLost
-- alleen de fase en de reden zette.
update public.deals d
   set status = 'lost'
  from public.pipeline_stages s
 where s.id = d.stage_id
   and lower(s.name) = 'verloren'
   and d.status is distinct from 'lost';

commit;

notify pgrst, 'reload schema';
