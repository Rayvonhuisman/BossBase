-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Afronding van 20260930080504 (resettokens gehasht). Die migratie liet de oude
-- kolom `token` bestaan, zodat de oude functies bleven werken tot de nieuwe
-- gedeployd waren. Die draaien nu; `token` wordt nergens meer gelezen of
-- geschreven en kan weg.
--
-- Daarnaast:
-- - `email` in deze tabel is overbodig: de functies werken met user_id, en het
--   adres staat al in auth.users. De nieuwe request-password-reset schrijft het
--   niet meer. Hier wordt de kolom optioneel en leeggemaakt; weghalen kan in een
--   volgende migratie, als de nieuwe functie draait.
-- - anon en authenticated hebben SELECT/INSERT/UPDATE/DELETE op de tabel. RLS
--   (aan, zonder policies) houdt ze nu tegen, maar niemand behalve de
--   serverfuncties (service_role) hoort er ooit bij te kunnen. Rechten weg, dan
--   hangt het niet meer van één laag af.
--
-- Volgorde: deze migratie MOET vóór de nieuwe request-password-reset, want die
-- schrijft geen `email` meer en de kolom is nu nog verplicht. Andersom kan het
-- wel: de functies die nu draaien lezen `token` niet meer en vullen `email` nog;
-- dat blijft werken omdat de kolom alleen optioneel wordt.
--
-- Gemeten vóór het draaien (30-09-2026): 1 rij, geldig, token leeg, hash
-- gevuld. Die link blijft werken: er wordt op token_hash gezocht, en die blijft.

begin;

alter table public.password_reset_tokens
  drop column if exists token;

alter table public.password_reset_tokens
  alter column email drop not null;

update public.password_reset_tokens set email = null where email is not null;

revoke all on table public.password_reset_tokens from anon, authenticated;

select
  (select count(*) from public.password_reset_tokens) as rijen,
  (select count(*) from public.password_reset_tokens where email is not null) as met_email,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'password_reset_tokens'
      and column_name = 'token') as token_kolom,
  (select count(*) from pg_roles r
    where r.rolname in ('anon', 'authenticated')
      and has_table_privilege(r.rolname, 'public.password_reset_tokens', 'SELECT')) as rollen_met_select;

commit;

notify pgrst, 'reload schema';
