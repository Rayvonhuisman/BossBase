-- Deal-notities in een eigen tabel, zoals project-, werkbon- en activiteitnotities.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Notities bij een deal stonden in de oude tabel `notes`, van vóór de
-- NotitieLog-opzet. Die wijkt op drie punten af van de rest:
--   - geen schrijver: er is geen kolom, dus de app kan niet tonen wie het schreef;
--   - iedereen in het bedrijf mag elke notitie aanpassen en verwijderen, waar dat
--     bij projecten, werkbonnen en activiteiten alleen de schrijver, een admin of
--     een planner mag;
--   - company_id mag leeg zijn.
-- Deze tabel volgt exact het patroon van werkbon_notities/activiteit_notities
-- (migratie 20260725143000), plus de readonly-regel die elke notitietabel heeft.
--
-- Eén aanscherping ten opzichte van dat patroon: bij het toevoegen moet
-- created_by de ingelogde gebruiker zijn (of leeg, dan vult de default hem).
-- Anders kun je een notitie op naam van een collega zetten, en dan zegt de
-- schrijver-kolom niets.
--
-- Een aparte tabel en niet klant_tijdlijn: een deal hoeft geen klant te hebben,
-- en klant_tijdlijn.customer_id is verplicht.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Gemeten op 2026-09-15: `notes` heeft 0 rijen, bij geen enkel bedrijf. Er valt
-- dus niets over te zetten. De INSERT onderaan is een vangnet voor het geval er
-- tussen meten en draaien toch iets bij komt; hij is herhaald draaien-veilig.
--
-- `notes` zelf gaat eruit in 20260915120500_notes_opruimen — die staat als
-- .pending en draait pas NÁ de frontend. Draai je hem eerder, dan geeft de
-- deal-drawer van de live versie een 404.


-- ── De wijziging ────────────────────────────────────────────────────────────

create table if not exists public.deal_notities (
  id          uuid         primary key default gen_random_uuid(),
  company_id  uuid         not null references public.companies(id) on delete cascade,
  deal_id     uuid         not null references public.deals(id) on delete cascade,
  created_by  uuid         default auth.uid() references public.profiles(id) on delete set null,
  note        text         not null check (btrim(note) <> ''),
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);
create index if not exists idx_deal_notities_company on public.deal_notities (company_id);
create index if not exists idx_deal_notities_deal    on public.deal_notities (deal_id, created_at desc);
alter table public.deal_notities enable row level security;

drop policy if exists "deal_notities_select" on public.deal_notities;
create policy "deal_notities_select" on public.deal_notities
  for select using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "deal_notities_insert" on public.deal_notities;
create policy "deal_notities_insert" on public.deal_notities
  for insert with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and created_by = auth.uid()
  );

drop policy if exists "deal_notities_update" on public.deal_notities;
create policy "deal_notities_update" on public.deal_notities
  for update using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (
      created_by = auth.uid()
      or (select role from public.profiles where id = auth.uid()) in ('admin', 'planner')
    )
  ) with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "deal_notities_delete" on public.deal_notities;
create policy "deal_notities_delete" on public.deal_notities
  for delete using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (
      created_by = auth.uid()
      or (select role from public.profiles where id = auth.uid()) in ('admin', 'planner')
    )
  );

-- Alleen-lezen-accounts mogen niets toevoegen, net als bij de andere notities
-- (migratie 20260803120000).
drop policy if exists readonly_deal_notities on public.deal_notities;
create policy readonly_deal_notities on public.deal_notities as restrictive
  for insert to authenticated with check (public.bb_mag_schrijven());

drop trigger if exists deal_notities_set_updated_at on public.deal_notities;
create trigger deal_notities_set_updated_at
  before update on public.deal_notities
  for each row execute function public.bb_set_updated_at();


-- ── Vangnet: wat er eventueel nog in `notes` staat ──────────────────────────
-- Alleen notities met een deal; de schrijver is niet te herleiden en blijft
-- leeg (de app toont dan "Onbekend"). Notities zonder deal zijn er niet (0
-- rijen); de opruimmigratie weigert te draaien als dat ooit anders is.
do $$
begin
  if to_regclass('public.notes') is not null then
    insert into public.deal_notities (company_id, deal_id, created_by, note, created_at, updated_at)
    select d.company_id, n.deal_id, null, btrim(n.content), n.created_at, n.created_at
      from public.notes n
      join public.deals d on d.id = n.deal_id
     where coalesce(btrim(n.content), '') <> ''
       and not exists (
         select 1 from public.deal_notities x
          where x.deal_id = n.deal_id and x.note = btrim(n.content) and x.created_at = n.created_at
       );
  end if;
end $$;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Niet weghalen; zie _TEMPLATE.sql. Na het pushen:
--     npm run migratie:check -- deal_notities
notify pgrst, 'reload schema';
