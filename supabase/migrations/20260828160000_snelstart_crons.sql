-- SnelStart: dagelijkse automatische synchronisatie.
--
-- Er was tot nu toe géén enkele SnelStart-cron; synchroniseren gebeurde alleen
-- als iemand op de knop drukte. Zodra de koppeling actief is hoort dat vanzelf
-- te gaan.
--
-- Zelfde patroon als de Moneybird-crons (20260718094500): GEEN service-role key
-- in de cron-plumbing, maar
--   * Authorization: Bearer <anon-JWT edge_cron_key>  → passeert de gateway,
--   * body.cron_secret = <edge_cron_secret uit Vault> → ontgrendelt de
--     scheduled-modus in de functie.
-- Beide secrets staan al in de Vault en CRON_SECRET staat al als function-secret;
-- er hoeft dus niets nieuws gezet te worden.
--
-- TIJDSTIP — 03:00 en 03:20 UTC, dus 05:00/05:20 zomertijd en 04:00/04:20
-- wintertijd. Ruim buiten kantooruren, zodat niemand tegen een half doorgevoerde
-- boeking aankijkt, en 's ochtends is de administratie bij. Bewust NIET 06:00
-- UTC: daar zit de Moneybird-btw-cron, en die twee moeten niet tegelijk op
-- dezelfde database en dezelfde API drukken.
--
-- VOLGORDE — contacten eerst, twintig minuten later de facturen en kosten. De
-- import kan een ontbrekende relatie zelf aanmaken, maar als klanten en
-- leveranciers er al staan hangen de boekingen meteen aan de juiste relatie in
-- plaats van aan een nieuw aangemaakte.
--
-- GEEN btw-cron: snelstart-sync-btw wordt nergens meer aangeroepen omdat de
-- scope btwaangiftes:read niet beschikbaar komt (zie de kop van die functie).
--
-- VOORWAARDE: deploy eerst snelstart-sync-contacten en snelstart-import-kosten,
-- anders roept de cron code aan die de runs nog niet vastlegt. En draai eerst
-- 20260828150000_accounting_sync_runs.sql, anders is er geen tabel om in te
-- schrijven (de functies slikken dat, maar dan legt de eerste nacht niets vast).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── snelstart-sync-contacten: dagelijks 03:00 UTC ───────────────────────────
select cron.unschedule('snelstart-sync-contacten-daily')
where exists (select 1 from cron.job where jobname = 'snelstart-sync-contacten-daily');

select cron.schedule(
  'snelstart-sync-contacten-daily',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/snelstart-sync-contacten',
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

-- ── snelstart-import-kosten: dagelijks 03:20 UTC ────────────────────────────
-- Facturen en kosten, beide richtingen. Kosten gaan per 50 tegelijk maar de
-- functie draait door zolang er restant is, tot haar eigen grens (500 posten of
-- 2 minuten per bedrijf).
select cron.unschedule('snelstart-sync-kosten-daily')
where exists (select 1 from cron.job where jobname = 'snelstart-sync-kosten-daily');

select cron.schedule(
  'snelstart-sync-kosten-daily',
  '20 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/snelstart-import-kosten',
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
