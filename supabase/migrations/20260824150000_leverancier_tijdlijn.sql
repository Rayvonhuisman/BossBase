-- Notities + tijdlijn voor leveranciers.
--
-- Spiegel van klant_tijdlijn: één tabel die zowel losse notities (type
-- 'notitie') als gebeurtenissen bevat, zodat NotitieLog en de tijdlijn-render
-- van de klantkaart één op één herbruikbaar zijn.
--
-- Bewust een APARTE tabel en geen leverancier_id op klant_tijdlijn: dat zou
-- customer_id nullable maken op een tabel die overal gebruikt wordt. Zelfde
-- keuze als eerder bij werkbon_notities en activiteit_notities.

create table if not exists public.leverancier_tijdlijn (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  leverancier_id uuid not null references public.leveranciers(id) on delete cascade,
  type           text not null default 'notitie',
  omschrijving   text not null,
  meta           jsonb,
  created_by     uuid references public.profiles(id) on delete set null,
  aangemaakt_op  timestamptz not null default now()
);

create index if not exists leverancier_tijdlijn_leverancier_idx
  on public.leverancier_tijdlijn (leverancier_id, aangemaakt_op desc);
create index if not exists leverancier_tijdlijn_company_idx
  on public.leverancier_tijdlijn (company_id);

alter table public.leverancier_tijdlijn enable row level security;

drop policy if exists leverancier_tijdlijn_select on public.leverancier_tijdlijn;
create policy leverancier_tijdlijn_select on public.leverancier_tijdlijn
  for select using (company_id = current_company_id());

drop policy if exists leverancier_tijdlijn_insert on public.leverancier_tijdlijn;
create policy leverancier_tijdlijn_insert on public.leverancier_tijdlijn
  for insert with check (company_id = current_company_id() and bb_mag_schrijven());

drop policy if exists leverancier_tijdlijn_update on public.leverancier_tijdlijn;
create policy leverancier_tijdlijn_update on public.leverancier_tijdlijn
  for update using (
    company_id = current_company_id()
    and (created_by = auth.uid() or (select role from profiles where id = auth.uid()) = 'admin')
  ) with check (company_id = current_company_id());

drop policy if exists leverancier_tijdlijn_delete on public.leverancier_tijdlijn;
create policy leverancier_tijdlijn_delete on public.leverancier_tijdlijn
  for delete using (
    company_id = current_company_id()
    and (created_by = auth.uid() or (select role from profiles where id = auth.uid()) = 'admin')
  );

comment on table public.leverancier_tijdlijn is
  'Notities en gebeurtenissen per leverancier. type=notitie zijn handmatige notities; andere types zijn gelogde gebeurtenissen (bijv. email_verstuurd).';
