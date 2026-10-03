-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M1, deel 2 van 2 (zie 20261003093758_projectbedragen_in_database.sql).
-- Nu de frontend de bedragen via bb_projectbedragen / bb_werkbonmateriaal_bedragen
-- leest en overal expliciete kolommen selecteert, verliest authenticated het
-- leesrecht op de bedragkolommen zelf. Alleen draaien als de frontend met die
-- wijziging live staat (bundelgrep).

begin;

-- 1. Kolomrechten
revoke select on table public.projects from authenticated;
grant select (id, company_id, customer_id, deal_id, offerte_id, name, description, status,
              quoted_hours, start_date, deadline, owner_id, created_by, created_at, updated_at,
              assigned_to, waarde_bron)
  on table public.projects to authenticated;

revoke select on table public.werkbon_materialen from authenticated;
grant select (id, werkbon_id, company_id, naam, eenheid, aantal, created_at, updated_at,
              materiaal_id, leverancier_id, btw_percentage)
  on table public.werkbon_materialen to authenticated;

notify pgrst, 'reload schema';

select
  has_column_privilege('authenticated', 'public.projects', 'project_value', 'SELECT')           as ziet_projectwaarde_moet_false,
  has_column_privilege('authenticated', 'public.projects', 'geschatte_waarde', 'SELECT')        as ziet_schatting_moet_false,
  has_column_privilege('authenticated', 'public.projects', 'name', 'SELECT')                    as ziet_naam_moet_true,
  has_column_privilege('authenticated', 'public.werkbon_materialen', 'prijs_per', 'SELECT')     as ziet_prijs_moet_false,
  has_column_privilege('authenticated', 'public.werkbon_materialen', 'subtotaal', 'SELECT')     as ziet_subtotaal_moet_false,
  has_column_privilege('authenticated', 'public.projects', 'project_value', 'UPDATE')           as mag_projectwaarde_schrijven;

commit;
