-- Kostenpost verwijst naar een leverancier in plaats van naar vrije tekst.
--
-- job_costs.leverancier (tekst) blijft bestaan en wordt NIET gedropt: dat maakt
-- deze stap omkeerbaar en voorkomt dataverlies als een naam niet te matchen is.
-- De nieuwe leverancier_id is leidend; het tekstveld loopt vanzelf leeg.

alter table public.job_costs
  add column if not exists leverancier_id uuid references public.leveranciers(id) on delete set null;

create index if not exists job_costs_leverancier_id_idx
  on public.job_costs (leverancier_id)
  where leverancier_id is not null;

comment on column public.job_costs.leverancier_id is
  'Verwijzing naar de leverancier van deze kostenpost. Leeg = boeken onder de verzamelrelatie in de boekhouding.';
comment on column public.job_costs.leverancier is
  'VERVALLEN — vrije tekst uit de periode vóór de leveranciers-tabel. Gebruik leverancier_id. Blijft staan zodat de migratie omkeerbaar is.';

-- ── backfill ────────────────────────────────────────────────────────────────
-- Per bedrijf één leverancier per unieke naam (hoofdletterongevoelig
-- ontdubbeld, de eerst geziene schrijfwijze wint), daarna de kosten koppelen.
with namen as (
  select distinct on (company_id, lower(trim(leverancier)))
         company_id,
         trim(leverancier) as naam
  from public.job_costs
  where leverancier is not null
    and trim(leverancier) <> ''
    and company_id is not null
  order by company_id, lower(trim(leverancier)), created_at
)
insert into public.leveranciers (company_id, naam)
select n.company_id, n.naam
from namen n
where not exists (
  select 1 from public.leveranciers l
  where l.company_id = n.company_id
    and lower(l.naam) = lower(n.naam)
);

update public.job_costs j
   set leverancier_id = l.id
  from public.leveranciers l
 where j.leverancier_id is null
   and j.leverancier is not null
   and trim(j.leverancier) <> ''
   and l.company_id = j.company_id
   and lower(l.naam) = lower(trim(j.leverancier));
