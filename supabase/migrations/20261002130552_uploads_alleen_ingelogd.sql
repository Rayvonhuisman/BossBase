-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Migratie 20260921201845 maakte twee "alleen-lezen"-policies opnieuw aan, maar
-- zonder AS RESTRICTIVE en zonder TO authenticated:
--
--   * readonly_uploads op storage.objects
--   * readonly_project_fotos op public.project_fotos
--
-- Een permissieve policy wordt met OF gecombineerd met de andere. Daardoor was
-- elk van deze twee op zichzelf genoeg om een INSERT toe te laten. bb_mag_schrijven()
-- geeft zonder sessie true (geen bedrijf → niet read-only), dus iedereen met
-- alleen de publieke anon-sleutel kon:
--   - bestanden uploaden in alle tien buckets, in de map van elk bedrijf
--     (audit 2026-10-01: HTTP 200 in alle buckets, 49 MB in `signatures`);
--   - fotorijen toevoegen aan elk project van elk bedrijf (HTTP 201).
-- En omdat een permissieve policy niets kan tegenhouden, werkte de read-only-
-- blokkade (verlopen proef) op uploads ook niet meer.
--
-- Herstel: beide terug naar RESTRICTIVE + TO authenticated, zoals de originele
-- versie in 20260803120000. Ze kunnen dan alleen nog inperken; toestaan doen de
-- eigen INSERT-policies per bucket/tabel (die controleren bedrijf en recht).
--
-- Buckets zonder eigen INSERT-policy (signatures, signed-offertes,
-- signed-werkbonnen, meldingen) worden alleen door edge functions met de
-- service-rol beschreven; die gaat langs RLS. Gecontroleerd: de frontend leest
-- daar alleen (createSignedUrl), hij uploadt er niet.
--
-- Daarnaast grootte- en typelimieten op de buckets die er geen hadden. Gemeten
-- vóór het draaien (storage.objects, 2026-10-02):
--   factuur-pdfs       19 × application/pdf,  max 0,3 MB
--   signatures         31 × image/png,        max 32 kB
--   signed-offertes    23 × application/pdf,  max 3,3 MB
--   signed-werkbonnen   7 × application/pdf,  max 3,3 MB
--   werkbon-fotos       1 × image/jpeg,       max 1,4 MB (de app verkleint vóór upload)
-- Bestaande objecten worden door een bucketlimiet niet geraakt; alleen nieuwe
-- uploads. De edge functions uploaden met precies deze contentTypes.

begin;

drop policy if exists readonly_uploads on storage.objects;
create policy readonly_uploads on storage.objects as restrictive
  for insert to authenticated
  with check (
    bucket_id <> all (array['werkbon-fotos'::text, 'kosten-bijlagen'::text, 'project-fotos'::text])
    or public.bb_mag_schrijven()
  );

drop policy if exists readonly_project_fotos on public.project_fotos;
create policy readonly_project_fotos on public.project_fotos as restrictive
  for insert to authenticated
  with check (public.bb_mag_schrijven());

update storage.buckets set file_size_limit = 15728640, allowed_mime_types = array['application/pdf']
 where id in ('factuur-pdfs', 'signed-offertes', 'signed-werkbonnen');
update storage.buckets set file_size_limit = 1048576, allowed_mime_types = array['image/png']
 where id = 'signatures';
update storage.buckets set file_size_limit = 15728640,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
 where id = 'werkbon-fotos';

notify pgrst, 'reload schema';

-- ── Uitkomst ────────────────────────────────────────────────────────────────
-- Moet 0 zijn: permissieve INSERT-policies die alleen bb_mag_schrijven() checken.
select
  (select count(*) from pg_policies
    where policyname like 'readonly_%' and permissive = 'PERMISSIVE')        as permissieve_readonly_moet_0,
  (select count(*) from storage.buckets where file_size_limit is null)        as buckets_zonder_limiet;

commit;
