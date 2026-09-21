-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Voor de gebruiker zijn "aanvraag" en "project" één ding: de klus. In de
-- database waren het twee rijen die je met de hand aan elkaar moest knopen, en
-- dat gebeurde vrijwel nooit — de weg van een gewonnen deal naar een project
-- bestond in de app niet eens meer (MaakProjectModal was onbereikbaar geworden).
--
-- Vanaf nu krijgt élke aanvraag meteen een project. Dat gebeurt hier in de
-- database en niet in de frontend, omdat een aanvraag langs drie wegen
-- binnenkomt: het websiteformulier (edge function public-website-inquiry, die
-- in een andere repo leeft), een mail, en de knop "Nieuwe aanvraag" in de app.
-- Een trigger op de tabel vangt ze alle drie, plus imports en directe
-- API-aanroepen. Eén regel op de tabel is bovendien niet te vergeten bij een
-- vierde route.
--
-- STATUS IN DE AANVRAAGFASE. Een project zonder werkbonnen krijgt 'gepland' —
-- de bestaande, afgeleide status (bb_project_status_bijwerken: geen werkbonnen
-- = gepland). Er komt bewust GEEN vierde status 'aanvraag' bij:
-- projects.status wordt ook door de mobiele app gelezen, en die kent deze drie
-- waarden. Een nieuwe waarde zou daar stil doorheen vallen. Wat er in de
-- aanvraagfase toe doet is de pipelinefase, en die staat op de deal; het
-- projectoverzicht toont hem als leidende badge. 'gepland' is daarnaast
-- letterlijk waar: er is nog niets begonnen.
--
-- Er wordt niets verwijderd of hernoemd. De mobiele app leest deals, projects
-- en werkbonnen ongewijzigd verder.
--
-- Gemeten vóór het draaien (productie, 21-09-2026):
--   133 deals, waarvan 90 zonder project; 82 projecten; 0 deals zonder klant;
--   0 deals met een lege titel (deals.title is NOT NULL).
--   Na de bijvulling: 172 projecten, en elke deal heeft er precies één.

begin;

-- ── 1. De trigger ───────────────────────────────────────────────────────────
-- SECURITY DEFINER: een aanvraag kan worden aangemaakt door iemand met alleen
-- 'verkoop' (of door service_role vanuit het websiteformulier), en die heeft
-- geen 'projecten_bewerken'. Zonder definer-rechten zou projects_insert de
-- invoeging weigeren en de hele aanvraag mislukken.
--
-- Idempotent: bestaat er al een project voor deze deal, dan gebeurt er niets.
-- Dat houdt de trigger veilig als hij ooit samen met een handmatige aanmaak
-- loopt.
create or replace function public.bb_deal_project_aanmaken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.projects p where p.deal_id = new.id) then
    return new;
  end if;

  insert into public.projects (company_id, customer_id, deal_id, name, status, assigned_to)
  values (
    new.company_id,
    new.customer_id,
    new.id,
    -- name is NOT NULL. deals.title is dat ook, maar een spatie-titel zou hier
    -- een lege projectnaam opleveren; vandaar de terugval.
    coalesce(nullif(btrim(new.title), ''), 'Aanvraag'),
    'gepland',
    -- Zodat de behandelaar het project ook ziet zonder 'alles_inzien':
    -- projects_select laat assigned_to = auth.uid() door.
    new.assigned_to
  );

  return new;
end;
$$;

revoke all on function public.bb_deal_project_aanmaken() from public, anon, authenticated;
grant execute on function public.bb_deal_project_aanmaken() to service_role;

drop trigger if exists bb_deal_project_aanmaken on public.deals;
create trigger bb_deal_project_aanmaken
  after insert on public.deals
  for each row execute function public.bb_deal_project_aanmaken();

-- ── 2. Bestaande aanvragen bijvullen ────────────────────────────────────────
-- De 90 deals die nog geen project hebben. Zelfde afbeelding als de trigger.
insert into public.projects (company_id, customer_id, deal_id, name, status, assigned_to, created_at)
select d.company_id,
       d.customer_id,
       d.id,
       coalesce(nullif(btrim(d.title), ''), 'Aanvraag'),
       'gepland',
       d.assigned_to,
       d.created_at
  from public.deals d
 where not exists (select 1 from public.projects p where p.deal_id = d.id);

-- ── 3. De uitkomst ──────────────────────────────────────────────────────────
-- NOTICE-regels komen niet terug via de Management API, alleen de rijen van het
-- laatste statement. Vandaar deze telling: deals_zonder_project moet 0 zijn.
select
  (select count(*) from public.deals)    as deals,
  (select count(*) from public.projects) as projecten,
  (select count(*) from public.deals d
     where not exists (select 1 from public.projects p where p.deal_id = d.id)) as deals_zonder_project,
  (select count(*) from (
     select deal_id from public.projects where deal_id is not null
      group by deal_id having count(*) > 1) x)                                  as deals_met_meer_projecten;

commit;

notify pgrst, 'reload schema';
