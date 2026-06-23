-- Urenregistratie wordt de enige bron van waarheid voor uren.
-- 1) project_id toevoegen zodat uren rechtstreeks aan een project hangen.
ALTER TABLE public.urenregistratie
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_urenregistratie_project ON public.urenregistratie (project_id);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_werkbon ON public.urenregistratie (werkbon_id);

-- 2) Bestaande uren die via een werkbon zijn geboekt: project_id afleiden van de werkbon.
UPDATE public.urenregistratie u
SET project_id = w.project_id
FROM public.werkbonnen w
WHERE u.werkbon_id = w.id
  AND u.project_id IS NULL
  AND w.project_id IS NOT NULL;

-- 3) time_entries is leeg en wordt na deze fix niet meer gebruikt (project-uren
--    leven nu in urenregistratie). Alleen een interne updated_at-trigger hing
--    eraan; geen views/FK's. Tabel opruimen.
DROP TABLE IF EXISTS public.time_entries;
