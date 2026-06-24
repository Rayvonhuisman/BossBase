-- Eigen prijzen / eenheden: door de gebruiker zelf aangemaakte regeltypes met
-- een standaardprijs (en optioneel eigen eenheid-label en BTW), die naast de
-- vaste types (Uren, Km, Overig) in de offerte/factuur-regelkeuze verschijnen.
create table if not exists public.eigen_eenheden (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  naam text not null,
  standaard_prijs numeric not null default 0,
  eenheid_label text,
  btw_pct numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eigen_eenheden_company_idx on public.eigen_eenheden (company_id);

alter table public.eigen_eenheden enable row level security;

-- Zelfde RLS-conventie als offerte_items: lezen mag iedereen binnen de company;
-- schrijven alleen admin/planner.
drop policy if exists eigen_eenheden_select on public.eigen_eenheden;
create policy eigen_eenheden_select on public.eigen_eenheden for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

drop policy if exists eigen_eenheden_insert on public.eigen_eenheden;
create policy eigen_eenheden_insert on public.eigen_eenheden for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = any (array['admin','planner'])
  );

drop policy if exists eigen_eenheden_update on public.eigen_eenheden;
create policy eigen_eenheden_update on public.eigen_eenheden for update
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = any (array['admin','planner'])
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = any (array['admin','planner'])
  );

drop policy if exists eigen_eenheden_delete on public.eigen_eenheden;
create policy eigen_eenheden_delete on public.eigen_eenheden for delete
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = any (array['admin','planner'])
  );
