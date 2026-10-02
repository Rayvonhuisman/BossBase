-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M18: "Openstaand" had drie uitkomsten.
--   - Facturen-tegel: creditnota's telden mee (€ −9.799,10); F3 haalde ze eruit,
--     maar sloeg daarmee ook het restant van een gedeeltelijk gecrediteerde,
--     nog openstaande factuur over (die staat dan op gecrediteerd = true).
--   - Financiën en export: "gefactureerd − betaald", waardoor een betaalde en
--     daarna gecrediteerde factuur als nog te ontvangen telde (€ 145.352,63).
--
-- Eén definitie, hier, en de frontend volgt dezelfde regel
-- (customerTotalsService.openstaandPerFactuur):
--   een factuur die verstuurd is en nog niet betaald (status verzonden of
--   geboekt), geen creditnota zelf, met als bedrag zijn totaal plus de
--   creditnota's die naar hem verwijzen (credit_van_factuur_id), nooit onder 0.
-- Een creditnota op een al betaalde factuur is geld dat terug moet, geen
-- openstaande vordering, en telt dus niet.
--
-- Stamvol (2026-10-02): 19 verzonden facturen € 138.310,98, geen van de 4
-- creditnota's hoort bij een openstaande factuur → openstaand € 138.310,98.

begin;

create or replace function public.bb_openstaand_per_factuur()
returns table (factuur_id uuid, customer_id uuid, bedrag numeric, vervaldatum date)
language sql
stable
security invoker
set search_path = public
as $$
  select f.id, f.customer_id,
         greatest(0, f.totaal_incl + coalesce((
           select sum(c.totaal_incl) from facturen c
            where c.credit_van_factuur_id = f.id and coalesce(c.is_credit, false)
              and c.status <> 'concept'), 0)) as bedrag,
         f.vervaldatum
    from facturen f
   where f.status in ('verzonden', 'geboekt')
     and coalesce(f.is_credit, false) = false;
$$;

revoke all on function public.bb_openstaand_per_factuur() from public, anon;
grant execute on function public.bb_openstaand_per_factuur() to authenticated, service_role;

create or replace function public.bb_financien_kpi(p_van date, p_tot date)
returns jsonb
language sql
stable
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

    -- Momentopname, zonder tijdvak. Eén definitie: bb_openstaand_per_factuur.
    'openstaand', coalesce((select sum(bedrag) from public.bb_openstaand_per_factuur()), 0),

    'te_verwachten', coalesce((
      select sum(totaal_incl) from offertes where status = 'geaccepteerd'), 0),

    'kosten', coalesce((
      select sum(amount) from job_costs
       where werkbon_materiaal_id is null
         and cost_date between p_van and p_tot), 0)
  )
$function$;

notify pgrst, 'reload schema';

select
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r, pg_proc p
    where p.proname = 'bb_openstaand_per_factuur' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rechten_openstaand,
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r, pg_proc p
    where p.proname = 'bb_financien_kpi' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rechten_kpi;

commit;
