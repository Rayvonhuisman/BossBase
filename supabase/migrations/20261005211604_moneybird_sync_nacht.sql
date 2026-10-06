-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Stap 7 van de Moneybird-herbouw: de nachtelijke synchronisatie, op het model
-- van de SnelStart-crons (migratie 20260828160000): net.http_post met de
-- anon-sleutel uit de Vault als Bearer en het cron_secret uit de Vault in de
-- body. De functie herkent dat geheim (isScheduledCall) en loopt dan over alle
-- gekoppelde bedrijven via get_moneybird_sync_doelen() (alleen service-rol).
--
-- Waarom elke 20 minuten tussen 01:00 en 04:40 UTC (03:00–06:40 in de zomer)
-- en niet één keer per nacht zoals SnelStart: Moneybird staat 150 verzoeken per
-- 5 minuten toe, voor al onze klanten samen. Eén run kan daardoor niet een grote
-- eerste import van één bedrijf én alle andere bedrijven afhandelen. Elke run
-- werkt binnen een tijdsbudget, stopt netjes en de volgende gaat verder. Een
-- bedrijf dat helemaal bij is (volledig_gesynct_op) wordt de rest van de nacht
-- overgeslagen, dus een rustige nacht kost per bedrijf één ronde.
--
-- Vervangt de drie crons die in juli zijn gemaakt en sinds 20261005190512 uit
-- staan (audit M35).


-- ── De wijziging ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'moneybird-sync-nacht') then
    perform cron.unschedule('moneybird-sync-nacht');
  end if;
end
$$;

select cron.schedule(
  'moneybird-sync-nacht',
  '*/20 1-4 * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/moneybird-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object(
      'scheduled', true,
      'onderdeel', 'alles',
      'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')
    ),
    timeout_milliseconds := 150000
  );
  $cron$
);


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
