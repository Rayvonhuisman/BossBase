-- De fasenkeuze van de conversiefunnel verhuist naar de tegel zelf.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Migratie 20260920170000 zette de keuze in pipeline_stages.in_funnel: per
-- BEDRIJF, en alleen een admin mocht eraan komen (policy pipeline_stages_update
-- eist die rol). Dat had twee gevolgen die niemand wilde:
--
--   1. Een niet-admin kon zijn eigen funnel niet bijstellen.
--   2. Een admin die zijn eigen dashboard aanpaste, veranderde meteen de funnel
--      van al zijn collega's.
--
-- De andere tegelinstellingen (Alle/Mijn/Team op Actieve deals, Vandaag/Week op
-- Agenda) staan al per gebruiker in dashboard_widgets.settings. De funnel volgt
-- dat patroon nu ook: settings.funnelStages is een lijst stage_id's.
--
-- Daarmee is er weer één plek. Het vinkje in Instellingen > Pipeline is weg, en
-- deze migratie haalt de kolom eronder vandaan.

-- ── De bestaande keuze eerst redden ─────────────────────────────────────────
-- Anders ziet iedereen na het uitrollen iets anders dan gisteren. De selectie
-- staat per bedrijf; elke funnel-tegel van dat bedrijf krijgt hem als eigen
-- beginwaarde. Op moment van schrijven zijn dat 2 tegels bij 2 bedrijven, en
-- hebben alle 7 bedrijven dezelfde drie fasen aangevinkt
-- (Nieuwe aanvragen > Offerte verstuurd > Akkoord).
--
-- jsonb_agg op position, zodat de trechter in pipelinevolgorde staat.
update public.dashboard_widgets w
   set settings = coalesce(w.settings, '{}'::jsonb)
                || jsonb_build_object('funnelStages', sel.ids),
       updated_at = now()
  from (
    select company_id, jsonb_agg(id order by position) as ids
      from public.pipeline_stages
     where in_funnel
     group by company_id
  ) sel
 where w.widget_type = 'conversion_funnel'
   and w.company_id = sel.company_id;


-- ── Nieuwe bedrijven: seed zonder in_funnel ─────────────────────────────────
-- Terug naar de versie van vóór 20260920170000. Wie geen keuze heeft, krijgt
-- een standaardselectie uit de frontend (standaardFunnelFasen in
-- utils/pipeline.js): de eerste fase, "Offerte verstuurd" en "Akkoord".
--
-- Die standaard pakt de eerste fase op POSITIE en niet op naam. Dat lost meteen
-- het probleem op waar 20260920170000 een stam voor nodig had: zes bedrijven
-- hebben "Nieuwe aanvragen", één "Nieuwe aanvraag".
create or replace function public.seed_default_pipeline_stages(p_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF p_company IS NULL THEN RETURN; END IF;

  INSERT INTO public.pipeline_stages (company_id, name, position, color_class)
  SELECT p_company, s.name, s.position, s.color_class
  FROM (VALUES
    ('Nieuwe aanvragen',  1,  'b-new'),
    ('Contact nodig',     2,  'b-orange'),
    ('Info compleet',     3,  'b-blue'),
    ('Offerte maken',     4,  'b-blue'),
    ('Offerte verstuurd', 5,  'b-orange'),
    ('Wacht op akkoord',  6,  'b-orange'),
    ('Akkoord',           7,  'b-green'),
    ('Gepland',           8,  'b-planned'),
    ('In uitvoering',     9,  'b-progress'),
    ('Gefactureerd',     10,  'b-blue'),
    ('Betaald',          11,  'b-accepted'),
    ('Verloren',         12,  'b-lost')
  ) AS s(name, position, color_class)
  ON CONFLICT (company_id, position) DO NOTHING;

  INSERT INTO public.pipeline_koppelingen (company_id, moment, stage_id)
  SELECT p_company, m.moment, s.id
    FROM public.pipeline_stages s
    JOIN (VALUES
      ('akkoord', 'Akkoord'), ('gepland', 'Gepland'), ('in_uitvoering', 'In uitvoering'),
      ('gefactureerd', 'Gefactureerd'), ('betaald', 'Betaald'),
      ('verloren', 'Verloren')
    ) AS m(moment, naam) ON s.name = m.naam
   WHERE s.company_id = p_company
  ON CONFLICT (company_id, moment) DO NOTHING;
END;
$$;

-- Rechten expliciet: een create or replace dat een drop-and-create wordt laat
-- anders de default privileges van Supabase terugkomen (zie CLAUDE.md).
-- Gecontroleerd vóór deze migratie: alleen service_role en postgres mochten hem
-- uitvoeren, dus dit zet precies terug wat er stond — de registratieflow loopt
-- niet als `authenticated` langs deze functie.
revoke all on function public.seed_default_pipeline_stages(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_pipeline_stages(uuid) to service_role;


-- ── En dan pas de kolom weg ─────────────────────────────────────────────────
-- Gecontroleerd: geen view, matview of index hangt aan pipeline_stages, dus er
-- valt niets om. De default (false) verdwijnt met de kolom mee.
alter table public.pipeline_stages drop column in_funnel;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- pipeline_stages dashboard_widgets
notify pgrst, 'reload schema';


-- ── Uitkomst ────────────────────────────────────────────────────────────────
-- NOTICE-regels komen niet terug via de Management API, alleen de rijen van het
-- laatste statement (CLAUDE.md). Verwacht: tegels_met_selectie = 2,
-- kolom_weg = true.
select
  (select count(*) from public.dashboard_widgets
    where widget_type = 'conversion_funnel'
      and jsonb_array_length(coalesce(settings->'funnelStages', '[]'::jsonb)) > 0
  ) as tegels_met_selectie,
  (select count(*) from public.dashboard_widgets
    where widget_type = 'conversion_funnel'
  ) as tegels_totaal,
  (select count(*) = 0 from information_schema.columns
    where table_schema = 'public' and table_name = 'pipeline_stages'
      and column_name = 'in_funnel'
  ) as kolom_weg;
