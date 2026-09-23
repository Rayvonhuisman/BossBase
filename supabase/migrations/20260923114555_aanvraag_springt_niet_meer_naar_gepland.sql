-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Sinds migratie 20260921190434 krijgt elke aanvraag meteen een project, met
-- status 'gepland' (= nog geen werkbonnen). Maar op projects zat al de trigger
-- bb_project_status_gevolgen, die bij élke INSERT de deal naar de fase van het
-- moment NEW.status duwt. Gevolg: een aanvraag die in "Nieuwe aanvragen" werd
-- aangemaakt, stond een milliseconde later in "Gepland", en omdat die fase na
-- "Akkoord" ligt zette bb_deal_status_uit_fase hem ook nog op 'won'.
--
-- Gemeten op 23-09-2026: een nieuwe aanvraag via de knop in de app kwam in de
-- database binnen als fase Gepland / status won. De bijvulling van 21-09 heeft
-- hetzelfde gedaan met de bestaande deals zonder project: nu op Gepland zonder
-- één werkbon staan er 11 bij Dakdekker Niels, 4 bij BossBase Admin en 49 bij
-- het testbedrijf. Hun vorige fase is nergens bewaard (klant_tijdlijn logt
-- alleen fasewijzigingen uit de app), dus die zet deze migratie NIET terug.
--
-- 'gepland' op een project betekent "er is nog niets begonnen", niet "er staat
-- iets in de agenda". Het inplannen duwt de pipeline al vooruit via de werkbon
-- (bb_werkbon_status_gevolgen). Het project duwt daarom alleen nog bij een echte
-- statuswijziging, en nooit naar 'gepland'.
--
-- Twee dingen die de trigger van 21-09 ook liet liggen:
--  - De omschrijving en de verwachte omzet gingen niet mee naar het project.
--    Een medewerker leest de aanvraagtekst via het project (hij mag deals niet
--    lezen), dus bij elke nieuwe aanvraag was "De aanvraag" voor hem leeg. En de
--    projectkaart toonde €0 waar de pipelinekaart €12.500 toonde.
--  - Naam, waarde en klant wijzigen op de projectkaart raakte alleen het
--    project. De pipelinekaart leest de deal en bleef de oude naam, het oude
--    bedrag en de oude klant tonen. Dezelfde klus, twee verhalen.
--    Andersom: "Behandeld door" wijzigt de deal, maar projects_select kijkt naar
--    projects.assigned_to. De nieuwe behandelaar zag het project dan niet.

begin;

-- ── 1. Project duwt de pipeline alleen bij een echte statuswijziging ────────
create or replace function public.bb_project_status_gevolgen()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
BEGIN
  -- Geen INSERT: een nieuw project is altijd 'gepland' en zegt niets over de
  -- fase van de aanvraag. Geen 'gepland': dat is "nog niets begonnen".
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'gepland' THEN
    PERFORM public.bb_deal_naar_fase(NEW.deal_id, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

revoke all on function public.bb_project_status_gevolgen() from public, anon, authenticated;
grant execute on function public.bb_project_status_gevolgen() to service_role;

-- ── 2. Nieuw project krijgt omschrijving en waarde van de aanvraag mee ──────
create or replace function public.bb_deal_project_aanmaken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.projects p where p.deal_id = new.id) then
    return new;
  end if;

  insert into public.projects (company_id, customer_id, deal_id, name, description,
                               project_value, status, assigned_to)
  values (
    new.company_id,
    new.customer_id,
    new.id,
    coalesce(nullif(btrim(new.title), ''), 'Aanvraag'),
    new.description,
    coalesce(new.expected_revenue, 0),
    'gepland',
    new.assigned_to
  );

  return new;
end;
$$;

revoke all on function public.bb_deal_project_aanmaken() from public, anon, authenticated;
grant execute on function public.bb_deal_project_aanmaken() to service_role;

-- ── 3. Projectkaart → pipelinekaart ─────────────────────────────────────────
-- SECURITY DEFINER: wie projecten_bewerken heeft maar geen verkoop, mag de
-- projectnaam wijzigen; deals_update zou de spiegeling anders stil weigeren.
-- Alleen de vier velden die op de projectkaart te wijzigen zijn. Geen lus:
-- op deals zit geen trigger die deze velden terugschrijft.
create or replace function public.bb_project_naar_deal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.deal_id is null then
    return new;
  end if;

  update public.deals d
     set title            = new.name,
         expected_revenue = new.project_value,
         customer_id      = coalesce(new.customer_id, d.customer_id),
         description      = new.description
   where d.id = new.deal_id
     and d.company_id = new.company_id
     and (d.title            is distinct from new.name
       or d.expected_revenue is distinct from new.project_value
       or (new.customer_id is not null and d.customer_id is distinct from new.customer_id)
       or d.description      is distinct from new.description);

  return new;
end;
$$;

revoke all on function public.bb_project_naar_deal() from public, anon, authenticated;
grant execute on function public.bb_project_naar_deal() to service_role;

drop trigger if exists bb_project_naar_deal on public.projects;
create trigger bb_project_naar_deal
  after update of name, project_value, customer_id, description on public.projects
  for each row
  when (old.name          is distinct from new.name
     or old.project_value is distinct from new.project_value
     or old.customer_id   is distinct from new.customer_id
     or old.description   is distinct from new.description)
  execute function public.bb_project_naar_deal();

-- ── 4. Behandeld door → wie het project mag zien ────────────────────────────
create or replace function public.bb_deal_behandelaar_naar_project()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.projects p
     set assigned_to = new.assigned_to
   where p.deal_id = new.id
     and p.company_id = new.company_id
     and p.assigned_to is distinct from new.assigned_to;
  return new;
end;
$$;

revoke all on function public.bb_deal_behandelaar_naar_project() from public, anon, authenticated;
grant execute on function public.bb_deal_behandelaar_naar_project() to service_role;

drop trigger if exists bb_deal_behandelaar_naar_project on public.deals;
create trigger bb_deal_behandelaar_naar_project
  after update of assigned_to on public.deals
  for each row
  when (old.assigned_to is distinct from new.assigned_to)
  execute function public.bb_deal_behandelaar_naar_project();

-- ── 5. De uitkomst ──────────────────────────────────────────────────────────
select r.rolname, p.proname
  from pg_roles r, pg_proc p
 where p.proname in ('bb_project_status_gevolgen', 'bb_deal_project_aanmaken',
                     'bb_project_naar_deal', 'bb_deal_behandelaar_naar_project')
   and p.pronamespace = 'public'::regnamespace
   and r.rolname in ('anon', 'authenticated')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

commit;

notify pgrst, 'reload schema';
