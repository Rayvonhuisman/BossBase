-- De dashboard-widgets mee in het aggregaat, zodat facturen en kosten daar
-- helemaal niet meer opgehaald hoeven te worden.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Migratie 20260919180000 gaf de vier grafieken al uit de database. De lijsten
-- bleven toch opgehaald worden, want zes losse widgets rekenen er ook mee:
-- omzet deze maand, winst deze maand, kosten deze maand, kosten per klus, de
-- lijst openstaande facturen, en de twee grafiekwidgets. Alleen de grafieken
-- omzetten zou dus niets schelen én twee bronnen voor hetzelfde getal geven.
-- Daarom nu alles wat die widgets nodig hebben in één functie.
--
-- Wat het dashboard daarna NIET meer nodig heeft: getFacturen() en
-- listJobCosts() — samen 218 facturen en 1257 kostenregels bij elke bezoek.
-- "Te factureren" en "Beste klanten" rekenen met deals; die blijven zoals ze
-- zijn.
--
-- ── Dezelfde uitkomsten als de widgets nu ──────────────────────────────────
--   deze_maand.omzet     — facturen niet-concept, op factuurdatum, EXCL. btw
--                          (sumOmzetExclBtw). Let op: de tegel "Gefactureerd"
--                          op Financiën is incl. btw en dus een ander bedrag.
--   deze_maand.kosten    — job_costs zonder werkbon_materiaal_id, op cost_date.
--   deze_maand.winst     — omzet min kosten; marge rekent de frontend zelf.
--   kosten_per_klus      — een "klus" is deal_id, anders project_id, anders
--                          werkbon_id. Kosten zonder klus horen daar niet bij:
--                          die gingen het gemiddelde omlaag trekken (141 losse
--                          boekingen maakten er 216 klussen van in plaats van
--                          75, en 3.589 werd 1.542). Ze staan apart als
--                          "overig", precies zoals de widget ze toont.
--   open_facturen        — status gezet en niet betaald/concept/aangemaakt.
--                          Creditfacturen en gecrediteerde facturen tellen niet
--                          mee in het totaal (ze verlaagden het stilletjes met
--                          hun negatieve bedrag) maar staan apart in de voet.
--                          De lijst is de zes oudste; meer toont de widget niet.
--
-- ── Gecontroleerd vóór het schrijven ────────────────────────────────────────
-- Met de hand gedraaid op TEST Stamvol Bouw BV: omzet deze maand 12.241,45,
-- kosten deze maand 13.026,74 over 16 posten, 75 klussen met gemiddeld
-- 3.588,54 en 63.906,39 overig over 141 regels, 19 openstaande facturen voor
-- 138.310,98 met 4 credits voor -11.580,64.
--
-- ── Rechten ─────────────────────────────────────────────────────────────────
-- SECURITY INVOKER, dus RLS bepaalt welk bedrijf je ziet; geen company_id die
-- je zou kunnen vervalsen. Raakt geen data.


