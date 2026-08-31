-- Sjabloon voor een nieuwe migratie. Kopieer dit bestand naar
-- YYYYMMDDHHMMSS_korte_naam.sql en schrijf je wijziging eronder.
--
-- Bestandsnaam begint met een timestamp; `supabase db push` draait ze op
-- volgorde en houdt bij wat al gedraaid is.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Leg hier vast wat er verandert en vooral wáárom. De SQL zegt wat er gebeurt;
-- dit commentaar moet zeggen waarom het nodig was, wat er misging zonder, en
-- welke afweging erachter zit. Dat is het enige stuk dat je over een half jaar
-- nog nodig hebt.
--
-- Raakt de migratie bestaande data? Noteer dan wat je gemeten hebt vóór het
-- draaien: hoeveel rijen, welke waarden, en wat er met ze gebeurt.


-- ── De wijziging ────────────────────────────────────────────────────────────



-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN, ook als je denkt dat het niet nodig is.
--
-- PostgREST houdt een schema-cache. Staat een nieuwe tabel of kolom daar nog
-- niet in, dan geeft de REST-API een 404 of 400 op iets dat wél bestaat — en dat
-- leest als een bug in de app terwijl er niets mis is.
--
-- Supabase heeft hiervoor de event trigger `pgrst_ddl_watch`, en die staat aan.
-- Twee redenen om deze regel er tóch bij te zetten:
--
--   1. Die trigger luistert op een LIJST commando's waar CREATE POLICY, GRANT en
--      REVOKE NIET in staan. PostgREST leest rechten wél mee in zijn cache, dus
--      een migratie die alleen rechten wijzigt kan een verouderde cache
--      achterlaten.
--   2. Het is een NOTIFY zonder kosten. Twee keer versturen is niet erger dan
--      één keer, en de keer dat je hem nodig hebt kost het zoeken.
--
-- LET OP — dit is géén garantie. Beide notifies vertrekken bij dezelfde commit.
-- Hoort PostgREST ze op dat moment niet (verbroken listener, herstartende
-- instantie), dan blijft de cache oud, en dan helpt alleen een LATERE notify.
-- Controleer daarom na het pushen of de API de wijziging kent:
--
--     npm run migratie:check -- <tabelnaam>
--
-- Dat script probeert de tabel via de REST-API en stuurt zo nodig opnieuw een
-- notify. Zie CLAUDE.md, kopje "Database en migraties".
notify pgrst, 'reload schema';
