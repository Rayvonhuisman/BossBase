-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De rondleiding (onboarding) wijst per pagina de belangrijkste onderdelen aan,
-- alleen de eerste keer dat iemand die pagina opent. Dat moet per GEBRUIKER
-- onthouden worden, niet per browser: wie op een andere computer inlogt, moet
-- hem niet opnieuw krijgen. Vandaar een tabel in plaats van localStorage.
--
-- Eén rij per gebruiker per pagina die hij gezien (of overgeslagen) heeft.
-- "Rondleidingen opnieuw starten" in Instellingen verwijdert zijn rijen.
--
-- Alleen de gebruiker zelf leest en schrijft zijn eigen rijen. Net als elke
-- andere tabel krijgt hij de blokkade voor gedeactiveerde accounts
-- (bb_alleen_actieve_gebruikers, zie 20260930182000).

begin;

create table if not exists public.rondleiding_gezien (
  user_id   uuid        not null references public.profiles(id) on delete cascade,
  pagina    text        not null check (length(pagina) between 1 and 40),
  gezien_op timestamptz not null default now(),
  primary key (user_id, pagina)
);

alter table public.rondleiding_gezien enable row level security;

drop policy if exists rondleiding_gezien_eigen on public.rondleiding_gezien;
create policy rondleiding_gezien_eigen on public.rondleiding_gezien
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists bb_alleen_actieve_gebruikers on public.rondleiding_gezien;
create policy bb_alleen_actieve_gebruikers on public.rondleiding_gezien
  as restrictive for all to authenticated
  using ((select public.bb_ik_ben_actief()))
  with check ((select public.bb_ik_ben_actief()));

revoke all on table public.rondleiding_gezien from anon;
revoke truncate on table public.rondleiding_gezien from authenticated;
grant select, insert, delete on table public.rondleiding_gezien to authenticated;

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select count(*) from pg_policies where tablename = 'rondleiding_gezien') as policies,
  has_table_privilege('anon', 'public.rondleiding_gezien', 'SELECT') as anon_select,
  has_table_privilege('authenticated', 'public.rondleiding_gezien', 'TRUNCATE') as auth_truncate;

commit;

notify pgrst, 'reload schema';
