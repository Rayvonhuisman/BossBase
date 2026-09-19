-- De KPI's van Financiën in de database optellen, niet in de browser.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De Financiën-pagina haalde vijf volledige tabellen op om zes getallen te
-- tonen: 218 facturen, 758 factuurregels, 1257 kostenregels, 187 offertes en
-- 176 klanten. Gemeten op de productiebuild (TEST Stamvol Bouw BV) stonden de
-- tegels daardoor pas na 7,0 seconden. Dat is werk dat Postgres in één query
-- doet, en het loopt alleen maar verder op naarmate een bedrijf groeit.
--
-- De definities zijn LETTERLIJK die van customerTotalsService en de tegels; de
-- bedoeling is dat er geen cent verschuift:
--
--   gefactureerd  — alles wat niet 'concept' is, op factuurdatum, incl. btw.
--                   Een creditfactuur staat negatief in de boeken en trekt
--                   zichzelf er dus vanzelf af.
--   ontvangen     — alleen status 'betaald', en niet een creditfactuur of een
--                   factuur die zélf gecrediteerd is, op betaaldatum.
--   openstaand    — gefactureerd min betaald over ALLE periodes. Dat is per
--                   definitie een verschil en nooit een eigen optelling; zo kan
--                   het ook niet negatief worden.
--   te_verwachten — geaccepteerde offertes, zonder tijdvak.
--   kosten        — job_costs ZONDER werkbon_materiaal_id: alleen boekingen.
--                   Werkbonmateriaal is geen boeking (migratie 20260915130000);
--                   meetellen zou dezelfde inkoop dubbel tellen.
--
-- ── Gecontroleerd vóór het schrijven ────────────────────────────────────────
-- Dezelfde optellingen met de hand gedraaid voor september 2026 en vergeleken
-- met wat het scherm op dat moment toonde. Beide: gefactureerd 14.812,16,
-- ontvangen 39.090,48, openstaand 145.352,63, te verwachten 651.713,46, kosten
-- 13.026,74.
--
-- ── Rechten ─────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: de RLS van facturen, offertes en job_costs blijft gelden,
-- dus je ziet alleen je eigen bedrijf. Bewust géén company_id-parameter — die
-- zou een aanroeper kunnen invullen met het id van een ander bedrijf.
--
-- Raakt geen data; dit maakt alleen een leesfunctie aan.


create or replace function public.bb_financien_kpi(p_van date, p_tot date)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'gefactureerd', coalesce((
      select sum(totaal_incl) from facturen
       where status <> 'concept'
         and factuurdatum between p_van and p_tot), 0),

    'ontvangen', coalesce((
      select sum(totaal_incl) from facturen
       where status = 'betaald'
         and coalesce(is_credit, false) = false
         and coalesce(gecrediteerd, false) = false
         and betaald_op between p_van and p_tot), 0),

    -- Zonder tijdvak: openstaand is een momentopname van alles wat nog niet
    -- binnen is, net als de kolom Openstaand per klant.
    'openstaand',
      coalesce((select sum(totaal_incl) from facturen where status <> 'concept'), 0)
      - coalesce((select sum(totaal_incl) from facturen
           where status = 'betaald'
             and coalesce(is_credit, false) = false
             and coalesce(gecrediteerd, false) = false), 0),

    'te_verwachten', coalesce((
      select sum(totaal_incl) from offertes where status = 'geaccepteerd'), 0),

    'kosten', coalesce((
      select sum(amount) from job_costs
       where werkbon_materiaal_id is null
         and cost_date between p_van and p_tot), 0)
  )
$function$;

-- Supabase geeft EXECUTE op een nieuwe functie automatisch aan anon en
-- authenticated; `revoke ... from public` haalt die er NIET af. Daarom met naam.
revoke all on function public.bb_financien_kpi(date, date) from public, anon, authenticated;
grant execute on function public.bb_financien_kpi(date, date) to authenticated;

notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen. De
-- functie zelf aanroepen zegt hier weinig: als `postgres` ziet RLS alles, dus
-- dat zouden andere getallen zijn dan een ingelogde gebruiker krijgt.
select
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(r.rolname, 'public.bb_financien_kpi(date,date)', 'EXECUTE')) as uitvoerbaar_door,
  (select count(*) from pg_proc
    where proname = 'bb_financien_kpi' and pronamespace = 'public'::regnamespace) as functies;
