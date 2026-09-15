-- Projectkosten: wat één klus gekost heeft buiten het werkbonmateriaal om.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De kostentab van een project las job_costs: alles met dit project_id, plus
-- alles op een werkbon van dit project. Daarmee telden inkoopfacturen die op de
-- Kosten-pagina geboekt en aan het project gehangen waren óók mee in de marge —
-- naast het werkbonmateriaal waar ze de inkoop van waren. Bij "Schilderwerk
-- woonkamer" stond dezelfde verf er zo twee keer in: als factuur van € 420 en
-- als werkbonmateriaal van € 92,50 en € 176.
--
-- De nieuwe scheiding:
--   - job_costs is de boekhouding. Wat op de Kosten-pagina geboekt wordt telt
--     NIET mee in de projectmarge, ook niet met een project eraan.
--   - De marge van een project = werkbonmateriaal (op inkoopprijs) + de kosten
--     in DEZE tabel: steigerhuur, een gehuurde hoogwerker — kosten die bij die
--     ene klus horen maar nooit op een werkbon staan.
--
-- ── Waarom een eigen tabel en geen markering op job_costs ──────────────────
-- Een markering op job_costs is een filter dat élke lezer van die tabel moet
-- kennen. Het werkbonmateriaal liet zien hoe dat gaat: de SnelStart-export, de
-- btw-indicatie, de leveranciersplicht, de Kosten-pagina en het dashboard
-- moesten er elk apart op leren filteren, en elke nieuwe lezer vergeet het een
-- keer. Een projectkost in job_costs zou bij die vergeten lezer als boekhoudkost
-- meetellen, of naar SnelStart gaan zonder factuur erbij.
-- Een eigen tabel zit standaard nergens in. Hij hoeft niet naar de boekhouding
-- (de factuur van de steigerverhuurder wordt daar gewoon geboekt), heeft dus
-- geen leveranciers- of bonplicht en geen btw-veld.
--
-- De kolommen volgen werkbon_materialen (naam, eenheid, aantal, prijs per
-- eenheid, leverancier), zodat de invoer op het project hetzelfde werkt als op
-- de werkbon. Het verschil: prijs_per is hier de KOSTprijs. Er is geen
-- verkoopkant — de opbrengst van het project komt uit de facturen.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Gemeten vóór deze migratie: in alle zes bedrijven samen hangen er twee
-- geboekte kosten (geen werkbonmateriaal) aan een project of werkbon, allebei
-- bij hetzelfde bedrijf en hetzelfde project:
--     Verf en grondverf (Sikkens)   420,00   project
--     Verf                          100,00   werkbon van dat project
-- Die worden NIET omgezet. Het zijn boekingen, en omzetten zou juist de dubbele
-- telling bewaren die dit oplost. Ze blijven op de Kosten-pagina staan en de
-- kostentab van het project noemt ze onderaan als "geboekt, telt niet mee".

create table public.project_kosten (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  datum           date not null default current_date,
  naam            text not null check (btrim(naam) <> ''),
  eenheid         text,
  aantal          numeric not null default 1 check (aantal >= 0),
  prijs_per       numeric not null default 0 check (prijs_per >= 0),
  bedrag          numeric generated always as (round(aantal * prijs_per, 2)) stored,
  leverancier_id  uuid references public.leveranciers(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index project_kosten_project_idx on public.project_kosten (project_id);
create index project_kosten_company_idx on public.project_kosten (company_id);

comment on table public.project_kosten is
  'Kosten van één klus die niet op een werkbon staan (steigerhuur, hoogwerker). Telt mee in de projectmarge; gaat NIET naar de boekhouding — daarvoor is job_costs.';
comment on column public.project_kosten.prijs_per is
  'Kostprijs per eenheid, exclusief btw. Er is geen verkoopkant: de opbrengst komt uit de facturen.';

alter table public.project_kosten enable row level security;

-- Zelfde recht als de kostentab zelf ('kosten'). Project en leverancier moeten
-- van hetzelfde bedrijf zijn: anders kun je met een geraden id een kost aan
-- andermans project hangen.
create policy project_kosten_select on public.project_kosten
  for select to authenticated
  using (company_id = current_company_id() and bb_has_permission('kosten'));

create policy project_kosten_insert on public.project_kosten
  for insert to authenticated
  with check (
    company_id = current_company_id()
    and bb_has_permission('kosten')
    and exists (select 1 from public.projects p where p.id = project_id and p.company_id = current_company_id())
    and (leverancier_id is null or exists (
      select 1 from public.leveranciers l where l.id = leverancier_id and l.company_id = current_company_id()))
  );

create policy project_kosten_update on public.project_kosten
  for update to authenticated
  using (company_id = current_company_id() and bb_has_permission('kosten'))
  with check (
    company_id = current_company_id()
    and bb_has_permission('kosten')
    and exists (select 1 from public.projects p where p.id = project_id and p.company_id = current_company_id())
    and (leverancier_id is null or exists (
      select 1 from public.leveranciers l where l.id = leverancier_id and l.company_id = current_company_id()))
  );

create policy project_kosten_delete on public.project_kosten
  for delete to authenticated
  using (company_id = current_company_id() and bb_has_permission('kosten'));

-- Dezelfde twee poortwachters als op job_costs: alleen-lezen-account en de
-- module 'kosten_nacalculatie' in het abonnement.
create policy readonly_project_kosten on public.project_kosten
  as restrictive for insert to authenticated
  with check (bb_mag_schrijven());

create policy plan_feature_project_kosten on public.project_kosten
  as restrictive for insert to authenticated
  with check (bb_has_feature('kosten_nacalculatie'));

-- anon heeft hier niets te zoeken. RLS houdt hem al tegen (geen bedrijf), maar
-- een tabelrecht dat niemand nodig heeft hoort er niet te staan.
revoke all on table public.project_kosten from anon;

notify pgrst, 'reload schema';
