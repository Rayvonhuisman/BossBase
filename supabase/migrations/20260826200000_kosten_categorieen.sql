-- Eigen kostencategorieën per bedrijf.
--
-- De lijst stond vast in kostenCategorieen.js: Materiaal, Reiskosten,
-- Gereedschap, Inkoopfactuur, Algemene kosten, Overig. Voor een dakdekker klopt
-- dat aardig, voor een installateur met abonnementen en verzekeringen niet.
--
-- job_costs.category blijft gewoon tekst — er staat geen constraint op en dat
-- houden we zo. Deze tabel is de KEUZELIJST, geen sleutel: bestaande rijen met
-- een categorie die niemand meer aanbiedt blijven leesbaar, net als nu.
--
-- De zes standaardcategorieën komen er als rijen in te staan, per bedrijf. Ze
-- hebben standaard = true, wat twee dingen betekent:
--   * hun grootboekrekening hoeft niet ingevuld te worden (BossBase kent de
--     gebruikelijke rekening al — zie grootboekKeuze.ts)
--   * ze zijn niet te hernoemen, want die naam is de sleutel naar die mapping
--
-- Bij een zelf toegevoegde categorie kan BossBase niet raden waar "Verzekeringen"
-- hoort. Zodra er een boekhoudkoppeling actief is moet daar dus een rekening bij
-- gekozen worden. Zonder koppeling speelt dat niet en mag je gewoon een
-- categorie aanmaken.

create table if not exists public.kosten_categorieen (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  naam          text not null,
  -- Eén van de zes ingebouwde categorieën? Die kennen hun eigen grootboek.
  standaard     boolean not null default false,
  -- Uit de keuzelijsten gehaald, maar bestaande kosten houden hun categorie.
  -- Zelfde aanpak als bij leveranciers: in gebruik = niet verwijderen, wel
  -- inactief zetten.
  actief        boolean not null default true,
  -- Is een bon/factuur verplicht bij het invoeren? Bij reiskosten niet — een
  -- kilometervergoeding heeft geen factuur.
  bon_verplicht boolean not null default true,
  volgorde      integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, naam)
);

create index if not exists kosten_categorieen_company_idx
  on public.kosten_categorieen (company_id) where actief;

comment on table public.kosten_categorieen is
  'Keuzelijst met kostencategorieën per bedrijf. job_costs.category blijft vrije tekst; deze tabel bepaalt alleen wat er te kiezen valt.';

-- ── De zes standaardcategorieën ─────────────────────────────────────────────
-- Volgorde en bon_verplicht komen overeen met kostenCategorieen.js. Arbeid staat
-- er bewust NIET bij: die is vervallen (uren horen in de urenregistratie) maar
-- blijft leesbaar op bestaande kosten.
create or replace function public.bb_zet_standaard_kostencategorieen(p_company uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.kosten_categorieen (company_id, naam, standaard, bon_verplicht, volgorde)
  values
    (p_company, 'Materiaal',       true, true,  10),
    (p_company, 'Reiskosten',      true, false, 20),
    (p_company, 'Gereedschap',     true, true,  30),
    (p_company, 'Inkoopfactuur',   true, true,  40),
    (p_company, 'Algemene kosten', true, true,  50),
    (p_company, 'Overig',          true, true,  60)
  on conflict (company_id, naam) do nothing;
$$;

-- Bestaande bedrijven vullen.
do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform public.bb_zet_standaard_kostencategorieen(r.id);
  end loop;
end $$;

-- Nieuwe bedrijven krijgen ze meteen, anders begint een nieuwe klant met een
-- lege keuzelijst.
create or replace function public.bb_nieuwe_company_kostencategorieen()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.bb_zet_standaard_kostencategorieen(new.id);
  return new;
end;
$$;

drop trigger if exists trg_company_kostencategorieen on public.companies;
create trigger trg_company_kostencategorieen
after insert on public.companies
for each row execute function public.bb_nieuwe_company_kostencategorieen();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.kosten_categorieen enable row level security;

-- Lezen mag iedereen binnen het bedrijf: elke monteur die een kostenpost invoert
-- heeft de keuzelijst nodig.
drop policy if exists kosten_categorieen_select on public.kosten_categorieen;
create policy kosten_categorieen_select on public.kosten_categorieen
  for select using (company_id = current_company_id());

-- Beheren alleen door admins. Bewust niet via bb_has_permission(): die geeft rol
-- 'planner' automatisch elk recht, en de categorie-indeling raakt de boekhouding.
drop policy if exists kosten_categorieen_insert on public.kosten_categorieen;
create policy kosten_categorieen_insert on public.kosten_categorieen
  for insert with check (
    company_id = current_company_id()
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );

drop policy if exists kosten_categorieen_update on public.kosten_categorieen;
create policy kosten_categorieen_update on public.kosten_categorieen
  for update using (
    company_id = current_company_id()
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );

-- Verwijderen mag alleen als de categorie standaard NIET is; een standaardrij
-- weghalen zou de keuzelijst stilzwijgend uitkleden. In gebruik? Dan blokkeert
-- de applicatie het en is inactief zetten het antwoord — net als bij leveranciers.
drop policy if exists kosten_categorieen_delete on public.kosten_categorieen;
create policy kosten_categorieen_delete on public.kosten_categorieen
  for delete using (
    company_id = current_company_id()
    and standaard = false
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );
