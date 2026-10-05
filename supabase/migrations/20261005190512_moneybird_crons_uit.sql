-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit M35: de drie Moneybird-crons (kosten elk uur, contacten elk uur, btw
-- elke ochtend) stonden aan maar verwerkten nul bedrijven. Ze vragen hun doelen
-- op bij get_moneybird_sync_targets(), en die eist is_connected = true — een
-- vinkje dat voor Moneybird nergens wordt gezet.
--
-- De klaarliggende reparatie (20260828170000_moneybird_sync_targets_fix.sql.pending)
-- rollen we bewust níét uit: die zou de oude import elk uur laten draaien, met
-- alle gebreken die het onderzoek van 2026-10-05 vond (alleen de eerste 100
-- records, creditfacturen die de import afbreken, geen prullenbak). De
-- Moneybird-koppeling wordt opnieuw gebouwd op het SnelStart-model en krijgt
-- dan een eigen nachtelijke run. Tot die tijd: handmatig synchroniseren, en de
-- teksten in de app, bij Boss en op de site zeggen dat ook.
--
-- Gemeten vóór het draaien (2026-10-05): drie jobs, alle drie active = true;
-- één Moneybird-koppeling (BossBase Admin, intern), is_connected = false. Geen
-- klant geraakt.
--
-- Unschedule op naam en alleen als de job bestaat, zodat de migratie ook slaagt
-- op een database waar ze al weg zijn.


-- ── De wijziging ────────────────────────────────────────────────────────────
do $$
declare
  j text;
begin
  foreach j in array array['moneybird-sync-kosten', 'moneybird-sync-contacten', 'moneybird-sync-btw-daily'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end
$$;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Geen schemawijziging, maar de regel blijft staan (zie _TEMPLATE.sql).
notify pgrst, 'reload schema';
