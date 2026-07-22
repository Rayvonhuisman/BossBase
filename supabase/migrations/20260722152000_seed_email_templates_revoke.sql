-- =============================================================================
-- BossBase: seed_default_email_templates niet meer publiek aanroepbaar
-- Bestand : supabase/migrations/20260722152000_seed_email_templates_revoke.sql
--
-- Probleem: seed_default_email_templates(uuid) is SECURITY DEFINER en stond met
-- EXECUTE open voor anon/authenticated/PUBLIC. Een gebruiker kon zo met een
-- vreemde company-UUID default e-mailtemplates in het bedrijf van iemand anders
-- laten aanmaken (cross-tenant schrijf-primitive; impact beperkt door
-- ON CONFLICT DO NOTHING, maar ongeautoriseerd).
--
-- De functie wordt uitsluitend intern aangeroepen vanuit provision_account (en
-- de provisioning-migratie), beide SECURITY DEFINER — die behouden EXECUTE als
-- owner. Daarom kunnen we anon/authenticated/PUBLIC veilig intrekken.
-- =============================================================================

revoke execute on function public.seed_default_email_templates(uuid) from public, anon, authenticated;
