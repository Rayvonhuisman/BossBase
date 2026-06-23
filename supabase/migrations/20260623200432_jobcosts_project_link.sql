-- Kosten (job_costs) koppelen aan project + werkbon, analoog aan de uren-fix.
-- 1) Nieuwe koppelingen. SET NULL zodat het verwijderen van een project/werkbon
--    de kost niet weggooit (alleen ontkoppelt).
ALTER TABLE public.job_costs
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS werkbon_id uuid REFERENCES public.werkbonnen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_costs_project ON public.job_costs (project_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_werkbon ON public.job_costs (werkbon_id);

-- 2) deal_id van CASCADE → SET NULL, zodat een deal verwijderen de kosten
--    niet meeneemt (voorheen verdween de kost stilletjes mee).
ALTER TABLE public.job_costs DROP CONSTRAINT IF EXISTS job_costs_deal_id_fkey;
ALTER TABLE public.job_costs
  ADD CONSTRAINT job_costs_deal_id_fkey
  FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;

-- 3) Categorie-casing normaliseren zodat 'materiaal' en 'Materiaal' samenvallen.
UPDATE public.job_costs SET category = 'Materiaal'       WHERE lower(category) = 'materiaal';
UPDATE public.job_costs SET category = 'Arbeid'          WHERE lower(category) = 'arbeid';
UPDATE public.job_costs SET category = 'Reiskosten'      WHERE lower(category) = 'reiskosten';
UPDATE public.job_costs SET category = 'Inkoopfactuur'   WHERE lower(category) = 'inkoopfactuur';
UPDATE public.job_costs SET category = 'Algemene kosten' WHERE lower(category) = 'algemene kosten';
UPDATE public.job_costs SET category = 'Overig'          WHERE lower(category) = 'overig';
UPDATE public.job_costs SET category = 'Gereedschap'     WHERE lower(category) = 'gereedschap';
UPDATE public.job_costs SET category = 'Brandstof'       WHERE lower(category) = 'brandstof';
