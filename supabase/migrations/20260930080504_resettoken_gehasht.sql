-- ── Waarom ──────────────────────────────────────────────────────────────────
-- password_reset_tokens.token stond leesbaar in de database. Wie de tabel kon
-- lezen (een back-up, een verkeerd geconfigureerde policy, iemand met
-- databasetoegang) kon binnen het uur dat een link geldig is het wachtwoord van
-- die gebruiker overnemen. De aanmeldcodes (email_verification_codes) waren al
-- gehasht; de resettokens niet.
--
-- Vanaf nu staat alleen een SHA-256-hash in de tabel. De link in de mail bevat
-- het echte token; apply-password-reset hasht wat binnenkomt en zoekt op de hash.
--
-- Volgorde: eerst deze migratie, dan request-password-reset en
-- apply-password-reset deployen. In het gat daartussen werken de oude functies
-- gewoon door, want `token` blijft bestaan (alleen niet meer verplicht). Een
-- volgende migratie haalt die kolom weg zodra de nieuwe functies draaien.
--
-- Gemeten vóór het draaien (30-09-2026): 3 rijen, 0 nog geldig (allemaal
-- verlopen of gebruikt). Ze worden verwijderd: er hoeft niets bewaard te worden,
-- en zo staat er nergens meer een leesbaar token.

begin;

alter table public.password_reset_tokens
  add column if not exists token_hash text;

alter table public.password_reset_tokens
  alter column token drop not null;

create unique index if not exists password_reset_tokens_token_hash_key
  on public.password_reset_tokens (token_hash);

comment on column public.password_reset_tokens.token_hash is
  'SHA-256 (hex) van het token in de resetlink. Het token zelf wordt nergens opgeslagen.';

delete from public.password_reset_tokens;

select
  (select count(*) from public.password_reset_tokens) as rijen,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'password_reset_tokens'
      and column_name = 'token_hash') as kolom_er;

commit;

notify pgrst, 'reload schema';
