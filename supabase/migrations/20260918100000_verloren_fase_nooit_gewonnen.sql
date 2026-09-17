-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De fase "Verloren" staat in de standaardpijplijn ná "Akkoord". De regel
-- "vanaf de Akkoord-fase is een deal gewonnen" (migratie 20260917180000) keek
-- alleen naar de positie, en zette een deal die in de Verloren-fase belandde
-- daardoor op 'won' — tenzij de aanroeper zelf status 'lost' meestuurde.
--
-- In de app gebeurde dat altijd: slepen naar Verloren loopt via markDealLost,
-- dat fase, reden én status in één UPDATE zet. Maar dat is een afspraak in de
-- frontend, geen regel in de database. Een import, een script of een directe
-- API-call die alleen stage_id zet, maakte van een verloren deal een gewonnen
-- deal. Dat gat zit nu dicht.
--
-- Zelfde aanpak als de rest: geen naamlogica ("heet de fase 'verloren'?"), maar
-- een moment in pipeline_koppelingen op fase-id. Hernoemen breekt dus niets, en
-- wie een eigen pijplijn heeft kan zelf aanwijzen welke fase 'verloren'
-- betekent.
--
-- Volgorde in de trigger is nu: eerst de Verloren-fase (die wint altijd), dan
-- "verloren blijft verloren", dan pas de akkoord-positie.
--
-- Gemeten vóór het draaien: 7 bedrijven met een fase "Verloren"; 11 deals met
-- status 'lost' in het testbedrijf, en 0 deals die in de Verloren-fase stonden
-- met een andere status.

begin;

-- ── 1. Moment 'verloren' ────────────────────────────────────────────────────
alter table public.pipeline_koppelingen drop constraint if exists pipeline_koppelingen_moment_check;
alter table public.pipeline_koppelingen add constraint pipeline_koppelingen_moment_check
  check (moment in ('akkoord', 'gepland', 'in_uitvoering', 'afgerond', 'gefactureerd', 'betaald', 'verloren'));

insert into public.pipeline_koppelingen (company_id, moment, stage_id)
select s.company_id, 'verloren', s.id
  from public.pipeline_stages s
 where lower(s.name) = 'verloren'
on conflict (company_id, moment) do nothing;

create or replace function public.seed_default_pipeline_stages(p_company uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
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
    ('Afgerond',         10,  'b-done'),
    ('Gefactureerd',     11,  'b-blue'),
    ('Betaald',          12,  'b-accepted'),
    ('Verloren',         13,  'b-lost')
  ) AS s(name, position, color_class)
  ON CONFLICT (company_id, position) DO NOTHING;

  INSERT INTO public.pipeline_koppelingen (company_id, moment, stage_id)
  SELECT p_company, m.moment, s.id
    FROM public.pipeline_stages s
    JOIN (VALUES
      ('akkoord', 'Akkoord'), ('gepland', 'Gepland'), ('in_uitvoering', 'In uitvoering'),
      ('afgerond', 'Afgerond'), ('gefactureerd', 'Gefactureerd'), ('betaald', 'Betaald'),
      ('verloren', 'Verloren')
    ) AS m(moment, naam) ON s.name = m.naam
   WHERE s.company_id = p_company
  ON CONFLICT (company_id, moment) DO NOTHING;
END;
$$;

revoke all on function public.seed_default_pipeline_stages(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_pipeline_stages(uuid) to service_role;

-- ── 2. De Verloren-fase wint altijd ─────────────────────────────────────────
create or replace function public.bb_deal_status_uit_fase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_verloren    uuid;
  v_akkoord_pos int;
  v_pos         int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  -- In de Verloren-fase is een deal verloren, wat de aanroeper ook meestuurt.
  SELECT stage_id INTO v_verloren
    FROM public.pipeline_koppelingen
   WHERE company_id = NEW.company_id AND moment = 'verloren';

  IF v_verloren IS NOT NULL AND NEW.stage_id = v_verloren THEN
    NEW.status := 'lost';
    RETURN NEW;
  END IF;

  -- Verloren blijft verloren, ook als hij later ergens anders heen gaat.
  IF NEW.status = 'lost' THEN
    RETURN NEW;
  END IF;

  SELECT ps.position INTO v_akkoord_pos
    FROM public.pipeline_koppelingen k
    JOIN public.pipeline_stages ps ON ps.id = k.stage_id
   WHERE k.company_id = NEW.company_id AND k.moment = 'akkoord';

  IF v_akkoord_pos IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT position INTO v_pos FROM public.pipeline_stages WHERE id = NEW.stage_id;
  IF v_pos IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.status := CASE WHEN v_pos >= v_akkoord_pos THEN 'won' ELSE 'open' END;
  RETURN NEW;
END;
$$;

revoke all on function public.bb_deal_status_uit_fase() from public, anon, authenticated;

-- ── 3. Bestaande deals in de Verloren-fase rechtzetten ──────────────────────
update public.deals d
   set status = 'lost'
  from public.pipeline_koppelingen k
 where k.company_id = d.company_id
   and k.moment = 'verloren'
   and d.stage_id = k.stage_id
   and d.status is distinct from 'lost';

commit;

notify pgrst, 'reload schema';
