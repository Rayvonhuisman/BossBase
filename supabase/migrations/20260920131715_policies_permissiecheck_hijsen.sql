-- Permissiechecks in de SELECT-policies één keer uitvoeren in plaats van per rij.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De lijstpagina's waren traag zonder dat er veel data in het spel was. Gemeten
-- op het testbedrijf (220 werkbonnen, 350 activiteiten), als ingelogde
-- gebruiker met RLS aan:
--
--   select count(*) from activities   ->  357 ms
--   select count(*) from werkbonnen   ->  227 ms
--
-- Dat is ~1 ms per rij, en het zit niet in de data. In het queryplan staat:
--
--   Index Scan using idx_activities_company on activities
--     (actual time=4.218..400.933 rows=350 loops=1)
--     Filter: (bb_gedeelde_werkruimte() OR bb_has_permission('planning') OR ...)
--
-- De index vindt de eerste rij in 4 ms; de resterende 400 ms is het filter. De
-- policy roept bb_gedeelde_werkruimte() en bb_has_permission() aan, en die
-- doen elk een query op profiles, user_permissions en de planfeatures. Per rij.
--
-- Beide functies zijn al STABLE. Dat is hier niet genoeg: STABLE geeft Postgres
-- toestemming om een resultaat binnen één statement te hergebruiken, maar geen
-- opdracht. Zodra de aanroep in een OR staat samen met een rij-afhankelijke
-- voorwaarde (assigned_to = auth.uid()), hoort hij bij het per-rij-filter en
-- wordt hij per rij uitgevoerd.
--
-- Dit is dus een andere kwaal dan migratie 20260919200000. Daar stond
-- current_company_id() op VOLATILE en hielp STABLE maken. Die functie gedraagt
-- zich inmiddels goed: in de plannen hieronder staat hij als InitPlan met
-- loops=1. De zusterfuncties in de OR-tak niet.
--
-- De oplossing is de rij-onafhankelijke helft in een scalar subquery zetten.
-- Dan maakt de planner er een InitPlan van: één keer uitvoeren, uitkomst
-- hergebruiken. De rij-afhankelijke helft (assigned_to, assigned_to_ids, de
-- EXISTS-takken) blijft staan waar hij staat en blijft dus gewoon per rij
-- filteren.
--
--   Filter: ((InitPlan 2).col1 OR (assigned_to = ...) OR (... = ANY (assigned_to_ids)))
--
-- Gemeten na de wijziging, dezelfde queries:
--
--   activities   357 ms -> 4,07 ms
--   werkbonnen   227 ms -> 4,49 ms
--
-- Het patroon staat al in deze database: website_forms_select is zo
-- geschreven. Supabase beveelt het aan in zijn RLS-performancehandleiding.

-- ── Wat hier NIET verandert ─────────────────────────────────────────────────
-- Er gaat geen term bij en er gaat er geen af. Alleen de haakjes verschuiven,
-- en dus mag geen enkele gebruiker één rij meer of minder zien. De verruiming
-- van 5b3aacf (gedeelde werkruimte ook voor deals, facturen, offertes en
-- kosten) blijft ongemoeid; elke policy hieronder is letterlijk overgenomen uit
-- pg_policies zoals hij ná die migratie in productie stond.
--
-- Niet meegenomen, met opzet:
--
--   * werkbon_dagen, werkbon_taken en werkbon_materialen. Die policies hebben
--     een andere vorm: EXISTS (select 1 from werkbonnen w where ...) met de
--     permissiechecks BINNEN de EXISTS. Die wordt sowieso per rij uitgevoerd,
--     dus hijsen binnen de EXISTS helpt maar half. Gemeten: de geneste
--     werkbon_dagen kost 270 ms van de 602 ms van een werkbonnen-query met
--     dagen erbij. Verdient een eigen migratie en een eigen afweging.
--   * customers. Die policy is alleen company_id = current_company_id(), zonder
--     permissiecheck. Er valt niets te hijsen.
--   * De RESTRICTIVE policy werkbonmateriaal_kost_alleen_met_inkoop op
--     job_costs. Die hangt aan bb_mag_inkoopprijs_zien() en gaat over
--     inkoopprijzen — een zwaardere categorie, en RESTRICTIVE gedraagt zich
--     anders (AND in plaats van OR). Wel een kandidaat, niet hier.
--   * Alle UPDATE-, INSERT- en DELETE-policies. Die draaien per rij die je
--     aanraakt, niet per rij die je leest; daar is niets te winnen.

