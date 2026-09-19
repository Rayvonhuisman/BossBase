-- De lijst openstaande facturen in dezelfde volgorde als de widget hem nu toont.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- In migratie 20260919190000 sorteerde ik die lijst op factuurdatum oplopend —
-- "de oudste eerst" leek logisch voor openstaande facturen. Maar zo werkt de
-- widget niet: hij krijgt de facturen binnen via getFacturen(), dat sorteert op
-- created_at aflopend (met id als tiebreaker), en neemt daar simpelweg de eerste
-- zes openstaande uit. Nieuwste eerst dus.
--
-- Gemeten op het scherm vóór de omzetting (TEST Stamvol Bouw BV): de widget
-- begint met BB-F159 (Iris van den Berg, 7.849,88). Mijn sortering gaf BB-F009
-- (Wit Projecten BV, 3.485,70). Zonder deze correctie zou de inhoud van de lijst
-- zichtbaar veranderen terwijl de bedoeling juist is dat er niets verschuift.
--
-- Alleen de ORDER BY van open_lijst wijzigt; de rest van de functie is gelijk
-- aan 20260919190000. Het retourtype verandert niet, dus create or replace
-- houdt de bestaande grants — ze worden er hieronder toch expliciet bij gezet.


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
  open_alle as (
    select id, nummer, totaal_incl, vervaldatum, customer_id, created_at,
           (coalesce(is_credit, false) or coalesce(gecrediteerd, false)) as is_credit_rij
      from facturen
     where status is not null and status not in ('betaald', 'concept', 'aangemaakt')
  ),
  open_echt as (select * from open_alle where not is_credit_rij),
  open_lijst as (
    select o.id, o.nummer, o.totaal_incl, o.vervaldatum, c.name as klant
      from open_echt o
      left join customers c on c.id = o.customer_id
     -- Zelfde volgorde als getFacturen(): nieuwste eerst, id als tiebreaker.
     order by o.created_at desc, o.id asc
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

revoke all on function public.bb_dashboard_aggregaten(int) from public, anon, authenticated;
grant execute on function public.bb_dashboard_aggregaten(int) to authenticated;

notify pgrst, 'reload schema';

select
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(r.rolname, 'public.bb_dashboard_aggregaten(int)', 'EXECUTE')) as uitvoerbaar_door;
