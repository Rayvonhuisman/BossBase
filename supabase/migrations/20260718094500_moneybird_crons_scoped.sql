-- =============================================================================
-- BossBase: Moneybird crons — least-privilege trigger (Optie A)
-- Bestand : supabase/migrations/20260718094500_moneybird_crons_scoped.sql
-- Status  : TER REVIEW — nog NIET toepassen (owner zet eerst de 2 secrets).
--
-- Vervangt de eerdere "service-role key als bearer"-aanpak (20260714180000).
-- Er gaat GEEN service-role key meer door de cron-plumbing. De cron stuurt nu:
--   * Authorization: Bearer <anon-JWT edge_cron_key>  → passeert alleen de
--     API-gateway (verify_jwt), geeft zelf geen RLS-bypass.
--   * body.cron_secret = <edge_cron_secret uit Vault>  → smalle, high-entropy
--     secret die ALLEEN de scheduled-modus in de functie ontgrendelt; op zichzelf
--     geen enkele DB-toegang. Los roteerbaar, GEEN service-role.
--
-- De functies gebruiken hun eigen env-service-role voor de writes (onvermijdelijk
-- voor een cross-company backend-job op RLS-tabellen; zelfde patroon als
-- check-herinneringen). De gevoelige token-lees loopt via de afgebakende functie
-- get_moneybird_sync_targets() hieronder (alleen service_role mag die aanroepen).
--
-- ROLLOUT-VOLGORDE (anders 401 / oude code):
--   1) Function-secret zetten:
--        supabase secrets set CRON_SECRET=<high-entropy waarde>
--   2) Dezelfde waarde in Vault zetten (leest de cron):
--        select vault.create_secret(
--          '<zelfde high-entropy waarde>',
--          'edge_cron_secret',
--          'Cron-secret dat de moneybird scheduled-modus ontgrendelt (geen service-role)'
--        );
--      (Bestaat hij al? Dan:
--        select vault.update_secret(
--          (select id from vault.secrets where name='edge_cron_secret'),
--          '<zelfde high-entropy waarde>'
--        ); )
--   3) De 3 aangepaste edge functions deployen (moneybird-sync-btw,
--      moneybird-import-kosten, moneybird-sync-contacten) VÓÓR deze migratie.
--   4) Deze migratie toepassen.
--
-- De secret `edge_cron_service_key` is NIET nodig en wordt bewust niet aangemaakt.
-- Idempotent: functie is CREATE OR REPLACE; crons eerst unschedule, dan schedule.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Afgebakende bron van sync-doelen ────────────────────────────────────────
-- Geeft UITSLUITEND de minimale gegevens terug van bedrijven met een ACTIEVE
-- Moneybird-koppeling. SECURITY DEFINER zodat de service-role-aanroep binnen de
-- edge-functie hier langs mag, maar bewust NIET aan anon/authenticated gegund
-- (returnt geheime API-tokens). Klein en doelgericht — één verantwoordelijkheid,
-- in lijn met get_company_tier() / bb_has_permission().
create or replace function public.get_moneybird_sync_targets()
returns table (company_id uuid, api_token text, administration_id text)
language sql
stable
security definer
set search_path = public
as $$
  select ac.company_id, ac.api_token, ac.administration_id
  from accounting_connections ac
  where ac.provider = 'moneybird'
    and ac.is_connected = true
    and ac.api_token is not null
    and ac.administration_id is not null
$$;

comment on function public.get_moneybird_sync_targets() is
  'Minimale sync-doelen (company_id, api_token, administration_id) voor bedrijven met een actieve Moneybird-koppeling. Alleen service_role mag dit aanroepen — nooit anon/authenticated (bevat geheime tokens).';

revoke all     on function public.get_moneybird_sync_targets() from public;
revoke execute on function public.get_moneybird_sync_targets() from anon, authenticated;
grant  execute on function public.get_moneybird_sync_targets() to service_role;

-- ── Crons herschrijven: anon-bearer aan de gateway + cron_secret in de body ──
-- Frequenties: BTW dagelijks (06:00 UTC); kosten elk uur (:00); contacten elk
-- uur (:30, gespreid t.o.v. kosten) — rustig i.v.m. Moneybird rate-limits.

-- moneybird-sync-btw: dagelijks 06:00 UTC
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
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object(
      'scheduled', true,
      'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')
    )
  );
  $cron$
);

-- moneybird-import-kosten: elk uur op :00
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
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object(
      'scheduled', true,
      'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')
    )
  );
  $cron$
);

-- moneybird-sync-contacten: elk uur op :30
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
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object(
      'scheduled', true,
      'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')
    )
  );
  $cron$
);
