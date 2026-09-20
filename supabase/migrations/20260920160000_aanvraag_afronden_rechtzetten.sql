-- Aanvraag afronden: bestaande aanvragen rechtzetten en de fase-koppeling opruimen.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Vervolg op 20260920100000, dat `deals.afgerond_op` invoerde. Daarmee is
-- afronden een kenmerk van de aanvraag zelf geworden en niet langer een fase.
-- Twee dingen bleven achter:
--
--   1. 18 aanvragen stonden in een fase die "Afgerond" heet, met afgerond_op
--      leeg. Ze golden dus als lopend en stonden gewoon op het pipelinebord —
--      precies de klacht waarvoor afronden is gebouwd.
--   2. Het moment "Klus afgerond" in Instellingen duwde een deal naar die fase.
--      Nu die kolom van het bord verdwijnt zou zo'n deal onzichtbaar worden:
--      geen kolom om in te staan, en ook niet afgerond. Daarom vervalt dat
--      moment, hier en in PIPELINE_MOMENTEN.
--
-- Dat moment was in de praktijk al dood: bb_deal_naar_fase wordt maar door één
-- functie aangeroepen (bb_offerte_akkoord_gevolgen) en uitsluitend met
-- 'akkoord'. Er heeft dus nooit iets automatisch naar "Afgerond" geduwd. Het
-- opruimen haalt geen werkend automatisme weg.
--
-- De fase zelf blijft bestaan. 20260920100000 bewaart bewust waar een aanvraag
-- stond toen hij werd afgerond; de fase verwijderen zou stage_id op NULL zetten
-- (ON DELETE SET NULL) en juist die geschiedenis wissen. Alleen de kolom
-- verdwijnt, en dat gebeurt in de frontend.

-- ── Welk moment telt als afrondmoment? ──────────────────────────────────────
-- `deals` heeft geen updated_at, dus "de laatste wijziging" bestaat niet. Het
-- eerlijkste moment is wanneer het werk klaar was. Geteld over de 16 gewonnen
-- aanvragen in zo'n fase:
--
--   13x  de laatste afgeronde werkbon van die aanvraag
--    1x  geen werkbon, wel een offerte  -> aanmaakmoment van die offerte
--    2x  geen van beide                 -> aanmaakmoment van de aanvraag
--
-- De 2 verloren aanvragen krijgen GEEN afgerond_op: die zijn niet afgerond maar
-- afgeketst. Ze verhuizen wel naar de Verloren-fase van hun eigen bedrijf,
-- anders staan ze straks in een fase zonder kolom. Elk getroffen bedrijf heeft
-- precies één Verloren-fase (gecontroleerd). De trigger bb_deal_status_uit_fase
-- houdt ze hoe dan ook op 'lost': verloren blijft verloren.


-- ── 1. Gewonnen aanvragen krijgen hun afrondmoment ──────────────────────────
update public.deals d
   set afgerond_op = coalesce(
     (select max(w.afgerond_op) from public.werkbonnen w where w.deal_id = d.id),
     (select max(o.created_at)  from public.offertes  o where o.deal_id = d.id),
     d.created_at
   )
  from public.pipeline_stages ps
 where ps.id = d.stage_id
   and ps.name ~* 'afgerond'
   and d.status = 'won'
   and d.afgerond_op is null;


-- ── 2. Verloren aanvragen naar de Verloren-fase ─────────────────────────────
update public.deals d
   set stage_id = v.id
  from public.pipeline_stages ps
  join public.pipeline_stages v
    on v.company_id = ps.company_id
   and v.name ~* 'verlor'
 where ps.id = d.stage_id
   and ps.name ~* 'afgerond'
   and d.status = 'lost';


-- ── 3. Het moment "Klus afgerond" vervalt ───────────────────────────────────
delete from public.pipeline_koppelingen where moment = 'afgerond';


-- ── 4. Nieuwe bedrijven krijgen die fase en koppeling niet meer ─────────────
-- Zelfde functie, twee dingen eruit: de fase 'Afgerond' en de koppeling
-- ('afgerond', 'Afgerond'). De fasen erna schuiven een plek op, zodat er geen
-- gat in position valt — de ON CONFLICT hangt op (company_id, position).
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
revoke all on function public.seed_default_pipeline_stages(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_pipeline_stages(uuid) to service_role;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- deals
notify pgrst, 'reload schema';
