-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De vervaldatum van een nieuwe factuur volgde lang uit "Offerte geldig
-- (dagen)" en daarna uit een vaste 14 dagen in de code (tenzij de klant een
-- eigen termijn heeft). Hoe lang een offerte geldig is en na hoeveel dagen een
-- factuur vervalt, zijn twee verschillende dingen. Dit wordt een eigen
-- instelling per bedrijf, onder Instellingen > Algemeen.
--
-- Standaard 14 dagen: dat is wat de code tot nu toe gebruikte, dus voor
-- bestaande bedrijven verandert er niets tot ze het zelf aanpassen. Bestaande
-- facturen houden hun vervaldatum; die staat op de factuur zelf.

begin;

alter table public.bedrijfsinstellingen
  add column if not exists betaaltermijn_dagen integer not null default 14;

alter table public.bedrijfsinstellingen drop constraint if exists bedrijfsinstellingen_betaaltermijn_check;
alter table public.bedrijfsinstellingen add constraint bedrijfsinstellingen_betaaltermijn_check
  check (betaaltermijn_dagen between 0 and 365);

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select count(*) as rijen, min(betaaltermijn_dagen) as min, max(betaaltermijn_dagen) as max
  from public.bedrijfsinstellingen;

commit;

notify pgrst, 'reload schema';
