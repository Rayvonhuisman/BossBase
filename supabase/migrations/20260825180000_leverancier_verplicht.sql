-- Leverancier verplicht op kosten die naar de boekhouding gaan.
--
-- Tot nu toe stond de verplichting alleen in de UI. Dat dekt de schermen, maar
-- niet een import, een script of een toekomstige route. Elf kosten uit de
-- testdata kwamen zo tóch zonder leverancier in SnelStart terecht, onder de
-- verzamelrelatie "BossBase kosten (controleren)" — precies wat we niet meer
-- willen.
--
-- NOT VALID: bestaande rijen worden niet getoetst, nieuwe en gewijzigde wél.
-- Zo blokkeert dit geen historische data, maar kan er niets nieuws meer
-- doorheen glippen. Bij het bewerken van een oude rij dwingt het af dat de
-- leverancier alsnog wordt ingevuld — dat is wat de UI ook al doet.
--
-- Uitgezonderd:
--   * werkbonmateriaal (werkbon_materiaal_id) — die spiegelregels worden niet
--     geëxporteerd; de inkoopfactuur van de leverancier is daar de kostenpost
--   * geïmporteerde kosten (externe_referentie) — die komen uit de boekhouding
--     en hebben daar al een relatie
--   * bedragen van 0 of minder — worden ook niet geëxporteerd

alter table public.job_costs drop constraint if exists job_costs_leverancier_verplicht;
alter table public.job_costs
  add constraint job_costs_leverancier_verplicht
  check (
    leverancier_id is not null
    or werkbon_materiaal_id is not null
    or externe_referentie is not null
    or coalesce(amount, 0) <= 0
  )
  not valid;

comment on constraint job_costs_leverancier_verplicht on public.job_costs is
  'Kosten die naar de boekhouding gaan hebben een leverancier. NOT VALID: bestaande rijen blijven, nieuwe en gewijzigde moeten voldoen.';

-- De foreign key stond op ON DELETE SET NULL. Dat botst nu met het bovenstaande:
-- een leverancier verwijderen zou de kosten leeg maken, en daarmee onboekbaar.
-- RESTRICT is hier het eerlijke antwoord — een leverancier met kosten hoort niet
-- te verdwijnen. Wie hem niet meer wil zien, zet hem op inactief; dan verdwijnt
-- hij uit de keuzelijsten maar blijven de bestaande koppelingen staan.
alter table public.job_costs drop constraint if exists job_costs_leverancier_id_fkey;
alter table public.job_costs
  add constraint job_costs_leverancier_id_fkey
  foreign key (leverancier_id) references public.leveranciers(id) on delete restrict;
