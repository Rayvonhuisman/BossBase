-- Koppel een job_cost aan een werkbon-materiaal (1:1 mirror). Zo telt een
-- materiaal precies één keer: de materiaal-lijst leest werkbon_materialen, de
-- kosten/projecten lezen job_costs. ON DELETE CASCADE: materiaal weg → kost weg.
ALTER TABLE public.job_costs
  ADD COLUMN IF NOT EXISTS werkbon_materiaal_id uuid
    REFERENCES public.werkbon_materialen(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_job_costs_werkbon_materiaal
  ON public.job_costs (werkbon_materiaal_id);

-- Backfill: bestaande werkbon-materialen zonder mirror-kost krijgen er één,
-- met project + klant afgeleid van de werkbon. Zo tellen ze mee in het project.
INSERT INTO public.job_costs
  (company_id, description, amount, category, cost_date, werkbon_id, project_id,
   customer_id, btw_percentage, klant_type, werkbon_materiaal_id)
SELECT wm.company_id,
       'Materiaal: ' || wm.naam,
       wm.subtotaal,
       'Materiaal',
       wm.created_at::date,
       wm.werkbon_id,
       w.project_id,
       w.customer_id,
       21,
       CASE WHEN w.customer_id IS NOT NULL THEN 'klant' ELSE 'algemeen' END,
       wm.id
FROM public.werkbon_materialen wm
JOIN public.werkbonnen w ON w.id = wm.werkbon_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_costs jc WHERE jc.werkbon_materiaal_id = wm.id
);
