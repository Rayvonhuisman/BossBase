-- BossBase als financieel inzichtportaal: alles uit SnelStart wordt zichtbaar,
-- ook wat daar buiten BossBase om is geboekt.
--
-- Drie dingen die daarvoor nodig zijn:
--   1. klanten kunnen dezelfde velden dragen als leveranciers
--   2. een prullenbak, zodat wat je bewust weggooit niet elke sync terugkomt
--   3. de reset laat geïmporteerde rijen met rust — anders exporteert de sync
--      ze terug naar SnelStart als duplicaat

-- ── 1. Klanten gelijktrekken met leveranciers ───────────────────────────────
-- SnelStart levert deze drie wél bij een relatie, maar customers had er geen
-- kolom voor. Contactpersoon zit in het adresobject (AdresModel.contactpersoon),
-- niet op de relatie zelf.
alter table public.customers
  add column if not exists contactpersoon       text,
  add column if not exists website              text,
  add column if not exists betaaltermijn_dagen  integer;

comment on column public.customers.betaaltermijn_dagen is
  'Uit SnelStart: RelatieModel.krediettermijn. Leeg = de standaardtermijn van het bedrijf.';

-- ── 2. Prullenbak voor geïmporteerde records ────────────────────────────────
-- Zonder dit komt alles wat je weggooit bij de volgende sync gewoon terug: de
-- import kijkt naar wat er in SnelStart staat, niet naar wat jij hier hebt
-- besloten. Precies wat er bij "Klant onbekend" gebeurde.
--
-- Bewust het EXTERNE id als sleutel en niet het BossBase-id: de rij is dan al
-- weg. Leegmaken kan met de knop "Alles opnieuw ophalen" — dat is de enige weg
-- terug, en dus expres een handeling die je bewust doet.
create table if not exists public.import_genegeerd (
  company_id  uuid not null references public.companies(id) on delete cascade,
  provider    text not null default 'snelstart',
  soort       text not null,   -- 'klant' | 'leverancier' | 'factuur' | 'kost'
  externe_id  text not null,
  reden       text,
  created_at  timestamptz not null default now(),
  primary key (company_id, provider, soort, externe_id)
);

comment on table public.import_genegeerd is
  'Records die uit SnelStart geïmporteerd waren en hier zijn verwijderd. De import slaat ze over tot de gebruiker "Alles opnieuw ophalen" kiest.';

alter table public.import_genegeerd enable row level security;

drop policy if exists import_genegeerd_select on public.import_genegeerd;
create policy import_genegeerd_select on public.import_genegeerd
  for select using (company_id = current_company_id());

-- Toevoegen mag iedereen die iets mag verwijderen; de prullenbak volgt gewoon
-- die handeling. Wissen (= opnieuw ophalen) is een admin-beslissing.
drop policy if exists import_genegeerd_insert on public.import_genegeerd;
create policy import_genegeerd_insert on public.import_genegeerd
  for insert with check (company_id = current_company_id());

drop policy if exists import_genegeerd_delete on public.import_genegeerd;
create policy import_genegeerd_delete on public.import_genegeerd
  for delete using (
    company_id = current_company_id()
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );

-- ── 3. Geïmporteerde facturen herkenbaar en beschermd ───────────────────────
-- facturen.externe_referentie bestond al maar werd nergens gevuld. Vanaf nu:
-- 'snelstart_<id>' voor een factuur die uit SnelStart komt. Eén blik zegt dan
-- dat het geen BossBase-factuur is.
create index if not exists facturen_externe_referentie_idx
  on public.facturen (company_id, externe_referentie)
  where externe_referentie is not null;

comment on column public.facturen.externe_referentie is
  'Gevuld bij import uit de boekhouding (snelstart_<id>). Zo''n factuur is alleen-lezen en wordt NOOIT geëxporteerd.';

-- ── 4. Reset laat geïmporteerde rijen met rust ──────────────────────────────
-- Dit was een echt risico: de reset wiste snelstart_id op álle facturen en
-- kosten. Bij een geïmporteerde rij betekent dat "nog niet geboekt", waarna de
-- eerstvolgende sync hem terugboekt naar SnelStart — waar hij al staat. Eén
-- druk op de knop en de administratie staat vol duplicaten.
create or replace function public.reset_snelstart_koppeling()
returns table(klanten integer, leveranciers integer, facturen integer, kosten integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_role    text;
  n_klant   integer;
  n_lev     integer;
  n_fact    integer;
  n_kost    integer;
begin
  select p.company_id, p.role into v_company, v_role
  from public.profiles p where p.id = auth.uid();
  if v_company is null then
    raise exception 'Geen bedrijf gevonden';
  end if;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen admins kunnen de koppeling opnieuw opbouwen';
  end if;

  update public.customers set snelstart_id = null
   where company_id = v_company and snelstart_id is not null;
  get diagnostics n_klant = row_count;

  update public.leveranciers set snelstart_id = null
   where company_id = v_company and snelstart_id is not null;
  get diagnostics n_lev = row_count;

  -- Alleen eigen facturen. Een geïmporteerde factuur hoort in SnelStart thuis,
  -- niet in de exportwachtrij.
  update public.facturen
     set snelstart_id = null,
         snelstart_bijlage_gesynct = false
   where company_id = v_company
     and externe_referentie is null
     and (snelstart_id is not null or snelstart_bijlage_gesynct);
  get diagnostics n_fact = row_count;

  update public.job_costs
     set snelstart_id = null,
         snelstart_bijlage_gesynct = (bijlage_url is null)
   where company_id = v_company
     and externe_referentie is null
     and snelstart_id is not null;
  get diagnostics n_kost = row_count;

  return query select n_klant, n_lev, n_fact, n_kost;
end;
$function$;

comment on function public.reset_snelstart_koppeling() is
  'TESTGEREEDSCHAP. Wist de SnelStart-verwijzingen van eigen facturen, kosten en relaties zodat ze opnieuw geboekt worden. Geïmporteerde rijen blijven ongemoeid. Niet in de klant-UI: zonder eerst opruimen in SnelStart levert dit dubbele boekingen op.';
