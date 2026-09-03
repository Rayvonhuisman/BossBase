-- Drie gaten uit de dashboardcontrole van 02-09.
--
-- Alle drie zijn met echte sessies van twee bedrijven aangetoond, niet uit de
-- policies afgeleid. Ze zitten los van elkaar maar horen bij dezelfde ronde.


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Factuur- en offertetotalen waren onuitgelogd op te vragen én te schrijven
-- ═══════════════════════════════════════════════════════════════════════════
-- bb_factuurtotalen(uuid) is SECURITY DEFINER, filtert niet op bedrijf en stond
-- open voor anon. Gemeten:
--
--     anon → bb_factuurtotalen(<factuur van een ander bedrijf>)
--       200  [{"excl":3908.44,"incl":4729.21}]
--
-- bb_herbereken_factuurtotalen gaf 204: dat schrijft de herberekende totalen
-- terug op de factuur van dat andere bedrijf. Zelfde verhaal voor de offertes.
--
-- ── Waarom dit met een REVOKE wordt opgelost en niet alleen met een filter ──
-- Deze vier worden ook door de triggers aangeroepen (trg_factuur_regels_totalen
-- en trg_facturen_totalen_forceren, plus de offerte-varianten). Zo'n trigger
-- draait NIET in de sessie van een gebruiker: importeert een edge function met
-- de service-role een factuurregel, dan is auth.uid() leeg. Een harde
-- `company_id = current_company_id()` zou de herberekening daar stilletjes
-- uitzetten — en scheve factuurtotalen zijn erger dan het gat dat we dichten.
--
-- De echte oplossing is dus de EXECUTE intrekken. Dat kan hier zonder iets te
-- breken: de app roept deze vier nergens aan (gecontroleerd), en de vier
-- triggerfuncties zijn SECURITY DEFINER met postgres als eigenaar, dus zij
-- blijven ze gewoon aanroepen ongeacht wat een client mag.
--
-- Het bedrijfsfilter komt er tóch bij, als tweede slot: mocht iemand later per
-- ongeluk opnieuw EXECUTE toekennen (zie de default-privileges-valkuil in
-- CLAUDE.md), dan is het gat daarmee niet meteen terug. De uitzondering voor
-- "geen sessie" houdt het triggerpad heel.

