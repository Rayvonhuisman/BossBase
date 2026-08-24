-- Bijhouden of de bon van een kostenpost al als document in SnelStart staat.
--
-- Zonder deze kolom kan de bon nooit meer mee: bijlagen worden ná het opslaan
-- van de kost op de achtergrond geüpload, dus een sync die daar net tussendoor
-- loopt boekt de kost zonder bon — en daarna wordt de kost overgeslagen omdat
-- snelstart_id gevuld is.
--
-- Met deze kolom kan een volgende sync de bijlage alsnog nasturen bij een
-- boeking die al bestaat.

alter table public.job_costs
  add column if not exists snelstart_bijlage_gesynct boolean not null default false;

comment on column public.job_costs.snelstart_bijlage_gesynct is
  'True zodra de bijlage(n) van deze kostenpost als document aan de SnelStart-inkoopboeking zijn gehangen. Kosten zonder bijlage worden meteen op true gezet.';

-- Kosten zonder bijlage hoeven nooit nagestuurd te worden.
update public.job_costs
   set snelstart_bijlage_gesynct = true
 where bijlage_url is null;

-- Zoekt de bijlagen die nog nagestuurd moeten worden: al geboekt, wél een
-- bijlage, nog niet meegestuurd.
create index if not exists job_costs_bijlage_nasturen_idx
  on public.job_costs (company_id)
  where snelstart_id is not null
    and bijlage_url is not null
    and snelstart_bijlage_gesynct = false;
