-- De inkoopprijs-check op job_costs één keer uitvoeren in plaats van per rij.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Sluitstuk van 20260920131715 en 20260920140500. Die twee haalden de
-- permissiechecks uit het per-rij-filter van de PERMISSIVE SELECT-policies.
-- Op job_costs bleef daarna nog één policy over met hetzelfde patroon, en dat
-- is de RESTRICTIVE:
--
--   werkbonmateriaal_kost_alleen_met_inkoop
--     using ((werkbon_materiaal_id is null) or bb_mag_inkoopprijs_zien())
--
-- bb_mag_inkoopprijs_zien() is STABLE, maar staat hier in een OR naast een
-- rij-afhankelijke voorwaarde (werkbon_materiaal_id is null). Daarmee hoort
-- hij bij het per-rij-filter en wordt hij per rij uitgevoerd — en de functie
-- leest zelf profiles én user_permissions:
--
--   select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
--       or exists (select 1 from user_permissions
--                   where user_id = auth.uid() and permission = 'inkoopprijzen' and granted)
--
-- Gemeten als admin op het testbedrijf (1.215 kostenregels):
--
--   select count(*) from job_costs   75 ms  ->  40 ms
--
-- Kleiner dan bij de eerste migratie (die ging van 2.462 naar 106 ms over acht
-- tabellen), maar job_costs is wel de tabel die op de Kosten-pagina en het
-- dashboard het zwaarst weegt.

-- ── Let op: dit is een RESTRICTIVE policy ───────────────────────────────────
-- RESTRICTIVE policies worden ge-AND'd met de permissive, niet ge-OR'd. Ze
-- kunnen dus alleen beperken, nooit verruimen. Deze bewaakt iets gevoeligs:
-- wie de inkoopprijs van werkbonmateriaal mag zien, en daarmee de marge op
-- materialen. Een fout hier zet inkoopprijzen open voor het hele team.
--
-- Daarom verandert er ook hier niets aan de logica: dezelfde twee termen,
-- dezelfde OR, alleen staat de functieaanroep nu in een scalar subquery zodat
-- de planner er een InitPlan van maakt. De rij-afhankelijke term
-- (werkbon_materiaal_id is null) blijft per rij, want die moet per rij.

-- ── Gecontroleerd vóór het pushen ───────────────────────────────────────────
-- Zie scripts/controleer-policy-zichtbaarheid.sql. Dat script telt job_costs
-- per rol, en juist hier is het verschil zichtbaar: een gebruiker zonder het
-- recht 'inkoopprijzen' ziet minder kostenregels dan een admin, omdat de
-- spiegelregels van werkbonmateriaal voor hem wegvallen. Blijft dat verschil
-- staan, dan doet de policy nog wat hij moet.


-- ── De wijziging ────────────────────────────────────────────────────────────
alter policy werkbonmateriaal_kost_alleen_met_inkoop on public.job_costs
  using (
    werkbon_materiaal_id is null
    or (select public.bb_mag_inkoopprijs_zien())
  );


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- pgrst_ddl_watch luistert niet op ALTER POLICY, en PostgREST leest rechten wel
-- mee in zijn cache. Hier dus zelf melden.
notify pgrst, 'reload schema';
