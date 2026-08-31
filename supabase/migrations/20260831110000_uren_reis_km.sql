-- Gereden kilometers op de urenregel.
--
-- Puur de data vastleggen: hoeveel kilometer hoorde bij deze uren. Geen tarief,
-- geen berekening, geen instelling — wat we er bij het factureren mee doen is
-- een latere beslissing. Het veld mag leeg blijven en dat is ook het normale
-- geval.
--
-- Bewust NIET als uursoort "Reiskosten", zoals in de oude opzet: reistijd en
-- reisafstand zijn twee verschillende dingen, en ze in één veld persen was
-- precies waarom die oude urentypes verwarrend waren. De uursoort "Reisuren"
-- gaat over de tijd; deze kolom over de afstand.

alter table public.urenregistratie
  add column if not exists reis_km numeric;

comment on column public.urenregistratie.reis_km is
  'Gereden kilometers bij deze uren. Alleen registratie — er hangt geen tarief of berekening aan.';

alter table public.urenregistratie
  drop constraint if exists urenregistratie_reis_km_chk;
alter table public.urenregistratie
  add constraint urenregistratie_reis_km_chk check (reis_km is null or reis_km >= 0);
