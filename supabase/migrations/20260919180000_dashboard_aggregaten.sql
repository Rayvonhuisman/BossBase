-- De grafieken van het dashboard in de database optellen, niet in de browser.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Het dashboard haalde alle facturen (218) en alle kostenregels (1257) op om
-- vier dingen te tekenen: zes maanden omzet, zes maanden winst, de verdeling
-- van factuurstatussen en de zes duurste klanten. Gemeten op de productiebuild
-- stond het daardoor pas na 4,1 seconden; en het is de eerste pagina die
-- iedereen ziet. Die lijsten zijn nergens anders voor nodig.
--
-- ── Dezelfde uitkomsten als deriveCharts() ─────────────────────────────────
-- De definities zijn letterlijk overgenomen uit DashboardHome.deriveCharts,
-- zodat er niets verschuift:
--
--   omzet per maand  — facturen die niet 'concept' zijn, op factuurdatum, EXCL.
--                      btw (sumOmzetExclBtw). Creditfacturen staan negatief in
--                      de boeken en trekken zichzelf er vanzelf af.
--   winst per maand  — die omzet min de kosten van dezelfde maand.
--   kosten           — job_costs ZONDER werkbon_materiaal_id: alleen boekingen,
--                      want werkbonmateriaal is geen boeking (20260915130000).
--   factuurstatus    — betaald / verzonden met vervaldatum in het verleden
--                      ('Te laat') / verzonden ('Openstaand') / de rest
--                      ('Concept'), geteld per bucket.
--   kosten per klant — top 6 op bedrag. LET OP de terugval: een kost hangt aan
--                      customer_id, en als die leeg is aan de klant van zijn
--                      deal. Zonder die terugval verhuist 63.906,39 naar de
--                      post "Overig" en klopt de grafiek niet meer.
--
-- ── Gecontroleerd vóór het schrijven ────────────────────────────────────────
-- Met de hand gedraaid op TEST Stamvol Bouw BV: omzet apr 83.562,82, mei
-- 138.698,91, jun 83.568,87, jul 65.510,27, aug 111.319,15; kosten apr
-- 24.639,41 t/m sep 13.026,74; factuurstatus Betaald 137, Te laat 17,
-- Openstaand 6, Concept 4.
--
-- ── Rechten ─────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: de RLS van facturen, job_costs, deals en customers blijft
-- gelden, dus je ziet alleen je eigen bedrijf. Geen company_id-parameter die je
-- zou kunnen vervalsen.
--
-- Raakt geen data; dit maakt alleen een leesfunctie aan.


create or replace function public.bb_dashboard_aggregaten(p_maanden int default 6)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with grenzen as (
    select date_trunc('month', current_date)::date - ((greatest(p_maanden, 1) - 1) || ' months')::interval as vanaf
  ),
  maanden as (
    select generate_series((select vanaf from grenzen),
                           date_trunc('month', current_date),
                           interval '1 month')::date as maand
  ),
  omzet as (
    select date_trunc('month', factuurdatum)::date as maand, sum(totaal_excl) as bedrag
      from facturen
     where status <> 'concept'
       and factuurdatum >= (select vanaf from grenzen)
     group by 1
  ),
  kosten as (
    select date_trunc('month', cost_date)::date as maand, sum(amount) as bedrag
      from job_costs
     where werkbon_materiaal_id is null
       and cost_date >= (select vanaf from grenzen)
     group by 1
  ),
  reeks as (
    select m.maand,
           round(coalesce(o.bedrag, 0), 2) as omzet,
           round(coalesce(o.bedrag, 0) - coalesce(k.bedrag, 0), 2) as winst
      from maanden m
      left join omzet o on o.maand = m.maand
      left join kosten k on k.maand = m.maand
     order by m.maand
  ),
  status_telling as (
    select case
             when status = 'betaald' then 'Betaald'
             when status = 'verzonden' and vervaldatum < current_date then 'Te laat'
             when status = 'verzonden' then 'Openstaand'
             else 'Concept'
           end as bucket,
           count(*) as aantal
      from facturen
     group by 1
  ),
  per_klant as (
    -- customer_id, en anders de klant van de deal: zo telt de browser het ook.
    select coalesce(c.name, 'Overig') as klant, sum(j.amount) as bedrag
      from job_costs j
      left join deals d on d.id = j.deal_id
      left join customers c on c.id = coalesce(j.customer_id, d.customer_id)
     where j.werkbon_materiaal_id is null
     group by 1
    having sum(j.amount) > 0
     order by sum(j.amount) desc
     limit 6
  )
  select jsonb_build_object(
    'maanden', coalesce((select jsonb_agg(jsonb_build_object(
        'maand', to_char(maand, 'YYYY-MM'), 'omzet', omzet, 'winst', winst)) from reeks), '[]'::jsonb),
    'factuurstatus', coalesce((select jsonb_object_agg(bucket, aantal) from status_telling), '{}'::jsonb),
    'kosten_per_klant', coalesce((select jsonb_agg(jsonb_build_object(
        'klant', klant, 'bedrag', round(bedrag, 2))) from per_klant), '[]'::jsonb)
  )
$function$;

-- Supabase geeft EXECUTE op een nieuwe functie automatisch aan anon en
-- authenticated; `revoke ... from public` haalt die er NIET af. Daarom met naam.
revoke all on function public.bb_dashboard_aggregaten(int) from public, anon, authenticated;
grant execute on function public.bb_dashboard_aggregaten(int) to authenticated;

notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen.
select
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(r.rolname, 'public.bb_dashboard_aggregaten(int)', 'EXECUTE')) as uitvoerbaar_door,
  (select count(*) from pg_proc
    where proname = 'bb_dashboard_aggregaten' and pronamespace = 'public'::regnamespace) as functies;
