-- Kosten krijgen dezelfde BTW-logica als offertes/facturen: een BTW-percentage
-- naast het (exclusieve) bedrag. `amount` blijft het bedrag EXCLUSIEF BTW
-- (gebruikt voor de winstberekening); btw-bedrag en incl. worden afgeleid.
ALTER TABLE public.job_costs
  ADD COLUMN IF NOT EXISTS btw_percentage numeric NOT NULL DEFAULT 21;

-- Bestaande rijen: standaard 21% (meest voorkomend tarief).
UPDATE public.job_costs SET btw_percentage = 21 WHERE btw_percentage IS NULL;
