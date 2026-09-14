-- Spiegel-kosten van werkbonmateriaal op de inkoopprijs zetten.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Elk materiaal op een werkbon krijgt een regel in job_costs, zodat het meetelt
-- in de nacalculatie van het project. Die regel kreeg tot nu toe het
-- VERKOOPsubtotaal als bedrag. Gevolg: je "betaalde" precies wat je factureerde
-- en de brutowinst op materiaal was per definitie nul.
--
-- De code zet nieuwe regels sinds vandaag op aantal x inkoopprijs. Deze
-- migratie doet hetzelfde voor wat er al staat.
--
-- ── Wat dit wél en niet aanraakt ────────────────────────────────────────────
-- Alleen rijen waarvan de inkoopprijs bekend is. Op dit moment is dat er één
-- van de negen:
--
--   Kunststof kozijn op maat   6 x 80,00   4.920,00 -> 480,00
--
-- De andere acht houden hun verkoopprijs. Dat is met opzet: terugvallen op
-- verkoop maakt de brutowinst te LAAG en nooit te hoog, en op de kostentab van
-- het project staat er een melding bij hoeveel regels dat betreft. Ze op nul
-- zetten zou de kost stil laten verdwijnen en de winst juist opblazen.
--
-- Zodra iemand alsnog een inkoopprijs invult, trekt de app het bedrag zelf bij
-- (handleUpdateMaterial kijkt sinds vandaag ook naar de inkoopprijs).
--
-- ── Geen dubbele correctie ──────────────────────────────────────────────────
-- De projectkaart rekent bij het uitlezen óók met aantal x inkoopprijs
-- (inkoopwaardeVanKosten). Dat is geen tweede correctie bovenop deze: die
-- functie VERVANGT het bedrag door de herberekening, ze past het niet aan. Voor
-- een rij met bekende inkoopprijs komen beide op hetzelfde uit; voor een rij
-- zonder valt ze terug op het opgeslagen bedrag, dat dan nog steeds de
-- verkoopprijs is. De uitkomst is dus vóór en ná deze migratie gelijk — wat
-- verandert is dat de bron nu klopt, ook voor de Kosten-pagina en alles wat
-- verder job_costs.amount leest.

update public.job_costs j
   set amount = round(m.aantal * i.inkoopprijs_per, 2)
  from public.werkbon_materialen m
  join public.werkbon_materiaal_inkoop i on i.werkbon_materiaal_id = m.id
 where j.werkbon_materiaal_id = m.id
   and i.inkoopprijs_per is not null
   and m.aantal > 0
   and j.amount is distinct from round(m.aantal * i.inkoopprijs_per, 2);

notify pgrst, 'reload schema';
