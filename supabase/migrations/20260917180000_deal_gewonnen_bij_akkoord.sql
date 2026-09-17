-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een deal telde pas als gewonnen doordat iemand dat ergens apart vastlegde —
-- en dat gebeurde nergens. Er bestond wél markDealLost (fase + reden + status
-- 'lost'), maar geen tegenhanger voor winnen. Gevolg: een klant die getekend
-- had, stond in de fase Akkoord terwijl deals.status nog 'open' was, en telde
-- dus mee als lopende omzet.
--
-- Vanaf nu volgt het winnen uit de FASE, net als de rest van de pipeline:
-- komt een deal in de fase die aan het moment 'akkoord' hangt (of verder), dan
-- is hij gewonnen. Gaat hij handmatig terug naar een fase ervóór, dan staat hij
-- weer open. Dat werkt voor alle routes tegelijk — handmatig slepen
-- (updateDealStage), de automatische koppeling (bb_deal_naar_fase) en het
-- ondertekenen van een offerte — omdat de regel op de tabel zelf zit en niet in
-- één van de aanroepers.
--
-- Geen tweede "markDealWon" dus: de status is een gevolg van de fase, geen
-- losse handeling. markDealLost blijft wat het is, want verliezen vraagt om een
-- reden en dat is wél een handeling.
--
-- Verloren blijft verloren: staat status al op 'lost', dan raakt de trigger hem
-- niet aan. Slepen naar de Verloren-fase loopt in de app altijd via
-- markDealLost (BbDashboard: `if (targetStageId === lostStageId) markLost(deal)`),
-- dus die zet 'lost' in dezelfde UPDATE mee. Een directe API-call die een deal
-- naar de Verloren-fase schuift zónder status mee te geven, zou hem op 'won'
-- zetten — die fase ligt ná Akkoord. Dat pad bestaat in de app niet en is
-- bewust niet extra afgeschermd; een tweede koppeling 'verloren' zou meer
-- instelwerk zijn dan het oplost.
--
-- Gemeten vóór het draaien: 110 deals in het testbedrijf; 15 in de fase
-- Verloren (status 'lost'), de rest verdeeld over de fasen. Deals vanaf de fase
-- Akkoord stonden allemaal nog op 'open'.

begin;

-- ── 1. Nieuw moment: akkoord ────────────────────────────────────────────────
alter table public.pipeline_koppelingen drop constraint if exists pipeline_koppelingen_moment_check;
alter table public.pipeline_koppelingen add constraint pipeline_koppelingen_moment_check
  check (moment in ('akkoord', 'gepland', 'in_uitvoering', 'afgerond', 'gefactureerd', 'betaald'));

-- Bestaande bedrijven: eenmalig op naam, net als de andere momenten.
insert into public.pipeline_koppelingen (company_id, moment, stage_id)
select s.company_id, 'akkoord', s.id
  from public.pipeline_stages s
 where lower(s.name) = 'akkoord'
on conflict (company_id, moment) do nothing;

-- Nieuwe bedrijven: meteen mee in de seed.
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
      ('afgerond', 'Afgerond'), ('gefactureerd', 'Gefactureerd'), ('betaald', 'Betaald')
    ) AS m(moment, naam) ON s.name = m.naam
   WHERE s.company_id = p_company
  ON CONFLICT (company_id, moment) DO NOTHING;
END;
$$;

revoke all on function public.seed_default_pipeline_stages(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_pipeline_stages(uuid) to service_role;

-- ── 2. De status volgt de fase ──────────────────────────────────────────────
create or replace function public.bb_deal_status_uit_fase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_akkoord_pos int;
  v_pos         int;
BEGIN
  -- Verloren blijft verloren. markDealLost zet stage_id en status in dezelfde
  -- UPDATE, dus we zien 'lost' hier meteen staan.
  IF NEW.status = 'lost' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT ps.position INTO v_akkoord_pos
    FROM public.pipeline_koppelingen k
    JOIN public.pipeline_stages ps ON ps.id = k.stage_id
   WHERE k.company_id = NEW.company_id AND k.moment = 'akkoord';

  -- Geen fase aan 'akkoord' gekoppeld: dan weten we niet wat winnen betekent.
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

drop trigger if exists bb_deal_status_uit_fase on public.deals;
create trigger bb_deal_status_uit_fase
  before insert or update of stage_id on public.deals
  for each row execute function public.bb_deal_status_uit_fase();

-- ── 3. Offerte ondertekend → deal naar Akkoord ──────────────────────────────
-- sign-offerte zet alleen de offerte op 'geaccepteerd'; de deal bleef staan
-- waar hij stond. Via bb_deal_naar_fase schuift hij nu mee, en die schuift
-- nooit terug.
create or replace function public.bb_offerte_akkoord_gevolgen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.signed_at IS NOT DISTINCT FROM OLD.signed_at THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'geaccepteerd' OR NEW.signed_at IS NOT NULL THEN
    PERFORM public.bb_deal_naar_fase(NEW.deal_id, 'akkoord');
  END IF;

  RETURN NEW;
END;
$$;

revoke all on function public.bb_offerte_akkoord_gevolgen() from public, anon, authenticated;

drop trigger if exists bb_offerte_akkoord_gevolgen on public.offertes;
create trigger bb_offerte_akkoord_gevolgen
  after insert or update on public.offertes
  for each row execute function public.bb_offerte_akkoord_gevolgen();

-- ── 4. Bestaande deals rechtzetten ──────────────────────────────────────────
-- Vanaf de Akkoord-fase gewonnen, ervóór open. Verloren deals blijven staan.
update public.deals d
   set status = case when s.position >= a.position then 'won' else 'open' end
  from public.pipeline_stages s
  join public.pipeline_koppelingen k on k.stage_id is not null and k.moment = 'akkoord'
  join public.pipeline_stages a on a.id = k.stage_id
 where s.id = d.stage_id
   and k.company_id = d.company_id
   and d.status is distinct from 'lost'
   and d.status is distinct from (case when s.position >= a.position then 'won' else 'open' end);

commit;

notify pgrst, 'reload schema';
