-- Materialenbibliotheek + afscherming van inkoopprijzen.
--
-- ── Waarom de inkoopprijs in een aparte tabel staat ─────────────────────────
-- RLS werkt per RIJ. "Deze gebruiker mag alle materialen zien behalve de kolom
-- inkoopprijs" is een KOLOM-vraag en past daar niet in.
--
-- De voor de hand liggende oplossing (kolom-grants + een view die de kolom op
-- NULL zet) is hier bewust NIET gekozen. Getest tegen deze database:
--   * security_invoker = on  → de view ketst volledig af (42501), want de
--     aanroeper mag de kolom niet lezen. Dat sluit die combinatie uit.
--   * security_invoker = off → werkt, maar dan geldt de RLS van de tabel niet
--     en is één WHERE in de view de enige muur tussen tenants.
--   * Bovendien heeft dat model drie bewegende delen (table-grant, kolom-grant,
--     view-optie) die alle drie goed moeten staan.
--
-- Door de prijs in een eigen tabel te zetten wordt de kolom-vraag een RIJ-vraag,
-- en dat is precies waar RLS voor is. Eén policy, hetzelfde beveiligingsmodel
-- als de rest van het project, geen views en geen kolom-grants.
--
-- Zonder het recht komt de rij niet terug; de app ziet dan geen inkoopprijs
-- omdat de database hem niet geeft, niet omdat de app hem verbergt.

-- ── Recht: wie mag inkoopprijzen zien ───────────────────────────────────────
-- Bewust NIET bb_has_permission(): die geeft rol 'planner' automatisch elk
-- recht. Inkoop is standaard alleen voor admin, plus wie het expliciet krijgt.
create or replace function public.bb_mag_inkoopprijs_zien()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
      or exists (
        select 1 from user_permissions
        where user_id = auth.uid() and permission = 'inkoopprijzen' and granted
      );
$$;

comment on function public.bb_mag_inkoopprijs_zien() is
  'True voor admins en voor gebruikers met het expliciete recht inkoopprijzen. Anders dan bb_has_permission geeft dit rol planner GEEN automatische toegang.';

