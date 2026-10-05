-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Bij het aanmelden kiest de ondernemer een branche (Schilder, Hovenier, …) en
-- vult een telefoonnummer in. De branche werd tot nu toe nergens opgeslagen
-- (registerWithEmail liet hem vallen), het telefoonnummer alleen als
-- bedrijfstelefoon in companies.phone, dat de klant later vrij kan aanpassen.
--
-- companies.branche: wat voor bedrijf het is. Zichtbaar en filterbaar in de
--   superadmin, aanpasbaar onder Instellingen > Bedrijfsgegevens. Vrije tekst
--   (de keuzelijst staat in src/lib/branches.js), zodat een nieuwe branche geen
--   migratie vraagt.
-- profiles.telefoon: het nummer van de persoon die het account aanmaakte, los
--   van het bedrijfsnummer. Verify-code zet hem uit de aanmeldgegevens.
--
-- Bestaande bedrijven en accounts blijven leeg; er wordt niets ingevuld.
-- Beide tabellen hebben grants op tabelniveau, dus de nieuwe kolommen volgen de
-- bestaande rechten en RLS vanzelf.

alter table public.companies
  add column if not exists branche text;

alter table public.companies drop constraint if exists companies_branche_lengte;
alter table public.companies add constraint companies_branche_lengte
  check (branche is null or char_length(branche) between 1 and 60);

alter table public.profiles
  add column if not exists telefoon text;

alter table public.profiles drop constraint if exists profiles_telefoon_lengte;
alter table public.profiles add constraint profiles_telefoon_lengte
  check (telefoon is null or char_length(telefoon) between 1 and 30);

-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- companies profiles
notify pgrst, 'reload schema';
