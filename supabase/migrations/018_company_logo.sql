ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;

-- Storage bucket voor bedrijfslogo's
INSERT INTO storage.buckets (id, name, public)
VALUES ('bedrijf-logos', 'bedrijf-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies voor de bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'bedrijf-logos public read'
  ) THEN
    CREATE POLICY "bedrijf-logos public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'bedrijf-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'bedrijf-logos authenticated insert'
  ) THEN
    CREATE POLICY "bedrijf-logos authenticated insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'bedrijf-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'bedrijf-logos authenticated update'
  ) THEN
    CREATE POLICY "bedrijf-logos authenticated update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'bedrijf-logos');
  END IF;
END $$;
