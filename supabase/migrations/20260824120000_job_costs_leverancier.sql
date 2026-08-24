-- Leverancier bij een kostenpost.
--
-- Aanleiding: alle kosten belandden in SnelStart onder één fictieve
-- verzamelrelatie "BossBase kosten (controleren)". Dat is rommelig in andermans
-- boekhouding en niet uit te leggen aan een boekhouder. BossBase wist de
-- leverancier vaak wél, maar had er geen veld voor: in de UI stond
-- "Leverancier / omschrijving" als één invoerveld dat naar description schreef,
-- en de inkoopfactuur-import uit SnelStart gooide de leveranciersnaam weg.
--
-- Vrij tekstveld, bewust geen aparte leverancierstabel: dat zou een compleet
-- beheerscherm vragen. Tikfouten worden opgevangen met suggesties uit eerder
-- gebruikte namen binnen hetzelfde bedrijf (zie de index hieronder).
--
-- Optioneel: kosten zonder leverancier blijven werken en vallen in de
-- SnelStart-export terug op de bestaande verzamelrelatie.
--
-- Bestaande rijen blijven ongemoeid: description wordt niet aangeraakt en het
-- nieuwe veld begint leeg.

alter table public.job_costs add column if not exists leverancier text;

comment on column public.job_costs.leverancier is
  'Naam van de leverancier van deze kostenpost (vrij tekstveld, optioneel). Wordt in de boekhoudkoppeling als echte relatie aangemaakt; leeg betekent boeken onder de verzamelrelatie.';

-- Voedt de suggestielijst: per bedrijf de eerder gebruikte leveranciersnamen
-- opzoeken. Partieel, want het gros van de rijen heeft geen leverancier.
create index if not exists job_costs_company_leverancier_idx
  on public.job_costs (company_id, leverancier)
  where leverancier is not null;
