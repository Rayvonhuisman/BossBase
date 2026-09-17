-- ── Waarom ──────────────────────────────────────────────────────────────────
-- werkbonnen_insert was de laatste werkbon-policy die nog op profiles.role
-- toetste ('admin' of 'planner'), terwijl de rest van de app en de andere
-- policies op het rechtensysteem draaien. werkbonnen_update staat al op
-- bb_has_permission('planning') OR bb_has_permission('werkbonnen_bewerken').
--
-- Wat er misging: een medewerker met het recht 'werkbonnen_bewerken' mocht een
-- bestaande werkbon wél wijzigen maar geen nieuwe aanmaken. De app moest de
-- knop daarom op ROL verbergen in plaats van op recht — en wie dat niet deed,
-- kreeg een RLS-fout na het invullen van het hele formulier.
--
-- Deze migratie laat INSERT dezelfde rechten gebruiken als UPDATE.
-- bb_has_permission geeft zelf al true voor rol admin en planner, dus elk
-- bestaand account houdt precies wat het had; het toegekende recht komt erbij.
-- Niemand verliest toegang.
--
-- bb_gedeelde_werkruimte() zit hier BEWUST niet in, terwijl werkbonnen_update
-- hem wel heeft: meekijken in een gedeelde werkruimte is iets anders dan zelf
-- werkbonnen mogen aanmaken, en de knop in de app kent dat begrip niet. Moet
-- dat later wel, dan hoort de app in dezelfde stap mee te veranderen.
--
-- De restrictieve policy readonly_werkbonnen (bb_mag_schrijven) blijft staan:
-- een account zonder geldig abonnement schrijft nog steeds niets.


-- ── De wijziging ────────────────────────────────────────────────────────────

drop policy if exists werkbonnen_insert on public.werkbonnen;

create policy werkbonnen_insert on public.werkbonnen
  for insert
  with check (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and (
      public.bb_has_permission('planning')
      or public.bb_has_permission('werkbonnen_bewerken')
    )
  );


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- CREATE POLICY staat niet in de lijst van pgrst_ddl_watch, en PostgREST leest
-- rechten wél mee in zijn cache. Deze notify dus laten staan.
notify pgrst, 'reload schema';
