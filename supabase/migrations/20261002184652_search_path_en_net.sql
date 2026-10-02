-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (security-advisor, sec-dbfuncties E1):
-- 1. Acht functies in public hadden geen vaste search_path (advisor:
--    function_search_path_mutable). Het zijn invoker-functies (triggers en
--    seeding), maar een vaste search_path voorkomt dat een object in een ander
--    schema ongemerkt voorgaat. protect_profile_privileges kreeg hem al in
--    20261002182550.
-- 2. anon en authenticated hebben USAGE op schema net (pg_net). Dat recht is
--    verleend door supabase_admin (ook aan PUBLIC); postgres kan het niet
--    intrekken (een revoke doet dan stil niets, gemeten in een droogloop). Het
--    schema net is niet via de REST-API blootgesteld, dus via de app is het niet
--    bereikbaar. Bewust laten staan.
-- 3. pg_net zelf staat in public (advisor: extension_in_public). Verplaatsen
--    kan niet met ALTER EXTENSION … SET SCHEMA (pg_net ondersteunt dat niet) en
--    vraagt drop + create, wat de crons breekt. Bewust laten staan.

begin;

alter function public.materialen_touch_updated_at() set search_path = public;
alter function public.bb_set_updated_at() set search_path = public;
alter function public.bb_verwijst_naar(text, text, text) set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.trg_seed_pipeline_stages() set search_path = public;
alter function public.seed_default_lost_reasons(uuid) set search_path = public;
alter function public.trg_seed_lost_reasons() set search_path = public;
alter function public.leveranciers_touch_updated_at() set search_path = public;

notify pgrst, 'reload schema';

select
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))) as zonder_search_path_moet_0;

commit;
