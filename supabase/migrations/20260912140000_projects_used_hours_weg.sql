-- projects.used_hours weg.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Deze kolom was een cache van "hoeveel uur is er op dit project geboekt". Sinds
-- uren op de werkbon staan (tabel werkbon_uren) wordt hij nergens meer
-- bijgewerkt, en de waarden zijn dan ook nergens meer waar:
--
--   Dakrenovatie schuin dak   used_hours = 72,00   werkelijk = 15,75
--   Kozijnen vervangen        used_hours = 46,00   werkelijk =  0
--   Schilderwerk woning       used_hours = 58,00   werkelijk =  0
--   Badkamer renovatie        used_hours = 30,00   werkelijk =  0
--
-- Wat de app toont klopt wél: projectsService berekent het aantal uren live uit
-- werkbon_uren via de werkbon→project-koppeling. De kolom werd alleen nog in de
-- mapper ingelezen (als `usedHoursCached`) en door geen enkel scherm gebruikt.
--
-- Daarom weg en niet leeggemaakt: een lege kolom nodigt uit om hem weer te
-- vullen, en dan staat er over een half jaar opnieuw een tweede waarheid naast
-- de echte. Wie het aantal uren wil, leest werkbon_uren.
--
-- ── Terug draaien ───────────────────────────────────────────────────────────
-- Mocht dit onverhoopt iets breken, dan is de kolom zo terug:
--   alter table public.projects add column used_hours numeric default 0;
-- De oude waarden komen niet terug, en dat is precies de bedoeling — ze waren
-- fout.

alter table public.projects drop column if exists used_hours;

notify pgrst, 'reload schema';
