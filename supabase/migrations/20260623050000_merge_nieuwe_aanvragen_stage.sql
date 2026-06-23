-- =============================================================================
-- 20260623050000_merge_nieuwe_aanvragen_stage.sql
--
-- Voeg de twee bijna identieke beginfasen van de pipeline samen tot één fase
-- "Nieuwe aanvragen".
--
-- Oorzaak van de duplicatie: er waren twee seeders die elkaar niet kenden:
--   * provision_account() (registratie-RPC) seedde "Nieuwe aanvraag" op pos 0.
--   * de AFTER INSERT-trigger op companies (seed_default_pipeline_stages) seedde
--     "Nieuwe lead" op pos 1 (+ de rest).
-- Een nieuw bedrijf kreeg daardoor twee beginfasen die hetzelfde doel dienen.
--
-- Aanpak (idempotent, geen dataverlies):
--   1. Deals uit "Nieuwe aanvraag" verplaatsen naar de "Nieuwe lead"-fase van
--      hetzelfde bedrijf.
--   2. De losse "Nieuwe aanvraag"-fasen verwijderen.
--   3. De overgebleven beginfase hernoemen naar "Nieuwe aanvragen".
--   4. seed_default_pipeline_stages: eerste fase heet voortaan "Nieuwe aanvragen".
--   5. provision_account: de dubbele pipeline-seed weghalen (de trigger doet het).
-- =============================================================================

-- 1. Deals van de losse "Nieuwe aanvraag" naar de "Nieuwe lead"-fase verplaatsen.
UPDATE deals d
SET stage_id = keep.id
FROM pipeline_stages dup
JOIN pipeline_stages keep
  ON keep.company_id = dup.company_id
 AND lower(keep.name) = 'nieuwe lead'
WHERE d.stage_id = dup.id
  AND lower(dup.name) = 'nieuwe aanvraag';

-- 2. De losse "Nieuwe aanvraag"-fasen verwijderen waar een "Nieuwe lead" bestaat.
DELETE FROM pipeline_stages dup
USING pipeline_stages keep
WHERE lower(dup.name) = 'nieuwe aanvraag'
  AND keep.company_id = dup.company_id
  AND lower(keep.name) = 'nieuwe lead';

-- 3. Overgebleven beginfase hernoemen naar "Nieuwe aanvragen".
UPDATE pipeline_stages SET name = 'Nieuwe aanvragen' WHERE lower(name) = 'nieuwe lead';
-- Bedrijven die alleen "Nieuwe aanvraag" hadden (geen "Nieuwe lead") → ook hernoemen.
UPDATE pipeline_stages SET name = 'Nieuwe aanvragen' WHERE lower(name) = 'nieuwe aanvraag';

-- 4. Seed-functie voor nieuwe bedrijven: eerste fase = "Nieuwe aanvragen".
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages(p_company uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO pipeline_stages (company_id, name, position, color_class)
  SELECT p_company, s.name, s.position, s.color_class
  FROM (VALUES
    ('Nieuwe aanvragen',   1,  'b-new'),
    ('Contact nodig',      2,  'b-orange'),
    ('Info compleet',      3,  'b-blue'),
    ('Offerte maken',      4,  'b-blue'),
    ('Offerte verstuurd',  5,  'b-orange'),
    ('Wacht op akkoord',   6,  'b-orange'),
    ('Akkoord',            7,  'b-green'),
    ('Gepland',            8,  'b-planned'),
    ('In uitvoering',      9,  'b-progress'),
    ('Afgerond',          10,  'b-done'),
    ('Betaald / Gesloten',11,  'b-accepted'),
    ('Verloren',          12,  'b-lost')
  ) AS s(name, position, color_class)
  WHERE p_company IS NOT NULL
  ON CONFLICT (company_id, position) DO NOTHING;
$$;

-- 5. provision_account zonder de dubbele pipeline-seed. De companies-trigger
--    seed_default_pipeline_stages levert de fasen al; provision_account hoeft ze
--    niet nóg een keer aan te maken (dat veroorzaakte de "Nieuwe aanvraag"-dubbel).
CREATE OR REPLACE FUNCTION public.provision_account(
  p_company_name text,
  p_full_name    text DEFAULT NULL::text,
  p_email        text DEFAULT NULL::text,
  p_phone        text DEFAULT NULL::text,
  p_kvk          text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_company_id UUID;
  v_existing   UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT company_id INTO v_existing FROM profiles WHERE id = v_user_id;
  IF v_existing IS NOT NULL THEN
    IF p_full_name IS NOT NULL THEN
      UPDATE profiles SET full_name = p_full_name WHERE id = v_user_id;
    END IF;
    RETURN json_build_object('company_id', v_existing, 'status', 'existing');
  END IF;
  INSERT INTO companies (name, email, phone, kvk)
  VALUES (p_company_name, NULLIF(p_email, ''), NULLIF(p_phone, ''), NULLIF(p_kvk, ''))
  RETURNING id INTO v_company_id;
  INSERT INTO profiles (id, company_id, full_name, role)
  VALUES (v_user_id, v_company_id, COALESCE(NULLIF(p_full_name, ''), split_part(p_email, '@', 1), 'Gebruiker'), 'admin')
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    full_name  = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    role       = 'admin';
  -- Pipeline-fasen worden geseed door de AFTER INSERT-trigger op companies
  -- (seed_default_pipeline_stages) — niet meer hier, om dubbele beginfasen te voorkomen.
  PERFORM public.seed_default_email_templates(v_company_id);
  RETURN json_build_object('company_id', v_company_id, 'status', 'created');
END;
$function$;
