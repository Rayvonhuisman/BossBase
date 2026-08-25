-- BTW-stelsel per bedrijf: factuurstelsel of kasstelsel.
--
-- De BTW-indicatie moet weten op welk moment omzet meetelt: op factuurdatum
-- (factuurstelsel) of op betaaldatum (kasstelsel). Dat is geen detail — het
-- verschuift bedragen tussen periodes. Een aanname zou stilzwijgend verkeerde
-- cijfers geven, dus het wordt een expliciete instelling.
--
-- Default 'factuur': dat is wat de meeste kleine ondernemers gebruiken.

alter table public.bedrijfsinstellingen
  add column if not exists btw_stelsel text not null default 'factuur';

alter table public.bedrijfsinstellingen drop constraint if exists bedrijfsinstellingen_btw_stelsel_check;
alter table public.bedrijfsinstellingen
  add constraint bedrijfsinstellingen_btw_stelsel_check
  check (btw_stelsel in ('factuur', 'kas'));

comment on column public.bedrijfsinstellingen.btw_stelsel is
  'factuur = omzet telt op factuurdatum (standaard); kas = omzet telt op betaaldatum. Bepaalt in welke periode een factuur valt in de BTW-indicatie.';
