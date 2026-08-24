-- Leveranciers als echte entiteit.
--
-- Tot nu toe was een leverancier vrije tekst op de kostenpost, en in SnelStart
-- belandden alle kosten onder één fictieve verzamelrelatie. Met een eigen tabel
-- kan een leverancier als echte relatie (relatiesoort 'Leverancier') naar de
-- boekhouding, net zoals klanten nu als 'Klant' gaan.
--
-- Velden: SnelStart's RelatieWriteModel stelt formeel niets verplicht — alleen
-- `naam` is in de praktijk nodig. Daarom is naam hier de enige verplichte
-- kolom; al het andere is optioneel. De overige kolommen spiegelen wat klanten
-- al hebben (adres, KvK, BTW, IBAN, contactgegevens), aangevuld met wat
-- SnelStart biedt en klanten missen: website (websiteUrl), betaaltermijn
-- (krediettermijn), contactpersoon en actief-vlag (nonactief, omgekeerd).
--
-- Bewust NIET overgenomen van customers: logo_url (bij een leverancier zinloos)
-- en de dubbele notes/notities — hier alleen `notities`.

create table if not exists public.leveranciers (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,

  naam                text not null,

  -- contact
  contactpersoon      text,
  email               text,
  telefoon            text,
  mobiel              text,
  website             text,

  -- adres (losse velden, net als bij klanten; PDOK vult ze)
  address             text,
  postcode            text,
  city                text,

  -- zakelijke gegevens
  kvk_number          text,
  btw_number          text,
  iban                text,
  betaaltermijn_dagen integer,

  notities            text,
  actief              boolean not null default true,

  -- koppelvelden boekhouding
  snelstart_id        text,
  moneybird_id        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.leveranciers is
  'Leveranciers van het bedrijf. Alleen naam is verplicht — SnelStart stelt bij een relatie formeel geen enkel veld verplicht.';

create index if not exists leveranciers_company_naam_idx
  on public.leveranciers (company_id, naam);

-- Eén SnelStart-relatie per leverancier, zodat een dubbele sync niet twee
-- relaties aan elkaar knoopt.
create unique index if not exists leveranciers_company_snelstart_idx
  on public.leveranciers (company_id, snelstart_id)
  where snelstart_id is not null;

-- ── updated_at bijhouden ────────────────────────────────────────────────────
create or replace function public.leveranciers_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leveranciers_touch on public.leveranciers;
create trigger leveranciers_touch
  before update on public.leveranciers
  for each row execute function public.leveranciers_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Zelfde patroon als customers: scope op het eigen bedrijf, schrijven achter de
-- klantrechten (wie klanten mag beheren, mag ook leveranciers beheren) en
-- achter de read-only-grendel van een verlopen abonnement.
alter table public.leveranciers enable row level security;

drop policy if exists "Users can view own company leveranciers" on public.leveranciers;
create policy "Users can view own company leveranciers"
  on public.leveranciers for select
  using (company_id = current_company_id());

drop policy if exists "Users can insert own company leveranciers" on public.leveranciers;
create policy "Users can insert own company leveranciers"
  on public.leveranciers for insert
  with check (company_id = current_company_id());

drop policy if exists "Users can update own company leveranciers" on public.leveranciers;
create policy "Users can update own company leveranciers"
  on public.leveranciers for update
  using (company_id = current_company_id() and bb_has_permission('klanten_bewerken'))
  with check (company_id = current_company_id() and bb_has_permission('klanten_bewerken'));

drop policy if exists "Users can delete own company leveranciers" on public.leveranciers;
create policy "Users can delete own company leveranciers"
  on public.leveranciers for delete
  using (company_id = current_company_id() and bb_is_admin_or_permission('klanten_verwijderen'));

drop policy if exists readonly_leveranciers on public.leveranciers;
create policy readonly_leveranciers
  on public.leveranciers for insert
  with check (bb_mag_schrijven());
