-- =============================================================================
-- BossBase: werkbon-fotos bucket privé + company-scoped lezen
-- Bestand : supabase/migrations/20260722150000_werkbon_fotos_private.sql
--
-- Probleem: de werkbon-fotos-bucket stond op public=true met een brede SELECT-
-- policy (rol `public`), waardoor iedereen — ook anoniem — met de juiste URL
-- klantfoto's van ELK bedrijf kon downloaden/listen. De upload/update/delete
-- policies waren al company-scoped op pad {company_id}/..., alleen lezen niet.
--
-- Fix: bucket op privé en de publieke read-policy vervangen door een company-
-- scoped SELECT-policy (zelfde patroon als kosten-bijlagen / factuur-pdfs,
-- migratie 20260620020000). De frontend toont foto's voortaan via signed URLs.
-- =============================================================================

update storage.buckets set public = false where id = 'werkbon-fotos';

drop policy if exists "werkbon-fotos public read" on storage.objects;

create policy "werkbon-fotos company read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'werkbon-fotos'
    and (storage.foldername(name))[1] = current_user_company_id()::text
  );
