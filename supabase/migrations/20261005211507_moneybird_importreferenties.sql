-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Stap 5 van de Moneybird-herbouw. De nieuwe import herkent wat al binnen is aan
-- de externe referentie 'moneybird_<documentId>[_<regel>]', zoals SnelStart
-- 'snelstart_<id>[_n]' gebruikt. De oude import schreef 'purchase_<id>',
-- 'receipt_<id>', 'mutation_<id>' en 'mb_sales_<id>'. Zonder omzetting zou de
-- nieuwe import die documenten niet herkennen en ze een tweede keer ophalen,
-- en zou de prullenbak (die op het voorvoegsel van de provider werkt) ze niet
-- kunnen tegenhouden.
--
-- Gemeten vóór deze migratie (2026-10-05): job_costs met 'purchase_' 1 rij,
-- 'receipt_' 1 rij, 'mutation_' 0; facturen met 'mb_sales_' 0. Allemaal van
-- BossBase Admin (intern).
--
-- 'mutation_' (losse bankafschrijvingen) wordt niet omgezet: de nieuwe import
-- haalt geen bankmutaties meer op, net als SnelStart. Zo'n afschrijving is
-- meestal de betaling van een factuur die al als inkoopfactuur binnenkomt;
-- hem óók als kost importeren telt hem dubbel.


-- ── De wijziging ────────────────────────────────────────────────────────────
update public.job_costs
   set externe_referentie = 'moneybird_' || regexp_replace(externe_referentie, '^(purchase|receipt)_', '')
 where externe_referentie ~ '^(purchase|receipt)_';

update public.facturen
   set externe_referentie = 'moneybird_' || regexp_replace(externe_referentie, '^mb_sales_', '')
 where externe_referentie ~ '^mb_sales_';


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
