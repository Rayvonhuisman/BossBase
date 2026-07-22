-- =============================================================================
-- BossBase: bedrijf-logos bucket — MIME/size-limiet op bucketniveau
-- Bestand : supabase/migrations/20260722153000_bedrijf_logos_mime_limit.sql
--
-- Probleem: de (publieke) bedrijf-logos-bucket had geen allowed_mime_types en
-- accepteerde o.a. image/svg+xml. Een SVG kan <script>/onload bevatten en op een
-- directe publieke storage-URL als actieve inhoud worden geopend. De frontend
-- weert SVG nu al, maar we dwingen het ook server-side af op de bucket.
-- =============================================================================

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
       file_size_limit    = 5242880   -- 5 MB
 where id = 'bedrijf-logos';
