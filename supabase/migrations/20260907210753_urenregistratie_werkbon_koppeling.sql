-- Nagekomen bestand voor een migratie die op 2026-09-07 rechtstreeks op
-- productie is uitgevoerd en niet in de repo stond. De inhoud hieronder is
-- letterlijk overgenomen uit supabase_migrations.schema_migrations.
--
-- Waarom dit bestand er moet zijn: `supabase db push` vergelijkt de lokale map
-- met de historie op de server en weigert te draaien zolang er op de server een
-- versie staat die lokaal ontbreekt. Zonder dit bestand komt geen enkele nieuwe
-- migratie er meer doorheen. De versie staat al als uitgevoerd geregistreerd,
-- dus push draait hem niet opnieuw.

-- Additief: koppel urenregistratie aan werkbonnen (+ customer/deal parity).
-- Nullable kolommen, FK's ON DELETE SET NULL, indexen. Geen data-wijziging.

ALTER TABLE public.urenregistratie
  ADD COLUMN IF NOT EXISTS werkbon_id  uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS deal_id     uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urenregistratie_werkbon_id_fkey') THEN
    ALTER TABLE public.urenregistratie
      ADD CONSTRAINT urenregistratie_werkbon_id_fkey
      FOREIGN KEY (werkbon_id) REFERENCES public.werkbonnen(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urenregistratie_customer_id_fkey') THEN
    ALTER TABLE public.urenregistratie
      ADD CONSTRAINT urenregistratie_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urenregistratie_deal_id_fkey') THEN
    ALTER TABLE public.urenregistratie
      ADD CONSTRAINT urenregistratie_deal_id_fkey
      FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_urenregistratie_werkbon  ON public.urenregistratie (werkbon_id);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_customer ON public.urenregistratie (customer_id);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_deal     ON public.urenregistratie (deal_id);

notify pgrst, 'reload schema';
