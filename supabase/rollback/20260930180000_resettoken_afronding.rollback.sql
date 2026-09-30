-- ── Terugdraaien van 20260930180000_resettoken_afronding ────────────────────
-- Zet de tabelrechten terug zoals ze op productie stonden vóór de migratie
-- (vastgelegd 30-09-2026: anon en authenticated hadden SELECT, INSERT, UPDATE,
-- DELETE, REFERENCES, TRIGGER). RLS zonder policies bleef ze tegenhouden.
-- `email` weer verplicht maken kan alleen als geen enkele rij een leeg adres
-- heeft; de nieuwe request-password-reset schrijft geen adres meer, dus zet
-- eerst die functie terug (main) en laat lege rijen verlopen/opruimen.
-- Er gaat geen data verloren.

begin;

grant select, insert, update, delete, references, trigger on table public.password_reset_tokens to anon, authenticated;

do $$
begin
  if not exists (select 1 from public.password_reset_tokens where email is null) then
    alter table public.password_reset_tokens alter column email set not null;
  else
    raise notice 'email blijft optioneel: er zijn rijen zonder adres';
  end if;
end $$;

select (select is_nullable from information_schema.columns where table_schema = 'public'
          and table_name = 'password_reset_tokens' and column_name = 'email') as email_optioneel;

commit;

notify pgrst, 'reload schema';
