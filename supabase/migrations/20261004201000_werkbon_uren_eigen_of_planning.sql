-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De SELECT-policy op werkbon_uren is sinds de tabel bestaat (20260831140000):
--
--     company_id = current_company_id()
--
-- Elke medewerker leest dus van elke collega op welke dag hij van hoe laat tot
-- hoe laat werkte, met pauze, reiskilometers en notitie, ook op bonnen die hij
-- zelf niet mag zien. Met een uurtarief erbij is dat de loonkost van een
-- collega. Dit was het laatste onderdeel van de audit van 8 september dat nog
-- open stond; 20261002135712 zette het SCHRIJVEN al op "eigen regel, of
-- zeggenschap over de bon" (bb_mag_uren_voor_ander), het lezen niet.
--
-- Gemeten lokaal op een database gelijk aan productie, medewerker zonder enig
-- recht: 1 werkbon zichtbaar (de eigen), 3 urenregels zichtbaar waarvan 2 van
-- de collega, 11 uur van de collega op te tellen.
--
-- ── De regels na deze migratie ──────────────────────────────────────────────
-- Productbesluit 4-10-2026, regel 7: een medewerker ziet standaard alleen eigen
-- werkbonuren; admins en wie het recht `planning` heeft bekijken en beheren
-- teamuren.
--
--   lezen       eigen regels, of bb_mag_uren_voor_ander(werkbon_id)
--   schrijven   ongewijzigd (20261002135712): eigen regel, of bb_mag_uren_voor_ander
--   verwijderen eigen regels, of bb_mag_uren_voor_ander — tot nu toe kon iedereen
--               die op de bon stond élke regel op die bon verwijderen
--
-- bb_mag_uren_voor_ander() is: actieve admin, of het recht planning, of
-- verantwoordelijke van díé bon. Die laatste tak is de enige afwijking van de
-- letterlijke regel 7: een voorman ziet op zijn eigen bon de uren van zijn
-- ploeg. Zonder die tak kan hij ze wel boeken (schrijfpolicy van 2 oktober)
-- maar niet terugzien, en strandt .insert().select() in werkbonUrenService.
-- Bewust zo gelaten; wil je het strenger, dan is het één functie aanpassen.
--
-- alles_inzien ("alle projecten en werkbonnen inzien") geeft geen uren: uren
-- per persoon zijn iets anders dan een werkbon. De gedeelde werkruimte ook
-- niet; urenregistratie deelde ook nooit werkruimte-breed.
--
-- ── Gevolg voor schermen en totalen ─────────────────────────────────────────
-- Alles wat werkbon_uren leest volgt de RLS: het urenblok op de werkbonkaart,
-- de urenpagina, de projectkaart, de nacalculatie, de export en
-- bb_uren_per_project() (SECURITY INVOKER). Een gebruiker zonder planning ziet
-- daar alleen zijn eigen uren; in de nacalculatie dus de kosten wel en de uren
-- van anderen niet. Wie de nacalculatie compleet moet zien krijgt planning.
-- De ondertekenpagina en de PDF lopen via get_werkbon_uren_by_sign_token() op
-- token en veranderen niet.
--
-- Terugdraaien: supabase/rollback/20261004201000_werkbon_uren_eigen_of_planning.rollback.sql

begin;

alter policy werkbon_uren_select on public.werkbon_uren
  using (
    company_id = public.current_company_id()
    and (profile_id = auth.uid() or public.bb_mag_uren_voor_ander(werkbon_id))
  );

alter policy werkbon_uren_delete on public.werkbon_uren
  using (
    company_id = public.current_company_id()
    and public.bb_mag_werkbon_uren_beheren(werkbon_id)
    and (profile_id = auth.uid() or public.bb_mag_uren_voor_ander(werkbon_id))
  );

comment on policy werkbon_uren_select on public.werkbon_uren is
  'Eigen uren, of zeggenschap (admin, recht planning, verantwoordelijke van deze bon). Toewijzing aan een bon, alles_inzien en gedeelde_werkruimte geven GEEN toegang tot de uren van collega''s. Tot 20261004201000 stond hier alleen een company_id-controle.';

select policyname, cmd,
       coalesce(qual, with_check) ~ 'profile_id = auth.uid\(\)' as eigen_regel_vereist
  from pg_policies
 where schemaname = 'public' and tablename = 'werkbon_uren' and permissive = 'PERMISSIVE'
 order by cmd;

commit;

notify pgrst, 'reload schema';
