-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De opschooncron (20260930160803) is gepauzeerd op verzoek van de eigenaren
-- (30-09-2026): de bewaartermijnen die hij toepast (bedrijven 2 jaar na het
-- einde van het abonnement, contactformulier 1 jaar, Boss-gesprekken 12
-- maanden, meldpunt 2 jaar) zijn nog niet vastgesteld.
--
-- Het opruimen van verlopen resettokens en aanmeldcodes (24 uur) zit in
-- dezelfde taak: de cron roept één keer de edge function `opschonen` aan, en
-- die voert alle termijnen in één run uit (bb_opschoning_termijnen). Dat is
-- niet los uit te zetten zonder nieuwe code, dus de hele taak staat stil.
-- Gevolg: verlopen tokens en codes blijven voorlopig staan. Ze zijn gehasht en
-- verlopen (onbruikbaar); request-password-reset ruimt bij een nieuwe aanvraag
-- de verlopen en gebruikte tokens van die gebruiker zelf op.
--
-- Er verandert niets aan termijnen, functies of gegevens. Weer aanzetten:
--   select cron.alter_job(job_id := jobid, active := true)
--     from cron.job where jobname = 'opschonen-daily';
-- (als migratie, zodat productie en repository blijven overeenkomen).

begin;

select cron.alter_job(job_id := j.jobid, active := false)
  from cron.job j
 where j.jobname = 'opschonen-daily';

select jobname, schedule, active from cron.job where jobname = 'opschonen-daily';

commit;
