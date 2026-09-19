-- Gedeelde werkruimte: ook deals, facturen, offertes en kosten mogen gezien
-- worden zonder recht.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een Groei-bedrijf (1-2 personen) heeft geen `rollen_rechten` — die feature
-- zit pas in Team. De rechten-UI staat daar dus achter een slot, en
-- user_permissions blijft leeg. Tegelijk geeft bb_has_permission() alleen
-- `true` voor admin en planner, dus de tweede persoon (rol `medewerker`) had
-- nergens recht op en kon dat ook niet krijgen: niemand in dat bedrijf kán het
-- toekennen.
--
-- Voor agenda, projecten en werkbonnen was dat al opgelost — die policies
-- kennen bb_gedeelde_werkruimte(). Voor deals, facturen, offertes en de
-- hoofdtak van job_costs niet, en daar viel die tweede persoon dus in een gat:
-- op het dashboard bleven 8 van de 27 tegels over, en de tegels die hij wél
-- zag stonden op nul omdat de database de rijen niet gaf.
--
-- Dat is precies waar de gedeelde werkruimte voor bedoeld is. Een recht dat
-- niemand kan toekennen is geen bescherming maar een blokkade.
--
-- bb_gedeelde_werkruimte() is bb_has_feature('gedeelde_werkruimte'), en die
-- feature zit alleen in het Groei-pakket. Deze verruiming raakt dus uitsluitend
-- bedrijven van één of twee personen; Starter en Team veranderen niet.

-- ── Wat hier NIET in zit ────────────────────────────────────────────────────
-- 1. Alleen SELECT. Wie in een gedeelde werkruimte mag aanmaken en wijzigen is
--    een aparte afweging; dit gaat over wat je te zien krijgt.
-- 2. Inkoopprijzen blijven dicht. De tweede policy op job_costs
--    (werkbonmateriaal_kost_alleen_met_inkoop) hangt aan
--    bb_mag_inkoopprijs_zien() en gaat over marges op materialen — een
--    zwaardere categorie die hier ongemoeid blijft.


-- ── De wijziging ────────────────────────────────────────────────────────────
-- ALTER POLICY in plaats van drop-and-create: rollen en commando blijven staan,
-- en er is geen moment waarop de tabel zonder policy ligt.

alter policy deals_select on public.deals
  using (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and (public.bb_gedeelde_werkruimte() or public.bb_has_permission('verkoop'))
  );

alter policy facturen_select on public.facturen
  using (
    company_id = public.current_company_id()
    and (public.bb_gedeelde_werkruimte() or public.bb_has_permission('facturen'))
  );

alter policy offertes_select on public.offertes
  using (
    company_id = public.current_company_id()
    and (public.bb_gedeelde_werkruimte() or public.bb_has_permission('offertes'))
  );

-- job_costs had bb_gedeelde_werkruimte() al, maar alleen binnen de werkbon-tak:
-- kosten die aan een werkbon hingen kwamen door, losse kostenposten niet. Die
-- term verhuist naar het hoogste niveau, waar hij thuishoort, en verdwijnt uit
-- de werkbon-tak om hem niet twee keer te evalueren.
alter policy "Users can view own company job costs" on public.job_costs
  using (
    company_id = public.current_company_id()
    and (
      public.bb_gedeelde_werkruimte()
      or public.bb_has_permission('kosten')
      or (
        werkbon_id is not null
        and (
          public.bb_has_permission('werkbonnen_bewerken')
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

-- De uitleg beloofde minder dan de feature nu doet: "agenda, projecten en
-- werkbonnen" dekt deals, facturen, offertes en kosten niet. Bijgewerkt, zodat
-- de prijspagina en de super-admin hetzelfde vertellen als de database doet.
update public.plan_feature_defs
   set uitleg = 'Iedereen ziet alles van het bedrijf zonder rechtenbeheer: agenda, projecten, werkbonnen, deals, offertes, facturen en kosten. Past bij een bedrijf van één of twee personen.'
 where feature = 'gedeelde_werkruimte';


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- pgrst_ddl_watch luistert niet op ALTER POLICY, en PostgREST leest rechten wel
-- mee in zijn cache. Hier dus zelf melden.
notify pgrst, 'reload schema';
