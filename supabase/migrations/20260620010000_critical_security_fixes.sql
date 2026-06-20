-- ============================================================================
-- KRITIEKE SECURITY FIXES (uit SECURITY_AUDIT.md)
-- ============================================================================

-- ── KRITIEK 1 — Privilege-escalatie via profiles ────────────────────────────
-- Een gewone gebruiker kon zichzelf is_super_admin=true / role='admin' maken.
-- We blokkeren wijziging van die kolommen vanuit directe client-requests
-- (PostgREST-rollen 'authenticated'/'anon'), tenzij de aanroeper zelf al
-- super_admin is. service_role (edge functions zoals accept-invite) en
-- SECURITY DEFINER-functies (handle_new_user, provision_account) draaien onder
-- een andere DB-rol en blijven dus toegestaan — anders zou registratie en het
-- accepteren van uitnodigingen breken.
--
-- LET OP: de functie is bewust SECURITY INVOKER (geen DEFINER), zodat
-- current_user de echte aanroep-rol weergeeft i.p.v. de functie-eigenaar.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin)
     OR (NEW.role IS DISTINCT FROM OLD.role) THEN
    IF current_user IN ('authenticated', 'anon')
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles
         WHERE id = auth.uid() AND is_super_admin = true
       ) THEN
      -- Niet-geautoriseerd: negeer de wijziging, behoud de oude waarden.
      NEW.is_super_admin := OLD.is_super_admin;
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_privileges ON public.profiles;
CREATE TRIGGER protect_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- ── KRITIEK 2 — kosten-bijlagen bucket publiek + cross-tenant lees ──────────
-- Bucket privé maken en de te ruime policies vervangen door company-scoped
-- policies op basis van de eerste padmap ({company_id}/bestandsnaam).
UPDATE storage.buckets SET public = false WHERE id = 'kosten-bijlagen';

DROP POLICY IF EXISTS "Authenticated users can read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "kosten_bijlagen_select" ON storage.objects;
DROP POLICY IF EXISTS "kosten_bijlagen_insert" ON storage.objects;
DROP POLICY IF EXISTS "kosten_bijlagen_update" ON storage.objects;
DROP POLICY IF EXISTS "kosten_bijlagen_delete" ON storage.objects;

CREATE POLICY "kosten_bijlagen_select" ON storage.objects FOR SELECT
USING (
  bucket_id = 'kosten-bijlagen'
  AND (storage.foldername(name))[1] = current_user_company_id()::text
);

CREATE POLICY "kosten_bijlagen_insert" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'kosten-bijlagen'
  AND (storage.foldername(name))[1] = current_user_company_id()::text
);

CREATE POLICY "kosten_bijlagen_update" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'kosten-bijlagen'
  AND (storage.foldername(name))[1] = current_user_company_id()::text
);

CREATE POLICY "kosten_bijlagen_delete" ON storage.objects FOR DELETE
USING (
  bucket_id = 'kosten-bijlagen'
  AND (storage.foldername(name))[1] = current_user_company_id()::text
);

-- ── KRITIEK 3 — RPC get_auth_user_id_by_email open voor anon/authenticated ──
-- Enkel service_role (edge functions request-password-reset / accept-invite)
-- mag deze functie aanroepen. PUBLIC moet ook expliciet ingetrokken worden.
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) FROM authenticated;
