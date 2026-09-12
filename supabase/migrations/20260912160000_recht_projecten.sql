-- Nieuw recht 'projecten' — bestaande medewerkers houden hun toegang.
--
-- ── Waarom deze migratie ────────────────────────────────────────────────────
-- De Projecten-pagina had als enige in zijn rij géén recht: Offertes, Facturen
-- en Kosten hebben er wel een. Vanaf nu vraagt hij om het recht 'projecten'.
--
-- Het probleem dat dat oplevert: can() geeft alleen true als de key letterlijk
-- in user_permissions staat, en nieuwe medewerkers beginnen met een lege lijst
-- (DEFAULT_MEDEWERKER_PERMISSIONS = []). Zonder deze migratie zou iedereen die
-- vandaag Projecten kan openen dat na de uitrol niet meer kunnen — ook zijn
-- eigen projecten niet. Dat is geen aanscherping maar een storing.
--
-- Daarom: iedereen die er nu bij kan, houdt het recht. Wie het niet moet
-- hebben, zet je daarna uit bij Team; dat is zichtbaar en omkeerbaar. Andersom
-- (iedereen eruit en dan weer aanzetten) merkt niemand tot hij ergens niet meer
-- bij kan.
--
-- Admins staan er bewust niet in: can() geeft voor een admin altijd true, los
-- van user_permissions.
--
-- ── Wat dit recht NIET regelt ───────────────────────────────────────────────
-- Welke projecten iemand ziet, staat al in de RLS op public.projects: zonder
-- 'alles_inzien' alleen de projecten waaraan hij is toegewezen of waarvan hij
-- een werkbon heeft. Bewerken vraagt 'projecten_bewerken', verwijderen is
-- admin-only. Dit recht gaat puur over de deur naar de pagina.

insert into public.user_permissions (company_id, user_id, permission, granted)
select p.company_id, p.id, 'projecten', true
from public.profiles p
where p.role is distinct from 'admin'
on conflict do nothing;

notify pgrst, 'reload schema';