-- ── Gecontroleerd vóór het pushen ───────────────────────────────────────────
-- De hele migratie is in een teruggedraaide transactie toegepast en daarna is
-- scripts/controleer-policy-zichtbaarheid.sql gedraaid. Dat script telt per rol
-- alle acht tabellen, één keer mét en één keer zónder de feature
-- gedeelde_werkruimte — want met die feature aan is de eerste OR-tak altijd
-- waar en toetst de controle niets.
--
-- Uitkomst, identiek vóór en ná (act/wb/proj/off/deals/fact/kost/agenda):
--
--   gedeeld AAN   admin      350/220/75/151/110/164/1215/170
--                 planner    350/220/75/151/110/164/ 450/170
--                 monteur1   350/220/75/151/110/164/ 450/170
--
--   gedeeld UIT   admin      350/220/75/151/110/164/1215/170
--                 planner    350/220/75/  0/  0/  0/ 124/170
--                 monteur1     0/ 86/52/  0/  0/  0/  22/ 31
--
-- Die onderste regel is het bewijs dat er niets is opengezet: monteur1 ziet
-- zonder gedeelde werkruimte alleen zijn eigen toegewezen werk (86 van 220
-- werkbonnen, 52 van 75 projecten) en niets van de financiële tabellen. Het
-- verschil 450 vs 1215 bij job_costs komt van de RESTRICTIVE policy op
-- inkoopprijzen, die hier ongemoeid blijft en gewoon blijft werken.
--
-- Snelheid, alle acht tellingen samen in één transactie als admin:
--
--   2.462 ms  ->  114 ms


-- ── De wijziging ────────────────────────────────────────────────────────────
-- ALTER POLICY, geen drop-and-create: rollen en commando blijven staan en er is
-- geen moment waarop de tabel zonder policy ligt. ALTER POLICY ... USING (...)
-- laat een bestaand WITH CHECK-deel ongemoeid (gecontroleerd op
-- werkbonnen_update); deze policies hebben er geen, want het zijn SELECT's.

alter policy "Users can view own company activities" on public.activities
  using (
    company_id = public.current_company_id()
    and (
      (select public.bb_gedeelde_werkruimte()
           or public.bb_has_permission('planning')
           or public.bb_has_permission('agenda_inzien'))
      or assigned_to = auth.uid()
      or auth.uid() = any (assigned_to_ids)
    )
  );

alter policy werkbonnen_select on public.werkbonnen
  using (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and (
      (select public.bb_gedeelde_werkruimte()
           or public.bb_has_permission('planning')
           or public.bb_has_permission('alles_inzien'))
      or assigned_to = auth.uid()
      or auth.uid() = any (assigned_to_ids)
    )
  );

-- De EXISTS-tak blijft per rij draaien: hij hangt aan projects.id en kan dus
-- niet buiten de rij om worden beantwoord.
alter policy projects_select on public.projects
  using (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and (
      (select public.bb_gedeelde_werkruimte()
           or public.bb_has_permission('alles_inzien'))
      or assigned_to = auth.uid()
      or exists (
        select 1
        from public.werkbonnen w
        where w.project_id = projects.id
          and (w.assigned_to = auth.uid() or auth.uid() = any (w.assigned_to_ids))
      )
    )
  );

alter policy offertes_select on public.offertes
  using (
    company_id = public.current_company_id()
    and (select public.bb_gedeelde_werkruimte() or public.bb_has_permission('offertes'))
  );

alter policy deals_select on public.deals
  using (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and (select public.bb_gedeelde_werkruimte() or public.bb_has_permission('verkoop'))
  );

alter policy facturen_select on public.facturen
  using (
    company_id = public.current_company_id()
    and (select public.bb_gedeelde_werkruimte() or public.bb_has_permission('facturen'))
  );

-- job_costs: de werkbon-tak hangt aan job_costs.werkbon_id en blijft dus per
-- rij. bb_has_permission('werkbonnen_bewerken') staat binnen die tak maar is
-- zelf rij-onafhankelijk; die gaat mee naar boven, zodat hij niet per
-- werkbon-rij opnieuw wordt beantwoord.
alter policy "Users can view own company job costs" on public.job_costs
  using (
    company_id = public.current_company_id()
    and (
      (select public.bb_gedeelde_werkruimte() or public.bb_has_permission('kosten'))
      or (
        werkbon_id is not null
        and (
          (select public.bb_has_permission('werkbonnen_bewerken'))
          or exists (
            select 1
            from public.werkbonnen w
            where w.id = job_costs.werkbon_id
              and w.company_id = public.current_company_id()
              and auth.uid() = any (w.verantwoordelijke_ids)
          )
        )
      )
    )
  );

alter policy "Users can view own company calendar events" on public.calendar_events
  using (
    company_id = public.current_company_id()
    and (
      (select public.bb_gedeelde_werkruimte()
           or public.bb_has_permission('planning')
           or public.bb_has_permission('agenda_inzien'))
      or assigned_to = auth.uid()
      or exists (
        select 1
        from public.activities a
        where a.id = calendar_events.activiteit_id
          and (a.assigned_to = auth.uid() or auth.uid() = any (a.assigned_to_ids))
      )
      or exists (
        select 1
        from public.werkbonnen w
        where w.id = calendar_events.werkbon_id
          and (w.assigned_to = auth.uid() or auth.uid() = any (w.assigned_to_ids))
      )
    )
  );


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- pgrst_ddl_watch luistert niet op ALTER POLICY, en PostgREST leest rechten wel
-- mee in zijn cache. Hier dus zelf melden.
notify pgrst, 'reload schema';
