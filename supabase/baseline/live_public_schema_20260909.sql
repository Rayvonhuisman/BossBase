-- =============================================================================
--  !!  BASELINE - SCHEMA-ONLY RECONSTRUCTIE VAN DE LIVE DATABASE
--  !!  NIET UITVOEREN TEGEN DE GEKOPPELDE PRODUCTIEOMGEVING
-- =============================================================================
--
--  Bestand      : supabase/baseline/live_public_schema_20260909.sql
--  Gegenereerd  : 2026-09-09
--  Bron         : het schema `public` van het gekoppelde Supabase-project,
--                 uitgelezen met ALLEEN-LEZEN catalogusquery's via
--                 `supabase db query --linked` (de route uit CLAUDE.md).
--  Peilmoment   : 20260907210753 was de laatst toegepaste migratie.
--
--  WAAROM DIT BESTAND BESTAAT
--  --------------------------
--  Elf kerntabellen - companies, profiles, customers, deals, activities,
--  calendar_events, facturen, factuur_regels, pipeline_stages, job_costs en
--  notes - zijn nooit door een migratie aangemaakt. Ze stammen uit de begintijd
--  en zijn via het Supabase-dashboard ontstaan. `supabase/migrations/` kan de
--  database daarom niet vanaf nul herbouwen. Dit bestand legt vast wat er
--  werkelijk staat, zodat dat wel kan.
--
--  WAT HET WEL IS
--  --------------
--  Uitsluitend structuur: extensions, tabellen, kolommen, defaults, constraints,
--  indexen, functies, triggers, RLS-status, policies en grants.
--
--  WAT HET NIET IS
--  ---------------
--  * Geen rijen. Geen INSERT, UPDATE, DELETE of COPY. Nul klantgegevens.
--  * Geen auth-gebruikers, geen storage-objecten, geen vault-inhoud.
--  * Geen secrets, sleutels, tokens of wachtwoorden.
--  * Geen Supabase-eigen schema's (auth, storage, vault, realtime, graphql,
--    extensions, cron). Verwijzingen daarheen blijven staan waar een
--    public-definitie ze nodig heeft - `auth.users` in een foreign key,
--    `auth.uid()` in een policy.
--  * Geen vervanging van de migratiegeschiedenis. Die blijft leidend.
--
--  HOE JE HEM WEL GEBRUIKT
--  -----------------------
--  Tegen een LEGE database (lokaal, of een verse test/staging), in de volgorde
--  waarin de secties hieronder staan. Draai daarna eventueel
--  supabase/demo-data/*.sql voor testgegevens.
--
--  `supabase db push` leest uitsluitend supabase/migrations/. Dit bestand staat
--  daarbuiten en wordt dus nooit als openstaande migratie meegenomen. Zie
--  docs/DATABASE_BASELINE_STRATEGY.md voor de route naar een officiele baseline
--  in de migratiehistorie.
--
--  OBJECTAANTALLEN IN DIT BESTAND
--  ------------------------------
--    extensions .........    6      indexen ...........   96
--    enums/types ........    0      triggers ..........   36
--    losse sequences ....    0      rls-tabellen ......   67
--    tabellen ...........   67      policies ..........  226
--    pk/unique/check ....  103      grants ............  507
--    functiesignatures ..  121
--      unieke namen .....  109   (12 functies hebben twee signatures:
--    views ..............    0      een variant met p_company_id en een
--    foreign keys .......  130      die het eigen bedrijf zelf opzoekt)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- Functiebodies niet valideren tijdens het laden.
--
-- De functies staan hieronder op alfabet, en dat is geen geldige
-- afhankelijkheidsvolgorde: bb_downgrade_blokkades() roept bb_usage() aan en
-- komt er alfabetisch ruim voor. Postgres controleert de body van een
-- SQL-functie wél bij CREATE (plpgsql-bodies niet), dus zonder deze regel
-- struikelt het laden over een vooruitverwijzing die daarna gewoon klopt.
--
-- Dit is precies wat pg_dump zelf ook in zijn kop zet. De instelling geldt
-- alleen voor deze sessie; na het laden valideert Postgres weer normaal, en een
-- echte fout in een functie komt alsnog aan het licht zodra hij wordt
-- aangeroepen.
--
-- Gevonden door de baseline daadwerkelijk op een lege database te draaien
-- (15-09-2026), niet door ernaar te kijken.
SET check_function_bodies = false;


-- ============================================================================
-- A. EXTENSIONS  (6)
-- ----------------------------------------------------------------------------
-- Uit pg_extension. plpgsql is weggelaten: die staat er altijd al.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA pg_catalog;

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;



-- ============================================================================
-- B. TYPES EN ENUMS  (0)
-- ----------------------------------------------------------------------------
-- Uit pg_type + pg_enum. Het project gebruikt geen eigen enums; statussen zijn text.
-- ============================================================================

-- (geen objecten van dit soort in het live schema)


-- ============================================================================
-- C. LOSSE SEQUENCES  (0)
-- ----------------------------------------------------------------------------
-- Alleen sequences die niet bij een identity- of serial-kolom horen.
-- ============================================================================

-- (geen objecten van dit soort in het live schema)


-- ============================================================================
-- D. TABELLEN  (67)
-- ----------------------------------------------------------------------------
-- Kolommen, types, defaults en NOT NULL. Constraints staan verderop, niet inline.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.accounting_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  provider text DEFAULT 'moneybird'::text NOT NULL,
  api_token text,
  administration_id text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  afas_environment_id text,
  afas_token text,
  is_connected boolean DEFAULT false,
  client_key text
);

CREATE TABLE IF NOT EXISTS public.accounting_sync_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  provider text NOT NULL,
  onderdeel text NOT NULL,
  bron text DEFAULT 'handmatig'::text NOT NULL,
  gestart_op timestamp with time zone DEFAULT now() NOT NULL,
  klaar_op timestamp with time zone,
  gelukt boolean,
  fout text,
  fouten jsonb DEFAULT '[]'::jsonb NOT NULL,
  meldingen jsonb DEFAULT '[]'::jsonb NOT NULL,
  samenvatting jsonb
);

CREATE TABLE IF NOT EXISTS public.activiteit_notities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  created_by uuid,
  note text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  customer_id uuid,
  deal_id uuid,
  title text NOT NULL,
  type text DEFAULT 'task'::text,
  due_at timestamp with time zone,
  completed boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  priority text DEFAULT 'normaal'::text,
  google_event_id text,
  google_calendar_synced_at timestamp with time zone,
  google_sync_status text DEFAULT 'not_synced'::text,
  google_sync_error text,
  assigned_to uuid,
  end_time time without time zone,
  location text,
  voertuig_id uuid,
  assigned_to_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bedrijfsinstellingen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  uurtarief numeric DEFAULT 55 NOT NULL,
  reiskosten_per_km numeric DEFAULT 0.23 NOT NULL,
  standaard_marge numeric DEFAULT 25 NOT NULL,
  btw_pct numeric DEFAULT 21 NOT NULL,
  offerte_geldig_dagen integer DEFAULT 14 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  auto_sync_google_calendar boolean DEFAULT true NOT NULL,
  uren_herinnering_interval_min integer DEFAULT 60 NOT NULL,
  agenda_start_uur integer DEFAULT 7 NOT NULL,
  agenda_eind_uur integer DEFAULT 20 NOT NULL,
  btw_stelsel text DEFAULT 'factuur'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.boss_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb NOT NULL,
  titel text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  doorzet_verstuurd_op timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.boss_doorzet_limiet (
  user_id uuid NOT NULL,
  window_start timestamp with time zone DEFAULT now() NOT NULL,
  aantal integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.boss_rate_limit (
  user_id uuid NOT NULL,
  window_start timestamp with time zone DEFAULT now() NOT NULL,
  aantal integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.btw_periodes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  periode_type text NOT NULL,
  periode_label text NOT NULL,
  periode_start date NOT NULL,
  periode_eind date NOT NULL,
  btw_ontvangen_21 numeric DEFAULT 0,
  btw_ontvangen_9 numeric DEFAULT 0,
  omzet_0_tarief numeric DEFAULT 0,
  btw_betaald_21 numeric DEFAULT 0,
  btw_betaald_9 numeric DEFAULT 0,
  last_synced_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  customer_id uuid,
  deal_id uuid,
  title text NOT NULL,
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone NOT NULL,
  location text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  type text,
  werkbon_id uuid,
  comments jsonb DEFAULT '[]'::jsonb NOT NULL,
  activiteit_id uuid,
  assigned_to uuid,
  herkomst text DEFAULT 'zelf'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  kvk text,
  btw_number text,
  email text,
  phone text,
  address text,
  city text,
  postal_code text,
  website text,
  logo_url text,
  updated_at timestamp with time zone DEFAULT now(),
  branding_color text DEFAULT '#f97316'::text,
  status text DEFAULT 'actief'::text,
  reply_to_email text,
  opgezegd_op timestamp with time zone,
  periode_start date,
  trial_mails_uitgesloten boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.company_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  profile_id uuid,
  email text NOT NULL,
  full_name text,
  phone text,
  role text DEFAULT 'medewerker'::text NOT NULL,
  status text DEFAULT 'uitgenodigd'::text NOT NULL,
  hours_per_week numeric DEFAULT 0 NOT NULL,
  invited_at timestamp with time zone DEFAULT now() NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  avatar_url text,
  invite_token uuid,
  invite_expires_at timestamp with time zone,
  invite_company_name text,
  invite_email_failed_at timestamp with time zone,
  invite_email_error text
);

CREATE TABLE IF NOT EXISTS public.company_modules (
  company_id uuid NOT NULL,
  module_key text NOT NULL,
  actief boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  stripe_item_id text,
  stripe_price_id text
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  logo_url text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  moneybird_id text,
  postcode text,
  kvk_number text,
  btw_number text,
  iban text,
  notities text,
  snelstart_id text,
  contactpersoon text,
  website text,
  betaaltermijn_dagen integer
);

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  widget_type text NOT NULL,
  title text,
  "position" integer DEFAULT 0 NOT NULL,
  size text DEFAULT 'medium'::text NOT NULL,
  settings jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_visible boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  customer_id uuid,
  stage_id uuid,
  title text NOT NULL,
  description text,
  expected_revenue numeric DEFAULT 0,
  final_revenue numeric,
  status text DEFAULT 'open'::text,
  created_at timestamp with time zone DEFAULT now(),
  assigned_to uuid,
  priority text DEFAULT 'med'::text NOT NULL,
  lost_reason text
);

CREATE TABLE IF NOT EXISTS public.eigen_eenheden (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  standaard_prijs numeric DEFAULT 0 NOT NULL,
  eenheid_label text,
  btw_pct numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.email_send_attempts (
  user_id uuid NOT NULL,
  last_attempt timestamp with time zone DEFAULT now(),
  attempt_count integer DEFAULT 1,
  window_start timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  type text NOT NULL,
  onderwerp text,
  body text,
  actief boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  name text DEFAULT ''::text NOT NULL,
  body_html text DEFAULT ''::text NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  auto_versturen boolean DEFAULT false,
  auto_dagen integer DEFAULT 7
);

CREATE TABLE IF NOT EXISTS public.email_verification_attempts (
  email text NOT NULL,
  last_sent timestamp with time zone DEFAULT now(),
  send_count integer DEFAULT 1,
  window_start timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  verified_at timestamp with time zone,
  attempts integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.facturen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid,
  nummer text NOT NULL,
  factuurdatum date DEFAULT CURRENT_DATE NOT NULL,
  vervaldatum date,
  betalingskenmerk text,
  status text DEFAULT 'concept'::text NOT NULL,
  notities text,
  totaal_excl numeric DEFAULT 0 NOT NULL,
  totaal_incl numeric DEFAULT 0 NOT NULL,
  betaald_op date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  project_id uuid,
  externe_referentie text,
  moneybird_id text,
  is_credit boolean DEFAULT false,
  credit_van_factuur_id uuid,
  gecrediteerd boolean DEFAULT false,
  betaaltermijn_dagen integer DEFAULT 14,
  herinnering_1_verstuurd_at timestamp with time zone,
  herinnering_2_verstuurd_at timestamp with time zone,
  snapshot_logo_url text,
  snapshot_branding_color text,
  snapshot_bedrijfsnaam text,
  snapshot_adres text,
  snapshot_postcode text,
  snapshot_plaats text,
  snapshot_email text,
  snapshot_kvk text,
  snapshot_btw text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  stripe_payment_url text,
  stripe_payment_status text,
  moneybird_payment_registered_at timestamp with time zone,
  stripe_payment_token text,
  snelstart_id text,
  snelstart_bijlage_gesynct boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.factuur_regels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  factuur_id uuid NOT NULL,
  company_id uuid NOT NULL,
  type text DEFAULT 'stuks'::text NOT NULL,
  omschrijving text NOT NULL,
  aantal numeric DEFAULT 1 NOT NULL,
  eenheidsprijs numeric DEFAULT 0 NOT NULL,
  btw_pct numeric DEFAULT 21 NOT NULL,
  regelprijs numeric DEFAULT 0 NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  btw_regime text DEFAULT 'normaal'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  google_email text,
  google_calendar_id text DEFAULT 'primary'::text,
  access_token text,
  refresh_token text,
  token_expiry timestamp with time zone,
  is_connected boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grootboek_voorkeuren (
  company_id uuid NOT NULL,
  provider text DEFAULT 'snelstart'::text NOT NULL,
  sleutel text NOT NULL,
  grootboek_nummer integer NOT NULL,
  grootboek_id text,
  omschrijving text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.import_genegeerd (
  company_id uuid NOT NULL,
  provider text DEFAULT 'snelstart'::text NOT NULL,
  soort text NOT NULL,
  externe_id text NOT NULL,
  reden text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.job_costs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  deal_id uuid,
  description text NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  category text,
  created_at timestamp with time zone DEFAULT now(),
  bijlage_url text,
  klant_type text DEFAULT 'klant'::text NOT NULL,
  cost_date date,
  externe_referentie text,
  customer_id uuid,
  btw_inclusief boolean,
  moneybird_document_id text,
  project_id uuid,
  werkbon_id uuid,
  btw_percentage numeric DEFAULT 21 NOT NULL,
  werkbon_materiaal_id uuid,
  snelstart_id text,
  leverancier text,
  leverancier_id uuid,
  snelstart_bijlage_gesynct boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.klant_tijdlijn (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  customer_id uuid NOT NULL,
  type text DEFAULT 'notitie_toegevoegd'::text NOT NULL,
  omschrijving text,
  aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  meta jsonb
);

CREATE TABLE IF NOT EXISTS public.kosten_categorieen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  standaard boolean DEFAULT false NOT NULL,
  actief boolean DEFAULT true NOT NULL,
  bon_verplicht boolean DEFAULT true NOT NULL,
  volgorde integer DEFAULT 100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leverancier_tijdlijn (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  leverancier_id uuid NOT NULL,
  type text DEFAULT 'notitie'::text NOT NULL,
  omschrijving text NOT NULL,
  meta jsonb,
  created_by uuid,
  aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leveranciers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  contactpersoon text,
  email text,
  telefoon text,
  mobiel text,
  website text,
  address text,
  postcode text,
  city text,
  kvk_number text,
  btw_number text,
  iban text,
  betaaltermijn_dagen integer,
  notities text,
  actief boolean DEFAULT true NOT NULL,
  snelstart_id text,
  moneybird_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lost_reasons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  label text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.materiaal_inkoop (
  materiaal_id uuid NOT NULL,
  company_id uuid NOT NULL,
  inkoopprijs numeric,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.materialen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  eenheid text DEFAULT 'stuk'::text NOT NULL,
  verkoopprijs numeric,
  leverancier_id uuid,
  btw_pct numeric DEFAULT 21 NOT NULL,
  artikelnummer text,
  actief boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  customer_id uuid,
  deal_id uuid,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  related_type text,
  related_id uuid,
  created_by uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.offerte_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  offerte_id uuid NOT NULL,
  company_id uuid NOT NULL,
  omschrijving text NOT NULL,
  eenheid text,
  aantal numeric DEFAULT 1 NOT NULL,
  prijs_per numeric DEFAULT 0 NOT NULL,
  subtotaal numeric DEFAULT 0 NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  type text,
  btw_pct numeric,
  btw_regime text DEFAULT 'normaal'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.offertes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid,
  deal_id uuid,
  nummer text,
  omschrijving text,
  status text DEFAULT 'concept'::text NOT NULL,
  arbeidsuren numeric DEFAULT 0 NOT NULL,
  uurtarief numeric DEFAULT 55 NOT NULL,
  materiaalkosten numeric DEFAULT 0 NOT NULL,
  reiskosten numeric DEFAULT 0 NOT NULL,
  marge_pct numeric DEFAULT 25 NOT NULL,
  btw_pct numeric DEFAULT 21 NOT NULL,
  totaal_excl numeric DEFAULT 0 NOT NULL,
  totaal_incl numeric DEFAULT 0 NOT NULL,
  geldig_tot date,
  verzonden_op timestamp with time zone,
  geaccepteerd_op timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  sign_token uuid DEFAULT gen_random_uuid(),
  signed_at timestamp with time zone,
  signature_url text,
  signed_by_name text,
  signed_by_email text,
  signed_pdf_url text,
  sent_to_email text,
  snapshot_logo_url text,
  snapshot_branding_color text,
  snapshot_bedrijfsnaam text,
  snapshot_adres text,
  snapshot_postcode text,
  snapshot_plaats text,
  snapshot_email text,
  snapshot_kvk text,
  snapshot_btw text,
  vervangen_op timestamp with time zone,
  vervangen_door_nummer text
);

CREATE TABLE IF NOT EXISTS public.password_reset_attempts (
  email text NOT NULL,
  last_attempt timestamp with time zone DEFAULT now(),
  attempt_count integer DEFAULT 1,
  window_start timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  token uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  name text NOT NULL,
  "position" integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  color_class text DEFAULT 'b-gray'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_feature_defs (
  feature text NOT NULL,
  label text NOT NULL,
  uitleg text DEFAULT ''::text NOT NULL,
  intern boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_features (
  plan text NOT NULL,
  feature text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan text NOT NULL,
  limit_key text NOT NULL,
  limit_value integer,
  telwijze text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_module_tiers (
  plan text NOT NULL,
  module_key text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_modules (
  module_key text NOT NULL,
  label text NOT NULL,
  feature text NOT NULL,
  price numeric DEFAULT 0 NOT NULL,
  vereist text
);

CREATE TABLE IF NOT EXISTS public.plan_usage_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  soort text NOT NULL,
  periode_start date NOT NULL,
  ref_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  company_id uuid,
  full_name text,
  role text DEFAULT 'admin'::text,
  created_at timestamp with time zone DEFAULT now(),
  avatar_url text,
  is_super_admin boolean DEFAULT false,
  email_verified_at timestamp with time zone,
  actief boolean DEFAULT true NOT NULL,
  deactivated_at timestamp with time zone,
  verwijderd_op timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.project_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  created_by uuid,
  note text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid,
  deal_id uuid,
  offerte_id uuid,
  name text NOT NULL,
  description text,
  status text DEFAULT 'concept'::text NOT NULL,
  project_value numeric(12,2) DEFAULT 0 NOT NULL,
  quoted_hours numeric(10,2) DEFAULT 0 NOT NULL,
  used_hours numeric(10,2) DEFAULT 0 NOT NULL,
  start_date date,
  deadline date,
  owner_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  assigned_to uuid
);

CREATE TABLE IF NOT EXISTS public.sent_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  related_type text,
  related_id uuid,
  sent_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'sent'::text,
  appointment_id uuid,
  customer_id uuid,
  body_html text
);

CREATE TABLE IF NOT EXISTS public.stripe_billing_events (
  event_id text NOT NULL,
  type text NOT NULL,
  company_id uuid,
  verwerkt_op timestamp with time zone DEFAULT now() NOT NULL,
  resultaat text
);

CREATE TABLE IF NOT EXISTS public.stripe_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  stripe_account_id text,
  charges_enabled boolean DEFAULT false NOT NULL,
  payouts_enabled boolean DEFAULT false NOT NULL,
  details_submitted boolean DEFAULT false NOT NULL,
  onboarding_status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  plan text DEFAULT 'trial'::text NOT NULL,
  status text DEFAULT 'trial'::text NOT NULL,
  price_per_month numeric DEFAULT 0,
  trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
  started_at timestamp with time zone DEFAULT now(),
  cancelled_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_status text,
  billing_interval text DEFAULT 'maand'::text NOT NULL,
  extra_gebruikers integer DEFAULT 0 NOT NULL,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false NOT NULL,
  welkomstactie text,
  welkomstactie_gekozen_op timestamp with time zone,
  stripe_schedule_id text,
  verplichting_tot timestamp with time zone,
  stopt_na_looptijd boolean DEFAULT false NOT NULL,
  stopt_op timestamp with time zone,
  welkomstmail_op timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.trial_mails (
  company_id uuid NOT NULL,
  mail smallint NOT NULL,
  verstuurd_op timestamp with time zone DEFAULT now() NOT NULL,
  naar text,
  message_id text
);

CREATE TABLE IF NOT EXISTS public.upgrade_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  aangevraagd_door uuid,
  gewenst_plan text,
  gewenste_modules text[] DEFAULT '{}'::text[] NOT NULL,
  aanleiding text,
  status text DEFAULT 'open'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.urenregistratie (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  datum date NOT NULL,
  start_tijd time without time zone,
  eind_tijd time without time zone,
  uren numeric NOT NULL,
  type text DEFAULT 'arbeid'::text NOT NULL,
  notitie text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  pauze_minuten integer DEFAULT 0 NOT NULL,
  reis_km numeric,
  werkbon_id uuid,
  customer_id uuid,
  deal_id uuid
);

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.voertuigen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  kenteken text,
  kleur text DEFAULT '#1DDB62'::text,
  actief boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_aanvragen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  aangevraagd_op timestamp with time zone DEFAULT now() NOT NULL,
  mail_verstuurd_op timestamp with time zone,
  opgeleverd_op timestamp with time zone,
  notitie text
);

CREATE TABLE IF NOT EXISTS public.werkbon_fotos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  werkbon_id uuid NOT NULL,
  company_id uuid NOT NULL,
  url text NOT NULL,
  categorie text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.werkbon_materiaal_inkoop (
  werkbon_materiaal_id uuid NOT NULL,
  company_id uuid NOT NULL,
  inkoopprijs_per numeric,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.werkbon_materialen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  werkbon_id uuid NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  eenheid text,
  aantal numeric DEFAULT 1 NOT NULL,
  prijs_per numeric DEFAULT 0 NOT NULL,
  subtotaal numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  materiaal_id uuid,
  leverancier_id uuid
);

CREATE TABLE IF NOT EXISTS public.werkbon_notities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  werkbon_id uuid NOT NULL,
  created_by uuid,
  note text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  voor_klant boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.werkbon_taken (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  werkbon_id uuid NOT NULL,
  company_id uuid NOT NULL,
  omschrijving text NOT NULL,
  afgerond boolean DEFAULT false NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_meerwerk boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.werkbon_uren (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  werkbon_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  datum date NOT NULL,
  start_tijd time without time zone,
  eind_tijd time without time zone,
  pauze_minuten integer DEFAULT 0 NOT NULL,
  uren numeric NOT NULL,
  reis_km numeric,
  notitie text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.werkbonnen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid,
  deal_id uuid,
  offerte_id uuid,
  assigned_to uuid,
  titel text NOT NULL,
  omschrijving text,
  status text DEFAULT 'gepland'::text NOT NULL,
  gepland_op date,
  starttijd time without time zone,
  eindtijd time without time zone,
  locatie text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  werkbon_notities text,
  afgerond_op timestamp with time zone,
  project_id uuid,
  voertuig_id uuid,
  activity_id uuid,
  assigned_to_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  verantwoordelijke_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  gestart_op timestamp with time zone,
  nummer text,
  sign_token uuid DEFAULT gen_random_uuid() NOT NULL,
  ondertekend_op timestamp with time zone,
  handtekening_url text,
  ondertekend_door_naam text,
  ondertekend_door_email text,
  ondertekende_pdf_url text,
  verstuurd_naar_email text,
  verstuurd_op timestamp with time zone
);



-- ============================================================================
-- E. PRIMARY KEYS, UNIQUE EN CHECK  (103)
-- ----------------------------------------------------------------------------
-- Volgorde binnen de sectie: eerst PK, dan UNIQUE, dan CHECK.
-- ============================================================================

ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.accounting_sync_runs ADD CONSTRAINT accounting_sync_runs_pkey PRIMARY KEY (id);

ALTER TABLE public.activiteit_notities ADD CONSTRAINT activiteit_notities_pkey PRIMARY KEY (id);

ALTER TABLE public.activities ADD CONSTRAINT activities_pkey PRIMARY KEY (id);

ALTER TABLE public.bedrijfsinstellingen ADD CONSTRAINT bedrijfsinstellingen_pkey PRIMARY KEY (id);

ALTER TABLE public.boss_conversations ADD CONSTRAINT boss_conversations_pkey PRIMARY KEY (id);

ALTER TABLE public.boss_doorzet_limiet ADD CONSTRAINT boss_doorzet_limiet_pkey PRIMARY KEY (user_id);

ALTER TABLE public.boss_rate_limit ADD CONSTRAINT boss_rate_limit_pkey PRIMARY KEY (user_id);

ALTER TABLE public.btw_periodes ADD CONSTRAINT btw_periodes_pkey PRIMARY KEY (id);

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);

ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

ALTER TABLE public.company_members ADD CONSTRAINT company_members_pkey PRIMARY KEY (id);

ALTER TABLE public.company_modules ADD CONSTRAINT company_modules_pkey PRIMARY KEY (company_id, module_key);

ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_pkey PRIMARY KEY (id);

ALTER TABLE public.deals ADD CONSTRAINT deals_pkey PRIMARY KEY (id);

ALTER TABLE public.eigen_eenheden ADD CONSTRAINT eigen_eenheden_pkey PRIMARY KEY (id);

ALTER TABLE public.email_send_attempts ADD CONSTRAINT email_send_attempts_pkey PRIMARY KEY (user_id);

ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.email_verification_attempts ADD CONSTRAINT email_verification_attempts_pkey PRIMARY KEY (email);

ALTER TABLE public.email_verification_codes ADD CONSTRAINT email_verification_codes_pkey PRIMARY KEY (id);

ALTER TABLE public.facturen ADD CONSTRAINT facturen_pkey PRIMARY KEY (id);

ALTER TABLE public.factuur_regels ADD CONSTRAINT factuur_regels_pkey PRIMARY KEY (id);

ALTER TABLE public.google_calendar_connections ADD CONSTRAINT google_calendar_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.grootboek_voorkeuren ADD CONSTRAINT grootboek_voorkeuren_pkey PRIMARY KEY (company_id, provider, sleutel);

ALTER TABLE public.import_genegeerd ADD CONSTRAINT import_genegeerd_pkey PRIMARY KEY (company_id, provider, soort, externe_id);

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_pkey PRIMARY KEY (id);

ALTER TABLE public.klant_tijdlijn ADD CONSTRAINT klant_tijdlijn_pkey PRIMARY KEY (id);

ALTER TABLE public.kosten_categorieen ADD CONSTRAINT kosten_categorieen_pkey PRIMARY KEY (id);

ALTER TABLE public.leverancier_tijdlijn ADD CONSTRAINT leverancier_tijdlijn_pkey PRIMARY KEY (id);

ALTER TABLE public.leveranciers ADD CONSTRAINT leveranciers_pkey PRIMARY KEY (id);

ALTER TABLE public.lost_reasons ADD CONSTRAINT lost_reasons_pkey PRIMARY KEY (id);

ALTER TABLE public.materiaal_inkoop ADD CONSTRAINT materiaal_inkoop_pkey PRIMARY KEY (materiaal_id);

ALTER TABLE public.materialen ADD CONSTRAINT materialen_pkey PRIMARY KEY (id);

ALTER TABLE public.notes ADD CONSTRAINT notes_pkey PRIMARY KEY (id);

ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.offerte_items ADD CONSTRAINT offerte_items_pkey PRIMARY KEY (id);

ALTER TABLE public.offertes ADD CONSTRAINT offertes_pkey PRIMARY KEY (id);

ALTER TABLE public.password_reset_attempts ADD CONSTRAINT password_reset_attempts_pkey PRIMARY KEY (email);

ALTER TABLE public.password_reset_tokens ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);

ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);

ALTER TABLE public.plan_feature_defs ADD CONSTRAINT plan_feature_defs_pkey PRIMARY KEY (feature);

ALTER TABLE public.plan_features ADD CONSTRAINT plan_features_pkey PRIMARY KEY (plan, feature);

ALTER TABLE public.plan_limits ADD CONSTRAINT plan_limits_pkey PRIMARY KEY (plan, limit_key);

ALTER TABLE public.plan_module_tiers ADD CONSTRAINT plan_module_tiers_pkey PRIMARY KEY (plan, module_key);

ALTER TABLE public.plan_modules ADD CONSTRAINT plan_modules_pkey PRIMARY KEY (module_key);

ALTER TABLE public.plan_usage_events ADD CONSTRAINT plan_usage_events_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.project_notes ADD CONSTRAINT project_notes_pkey PRIMARY KEY (id);

ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE public.sent_emails ADD CONSTRAINT sent_emails_pkey PRIMARY KEY (id);

ALTER TABLE public.stripe_billing_events ADD CONSTRAINT stripe_billing_events_pkey PRIMARY KEY (event_id);

ALTER TABLE public.stripe_connections ADD CONSTRAINT stripe_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE public.trial_mails ADD CONSTRAINT trial_mails_pkey PRIMARY KEY (company_id, mail);

ALTER TABLE public.upgrade_requests ADD CONSTRAINT upgrade_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.urenregistratie ADD CONSTRAINT urenregistratie_pkey PRIMARY KEY (id);

ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);

ALTER TABLE public.voertuigen ADD CONSTRAINT voertuigen_pkey PRIMARY KEY (id);

ALTER TABLE public.website_aanvragen ADD CONSTRAINT website_aanvragen_pkey PRIMARY KEY (id);

ALTER TABLE public.werkbon_fotos ADD CONSTRAINT werkbon_fotos_pkey PRIMARY KEY (id);

ALTER TABLE public.werkbon_materiaal_inkoop ADD CONSTRAINT werkbon_materiaal_inkoop_pkey PRIMARY KEY (werkbon_materiaal_id);

ALTER TABLE public.werkbon_materialen ADD CONSTRAINT werkbon_materialen_pkey PRIMARY KEY (id);

ALTER TABLE public.werkbon_notities ADD CONSTRAINT werkbon_notities_pkey PRIMARY KEY (id);

ALTER TABLE public.werkbon_taken ADD CONSTRAINT werkbon_taken_pkey PRIMARY KEY (id);

ALTER TABLE public.werkbon_uren ADD CONSTRAINT werkbon_uren_pkey PRIMARY KEY (id);

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_pkey PRIMARY KEY (id);

ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_company_id_provider_key UNIQUE (company_id, provider);

ALTER TABLE public.bedrijfsinstellingen ADD CONSTRAINT bedrijfsinstellingen_company_id_key UNIQUE (company_id);

ALTER TABLE public.btw_periodes ADD CONSTRAINT btw_periodes_company_id_periode_start_periode_type_key UNIQUE (company_id, periode_start, periode_type);

ALTER TABLE public.company_members ADD CONSTRAINT company_members_company_email_key UNIQUE (company_id, email);

ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_company_type_key UNIQUE (company_id, type);

ALTER TABLE public.google_calendar_connections ADD CONSTRAINT google_calendar_connections_user_id_key UNIQUE (user_id);

ALTER TABLE public.kosten_categorieen ADD CONSTRAINT kosten_categorieen_company_id_naam_key UNIQUE (company_id, naam);

ALTER TABLE public.lost_reasons ADD CONSTRAINT lost_reasons_company_label_key UNIQUE (company_id, label);

ALTER TABLE public.password_reset_tokens ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);

ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_company_position_key UNIQUE (company_id, "position");

ALTER TABLE public.stripe_connections ADD CONSTRAINT stripe_connections_company_id_key UNIQUE (company_id);

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_company_id_key UNIQUE (company_id);

ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_user_id_permission_key UNIQUE (user_id, permission);

ALTER TABLE public.website_aanvragen ADD CONSTRAINT website_aanvragen_company_id_key UNIQUE (company_id);

ALTER TABLE public.accounting_sync_runs ADD CONSTRAINT accounting_sync_runs_bron_chk CHECK ((bron = ANY (ARRAY['cron'::text, 'handmatig'::text])));

ALTER TABLE public.bedrijfsinstellingen ADD CONSTRAINT bedrijfsinstellingen_agenda_uren_check CHECK (((agenda_start_uur >= 0) AND (agenda_start_uur <= 23) AND (agenda_eind_uur >= 1) AND (agenda_eind_uur <= 24) AND (agenda_eind_uur > agenda_start_uur)));

ALTER TABLE public.bedrijfsinstellingen ADD CONSTRAINT bedrijfsinstellingen_btw_stelsel_check CHECK ((btw_stelsel = ANY (ARRAY['factuur'::text, 'kas'::text])));

ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_size_check CHECK ((size = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text, 'full'::text])));

ALTER TABLE public.factuur_regels ADD CONSTRAINT factuur_regels_btw_regime_check CHECK ((btw_regime = ANY (ARRAY['normaal'::text, 'verlaagd'::text, 'vrijgesteld'::text, 'verlegd'::text])));

ALTER TABLE public.factuur_regels ADD CONSTRAINT factuur_regels_verlegd_nul_check CHECK (((btw_regime <> ALL (ARRAY['verlegd'::text, 'vrijgesteld'::text])) OR (COALESCE(btw_pct, (0)::numeric) = (0)::numeric)));

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_klant_type_check CHECK ((klant_type = ANY (ARRAY['klant'::text, 'algemeen'::text])));

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_leverancier_verplicht CHECK (((leverancier_id IS NOT NULL) OR (werkbon_materiaal_id IS NOT NULL) OR (externe_referentie IS NOT NULL) OR (COALESCE(amount, (0)::numeric) <= (0)::numeric))) NOT VALID;

ALTER TABLE public.offerte_items ADD CONSTRAINT offerte_items_btw_regime_check CHECK ((btw_regime = ANY (ARRAY['normaal'::text, 'verlaagd'::text, 'vrijgesteld'::text, 'verlegd'::text])));

ALTER TABLE public.offerte_items ADD CONSTRAINT offerte_items_verlegd_nul_check CHECK (((btw_regime <> ALL (ARRAY['verlegd'::text, 'vrijgesteld'::text])) OR (COALESCE(btw_pct, (0)::numeric) = (0)::numeric)));

ALTER TABLE public.plan_limits ADD CONSTRAINT plan_limits_telwijze_chk CHECK ((telwijze = ANY (ARRAY['voorraad'::text, 'periode'::text])));

ALTER TABLE public.plan_usage_events ADD CONSTRAINT plan_usage_events_soort_chk CHECK ((soort = ANY (ARRAY['offerte'::text, 'factuur'::text])));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'employee'::text, 'medewerker'::text, 'planner'::text])));

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_welkomstactie_chk CHECK (((welkomstactie IS NULL) OR (welkomstactie = ANY (ARRAY['gratis_maanden'::text, 'gratis_website'::text]))));

ALTER TABLE public.urenregistratie ADD CONSTRAINT urenregistratie_pauze_chk CHECK ((pauze_minuten >= 0));

ALTER TABLE public.urenregistratie ADD CONSTRAINT urenregistratie_reis_km_chk CHECK (((reis_km IS NULL) OR (reis_km >= (0)::numeric)));

ALTER TABLE public.website_aanvragen ADD CONSTRAINT website_aanvragen_status_chk CHECK ((status = ANY (ARRAY['open'::text, 'gegevens_gevraagd'::text, 'in_behandeling'::text, 'opgeleverd'::text, 'geannuleerd'::text])));

ALTER TABLE public.werkbon_fotos ADD CONSTRAINT werkbon_fotos_categorie_check CHECK ((categorie = ANY (ARRAY['voor'::text, 'tijdens'::text, 'na'::text])));

ALTER TABLE public.werkbon_uren ADD CONSTRAINT werkbon_uren_km_chk CHECK (((reis_km IS NULL) OR (reis_km >= (0)::numeric)));

ALTER TABLE public.werkbon_uren ADD CONSTRAINT werkbon_uren_pauze_chk CHECK ((pauze_minuten >= 0));

ALTER TABLE public.werkbon_uren ADD CONSTRAINT werkbon_uren_uren_chk CHECK ((uren > (0)::numeric));

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_verantwoordelijke_subset CHECK ((verantwoordelijke_ids <@ assigned_to_ids));



-- ============================================================================
-- F. FUNCTIES  (121)
-- ----------------------------------------------------------------------------
-- Volledige definities uit pg_get_functiondef, inclusief SECURITY DEFINER/INVOKER en search_path.
--    Staan voor de foreign keys, triggers en policies omdat die ernaar verwijzen.
--
--    Elke functie krijgt twee machine-leesbare regels mee:
--      -- @signature <naam>(<identity arguments>)
--      -- @returns   <retourtype>
--    Die komen uit pg_get_function_identity_arguments() en pg_get_function_result().
--    Ze staan er omdat de CREATE-regel zelf NIET betrouwbaar te vergelijken is: die
--    bevat DEFAULT-waarden (12 functies hier hebben die) en soms regelafbrekingen,
--    terwijl de identity arguments precies zijn wat een functie uniek maakt.
--    scripts/db-drift-check.mjs vergelijkt op deze markers, niet op de CREATE-regel.
-- ============================================================================

-- @signature bb_blokkeer_versturen()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_blokkeer_versturen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'verzonden'
     AND COALESCE(OLD.status, '') IS DISTINCT FROM 'verzonden'
     AND NOT public.bb_mag_schrijven()
  THEN
    RAISE EXCEPTION 'READONLY: versturen kan niet zonder actief abonnement'
      USING ERRCODE = 'check_violation',
            HINT    = 'readonly';
  END IF;
  RETURN NEW;
END;
$function$
;

-- @signature bb_boss_claim_bericht(p_user_id uuid, p_max integer)
-- @returns   jsonb
CREATE OR REPLACE FUNCTION public.bb_boss_claim_bericht(p_user_id uuid, p_max integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start  timestamptz;
  v_aantal integer;
BEGIN
  INSERT INTO public.boss_rate_limit (user_id, window_start, aantal)
  VALUES (p_user_id, now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT window_start, aantal INTO v_start, v_aantal
  FROM public.boss_rate_limit WHERE user_id = p_user_id
  FOR UPDATE;

  -- Venster verlopen? Dan begint het opnieuw.
  IF v_start < now() - interval '1 hour' THEN
    v_start := now();
    v_aantal := 0;
  END IF;

  IF v_aantal >= p_max THEN
    RETURN jsonb_build_object(
      'toegestaan', false,
      'gebruikt',   v_aantal,
      'maximum',    p_max,
      'opnieuw_op', v_start + interval '1 hour'
    );
  END IF;

  UPDATE public.boss_rate_limit
     SET window_start = v_start, aantal = v_aantal + 1
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'toegestaan', true,
    'gebruikt',   v_aantal + 1,
    'maximum',    p_max,
    'opnieuw_op', v_start + interval '1 hour'
  );
END;
$function$
;

-- @signature bb_boss_claim_doorzet(p_conversation_id uuid, p_user_id uuid, p_max_per_dag integer)
-- @returns   jsonb
CREATE OR REPLACE FUNCTION public.bb_boss_claim_doorzet(p_conversation_id uuid, p_user_id uuid, p_max_per_dag integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bestaat      boolean;
  v_al_verstuurd timestamptz;
  v_start        timestamptz;
  v_aantal       integer;
BEGIN
  -- Bestaat dit gesprek en is het van deze gebruiker?
  --
  -- Deze controle stond er eerst niet, en dat was fout: bij een gesprek van
  -- iemand anders bleef v_al_verstuurd gewoon NULL, viel de functie door naar de
  -- dagteller en gaf hij alsnog toestemming. De vlag belandde dan nergens, maar
  -- de mail zou wel de deur uit gaan en de teller van het slachtoffer oplopen.
  SELECT true, doorzet_verstuurd_op INTO v_bestaat, v_al_verstuurd
  FROM public.boss_conversations
  WHERE id = p_conversation_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT COALESCE(v_bestaat, false) THEN
    RETURN jsonb_build_object(
      'toegestaan', false,
      'code',       'geen_gesprek',
      'reden',      'Dit gesprek bestaat niet of hoort niet bij jou.'
    );
  END IF;

  IF v_al_verstuurd IS NOT NULL THEN
    RETURN jsonb_build_object(
      'toegestaan', false,
      'code',       'al_doorgezet',
      'reden',      'In dit gesprek is de vraag al doorgezet naar het team.'
    );
  END IF;

  -- Dagteller.
  INSERT INTO public.boss_doorzet_limiet (user_id, window_start, aantal)
  VALUES (p_user_id, now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT window_start, aantal INTO v_start, v_aantal
  FROM public.boss_doorzet_limiet WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_start < now() - interval '24 hours' THEN
    v_start := now();
    v_aantal := 0;
  END IF;

  IF v_aantal >= p_max_per_dag THEN
    RETURN jsonb_build_object(
      'toegestaan', false,
      'code',       'dagmaximum',
      'reden',      format('Er zijn vandaag al %s vragen doorgezet. Dat kan weer na %s.',
                           p_max_per_dag, to_char(v_start + interval '24 hours', 'HH24:MI')),
      'opnieuw_op', v_start + interval '24 hours'
    );
  END IF;

  UPDATE public.boss_doorzet_limiet
     SET window_start = v_start, aantal = v_aantal + 1
   WHERE user_id = p_user_id;

  UPDATE public.boss_conversations
     SET doorzet_verstuurd_op = now()
   WHERE id = p_conversation_id AND user_id = p_user_id;

  RETURN jsonb_build_object('toegestaan', true, 'gebruikt', v_aantal + 1, 'maximum', p_max_per_dag);
END;
$function$
;

-- @signature bb_boss_geef_doorzet_vrij(p_conversation_id uuid, p_user_id uuid)
-- @returns   void
CREATE OR REPLACE FUNCTION public.bb_boss_geef_doorzet_vrij(p_conversation_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.boss_conversations
     SET doorzet_verstuurd_op = NULL
   WHERE id = p_conversation_id AND user_id = p_user_id;

  UPDATE public.boss_doorzet_limiet
     SET aantal = GREATEST(0, aantal - 1)
   WHERE user_id = p_user_id;
END;
$function$
;

-- @signature bb_boss_log_gesprek(p_conversation_id uuid, p_company_id uuid, p_user_id uuid, p_messages jsonb, p_titel text)
-- @returns   uuid
CREATE OR REPLACE FUNCTION public.bb_boss_log_gesprek(p_conversation_id uuid, p_company_id uuid, p_user_id uuid, p_messages jsonb, p_titel text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_conversation_id IS NOT NULL THEN
    UPDATE public.boss_conversations
       SET messages   = p_messages,
           titel      = COALESCE(titel, p_titel),
           updated_at = now()
     WHERE id = p_conversation_id
       AND user_id = p_user_id
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.boss_conversations (company_id, user_id, messages, titel)
  VALUES (p_company_id, p_user_id, p_messages, p_titel)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

-- @signature bb_boss_start_gesprek(p_conversation_id uuid, p_company_id uuid, p_user_id uuid, p_titel text)
-- @returns   uuid
CREATE OR REPLACE FUNCTION public.bb_boss_start_gesprek(p_conversation_id uuid, p_company_id uuid, p_user_id uuid, p_titel text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_conversation_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.boss_conversations
     WHERE id = p_conversation_id AND user_id = p_user_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.boss_conversations (company_id, user_id, messages, titel)
  VALUES (p_company_id, p_user_id, '[]'::jsonb, p_titel)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

-- @signature bb_check_accounting_feature()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_check_accounting_feature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Alleen het OPZETTEN van een koppeling is gated. Bestaande koppelingen mogen
  -- blijven syncen (last_synced_at e.d.) zodat lopende jobs niet stukgaan.
  IF NOT public.bb_has_feature(NEW.company_id, 'boekhoudkoppeling') THEN
    RAISE EXCEPTION 'Boekhoudkoppeling hoort niet bij dit abonnement'
      USING ERRCODE = 'check_violation', HINT = 'feature:boekhoudkoppeling';
  END IF;
  RETURN NEW;
END;
$function$
;

-- @signature bb_check_handtekening_feature()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_check_handtekening_feature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.signed_at IS DISTINCT FROM OLD.signed_at
     AND NEW.signed_at IS NOT NULL
     AND NOT public.bb_has_feature(NEW.company_id, 'digitale_handtekening') THEN
    RAISE EXCEPTION 'Digitale handtekening hoort niet bij dit abonnement'
      USING ERRCODE = 'check_violation', HINT = 'feature:digitale_handtekening';
  END IF;
  RETURN NEW;
END;
$function$
;

-- @signature bb_check_herinnering_feature()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_check_herinnering_feature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.herinnering_1_verstuurd_at IS DISTINCT FROM OLD.herinnering_1_verstuurd_at
      OR NEW.herinnering_2_verstuurd_at IS DISTINCT FROM OLD.herinnering_2_verstuurd_at)
     AND NOT public.bb_has_feature(NEW.company_id, 'betaalherinneringen') THEN
    RAISE EXCEPTION 'Automatische betaalherinneringen horen niet bij dit abonnement'
      USING ERRCODE = 'check_violation', HINT = 'feature:betaalherinneringen';
  END IF;
  RETURN NEW;
END;
$function$
;

-- @signature bb_check_werkbon_voertuig()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_check_werkbon_voertuig()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gewijzigd boolean;
BEGIN
  IF NEW.voertuig_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- OLD bestaat niet bij INSERT, dus TG_OP eerst in een eigen IF (SQL's OR
  -- garandeert geen short-circuit).
  IF TG_OP = 'INSERT' THEN
    v_gewijzigd := true;
  ELSE
    v_gewijzigd := NEW.voertuig_id IS DISTINCT FROM OLD.voertuig_id;
  END IF;

  IF v_gewijzigd AND NOT public.bb_has_feature(NEW.company_id, 'voertuigen') THEN
    RAISE EXCEPTION 'Voertuigen horen niet bij dit abonnement'
      USING ERRCODE = 'check_violation', HINT = 'feature:voertuigen';
  END IF;
  RETURN NEW;
END;
$function$
;

-- @signature bb_claim_trial_mail(p_company_id uuid, p_mail smallint, p_naar text)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_claim_trial_mail(p_company_id uuid, p_mail smallint, p_naar text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.trial_mails (company_id, mail, naar)
  VALUES (p_company_id, p_mail, p_naar);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$function$
;

-- @signature bb_claim_welkomstmail(p_subscription_id text)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_claim_welkomstmail(p_subscription_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_geclaimd boolean := false;
BEGIN
  UPDATE public.subscriptions
     SET welkomstmail_op = now()
   WHERE stripe_subscription_id = p_subscription_id
     AND welkomstmail_op IS NULL
  RETURNING true INTO v_geclaimd;

  RETURN COALESCE(v_geclaimd, false);
END;
$function$
;

-- @signature bb_current_company()
-- @returns   uuid
CREATE OR REPLACE FUNCTION public.bb_current_company()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$function$
;

-- @signature bb_downgrade_blokkades(p_company_id uuid, p_doel_tier text)
-- @returns   TABLE(limiet text, label text, gebruikt integer, maximum integer, teveel integer)
CREATE OR REPLACE FUNCTION public.bb_downgrade_blokkades(p_company_id uuid, p_doel_tier text)
 RETURNS TABLE(limiet text, label text, gebruikt integer, maximum integer, teveel integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    pl.limit_key,
    CASE pl.limit_key
      WHEN 'gebruikers' THEN 'gebruikers'
      WHEN 'klanten'    THEN 'klanten'
      WHEN 'offertes'   THEN 'offertes deze periode'
      WHEN 'facturen'   THEN 'facturen deze periode'
      ELSE pl.limit_key
    END,
    public.bb_usage(p_company_id, pl.limit_key),
    pl.limit_value,
    public.bb_usage(p_company_id, pl.limit_key) - pl.limit_value
  FROM public.plan_limits pl
  WHERE pl.plan = p_doel_tier
    AND pl.limit_value IS NOT NULL
    AND public.bb_usage(p_company_id, pl.limit_key) > pl.limit_value
$function$
;

-- @signature bb_downgrade_blokkades(p_doel_tier text)
-- @returns   TABLE(limiet text, label text, gebruikt integer, maximum integer, teveel integer)
CREATE OR REPLACE FUNCTION public.bb_downgrade_blokkades(p_doel_tier text)
 RETURNS TABLE(limiet text, label text, gebruikt integer, maximum integer, teveel integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.bb_downgrade_blokkades(public.bb_current_company(), p_doel_tier)
$function$
;

-- @signature bb_effective_tier()
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_effective_tier()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_effective_tier(public.bb_current_company())
$function$
;

-- @signature bb_effective_tier(p_company_id uuid)
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_effective_tier(p_company_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT CASE WHEN s.plan IN ('starter', 'groei', 'team') THEN s.plan ELSE 'groei' END
    FROM public.subscriptions s WHERE s.company_id = p_company_id LIMIT 1
  ), 'starter')
$function$
;

-- @signature bb_factuurtotalen(p_factuur_id uuid)
-- @returns   TABLE(excl numeric, incl numeric)
CREATE OR REPLACE FUNCTION public.bb_factuurtotalen(p_factuur_id uuid)
 RETURNS TABLE(excl numeric, incl numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with toegang as (
    -- Geen sessie = trigger of backend: doorlaten. Wél een sessie: dan moet de
    -- factuur van het eigen bedrijf zijn.
    select auth.uid() is null
        or exists (select 1 from public.facturen f
                    where f.id = p_factuur_id and f.company_id = current_company_id()) as mag
  ),
  per_tarief as (
    select coalesce(fr.btw_pct, 21)          as pct,
           coalesce(fr.btw_regime, 'normaal') as regime,
           sum(round(coalesce(fr.regelprijs, 0), 2)) as excl
      from public.factuur_regels fr, toegang t
     where fr.factuur_id = p_factuur_id and t.mag
     group by 1, 2
  ),
  totalen as (
    select round(sum(excl), 2) as excl,
           -- Vrijgesteld en verlegd leveren geen btw op, ongeacht het
           -- percentage dat er toevallig bij staat. Zo blijft het totaal gelijk
           -- aan wat de boekhouding geboekt krijgt.
           sum(case when regime in ('vrijgesteld', 'verlegd') then 0
                    else round(excl * pct / 100, 2) end) as btw
      from per_tarief
  )
  select excl, round(excl + btw, 2) from totalen where excl is not null;
$function$
;

-- @signature bb_factuurtotalen_bij_regel()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_factuurtotalen_bij_regel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.bb_herbereken_factuurtotalen(coalesce(new.factuur_id, old.factuur_id));
  -- Een regel die naar een andere factuur verhuist laat er twee scheef achter.
  if tg_op = 'UPDATE' and new.factuur_id is distinct from old.factuur_id then
    perform public.bb_herbereken_factuurtotalen(old.factuur_id);
  end if;
  return null;
end;
$function$
;

-- @signature bb_factuurtotalen_forceren()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_factuurtotalen_forceren()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_excl numeric;
  v_incl numeric;
begin
  select excl, incl into v_excl, v_incl from public.bb_factuurtotalen(new.id);
  if v_excl is null then return new; end if;  -- factuur zonder regels: met rust laten
  new.totaal_excl := v_excl;
  new.totaal_incl := v_incl;
  return new;
end;
$function$
;

-- @signature bb_gedeelde_werkruimte()
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_gedeelde_werkruimte()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_has_feature('gedeelde_werkruimte')
$function$
;

-- @signature bb_geef_trial_mail_vrij(p_company_id uuid, p_mail smallint)
-- @returns   void
CREATE OR REPLACE FUNCTION public.bb_geef_trial_mail_vrij(p_company_id uuid, p_mail smallint)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.trial_mails WHERE company_id = p_company_id AND mail = p_mail
$function$
;

-- @signature bb_has_feature(p_company_id uuid, p_feature text)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_has_feature(p_company_id uuid, p_feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    NOT public.bb_plan_geconfigureerd(p_company_id)
    AND NOT COALESCE((SELECT pfd.intern FROM public.plan_feature_defs pfd WHERE pfd.feature = p_feature), false)
  ) OR EXISTS (
    SELECT 1 FROM public.plan_features pf
    WHERE pf.plan = public.bb_effective_tier(p_company_id) AND pf.feature = p_feature
  ) OR EXISTS (
    SELECT 1
    FROM public.company_modules cm
    JOIN public.plan_modules      pm  ON pm.module_key  = cm.module_key
    JOIN public.plan_module_tiers pmt ON pmt.module_key = cm.module_key
                                     AND pmt.plan = public.bb_effective_tier(p_company_id)
    WHERE cm.company_id = p_company_id AND cm.actief AND pm.feature = p_feature
  )
$function$
;

-- @signature bb_has_feature(p_feature text)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_has_feature(p_feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_has_feature(public.bb_current_company(), p_feature)
$function$
;

-- @signature bb_has_permission(p_permission text)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT role IN ('admin','planner') FROM profiles WHERE id = auth.uid()), false)
    OR EXISTS (SELECT 1 FROM user_permissions WHERE user_id = auth.uid() AND permission = p_permission AND granted);
$function$
;

-- @signature bb_herbereken_factuurtotalen(p_factuur_id uuid)
-- @returns   void
CREATE OR REPLACE FUNCTION public.bb_herbereken_factuurtotalen(p_factuur_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_excl numeric;
  v_incl numeric;
begin
  if p_factuur_id is null then return; end if;
  select excl, incl into v_excl, v_incl from public.bb_factuurtotalen(p_factuur_id);
  if v_excl is null then return; end if;

  update public.facturen
     set totaal_excl = v_excl,
         totaal_incl = v_incl
   where id = p_factuur_id
     and (totaal_excl is distinct from v_excl or totaal_incl is distinct from v_incl);
end;
$function$
;

-- @signature bb_herbereken_offertetotalen(p_offerte_id uuid)
-- @returns   void
CREATE OR REPLACE FUNCTION public.bb_herbereken_offertetotalen(p_offerte_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_excl numeric;
  v_incl numeric;
begin
  if p_offerte_id is null then return; end if;
  select excl, incl into v_excl, v_incl from public.bb_offertetotalen(p_offerte_id);
  if v_excl is null then return; end if;

  update public.offertes
     set totaal_excl = v_excl,
         totaal_incl = v_incl
   where id = p_offerte_id
     and (totaal_excl is distinct from v_excl or totaal_incl is distinct from v_incl);
end;
$function$
;

-- @signature bb_import_genegeerd_bewijs()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_import_genegeerd_bewijs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bestaat boolean;
begin
  if new.company_id is distinct from current_company_id() then
    raise exception 'Prullenbakregel hoort niet bij je eigen bedrijf'
      using errcode = 'check_violation';
  end if;

  if new.provider is null or new.provider not in ('snelstart', 'moneybird', 'afas') then
    raise exception 'Onbekende provider voor de prullenbak: %', new.provider
      using errcode = 'check_violation';
  end if;
  if new.soort is null or new.soort not in ('klant', 'leverancier', 'factuur', 'kost') then
    raise exception 'Onbekende soort voor de prullenbak: %', new.soort
      using errcode = 'check_violation';
  end if;
  if new.externe_id is null or btrim(new.externe_id) = '' then
    raise exception 'Prullenbakregel zonder externe_id'
      using errcode = 'check_violation';
  end if;

  -- Zelfde bewerking als negeerBijImport: prefix eraf, alles vanaf het eerste
  -- resterende underscore eraf. Zo vergelijken beide kanten hetzelfde.
  select case new.soort
    when 'klant' then exists (
      select 1 from public.customers c
       where c.company_id = new.company_id
         and split_part(regexp_replace(c.snelstart_id, '^snelstart_', ''), '_', 1) = new.externe_id)
    when 'leverancier' then exists (
      select 1 from public.leveranciers l
       where l.company_id = new.company_id
         and split_part(regexp_replace(l.snelstart_id, '^snelstart_', ''), '_', 1) = new.externe_id)
    when 'factuur' then exists (
      select 1 from public.facturen f
       where f.company_id = new.company_id
         and split_part(regexp_replace(f.externe_referentie, '^snelstart_', ''), '_', 1) = new.externe_id)
    when 'kost' then exists (
      select 1 from public.job_costs k
       where k.company_id = new.company_id
         and split_part(regexp_replace(k.externe_referentie, '^snelstart_', ''), '_', 1) = new.externe_id)
  end into v_bestaat;

  if v_bestaat then
    raise exception 'Dit record bestaat nog in BossBase; verwijder het daar in plaats van het hier over te slaan'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$
;

-- @signature bb_is_admin_or_permission(p_permission text)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_is_admin_or_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT role = 'admin' FROM profiles WHERE id = auth.uid()), false)
    OR EXISTS (SELECT 1 FROM user_permissions WHERE user_id = auth.uid() AND permission = p_permission AND granted);
$function$
;

-- @signature bb_is_readonly()
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_is_readonly()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_readonly_reden(public.bb_current_company()) IS NOT NULL
$function$
;

-- @signature bb_is_readonly(p_company_id uuid)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_is_readonly(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_readonly_reden(p_company_id) IS NOT NULL
$function$
;

-- @signature bb_is_trial()
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_is_trial()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_is_trial(public.bb_current_company())
$function$
;

-- @signature bb_is_trial(p_company_id uuid)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_is_trial(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT s.status = 'trial' AND (s.trial_ends_at IS NULL OR s.trial_ends_at > now())
    FROM public.subscriptions s WHERE s.company_id = p_company_id LIMIT 1
  ), false)
$function$
;

-- @signature bb_limit(p_company_id uuid, p_key text)
-- @returns   integer
CREATE OR REPLACE FUNCTION public.bb_limit(p_company_id uuid, p_key text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT public.bb_plan_geconfigureerd(p_company_id) THEN NULL
    WHEN public.bb_is_trial(p_company_id)                THEN NULL
    ELSE (
      SELECT pl.limit_value FROM public.plan_limits pl
      WHERE pl.plan = public.bb_effective_tier(p_company_id) AND pl.limit_key = p_key
    )
  END
$function$
;

-- @signature bb_limit(p_key text)
-- @returns   integer
CREATE OR REPLACE FUNCTION public.bb_limit(p_key text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_limit(public.bb_current_company(), p_key)
$function$
;

-- @signature bb_log_factuur_usage()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_log_factuur_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(NEW.is_credit, false) THEN
    INSERT INTO public.plan_usage_events (company_id, soort, periode_start, ref_id)
    VALUES (NEW.company_id, 'factuur', public.bb_periode_start(NEW.company_id), NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

-- @signature bb_log_offerte_usage()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_log_offerte_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.bb_offerte_telt_mee(NEW.company_id, NEW.nummer, NEW.customer_id, NEW.id) THEN
    INSERT INTO public.plan_usage_events (company_id, soort, periode_start, ref_id)
    VALUES (NEW.company_id, 'offerte', public.bb_periode_start(NEW.company_id), NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

-- @signature bb_mag_abonnement_beheren(p_user_id uuid)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_mag_abonnement_beheren(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT p.role = 'admin' AND p.actief IS DISTINCT FROM false
    FROM public.profiles p WHERE p.id = p_user_id
  ), false)
$function$
;

-- @signature bb_mag_direct_opzeggen(p_company_id uuid)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_mag_direct_opzeggen(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT s.verplichting_tot IS NULL OR s.verplichting_tot <= now()
    FROM public.subscriptions s WHERE s.company_id = p_company_id
  ), true)
$function$
;

-- @signature bb_mag_inkoopprijs_zien()
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_mag_inkoopprijs_zien()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
      or exists (
        select 1 from user_permissions
        where user_id = auth.uid() and permission = 'inkoopprijzen' and granted
      );
$function$
;

-- @signature bb_mag_schrijven()
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_mag_schrijven()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_readonly_reden(public.bb_current_company()) IS NULL
$function$
;

-- @signature bb_mag_werkbon_uren_beheren(p_werkbon uuid)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_mag_werkbon_uren_beheren(p_werkbon uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.werkbonnen w
    where w.id = p_werkbon
      and w.company_id = (select company_id from public.profiles where id = auth.uid())
      and (
        auth.uid() = any (w.assigned_to_ids)
        or auth.uid() = any (w.verantwoordelijke_ids)
        or coalesce((select role in ('admin', 'planner') from public.profiles where id = auth.uid()), false)
      )
  );
$function$
;

-- @signature bb_mag_wisselen(p_company_id uuid, p_doel_tier text)
-- @returns   jsonb
CREATE OR REPLACE FUNCTION public.bb_mag_wisselen(p_company_id uuid, p_doel_tier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_huidig      text;
  v_rang_nu     int;
  v_rang_doel   int;
  v_verplicht   timestamptz;
  v_blokkades   jsonb;
  v_nieuwe      timestamptz;
BEGIN
  IF p_doel_tier NOT IN ('starter', 'groei', 'team') THEN
    RETURN jsonb_build_object('mag', false, 'code', 'onbekend_pakket',
                              'reden', 'Onbekend pakket.');
  END IF;

  SELECT public.bb_effective_tier(p_company_id) INTO v_huidig;
  SELECT s.verplichting_tot INTO v_verplicht
    FROM public.subscriptions s WHERE s.company_id = p_company_id;

  v_rang_nu   := array_position(ARRAY['starter','groei','team'], v_huidig);
  v_rang_doel := array_position(ARRAY['starter','groei','team'], p_doel_tier);

  IF v_rang_doel = v_rang_nu THEN
    RETURN jsonb_build_object('mag', true, 'richting', 'gelijk',
                              'looptijdReset', false);
  END IF;

  -- Omhoog: altijd goed. Geen limietcontrole nodig — een ruimer pakket kan per
  -- definitie alles wat het huidige kan. Bij een jaarabonnement start de
  -- looptijd wel opnieuw; die datum gaat mee zodat het scherm hem kan tonen
  -- vóór de klant bevestigt.
  IF v_rang_doel > v_rang_nu THEN
    v_nieuwe := public.bb_nieuwe_looptijd(p_company_id, p_doel_tier);
    RETURN jsonb_build_object(
      'mag', true, 'richting', 'omhoog',
      'looptijdReset', (v_nieuwe IS NOT NULL),
      'nieuweVerplichtingTot', v_nieuwe,
      'huidigeVerplichtingTot', v_verplicht);
  END IF;

  -- Omlaag binnen de looptijd van een jaarabonnement: nee.
  IF v_verplicht IS NOT NULL AND v_verplicht > now() THEN
    RETURN jsonb_build_object(
      'mag', false, 'richting', 'omlaag', 'code', 'binnen_looptijd',
      'looptijdReset', false,
      'verplichtingTot', v_verplicht,
      'reden', format('Je jaarabonnement loopt tot %s. Naar een kleiner pakket kan daarna; upgraden kan wel meteen.',
                      to_char(v_verplicht, 'DD-MM-YYYY')));
  END IF;

  -- Omlaag buiten de looptijd: mag, zolang het past.
  SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_blokkades
    FROM public.bb_downgrade_blokkades(p_company_id, p_doel_tier) b;

  IF jsonb_array_length(v_blokkades) > 0 THEN
    RETURN jsonb_build_object(
      'mag', false, 'richting', 'omlaag', 'code', 'boven_limiet',
      'looptijdReset', false,
      'blokkades', v_blokkades,
      'reden', 'Je zit boven de limiet van dit pakket.');
  END IF;

  RETURN jsonb_build_object('mag', true, 'richting', 'omlaag', 'looptijdReset', false);
END;
$function$
;

-- @signature bb_mag_wisselen(p_doel_tier text)
-- @returns   jsonb
CREATE OR REPLACE FUNCTION public.bb_mag_wisselen(p_doel_tier text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_mag_wisselen(public.bb_current_company(), p_doel_tier)
$function$
;

-- @signature bb_nieuwe_company_kostencategorieen()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_nieuwe_company_kostencategorieen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.bb_zet_standaard_kostencategorieen(new.id);
  return new;
end;
$function$
;

-- @signature bb_nieuwe_looptijd(p_company_id uuid, p_doel_tier text)
-- @returns   timestamp with time zone
CREATE OR REPLACE FUNCTION public.bb_nieuwe_looptijd(p_company_id uuid, p_doel_tier text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_huidig    text;
  v_interval  text;
  v_start     timestamptz;
  v_rang_nu   int;
  v_rang_doel int;
BEGIN
  IF p_doel_tier NOT IN ('starter', 'groei', 'team') THEN RETURN NULL; END IF;

  SELECT public.bb_effective_tier(p_company_id) INTO v_huidig;
  SELECT s.billing_interval, s.current_period_start
    INTO v_interval, v_start
    FROM public.subscriptions s WHERE s.company_id = p_company_id;

  -- Alleen jaarabonnementen kennen een looptijd om te resetten.
  IF COALESCE(v_interval, 'maand') <> 'jaar' THEN RETURN NULL; END IF;

  v_rang_nu   := array_position(ARRAY['starter','groei','team'], v_huidig);
  v_rang_doel := array_position(ARRAY['starter','groei','team'], p_doel_tier);

  -- Alleen omhoog. Gelijk blijven of omlaag gaan raakt de looptijd niet.
  IF v_rang_doel IS NULL OR v_rang_nu IS NULL OR v_rang_doel <= v_rang_nu THEN
    RETURN NULL;
  END IF;

  -- Verankerd aan de factuurperiode, want daar zet Stripe de fase ook op. Is er
  -- (nog) geen periodestart bekend, dan is nu het beste anker dat we hebben.
  RETURN COALESCE(v_start, now()) + interval '12 months';
END;
$function$
;

-- @signature bb_offerte_telt_mee(p_company_id uuid, p_nummer text, p_customer_id uuid, p_id uuid)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_offerte_telt_mee(p_company_id uuid, p_nummer text, p_customer_id uuid, p_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT (
    COALESCE(p_nummer, '') ~ '-v[0-9]+$'
    AND EXISTS (
      SELECT 1 FROM public.offertes o
      WHERE o.company_id = p_company_id
        AND (p_id IS NULL OR o.id <> p_id)
        AND o.customer_id IS NOT DISTINCT FROM p_customer_id
        -- zelfde basisnummer: het origineel (BB-005) of een eerdere versie
        AND left(o.nummer, length(regexp_replace(p_nummer, '-v[0-9]+$', '')))
            = regexp_replace(p_nummer, '-v[0-9]+$', '')
        AND (o.nummer = regexp_replace(p_nummer, '-v[0-9]+$', '') OR o.nummer ~ '-v[0-9]+$')
    )
  )
$function$
;

-- @signature bb_offertetotalen(p_offerte_id uuid)
-- @returns   TABLE(excl numeric, incl numeric)
CREATE OR REPLACE FUNCTION public.bb_offertetotalen(p_offerte_id uuid)
 RETURNS TABLE(excl numeric, incl numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with toegang as (
    select auth.uid() is null
        or exists (select 1 from public.offertes o
                    where o.id = p_offerte_id and o.company_id = current_company_id()) as mag
  ),
  per_tarief as (
    select coalesce(oi.btw_pct, 21)          as pct,
           coalesce(oi.btw_regime, 'normaal') as regime,
           sum(round(coalesce(oi.subtotaal, 0), 2)) as excl
      from public.offerte_items oi, toegang t
     where oi.offerte_id = p_offerte_id and t.mag
     group by 1, 2
  ),
  totalen as (
    select round(sum(excl), 2) as excl,
           sum(case when regime in ('vrijgesteld', 'verlegd') then 0
                    else round(excl * pct / 100, 2) end) as btw
      from per_tarief
  )
  select excl, round(excl + btw, 2) from totalen where excl is not null;
$function$
;

-- @signature bb_offertetotalen_bij_regel()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_offertetotalen_bij_regel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.bb_herbereken_offertetotalen(coalesce(new.offerte_id, old.offerte_id));
  if tg_op = 'UPDATE' and new.offerte_id is distinct from old.offerte_id then
    perform public.bb_herbereken_offertetotalen(old.offerte_id);
  end if;
  return null;
end;
$function$
;

-- @signature bb_offertetotalen_forceren()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_offertetotalen_forceren()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_excl numeric;
  v_incl numeric;
begin
  select excl, incl into v_excl, v_incl from public.bb_offertetotalen(new.id);
  if v_excl is null then return new; end if;  -- offerte zonder regels: met rust laten
  new.totaal_excl := v_excl;
  new.totaal_incl := v_incl;
  return new;
end;
$function$
;

-- @signature bb_open_website_aanvraag(p_company_id uuid)
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_open_website_aanvraag(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_nieuw boolean := false;
BEGIN
  -- Alleen als de klant daadwerkelijk voor de website heeft gekozen.
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE company_id = p_company_id AND welkomstactie = 'gratis_website'
  ) THEN
    RETURN 'genegeerd: geen websitekeuze vastgelegd';
  END IF;

  INSERT INTO public.website_aanvragen (company_id, status)
  VALUES (p_company_id, 'open')
  ON CONFLICT (company_id) DO NOTHING;

  GET DIAGNOSTICS v_nieuw = ROW_COUNT;
  RETURN CASE WHEN v_nieuw THEN 'aangemaakt' ELSE 'bestond al' END;
END;
$function$
;

-- @signature bb_opzegbaar_per(p_company_id uuid)
-- @returns   timestamp with time zone
CREATE OR REPLACE FUNCTION public.bb_opzegbaar_per(p_company_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.bb_mag_direct_opzeggen(p_company_id)
      THEN (SELECT s.current_period_end FROM public.subscriptions s WHERE s.company_id = p_company_id)
    ELSE (SELECT s.verplichting_tot FROM public.subscriptions s WHERE s.company_id = p_company_id)
  END
$function$
;

-- @signature bb_periode_start()
-- @returns   date
CREATE OR REPLACE FUNCTION public.bb_periode_start()
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_periode_start(public.bb_current_company())
$function$
;

-- @signature bb_periode_start(p_company_id uuid)
-- @returns   date
CREATE OR REPLACE FUNCTION public.bb_periode_start(p_company_id uuid)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anker   date;
  v_maanden int;
  v_start   date;
BEGIN
  SELECT COALESCE(c.periode_start, s.started_at::date, c.created_at::date)
    INTO v_anker
  FROM public.companies c
  LEFT JOIN public.subscriptions s ON s.company_id = c.id
  WHERE c.id = p_company_id
  LIMIT 1;

  IF v_anker IS NULL THEN
    RETURN date_trunc('month', current_date)::date;
  END IF;
  IF v_anker > current_date THEN
    RETURN v_anker;
  END IF;

  v_maanden := (EXTRACT(YEAR  FROM age(current_date, v_anker)) * 12
              + EXTRACT(MONTH FROM age(current_date, v_anker)))::int;
  v_start := (v_anker + (v_maanden || ' months')::interval)::date;
  IF v_start > current_date THEN
    v_start := (v_anker + ((v_maanden - 1) || ' months')::interval)::date;
  END IF;
  RETURN v_start;
END;
$function$
;

-- @signature bb_plan_geconfigureerd()
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_plan_geconfigureerd()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_plan_geconfigureerd(public.bb_current_company())
$function$
;

-- @signature bb_plan_geconfigureerd(p_company_id uuid)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_plan_geconfigureerd(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_company_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.company_id = p_company_id)
     AND EXISTS (SELECT 1 FROM public.plan_limits   pl WHERE pl.plan = public.bb_effective_tier(p_company_id))
     AND EXISTS (SELECT 1 FROM public.plan_features pf WHERE pf.plan = public.bb_effective_tier(p_company_id))
$function$
;

-- @signature bb_readonly_reden()
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_readonly_reden()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_readonly_reden(public.bb_current_company())
$function$
;

-- @signature bb_readonly_reden(p_company_id uuid)
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_readonly_reden(p_company_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Veiligheidsklep. Geen bruikbare configuratie = we WETEN het niet, en dan
    -- blokkeren we niet. Dekt onder meer een bedrijf zonder abonnementsrij en
    -- een matrix die (nog) niet geseed is.
    WHEN NOT public.bb_plan_geconfigureerd(p_company_id) THEN NULL

    -- Lopende proefperiode. Dekt zowel onze eigen 14 dagen als een Stripe-trial.
    -- Een bedrijf in de gratis periode is per definitie nooit read-only.
    WHEN public.bb_is_trial(p_company_id) THEN NULL

    ELSE (
      SELECT CASE
        -- ── Abonnement bij Stripe: Stripe is dan de waarheid ────────────────
        WHEN s.stripe_subscription_id IS NOT NULL THEN CASE
          -- Nog geen status binnen (webhook onderweg) → niet blokkeren.
          WHEN s.stripe_status IS NULL                                THEN NULL
          WHEN s.stripe_status IN ('active', 'trialing')               THEN NULL
          WHEN s.stripe_status IN ('past_due', 'unpaid')               THEN 'betaling_mislukt'
          -- 'canceled' krijgt Stripe pas ná afloop van de betaalde periode;
          -- tot dat moment blijft de status 'active' met een opzegdatum. De
          -- klant houdt dus waar hij voor betaald heeft.
          WHEN s.stripe_status IN ('canceled', 'incomplete_expired',
                                   'paused')                           THEN 'opgezegd'
          -- 'incomplete' = eerste betaling nog onderweg, vlak na de checkout.
          -- Dat is een moment, geen toestand — niet blokkeren.
          ELSE NULL
        END

        -- ── Geen Stripe-abonnement: onze eigen database is de waarheid ──────
        -- Handmatig op actief gezet (super admin, afspraak buiten Stripe om) →
        -- gewoon een klant.
        WHEN s.status = 'actief' THEN NULL
        WHEN s.status = 'trial' AND s.trial_ends_at IS NOT NULL
                                AND s.trial_ends_at <= now() THEN 'proefperiode_verlopen'
        WHEN s.status IN ('opgezegd', 'geannuleerd', 'cancelled') THEN 'opgezegd'
        -- Alles wat we niet herkennen: open laten.
        ELSE NULL
      END
      FROM public.subscriptions s WHERE s.company_id = p_company_id LIMIT 1
    )
  END
$function$
;

-- @signature bb_registreer_welkomstactie(p_company_id uuid, p_actie text, p_interval text)
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_registreer_welkomstactie(p_company_id uuid, p_actie text, p_interval text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_huidig text;
  v_tier   text;
BEGIN
  IF p_actie IS NULL OR p_actie = '' THEN RETURN 'geen actie'; END IF;

  -- Een welkomstactie hoort uitsluitend bij een jaarabonnement.
  IF p_interval IS DISTINCT FROM 'jaar' THEN
    RETURN 'genegeerd: welkomstactie hoort bij een jaarabonnement';
  END IF;

  SELECT welkomstactie INTO v_huidig FROM public.subscriptions WHERE company_id = p_company_id;
  IF NOT FOUND THEN RETURN 'genegeerd: bedrijf zonder abonnementsrij'; END IF;

  -- Al gekozen: nooit stilzwijgend vervangen (de trigger zou het ook weigeren,
  -- maar zo krijgt de webhook een net antwoord in plaats van een fout).
  IF v_huidig IS NOT NULL THEN
    RETURN CASE WHEN v_huidig = p_actie
      THEN 'ongewijzigd: ' || v_huidig
      ELSE 'geweigerd: er is al een andere welkomstactie gekozen (' || v_huidig || ')' END;
  END IF;

  v_tier := public.bb_effective_tier(p_company_id);

  -- De gratis website is niet beschikbaar bij Starter.
  IF p_actie = 'gratis_website' AND v_tier = 'starter' THEN
    RETURN 'geweigerd: de gratis website hoort niet bij Starter';
  END IF;

  UPDATE public.subscriptions
     SET welkomstactie = p_actie, welkomstactie_gekozen_op = now()
   WHERE company_id = p_company_id;

  RETURN 'vastgelegd: ' || p_actie;
END;
$function$
;

-- @signature bb_seed_trial_subscription()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_seed_trial_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Trial is altijd Groei of Team; we starten op Groei.
  INSERT INTO public.subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
  VALUES (NEW.id, 'groei', 'trial', 0, now(), now() + interval '14 days')
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

-- @signature bb_set_updated_at()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

-- @signature bb_set_upgrade_request_author()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_set_upgrade_request_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.aangevraagd_door := auth.uid();
  NEW.status := 'open';
  RETURN NEW;
END;
$function$
;

-- @signature bb_stripe_sync_modules(p_company_id uuid, p_modules jsonb)
-- @returns   integer
CREATE OR REPLACE FUNCTION public.bb_stripe_sync_modules(p_company_id uuid, p_modules jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aan text[];
BEGIN
  -- Alleen voor bedrijven die daadwerkelijk aan Stripe hangen.
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE company_id = p_company_id AND stripe_subscription_id IS NOT NULL
  ) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(array_agg(m->>'module_key'), '{}') INTO v_aan
  FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) m;

  INSERT INTO public.company_modules (company_id, module_key, actief, stripe_item_id, stripe_price_id)
  SELECT p_company_id, m->>'module_key', true, m->>'item_id', m->>'price_id'
  FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) m
  ON CONFLICT (company_id, module_key) DO UPDATE SET
    actief          = true,
    stripe_item_id  = EXCLUDED.stripe_item_id,
    stripe_price_id = EXCLUDED.stripe_price_id;

  UPDATE public.company_modules
     SET actief = false
   WHERE company_id = p_company_id
     AND NOT (module_key = ANY(v_aan))
     AND actief;

  RETURN array_length(v_aan, 1);
END;
$function$
;

-- @signature bb_stripe_sync_schedule(p_subscription_id text, p_schedule_id text, p_verplichting_tot timestamp with time zone, p_stopt_na boolean)
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_stripe_sync_schedule(p_subscription_id text, p_schedule_id text, p_verplichting_tot timestamp with time zone, p_stopt_na boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company
  FROM public.subscriptions
  WHERE stripe_subscription_id = p_subscription_id;

  IF v_company IS NULL THEN
    RETURN 'genegeerd: geen gekoppeld bedrijf voor dit abonnement';
  END IF;

  UPDATE public.subscriptions SET
    stripe_schedule_id = COALESCE(p_schedule_id, stripe_schedule_id),
    verplichting_tot   = COALESCE(p_verplichting_tot, verplichting_tot),
    stopt_na_looptijd  = COALESCE(p_stopt_na, stopt_na_looptijd)
  WHERE company_id = v_company;

  RETURN 'schedule bijgewerkt';
END;
$function$
;

-- @signature bb_stripe_sync_stopdatum(p_subscription_id text, p_stopt_op timestamp with time zone)
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_stripe_sync_stopdatum(p_subscription_id text, p_stopt_op timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.subscriptions
  WHERE stripe_subscription_id = p_subscription_id;
  IF v_company IS NULL THEN RETURN 'genegeerd'; END IF;
  UPDATE public.subscriptions SET stopt_op = p_stopt_op WHERE company_id = v_company;
  RETURN COALESCE(p_stopt_op::text, 'geen stopdatum');
END;
$function$
;

-- @signature bb_stripe_sync_subscription(p_company_id uuid, p_subscription_id text, p_customer_id text, p_plan text, p_stripe_status text, p_price_id text, p_extra_gebruikers integer, p_interval text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_cancel_at_end boolean, p_bind boolean)
-- @returns   text
CREATE OR REPLACE FUNCTION public.bb_stripe_sync_subscription(p_company_id uuid, p_subscription_id text, p_customer_id text, p_plan text, p_stripe_status text, p_price_id text, p_extra_gebruikers integer, p_interval text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_cancel_at_end boolean, p_bind boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_huidig text;
BEGIN
  IF p_company_id IS NULL OR p_subscription_id IS NULL THEN
    RETURN 'genegeerd: geen bedrijf of subscription';
  END IF;

  SELECT stripe_subscription_id INTO v_huidig
  FROM public.subscriptions WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN 'genegeerd: bedrijf zonder abonnementsrij';
  END IF;

  -- DE REGEL. Zonder gekoppeld abonnement is onze database leidend en blijft de
  -- gratis proefperiode met rust — behalve op het bindmoment zelf.
  IF v_huidig IS NULL AND NOT p_bind THEN
    RETURN 'genegeerd: DB-proefperiode zonder Stripe-abonnement';
  END IF;

  -- Nooit een bestaande koppeling stilzwijgend vervangen door een andere.
  IF v_huidig IS NOT NULL AND v_huidig IS DISTINCT FROM p_subscription_id THEN
    RETURN 'genegeerd: hoort bij een ander Stripe-abonnement';
  END IF;

  UPDATE public.subscriptions SET
    stripe_subscription_id = p_subscription_id,
    stripe_customer_id     = COALESCE(p_customer_id, stripe_customer_id),
    plan                   = COALESCE(p_plan, plan),
    stripe_status          = COALESCE(p_stripe_status, stripe_status),
    stripe_price_id        = COALESCE(p_price_id, stripe_price_id),
    extra_gebruikers       = COALESCE(p_extra_gebruikers, extra_gebruikers),
    billing_interval       = COALESCE(p_interval, billing_interval),
    current_period_start   = COALESCE(p_period_start, current_period_start),
    current_period_end     = COALESCE(p_period_end, current_period_end),
    cancel_at_period_end   = COALESCE(p_cancel_at_end, cancel_at_period_end),
    price_per_month        = COALESCE((SELECT t.prijs FROM (VALUES
                               ('starter', 29::numeric), ('groei', 39), ('team', 59)
                             ) AS t(plan, prijs) WHERE t.plan = p_plan), price_per_month),
    -- Onze eigen status volgt die van Stripe:
    --   trialing              → trial   (de 60-daagse jaarperiode valt hieronder)
    --   active               → actief
    --   past_due/unpaid      → betaalprobleem
    --   canceled/incomplete* → opgezegd
    status = CASE
      WHEN p_stripe_status = 'trialing'                       THEN 'trial'
      WHEN p_stripe_status = 'active'                         THEN 'actief'
      WHEN p_stripe_status IN ('past_due', 'unpaid')          THEN 'betaalprobleem'
      WHEN p_stripe_status IN ('canceled', 'incomplete_expired') THEN 'opgezegd'
      ELSE status
    END,
    -- Bij een Stripe-trial is trial_ends_at het einde van die periode; anders
    -- laten we de oude DB-waarde met rust (die is dan historie).
    trial_ends_at = CASE WHEN p_stripe_status = 'trialing' THEN p_period_end ELSE trial_ends_at END,
    cancelled_at  = CASE WHEN p_stripe_status = 'canceled' THEN now() ELSE cancelled_at END
  WHERE company_id = p_company_id;

  -- De verbrukstellers ankeren op companies.periode_start; die volgt nu de
  -- factuurperiode van Stripe in plaats van de aanmaakdatum van het bedrijf.
  IF p_period_start IS NOT NULL THEN
    UPDATE public.companies SET periode_start = p_period_start::date WHERE id = p_company_id;
  END IF;

  RETURN CASE WHEN v_huidig IS NULL THEN 'gekoppeld' ELSE 'bijgewerkt' END;
END;
$function$
;

-- @signature bb_trial_mail_kandidaten(p_vandaag date)
-- @returns   TABLE(company_id uuid, mail smallint, naar text, naam text, bedrijfsnaam text, trial_eindigt date)
CREATE OR REPLACE FUNCTION public.bb_trial_mail_kandidaten(p_vandaag date DEFAULT CURRENT_DATE)
 RETURNS TABLE(company_id uuid, mail smallint, naar text, naam text, bedrijfsnaam text, trial_eindigt date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH schema AS (
    -- Verschuiving ten opzichte van trial_ends_at, per mail.
    SELECT * FROM (VALUES
      (7::smallint,  -7),
      (11::smallint, -3),
      (14::smallint, -1),
      (15::smallint,  1),
      (30::smallint, 15)
    ) AS s(mail, verschuiving)
  ),
  -- De eigenaar/admin van het bedrijf. Bij meerdere admins de oudste, zodat het
  -- altijd dezelfde persoon is en niet per dag wisselt.
  eigenaar AS (
    SELECT DISTINCT ON (p.company_id)
           p.company_id, u.email AS email, p.full_name
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'admin'
      AND COALESCE(p.actief, true)
      AND p.verwijderd_op IS NULL
    ORDER BY p.company_id, p.created_at
  )
  SELECT
    c.id,
    s.mail,
    COALESCE(e.email, c.email)                                        AS naar,
    -- Voornaam van de eigenaar; anders de bedrijfsnaam. Nooit leeg, want
    -- "Hoi ," is erger dan een bedrijfsnaam in de aanhef.
    COALESCE(NULLIF(split_part(COALESCE(e.full_name, ''), ' ', 1), ''),
             NULLIF(c.name, ''), 'daar')                              AS naam,
    c.name                                                            AS bedrijfsnaam,
    sub.trial_ends_at::date                                           AS trial_eindigt
  FROM public.companies c
  JOIN public.subscriptions sub ON sub.company_id = c.id
  LEFT JOIN eigenaar e ON e.company_id = c.id
  CROSS JOIN schema s
  WHERE sub.status = 'trial'
    -- Uitgesloten bedrijven vallen er hier uit, vóór elke andere voorwaarde.
    AND NOT COALESCE(c.trial_mails_uitgesloten, false)
    -- Nooit een abonnement afgesloten. Zodra hier iets staat, stopt de reeks.
    AND sub.stripe_subscription_id IS NULL
    AND sub.stripe_customer_id IS NULL
    AND sub.trial_ends_at IS NOT NULL
    AND (sub.trial_ends_at::date + s.verschuiving) = p_vandaag
    AND COALESCE(e.email, c.email) IS NOT NULL
    AND COALESCE(e.email, c.email) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.trial_mails tm
      WHERE tm.company_id = c.id AND tm.mail = s.mail
    )
$function$
;

-- @signature bb_trial_mail_verstuurd(p_company_id uuid, p_mail smallint, p_message_id text)
-- @returns   void
CREATE OR REPLACE FUNCTION public.bb_trial_mail_verstuurd(p_company_id uuid, p_mail smallint, p_message_id text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.trial_mails SET message_id = p_message_id
   WHERE company_id = p_company_id AND mail = p_mail
$function$
;

-- @signature bb_usage(p_company_id uuid, p_key text)
-- @returns   integer
CREATE OR REPLACE FUNCTION public.bb_usage(p_company_id uuid, p_key text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE p_key
    WHEN 'gebruikers' THEN (
      (SELECT count(*) FROM public.profiles p
        WHERE p.company_id = p_company_id AND p.actief IS DISTINCT FROM false)
      +
      (SELECT count(*) FROM public.company_members cm
        WHERE cm.company_id = p_company_id AND cm.accepted_at IS NULL AND cm.profile_id IS NULL)
    )
    WHEN 'klanten' THEN (
      SELECT count(*) FROM public.customers c WHERE c.company_id = p_company_id
    )
    WHEN 'offertes' THEN (
      SELECT count(*) FROM public.plan_usage_events e
      WHERE e.company_id = p_company_id AND e.soort = 'offerte'
        AND e.periode_start = public.bb_periode_start(p_company_id)
    )
    WHEN 'facturen' THEN (
      SELECT count(*) FROM public.plan_usage_events e
      WHERE e.company_id = p_company_id AND e.soort = 'factuur'
        AND e.periode_start = public.bb_periode_start(p_company_id)
    )
    ELSE 0
  END::integer
$function$
;

-- @signature bb_usage(p_key text)
-- @returns   integer
CREATE OR REPLACE FUNCTION public.bb_usage(p_key text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_usage(public.bb_current_company(), p_key)
$function$
;

-- @signature bb_welkomstactie_onwijzigbaar()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_welkomstactie_onwijzigbaar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.welkomstactie IS NOT NULL
     AND NEW.welkomstactie IS DISTINCT FROM OLD.welkomstactie THEN
    RAISE EXCEPTION 'De welkomstactie is al gekozen (%) en kan niet meer worden gewijzigd', OLD.welkomstactie
      USING ERRCODE = 'check_violation', HINT = 'welkomstactie_vast';
  END IF;
  IF NEW.welkomstactie IS NOT NULL AND NEW.welkomstactie_gekozen_op IS NULL THEN
    NEW.welkomstactie_gekozen_op := now();
  END IF;
  RETURN NEW;
END;
$function$
;

-- @signature bb_werkbon_nummer()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_werkbon_nummer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_volgend int;
begin
  if new.nummer is not null and new.nummer <> '' then
    return new;
  end if;
  select coalesce(max((substring(nummer from '^WB-(\d+)$'))::int), 0) + 1
    into v_volgend
    from public.werkbonnen
   where company_id = new.company_id
     and nummer ~ '^WB-\d+$';
  new.nummer := 'WB-' || lpad(v_volgend::text, 3, '0');
  return new;
end;
$function$
;

-- @signature bb_werkbon_op_slot()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.bb_werkbon_op_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_werkbon_id    uuid;
  v_ondertekend   timestamptz;
begin
  if tg_op = 'DELETE' then v_werkbon_id := old.werkbon_id;
  else                     v_werkbon_id := new.werkbon_id;
  end if;

  select ondertekend_op into v_ondertekend
    from public.werkbonnen where id = v_werkbon_id;

  if v_ondertekend is not null then
    raise exception
      'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
      to_char(v_ondertekend, 'DD-MM-YYYY')
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$
;

-- @signature bb_within_limit(p_company_id uuid, p_key text)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_within_limit(p_company_id uuid, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_limit(p_company_id, p_key) IS NULL
      OR public.bb_usage(p_company_id, p_key) < public.bb_limit(p_company_id, p_key)
$function$
;

-- @signature bb_within_limit(p_key text)
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.bb_within_limit(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_within_limit(public.bb_current_company(), p_key)
$function$
;

-- @signature bb_zet_standaard_kostencategorieen(p_company uuid)
-- @returns   void
CREATE OR REPLACE FUNCTION public.bb_zet_standaard_kostencategorieen(p_company uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.kosten_categorieen (company_id, naam, standaard, bon_verplicht, volgorde)
  values
    (p_company, 'Materiaal',       true, true,  10),
    (p_company, 'Reiskosten',      true, false, 20),
    (p_company, 'Gereedschap',     true, true,  30),
    (p_company, 'Inkoopfactuur',   true, true,  40),
    (p_company, 'Algemene kosten', true, true,  50),
    (p_company, 'Overig',          true, true,  60)
  on conflict (company_id, naam) do nothing;
$function$
;

-- @signature cancel_company_account()
-- @returns   void
CREATE OR REPLACE FUNCTION public.cancel_company_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_company uuid; v_role text;
begin
  select company_id, role into v_company, v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'admin' then
    raise exception 'Alleen een beheerder kan het bedrijf opzeggen';
  end if;
  if v_company is null then
    raise exception 'Geen bedrijf gekoppeld aan dit account';
  end if;
  update public.companies set status = 'opgezegd', opgezegd_op = coalesce(opgezegd_op, now()) where id = v_company;
  update public.profiles set actief = false, verwijderd_op = coalesce(verwijderd_op, now()) where company_id = v_company;
end;
$function$
;

-- @signature current_company_id()
-- @returns   uuid
CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select company_id
  from profiles
  where id = auth.uid()
$function$
;

-- @signature current_user_company_id()
-- @returns   uuid
CREATE OR REPLACE FUNCTION public.current_user_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$function$
;

-- @signature delete_own_account()
-- @returns   void
CREATE OR REPLACE FUNCTION public.delete_own_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.profiles
     set actief = false, verwijderd_op = coalesce(verwijderd_op, now())
   where id = auth.uid();
end;
$function$
;

-- @signature get_accounting_status()
-- @returns   TABLE(provider text, administration_id text, afas_environment_id text, connected boolean, last_synced_at timestamp with time zone)
CREATE OR REPLACE FUNCTION public.get_accounting_status()
 RETURNS TABLE(provider text, administration_id text, afas_environment_id text, connected boolean, last_synced_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    ac.provider,
    ac.administration_id,
    ac.afas_environment_id,
    case ac.provider
      when 'moneybird' then (ac.api_token is not null and ac.api_token <> '')
      when 'snelstart' then (ac.client_key is not null and ac.client_key <> '')
      when 'afas'      then coalesce(ac.is_connected, false)
      else coalesce(ac.is_connected, (ac.api_token is not null and ac.api_token <> ''))
    end as connected,
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = (select company_id from public.profiles where id = auth.uid());
$function$
;

-- @signature get_auth_user_id_by_email(p_email text)
-- @returns   uuid
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'auth', 'public'
AS $function$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$function$
;

-- @signature get_billing_status()
-- @returns   jsonb
CREATE OR REPLACE FUNCTION public.get_billing_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'tier', public.bb_effective_tier(c.id), 'status', s.status,
    'stripeStatus', s.stripe_status, 'heeftStripe', (s.stripe_subscription_id IS NOT NULL),
    'billingInterval', s.billing_interval, 'extraGebruikers', s.extra_gebruikers,
    'trial', public.bb_is_trial(c.id), 'trialEindigtOp', s.trial_ends_at,
    'periodeStart', s.current_period_start, 'verlengtOp', s.current_period_end,
    'opzeggenPerEindePeriode', s.cancel_at_period_end,
    'stoptOp', s.stopt_op,
    'readonly', public.bb_is_readonly(c.id),
    'readonlyReden', public.bb_readonly_reden(c.id),
    'magBeheren', public.bb_mag_abonnement_beheren(),
    'welkomstactie', s.welkomstactie, 'welkomstactieGekozenOp', s.welkomstactie_gekozen_op,
    'heeftVerplichting', (s.verplichting_tot IS NOT NULL AND s.verplichting_tot > now()),
    'verplichtingTot', s.verplichting_tot, 'stoptNaLooptijd', s.stopt_na_looptijd,
    'magDirectOpzeggen', public.bb_mag_direct_opzeggen(c.id),
    'opzegbaarPer', public.bb_opzegbaar_per(c.id),
    'websiteAanvraag', (SELECT jsonb_build_object('status', w.status, 'aangevraagdOp', w.aangevraagd_op)
                        FROM public.website_aanvragen w WHERE w.company_id = c.id),
    'modules', COALESCE((SELECT jsonb_agg(cm.module_key) FROM public.company_modules cm
                         WHERE cm.company_id = c.id AND cm.actief), '[]'::jsonb),
    'limieten', COALESCE((SELECT jsonb_object_agg(pl.limit_key, jsonb_build_object(
                            'max', public.bb_limit(c.id, pl.limit_key),
                            'gebruikt', public.bb_usage(c.id, pl.limit_key)))
                          FROM public.plan_limits pl
                          WHERE pl.plan = public.bb_effective_tier(c.id)), '{}'::jsonb)
  )
  FROM public.companies c JOIN public.subscriptions s ON s.company_id = c.id
  WHERE c.id = public.bb_current_company()
$function$
;

-- @signature get_company_by_sign_token(p_token uuid)
-- @returns   TABLE(name text, logo_url text, email text, phone text, address text, postal_code text, city text, kvk text, btw_number text, branding_color text)
CREATE OR REPLACE FUNCTION public.get_company_by_sign_token(p_token uuid)
 RETURNS TABLE(name text, logo_url text, email text, phone text, address text, postal_code text, city text, kvk text, btw_number text, branding_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT c.name, c.logo_url, c.email, c.phone, c.address,
           c.postal_code, c.city, c.kvk, c.btw_number, c.branding_color
    FROM companies c
    JOIN offertes o ON o.company_id = c.id
    WHERE o.sign_token = p_token;
END;
$function$
;

-- @signature get_company_by_werkbon_token(p_token uuid)
-- @returns   TABLE(name text, logo_url text, email text, phone text, address text, postal_code text, city text, kvk text, btw_number text, branding_color text)
CREATE OR REPLACE FUNCTION public.get_company_by_werkbon_token(p_token uuid)
 RETURNS TABLE(name text, logo_url text, email text, phone text, address text, postal_code text, city text, kvk text, btw_number text, branding_color text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.name, c.logo_url, c.email, c.phone, c.address,
         c.postal_code, c.city, c.kvk, c.btw_number, c.branding_color
  from public.companies c
  join public.werkbonnen w on w.company_id = c.id
  where w.sign_token = p_token;
$function$
;

-- @signature get_company_tier()
-- @returns   text
CREATE OR REPLACE FUNCTION public.get_company_tier()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.bb_effective_tier(public.bb_current_company())
$function$
;

-- @signature get_customer_by_sign_token(p_token uuid)
-- @returns   TABLE(name text, email text, address text, postcode text, city text)
CREATE OR REPLACE FUNCTION public.get_customer_by_sign_token(p_token uuid)
 RETURNS TABLE(name text, email text, address text, postcode text, city text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT cu.name, cu.email, cu.address, cu.postcode, cu.city
    FROM customers cu
    JOIN offertes o ON o.customer_id = cu.id
    WHERE o.sign_token = p_token;
END;
$function$
;

-- @signature get_customer_by_werkbon_token(p_token uuid)
-- @returns   TABLE(name text, email text, phone text, address text, postcode text, city text)
CREATE OR REPLACE FUNCTION public.get_customer_by_werkbon_token(p_token uuid)
 RETURNS TABLE(name text, email text, phone text, address text, postcode text, city text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cu.name, cu.email, cu.phone, cu.address, cu.postcode, cu.city
  from public.customers cu
  join public.werkbonnen w on w.customer_id = cu.id
  where w.sign_token = p_token;
$function$
;

-- @signature get_invite_company_for_current_user()
-- @returns   uuid
CREATE OR REPLACE FUNCTION public.get_invite_company_for_current_user()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email      text;
  v_company_id uuid;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN NULL; END IF;

  SELECT cm.company_id INTO v_company_id
    FROM company_members cm
   WHERE cm.email      = v_email
     AND cm.company_id IS NOT NULL
   ORDER BY cm.invited_at DESC
   LIMIT 1;

  RETURN v_company_id;
END;
$function$
;

-- @signature get_moneybird_sync_targets()
-- @returns   TABLE(company_id uuid, api_token text, administration_id text)
CREATE OR REPLACE FUNCTION public.get_moneybird_sync_targets()
 RETURNS TABLE(company_id uuid, api_token text, administration_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ac.company_id, ac.api_token, ac.administration_id
  from accounting_connections ac
  where ac.provider = 'moneybird'
    and ac.is_connected = true
    and ac.api_token is not null
    and ac.administration_id is not null
$function$
;

-- @signature get_offerte_by_sign_token(p_token uuid)
-- @returns   TABLE(id uuid, nummer text, omschrijving text, status text, totaal_excl numeric, totaal_incl numeric, geldig_tot date, customer_id uuid, company_id uuid, signed_at timestamp with time zone, sign_token uuid, marge_pct numeric, btw_pct numeric, created_at timestamp with time zone, sent_to_email text, vervangen_op timestamp with time zone, vervangen_door_nummer text)
CREATE OR REPLACE FUNCTION public.get_offerte_by_sign_token(p_token uuid)
 RETURNS TABLE(id uuid, nummer text, omschrijving text, status text, totaal_excl numeric, totaal_incl numeric, geldig_tot date, customer_id uuid, company_id uuid, signed_at timestamp with time zone, sign_token uuid, marge_pct numeric, btw_pct numeric, created_at timestamp with time zone, sent_to_email text, vervangen_op timestamp with time zone, vervangen_door_nummer text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT o.id, o.nummer, o.omschrijving, o.status,
           o.totaal_excl, o.totaal_incl, o.geldig_tot,
           o.customer_id, o.company_id, o.signed_at, o.sign_token,
           o.marge_pct, o.btw_pct, o.created_at, o.sent_to_email,
           o.vervangen_op, o.vervangen_door_nummer
    FROM offertes o
    WHERE o.sign_token = p_token;
END;
$function$
;

-- @signature get_offerte_items_by_token(p_token uuid)
-- @returns   TABLE(id uuid, omschrijving text, eenheid text, aantal numeric, prijs_per numeric, subtotaal numeric, volgorde integer)
CREATE OR REPLACE FUNCTION public.get_offerte_items_by_token(p_token uuid)
 RETURNS TABLE(id uuid, omschrijving text, eenheid text, aantal numeric, prijs_per numeric, subtotaal numeric, volgorde integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT oi.id, oi.omschrijving, oi.eenheid, oi.aantal,
           oi.prijs_per, oi.subtotaal, oi.volgorde
    FROM offerte_items oi
    JOIN offertes o ON o.id = oi.offerte_id
    WHERE o.sign_token = p_token
    ORDER BY oi.volgorde;
END;
$function$
;

-- @signature get_payment_branding(p_token text)
-- @returns   jsonb
CREATE OR REPLACE FUNCTION public.get_payment_branding(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'company_name', c.name,
    'logo_url', c.logo_url,
    'branding_color', c.branding_color
  )
  from public.facturen f
  join public.companies c on c.id = f.company_id
  where f.stripe_payment_token = p_token;
$function$
;

-- @signature get_plan_status()
-- @returns   jsonb
CREATE OR REPLACE FUNCTION public.get_plan_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'tier',          public.bb_effective_tier(c.id),
    'plan',          COALESCE((SELECT s.plan   FROM public.subscriptions s WHERE s.company_id = c.id), 'trial'),
    'status',        COALESCE((SELECT s.status FROM public.subscriptions s WHERE s.company_id = c.id), 'trial'),
    'trial',         public.bb_is_trial(c.id),
    'trialEndsAt',   (SELECT s.trial_ends_at FROM public.subscriptions s WHERE s.company_id = c.id),
    'periodeStart',  public.bb_periode_start(c.id),
    'periodeEind',   (public.bb_periode_start(c.id) + interval '1 month' - interval '1 day')::date,
    'readonly',      public.bb_is_readonly(c.id),
    'readonlyReden', public.bb_readonly_reden(c.id),
    'magBeheren',    public.bb_mag_abonnement_beheren(),
    'modules',       COALESCE((SELECT jsonb_agg(cm.module_key)
                               FROM public.company_modules cm
                               WHERE cm.company_id = c.id AND cm.actief), '[]'::jsonb),
    'features',      COALESCE((SELECT jsonb_agg(pfd.feature)
                               FROM public.plan_feature_defs pfd
                               WHERE public.bb_has_feature(c.id, pfd.feature)), '[]'::jsonb),
    'limits',        COALESCE((SELECT jsonb_object_agg(pl.limit_key, jsonb_build_object(
                                 'max',      public.bb_limit(c.id, pl.limit_key),
                                 'gebruikt', public.bb_usage(c.id, pl.limit_key),
                                 'telwijze', pl.telwijze
                               ))
                               FROM public.plan_limits pl
                               WHERE pl.plan = public.bb_effective_tier(c.id)), '{}'::jsonb)
  )
  FROM public.companies c
  WHERE c.id = public.bb_current_company()
$function$
;

-- @signature get_snelstart_sync_targets()
-- @returns   TABLE(company_id uuid, client_key text)
CREATE OR REPLACE FUNCTION public.get_snelstart_sync_targets()
 RETURNS TABLE(company_id uuid, client_key text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ac.company_id, ac.client_key
  from public.accounting_connections ac
  where ac.provider = 'snelstart'
    and ac.client_key is not null
    and ac.client_key <> ''
$function$
;

-- @signature get_website_aanvragen()
-- @returns   TABLE(id uuid, company_id uuid, bedrijf text, email text, telefoon text, status text, aangevraagd_op timestamp with time zone, mail_verstuurd_op timestamp with time zone, opgeleverd_op timestamp with time zone, notitie text, plan text, hosting_actief boolean)
CREATE OR REPLACE FUNCTION public.get_website_aanvragen()
 RETURNS TABLE(id uuid, company_id uuid, bedrijf text, email text, telefoon text, status text, aangevraagd_op timestamp with time zone, mail_verstuurd_op timestamp with time zone, opgeleverd_op timestamp with time zone, notitie text, plan text, hosting_actief boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.id, w.company_id, c.name, c.email, c.phone,
         w.status, w.aangevraagd_op, w.mail_verstuurd_op, w.opgeleverd_op, w.notitie,
         s.plan,
         EXISTS (SELECT 1 FROM public.company_modules m
                 WHERE m.company_id = c.id AND m.module_key = 'hosting' AND m.actief)
  FROM public.website_aanvragen w
  JOIN public.companies c     ON c.id = w.company_id
  LEFT JOIN public.subscriptions s ON s.company_id = c.id
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  ORDER BY (w.status = 'open') DESC, w.aangevraagd_op DESC
$function$
;

-- @signature get_werkbon_by_sign_token(p_token uuid)
-- @returns   TABLE(id uuid, company_id uuid, customer_id uuid, nummer text, titel text, omschrijving text, locatie text, gepland_op date, gestart_op timestamp with time zone, afgerond_op timestamp with time zone, status text, ondertekend_op timestamp with time zone, ondertekend_door_naam text, ondertekend_door_email text, handtekening_url text, verstuurd_naar_email text)
CREATE OR REPLACE FUNCTION public.get_werkbon_by_sign_token(p_token uuid)
 RETURNS TABLE(id uuid, company_id uuid, customer_id uuid, nummer text, titel text, omschrijving text, locatie text, gepland_op date, gestart_op timestamp with time zone, afgerond_op timestamp with time zone, status text, ondertekend_op timestamp with time zone, ondertekend_door_naam text, ondertekend_door_email text, handtekening_url text, verstuurd_naar_email text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select w.id, w.company_id, w.customer_id, w.nummer, w.titel,
         w.omschrijving, w.locatie, w.gepland_op, w.gestart_op,
         w.afgerond_op, w.status, w.ondertekend_op,
         w.ondertekend_door_naam, w.ondertekend_door_email,
         w.handtekening_url, w.verstuurd_naar_email
  from public.werkbonnen w
  where w.sign_token = p_token;
$function$
;

-- @signature get_werkbon_fotos_by_sign_token(p_token uuid)
-- @returns   TABLE(pad text, categorie text)
CREATE OR REPLACE FUNCTION public.get_werkbon_fotos_by_sign_token(p_token uuid)
 RETURNS TABLE(pad text, categorie text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.url, f.categorie
  from public.werkbon_fotos f
  join public.werkbonnen w on w.id = f.werkbon_id
  where w.sign_token = p_token
  order by f.created_at;
$function$
;

-- @signature get_werkbon_materialen_by_sign_token(p_token uuid)
-- @returns   TABLE(naam text, eenheid text, aantal numeric)
CREATE OR REPLACE FUNCTION public.get_werkbon_materialen_by_sign_token(p_token uuid)
 RETURNS TABLE(naam text, eenheid text, aantal numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.naam, m.eenheid, m.aantal
  from public.werkbon_materialen m
  join public.werkbonnen w on w.id = m.werkbon_id
  where w.sign_token = p_token
  order by m.created_at;
$function$
;

-- @signature get_werkbon_notities_by_sign_token(p_token uuid)
-- @returns   TABLE(note text, created_at timestamp with time zone)
CREATE OR REPLACE FUNCTION public.get_werkbon_notities_by_sign_token(p_token uuid)
 RETURNS TABLE(note text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select n.note, n.created_at
  from public.werkbon_notities n
  join public.werkbonnen w on w.id = n.werkbon_id
  where w.sign_token = p_token
    and n.voor_klant = true
  order by n.created_at;
$function$
;

-- @signature get_werkbon_taken_by_sign_token(p_token uuid)
-- @returns   TABLE(omschrijving text, afgerond boolean, volgorde integer, is_meerwerk boolean)
CREATE OR REPLACE FUNCTION public.get_werkbon_taken_by_sign_token(p_token uuid)
 RETURNS TABLE(omschrijving text, afgerond boolean, volgorde integer, is_meerwerk boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.omschrijving, t.afgerond, t.volgorde, t.is_meerwerk
  from public.werkbon_taken t
  join public.werkbonnen w on w.id = t.werkbon_id
  where w.sign_token = p_token
    and t.afgerond = true
  order by t.is_meerwerk, t.volgorde, t.created_at;
$function$
;

-- @signature get_werkbon_uitvoerders_by_sign_token(p_token uuid)
-- @returns   TABLE(naam text, verantwoordelijk boolean)
CREATE OR REPLACE FUNCTION public.get_werkbon_uitvoerders_by_sign_token(p_token uuid)
 RETURNS TABLE(naam text, verantwoordelijk boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.full_name, (p.id = any(w.verantwoordelijke_ids))
  from public.werkbonnen w
  join public.profiles p
    on p.id = any(w.assigned_to_ids) or p.id = any(w.verantwoordelijke_ids)
  where w.sign_token = p_token
    and coalesce(p.full_name, '') <> ''
  order by (p.id = any(w.verantwoordelijke_ids)) desc, p.full_name;
$function$
;

-- @signature get_werkbon_uren_by_sign_token(p_token uuid)
-- @returns   TABLE(datum date, start_tijd time without time zone, eind_tijd time without time zone, pauze_minuten integer, uren numeric, notitie text)
CREATE OR REPLACE FUNCTION public.get_werkbon_uren_by_sign_token(p_token uuid)
 RETURNS TABLE(datum date, start_tijd time without time zone, eind_tijd time without time zone, pauze_minuten integer, uren numeric, notitie text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.datum, u.start_tijd, u.eind_tijd, u.pauze_minuten, u.uren, u.notitie
  from public.werkbon_uren u
  join public.werkbonnen w on w.id = u.werkbon_id
  where w.sign_token = p_token
  order by u.datum, u.start_tijd nulls last;
$function$
;

-- @signature google_calendar_disconnect()
-- @returns   boolean
CREATE OR REPLACE FUNCTION public.google_calendar_disconnect()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM google_calendar_connections WHERE user_id = auth.uid();
  RETURN true;
END;
$function$
;

-- @signature google_calendar_status()
-- @returns   TABLE(connected boolean, google_email text, google_calendar_id text)
CREATE OR REPLACE FUNCTION public.google_calendar_status()
 RETURNS TABLE(connected boolean, google_email text, google_calendar_id text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(c.is_connected, false) AS connected,
    c.google_email,
    c.google_calendar_id
  FROM google_calendar_connections c
  WHERE c.user_id = auth.uid()
  LIMIT 1;
$function$
;

-- @signature handle_new_user()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company_id uuid;
  v_role       text;
BEGIN
  SELECT cm.company_id, cm.role
    INTO v_company_id, v_role
    FROM company_members cm
   WHERE cm.email             = NEW.email
     AND cm.invite_token      IS NOT NULL
     AND cm.invite_expires_at > now()
   LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    INSERT INTO profiles (id, full_name, company_id, role)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      v_company_id,
      COALESCE(v_role, 'medewerker')
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      role       = EXCLUDED.role;
  ELSE
    INSERT INTO profiles (id, full_name, role)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      'admin'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

-- @signature leveranciers_touch_updated_at()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.leveranciers_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- @signature mark_factuur_betaald(p_factuur_id uuid, p_betaald_op date, p_stripe_status text, p_stripe_intent text, p_expected_company_id uuid, p_expected_amount_cents bigint)
-- @returns   jsonb
CREATE OR REPLACE FUNCTION public.mark_factuur_betaald(p_factuur_id uuid, p_betaald_op date DEFAULT NULL::date, p_stripe_status text DEFAULT NULL::text, p_stripe_intent text DEFAULT NULL::text, p_expected_company_id uuid DEFAULT NULL::uuid, p_expected_amount_cents bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v facturen;
  v_company_id   uuid;
  v_total_cents  bigint;
begin
  -- Ownership (user-pad): een ingelogde user mag alleen facturen van zijn eigen
  -- bedrijf op betaald zetten. Een service-role aanroep (auth.uid() IS NULL, bv.
  -- de webhook) mag dat, maar levert dan wél de verwachtingen aan (zie onder).
  if auth.uid() is not null then
    if not exists (
      select 1 from facturen f join profiles p on p.company_id = f.company_id
      where f.id = p_factuur_id and p.id = auth.uid()
    ) then
      raise exception 'geen toegang tot deze factuur';
    end if;
  end if;

  -- Huidige bedrijf + factuurtotaal (in centen) ophalen voor de verificatie.
  select company_id, round(totaal_incl * 100)::bigint
    into v_company_id, v_total_cents
    from public.facturen
   where id = p_factuur_id;

  if not found then
    return jsonb_build_object('changed', false);
  end if;

  -- Defense-in-depth: als de aanroeper verwachtingen meegeeft, MOETEN ze kloppen
  -- met de factuur. Mismatch = betaling hoort niet bij deze factuur/dit bedrag →
  -- harde stop, géén status-wijziging.
  if p_expected_company_id is not null
     and p_expected_company_id is distinct from v_company_id then
    raise exception 'company mismatch voor factuur % (verwacht %, factuur %)',
      p_factuur_id, p_expected_company_id, v_company_id;
  end if;

  if p_expected_amount_cents is not null
     and p_expected_amount_cents is distinct from v_total_cents then
    raise exception 'bedrag mismatch voor factuur % (betaald %, factuur %)',
      p_factuur_id, p_expected_amount_cents, v_total_cents;
  end if;

  -- Idempotente status-transitie: alleen op betaald zetten als dat nog niet zo is.
  update public.facturen
     set status = 'betaald',
         betaald_op = coalesce(p_betaald_op, betaald_op, current_date),
         stripe_payment_status = coalesce(p_stripe_status, stripe_payment_status),
         stripe_payment_intent_id = coalesce(p_stripe_intent, stripe_payment_intent_id),
         updated_at = now()
   where id = p_factuur_id
     and status is distinct from 'betaald'
  returning * into v;

  if not found then
    return jsonb_build_object('changed', false);
  end if;

  return jsonb_build_object(
    'changed', true,
    'customer_id', v.customer_id,
    'company_id', v.company_id,
    'nummer', v.nummer,
    'totaal_incl', v.totaal_incl
  );
end;
$function$
;

-- @signature materiaal_inkoop_aanmaken()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.materiaal_inkoop_aanmaken()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into materiaal_inkoop (materiaal_id, company_id)
  values (new.id, new.company_id)
  on conflict (materiaal_id) do nothing;
  return new;
end;
$function$
;

-- @signature materialen_touch_updated_at()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.materialen_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;

-- @signature protect_profile_privileges()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF (NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin)
       OR (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
      NEW.is_super_admin := OLD.is_super_admin;
      NEW.role          := OLD.role;
      NEW.company_id    := OLD.company_id;
    END IF;
  END IF;
  RETURN NEW;
END;$function$
;

-- @signature provision_account(p_company_name text, p_full_name text, p_email text, p_phone text, p_kvk text)
-- @returns   json
CREATE OR REPLACE FUNCTION public.provision_account(p_company_name text, p_full_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_kvk text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_company_id UUID;
  v_existing   UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT company_id INTO v_existing FROM profiles WHERE id = v_user_id;
  IF v_existing IS NOT NULL THEN
    IF p_full_name IS NOT NULL THEN
      UPDATE profiles SET full_name = p_full_name WHERE id = v_user_id;
    END IF;
    -- Ook een bestaand bedrijf mag nooit zonder abonnement zitten (bv. een
    -- account van vóór deze fix dat opnieuw door de registratieflow komt).
    INSERT INTO subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
    VALUES (v_existing, 'groei', 'trial', 0, now(), now() + interval '14 days')
    ON CONFLICT (company_id) DO NOTHING;
    RETURN json_build_object('company_id', v_existing, 'status', 'existing');
  END IF;
  INSERT INTO companies (name, email, phone, kvk)
  VALUES (p_company_name, NULLIF(p_email, ''), NULLIF(p_phone, ''), NULLIF(p_kvk, ''))
  RETURNING id INTO v_company_id;
  INSERT INTO profiles (id, company_id, full_name, role)
  VALUES (v_user_id, v_company_id, COALESCE(NULLIF(p_full_name, ''), split_part(p_email, '@', 1), 'Gebruiker'), 'admin')
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    full_name  = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    role       = 'admin';

  -- Abonnement: 14 dagen proefperiode. De trigger op companies heeft dit bij de
  -- INSERT hierboven normaal gesproken al gedaan; ON CONFLICT maakt dat
  -- onschadelijk. Zonder trigger doet deze regel het werk. Eén van de twee wint,
  -- nooit allebei — UNIQUE (company_id) garandeert dat.
  INSERT INTO subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
  VALUES (v_company_id, 'groei', 'trial', 0, now(), now() + interval '14 days')
  ON CONFLICT (company_id) DO NOTHING;

  -- Pipeline-fasen: geseed door de AFTER INSERT-trigger op companies.
  PERFORM public.seed_default_email_templates(v_company_id);
  RETURN json_build_object('company_id', v_company_id, 'status', 'created');
END;
$function$
;

-- @signature save_accounting_connection(p_provider text, p_secret text, p_administration_id text, p_afas_environment_id text)
-- @returns   TABLE(provider text, administration_id text, afas_environment_id text, connected boolean, last_synced_at timestamp with time zone)
CREATE OR REPLACE FUNCTION public.save_accounting_connection(p_provider text, p_secret text DEFAULT NULL::text, p_administration_id text DEFAULT NULL::text, p_afas_environment_id text DEFAULT NULL::text)
 RETURNS TABLE(provider text, administration_id text, afas_environment_id text, connected boolean, last_synced_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_company uuid;
  v_role    text;
  v_secret  text := nullif(btrim(coalesce(p_secret, '')), '');
begin
  select p.company_id, p.role into v_company, v_role
  from public.profiles p where p.id = auth.uid();

  if v_company is null then
    raise exception 'Geen bedrijf gevonden';
  end if;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen admins kunnen koppelingen beheren';
  end if;
  if p_provider not in ('moneybird', 'snelstart', 'afas') then
    raise exception 'Onbekende provider: %', p_provider;
  end if;

  insert into public.accounting_connections as ac
    (company_id, provider, api_token, client_key, afas_token,
     administration_id, afas_environment_id, is_connected, updated_at)
  values (
    v_company, p_provider,
    case when p_provider = 'moneybird' then v_secret end,
    case when p_provider = 'snelstart' then v_secret end,
    case when p_provider = 'afas'      then v_secret end,
    p_administration_id, p_afas_environment_id,
    false, now()
  )
  on conflict (company_id, provider) do update set
    -- coalesce, niet case-else: geen secret meegegeven = niets wijzigen.
    api_token           = case when p_provider = 'moneybird' then coalesce(v_secret, ac.api_token)  else ac.api_token  end,
    client_key          = case when p_provider = 'snelstart' then coalesce(v_secret, ac.client_key) else ac.client_key end,
    afas_token          = case when p_provider = 'afas'      then coalesce(v_secret, ac.afas_token) else ac.afas_token end,
    administration_id   = coalesce(p_administration_id, ac.administration_id),
    afas_environment_id = coalesce(p_afas_environment_id, ac.afas_environment_id),
    -- AFAS is pas verbonden na een geslaagde test. Alleen terugzetten op false
    -- als er écht een nieuw token is opgeslagen; anders zou het bijwerken van
    -- alleen het environment-id de koppeling onterecht verbreken.
    is_connected        = case when p_provider = 'afas' and v_secret is not null then false else ac.is_connected end,
    updated_at          = now();

  return query
  select
    ac.provider,
    ac.administration_id,
    ac.afas_environment_id,
    case ac.provider
      when 'moneybird' then (ac.api_token is not null and ac.api_token <> '')
      when 'snelstart' then (ac.client_key is not null and ac.client_key <> '')
      when 'afas'      then coalesce(ac.is_connected, false)
      else coalesce(ac.is_connected, false)
    end as connected,
    ac.last_synced_at
  from public.accounting_connections ac
  where ac.company_id = v_company and ac.provider = p_provider;
end;
$function$
;

-- @signature seed_default_email_templates(p_company_id uuid)
-- @returns   void
CREATE OR REPLACE FUNCTION public.seed_default_email_templates(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
  VALUES
    (p_company_id, 'offerte', 'Offerte versturen',
      'Uw offerte van {{bedrijfsnaam}}',
      E'Beste {{klant_naam}},\n\nHierbij sturen wij u offerte {{offerte_nummer}} toe.\n\nTotaalbedrag: {{totaal_bedrag}}\nGeldig tot: {{vervaldatum}}\n\nVia onderstaande link kunt u de offerte bekijken en digitaal ondertekenen:\n{{link}}\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, false, 7),
    (p_company_id, 'offerte_geaccepteerd', 'Offerte geaccepteerd',
      'Bevestiging: uw offerte is geaccepteerd',
      E'Beste {{klant_naam}},\n\nHartelijk dank! Uw offerte {{offerte_nummer}} is succesvol ondertekend.\n\nWij gaan zo snel mogelijk voor u aan de slag. U ontvangt binnenkort meer informatie over de planning.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 0),
    (p_company_id, 'factuur', 'Factuur versturen',
      'Factuur {{factuur_nummer}} van {{bedrijfsnaam}}',
      E'Beste {{klant_naam}},\n\nHierbij ontvangt u factuur {{factuur_nummer}} van {{bedrijfsnaam}}.\n\nTotaalbedrag: {{totaal_bedrag}}\nBetaaltermijn: {{vervaldatum}}\n\nGelieve het totaalbedrag voor de betaaltermijn over te maken onder vermelding van {{factuur_nummer}}.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, false, 7),
    (p_company_id, 'herinnering_1', 'Betaalherinnering 1 (vriendelijk)',
      'Vriendelijke herinnering: factuur {{factuur_nummer}}',
      E'Beste {{klant_naam}},\n\nWij willen u vriendelijk herinneren dat factuur {{factuur_nummer}} nog openstaat.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nMocht u dit bedrag reeds hebben overgemaakt, dan kunt u deze herinnering als niet verzonden beschouwen.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 7),
    (p_company_id, 'herinnering_2', 'Betaalherinnering 2 (urgent)',
      'Tweede herinnering: factuur {{factuur_nummer}} nog openstaand',
      E'Beste {{klant_naam}},\n\nDit is een tweede herinnering voor factuur {{factuur_nummer}}, welke reeds is vervallen.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nWij verzoeken u dringend dit bedrag zo spoedig mogelijk te voldoen. Bij uitblijven van betaling zien wij ons genoodzaakt verdere stappen te ondernemen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 14),
    (p_company_id, 'aanvraag_ontvangen', 'Aanvraag ontvangen',
      'Bedankt voor uw aanvraag, {{klant_naam}}',
      E'Beste {{klant_naam}},\n\nBedankt voor uw aanvraag! Wij hebben uw bericht ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 0),
    (p_company_id, 'welkom', 'Welkom nieuwe klant',
      'Welkom bij {{bedrijfsnaam}}',
      E'Beste {{klant_naam}},\n\nWelkom bij {{bedrijfsnaam}}! Wij zijn blij u als nieuwe klant te mogen verwelkomen.\n\nHeeft u vragen of opmerkingen? U kunt altijd contact met ons opnemen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, false, 0),
    (p_company_id, 'afspraak_bevestiging', 'Afspraakbevestiging',
      'Bevestiging afspraak op {{afspraak_datum}}',
      E'Beste {{klant_naam}},\n\nHierbij bevestigen wij uw afspraak.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nMocht u de afspraak willen verzetten, neem dan tijdig contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 0),
    (p_company_id, 'afspraak_herinnering', 'Afspraakherinnering',
      'Herinnering: u heeft morgen een afspraak',
      E'Beste {{klant_naam}},\n\nDit is een herinnering voor uw afspraak van morgen.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 1)
  ON CONFLICT (company_id, type) DO NOTHING;
END;
$function$
;

-- @signature seed_default_lost_reasons(p_company uuid)
-- @returns   void
CREATE OR REPLACE FUNCTION public.seed_default_lost_reasons(p_company uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO public.lost_reasons (company_id, label, position)
  SELECT p_company, s.label, s.position
  FROM (VALUES
    ('Te duur',                 0),
    ('Gekozen voor concurrent', 1),
    ('Geen reactie',            2),
    ('Timing niet goed',        3),
    ('Anders',                  4)
  ) AS s(label, position)
  WHERE p_company IS NOT NULL
  ON CONFLICT (company_id, label) DO NOTHING;
$function$
;

-- @signature seed_default_pipeline_stages(p_company uuid)
-- @returns   void
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages(p_company uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO pipeline_stages (company_id, name, position, color_class)
  SELECT p_company, s.name, s.position, s.color_class
  FROM (VALUES
    ('Nieuwe aanvragen',   1,  'b-new'),
    ('Contact nodig',      2,  'b-orange'),
    ('Info compleet',      3,  'b-blue'),
    ('Offerte maken',      4,  'b-blue'),
    ('Offerte verstuurd',  5,  'b-orange'),
    ('Wacht op akkoord',   6,  'b-orange'),
    ('Akkoord',            7,  'b-green'),
    ('Gepland',            8,  'b-planned'),
    ('In uitvoering',      9,  'b-progress'),
    ('Afgerond',          10,  'b-done'),
    ('Betaald / Gesloten',11,  'b-accepted'),
    ('Verloren',          12,  'b-lost')
  ) AS s(name, position, color_class)
  WHERE p_company IS NOT NULL
  ON CONFLICT (company_id, position) DO NOTHING;
$function$
;

-- @signature set_updated_at()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

-- @signature sync_deal_stage_to_afgerond()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.sync_deal_stage_to_afgerond()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_stage   uuid;
BEGIN
  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'afgerond' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'afgerond' THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO v_company FROM deals WHERE id = NEW.deal_id;
  IF v_company IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_stage FROM pipeline_stages
   WHERE company_id = v_company AND lower(name) = 'afgerond'
   ORDER BY position LIMIT 1;
  IF v_stage IS NULL THEN
    SELECT id INTO v_stage FROM pipeline_stages
     WHERE company_id = v_company AND lower(name) = 'betaald / gesloten'
     ORDER BY position LIMIT 1;
  END IF;
  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE deals SET stage_id = v_stage
   WHERE id = NEW.deal_id AND stage_id IS DISTINCT FROM v_stage;

  RETURN NEW;
END;
$function$
;

-- @signature trg_seed_lost_reasons()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.trg_seed_lost_reasons()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.seed_default_lost_reasons(NEW.id);
  RETURN NEW;
END;
$function$
;

-- @signature trg_seed_pipeline_stages()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.trg_seed_pipeline_stages()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.seed_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$function$
;

-- @signature wm_inkoop_aanmaken()
-- @returns   trigger
CREATE OR REPLACE FUNCTION public.wm_inkoop_aanmaken()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into werkbon_materiaal_inkoop (werkbon_materiaal_id, company_id)
  values (new.id, new.company_id)
  on conflict (werkbon_materiaal_id) do nothing;
  return new;
end;
$function$
;



-- ============================================================================
-- G. VIEWS EN MATERIALIZED VIEWS  (0)
-- ----------------------------------------------------------------------------
-- Het schema bevat er geen. De sectie staat er zodat een latere toevoeging opvalt.
-- ============================================================================

-- (geen objecten van dit soort in het live schema)


-- ============================================================================
-- H. FOREIGN KEYS  (130)
-- ----------------------------------------------------------------------------
-- Apart van de overige constraints, zodat alle tabellen eerst bestaan.
-- ============================================================================

ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.accounting_sync_runs ADD CONSTRAINT accounting_sync_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.activiteit_notities ADD CONSTRAINT activiteit_notities_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;

ALTER TABLE public.activiteit_notities ADD CONSTRAINT activiteit_notities_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.activiteit_notities ADD CONSTRAINT activiteit_notities_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.activities ADD CONSTRAINT activities_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.activities ADD CONSTRAINT activities_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.activities ADD CONSTRAINT activities_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public.activities ADD CONSTRAINT activities_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;

ALTER TABLE public.bedrijfsinstellingen ADD CONSTRAINT bedrijfsinstellingen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.boss_conversations ADD CONSTRAINT boss_conversations_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.boss_conversations ADD CONSTRAINT boss_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.boss_doorzet_limiet ADD CONSTRAINT boss_doorzet_limiet_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.boss_rate_limit ADD CONSTRAINT boss_rate_limit_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.btw_periodes ADD CONSTRAINT btw_periodes_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_activiteit_id_fkey FOREIGN KEY (activiteit_id) REFERENCES activities(id) ON DELETE CASCADE;

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id);

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_werkbon_id_fkey FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE CASCADE;

ALTER TABLE public.company_members ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.company_members ADD CONSTRAINT company_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.company_modules ADD CONSTRAINT company_modules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.customers ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.deals ADD CONSTRAINT deals_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.deals ADD CONSTRAINT deals_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.deals ADD CONSTRAINT deals_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public.deals ADD CONSTRAINT deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id);

ALTER TABLE public.deals ADD CONSTRAINT fk_deals_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.deals ADD CONSTRAINT fk_deals_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public.deals ADD CONSTRAINT fk_deals_stage FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;

ALTER TABLE public.eigen_eenheden ADD CONSTRAINT eigen_eenheden_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.facturen ADD CONSTRAINT facturen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.facturen ADD CONSTRAINT facturen_credit_van_factuur_id_fkey FOREIGN KEY (credit_van_factuur_id) REFERENCES facturen(id);

ALTER TABLE public.facturen ADD CONSTRAINT facturen_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public.facturen ADD CONSTRAINT facturen_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE public.factuur_regels ADD CONSTRAINT factuur_regels_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.factuur_regels ADD CONSTRAINT factuur_regels_factuur_id_fkey FOREIGN KEY (factuur_id) REFERENCES facturen(id) ON DELETE CASCADE;

ALTER TABLE public.google_calendar_connections ADD CONSTRAINT google_calendar_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.google_calendar_connections ADD CONSTRAINT google_calendar_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.grootboek_voorkeuren ADD CONSTRAINT grootboek_voorkeuren_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.import_genegeerd ADD CONSTRAINT import_genegeerd_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_leverancier_id_fkey FOREIGN KEY (leverancier_id) REFERENCES leveranciers(id) ON DELETE RESTRICT;

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_werkbon_id_fkey FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE SET NULL;

ALTER TABLE public.job_costs ADD CONSTRAINT job_costs_werkbon_materiaal_id_fkey FOREIGN KEY (werkbon_materiaal_id) REFERENCES werkbon_materialen(id) ON DELETE CASCADE;

ALTER TABLE public.klant_tijdlijn ADD CONSTRAINT klant_tijdlijn_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.klant_tijdlijn ADD CONSTRAINT klant_tijdlijn_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.klant_tijdlijn ADD CONSTRAINT klant_tijdlijn_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public.kosten_categorieen ADD CONSTRAINT kosten_categorieen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.leverancier_tijdlijn ADD CONSTRAINT leverancier_tijdlijn_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.leverancier_tijdlijn ADD CONSTRAINT leverancier_tijdlijn_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.leverancier_tijdlijn ADD CONSTRAINT leverancier_tijdlijn_leverancier_id_fkey FOREIGN KEY (leverancier_id) REFERENCES leveranciers(id) ON DELETE CASCADE;

ALTER TABLE public.leveranciers ADD CONSTRAINT leveranciers_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.lost_reasons ADD CONSTRAINT lost_reasons_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.materiaal_inkoop ADD CONSTRAINT materiaal_inkoop_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.materiaal_inkoop ADD CONSTRAINT materiaal_inkoop_materiaal_id_fkey FOREIGN KEY (materiaal_id) REFERENCES materialen(id) ON DELETE CASCADE;

ALTER TABLE public.materialen ADD CONSTRAINT materialen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.materialen ADD CONSTRAINT materialen_leverancier_id_fkey FOREIGN KEY (leverancier_id) REFERENCES leveranciers(id) ON DELETE SET NULL;

ALTER TABLE public.notes ADD CONSTRAINT notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.notes ADD CONSTRAINT notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public.notes ADD CONSTRAINT notes_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.offerte_items ADD CONSTRAINT offerte_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.offerte_items ADD CONSTRAINT offerte_items_offerte_id_fkey FOREIGN KEY (offerte_id) REFERENCES offertes(id) ON DELETE CASCADE;

ALTER TABLE public.offertes ADD CONSTRAINT offertes_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.offertes ADD CONSTRAINT offertes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public.offertes ADD CONSTRAINT offertes_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;

ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.plan_usage_events ADD CONSTRAINT plan_usage_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.project_notes ADD CONSTRAINT project_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.project_notes ADD CONSTRAINT project_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.project_notes ADD CONSTRAINT project_notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE public.projects ADD CONSTRAINT projects_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.projects ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.projects ADD CONSTRAINT projects_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public.projects ADD CONSTRAINT projects_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;

ALTER TABLE public.projects ADD CONSTRAINT projects_offerte_id_fkey FOREIGN KEY (offerte_id) REFERENCES offertes(id) ON DELETE SET NULL;

ALTER TABLE public.projects ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.sent_emails ADD CONSTRAINT sent_emails_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.sent_emails ADD CONSTRAINT sent_emails_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public.stripe_billing_events ADD CONSTRAINT stripe_billing_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE public.stripe_connections ADD CONSTRAINT stripe_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.trial_mails ADD CONSTRAINT trial_mails_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.upgrade_requests ADD CONSTRAINT upgrade_requests_aangevraagd_door_fkey FOREIGN KEY (aangevraagd_door) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.upgrade_requests ADD CONSTRAINT upgrade_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.urenregistratie ADD CONSTRAINT urenregistratie_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.urenregistratie ADD CONSTRAINT urenregistratie_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public.urenregistratie ADD CONSTRAINT urenregistratie_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;

ALTER TABLE public.urenregistratie ADD CONSTRAINT urenregistratie_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.urenregistratie ADD CONSTRAINT urenregistratie_werkbon_id_fkey FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE SET NULL;

ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.voertuigen ADD CONSTRAINT voertuigen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.website_aanvragen ADD CONSTRAINT website_aanvragen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_fotos ADD CONSTRAINT werkbon_fotos_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.werkbon_fotos ADD CONSTRAINT werkbon_fotos_werkbon_id_fkey FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_materiaal_inkoop ADD CONSTRAINT werkbon_materiaal_inkoop_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_materiaal_inkoop ADD CONSTRAINT werkbon_materiaal_inkoop_werkbon_materiaal_id_fkey FOREIGN KEY (werkbon_materiaal_id) REFERENCES werkbon_materialen(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_materialen ADD CONSTRAINT werkbon_materialen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_materialen ADD CONSTRAINT werkbon_materialen_leverancier_id_fkey FOREIGN KEY (leverancier_id) REFERENCES leveranciers(id) ON DELETE SET NULL;

ALTER TABLE public.werkbon_materialen ADD CONSTRAINT werkbon_materialen_materiaal_id_fkey FOREIGN KEY (materiaal_id) REFERENCES materialen(id) ON DELETE SET NULL;

ALTER TABLE public.werkbon_materialen ADD CONSTRAINT werkbon_materialen_werkbon_id_fkey FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_notities ADD CONSTRAINT werkbon_notities_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_notities ADD CONSTRAINT werkbon_notities_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.werkbon_notities ADD CONSTRAINT werkbon_notities_werkbon_id_fkey FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_taken ADD CONSTRAINT werkbon_taken_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_taken ADD CONSTRAINT werkbon_taken_werkbon_id_fkey FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_uren ADD CONSTRAINT werkbon_uren_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.werkbon_uren ADD CONSTRAINT werkbon_uren_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);

ALTER TABLE public.werkbon_uren ADD CONSTRAINT werkbon_uren_werkbon_id_fkey FOREIGN KEY (werkbon_id) REFERENCES werkbonnen(id) ON DELETE CASCADE;

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL;

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_offerte_id_fkey FOREIGN KEY (offerte_id) REFERENCES offertes(id) ON DELETE SET NULL;

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE public.werkbonnen ADD CONSTRAINT werkbonnen_voertuig_id_fkey FOREIGN KEY (voertuig_id) REFERENCES voertuigen(id);



-- ============================================================================
-- I. INDEXEN  (96)
-- ----------------------------------------------------------------------------
-- Alleen indexen die niet al door een constraint worden aangemaakt.
-- ============================================================================

CREATE INDEX accounting_sync_runs_laatste_idx ON public.accounting_sync_runs USING btree (company_id, provider, gestart_op DESC);

CREATE INDEX idx_activiteit_notities_activity ON public.activiteit_notities USING btree (activity_id);

CREATE INDEX idx_activiteit_notities_company ON public.activiteit_notities USING btree (company_id);

CREATE INDEX idx_activities_company ON public.activities USING btree (company_id);

CREATE INDEX idx_bedrijfsinstellingen_company ON public.bedrijfsinstellingen USING btree (company_id);

CREATE INDEX boss_conversations_company_idx ON public.boss_conversations USING btree (company_id, updated_at DESC);

CREATE INDEX boss_conversations_user_idx ON public.boss_conversations USING btree (user_id, updated_at DESC);

CREATE UNIQUE INDEX idx_calendar_events_activiteit ON public.calendar_events USING btree (activiteit_id) WHERE (activiteit_id IS NOT NULL);

CREATE INDEX idx_calendar_events_company ON public.calendar_events USING btree (company_id);

CREATE UNIQUE INDEX idx_calendar_events_werkbon ON public.calendar_events USING btree (werkbon_id) WHERE (werkbon_id IS NOT NULL);

CREATE INDEX idx_company_members_company ON public.company_members USING btree (company_id);

CREATE UNIQUE INDEX idx_company_members_invite_token ON public.company_members USING btree (invite_token) WHERE (invite_token IS NOT NULL);

CREATE INDEX idx_company_members_profile ON public.company_members USING btree (profile_id);

CREATE INDEX idx_company_members_status ON public.company_members USING btree (company_id, status);

CREATE INDEX idx_customers_company ON public.customers USING btree (company_id);

CREATE INDEX idx_deals_company ON public.deals USING btree (company_id);

CREATE INDEX eigen_eenheden_company_idx ON public.eigen_eenheden USING btree (company_id);

CREATE INDEX idx_email_templates_company ON public.email_templates USING btree (company_id);

CREATE INDEX idx_evc_user ON public.email_verification_codes USING btree (user_id);

CREATE INDEX facturen_bijlage_natesturen_idx ON public.facturen USING btree (company_id) WHERE ((snelstart_id IS NOT NULL) AND (snelstart_bijlage_gesynct = false));

CREATE INDEX facturen_externe_referentie_idx ON public.facturen USING btree (company_id, externe_referentie) WHERE (externe_referentie IS NOT NULL);

CREATE UNIQUE INDEX facturen_stripe_payment_token_key ON public.facturen USING btree (stripe_payment_token) WHERE (stripe_payment_token IS NOT NULL);

CREATE INDEX idx_facturen_company ON public.facturen USING btree (company_id);

CREATE INDEX idx_facturen_created ON public.facturen USING btree (company_id, created_at DESC);

CREATE INDEX idx_facturen_customer ON public.facturen USING btree (customer_id);

CREATE INDEX idx_facturen_externe_ref ON public.facturen USING btree (company_id, externe_referentie);

CREATE INDEX idx_facturen_project ON public.facturen USING btree (project_id);

CREATE INDEX idx_facturen_status ON public.facturen USING btree (company_id, status);

CREATE INDEX idx_factuur_regels_company ON public.factuur_regels USING btree (company_id);

CREATE INDEX idx_factuur_regels_factuur ON public.factuur_regels USING btree (factuur_id);

CREATE INDEX idx_job_costs_customer_id ON public.job_costs USING btree (customer_id);

CREATE INDEX idx_job_costs_project ON public.job_costs USING btree (project_id);

CREATE INDEX idx_job_costs_werkbon ON public.job_costs USING btree (werkbon_id);

CREATE INDEX idx_job_costs_werkbon_materiaal ON public.job_costs USING btree (werkbon_materiaal_id);

CREATE INDEX job_costs_bijlage_nasturen_idx ON public.job_costs USING btree (company_id) WHERE ((snelstart_id IS NOT NULL) AND (bijlage_url IS NOT NULL) AND (snelstart_bijlage_gesynct = false));

CREATE INDEX job_costs_company_leverancier_idx ON public.job_costs USING btree (company_id, leverancier) WHERE (leverancier IS NOT NULL);

CREATE INDEX job_costs_leverancier_id_idx ON public.job_costs USING btree (leverancier_id) WHERE (leverancier_id IS NOT NULL);

CREATE INDEX klant_tijdlijn_company_idx ON public.klant_tijdlijn USING btree (company_id);

CREATE INDEX klant_tijdlijn_customer_idx ON public.klant_tijdlijn USING btree (customer_id);

CREATE INDEX kosten_categorieen_company_idx ON public.kosten_categorieen USING btree (company_id) WHERE actief;

CREATE INDEX leverancier_tijdlijn_company_idx ON public.leverancier_tijdlijn USING btree (company_id);

CREATE INDEX leverancier_tijdlijn_leverancier_idx ON public.leverancier_tijdlijn USING btree (leverancier_id, aangemaakt_op DESC);

CREATE INDEX leveranciers_company_naam_idx ON public.leveranciers USING btree (company_id, naam);

CREATE UNIQUE INDEX leveranciers_company_snelstart_idx ON public.leveranciers USING btree (company_id, snelstart_id) WHERE (snelstart_id IS NOT NULL);

CREATE INDEX lost_reasons_company_idx ON public.lost_reasons USING btree (company_id);

CREATE INDEX materialen_company_naam_idx ON public.materialen USING btree (company_id, naam);

CREATE INDEX materialen_leverancier_idx ON public.materialen USING btree (leverancier_id) WHERE (leverancier_id IS NOT NULL);

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_offerte_items_company ON public.offerte_items USING btree (company_id);

CREATE INDEX idx_offerte_items_offerte ON public.offerte_items USING btree (offerte_id);

CREATE INDEX idx_offertes_company ON public.offertes USING btree (company_id);

CREATE INDEX idx_offertes_created ON public.offertes USING btree (company_id, created_at DESC);

CREATE INDEX idx_offertes_customer ON public.offertes USING btree (customer_id);

CREATE INDEX idx_offertes_status ON public.offertes USING btree (company_id, status);

CREATE INDEX idx_plan_usage_events_lookup ON public.plan_usage_events USING btree (company_id, soort, periode_start);

CREATE INDEX idx_profiles_company_actief ON public.profiles USING btree (company_id, actief);

CREATE INDEX idx_project_notes_company ON public.project_notes USING btree (company_id);

CREATE INDEX idx_project_notes_project ON public.project_notes USING btree (project_id);

CREATE INDEX idx_projects_company ON public.projects USING btree (company_id);

CREATE INDEX idx_projects_customer ON public.projects USING btree (customer_id);

CREATE INDEX idx_projects_deadline ON public.projects USING btree (company_id, deadline);

CREATE INDEX idx_projects_deal ON public.projects USING btree (deal_id);

CREATE INDEX idx_projects_offerte ON public.projects USING btree (offerte_id);

CREATE INDEX idx_projects_status ON public.projects USING btree (company_id, status);

CREATE UNIQUE INDEX subscriptions_stripe_customer_key ON public.subscriptions USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);

CREATE UNIQUE INDEX subscriptions_stripe_schedule_key ON public.subscriptions USING btree (stripe_schedule_id) WHERE (stripe_schedule_id IS NOT NULL);

CREATE UNIQUE INDEX subscriptions_stripe_subscription_key ON public.subscriptions USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);

CREATE INDEX idx_upgrade_requests_company ON public.upgrade_requests USING btree (company_id, created_at DESC);

CREATE INDEX idx_urenregistratie_company ON public.urenregistratie USING btree (company_id);

CREATE INDEX idx_urenregistratie_customer ON public.urenregistratie USING btree (customer_id);

CREATE INDEX idx_urenregistratie_datum ON public.urenregistratie USING btree (company_id, datum DESC);

CREATE INDEX idx_urenregistratie_deal ON public.urenregistratie USING btree (deal_id);

CREATE INDEX idx_urenregistratie_profile ON public.urenregistratie USING btree (profile_id);

CREATE INDEX idx_urenregistratie_werkbon ON public.urenregistratie USING btree (werkbon_id);

CREATE INDEX idx_website_aanvragen_status ON public.website_aanvragen USING btree (status, aangevraagd_op DESC);

CREATE INDEX idx_werkbon_fotos_company ON public.werkbon_fotos USING btree (company_id);

CREATE INDEX idx_werkbon_fotos_werkbon ON public.werkbon_fotos USING btree (werkbon_id);

CREATE INDEX idx_werkbon_materialen_company ON public.werkbon_materialen USING btree (company_id);

CREATE INDEX idx_werkbon_materialen_werkbon ON public.werkbon_materialen USING btree (werkbon_id);

CREATE INDEX werkbon_materialen_materiaal_idx ON public.werkbon_materialen USING btree (materiaal_id) WHERE (materiaal_id IS NOT NULL);

CREATE INDEX idx_werkbon_notities_company ON public.werkbon_notities USING btree (company_id);

CREATE INDEX idx_werkbon_notities_werkbon ON public.werkbon_notities USING btree (werkbon_id);

CREATE INDEX idx_werkbon_taken_company ON public.werkbon_taken USING btree (company_id);

CREATE INDEX idx_werkbon_taken_soort ON public.werkbon_taken USING btree (werkbon_id, is_meerwerk);

CREATE INDEX idx_werkbon_taken_werkbon ON public.werkbon_taken USING btree (werkbon_id);

CREATE INDEX werkbon_uren_profiel_datum_idx ON public.werkbon_uren USING btree (company_id, profile_id, datum);

CREATE INDEX werkbon_uren_werkbon_idx ON public.werkbon_uren USING btree (werkbon_id);

CREATE INDEX idx_werkbonnen_assigned ON public.werkbonnen USING btree (assigned_to);

CREATE INDEX idx_werkbonnen_company ON public.werkbonnen USING btree (company_id);

CREATE INDEX idx_werkbonnen_customer ON public.werkbonnen USING btree (customer_id);

CREATE INDEX idx_werkbonnen_datum ON public.werkbonnen USING btree (company_id, gepland_op);

CREATE INDEX idx_werkbonnen_project ON public.werkbonnen USING btree (project_id);

CREATE INDEX idx_werkbonnen_status ON public.werkbonnen USING btree (company_id, status);

CREATE INDEX idx_werkbonnen_verantwoordelijke ON public.werkbonnen USING gin (verantwoordelijke_ids);

CREATE UNIQUE INDEX werkbonnen_company_nummer_uniq ON public.werkbonnen USING btree (company_id, nummer);

CREATE UNIQUE INDEX werkbonnen_sign_token_uniq ON public.werkbonnen USING btree (sign_token);



-- ============================================================================
-- J. TRIGGERS  (36)
-- ----------------------------------------------------------------------------
-- Uit pg_get_triggerdef. Interne systeemtriggers zijn uitgesloten.
-- ============================================================================

CREATE TRIGGER trg_accounting_feature BEFORE INSERT ON public.accounting_connections FOR EACH ROW EXECUTE FUNCTION bb_check_accounting_feature();

CREATE TRIGGER activiteit_notities_set_updated_at BEFORE UPDATE ON public.activiteit_notities FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();

CREATE TRIGGER companies_seed_lost_reasons AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION trg_seed_lost_reasons();

CREATE TRIGGER companies_seed_pipeline_stages AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION trg_seed_pipeline_stages();

CREATE TRIGGER trg_company_kostencategorieen AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION bb_nieuwe_company_kostencategorieen();

CREATE TRIGGER trg_seed_trial_subscription AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION bb_seed_trial_subscription();

CREATE TRIGGER dashboard_widgets_updated_at BEFORE UPDATE ON public.dashboard_widgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_facturen_totalen_forceren BEFORE UPDATE ON public.facturen FOR EACH ROW EXECUTE FUNCTION bb_factuurtotalen_forceren();

CREATE TRIGGER trg_factuur_usage AFTER INSERT ON public.facturen FOR EACH ROW EXECUTE FUNCTION bb_log_factuur_usage();

CREATE TRIGGER trg_herinnering_feature BEFORE UPDATE ON public.facturen FOR EACH ROW EXECUTE FUNCTION bb_check_herinnering_feature();

CREATE TRIGGER trg_readonly_factuur_versturen BEFORE UPDATE ON public.facturen FOR EACH ROW EXECUTE FUNCTION bb_blokkeer_versturen();

CREATE TRIGGER trg_factuur_regels_totalen AFTER INSERT OR DELETE OR UPDATE ON public.factuur_regels FOR EACH ROW EXECUTE FUNCTION bb_factuurtotalen_bij_regel();

CREATE TRIGGER google_calendar_connections_updated_at BEFORE UPDATE ON public.google_calendar_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bb_import_genegeerd_bewijs_trigger BEFORE INSERT ON public.import_genegeerd FOR EACH ROW EXECUTE FUNCTION bb_import_genegeerd_bewijs();

CREATE TRIGGER leveranciers_touch BEFORE UPDATE ON public.leveranciers FOR EACH ROW EXECUTE FUNCTION leveranciers_touch_updated_at();

CREATE TRIGGER materiaal_inkoop_bij_insert AFTER INSERT ON public.materialen FOR EACH ROW EXECUTE FUNCTION materiaal_inkoop_aanmaken();

CREATE TRIGGER materialen_touch BEFORE UPDATE ON public.materialen FOR EACH ROW EXECUTE FUNCTION materialen_touch_updated_at();

CREATE TRIGGER trg_offerte_items_totalen AFTER INSERT OR DELETE OR UPDATE ON public.offerte_items FOR EACH ROW EXECUTE FUNCTION bb_offertetotalen_bij_regel();

CREATE TRIGGER trg_handtekening_feature BEFORE UPDATE ON public.offertes FOR EACH ROW EXECUTE FUNCTION bb_check_handtekening_feature();

CREATE TRIGGER trg_offerte_usage AFTER INSERT ON public.offertes FOR EACH ROW EXECUTE FUNCTION bb_log_offerte_usage();

CREATE TRIGGER trg_offertes_totalen_forceren BEFORE UPDATE ON public.offertes FOR EACH ROW EXECUTE FUNCTION bb_offertetotalen_forceren();

CREATE TRIGGER trg_readonly_offerte_versturen BEFORE UPDATE ON public.offertes FOR EACH ROW EXECUTE FUNCTION bb_blokkeer_versturen();

CREATE TRIGGER protect_privileges BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_privileges();

CREATE TRIGGER project_notes_set_updated_at BEFORE UPDATE ON public.project_notes FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();

CREATE TRIGGER projects_sync_deal_afgerond AFTER UPDATE OF status ON public.projects FOR EACH ROW WHEN ((new.status = 'afgerond'::text)) EXECUTE FUNCTION sync_deal_stage_to_afgerond();

CREATE TRIGGER trg_welkomstactie_onwijzigbaar BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION bb_welkomstactie_onwijzigbaar();

CREATE TRIGGER trg_upgrade_request_author BEFORE INSERT ON public.upgrade_requests FOR EACH ROW EXECUTE FUNCTION bb_set_upgrade_request_author();

CREATE TRIGGER bb_werkbon_materialen_op_slot BEFORE INSERT OR DELETE OR UPDATE ON public.werkbon_materialen FOR EACH ROW EXECUTE FUNCTION bb_werkbon_op_slot();

CREATE TRIGGER wm_inkoop_bij_insert AFTER INSERT ON public.werkbon_materialen FOR EACH ROW EXECUTE FUNCTION wm_inkoop_aanmaken();

CREATE TRIGGER werkbon_notities_set_updated_at BEFORE UPDATE ON public.werkbon_notities FOR EACH ROW EXECUTE FUNCTION bb_set_updated_at();

CREATE TRIGGER bb_werkbon_taken_op_slot BEFORE INSERT OR DELETE OR UPDATE ON public.werkbon_taken FOR EACH ROW EXECUTE FUNCTION bb_werkbon_op_slot();

CREATE TRIGGER bb_werkbon_uren_op_slot BEFORE INSERT OR DELETE OR UPDATE ON public.werkbon_uren FOR EACH ROW EXECUTE FUNCTION bb_werkbon_op_slot();

CREATE TRIGGER bb_werkbon_nummer_trigger BEFORE INSERT ON public.werkbonnen FOR EACH ROW EXECUTE FUNCTION bb_werkbon_nummer();

CREATE TRIGGER trg_werkbon_voertuig_feature BEFORE INSERT OR UPDATE ON public.werkbonnen FOR EACH ROW EXECUTE FUNCTION bb_check_werkbon_voertuig();

CREATE TRIGGER werkbonnen_sync_deal_afgerond AFTER UPDATE OF status ON public.werkbonnen FOR EACH ROW WHEN ((new.status = 'afgerond'::text)) EXECUTE FUNCTION sync_deal_stage_to_afgerond();



-- ============================================================================
-- K. ROW LEVEL SECURITY AANZETTEN  (67)
-- ----------------------------------------------------------------------------
-- Elke tabel in public heeft RLS aan. FORCE staat er alleen bij als dat live ook zo is.
-- ============================================================================

ALTER TABLE public.accounting_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.accounting_sync_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activiteit_notities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bedrijfsinstellingen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.boss_conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.boss_doorzet_limiet ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.boss_rate_limit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.btw_periodes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eigen_eenheden ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_send_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_verification_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.facturen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.factuur_regels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.grootboek_voorkeuren ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.import_genegeerd ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_costs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.klant_tijdlijn ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kosten_categorieen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leverancier_tijdlijn ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leveranciers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lost_reasons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.materiaal_inkoop ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.materialen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.offerte_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.offertes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_feature_defs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_module_tiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_modules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_usage_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_billing_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.trial_mails ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.urenregistratie ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voertuigen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.website_aanvragen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkbon_fotos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkbon_materiaal_inkoop ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkbon_materialen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkbon_notities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkbon_taken ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkbon_uren ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkbonnen ENABLE ROW LEVEL SECURITY;



-- ============================================================================
-- L. RLS-POLICIES  (226)
-- ----------------------------------------------------------------------------
-- Uit pg_policies: permissive/restrictive, commando, rollen, USING en WITH CHECK.
-- ============================================================================

CREATE POLICY delete_accounting_connections ON public.accounting_connections FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY insert_accounting_connections ON public.accounting_connections FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY plan_feature_boekhouding_insert ON public.accounting_connections AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_has_feature('boekhoudkoppeling'::text));

CREATE POLICY plan_feature_boekhouding_update ON public.accounting_connections AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bb_has_feature('boekhoudkoppeling'::text));

CREATE POLICY select_accounting_connections ON public.accounting_connections FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY update_accounting_connections ON public.accounting_connections FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY accounting_sync_runs_select ON public.accounting_sync_runs FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY activiteit_notities_delete ON public.activiteit_notities FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((created_by = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])))));

CREATE POLICY activiteit_notities_insert ON public.activiteit_notities FOR INSERT TO public
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY activiteit_notities_select ON public.activiteit_notities FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY activiteit_notities_update ON public.activiteit_notities FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((created_by = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])))))
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY readonly_activiteit_notities ON public.activiteit_notities AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY "Users can delete own company activities" ON public.activities FOR DELETE TO public
  USING ((company_id = current_company_id()));

CREATE POLICY "Users can insert own company activities" ON public.activities FOR INSERT TO public
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can update own company activities" ON public.activities FOR UPDATE TO public
  USING ((company_id = current_company_id()))
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can view own company activities" ON public.activities FOR SELECT TO public
  USING (((company_id = current_company_id()) AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning'::text) OR bb_has_permission('agenda_inzien'::text) OR (assigned_to = auth.uid()) OR (auth.uid() = ANY (assigned_to_ids)))));

CREATE POLICY readonly_activities ON public.activities AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY bedrijfsinstellingen_delete ON public.bedrijfsinstellingen FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY bedrijfsinstellingen_insert ON public.bedrijfsinstellingen FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY bedrijfsinstellingen_select ON public.bedrijfsinstellingen FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY bedrijfsinstellingen_update ON public.bedrijfsinstellingen FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY boss_conversations_delete ON public.boss_conversations FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY boss_conversations_insert ON public.boss_conversations FOR INSERT TO authenticated
  WITH CHECK (((company_id = bb_current_company()) AND (user_id = auth.uid())));

CREATE POLICY boss_conversations_select ON public.boss_conversations FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY boss_conversations_update ON public.boss_conversations FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY btw_periodes_company ON public.btw_periodes FOR ALL TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY plan_feature_btw ON public.btw_periodes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bb_has_feature('btw_overzicht'::text));

CREATE POLICY "Users can delete own company calendar events" ON public.calendar_events FOR DELETE TO public
  USING (((company_id = current_company_id()) AND (bb_has_permission('planning'::text) OR ((herkomst <> 'planning'::text) AND (assigned_to = auth.uid())))));

CREATE POLICY "Users can insert own company calendar events" ON public.calendar_events FOR INSERT TO public
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can update own company calendar events" ON public.calendar_events FOR UPDATE TO public
  USING (((company_id = current_company_id()) AND (bb_has_permission('planning'::text) OR ((herkomst <> 'planning'::text) AND (assigned_to = auth.uid())))))
  WITH CHECK (((company_id = current_company_id()) AND (bb_has_permission('planning'::text) OR ((herkomst <> 'planning'::text) AND (assigned_to = auth.uid())))));

CREATE POLICY "Users can view own company calendar events" ON public.calendar_events FOR SELECT TO public
  USING (((company_id = current_company_id()) AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning'::text) OR bb_has_permission('agenda_inzien'::text) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM activities a
  WHERE ((a.id = calendar_events.activiteit_id) AND ((a.assigned_to = auth.uid()) OR (auth.uid() = ANY (a.assigned_to_ids)))))) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = calendar_events.werkbon_id) AND ((w.assigned_to = auth.uid()) OR (auth.uid() = ANY (w.assigned_to_ids)))))))));

CREATE POLICY readonly_calendar_events ON public.calendar_events AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY "Users can update own company" ON public.companies FOR UPDATE TO public
  USING (((id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY "Users can view own company" ON public.companies FOR SELECT TO authenticated
  USING ((id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY companies_insert_registration ON public.companies FOR INSERT TO authenticated
  WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.company_id IS NOT NULL))))));

CREATE POLICY super_admin_update_companies ON public.companies FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_super_admin = true)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_super_admin = true)))));

CREATE POLICY company_members_delete ON public.company_members FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY company_members_insert ON public.company_members FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY company_members_select ON public.company_members FOR SELECT TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((profile_id = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text))));

CREATE POLICY company_members_update ON public.company_members FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY plan_limiet_gebruikers ON public.company_members AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_within_limit('gebruikers'::text));

CREATE POLICY readonly_company_members ON public.company_members AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY company_modules_select ON public.company_modules FOR SELECT TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY company_modules_super_admin ON public.company_modules FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_super_admin))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_super_admin))));

CREATE POLICY "Users can delete own company customers" ON public.customers FOR DELETE TO authenticated
  USING (((company_id = current_company_id()) AND bb_is_admin_or_permission('klanten_verwijderen'::text)));

CREATE POLICY "Users can insert own company customers" ON public.customers FOR INSERT TO public
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can update own company customers" ON public.customers FOR UPDATE TO authenticated
  USING (((company_id = current_company_id()) AND bb_has_permission('klanten_bewerken'::text)))
  WITH CHECK (((company_id = current_company_id()) AND bb_has_permission('klanten_bewerken'::text)));

CREATE POLICY "Users can view own company customers" ON public.customers FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY plan_limiet_klanten ON public.customers AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_within_limit('klanten'::text));

CREATE POLICY readonly_customers ON public.customers AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY dw_delete ON public.dashboard_widgets FOR DELETE TO public
  USING ((user_id = auth.uid()));

CREATE POLICY dw_insert ON public.dashboard_widgets FOR INSERT TO public
  WITH CHECK (((user_id = auth.uid()) AND (company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));

CREATE POLICY dw_select ON public.dashboard_widgets FOR SELECT TO public
  USING (((user_id = auth.uid()) AND (company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));

CREATE POLICY dw_update ON public.dashboard_widgets FOR UPDATE TO public
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY deals_delete ON public.deals FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY deals_insert ON public.deals FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND bb_has_permission('verkoop'::text)));

CREATE POLICY deals_select ON public.deals FOR SELECT TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND bb_has_permission('verkoop'::text)));

CREATE POLICY deals_update ON public.deals FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND bb_has_permission('verkoop'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND bb_has_permission('verkoop'::text)));

CREATE POLICY readonly_deals ON public.deals AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY eigen_eenheden_delete ON public.eigen_eenheden FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY eigen_eenheden_insert ON public.eigen_eenheden FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY eigen_eenheden_select ON public.eigen_eenheden FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY eigen_eenheden_update ON public.eigen_eenheden FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY email_templates_delete ON public.email_templates FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY email_templates_insert ON public.email_templates FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY email_templates_select ON public.email_templates FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY email_templates_update ON public.email_templates FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY plan_feature_eigen_templates ON public.email_templates AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((bb_has_feature('eigen_email_templates'::text) OR (type = ANY (ARRAY['offerte'::text, 'offerte_geaccepteerd'::text, 'factuur'::text, 'herinnering_1'::text, 'herinnering_2'::text, 'aanvraag_ontvangen'::text, 'welkom'::text, 'afspraak_bevestiging'::text, 'afspraak_herinnering'::text]))));

CREATE POLICY facturen_delete ON public.facturen FOR DELETE TO authenticated
  USING (((company_id = current_company_id()) AND bb_has_permission('facturen'::text)));

CREATE POLICY facturen_insert ON public.facturen FOR INSERT TO authenticated
  WITH CHECK (((company_id = current_company_id()) AND bb_has_permission('facturen'::text)));

CREATE POLICY facturen_select ON public.facturen FOR SELECT TO authenticated
  USING (((company_id = current_company_id()) AND bb_has_permission('facturen'::text)));

CREATE POLICY facturen_update ON public.facturen FOR UPDATE TO authenticated
  USING (((company_id = current_company_id()) AND bb_has_permission('facturen'::text)))
  WITH CHECK (((company_id = current_company_id()) AND bb_has_permission('facturen'::text)));

CREATE POLICY plan_limiet_facturen ON public.facturen AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((bb_within_limit('facturen'::text) OR COALESCE(is_credit, false)));

CREATE POLICY readonly_facturen ON public.facturen AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((bb_mag_schrijven() OR COALESCE(is_credit, false)));

CREATE POLICY factuur_regels_delete ON public.factuur_regels FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY factuur_regels_insert ON public.factuur_regels FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY factuur_regels_select ON public.factuur_regels FOR SELECT TO public
  USING (((company_id = current_company_id()) AND bb_has_permission('facturen'::text)));

CREATE POLICY factuur_regels_update ON public.factuur_regels FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY readonly_factuur_regels ON public.factuur_regels AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((bb_mag_schrijven() OR (EXISTS ( SELECT 1
   FROM facturen f
  WHERE ((f.id = factuur_regels.factuur_id) AND COALESCE(f.is_credit, false))))));

CREATE POLICY grootboek_voorkeuren_delete ON public.grootboek_voorkeuren FOR DELETE TO public
  USING (((company_id = current_company_id()) AND COALESCE(( SELECT (profiles.role = 'admin'::text)
   FROM profiles
  WHERE (profiles.id = auth.uid())), false)));

CREATE POLICY grootboek_voorkeuren_insert ON public.grootboek_voorkeuren FOR INSERT TO public
  WITH CHECK (((company_id = current_company_id()) AND COALESCE(( SELECT (profiles.role = 'admin'::text)
   FROM profiles
  WHERE (profiles.id = auth.uid())), false)));

CREATE POLICY grootboek_voorkeuren_select ON public.grootboek_voorkeuren FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY grootboek_voorkeuren_update ON public.grootboek_voorkeuren FOR UPDATE TO public
  USING (((company_id = current_company_id()) AND COALESCE(( SELECT (profiles.role = 'admin'::text)
   FROM profiles
  WHERE (profiles.id = auth.uid())), false)));

CREATE POLICY import_genegeerd_delete ON public.import_genegeerd FOR DELETE TO public
  USING (((company_id = current_company_id()) AND COALESCE(( SELECT (profiles.role = 'admin'::text)
   FROM profiles
  WHERE (profiles.id = auth.uid())), false)));

CREATE POLICY import_genegeerd_insert ON public.import_genegeerd FOR INSERT TO public
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY import_genegeerd_select ON public.import_genegeerd FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY import_genegeerd_update ON public.import_genegeerd FOR UPDATE TO public
  USING ((company_id = current_company_id()))
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can delete own company job costs" ON public.job_costs FOR DELETE TO authenticated
  USING (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

CREATE POLICY "Users can insert own company job costs" ON public.job_costs FOR INSERT TO authenticated
  WITH CHECK (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

CREATE POLICY "Users can update own company job costs" ON public.job_costs FOR UPDATE TO authenticated
  USING (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))))
  WITH CHECK (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

CREATE POLICY "Users can view own company job costs" ON public.job_costs FOR SELECT TO authenticated
  USING (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

CREATE POLICY plan_feature_kosten ON public.job_costs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((werkbon_id IS NOT NULL) OR bb_has_feature('kosten_nacalculatie'::text)));

CREATE POLICY readonly_job_costs ON public.job_costs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY "company members can manage klant_tijdlijn" ON public.klant_tijdlijn FOR ALL TO public
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY kosten_categorieen_delete ON public.kosten_categorieen FOR DELETE TO public
  USING (((company_id = current_company_id()) AND (standaard = false) AND COALESCE(( SELECT (profiles.role = 'admin'::text)
   FROM profiles
  WHERE (profiles.id = auth.uid())), false)));

CREATE POLICY kosten_categorieen_insert ON public.kosten_categorieen FOR INSERT TO public
  WITH CHECK (((company_id = current_company_id()) AND COALESCE(( SELECT (profiles.role = 'admin'::text)
   FROM profiles
  WHERE (profiles.id = auth.uid())), false)));

CREATE POLICY kosten_categorieen_select ON public.kosten_categorieen FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY kosten_categorieen_update ON public.kosten_categorieen FOR UPDATE TO public
  USING (((company_id = current_company_id()) AND COALESCE(( SELECT (profiles.role = 'admin'::text)
   FROM profiles
  WHERE (profiles.id = auth.uid())), false)));

CREATE POLICY leverancier_tijdlijn_delete ON public.leverancier_tijdlijn FOR DELETE TO public
  USING (((company_id = current_company_id()) AND ((created_by = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text))));

CREATE POLICY leverancier_tijdlijn_insert ON public.leverancier_tijdlijn FOR INSERT TO public
  WITH CHECK (((company_id = current_company_id()) AND bb_mag_schrijven()));

CREATE POLICY leverancier_tijdlijn_select ON public.leverancier_tijdlijn FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY leverancier_tijdlijn_update ON public.leverancier_tijdlijn FOR UPDATE TO public
  USING (((company_id = current_company_id()) AND ((created_by = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text))))
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can delete own company leveranciers" ON public.leveranciers FOR DELETE TO public
  USING (((company_id = current_company_id()) AND bb_is_admin_or_permission('klanten_verwijderen'::text)));

CREATE POLICY "Users can insert own company leveranciers" ON public.leveranciers FOR INSERT TO public
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can update own company leveranciers" ON public.leveranciers FOR UPDATE TO public
  USING (((company_id = current_company_id()) AND bb_has_permission('klanten_bewerken'::text)))
  WITH CHECK (((company_id = current_company_id()) AND bb_has_permission('klanten_bewerken'::text)));

CREATE POLICY "Users can view own company leveranciers" ON public.leveranciers FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY readonly_leveranciers ON public.leveranciers AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY lost_reasons_delete ON public.lost_reasons FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY lost_reasons_insert ON public.lost_reasons FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY lost_reasons_select ON public.lost_reasons FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY lost_reasons_update ON public.lost_reasons FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY materiaal_inkoop_delete ON public.materiaal_inkoop FOR DELETE TO public
  USING (((company_id = current_company_id()) AND bb_mag_inkoopprijs_zien()));

CREATE POLICY materiaal_inkoop_select ON public.materiaal_inkoop FOR SELECT TO public
  USING (((company_id = current_company_id()) AND bb_mag_inkoopprijs_zien()));

CREATE POLICY materiaal_inkoop_update ON public.materiaal_inkoop FOR UPDATE TO public
  USING (((company_id = current_company_id()) AND bb_mag_inkoopprijs_zien()))
  WITH CHECK (((company_id = current_company_id()) AND bb_mag_inkoopprijs_zien()));

CREATE POLICY materialen_delete ON public.materialen FOR DELETE TO public
  USING ((company_id = current_company_id()));

CREATE POLICY materialen_insert ON public.materialen FOR INSERT TO public
  WITH CHECK (((company_id = current_company_id()) AND bb_mag_schrijven()));

CREATE POLICY materialen_select ON public.materialen FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY materialen_update ON public.materialen FOR UPDATE TO public
  USING ((company_id = current_company_id()))
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can delete own company notes" ON public.notes FOR DELETE TO public
  USING ((company_id = current_company_id()));

CREATE POLICY "Users can insert own company notes" ON public.notes FOR INSERT TO public
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can update own company notes" ON public.notes FOR UPDATE TO public
  USING ((company_id = current_company_id()))
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can view own company notes" ON public.notes FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY readonly_notes ON public.notes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY notifications_self_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));

CREATE POLICY notifications_user_select ON public.notifications FOR SELECT TO public
  USING ((user_id = auth.uid()));

CREATE POLICY notifications_user_update ON public.notifications FOR UPDATE TO public
  USING ((user_id = auth.uid()));

CREATE POLICY offerte_items_delete ON public.offerte_items FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY offerte_items_insert ON public.offerte_items FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY offerte_items_select ON public.offerte_items FOR SELECT TO public
  USING (((company_id = current_company_id()) AND bb_has_permission('offertes'::text)));

CREATE POLICY offerte_items_update ON public.offerte_items FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY readonly_offerte_items ON public.offerte_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY offertes_delete ON public.offertes FOR DELETE TO authenticated
  USING (((company_id = current_company_id()) AND bb_has_permission('offertes'::text)));

CREATE POLICY offertes_insert ON public.offertes FOR INSERT TO authenticated
  WITH CHECK (((company_id = current_company_id()) AND bb_has_permission('offertes'::text)));

CREATE POLICY offertes_select ON public.offertes FOR SELECT TO authenticated
  USING (((company_id = current_company_id()) AND bb_has_permission('offertes'::text)));

CREATE POLICY offertes_update ON public.offertes FOR UPDATE TO authenticated
  USING (((company_id = current_company_id()) AND bb_has_permission('offertes'::text)))
  WITH CHECK (((company_id = current_company_id()) AND bb_has_permission('offertes'::text)));

CREATE POLICY plan_limiet_offertes ON public.offertes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((bb_within_limit('offertes'::text) OR (NOT bb_offerte_telt_mee(company_id, nummer, customer_id, NULL::uuid))));

CREATE POLICY readonly_offertes ON public.offertes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY "Users can delete own company pipeline stages" ON public.pipeline_stages FOR DELETE TO public
  USING ((company_id = current_company_id()));

CREATE POLICY "Users can insert own company pipeline stages" ON public.pipeline_stages FOR INSERT TO public
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can update own company pipeline stages" ON public.pipeline_stages FOR UPDATE TO public
  USING ((company_id = current_company_id()))
  WITH CHECK ((company_id = current_company_id()));

CREATE POLICY "Users can view own company pipeline stages" ON public.pipeline_stages FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY pipeline_stages_delete ON public.pipeline_stages FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY pipeline_stages_insert ON public.pipeline_stages FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY pipeline_stages_select ON public.pipeline_stages FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY pipeline_stages_update ON public.pipeline_stages FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY plan_feature_defs_read ON public.plan_feature_defs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY plan_features_read ON public.plan_features FOR SELECT TO authenticated
  USING (true);

CREATE POLICY plan_limits_read ON public.plan_limits FOR SELECT TO authenticated
  USING (true);

CREATE POLICY plan_module_tiers_read ON public.plan_module_tiers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY plan_modules_read ON public.plan_modules FOR SELECT TO authenticated
  USING (true);

CREATE POLICY plan_usage_events_select ON public.plan_usage_events FOR SELECT TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated
  USING ((id = auth.uid()));

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO public
  WITH CHECK ((id = auth.uid()));

CREATE POLICY profiles_select_company ON public.profiles FOR SELECT TO public
  USING (((id = auth.uid()) OR ((company_id IS NOT NULL) AND (company_id = current_user_company_id()))));

CREATE POLICY project_notes_delete ON public.project_notes FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((created_by = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])))));

CREATE POLICY project_notes_insert ON public.project_notes FOR INSERT TO public
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY project_notes_select ON public.project_notes FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY project_notes_update ON public.project_notes FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((created_by = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])))))
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY readonly_project_notes ON public.project_notes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY projects_delete ON public.projects FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY projects_insert ON public.projects FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND bb_has_permission('projecten_bewerken'::text)));

CREATE POLICY projects_select ON public.projects FOR SELECT TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('alles_inzien'::text) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.project_id = projects.id) AND ((w.assigned_to = auth.uid()) OR (auth.uid() = ANY (w.assigned_to_ids)))))))));

CREATE POLICY projects_update ON public.projects FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND bb_has_permission('projecten_bewerken'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND bb_has_permission('projecten_bewerken'::text)));

CREATE POLICY readonly_projects ON public.projects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY sent_emails_company ON public.sent_emails FOR ALL TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY delete_stripe_connections ON public.stripe_connections FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY insert_stripe_connections ON public.stripe_connections FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY select_stripe_connections ON public.stripe_connections FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY update_stripe_connections ON public.stripe_connections FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY super_admin_only ON public.subscriptions FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_super_admin = true)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_super_admin = true)))));

CREATE POLICY trial_mails_select ON public.trial_mails FOR SELECT TO authenticated
  USING ((company_id = bb_current_company()));

CREATE POLICY upgrade_requests_insert ON public.upgrade_requests FOR INSERT TO authenticated
  WITH CHECK ((company_id = ( SELECT p.company_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));

CREATE POLICY upgrade_requests_select ON public.upgrade_requests FOR SELECT TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY readonly_urenregistratie ON public.urenregistratie AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY urenregistratie_delete ON public.urenregistratie FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])) OR (profile_id = auth.uid()))));

CREATE POLICY urenregistratie_insert ON public.urenregistratie FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])) OR (profile_id = auth.uid()))));

CREATE POLICY urenregistratie_select ON public.urenregistratie FOR SELECT TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])) OR (profile_id = auth.uid()))));

CREATE POLICY urenregistratie_update ON public.urenregistratie FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])) OR (profile_id = auth.uid()))))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])) OR (profile_id = auth.uid()))));

CREATE POLICY permissions_admin_delete ON public.user_permissions FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY permissions_admin_insert ON public.user_permissions FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY permissions_admin_update ON public.user_permissions FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY permissions_select ON public.user_permissions FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY plan_feature_rechten_delete ON public.user_permissions AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bb_has_feature('rollen_rechten'::text));

CREATE POLICY plan_feature_rechten_insert ON public.user_permissions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_has_feature('rollen_rechten'::text));

CREATE POLICY plan_feature_rechten_update ON public.user_permissions AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bb_has_feature('rollen_rechten'::text));

CREATE POLICY plan_feature_voertuigen_insert ON public.voertuigen AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_has_feature('voertuigen'::text));

CREATE POLICY plan_feature_voertuigen_update ON public.voertuigen AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bb_has_feature('voertuigen'::text));

CREATE POLICY readonly_voertuigen ON public.voertuigen AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY voertuigen_delete ON public.voertuigen FOR DELETE TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY voertuigen_insert ON public.voertuigen FOR INSERT TO public
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY voertuigen_select ON public.voertuigen FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY voertuigen_update ON public.voertuigen FOR UPDATE TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY website_aanvragen_eigen ON public.website_aanvragen FOR SELECT TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY website_aanvragen_super_admin ON public.website_aanvragen FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_super_admin))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_super_admin))));

CREATE POLICY readonly_werkbon_fotos ON public.werkbon_fotos AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY werkbon_fotos_delete ON public.werkbon_fotos FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_fotos.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (w.verantwoordelijke_ids)))))));

CREATE POLICY werkbon_fotos_insert ON public.werkbon_fotos FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_fotos.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (w.verantwoordelijke_ids))))))));

CREATE POLICY werkbon_fotos_select ON public.werkbon_fotos FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY wm_inkoop_delete ON public.werkbon_materiaal_inkoop FOR DELETE TO public
  USING (((company_id = current_company_id()) AND bb_mag_inkoopprijs_zien()));

CREATE POLICY wm_inkoop_select ON public.werkbon_materiaal_inkoop FOR SELECT TO public
  USING (((company_id = current_company_id()) AND bb_mag_inkoopprijs_zien()));

CREATE POLICY wm_inkoop_update ON public.werkbon_materiaal_inkoop FOR UPDATE TO public
  USING (((company_id = current_company_id()) AND bb_mag_inkoopprijs_zien()))
  WITH CHECK (((company_id = current_company_id()) AND bb_mag_inkoopprijs_zien()));

CREATE POLICY readonly_werkbon_materialen ON public.werkbon_materialen AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY werkbon_materialen_delete ON public.werkbon_materialen FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])) AND (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_materialen.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))))));

CREATE POLICY werkbon_materialen_insert ON public.werkbon_materialen FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_materialen.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (w.verantwoordelijke_ids))))))));

CREATE POLICY werkbon_materialen_select ON public.werkbon_materialen FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_materialen.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning'::text) OR bb_has_permission('alles_inzien'::text) OR (w.assigned_to = auth.uid()) OR (auth.uid() = ANY (w.assigned_to_ids)))))));

CREATE POLICY werkbon_materialen_update ON public.werkbon_materialen FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_materialen.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (w.verantwoordelijke_ids)))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_materialen.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (w.verantwoordelijke_ids)))))));

CREATE POLICY readonly_werkbon_notities ON public.werkbon_notities AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY werkbon_notities_delete ON public.werkbon_notities FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((created_by = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])))));

CREATE POLICY werkbon_notities_insert ON public.werkbon_notities FOR INSERT TO public
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY werkbon_notities_select ON public.werkbon_notities FOR SELECT TO public
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY werkbon_notities_update ON public.werkbon_notities FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((created_by = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])))))
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY readonly_werkbon_taken ON public.werkbon_taken AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY werkbon_taken_delete ON public.werkbon_taken FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])) AND (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_taken.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))))));

CREATE POLICY werkbon_taken_insert ON public.werkbon_taken FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text])) AND (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_taken.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))))));

CREATE POLICY werkbon_taken_select ON public.werkbon_taken FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_taken.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning'::text) OR bb_has_permission('alles_inzien'::text) OR (w.assigned_to = auth.uid()) OR (auth.uid() = ANY (w.assigned_to_ids)))))));

CREATE POLICY werkbon_taken_update ON public.werkbon_taken FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_taken.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (w.verantwoordelijke_ids)))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = werkbon_taken.werkbon_id) AND (w.company_id = ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (w.verantwoordelijke_ids)))))));

CREATE POLICY werkbon_uren_delete ON public.werkbon_uren FOR DELETE TO public
  USING (((company_id = current_company_id()) AND bb_mag_werkbon_uren_beheren(werkbon_id)));

CREATE POLICY werkbon_uren_insert ON public.werkbon_uren FOR INSERT TO public
  WITH CHECK (((company_id = current_company_id()) AND bb_mag_werkbon_uren_beheren(werkbon_id)));

CREATE POLICY werkbon_uren_select ON public.werkbon_uren FOR SELECT TO public
  USING ((company_id = current_company_id()));

CREATE POLICY werkbon_uren_update ON public.werkbon_uren FOR UPDATE TO public
  USING (((company_id = current_company_id()) AND bb_mag_werkbon_uren_beheren(werkbon_id)));

CREATE POLICY readonly_werkbonnen ON public.werkbonnen AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bb_mag_schrijven());

CREATE POLICY werkbonnen_delete ON public.werkbonnen FOR DELETE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY werkbonnen_insert ON public.werkbonnen FOR INSERT TO public
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::text, 'planner'::text]))));

CREATE POLICY werkbonnen_select ON public.werkbonnen FOR SELECT TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning'::text) OR bb_has_permission('alles_inzien'::text) OR (assigned_to = auth.uid()) OR (auth.uid() = ANY (assigned_to_ids)))));

CREATE POLICY werkbonnen_update ON public.werkbonnen FOR UPDATE TO public
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning'::text) OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (verantwoordelijke_ids)))))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (bb_gedeelde_werkruimte() OR bb_has_permission('planning'::text) OR bb_has_permission('werkbonnen_bewerken'::text) OR (auth.uid() = ANY (verantwoordelijke_ids)))));



-- ============================================================================
-- M. GRANTS  (507)
-- ----------------------------------------------------------------------------
-- Tabelrechten voor anon/authenticated/service_role, samengevoegd per tabel en rol, plus EXECUTE per functie.
--    Veiligheidsrelevant: hier is te zien dat anon geen TRUNCATE meer heeft.
-- ============================================================================

GRANT REFERENCES, TRIGGER ON TABLE public.accounting_connections TO anon;

GRANT DELETE, INSERT, REFERENCES, TRIGGER, UPDATE ON TABLE public.accounting_connections TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.accounting_connections TO service_role;

GRANT REFERENCES, SELECT, TRIGGER ON TABLE public.accounting_sync_runs TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.accounting_sync_runs TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.accounting_sync_runs TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.activiteit_notities TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.activiteit_notities TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.activiteit_notities TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.activities TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.activities TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.activities TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.bedrijfsinstellingen TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.bedrijfsinstellingen TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bedrijfsinstellingen TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.boss_conversations TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.boss_conversations TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.boss_conversations TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.boss_doorzet_limiet TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.boss_doorzet_limiet TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.boss_doorzet_limiet TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.boss_rate_limit TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.boss_rate_limit TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.boss_rate_limit TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.btw_periodes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.btw_periodes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.btw_periodes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.calendar_events TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.calendar_events TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.calendar_events TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.companies TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.companies TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.companies TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.company_members TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.company_members TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.company_members TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.company_modules TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.company_modules TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.company_modules TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.customers TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.customers TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.customers TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.dashboard_widgets TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.dashboard_widgets TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.dashboard_widgets TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.deals TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.deals TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.deals TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.eigen_eenheden TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.eigen_eenheden TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.eigen_eenheden TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.email_send_attempts TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.email_send_attempts TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.email_templates TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.email_templates TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_templates TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.email_verification_attempts TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.email_verification_attempts TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_verification_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.email_verification_codes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.email_verification_codes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_verification_codes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.facturen TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.facturen TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.facturen TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.factuur_regels TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.factuur_regels TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.factuur_regels TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.google_calendar_connections TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.google_calendar_connections TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_calendar_connections TO service_role;

GRANT REFERENCES, SELECT, TRIGGER ON TABLE public.grootboek_voorkeuren TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.grootboek_voorkeuren TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.grootboek_voorkeuren TO service_role;

GRANT REFERENCES, SELECT, TRIGGER ON TABLE public.import_genegeerd TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.import_genegeerd TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.import_genegeerd TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.job_costs TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.job_costs TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_costs TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.klant_tijdlijn TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.klant_tijdlijn TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.klant_tijdlijn TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.kosten_categorieen TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.kosten_categorieen TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.kosten_categorieen TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.leverancier_tijdlijn TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.leverancier_tijdlijn TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leverancier_tijdlijn TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.leveranciers TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.leveranciers TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leveranciers TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.lost_reasons TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.lost_reasons TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lost_reasons TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.materiaal_inkoop TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.materiaal_inkoop TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.materiaal_inkoop TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.materialen TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.materialen TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.materialen TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.notes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.notes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.notifications TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.notifications TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.offerte_items TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.offerte_items TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offerte_items TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.offertes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.offertes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offertes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.password_reset_attempts TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.password_reset_attempts TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.password_reset_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.password_reset_tokens TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.password_reset_tokens TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.password_reset_tokens TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.pipeline_stages TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.pipeline_stages TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pipeline_stages TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_feature_defs TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_feature_defs TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_feature_defs TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_features TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_features TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_features TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_limits TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_limits TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_limits TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_module_tiers TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_module_tiers TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_module_tiers TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_modules TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_modules TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_modules TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_usage_events TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.plan_usage_events TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plan_usage_events TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.profiles TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.profiles TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.project_notes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.project_notes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_notes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.projects TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.projects TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.projects TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.sent_emails TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.sent_emails TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sent_emails TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.stripe_billing_events TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.stripe_billing_events TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stripe_billing_events TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.stripe_connections TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.stripe_connections TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stripe_connections TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.subscriptions TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.subscriptions TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.trial_mails TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.trial_mails TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trial_mails TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.upgrade_requests TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.upgrade_requests TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.upgrade_requests TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.urenregistratie TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.urenregistratie TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.urenregistratie TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.user_permissions TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.user_permissions TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_permissions TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.voertuigen TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.voertuigen TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.voertuigen TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.website_aanvragen TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.website_aanvragen TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.website_aanvragen TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_fotos TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_fotos TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.werkbon_fotos TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_materiaal_inkoop TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_materiaal_inkoop TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.werkbon_materiaal_inkoop TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_materialen TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_materialen TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.werkbon_materialen TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_notities TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_notities TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.werkbon_notities TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_taken TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_taken TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.werkbon_taken TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_uren TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbon_uren TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.werkbon_uren TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbonnen TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.werkbonnen TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.werkbonnen TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_blokkeer_versturen() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_blokkeer_versturen() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_blokkeer_versturen() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_boss_claim_bericht(p_user_id uuid, p_max integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_boss_claim_doorzet(p_conversation_id uuid, p_user_id uuid, p_max_per_dag integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_boss_geef_doorzet_vrij(p_conversation_id uuid, p_user_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_boss_log_gesprek(p_conversation_id uuid, p_company_id uuid, p_user_id uuid, p_messages jsonb, p_titel text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_boss_start_gesprek(p_conversation_id uuid, p_company_id uuid, p_user_id uuid, p_titel text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_check_accounting_feature() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_check_accounting_feature() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_check_accounting_feature() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_check_handtekening_feature() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_check_handtekening_feature() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_check_handtekening_feature() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_check_herinnering_feature() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_check_herinnering_feature() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_check_herinnering_feature() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_check_werkbon_voertuig() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_check_werkbon_voertuig() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_check_werkbon_voertuig() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_claim_trial_mail(p_company_id uuid, p_mail smallint, p_naar text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_claim_welkomstmail(p_subscription_id text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_current_company() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_current_company() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_current_company() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_downgrade_blokkades(p_doel_tier text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_downgrade_blokkades(p_company_id uuid, p_doel_tier text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_downgrade_blokkades(p_doel_tier text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_downgrade_blokkades(p_company_id uuid, p_doel_tier text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_downgrade_blokkades(p_doel_tier text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_downgrade_blokkades(p_company_id uuid, p_doel_tier text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_effective_tier(p_company_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_effective_tier() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_effective_tier() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_effective_tier(p_company_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_effective_tier() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_effective_tier(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_factuurtotalen_bij_regel() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_factuurtotalen_bij_regel() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_factuurtotalen_bij_regel() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_factuurtotalen_forceren() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_factuurtotalen_forceren() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_factuurtotalen_forceren() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_factuurtotalen(p_factuur_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_gedeelde_werkruimte() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_gedeelde_werkruimte() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_gedeelde_werkruimte() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_geef_trial_mail_vrij(p_company_id uuid, p_mail smallint) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_has_feature(p_company_id uuid, p_feature text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_has_feature(p_feature text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_has_feature(p_feature text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_has_feature(p_company_id uuid, p_feature text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_has_feature(p_company_id uuid, p_feature text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_has_feature(p_feature text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_has_permission(p_permission text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_has_permission(p_permission text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_has_permission(p_permission text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_herbereken_factuurtotalen(p_factuur_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_herbereken_offertetotalen(p_offerte_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_import_genegeerd_bewijs() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_is_admin_or_permission(p_permission text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_is_admin_or_permission(p_permission text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_is_admin_or_permission(p_permission text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_is_readonly(p_company_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_is_readonly() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_is_readonly(p_company_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_is_readonly() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_is_readonly() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_is_readonly(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_is_trial(p_company_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_is_trial() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_is_trial() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_is_trial(p_company_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_is_trial(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_is_trial() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_limit(p_company_id uuid, p_key text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_limit(p_key text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_limit(p_company_id uuid, p_key text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_limit(p_key text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_limit(p_key text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_limit(p_company_id uuid, p_key text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_log_factuur_usage() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_log_factuur_usage() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_log_factuur_usage() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_log_offerte_usage() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_log_offerte_usage() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_log_offerte_usage() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_mag_abonnement_beheren(p_user_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_mag_abonnement_beheren(p_user_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_mag_abonnement_beheren(p_user_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_mag_direct_opzeggen(p_company_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_mag_direct_opzeggen(p_company_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_mag_direct_opzeggen(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_mag_inkoopprijs_zien() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_mag_inkoopprijs_zien() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_mag_inkoopprijs_zien() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_mag_schrijven() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_mag_schrijven() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_mag_schrijven() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_mag_werkbon_uren_beheren(p_werkbon uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_mag_werkbon_uren_beheren(p_werkbon uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_mag_werkbon_uren_beheren(p_werkbon uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(p_company_id uuid, p_doel_tier text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(p_doel_tier text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(p_company_id uuid, p_doel_tier text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(p_doel_tier text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(p_company_id uuid, p_doel_tier text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_mag_wisselen(p_doel_tier text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_nieuwe_company_kostencategorieen() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_nieuwe_company_kostencategorieen() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_nieuwe_company_kostencategorieen() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_nieuwe_looptijd(p_company_id uuid, p_doel_tier text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_nieuwe_looptijd(p_company_id uuid, p_doel_tier text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_nieuwe_looptijd(p_company_id uuid, p_doel_tier text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_offerte_telt_mee(p_company_id uuid, p_nummer text, p_customer_id uuid, p_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_offerte_telt_mee(p_company_id uuid, p_nummer text, p_customer_id uuid, p_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_offerte_telt_mee(p_company_id uuid, p_nummer text, p_customer_id uuid, p_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_offertetotalen_bij_regel() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_offertetotalen_bij_regel() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_offertetotalen_bij_regel() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_offertetotalen_forceren() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_offertetotalen_forceren() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_offertetotalen_forceren() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_offertetotalen(p_offerte_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_open_website_aanvraag(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_opzegbaar_per(p_company_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_opzegbaar_per(p_company_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_opzegbaar_per(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_periode_start() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_periode_start(p_company_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_periode_start() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_periode_start(p_company_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_periode_start() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_periode_start(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_plan_geconfigureerd() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_plan_geconfigureerd(p_company_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_plan_geconfigureerd() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_plan_geconfigureerd(p_company_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_plan_geconfigureerd() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_plan_geconfigureerd(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_readonly_reden(p_company_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_readonly_reden() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_readonly_reden() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_readonly_reden(p_company_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_readonly_reden(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_readonly_reden() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_registreer_welkomstactie(p_company_id uuid, p_actie text, p_interval text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_seed_trial_subscription() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_seed_trial_subscription() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_seed_trial_subscription() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_set_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_set_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_set_updated_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_set_upgrade_request_author() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_set_upgrade_request_author() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_set_upgrade_request_author() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_stripe_sync_modules(p_company_id uuid, p_modules jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_stripe_sync_schedule(p_subscription_id text, p_schedule_id text, p_verplichting_tot timestamp with time zone, p_stopt_na boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_stripe_sync_stopdatum(p_subscription_id text, p_stopt_op timestamp with time zone) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_stripe_sync_subscription(p_company_id uuid, p_subscription_id text, p_customer_id text, p_plan text, p_stripe_status text, p_price_id text, p_extra_gebruikers integer, p_interval text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_cancel_at_end boolean, p_bind boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_trial_mail_kandidaten(p_vandaag date) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_trial_mail_verstuurd(p_company_id uuid, p_mail smallint, p_message_id text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_usage(p_key text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_usage(p_company_id uuid, p_key text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_usage(p_key text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_usage(p_company_id uuid, p_key text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_usage(p_key text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_usage(p_company_id uuid, p_key text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_welkomstactie_onwijzigbaar() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_welkomstactie_onwijzigbaar() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_welkomstactie_onwijzigbaar() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_werkbon_nummer() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_werkbon_nummer() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_werkbon_nummer() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_werkbon_op_slot() TO anon;

GRANT EXECUTE ON FUNCTION public.bb_werkbon_op_slot() TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_werkbon_op_slot() TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_within_limit(p_key text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_within_limit(p_company_id uuid, p_key text) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_within_limit(p_key text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_within_limit(p_company_id uuid, p_key text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_within_limit(p_company_id uuid, p_key text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_within_limit(p_key text) TO service_role;

GRANT EXECUTE ON FUNCTION public.bb_zet_standaard_kostencategorieen(p_company uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.bb_zet_standaard_kostencategorieen(p_company uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bb_zet_standaard_kostencategorieen(p_company uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.cancel_company_account() TO anon;

GRANT EXECUTE ON FUNCTION public.cancel_company_account() TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_company_account() TO service_role;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO anon;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO service_role;

GRANT EXECUTE ON FUNCTION public.current_user_company_id() TO anon;

GRANT EXECUTE ON FUNCTION public.current_user_company_id() TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_company_id() TO service_role;

GRANT EXECUTE ON FUNCTION public.delete_own_account() TO anon;

GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_own_account() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_accounting_status() TO anon;

GRANT EXECUTE ON FUNCTION public.get_accounting_status() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_accounting_status() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(p_email text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_billing_status() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_billing_status() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_company_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_company_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_company_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_company_by_werkbon_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_company_by_werkbon_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_company_by_werkbon_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_company_tier() TO anon;

GRANT EXECUTE ON FUNCTION public.get_company_tier() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_company_tier() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_customer_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_customer_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_customer_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_customer_by_werkbon_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_customer_by_werkbon_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_customer_by_werkbon_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_invite_company_for_current_user() TO anon;

GRANT EXECUTE ON FUNCTION public.get_invite_company_for_current_user() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_invite_company_for_current_user() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_moneybird_sync_targets() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_offerte_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_offerte_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_offerte_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_offerte_items_by_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_offerte_items_by_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_offerte_items_by_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_payment_branding(p_token text) TO anon;

GRANT EXECUTE ON FUNCTION public.get_payment_branding(p_token text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_payment_branding(p_token text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_plan_status() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_plan_status() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_snelstart_sync_targets() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_website_aanvragen() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_website_aanvragen() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_werkbon_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_werkbon_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_werkbon_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_werkbon_fotos_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_werkbon_fotos_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_werkbon_fotos_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_werkbon_materialen_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_werkbon_materialen_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_werkbon_materialen_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_werkbon_notities_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_werkbon_notities_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_werkbon_notities_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_werkbon_taken_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_werkbon_taken_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_werkbon_taken_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_werkbon_uitvoerders_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_werkbon_uitvoerders_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_werkbon_uitvoerders_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_werkbon_uren_by_sign_token(p_token uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_werkbon_uren_by_sign_token(p_token uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_werkbon_uren_by_sign_token(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.google_calendar_disconnect() TO authenticated;

GRANT EXECUTE ON FUNCTION public.google_calendar_disconnect() TO service_role;

GRANT EXECUTE ON FUNCTION public.google_calendar_status() TO authenticated;

GRANT EXECUTE ON FUNCTION public.google_calendar_status() TO service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

GRANT EXECUTE ON FUNCTION public.leveranciers_touch_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.leveranciers_touch_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.leveranciers_touch_updated_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.mark_factuur_betaald(p_factuur_id uuid, p_betaald_op date, p_stripe_status text, p_stripe_intent text, p_expected_company_id uuid, p_expected_amount_cents bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.mark_factuur_betaald(p_factuur_id uuid, p_betaald_op date, p_stripe_status text, p_stripe_intent text, p_expected_company_id uuid, p_expected_amount_cents bigint) TO service_role;

GRANT EXECUTE ON FUNCTION public.materiaal_inkoop_aanmaken() TO anon;

GRANT EXECUTE ON FUNCTION public.materiaal_inkoop_aanmaken() TO authenticated;

GRANT EXECUTE ON FUNCTION public.materiaal_inkoop_aanmaken() TO service_role;

GRANT EXECUTE ON FUNCTION public.materialen_touch_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.materialen_touch_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.materialen_touch_updated_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.protect_profile_privileges() TO anon;

GRANT EXECUTE ON FUNCTION public.protect_profile_privileges() TO authenticated;

GRANT EXECUTE ON FUNCTION public.protect_profile_privileges() TO service_role;

GRANT EXECUTE ON FUNCTION public.provision_account(p_company_name text, p_full_name text, p_email text, p_phone text, p_kvk text) TO anon;

GRANT EXECUTE ON FUNCTION public.provision_account(p_company_name text, p_full_name text, p_email text, p_phone text, p_kvk text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.provision_account(p_company_name text, p_full_name text, p_email text, p_phone text, p_kvk text) TO service_role;

GRANT EXECUTE ON FUNCTION public.save_accounting_connection(p_provider text, p_secret text, p_administration_id text, p_afas_environment_id text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.save_accounting_connection(p_provider text, p_secret text, p_administration_id text, p_afas_environment_id text) TO service_role;

GRANT EXECUTE ON FUNCTION public.seed_default_email_templates(p_company_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.seed_default_lost_reasons(p_company uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.seed_default_lost_reasons(p_company uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.seed_default_lost_reasons(p_company uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.seed_default_pipeline_stages(p_company uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.seed_default_pipeline_stages(p_company uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.seed_default_pipeline_stages(p_company uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_deal_stage_to_afgerond() TO anon;

GRANT EXECUTE ON FUNCTION public.sync_deal_stage_to_afgerond() TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_deal_stage_to_afgerond() TO service_role;

GRANT EXECUTE ON FUNCTION public.trg_seed_lost_reasons() TO anon;

GRANT EXECUTE ON FUNCTION public.trg_seed_lost_reasons() TO authenticated;

GRANT EXECUTE ON FUNCTION public.trg_seed_lost_reasons() TO service_role;

GRANT EXECUTE ON FUNCTION public.trg_seed_pipeline_stages() TO anon;

GRANT EXECUTE ON FUNCTION public.trg_seed_pipeline_stages() TO authenticated;

GRANT EXECUTE ON FUNCTION public.trg_seed_pipeline_stages() TO service_role;

GRANT EXECUTE ON FUNCTION public.wm_inkoop_aanmaken() TO anon;

GRANT EXECUTE ON FUNCTION public.wm_inkoop_aanmaken() TO authenticated;

GRANT EXECUTE ON FUNCTION public.wm_inkoop_aanmaken() TO service_role;


-- ============================================================================
-- EINDE BASELINE
-- ============================================================================
