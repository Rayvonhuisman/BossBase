-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Stap 1 van 2 na 20260930080504 (resettokens gehasht). Alleen uitbreidend:
-- niets wordt weggehaald, zodat de functies die nu draaien én de nieuwe tegelijk
-- kunnen werken.
--
-- - `email` in password_reset_tokens wordt optioneel. De nieuwe
--   request-password-reset schrijft het niet meer (het adres staat al in
--   auth.users); de huidige schrijft het nog, en dat blijft kunnen.
-- - anon en authenticated verliezen hun tabelrechten. RLS (aan, zonder
--   policies) hield ze al tegen; niemand behalve de serverfuncties
--   (service_role) hoort erbij te kunnen. Geen van de functies gebruikt die
--   rechten.
--
-- Stap 2 (kolom `token` weg, `email` leeg) staat in
-- 20260930180500_resettoken_opruimen.sql.pending en gaat pas mee als de nieuwe
-- resetfuncties draaien.
--
-- Terugdraaien: `alter column email set not null` kan alleen zolang er geen
-- rijen zonder email zijn (na de nieuwe functie wel); rechten terugzetten met
-- grant. Er gaat geen data verloren.

begin;

alter table public.password_reset_tokens
  alter column email drop not null;

revoke all on table public.password_reset_tokens from anon, authenticated;

select
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'password_reset_tokens' and column_name = 'email') as email_optioneel,
  (select count(*) from pg_roles r
    where r.rolname in ('anon', 'authenticated')
      and has_table_privilege(r.rolname, 'public.password_reset_tokens', 'SELECT')) as rollen_met_select;

commit;

notify pgrst, 'reload schema';
