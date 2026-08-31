-- Uursoorten weer weg.
--
-- Ze zijn drie dagen geleden toegevoegd (20260831120000) als label op de
-- urenregel. In de praktijk voegen ze niets toe: kilometers en de opmerking
-- dekken wat we wilden vastleggen, en een keuzelijst die bij vrijwel iedereen op
-- "Normaal" blijft staan is een handeling zonder opbrengst.
--
-- WAT ER WEGGAAT — nagelopen op 31-08-2026, dit is alles wat eraan hing:
--   * tabel public.uursoorten (+ pkey, unique op (company_id, naam),
--     company-fk, index uursoorten_company_idx, vier RLS-policies)
--   * kolom urenregistratie.uursoort_id (+ fk, index urenregistratie_uursoort_idx)
--   * functies bb_zet_standaard_uursoorten() en bb_nieuwe_company_uursoorten()
--   * trigger trg_company_uursoorten op public.companies
-- Geen enkele view, functie of policy elders verwijst ernaar.
--
-- WAT ER AAN DATA VERDWIJNT: 18 rijen, drie standaardsoorten voor elk van de zes
-- bedrijven. Geen enkele zelf toegevoegde soort, en de zes urenregels stonden
-- allemaal op "Normaal" — dus niemand raakt iets kwijt dat hij zelf heeft
-- ingevoerd.
--
-- De kolom `type` blijft staan zoals hij was: vervallen, wordt niet geschreven,
-- en bewaart de historische waarde 'arbeid'.

-- Eerst de verwijzing vanuit de urenregel, anders houdt de foreign key de tabel
-- vast.
drop index if exists public.urenregistratie_uursoort_idx;
alter table public.urenregistratie drop column if exists uursoort_id;

-- Dan de trigger, vóór de functie die hij aanroept.
drop trigger if exists trg_company_uursoorten on public.companies;
drop function if exists public.bb_nieuwe_company_uursoorten();
drop function if exists public.bb_zet_standaard_uursoorten(uuid);

-- En als laatste de tabel zelf; policies, indexen en constraints gaan mee.
drop table if exists public.uursoorten;

comment on column public.urenregistratie.type is
  'VERVALLEN. Historische waarde (''arbeid''); wordt niet meer geschreven. Er is geen uursoort meer — kilometers en de opmerking leggen vast wat nodig is.';
