-- Factuur-PDF meesturen naar de boekhouding.
--
-- Verkoopboekingen gingen tot nu toe zonder document naar SnelStart: alleen de
-- bedragen, niet de factuur zelf. Voor een boekhouding is dat te weinig — het
-- brondocument hoort bij de boeking te hangen, net als de bon bij een kostenpost.
--
-- Dezelfde constructie als job_costs.snelstart_bijlage_gesynct: de boeking en de
-- bijlage zijn twee aparte stappen. De PDF wordt vanuit de browser weggeschreven
-- bij het versturen van de factuur, dus hij kan er nog niet zijn op het moment
-- dat de boeking wordt gemaakt. Deze vlag laat de sync hem later nasturen in
-- plaats van hem stil te laten verdwijnen.

alter table public.facturen
  add column if not exists snelstart_bijlage_gesynct boolean not null default false;

comment on column public.facturen.snelstart_bijlage_gesynct is
  'Is de factuur-PDF als document aan de SnelStart-verkoopboeking gehangen? False = nog nasturen.';

-- Alleen facturen die nog naar de boekhouding moeten hoeven nagelopen te worden.
create index if not exists facturen_bijlage_natesturen_idx
  on public.facturen (company_id)
  where snelstart_id is not null and snelstart_bijlage_gesynct = false;
