-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Het venster "Nieuwe klant" en het tabblad Gegevens op de klantkaart vragen om
-- Type (particulier, zakelijk, ...) en Bron (website, aanbeveling, ...). Die
-- waarden gingen nergens heen: customers had er geen kolom voor, en de mapper in
-- customerService gooide ze er stil af. Wie ze invulde zag ze na het opslaan
-- terugspringen naar "Klant" en leeg.
--
-- Twee kolommen erbij. Type krijgt een vaste lijst, zodat filteren en exporteren
-- (Database) op dezelfde waarden werken; de UI gebruikt dezelfde lijst
-- (KLANT_TYPES in customerService.js). Bron blijft vrije tekst.
--
-- Bestaande data: geen; beide kolommen beginnen leeg (null).

begin;

alter table public.customers add column if not exists type text;
alter table public.customers add column if not exists source text;

alter table public.customers drop constraint if exists customers_type_check;
alter table public.customers add constraint customers_type_check
  check (type is null or type in ('Particulier', 'Zakelijk', 'VvE', 'Aannemer'));

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select count(*) filter (where column_name in ('type', 'source')) as kolommen
  from information_schema.columns
 where table_schema = 'public' and table_name = 'customers';

commit;

notify pgrst, 'reload schema';
