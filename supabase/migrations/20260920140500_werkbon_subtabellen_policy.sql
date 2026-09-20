-- werkbon_taken en werkbon_materialen leunen op de policy van werkbonnen, in
-- plaats van die te kopiëren.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Vervolg op 20260920131715, waar de permissiechecks in acht SELECT-policies
-- uit het per-rij-filter zijn gehaald. Deze drie subtabellen bleven daar
-- bewust buiten, omdat hun policy een andere vorm heeft:
--
--   exists (select 1 from werkbonnen w where w.id = ... and <het hele
--           permissieblok van werkbonnen, letterlijk overgeschreven>)
--
-- Na die migratie viel op dat werkbon_dagen wél snel was (11,7 ms voor 313
-- rijen) en de andere twee niet:
--
--   werkbon_taken        221,8 ms   1.092 rijen
--   werkbon_materialen   226,8 ms     774 rijen
--
-- Het verschil zit in de policy zelf. werkbon_dagen_select is alleen:
--
--   exists (select 1 from werkbonnen w where w.id = werkbon_dagen.werkbon_id)
--
-- Zonder eigen permissieblok. Die subquery leest werkbonnen, dus RLS past
-- daar de policy van werkbonnen toe — en die is nu gehesen. werkbon_dagen
-- erfde de verbetering dus gratis.
--
-- De andere twee hebben het permissieblok van werkbonnen gedupliceerd. In het
-- plan is te zien wat dat kost: de EXISTS wordt een hashed SubPlan (dus één
-- keer uitgevoerd, dat is goed), maar het opbouwen van die lijst van 220
-- zichtbare werkbonnen kost 200 ms, omdat dáárin de checks per rij staan:
--
--   Seq Scan on werkbon_taken (actual time=203.021..203.343 rows=1074)
--     Filter: (ANY (werkbon_id = (hashed SubPlan 8).col1))
--     SubPlan 8
--       -> Result (actual time=5.692..201.941 rows=220)
--
-- Ze gaan nu dezelfde kant op als werkbon_dagen: alleen de koppeling, en het
-- oordeel over wie een werkbon mag zien laten ze aan werkbonnen_select.

-- ── Waarom dat veilig is ────────────────────────────────────────────────────
-- Dit is meer dan haakjes verschuiven: er verdwijnt een voorwaarde uit de
-- policy. Dat mag alleen als hij niets toevoegde, en dat is hier zo:
--
--   1. Het gekopieerde blok is woord voor woord dezelfde voorwaarde als
--      werkbonnen_select (company_id uit profiles, plus dezelfde OR met
--      bb_gedeelde_werkruimte, planning, alles_inzien, assigned_to en
--      assigned_to_ids).
--   2. De subquery leest de tabel werkbonnen, en RLS geldt ook binnen een
--      policy-subquery. De rijen die daar doorkomen zijn dus al precies de
--      werkbonnen die deze gebruiker mag zien.
--
-- De dubbele voorwaarde filterde daarom niets extra weg; hij werd alleen nog
-- een keer uitgerekend. Erger: het is een kopie die kan gaan afwijken. Wie
-- morgen werkbonnen_select aanpast, verandert stilzwijgend niets aan taken en
-- materialen — precies het soort verschil dat niemand opmerkt tot iemand te
-- veel of te weinig ziet. Eén plek waar staat wie een werkbon mag zien is
-- veiliger dan drie kopieën.
--
-- werkbon_dagen blijft ongemoeid: die heeft deze vorm al.

-- ── Gecontroleerd vóór het pushen ───────────────────────────────────────────
-- De wijziging is in een teruggedraaide transactie toegepast en daarna is de
-- zichtbaarheid per rol geteld, mét en zónder de feature gedeelde_werkruimte.
-- Uitkomst, identiek vóór en ná (taken/materialen/dagen):
--
--   gedeeld AAN   admin      1074/765/287
--                 monteur1   1074/765/287
--
--   gedeeld UIT   admin      1074/765/287
--                 planner    1074/765/287
--                 monteur1    412/294/121
--
-- De onderste regel is het bewijs: monteur1 ziet zonder gedeelde werkruimte
-- nog steeds alleen de taken, materialen en dagen van zijn eigen werkbonnen.
--
-- Snelheid: werkbon_taken 221,8 ms -> 5,66 ms.


-- ── De wijziging ────────────────────────────────────────────────────────────
alter policy werkbon_taken_select on public.werkbon_taken
  using (
    exists (
      select 1 from public.werkbonnen w
      where w.id = werkbon_taken.werkbon_id
    )
  );

alter policy werkbon_materialen_select on public.werkbon_materialen
  using (
    exists (
      select 1 from public.werkbonnen w
      where w.id = werkbon_materialen.werkbon_id
    )
  );


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- pgrst_ddl_watch luistert niet op ALTER POLICY, en PostgREST leest rechten wel
-- mee in zijn cache. Hier dus zelf melden.
notify pgrst, 'reload schema';
