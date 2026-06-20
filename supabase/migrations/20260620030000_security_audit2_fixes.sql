-- ============================================================================
-- SECURITY AUDIT 2 (red team) — fixes 1, 2, 3(DB), 5, 6
-- ============================================================================

-- ── FIX 1 (KRITIEK) — company_id bescherming in profiles-trigger ─────────────
-- De trigger beschermde is_super_admin/role maar NIET company_id, waardoor een
-- gebruiker zichzelf in een ander bedrijf kon plaatsen (tenant-overname).
-- SECURITY DEFINER functies (provision_account) en service_role (accept-invite)
-- draaien onder een andere DB-rol dan 'authenticated'/'anon' en blijven dus
-- toegestaan om company_id te koppelen tijdens registratie/invite.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF (NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin)
       OR (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
      -- Niet-geautoriseerde wijziging van privileged kolommen → terugzetten.
      NEW.is_super_admin := OLD.is_super_admin;
      NEW.role          := OLD.role;
      NEW.company_id    := OLD.company_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── FIX 2 (HOOG) — rechten server-side afdwingen ────────────────────────────
-- Helper 1: admin/planner OR specifiek granted recht (voor offertes/facturen/
-- kosten en klanten_bewerken). SECURITY DEFINER zodat het profiles/
-- user_permissions leest zonder RLS-recursie.
CREATE OR REPLACE FUNCTION public.bb_has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT role IN ('admin','planner') FROM profiles WHERE id = auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM user_permissions
      WHERE user_id = auth.uid() AND permission = p_permission AND granted
    );
$$;

-- Helper 2: admin OR specifiek granted recht (voor klanten_verwijderen — daar
-- geen planner-uitzondering).
CREATE OR REPLACE FUNCTION public.bb_is_admin_or_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT role = 'admin' FROM profiles WHERE id = auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM user_permissions
      WHERE user_id = auth.uid() AND permission = p_permission AND granted
    );
$$;

-- OFFERTES — alle commando's gated op recht 'offertes' (admin/planner OR recht)
DROP POLICY IF EXISTS offertes_select ON public.offertes;
DROP POLICY IF EXISTS offertes_insert ON public.offertes;
DROP POLICY IF EXISTS offertes_update ON public.offertes;
DROP POLICY IF EXISTS offertes_delete ON public.offertes;
CREATE POLICY offertes_select ON public.offertes FOR SELECT TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('offertes'));
CREATE POLICY offertes_insert ON public.offertes FOR INSERT TO authenticated
  WITH CHECK (company_id = current_company_id() AND bb_has_permission('offertes'));
CREATE POLICY offertes_update ON public.offertes FOR UPDATE TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('offertes'))
  WITH CHECK (company_id = current_company_id() AND bb_has_permission('offertes'));
CREATE POLICY offertes_delete ON public.offertes FOR DELETE TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('offertes'));

-- FACTUREN — recht 'facturen'
DROP POLICY IF EXISTS facturen_select ON public.facturen;
DROP POLICY IF EXISTS facturen_insert ON public.facturen;
DROP POLICY IF EXISTS facturen_update ON public.facturen;
DROP POLICY IF EXISTS facturen_delete ON public.facturen;
CREATE POLICY facturen_select ON public.facturen FOR SELECT TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('facturen'));
CREATE POLICY facturen_insert ON public.facturen FOR INSERT TO authenticated
  WITH CHECK (company_id = current_company_id() AND bb_has_permission('facturen'));
CREATE POLICY facturen_update ON public.facturen FOR UPDATE TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('facturen'))
  WITH CHECK (company_id = current_company_id() AND bb_has_permission('facturen'));
CREATE POLICY facturen_delete ON public.facturen FOR DELETE TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('facturen'));

-- JOB_COSTS (kosten) — recht 'kosten'
DROP POLICY IF EXISTS "Users can view own company job costs"   ON public.job_costs;
DROP POLICY IF EXISTS "Users can insert own company job costs" ON public.job_costs;
DROP POLICY IF EXISTS "Users can update own company job costs" ON public.job_costs;
DROP POLICY IF EXISTS "Users can delete own company job costs" ON public.job_costs;
CREATE POLICY "Users can view own company job costs" ON public.job_costs FOR SELECT TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('kosten'));
CREATE POLICY "Users can insert own company job costs" ON public.job_costs FOR INSERT TO authenticated
  WITH CHECK (company_id = current_company_id() AND bb_has_permission('kosten'));
CREATE POLICY "Users can update own company job costs" ON public.job_costs FOR UPDATE TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('kosten'))
  WITH CHECK (company_id = current_company_id() AND bb_has_permission('kosten'));
CREATE POLICY "Users can delete own company job costs" ON public.job_costs FOR DELETE TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('kosten'));

-- CUSTOMERS — SELECT en INSERT blijven breed (medewerkers hebben klantnamen
-- nodig voor werkbonnen/planning en mogen klanten aanmaken). Alleen UPDATE en
-- DELETE worden recht-gated.
DROP POLICY IF EXISTS "Users can update own company customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete own company customers" ON public.customers;
CREATE POLICY "Users can update own company customers" ON public.customers FOR UPDATE TO authenticated
  USING (company_id = current_company_id() AND bb_has_permission('klanten_bewerken'))
  WITH CHECK (company_id = current_company_id() AND bb_has_permission('klanten_bewerken'));
CREATE POLICY "Users can delete own company customers" ON public.customers FOR DELETE TO authenticated
  USING (company_id = current_company_id() AND bb_is_admin_or_permission('klanten_verwijderen'));

-- ── FIX 3 (DB-deel) — signatures bucket privé ───────────────────────────────
-- sign-offerte (service-role) levert voortaan een signed URL i.p.v. publieke URL.
UPDATE storage.buckets SET public = false WHERE id = 'signatures';

-- ── FIX 5 (LAAG) — search_path op SECURITY DEFINER functies ─────────────────
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_invite_company_for_current_user() SET search_path = public, pg_temp;

-- ── FIX 6 (LAAG) — wees-bestanden in kosten-bijlagen root ───────────────────
-- Directe DELETE op storage.objects is geblokkeerd door storage.protect_delete().
-- De 2 root-bestanden zijn al onbereikbaar voor clients (company-scoped policy
-- => alleen service-role). Opruimen gebeurt via de Storage API (zie script in
-- de PR-notities), niet via een migratie.
