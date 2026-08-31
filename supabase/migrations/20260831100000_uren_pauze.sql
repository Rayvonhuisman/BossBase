-- Pauze op de urenregel.
--
-- Het totaal was `eind − begin`. Een dag van 08:00 tot 16:00 telde dus acht uur
-- terwijl het er zeven en een half zijn. Elke werkbon telde te veel, en dat is
-- wat iemand afleest als hij een factuur opstelt.
--
-- Dat er al met de hand gecorrigeerd werd, staat in de data: er is een rij van
-- 07:30–16:00 waar 8,0 is opgeslagen in plaats van de 8,5 die uit de tijden
-- volgt. Dat halve uur pauze zat nergens vastgelegd.
--
-- Vanaf nu: totaal = eind − begin − pauze.

alter table public.urenregistratie
  add column if not exists pauze_minuten integer not null default 0;

comment on column public.urenregistratie.pauze_minuten is
  'Pauze in minuten. Het totaal in `uren` is eind − begin − pauze.';

alter table public.urenregistratie
  drop constraint if exists urenregistratie_pauze_chk;
alter table public.urenregistratie
  add constraint urenregistratie_pauze_chk check (pauze_minuten >= 0);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Bestaande totalen blijven staan zoals ze zijn. We weten van de meeste rijen
-- niet óf er pauze is gehouden, en die uren kunnen al besproken of gefactureerd
-- zijn — terugrekenen zou getallen veranderen waar iemand zich op heeft
-- gebaseerd.
--
-- Wat we wél doen: het verschil tussen de tijden en het opgeslagen totaal als
-- pauze vastleggen. Dan kloppen begin, eind, pauze en totaal voortaan met
-- elkaar, zónder dat er één totaal verandert. Bij de rij hierboven levert dat
-- precies 30 minuten op; bij de rest 0.
--
-- greatest(0, …) vangt afrondingsruis op: een rij van 04:02–14:07 met 10,08 uur
-- geeft 605 − 604,8 = 0,2 minuut, en dat is geen pauze.
update public.urenregistratie
   set pauze_minuten = greatest(
         0,
         round(extract(epoch from (eind_tijd - start_tijd)) / 60 - (uren * 60))
       )::integer
 where start_tijd is not null
   and eind_tijd is not null
   and eind_tijd > start_tijd
   and pauze_minuten = 0;
