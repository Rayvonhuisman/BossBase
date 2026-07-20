-- =============================================================================
-- ⚠️ ACHTERHAALD / SUPERSEDED — NIET MEER GEBRUIKEN
-- Vervangen door: 20260718094500_moneybird_crons_scoped.sql
--
-- Deze migratie zette de service-role key (uit Vault: edge_cron_service_key) als
-- bearer in de cron-plumbing. Die aanpak is bewust verlaten: een brede service-
-- role sleutel die langs alle RLS kan, hoort niet in de cron-plumbing.
--
-- De opvolger (20260718094500) herschrijft dezelfde 3 cron-jobs naar:
--   * anon-JWT (edge_cron_key) als bearer — passeert enkel de gateway;
--   * een smalle cron_secret (edge_cron_secret) in de body die alleen de
--     scheduled-modus ontgrendelt (geen DB-toegang, geen service-role);
--   * token-lees via de afgebakende SECURITY DEFINER-functie
--     get_moneybird_sync_targets() (alleen service_role).
--
-- Bij een db reset/replay draait deze migratie eerst, maar 20260718094500 (die
-- later loopt) overschrijft de 3 cron-jobs meteen — de eindtoestand is dus de
-- least-privilege variant. De secret edge_cron_service_key is niet nodig en
-- wordt (in de opvolger) niet aangemaakt. Laat dit bestand ongewijzigd staan als
-- historische migratie; pas de opvolger aan, niet dit bestand.
-- =============================================================================

-- =============================================================================
-- BossBase: Moneybird cron-jobs herschikken naar het scheduled/service-role pad
-- Bestand : supabase/migrations/20260714180000_moneybird_scheduled_crons.sql
-- Status  : ACHTERHAALD (zie banner hierboven).
--
-- Achtergrond:
--   De moneybird-functies (btw, import-kosten, sync-contacten) valideerden een
--   echte gebruikers-JWT (auth.getUser + profiles.company_id) en konden dus niet
--   vanuit pg_cron draaien (401). De functies zijn aangepast met een tweede modus:
--   een aanroep met de SERVICE-ROLE key loopt over ALLE bedrijven met een actieve
--   Moneybird-connectie (zie supabase/functions/_shared/scheduledSync.ts).
--
--   Deze migratie zet de 3 crons om naar:
--     * hardcoded functions-URL (publiek);
--     * Authorization = service-role key uit Vault (secret `edge_cron_service_key`);
--     * rustigere frequenties i.v.m. Moneybird rate-limits.
--
-- VEREISTEN vóór/bij toepassen (anders faalt de run):
--   1) Zet de service-role key in Vault als `edge_cron_service_key` (eenmalig):
--        select vault.create_secret(
--          '<SERVICE_ROLE_KEY>',
--          'edge_cron_service_key',
--          'Service-role key voor pg_cron -> privileged all-company sync (moneybird)'
--        );
--      (Bestaat hij al? Dan:
--        select vault.update_secret(
--          (select id from vault.secrets where name='edge_cron_service_key'),
--          '<SERVICE_ROLE_KEY>'
--        ); )
--   2) Deploy de 3 aangepaste edge functions (moneybird-sync-btw,
--      moneybird-import-kosten, moneybird-sync-contacten) VÓÓR deze migratie,
--      anders roept de cron nog de oude (user-only) versie aan.
--
-- Frequenties: BTW-sync dagelijks (06:00 UTC); kosten elk uur (:00); contacten
-- elk uur (:30, gespreid t.o.v. kosten). Idempotent: eerst unschedule, dan schedule.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── moneybird-sync-btw: dagelijks 06:00 UTC ─────────────────────────────────
select cron.unschedule('moneybird-sync-btw-daily')
where exists (select 1 from cron.job where jobname = 'moneybird-sync-btw-daily');

select cron.schedule(
  'moneybird-sync-btw-daily',
  '0 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/moneybird-sync-btw',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_service_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $cron$
);

-- ── moneybird-sync-kosten: elk uur op :00 ───────────────────────────────────
select cron.unschedule('moneybird-sync-kosten')
where exists (select 1 from cron.job where jobname = 'moneybird-sync-kosten');

select cron.schedule(
  'moneybird-sync-kosten',
  '0 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/moneybird-import-kosten',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_service_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $cron$
);

-- ── moneybird-sync-contacten: elk uur op :30 (gespreid t.o.v. kosten) ────────
select cron.unschedule('moneybird-sync-contacten')
where exists (select 1 from cron.job where jobname = 'moneybird-sync-contacten');

select cron.schedule(
  'moneybird-sync-contacten',
  '30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/moneybird-sync-contacten',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_service_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $cron$
);
