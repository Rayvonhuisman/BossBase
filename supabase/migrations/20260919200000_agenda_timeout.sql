-- De agenda-query liep structureel in een statement timeout.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- GET /rest/v1/calendar_events gaf herhaaldelijk een 500 terug. In de
-- PostgREST-logs staat de reden:
--
--   {"code":"57014","message":"canceling statement due to statement timeout"}
--
-- Zes keer gezien in één middag. De frontend ving dat op met .catch(() => []),
-- dus de agendategel toonde gewoon "Geen agenda-items": geen foutmelding, geen
-- spoor, en niemand die het merkt.
--
-- De oorzaak zit niet in de hoeveelheid data (221 rijen) maar in de policy.
-- current_company_id() stond als VOLATILE gemarkeerd:
--
--   select company_id from profiles where id = auth.uid()
--
-- Dat is een pure lezing die binnen één statement altijd hetzelfde teruggeeft,
-- dus STABLE. Als VOLATILE mag Postgres het resultaat niet hergebruiken en
-- voert hij de functie PER RIJ opnieuw uit — elke keer met een eigen query op
-- profiles. De zusterfuncties bb_has_permission() en bb_gedeelde_werkruimte()
-- zijn wél STABLE; deze was de uitzondering.
--
-- Dit raakt niet alleen de agenda: 72 policies over 22 tabellen roepen
-- current_company_id() aan. Eén woord veranderen helpt ze allemaal, en dat is
-- een betere ingreep dan 72 policies herschrijven.
--
-- Raakt geen data: alleen een functie-eigenschap en drie indexen.


-- ── De wijziging ────────────────────────────────────────────────────────────

-- 1. De functie mag per statement één keer draaien in plaats van per rij.
alter function public.current_company_id() stable;

-- 2. De foreign keys van calendar_events zonder dekkende index. assigned_to is
--    de belangrijkste: die staat in de SELECT-policy ("of de afspraak is van
--    jou"). customer_id en deal_id worden gebruikt bij het openen van een
--    klant- of dealkaart. company_id, activiteit_id, werkbon_id en
--    werkbon_dag_id hadden er al een.
create index if not exists idx_calendar_events_assigned_to
  on public.calendar_events (assigned_to) where assigned_to is not null;

create index if not exists idx_calendar_events_customer_id
  on public.calendar_events (customer_id) where customer_id is not null;

create index if not exists idx_calendar_events_deal_id
  on public.calendar_events (deal_id) where deal_id is not null;

-- De twee EXISTS-subqueries in de SELECT-policy joinen op de PRIMAIRE sleutel
-- van activities en werkbonnen en zijn daarmee goedkoop; die blijven ongemoeid.
-- Helpt bovenstaande onvoldoende, dan is de volgende stap de policy herschrijven
-- met (select current_company_id()) zodat de planner er gegarandeerd een
-- InitPlan van maakt.


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Deze migratie wijzigt geen kolommen, maar wél een functie-eigenschap. De
-- event trigger pgrst_ddl_watch luistert niet op alles, dus hier zelf melden.
notify pgrst, 'reload schema';
