-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (sec-edge B-12): de Google Agenda-callback koppelde de
-- tokens direct aan de gebruiker uit de OAuth-state. Die state zat niet vast aan
-- de browser of sessie die hem aanvroeg (klassieke OAuth-CSRF).
--
-- Nu twee stappen: de callback zet de tokens in deze wachttabel en stuurt de
-- browser terug naar de app met een eenmalige verwijzing. De app bevestigt met
-- de sessie van de ingelogde gebruiker (google-calendar-bevestig); alleen als
-- dat dezelfde gebruiker is als in de state, ontstaat de koppeling. Een
-- wachtende koppeling vervalt na 10 minuten en wordt bij gebruik verwijderd.
--
-- Alleen de service-rol leest en schrijft hier (tokens).

begin;

create table if not exists public.google_koppel_wachtend (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  google_email text,
  access_token text not null,
  refresh_token text,
  token_expiry timestamptz,
  aangemaakt_op timestamptz not null default now()
);

alter table public.google_koppel_wachtend enable row level security;
revoke all on table public.google_koppel_wachtend from anon, authenticated;
create index if not exists idx_google_koppel_wachtend_user_id on public.google_koppel_wachtend (user_id);
create index if not exists idx_google_koppel_wachtend_company_id on public.google_koppel_wachtend (company_id);

notify pgrst, 'reload schema';

select has_table_privilege('authenticated', 'public.google_koppel_wachtend', 'SELECT') as auth_select_moet_false,
       has_table_privilege('anon', 'public.google_koppel_wachtend', 'SELECT') as anon_select_moet_false;

commit;
