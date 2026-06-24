-- =============================================================================
-- 20260624020000_sync_deal_stage_on_afgerond.sql
--
-- Automatische pipeline-status-sync bij afronden.
--
-- Als een project of werkbon op "afgerond" wordt gezet (ook door een medewerker
-- ZONDER pipeline-recht), moet de gekoppelde deal automatisch naar de "Afgerond"-
-- fase van de pipeline schuiven, zodat de planner/admin ziet dat het klaar is.
--
-- Dit gebeurt server-side via een trigger met een SECURITY DEFINER functie, zodat
-- de deal-update niet door RLS geblokkeerd wordt (de medewerker heeft geen
-- pipeline-/deal-rechten, maar raakt de pipeline zo alleen indirect aan).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_deal_stage_to_afgerond()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_stage   uuid;
BEGIN
  -- Geen gekoppelde deal → niets te doen.
  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Alleen reageren op de overgang NAAR 'afgerond'.
  IF NEW.status IS DISTINCT FROM 'afgerond' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'afgerond' THEN
    RETURN NEW;
  END IF;

  -- Bedrijf van de deal bepalen (stages zijn per bedrijf).
  SELECT company_id INTO v_company FROM deals WHERE id = NEW.deal_id;
  IF v_company IS NULL THEN
    RETURN NEW;
  END IF;

  -- "Afgerond"-fase zoeken; valt terug op "Betaald / Gesloten" als die er niet is.
  SELECT id INTO v_stage FROM pipeline_stages
   WHERE company_id = v_company AND lower(name) = 'afgerond'
   ORDER BY position LIMIT 1;
  IF v_stage IS NULL THEN
    SELECT id INTO v_stage FROM pipeline_stages
     WHERE company_id = v_company AND lower(name) = 'betaald / gesloten'
     ORDER BY position LIMIT 1;
  END IF;
  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  -- Deal verplaatsen (deals heeft geen updated_at kolom → alleen stage_id).
  UPDATE deals SET stage_id = v_stage
   WHERE id = NEW.deal_id AND stage_id IS DISTINCT FROM v_stage;

  RETURN NEW;
END;
$$;

-- Triggers op de status-overgang van projecten en werkbonnen.
DROP TRIGGER IF EXISTS projects_sync_deal_afgerond ON projects;
CREATE TRIGGER projects_sync_deal_afgerond
  AFTER UPDATE OF status ON projects
  FOR EACH ROW
  WHEN (NEW.status = 'afgerond')
  EXECUTE FUNCTION public.sync_deal_stage_to_afgerond();

DROP TRIGGER IF EXISTS werkbonnen_sync_deal_afgerond ON werkbonnen;
CREATE TRIGGER werkbonnen_sync_deal_afgerond
  AFTER UPDATE OF status ON werkbonnen
  FOR EACH ROW
  WHEN (NEW.status = 'afgerond')
  EXECUTE FUNCTION public.sync_deal_stage_to_afgerond();
