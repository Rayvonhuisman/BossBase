-- ── Waarom ──────────────────────────────────────────────────────────────────
-- LIVEGANG VAN DE NIEUWE SUPERADMIN. Gedraaid nadat de nieuwe frontend live
-- stond en de edge functions superadmin en website-beheer (met logboek)
-- gedeployed waren; de oude superadmin leunde op deze regels.
--
-- De oude superadmin schreef rechtstreeks in subscriptions, companies,
-- meldingen en platform_instellingen, via RLS-regels die elke ingelogde
-- superbeheerder alles gaven. Dat ging langs het logboek heen. Alles loopt nu
-- via de edge functions (service-role, met eisSuperbeheerder + metLog), dus
-- deze regels moeten weg: anders kan een superbeheerder buiten het logboek om
-- nog steeds abonnementen en bedrijven wijzigen.
--
-- Wat blijft: de gewone regels voor gebruikers van hun eigen bedrijf
-- (companies, company_modules_select, website_aanvragen_eigen,
-- platform_instellingen_lezen) en bb_alleen_actieve_gebruikers. Gecontroleerd
-- op 2026-10-08 met pg_policies: geen van deze tabellen heeft een andere regel
-- die van deze superbeheer-regels afhangt, en de app leest subscriptions,
-- meldingen, mail_fouten en snelstart_webhook_log niet rechtstreeks.

drop policy if exists super_admin_update_companies on public.companies;
drop policy if exists company_modules_super_admin on public.company_modules;
drop policy if exists mail_fouten_super_admin on public.mail_fouten;
drop policy if exists meldingen_super_admin on public.meldingen;
drop policy if exists platform_instellingen_super_admin on public.platform_instellingen;
drop policy if exists snelstart_webhook_log_super_admin on public.snelstart_webhook_log;
drop policy if exists super_admin_only on public.subscriptions;
drop policy if exists website_aanvragen_super_admin on public.website_aanvragen;
drop policy if exists meldingen_screenshots_super_admin on storage.objects;

notify pgrst, 'reload schema';

-- Uitkomst: er mag geen enkele regel meer op is_super_admin leunen.
select count(*) as resterende_superbeheer_regels
from pg_policies
where qual ilike '%is_super_admin%' or with_check ilike '%is_super_admin%';
