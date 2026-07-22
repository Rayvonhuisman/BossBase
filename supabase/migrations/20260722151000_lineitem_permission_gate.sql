-- =============================================================================
-- BossBase: factuur_regels / offerte_items — permissie-gate gelijk aan de kop
-- Bestand : supabase/migrations/20260722151000_lineitem_permission_gate.sql
--
-- Probleem: de koptabellen zijn achter een recht gezet
--   facturen_select : company_id = current_company_id() AND bb_has_permission('facturen')
--   offertes_select : company_id = current_company_id() AND bb_has_permission('offertes')
-- maar de REGEL-tabellen waren alleen company-scoped, zónder de rechtcheck. Een
-- medewerker zonder het recht 'facturen'/'offertes' zag in de UI niets, maar kon
-- via PostgREST rechtstreeks alle factuur-/offerteregels (bedragen, omschrijvingen)
-- van het bedrijf uitlezen. Deze migratie trekt de regel-policies gelijk met de kop.
--
-- Publieke onderteken-/betaalflows lezen offerte_items via SECURITY DEFINER
-- token-RPC's (get_offerte_items_by_token) die RLS omzeilen — die blijven werken.
-- =============================================================================

drop policy if exists "factuur_regels_select" on public.factuur_regels;
create policy "factuur_regels_select" on public.factuur_regels
  for select using (
    company_id = current_company_id()
    and bb_has_permission('facturen')
  );

drop policy if exists "offerte_items_select" on public.offerte_items;
create policy "offerte_items_select" on public.offerte_items
  for select using (
    company_id = current_company_id()
    and bb_has_permission('offertes')
  );