create or replace function public.bb_factuurtotalen(p_factuur_id uuid)
returns table(excl numeric, incl numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  with toegang as (
    -- Geen sessie = trigger of backend: doorlaten. Wél een sessie: dan moet de
    -- factuur van het eigen bedrijf zijn.
    select auth.uid() is null
        or exists (select 1 from public.facturen f
                    where f.id = p_factuur_id and f.company_id = current_company_id()) as mag
  ),
  per_tarief as (
    select coalesce(fr.btw_pct, 21)          as pct,
           coalesce(fr.btw_regime, 'normaal') as regime,
           sum(round(coalesce(fr.regelprijs, 0), 2)) as excl
      from public.factuur_regels fr, toegang t
     where fr.factuur_id = p_factuur_id and t.mag
     group by 1, 2
  ),
  totalen as (
    select round(sum(excl), 2) as excl,
           -- Vrijgesteld en verlegd leveren geen btw op, ongeacht het
           -- percentage dat er toevallig bij staat. Zo blijft het totaal gelijk
           -- aan wat de boekhouding geboekt krijgt.
           sum(case when regime in ('vrijgesteld', 'verlegd') then 0
                    else round(excl * pct / 100, 2) end) as btw
      from per_tarief
  )
  select excl, round(excl + btw, 2) from totalen where excl is not null;
$$;

create or replace function public.bb_offertetotalen(p_offerte_id uuid)
returns table(excl numeric, incl numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  with toegang as (
    select auth.uid() is null
        or exists (select 1 from public.offertes o
                    where o.id = p_offerte_id and o.company_id = current_company_id()) as mag
  ),
  per_tarief as (
    select coalesce(oi.btw_pct, 21)          as pct,
           coalesce(oi.btw_regime, 'normaal') as regime,
           sum(round(coalesce(oi.subtotaal, 0), 2)) as excl
      from public.offerte_items oi, toegang t
     where oi.offerte_id = p_offerte_id and t.mag
     group by 1, 2
  ),
  totalen as (
    select round(sum(excl), 2) as excl,
           sum(case when regime in ('vrijgesteld', 'verlegd') then 0
                    else round(excl * pct / 100, 2) end) as btw
      from per_tarief
  )
  select excl, round(excl + btw, 2) from totalen where excl is not null;
$$;

-- De schrijvende varianten blijven inhoudelijk gelijk; ze erven de afscherming
-- van de rekenfunctie hierboven (geen toegang → geen rijen → geen update).
-- Alleen de rechten gaan eraf.
revoke all on function public.bb_factuurtotalen(uuid)            from public, anon, authenticated;
revoke all on function public.bb_herbereken_factuurtotalen(uuid) from public, anon, authenticated;
revoke all on function public.bb_offertetotalen(uuid)            from public, anon, authenticated;
revoke all on function public.bb_herbereken_offertetotalen(uuid) from public, anon, authenticated;

grant execute on function public.bb_factuurtotalen(uuid)            to service_role;
grant execute on function public.bb_herbereken_factuurtotalen(uuid) to service_role;
grant execute on function public.bb_offertetotalen(uuid)            to service_role;
grant execute on function public.bb_herbereken_offertetotalen(uuid) to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. readonly_leveranciers stond als enige van 23 op PERMISSIVE
-- ═══════════════════════════════════════════════════════════════════════════
-- Permissive policies worden ge-OR'd. Deze policy checkt alleen
-- bb_mag_schrijven() en geen bedrijf, dus hij zette de bedrijfscontrole van de
-- policy ernaast buitenspel. Gemeten: een gewone medewerker van bedrijf A kreeg
-- 201 op het aanmaken van een leverancier bij bedrijf B, en die rij stond er
-- daadwerkelijk.
--
-- De andere 22 readonly_*-policies staan wél op RESTRICTIVE. Ook nagelopen of
-- er meer permissive gates waren: leverancier_tijdlijn_insert en
-- materialen_insert zijn permissive maar dragen hun eigen company_id-check, dus
-- die zijn in orde. Dit was de enige.
--
-- Permissive/restrictive is niet te wijzigen met ALTER POLICY; dat vraagt een
-- drop en een create.

drop policy if exists readonly_leveranciers on public.leveranciers;
create policy readonly_leveranciers on public.leveranciers
  as restrictive for insert to public
  with check (bb_mag_schrijven());


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Elke medewerker kon het bedrijfsprofiel herschrijven
-- ═══════════════════════════════════════════════════════════════════════════
-- "Users can update own company" controleerde alleen lidmaatschap. Gemeten: een
-- medewerker kon met één PATCH de bedrijfsnaam wijzigen (204, en de naam stond
-- daarna echt anders). Dat raakt ook adres, KvK, BTW-nummer, huisstijlkleur en
-- het antwoord-mailadres — allemaal velden die op facturen, offertes en in
-- uitgaande mail terechtkomen. Het adminscherm zat in de UI, niet in de API.
--
-- Zelfde vorm als de policies op accounting_connections: bedrijf én rol, in
-- USING én WITH CHECK. De super-admin-policy ernaast blijft ongemoeid.

drop policy if exists "Users can update own company" on public.companies;
create policy "Users can update own company" on public.companies
  for update to public
  using (
    id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  )
  with check (
    id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Deze migratie bestaat vrijwel volledig uit REVOKE, GRANT en CREATE POLICY —
-- precies de commando's waar pgrst_ddl_watch niet op luistert.
notify pgrst, 'reload schema';
