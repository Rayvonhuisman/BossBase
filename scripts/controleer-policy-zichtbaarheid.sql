-- Zichtbaarheidscontrole per rol. Draai dit vóór en ná elke wijziging aan een
-- SELECT-policy; de aantallen moeten per rol exact gelijk blijven.
--
--   supabase db query --linked -f scripts/controleer-policy-zichtbaarheid.sql
--
-- Waarom dit script bestaat: bij het herschrijven van een policy is snelheid de
-- makkelijke helft. Een policy die sneller is maar méér rijen teruggeeft is een
-- lek, en dat zie je niet aan een queryplan. Een eerdere meting leek te laten
-- zien dat twee medewerkers van 0 naar 350 activiteiten sprongen; dat bleek een
-- fout in de meetopstelling (de claims waren niet actief, dus auth.uid() was
-- leeg en company_id = null gaf nul rijen). Vandaar dat hier auth.uid() ALTIJD
-- naast de telling staat: is die leeg, dan is de meting ongeldig en zegt het
-- aantal niets.
--
-- Let op de tweede helft. Met de feature gedeelde_werkruimte aan is de eerste
-- tak van elke OR altijd waar en ziet iedereen alles — dan toetst de controle
-- niets. Het tweede blok zet die feature in een teruggedraaide transactie uit,
-- zodat de rij-afhankelijke takken (assigned_to, assigned_to_ids) echt meedoen.
--
-- Gebruikers van het testbedrijf (zie memory testaccount-stamvol):
--   ...0001 niels     admin
--   ...0004 planner   medewerker met recht 'planning'
--   ...0008 monteur1  medewerker, alleen eigen toegewezen werk
--
-- Bij een ander bedrijf: vervang de uuid's en het company_id hieronder.

-- ── Blok 1: zoals het bedrijf nu staat ──────────────────────────────────────
begin;

create temporary table zichtbaarheid (
  blok      text,
  wie       text,
  uid       uuid,
  gedeeld   boolean,
  activities bigint,
  werkbonnen bigint,
  projects   bigint,
  offertes   bigint,
  deals      bigint,
  facturen   bigint,
  job_costs  bigint,
  agenda     bigint,
  -- De subtabellen van een werkbon leunen op werkbonnen_select; ze staan hier
  -- omdat een wijziging daar stilzwijgend doorwerkt op deze drie.
  wb_taken   bigint,
  wb_mat     bigint,
  wb_dagen   bigint
) on commit drop;

-- Meten gebeurt als de gebruiker, wegschrijven niet: de temp-tabel is van
-- postgres en `authenticated` mag er niet in schrijven. Dus eerst alle
-- tellingen in variabelen, dan de rol terug, dan pas de insert.
create or replace function pg_temp.meet(p_blok text, p_wie text, p_uid uuid)
returns void language plpgsql as $$
declare
  v_uid uuid; v_gedeeld boolean;
  v_act bigint; v_wb bigint; v_proj bigint; v_off bigint;
  v_deals bigint; v_fact bigint; v_kost bigint; v_agenda bigint;
  v_taken bigint; v_mat bigint; v_dagen bigint;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
                     true);
  set local role authenticated;

  select auth.uid(), public.bb_gedeelde_werkruimte() into v_uid, v_gedeeld;
  select count(*) into v_act    from public.activities;
  select count(*) into v_wb     from public.werkbonnen;
  select count(*) into v_proj   from public.projects;
  select count(*) into v_off    from public.offertes;
  select count(*) into v_deals  from public.deals;
  select count(*) into v_fact   from public.facturen;
  select count(*) into v_kost   from public.job_costs;
  select count(*) into v_agenda from public.calendar_events;
  select count(*) into v_taken  from public.werkbon_taken;
  select count(*) into v_mat    from public.werkbon_materialen;
  select count(*) into v_dagen  from public.werkbon_dagen;

  reset role;
  insert into zichtbaarheid values
    (p_blok, p_wie, v_uid, v_gedeeld, v_act, v_wb, v_proj, v_off,
     v_deals, v_fact, v_kost, v_agenda, v_taken, v_mat, v_dagen);
end $$;

-- Zet de feature expliciet AAN voor het tier van dit bedrijf. Niet aannemen dat
-- hij aanstaat: gedeelde_werkruimte zit alleen in het groei-pakket, dus bij een
-- bedrijf op starter of team is hij uit en zou dit blok stilletjes hetzelfde
-- meten als blok 2. Alles binnen de transactie; de rollback zet het terug.
insert into public.plan_features (plan, feature)
select public.bb_effective_tier('7e57c0de-0000-4000-b000-000000000000'::uuid), 'gedeelde_werkruimte'
on conflict do nothing;

select pg_temp.meet('1 gedeeld AAN', 'niels-admin', '7e57c0de-0000-4000-b000-000000000001');
select pg_temp.meet('1 gedeeld AAN', 'planner',     '7e57c0de-0000-4000-b000-000000000004');
select pg_temp.meet('1 gedeeld AAN', 'monteur1',    '7e57c0de-0000-4000-b000-000000000008');

-- ── Blok 2: met gedeelde werkruimte uit ─────────────────────────────────────
-- Nu de strenge kant: hier tellen de rij-afhankelijke takken (assigned_to,
-- assigned_to_ids, de EXISTS-takken) echt mee. Dit is het blok dat een
-- rechtenlek zou laten zien.
delete from public.plan_features
 where feature = 'gedeelde_werkruimte'
   and plan = public.bb_effective_tier('7e57c0de-0000-4000-b000-000000000000'::uuid);

select pg_temp.meet('2 gedeeld UIT', 'niels-admin', '7e57c0de-0000-4000-b000-000000000001');
select pg_temp.meet('2 gedeeld UIT', 'planner',     '7e57c0de-0000-4000-b000-000000000004');
select pg_temp.meet('2 gedeeld UIT', 'monteur1',    '7e57c0de-0000-4000-b000-000000000008');

-- Alleen het laatste statement geeft rijen terug via de Management API, dus de
-- uitkomst staat hier en nergens anders.
select blok, wie,
       case when uid is null then 'ONGELDIG: geen auth.uid()' else 'ok' end as meting,
       gedeeld, activities, werkbonnen, projects, offertes, deals, facturen, job_costs, agenda,
       wb_taken, wb_mat, wb_dagen
from zichtbaarheid
order by blok, wie;

rollback;
