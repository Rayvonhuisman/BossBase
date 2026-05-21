-- =============================================================================
-- 018_profile_avatars.sql
-- Profile photos for account owners and team members.
--   • Adds avatar_url to profiles + company_members (additive, idempotent).
--   • Creates the public "avatars" storage bucket.
--   • Adds storage.objects RLS so users can only read/write photos that belong
--     to their own company. Admins may manage any team member's avatar within
--     the same company.
-- =============================================================================

-- 1. Columns -----------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
-- 2. Storage bucket ----------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
-- 3. Storage RLS -------------------------------------------------------------
-- Path convention: <company_id>/<owner_id>/<filename>
--   • <owner_id> is the profile id OR the company_members id.
--   • The first folder segment is always the company_id so a single policy
--     can scope reads/writes by tenant.

-- Public read is fine because the bucket is public and avatar URLs are
-- harmless to expose. We still keep an explicit SELECT policy so the intent
-- is documented and the bucket can be flipped to private later without
-- losing access for signed-in users.

DROP POLICY IF EXISTS "avatars_read_public" ON storage.objects;
CREATE POLICY "avatars_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_insert_own_company" ON storage.objects;
CREATE POLICY "avatars_insert_own_company" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (
      -- Self: <company_id>/<profile_id (= auth.uid)>/...
      (storage.foldername(name))[2] = auth.uid()::text
      OR
      -- Admin uploading for a team member in the same company.
      (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        AND EXISTS (
          SELECT 1 FROM company_members cm
          WHERE cm.id::text = (storage.foldername(name))[2]
            AND cm.company_id::text = (storage.foldername(name))[1]
        )
      )
    )
  );
DROP POLICY IF EXISTS "avatars_update_own_company" ON storage.objects;
CREATE POLICY "avatars_update_own_company" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  );
DROP POLICY IF EXISTS "avatars_delete_own_company" ON storage.objects;
CREATE POLICY "avatars_delete_own_company" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  );
-- 4. Allow users to update their own profile.avatar_url ----------------------
-- The existing profiles UPDATE policy (created in the initial schema) already
-- lets users update their own profile row. No change needed here unless the
-- column is excluded explicitly elsewhere — it isn't, so avatar_url updates
-- via supabase.from('profiles').update({ avatar_url }).eq('id', auth.uid())
-- will succeed under the existing policy.

-- company_members.avatar_url is editable by admins (existing policy already
-- covers UPDATE for admins within the same company).;
