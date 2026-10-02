-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, H14/P7 (prestaties). Alleen toevoegend en het opruimen van
-- dubbele constraints; policies en functies blijven ongemoeid (een brede
-- herschrijving van alle policies is op verzoek van de gebruiker uitgesteld tot
-- na de livegang, met een eigen regressietest).
--
-- 1. 43 foreign keys hadden geen index met die kolom vooraan (advisor
--    unindexed_foreign_keys = 45, waarvan 2 dubbele FK's op deals). Zonder index
--    wordt een join of een DELETE op de oudertabel een volledige scan.
-- 2. job_costs had geen gewone index op (company_id, cost_date), terwijl Kosten,
--    Dashboard en Financiën precies daarop filteren.
-- 3. deals had drie dubbele foreign keys uit een oude dashboardmigratie
--    (fk_deals_company/customer/stage) naast de gemigreerde. Gemeten wat er nu
--    gebeurt: een klant verwijderen verwijdert zijn deals (deals_customer_id_fkey,
--    CASCADE, wint van SET NULL); een fase met deals verwijderen wordt geweigerd
--    (deals_stage_id_fkey wint). Na het weghalen van de dubbelen blijft precies
--    dat gedrag over.
--
-- Tabellen zijn klein (grootste ~1.300 rijen), dus gewoon CREATE INDEX binnen de
-- transactie; geen CONCURRENTLY nodig.

begin;

create index if not exists idx_activiteit_notities_created_by on public.activiteit_notities (created_by);
create index if not exists idx_activities_assigned_to on public.activities (assigned_to);
create index if not exists idx_activities_customer_id on public.activities (customer_id);
create index if not exists idx_activities_deal_id on public.activities (deal_id);
create index if not exists idx_deal_notities_created_by on public.deal_notities (created_by);
create index if not exists idx_deals_assigned_to on public.deals (assigned_to);
create index if not exists idx_deals_customer_id on public.deals (customer_id);
create index if not exists idx_deals_stage_id on public.deals (stage_id);
create index if not exists idx_facturen_credit_van_factuur_id on public.facturen (credit_van_factuur_id);
create index if not exists idx_google_calendar_connections_company_id on public.google_calendar_connections (company_id);
create index if not exists idx_inquiries_assigned_to on public.inquiries (assigned_to);
create index if not exists idx_job_costs_deal_id on public.job_costs (deal_id);
create index if not exists idx_klant_tijdlijn_created_by on public.klant_tijdlijn (created_by);
create index if not exists idx_leverancier_tijdlijn_created_by on public.leverancier_tijdlijn (created_by);
create index if not exists idx_mail_fouten_company_id on public.mail_fouten (company_id);
create index if not exists idx_materiaal_inkoop_company_id on public.materiaal_inkoop (company_id);
create index if not exists idx_meldingen_company_id on public.meldingen (company_id);
create index if not exists idx_notifications_company_id on public.notifications (company_id);
create index if not exists idx_notifications_created_by on public.notifications (created_by);
create index if not exists idx_offertes_deal_id on public.offertes (deal_id);
create index if not exists idx_pipeline_koppelingen_stage_id on public.pipeline_koppelingen (stage_id);
create index if not exists idx_planning_wijzigingen_company_id on public.planning_wijzigingen (company_id);
create index if not exists idx_planning_wijzigingen_werkbon_id on public.planning_wijzigingen (werkbon_id);
create index if not exists idx_platform_instellingen_bijgewerkt_door on public.platform_instellingen (bijgewerkt_door);
create index if not exists idx_project_kosten_leverancier_id on public.project_kosten (leverancier_id);
create index if not exists idx_project_notes_created_by on public.project_notes (created_by);
create index if not exists idx_projects_assigned_to on public.projects (assigned_to);
create index if not exists idx_projects_created_by on public.projects (created_by);
create index if not exists idx_projects_owner_id on public.projects (owner_id);
create index if not exists idx_sent_emails_company_id on public.sent_emails (company_id);
create index if not exists idx_sent_emails_customer_id on public.sent_emails (customer_id);
create index if not exists idx_snelstart_webhook_log_company_id on public.snelstart_webhook_log (company_id);
create index if not exists idx_stripe_billing_events_company_id on public.stripe_billing_events (company_id);
create index if not exists idx_upgrade_requests_aangevraagd_door on public.upgrade_requests (aangevraagd_door);
create index if not exists idx_user_permissions_company_id on public.user_permissions (company_id);
create index if not exists idx_voertuigen_company_id on public.voertuigen (company_id);
create index if not exists idx_werkbon_materiaal_inkoop_company_id on public.werkbon_materiaal_inkoop (company_id);
create index if not exists idx_werkbon_materialen_leverancier_id on public.werkbon_materialen (leverancier_id);
create index if not exists idx_werkbon_notities_created_by on public.werkbon_notities (created_by);
create index if not exists idx_werkbon_uren_profile_id on public.werkbon_uren (profile_id);
create index if not exists idx_werkbonnen_activity_id on public.werkbonnen (activity_id);
create index if not exists idx_werkbonnen_deal_id on public.werkbonnen (deal_id);
create index if not exists idx_werkbonnen_offerte_id on public.werkbonnen (offerte_id);

create index if not exists idx_job_costs_company_cost_date on public.job_costs (company_id, cost_date);

alter table public.deals drop constraint if exists fk_deals_company;
alter table public.deals drop constraint if exists fk_deals_customer;
alter table public.deals drop constraint if exists fk_deals_stage;

notify pgrst, 'reload schema';

select
  (select count(*) from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])) as fk_zonder_index_moet_0,
  (select count(*) from pg_constraint where conrelid = 'public.deals'::regclass and contype = 'f') as fks_op_deals_moet_4;

commit;
