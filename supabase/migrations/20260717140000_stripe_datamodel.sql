-- =============================================================================
-- BossBase: Stripe Connect datamodel (stap 1)
-- Bestand : supabase/migrations/20260717140000_stripe_datamodel.sql
--
-- Datamodel voor de Stripe Connect-integratie:
--   * stripe_connections — het gekoppelde Standard connected account per bedrijf
--     plus de onboarding-/capability-status. Company-scoped, RLS 1-op-1
--     gespiegeld van accounting_connections (008): iedereen in het bedrijf mag
--     de statusvelden LEZEN; muteren mag alleen een admin. De edge functions
--     schrijven met de service-role key en passeren RLS.
--   * facturen: vier Stripe-betaalvelden voor de latere betaal-op-factuur-stap.
--
-- Idempotent en niet-destructief (create table / add column if not exists).
-- =============================================================================

-- ── stripe_connections ──────────────────────────────────────────────────────
create table if not exists public.stripe_connections (
  id                uuid        primary key default gen_random_uuid(),
  company_id        uuid        not null references public.companies(id) on delete cascade,
  stripe_account_id text,
  charges_enabled   boolean     not null default false,
  payouts_enabled   boolean     not null default false,
  details_submitted boolean     not null default false,
  onboarding_status text        not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id)
);

alter table public.stripe_connections enable row level security;

-- SELECT: alle leden van de company (frontend leest alleen statusvelden).
drop policy if exists "select_stripe_connections" on public.stripe_connections;
create policy "select_stripe_connections" on public.stripe_connections
  for select using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- INSERT/UPDATE/DELETE: alleen admins (client-kant, o.a. ontkoppelen). De edge
-- functions gebruiken de service-role key en vallen buiten RLS.
drop policy if exists "insert_stripe_connections" on public.stripe_connections;
create policy "insert_stripe_connections" on public.stripe_connections
  for insert with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

drop policy if exists "update_stripe_connections" on public.stripe_connections;
create policy "update_stripe_connections" on public.stripe_connections
  for update using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

drop policy if exists "delete_stripe_connections" on public.stripe_connections;
create policy "delete_stripe_connections" on public.stripe_connections
  for delete using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- ── facturen: Stripe-betaalvelden (voor de latere betaal-op-factuur-stap) ────
alter table public.facturen add column if not exists stripe_payment_intent_id     text;
alter table public.facturen add column if not exists stripe_checkout_session_id   text;
alter table public.facturen add column if not exists stripe_payment_url           text;
alter table public.facturen add column if not exists stripe_payment_status        text;

comment on column public.facturen.stripe_payment_status is 'Status van de Stripe-betaling voor deze factuur (bv. open/paid); gevuld in de betaal-op-factuur-stap.';
