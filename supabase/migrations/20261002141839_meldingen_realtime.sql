-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De app abonneert zich op nieuwe rijen in `notifications` (App.jsx, kanaal
-- notif-<profiel>), maar de publicatie supabase_realtime bevatte geen enkele
-- tabel. Meldingen verschenen daardoor pas na herladen of na het openen van de
-- bel (audit 2026-10-01, sec-scheiding B9 / M26).
--
-- Realtime past RLS toe op postgres_changes voor ingelogde gebruikers: een
-- abonnee ontvangt alleen rijen die hij via SELECT mag zien. De SELECT-policy
-- op notifications is `user_id = auth.uid()`, dus iedereen krijgt alleen zijn
-- eigen meldingen — getest met twee sessies na het pushen.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

notify pgrst, 'reload schema';

select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
