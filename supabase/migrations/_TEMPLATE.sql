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



-- ── Maak je een TABEL aan? ──────────────────────────────────────────────────
-- Migraties draaien als `postgres`, en daarvoor staan de default privileges zo
-- ingesteld dat een nieuwe tabel géén TRUNCATE meer aan anon/authenticated geeft
-- (migratie 20260902140000). Je hoeft daar dus niets voor te doen.
--
-- Maak je een tabel via het Supabase-dashboard, dan komt hij van `supabase_admin`
-- en gelden díéns default privileges — daar kunnen wij niet bij. Doe de revoke er
-- dan zelf bij:
--
--     revoke truncate on table public.nieuwe_tabel from anon, authenticated;
--
-- Waarom dat uitmaakt: RLS kijkt niet naar TRUNCATE. Dat is geen rij-operatie
-- maar een tabel-operatie, dus een policy houdt hem niet tegen.


-- ── Maak je een FUNCTIE aan? Zet dan zelf de rechten ────────────────────────
-- Supabase heeft default privileges die EXECUTE op een NIEUWE functie
-- automatisch aan anon en authenticated geven. `revoke all ... from public`
-- haalt die er NIET af: dat zijn expliciete rolgrants, en PUBLIC is iets anders
-- dan een rol. Noem anon en authenticated dus met naam:
--
--     revoke all on function public.mijn_functie(uuid) from public, anon, authenticated;
--     grant execute on function public.mijn_functie(uuid) to service_role;
--
-- Let vooral op wanneer een `create or replace` een DROP-AND-CREATE wordt — bij
-- een tabelfunctie waarvan het retourtype wijzigt kan het niet anders (SQLSTATE
-- 42P13), en dan zijn de oude, strengere grants weg. Zo stond een functie die de
-- boekhoudsleutel van álle bedrijven teruggeeft bijna open voor elke ingelogde
-- gebruiker; een droogloop ving het net op tijd.
--
-- Controleer het achteraf, met has_function_privilege — niet op je geheugen.
-- Zie CLAUDE.md, "Een functie aanmaken: altijd zelf de rechten zetten".



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