-- ── Materialen ──────────────────────────────────────────────────────────────
create table if not exists public.materialen (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,

  naam           text not null,
  eenheid        text not null default 'stuk',
  verkoopprijs   numeric,          -- wat de klant betaalt
  leverancier_id uuid references public.leveranciers(id) on delete set null,
  btw_pct        numeric not null default 21,
  artikelnummer  text,
  actief         boolean not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.materialen is
  'Standaardmaterialen om snel op een werkbon, offerte of factuur te kiezen. Geen voorraadbeheer. De inkoopprijs staat bewust in materiaal_inkoop.';
comment on column public.materialen.verkoopprijs is
  'Wat de klant betaalt. Dit is de prijs die op de werkbon en de factuur komt.';

create index if not exists materialen_company_naam_idx on public.materialen (company_id, naam);
create index if not exists materialen_leverancier_idx on public.materialen (leverancier_id) where leverancier_id is not null;

create or replace function public.materialen_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists materialen_touch on public.materialen;
create trigger materialen_touch before update on public.materialen
  for each row execute function public.materialen_touch_updated_at();

alter table public.materialen enable row level security;

drop policy if exists materialen_select on public.materialen;
create policy materialen_select on public.materialen
  for select using (company_id = current_company_id());

drop policy if exists materialen_insert on public.materialen;
create policy materialen_insert on public.materialen
  for insert with check (company_id = current_company_id() and bb_mag_schrijven());

drop policy if exists materialen_update on public.materialen;
create policy materialen_update on public.materialen
  for update using (company_id = current_company_id())
  with check (company_id = current_company_id());

drop policy if exists materialen_delete on public.materialen;
create policy materialen_delete on public.materialen
  for delete using (company_id = current_company_id());

-- ── Werkbonregel: koppeling + gekopieerde verkoopprijs ──────────────────────
-- Prijzen worden gekopieerd, niet gerefereerd: verandert de bibliotheek later,
-- dan blijft de nacalculatie van een afgeronde klus kloppen. Zelfde principe
-- als de snapshot-velden op facturen.
alter table public.werkbon_materialen
  add column if not exists materiaal_id   uuid references public.materialen(id) on delete set null,
  add column if not exists leverancier_id uuid references public.leveranciers(id) on delete set null;

comment on column public.werkbon_materialen.prijs_per is
  'Verkoopprijs per eenheid — dit is wat op de werkbon-PDF en de factuur komt. De kostprijs staat in werkbon_materiaal_inkoop.';

create index if not exists werkbon_materialen_materiaal_idx
  on public.werkbon_materialen (materiaal_id) where materiaal_id is not null;

-- ── De afgeschermde prijzen ─────────────────────────────────────────────────
-- Eén rij per materiaal/werkbonregel. De primaire sleutel is tegelijk de
-- foreign key, zodat PostgREST dit als één-op-één inbedt en er nooit twee
-- prijzen bij één materiaal kunnen horen.
create table if not exists public.materiaal_inkoop (
  materiaal_id uuid primary key references public.materialen(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  inkoopprijs  numeric,
  updated_at   timestamptz not null default now()
);

create table if not exists public.werkbon_materiaal_inkoop (
  werkbon_materiaal_id uuid primary key references public.werkbon_materialen(id) on delete cascade,
  company_id           uuid not null references public.companies(id) on delete cascade,
  inkoopprijs_per      numeric,
  updated_at           timestamptz not null default now()
);

comment on table public.materiaal_inkoop is
  'Kostprijs per materiaal — INTERN. Afgeschermd met RLS: zonder het recht inkoopprijzen komt de rij niet terug, ook niet via een directe API-call.';
comment on table public.werkbon_materiaal_inkoop is
  'Kostprijs per werkbonregel op het moment van gebruik — INTERN. Zelfde afscherming als materiaal_inkoop.';

alter table public.materiaal_inkoop enable row level security;
alter table public.werkbon_materiaal_inkoop enable row level security;

-- Eén policy per actie: bedrijfsscoping én het recht, allebei gewone RLS.
-- Dit is de enige bescherming die nodig is — geen view die het kan omzeilen.
drop policy if exists materiaal_inkoop_select on public.materiaal_inkoop;
create policy materiaal_inkoop_select on public.materiaal_inkoop
  for select using (company_id = current_company_id() and bb_mag_inkoopprijs_zien());

drop policy if exists materiaal_inkoop_update on public.materiaal_inkoop;
create policy materiaal_inkoop_update on public.materiaal_inkoop
  for update using (company_id = current_company_id() and bb_mag_inkoopprijs_zien())
  with check (company_id = current_company_id() and bb_mag_inkoopprijs_zien());

drop policy if exists materiaal_inkoop_delete on public.materiaal_inkoop;
create policy materiaal_inkoop_delete on public.materiaal_inkoop
  for delete using (company_id = current_company_id() and bb_mag_inkoopprijs_zien());

drop policy if exists wm_inkoop_select on public.werkbon_materiaal_inkoop;
create policy wm_inkoop_select on public.werkbon_materiaal_inkoop
  for select using (company_id = current_company_id() and bb_mag_inkoopprijs_zien());

drop policy if exists wm_inkoop_update on public.werkbon_materiaal_inkoop;
create policy wm_inkoop_update on public.werkbon_materiaal_inkoop
  for update using (company_id = current_company_id() and bb_mag_inkoopprijs_zien())
  with check (company_id = current_company_id() and bb_mag_inkoopprijs_zien());

drop policy if exists wm_inkoop_delete on public.werkbon_materiaal_inkoop;
create policy wm_inkoop_delete on public.werkbon_materiaal_inkoop
  for delete using (company_id = current_company_id() and bb_mag_inkoopprijs_zien());

-- Let op: er is BEWUST geen INSERT-policy. Rijen ontstaan uitsluitend via de
-- triggers hieronder, die als SECURITY DEFINER draaien. Zo kan ook een monteur
-- (die de prijs niet mag zien) gewoon een materiaal of werkbonregel aanmaken,
-- zonder dat er ooit een rij zonder prijsregel achterblijft.

-- ── Triggers: prijsrij ontstaat automatisch ─────────────────────────────────
create or replace function public.materiaal_inkoop_aanmaken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into materiaal_inkoop (materiaal_id, company_id)
  values (new.id, new.company_id)
  on conflict (materiaal_id) do nothing;
  return new;
end;
$$;

drop trigger if exists materiaal_inkoop_bij_insert on public.materialen;
create trigger materiaal_inkoop_bij_insert
  after insert on public.materialen
  for each row execute function public.materiaal_inkoop_aanmaken();

create or replace function public.wm_inkoop_aanmaken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into werkbon_materiaal_inkoop (werkbon_materiaal_id, company_id)
  values (new.id, new.company_id)
  on conflict (werkbon_materiaal_id) do nothing;
  return new;
end;
$$;

drop trigger if exists wm_inkoop_bij_insert on public.werkbon_materialen;
create trigger wm_inkoop_bij_insert
  after insert on public.werkbon_materialen
  for each row execute function public.wm_inkoop_aanmaken();

-- Bestaande werkbonregels krijgen alsnog hun (lege) prijsrij, zodat de
-- inbedding overal hetzelfde gedraagt.
insert into public.werkbon_materiaal_inkoop (werkbon_materiaal_id, company_id)
select wm.id, wm.company_id
from public.werkbon_materialen wm
where wm.company_id is not null
on conflict (werkbon_materiaal_id) do nothing;
