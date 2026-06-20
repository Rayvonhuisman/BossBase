-- ============================================================================
-- SECURITY ⚠️ AANDACHTSPUNTEN (uit SECURITY_AUDIT.md)
-- Items: 1 (rate-limit tabel), 3 (storage policies), 5 (notifications insert),
--        6 (companies insert), 7 (search_path)
-- ============================================================================

-- ── ITEM 7 — search_path op SECURITY DEFINER functie ────────────────────────
ALTER FUNCTION public.current_user_company_id() SET search_path = public;

-- ── ITEM 1 — Rate limiting password reset (throttle-tabel) ──────────────────
-- Bijhouden van resetpogingen per e-mailadres. Geen client-policies =
-- uitsluitend de service-role (request-password-reset edge function) heeft
-- toegang (RLS aan, 0 policies = deny-all voor anon/authenticated).
CREATE TABLE IF NOT EXISTS public.password_reset_attempts (
  email         text PRIMARY KEY,
  last_attempt  timestamptz DEFAULT now(),
  attempt_count int DEFAULT 1,
  window_start  timestamptz DEFAULT now()
);
ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;

-- ── ITEM 6 — companies INSERT te ruim ───────────────────────────────────────
-- Was: WITH CHECK (auth.role() = 'authenticated') → elke ingelogde gebruiker
-- kon bedrijven aanmaken. Nu: alleen gebruikers zonder bestaand company_id
-- (registratie). Registratie loopt zelf via provision_account (SECURITY
-- DEFINER) en bypast RLS, dus die blijft werken.
DROP POLICY IF EXISTS "companies_insert_own" ON public.companies;
DROP POLICY IF EXISTS "companies_insert_registration" ON public.companies;
CREATE POLICY "companies_insert_registration" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id IS NOT NULL
    )
  );

-- ── ITEM 5 — notifications INSERT spoofing ──────────────────────────────────
-- Was: WITH CHECK (company_id IN eigen bedrijf) → een gebruiker kon een
-- melding voor een willekeurige collega aanmaken. Nu: een client mag alleen
-- een melding voor ZICHZELF aanmaken. Collega-notificaties (mentions/
-- toewijzingen) lopen voortaan via de create-notification edge function
-- (service-role), die valideert dat de doelgebruiker in hetzelfde bedrijf zit.
DROP POLICY IF EXISTS "notifications_company_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_self_insert" ON public.notifications;
CREATE POLICY "notifications_self_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ── ITEM 3 — Storage policies company-scoped ────────────────────────────────
-- avatars: al correct (company+owner scoped) — ongewijzigd.
-- signatures: bewust ongewijzigd — privé maken breekt de publieke onderteken-/
--             PDF-flow (gelezen via publieke URL in een ongeauthenticeerde
--             context). Bestandsnaam = sign_token (UUID, onraadbaar).
-- Buckets blijven publiek (read via publieke URL werkt door); we scopen
-- uitsluitend INSERT/UPDATE/DELETE op de eerste padmap = eigen company_id,
-- zodat cross-tenant overschrijven/verwijderen niet meer kan.

-- bedrijf-logos — pad: {company_id}/logo.{ext}
DROP POLICY IF EXISTS "bedrijf-logos authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "bedrijf-logos authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "bedrijf_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "bedrijf_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "bedrijf_logos_delete" ON storage.objects;

CREATE POLICY "bedrijf_logos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bedrijf-logos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
  );
CREATE POLICY "bedrijf_logos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bedrijf-logos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
  )
  WITH CHECK (
    bucket_id = 'bedrijf-logos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
  );
CREATE POLICY "bedrijf_logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'bedrijf-logos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
  );

-- werkbon-fotos — pad: {company_id}/{werkbon_id}/{uuid}.{ext}
DROP POLICY IF EXISTS "werkbon-fotos auth upload" ON storage.objects;
DROP POLICY IF EXISTS "werkbon-fotos auth delete" ON storage.objects;
DROP POLICY IF EXISTS "werkbon_fotos_insert" ON storage.objects;
DROP POLICY IF EXISTS "werkbon_fotos_update" ON storage.objects;
DROP POLICY IF EXISTS "werkbon_fotos_delete" ON storage.objects;

CREATE POLICY "werkbon_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
  );
CREATE POLICY "werkbon_fotos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
  )
  WITH CHECK (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
  );
CREATE POLICY "werkbon_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'werkbon-fotos'
    AND (storage.foldername(name))[1] = current_user_company_id()::text
  );
