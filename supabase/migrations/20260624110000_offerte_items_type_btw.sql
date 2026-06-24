-- Offerteregels: bewaar het regeltype en het BTW-percentage per regel.
--
-- Voorheen sloeg offerte_items alleen omschrijving/aantal/prijs op. Bij het
-- bewerken van een offerte werd het regeltype geraden (aantal > 1 ? uren : vast)
-- en het BTW-percentage hard op 21% gezet. Daardoor werd een 9%-offerte bij
-- het opnieuw opslaan stilletjes 21% — en veranderde het bedrag.
--
-- Door type + btw_pct per regel op te slaan kan de bewerk-modal de echte
-- waarden teruglezen. Bestaande regels houden NULL en vallen in de UI terug op
-- een veilige default (afgeleid uit de offerte-totalen, zodat het bedrag niet
-- verandert).
alter table public.offerte_items add column if not exists type text;
alter table public.offerte_items add column if not exists btw_pct numeric;

comment on column public.offerte_items.type is 'Regeltype: uren | m2 | stuks | km | vast. NULL = oude data van vóór deze migratie.';
comment on column public.offerte_items.btw_pct is 'BTW-percentage van de regel (bijv. 21, 9). NULL = oude data van vóór deze migratie.';
