-- Zelf kiezen welke pipelinefasen als stap in de conversiefunnel staan.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De funnel op het dashboard toonde sinds b59ddf6 ELKE fase als stap. Dat is
-- trouw aan de pipeline, maar een bedrijf met twaalf fasen krijgt een trechter
-- van dertien stappen waarin niets meer opvalt. De fasen zijn werkvoorraad;
-- een funnel gaat over de paar momenten waarop een aanvraag een horde neemt.
--
-- Daarom een vinkje per fase, op de fase-rij zelf. Koppelen op stage_id is
-- daarmee vanzelf geregeld: hernoemen raakt de selectie niet, want de naam
-- staat nergens in de instelling.

-- ── De standaardselectie ────────────────────────────────────────────────────
-- Aan: de eerste fase (binnengekomen), "Offerte verstuurd" (prijs de deur uit)
-- en "Akkoord" (ja gekregen). Plus de vaste slotstap "Afgeronde aanvragen",
-- die niet uit een fase komt maar uit deals.afgerond_op en dus altijd blijft.
--
-- Uit: "Contact nodig", "Info compleet" en "Offerte maken" zijn werkvoorraad —
-- ze zeggen iets over je eigen achterstand, niet over conversie. "Wacht op
-- akkoord" valt samen met het versturen van de offerte. "Gepland", "In
-- uitvoering", "Gefactureerd" en "Betaald" gaan over uitvoering ná de gunning;
-- dat deel staat al in de slotstap.

-- ── Let op bij het matchen op naam ──────────────────────────────────────────
-- Zes bedrijven hebben "Nieuwe aanvragen", één heeft "Nieuwe aanvraag". Het
-- Nederlandse meervoud laat de dubbele klinker vallen, dus:
--
--   'nieuwe aanvraag'  matcht ALLEEN het enkelvoud  (aanvr-aa-g)
--   'nieuwe aanvrag'   matcht ALLEEN het meervoud   (aanvr-a-gen)
--   'nieuwe aanvra'    matcht allebei               <- deze
--
-- Beide eerste patronen zijn geprobeerd en lieten stilzwijgend zes van de zeven
-- bedrijven met een funnel van twee stappen achter. Geteld met de stam
-- hieronder: alle 7 bedrijven krijgen precies 3 aangevinkte fasen.
--
-- Voor "Akkoord" staat er bewust een exacte vergelijking: ~* 'akkoord' zou ook
-- "Wacht op akkoord" aanvinken.

-- ── De telling verandert niet ───────────────────────────────────────────────
-- Een aanvraag telt mee in een stap zodra hij die fase heeft BEREIKT (de
-- volgorde komt uit alle fasen, niet uit de selectie). Vink je een tussenfase
-- uit, dan telt een aanvraag die daar staat door naar de dichtstbijzijnde
-- aangevinkte stap ervoor. Er valt dus niets buiten de telling.

alter table public.pipeline_stages
  add column in_funnel boolean not null default false;

comment on column public.pipeline_stages.in_funnel is
  'Telt deze fase mee als stap in de conversiefunnel op het dashboard? De volgorde volgt position. Leeg/false = niet tonen; de stap "Afgeronde aanvragen" staat er altijd achter en komt niet uit deze tabel.';


-- ── Bestaande bedrijven de standaardselectie geven ──────────────────────────
update public.pipeline_stages
   set in_funnel = true
 where name ~* 'nieuwe aanvra'
    or name ~* 'offerte verstuurd'
    or name = 'Akkoord';


-- ── Nieuwe bedrijven krijgen dezelfde selectie ──────────────────────────────
create or replace function public.seed_default_pipeline_stages(p_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF p_company IS NULL THEN RETURN; END IF;

  INSERT INTO public.pipeline_stages (company_id, name, position, color_class, in_funnel)
  SELECT p_company, s.name, s.position, s.color_class, s.in_funnel
  FROM (VALUES
    ('Nieuwe aanvragen',  1,  'b-new',      true),
    ('Contact nodig',     2,  'b-orange',   false),
    ('Info compleet',     3,  'b-blue',     false),
    ('Offerte maken',     4,  'b-blue',     false),
    ('Offerte verstuurd', 5,  'b-orange',   true),
    ('Wacht op akkoord',  6,  'b-orange',   false),
    ('Akkoord',           7,  'b-green',    true),
    ('Gepland',           8,  'b-planned',  false),
    ('In uitvoering',     9,  'b-progress', false),
    ('Gefactureerd',     10,  'b-blue',     false),
    ('Betaald',          11,  'b-accepted', false),
    ('Verloren',         12,  'b-lost',     false)
  ) AS s(name, position, color_class, in_funnel)
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
--     npm run migratie:check -- pipeline_stages
notify pgrst, 'reload schema';