create or replace function public.bb_dashboard_aggregaten(p_maanden int default 6)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with grenzen as (
    select date_trunc('month', current_date)::date
             - ((greatest(p_maanden, 1) - 1) || ' months')::interval as vanaf,
           date_trunc('month', current_date)::date as maand_start
  ),
  maanden as (
    select generate_series((select vanaf from grenzen),
                           (select maand_start from grenzen),
                           interval '1 month')::date as maand
  ),
  omzet as (
    select date_trunc('month', factuurdatum)::date as maand, sum(totaal_excl) as bedrag
      from facturen
     where status <> 'concept' and factuurdatum >= (select vanaf from grenzen)
     group by 1
  ),
  kosten as (
    select date_trunc('month', cost_date)::date as maand, sum(amount) as bedrag
      from job_costs
     where werkbon_materiaal_id is null and cost_date >= (select vanaf from grenzen)
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
    select coalesce(c.name, 'Overig') as klant, sum(j.amount) as bedrag
      from job_costs j
      left join deals d on d.id = j.deal_id
      left join customers c on c.id = coalesce(j.customer_id, d.customer_id)
     where j.werkbon_materiaal_id is null
     group by 1
    having sum(j.amount) > 0
     order by sum(j.amount) desc
     limit 6
  ),
  -- Deze maand, voor de drie KPI-tegels.
  maand_omzet as (
    select coalesce(sum(totaal_excl), 0) as bedrag
      from facturen
     where status <> 'concept' and factuurdatum >= (select maand_start from grenzen)
  ),
  maand_kosten as (
    select coalesce(sum(amount), 0) as bedrag, count(*) as posten
      from job_costs
     where werkbon_materiaal_id is null and cost_date >= (select maand_start from grenzen)
  ),
  -- Kosten per klus: deal, anders project, anders werkbon. Zonder klus = overig.
  per_klus as (
    select coalesce(deal_id::text, project_id::text, werkbon_id::text) as klus, sum(amount) as bedrag
      from job_costs
     where werkbon_materiaal_id is null
     group by 1
  ),
  klus_totalen as (
    select count(*) filter (where klus is not null) as klussen,
           coalesce(round(avg(bedrag) filter (where klus is not null), 2), 0) as gemiddeld,
           coalesce(round(sum(bedrag) filter (where klus is null), 2), 0) as overig
      from per_klus
  ),
  -- Openstaand: status gezet, nog niet betaald, en geen concept.
  open_alle as (
    select id, nummer, totaal_incl, vervaldatum, customer_id, factuurdatum,
           (coalesce(is_credit, false) or coalesce(gecrediteerd, false)) as is_credit_rij
      from facturen
     where status is not null and status not in ('betaald', 'concept', 'aangemaakt')
  ),
  open_echt as (select * from open_alle where not is_credit_rij),
  open_lijst as (
    select o.id, o.nummer, o.totaal_incl, o.vervaldatum, c.name as klant
      from open_echt o
      left join customers c on c.id = o.customer_id
     order by o.factuurdatum asc nulls last
     limit 6
  )
  select jsonb_build_object(
    'maanden', coalesce((select jsonb_agg(jsonb_build_object(
        'maand', to_char(maand, 'YYYY-MM'), 'omzet', omzet, 'winst', winst)) from reeks), '[]'::jsonb),
    'factuurstatus', coalesce((select jsonb_object_agg(bucket, aantal) from status_telling), '{}'::jsonb),
    'kosten_per_klant', coalesce((select jsonb_agg(jsonb_build_object(
        'klant', klant, 'bedrag', round(bedrag, 2))) from per_klant), '[]'::jsonb),
    'deze_maand', jsonb_build_object(
      'omzet', round((select bedrag from maand_omzet), 2),
      'kosten', round((select bedrag from maand_kosten), 2),
      'kostenposten', (select posten from maand_kosten),
      'winst', round((select bedrag from maand_omzet) - (select bedrag from maand_kosten), 2)),
    'kosten_per_klus', jsonb_build_object(
      'klussen', (select klussen from klus_totalen),
      'gemiddeld', (select gemiddeld from klus_totalen),
      'overig', (select overig from klus_totalen)),
    'open_facturen', jsonb_build_object(
      'aantal', (select count(*) from open_echt),
      'bedrag', coalesce((select round(sum(totaal_incl), 2) from open_echt), 0),
      'credits_aantal', (select count(*) from open_alle where is_credit_rij),
      'credits_bedrag', coalesce((select round(sum(totaal_incl), 2) from open_alle where is_credit_rij), 0),
      'lijst', coalesce((select jsonb_agg(jsonb_build_object(
          'id', id, 'nummer', nummer, 'klant', klant,
          'totaal_incl', round(totaal_incl, 2), 'vervaldatum', vervaldatum)) from open_lijst), '[]'::jsonb))
  )
$function$;

-- Het retourtype verandert niet, dus create or replace houdt de bestaande
-- grants. Toch expliciet opnieuw zetten: als dit ooit een drop-and-create
-- wordt, zijn ze weg en geeft Supabase EXECUTE terug aan anon en authenticated.
revoke all on function public.bb_dashboard_aggregaten(int) from public, anon, authenticated;
grant execute on function public.bb_dashboard_aggregaten(int) to authenticated;

notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen.
select
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(r.rolname, 'public.bb_dashboard_aggregaten(int)', 'EXECUTE')) as uitvoerbaar_door;
