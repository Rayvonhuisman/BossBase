-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Bij het aanmaken van een account gaat de gebruiker akkoord met de algemene
-- voorwaarden en de verwerkersovereenkomst, en krijgt hij de privacyverklaring
-- te zien. Dat akkoord moet aantoonbaar zijn: welk document, welke versie,
-- wanneer en vanaf welk IP-adres. Eén rij per document per akkoord.
--
-- Schrijven gebeurt alleen door de edge function akkoord-vastleggen (service
-- role), die het tijdstip en het IP-adres zelf bepaalt; een gebruiker kan zijn
-- eigen akkoord dus niet invullen of wijzigen. Lezen kan een gebruiker alleen
-- zijn eigen rijen.

begin;

create table public.juridisch_akkoord (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  email           text,
  document        text not null check (document in ('algemene_voorwaarden', 'verwerkersovereenkomst', 'privacyverklaring')),
  versie          text not null,
  geaccepteerd_op timestamptz not null default now(),
  ip              text,
  user_agent      text,
  bron            text not null default 'registratie'
);

create index juridisch_akkoord_user_idx on public.juridisch_akkoord (user_id);

alter table public.juridisch_akkoord enable row level security;

revoke all on table public.juridisch_akkoord from public, anon, authenticated;
grant select on table public.juridisch_akkoord to authenticated;
grant all on table public.juridisch_akkoord to service_role;

create policy juridisch_akkoord_eigen_lezen on public.juridisch_akkoord
  for select to authenticated
  using (user_id = auth.uid());

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select relrowsecurity from pg_class where oid = 'public.juridisch_akkoord'::regclass) as rls_aan,
  (select string_agg(privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'juridisch_akkoord'
      and grantee in ('anon', 'authenticated')) as rechten_anon_authenticated;

commit;

notify pgrst, 'reload schema';
