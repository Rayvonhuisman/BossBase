-- Werkbonuren los van werkdaguren.
--
-- Tot nu toe stonden ze in één tabel: een urenregel met een werkbon was een
-- klusuur, zonder werkbon een gewoon uur. Dat leest als één ding maar het zijn
-- er twee. Werkdaguren gaan over loon en verlof en zijn van de medewerker zelf;
-- werkbonuren gaan over nacalculatie, facturatie en de werkbon-PDF, en horen bij
-- die ene klus.
--
-- Ze krijgen daarom elk hun eigen tabel. Doorslaggevend is niet de opslag maar
-- wat de werkbon al is: die heeft al werkbon_taken, werkbon_materialen en
-- werkbon_meerwerk. werkbon_uren is de vierde in diezelfde familie — zelfde
-- levensduur, zelfde eigenaarschap, en schrijfrechten die van de werkbon komen
-- in plaats van van de medewerker.
--
-- GEEN project_id of customer_id op werkbon_uren: die volgen uit de werkbon.
-- In de oude opzet kon een urenregel een ánder project dragen dan zijn werkbon;
-- die hele klasse fouten verdwijnt hiermee.

create table if not exists public.werkbon_uren (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  werkbon_id     uuid not null references public.werkbonnen(id) on delete cascade,
  -- Voor wie de uren zijn. Niet per se degene die ze invoert: een uitvoerder mag
  -- ze namens een collega op de klus boeken.
  profile_id     uuid not null references public.profiles(id),
  datum          date not null,
  start_tijd     time,
  eind_tijd      time,
  pauze_minuten  integer not null default 0,
  -- Het totaal: eind − begin − pauze. Opgeslagen en niet berekend, omdat een
  -- regel ook zonder tijden mag bestaan (correctie achteraf).
  uren           numeric not null,
  reis_km        numeric,
  notitie        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint werkbon_uren_pauze_chk  check (pauze_minuten >= 0),
  constraint werkbon_uren_km_chk     check (reis_km is null or reis_km >= 0),
  constraint werkbon_uren_uren_chk   check (uren > 0)
);

comment on table public.werkbon_uren is
  'Uren op een werkbon: nacalculatie, facturatie en de werkbon-PDF. Werkdaguren (loon/verlof) staan in urenregistratie.';

create index if not exists werkbon_uren_werkbon_idx on public.werkbon_uren (werkbon_id);
create index if not exists werkbon_uren_profiel_datum_idx on public.werkbon_uren (company_id, profile_id, datum);

-- ── Wie mag wat ─────────────────────────────────────────────────────────────
-- Lezen: iedereen binnen het bedrijf. Uren op een klus zijn geen geheim, en de
-- werkbonkaart moet ze kunnen tonen aan wie de klus bekijkt.
--
-- Schrijven: de uitvoerders en verantwoordelijken van díé werkbon, plus admin en
-- planner als vangnet. Bewust anders dan bij werkdaguren, waar je je eigen regels
-- beheert: hier bepaalt de klus wie er mag boeken, niet het profiel.
alter table public.werkbon_uren enable row level security;

create or replace function public.bb_mag_werkbon_uren_beheren(p_werkbon uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.werkbonnen w
    where w.id = p_werkbon
      and w.company_id = (select company_id from public.profiles where id = auth.uid())
      and (
        auth.uid() = any (w.assigned_to_ids)
        or auth.uid() = any (w.verantwoordelijke_ids)
        or coalesce((select role in ('admin', 'planner') from public.profiles where id = auth.uid()), false)
      )
  );
$$;

comment on function public.bb_mag_werkbon_uren_beheren(uuid) is
  'True als de ingelogde gebruiker uren mag boeken op deze werkbon: uitvoerder, verantwoordelijke, admin of planner.';

drop policy if exists werkbon_uren_select on public.werkbon_uren;
create policy werkbon_uren_select on public.werkbon_uren
  for select using (company_id = current_company_id());

drop policy if exists werkbon_uren_insert on public.werkbon_uren;
create policy werkbon_uren_insert on public.werkbon_uren
  for insert with check (
    company_id = current_company_id()
    and public.bb_mag_werkbon_uren_beheren(werkbon_id)
  );

drop policy if exists werkbon_uren_update on public.werkbon_uren;
create policy werkbon_uren_update on public.werkbon_uren
  for update using (
    company_id = current_company_id()
    and public.bb_mag_werkbon_uren_beheren(werkbon_id)
  );

drop policy if exists werkbon_uren_delete on public.werkbon_uren;
create policy werkbon_uren_delete on public.werkbon_uren
  for delete using (
    company_id = current_company_id()
    and public.bb_mag_werkbon_uren_beheren(werkbon_id)
  );

-- ── De bestaande regels verdelen ────────────────────────────────────────────
-- Vier van de zes regels hangen aan een werkbon; die verhuizen met alles erop en
-- eraan. De andere twee blijven staan als werkdaguur.
insert into public.werkbon_uren
  (company_id, werkbon_id, profile_id, datum, start_tijd, eind_tijd, pauze_minuten, uren, reis_km, notitie, created_at)
select u.company_id, u.werkbon_id, u.profile_id, u.datum, u.start_tijd, u.eind_tijd,
       coalesce(u.pauze_minuten, 0), u.uren, u.reis_km, u.notitie, u.created_at
  from public.urenregistratie u
 where u.werkbon_id is not null;

delete from public.urenregistratie where werkbon_id is not null;

-- ── Werkdaguren zijn voortaan puur de werkdag ───────────────────────────────
-- Geen werkbon, geen project, geen klant en geen deal: dat zijn allemaal
-- klus-koppelingen, en die horen nu aan de andere kant. Eén bestaande regel had
-- nog een klant zonder klus; die koppeling vervalt.
alter table public.urenregistratie drop column if exists werkbon_id;
alter table public.urenregistratie drop column if exists project_id;
alter table public.urenregistratie drop column if exists customer_id;
alter table public.urenregistratie drop column if exists deal_id;

comment on table public.urenregistratie is
  'Werkdaguren van een medewerker: loon en verlof. Uren op een klus staan in werkbon_uren.';
