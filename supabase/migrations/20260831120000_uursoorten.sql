-- Uursoorten: een label op de urenregel om te zien wat voor uren het waren.
--
-- GEEN TARIEF. Een uursoort zegt alleen wát voor uren het zijn; de prijs blijft
-- op één plek staan (bedrijfsinstellingen.uurtarief) en verandert niet. Twee
-- plekken met hetzelfde bedrag is precies hoe zulke getallen uit elkaar gaan
-- lopen.
--
-- WAT ER EERDER STOND. De oude V1-pagina's kenden drie hardgecodeerde soorten
-- (arbeid / reiskosten / overig) met een keuzelijst en badges. Die zijn in juni
-- verdwenen toen de dode V1-bestanden werden opgeruimd (commit 64649c9). Wat
-- bleef is de kolom `type` met default 'arbeid' — alle bestaande rijen staan
-- daarop, en die verwijzen we hieronder naar de standaardsoort "Normaal".
--
-- Dat is geen terugdraaien van die opruiming: weg ging een hardgecodeerd lijstje
-- in dode code. Wat hier komt is een lijst die het bedrijf zelf beheert. En de
-- oude uursoort "Reiskosten" komt NIET terug: afstand is nu een eigen kolom
-- (reis_km), reistijd is de soort "Reisuren".
--
-- Opzet is gelijk aan kosten_categorieen (20260826200000): standaardrijen per
-- bedrijf, zelf aanvullen mag, standaardrijen niet verwijderbaar, en in gebruik
-- = inactief zetten in plaats van weggooien.

create table if not exists public.uursoorten (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  naam        text not null,
  -- Een van de ingebouwde soorten? Die zijn niet te verwijderen.
  standaard   boolean not null default false,
  -- Uit de keuzelijst gehaald, maar bestaande uren houden hun soort.
  actief      boolean not null default true,
  volgorde    integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, naam)
);

create index if not exists uursoorten_company_idx
  on public.uursoorten (company_id) where actief;

comment on table public.uursoorten is
  'Keuzelijst met uursoorten per bedrijf. Puur een label op de urenregel — er hangt geen tarief aan.';

-- ── De drie standaardsoorten ────────────────────────────────────────────────
create or replace function public.bb_zet_standaard_uursoorten(p_company uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.uursoorten (company_id, naam, standaard, volgorde)
  values
    (p_company, 'Normaal',  true, 10),
    (p_company, 'Overwerk', true, 20),
    (p_company, 'Reisuren', true, 30)
  on conflict (company_id, naam) do nothing;
$$;

do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform public.bb_zet_standaard_uursoorten(r.id);
  end loop;
end $$;

create or replace function public.bb_nieuwe_company_uursoorten()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.bb_zet_standaard_uursoorten(new.id);
  return new;
end;
$$;

drop trigger if exists trg_company_uursoorten on public.companies;
create trigger trg_company_uursoorten
after insert on public.companies
for each row execute function public.bb_nieuwe_company_uursoorten();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.uursoorten enable row level security;

-- Lezen mag iedereen binnen het bedrijf: elke monteur die uren boekt heeft de
-- keuzelijst nodig.
drop policy if exists uursoorten_select on public.uursoorten;
create policy uursoorten_select on public.uursoorten
  for select using (company_id = current_company_id());

drop policy if exists uursoorten_insert on public.uursoorten;
create policy uursoorten_insert on public.uursoorten
  for insert with check (
    company_id = current_company_id()
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );

drop policy if exists uursoorten_update on public.uursoorten;
create policy uursoorten_update on public.uursoorten
  for update using (
    company_id = current_company_id()
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );

-- Standaardsoorten zijn niet te verwijderen; die zou je stilzwijgend uit de
-- keuzelijst halen. Inactief zetten kan wel.
drop policy if exists uursoorten_delete on public.uursoorten;
create policy uursoorten_delete on public.uursoorten
  for delete using (
    company_id = current_company_id()
    and standaard = false
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );

-- ── De urenregel wijst naar een soort ───────────────────────────────────────
alter table public.urenregistratie
  add column if not exists uursoort_id uuid references public.uursoorten(id);

comment on column public.urenregistratie.uursoort_id is
  'Uursoort van deze regel. Leeg = geen soort gekozen (bedrijf met maar één soort hoeft niets te kiezen).';

create index if not exists urenregistratie_uursoort_idx
  on public.urenregistratie (uursoort_id) where uursoort_id is not null;

-- Bestaande rijen staan allemaal op type 'arbeid' → dat is "Normaal".
update public.urenregistratie u
   set uursoort_id = s.id
  from public.uursoorten s
 where s.company_id = u.company_id
   and s.naam = 'Normaal'
   and u.uursoort_id is null;

-- De oude kolom blijft staan tot zeker is dat er niets meer op leunt. Hij wordt
-- door de applicatie niet meer geschreven.
comment on column public.urenregistratie.type is
  'VERVALLEN (31-08-2026). Vervangen door uursoort_id. Blijft staan voor historie; wordt niet meer geschreven.';
