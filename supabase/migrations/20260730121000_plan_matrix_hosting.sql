-- =============================================================================
-- 20260730121000_plan_matrix_hosting.sql
--
-- Herseed van de feature-/limietmatrix. Wijziging: de module "hosting" (€5) is
-- toegevoegd, en modulebeschikbaarheid is voortaan PER MODULE geregeld
-- (features.js → beschikbaarBij) in plaats van één lijst tiers voor alle
-- modules. Hosting is een dienst, geen feature-gate, en daarom óók bij Team bij
-- te kopen; stripe/planning/voertuigen blijven alleen bij Groei te koop omdat
-- Team ze al inbegrepen heeft.
--
-- GEGENEREERD met `node scripts/gen-plan-matrix.mjs` uit src/lib/features.js.
-- Niet met de hand bewerken.
-- =============================================================================

BEGIN;

DELETE FROM public.plan_feature_defs;
INSERT INTO public.plan_feature_defs (feature, label, uitleg, intern) VALUES
  ('crm_pipeline', 'CRM & pipeline', 'Verkooppijplijn met deals en leads.', false),
  ('klanten', 'Klanten', 'Klantenbeheer en klantkaart.', false),
  ('leads', 'Leads', 'Binnenkomende aanvragen als lead in de pipeline.', false),
  ('offertes', 'Offertes', 'Offertes opstellen, versturen en opvolgen.', false),
  ('facturen', 'Facturen', 'Facturen aanmaken, versturen en betaalstatus volgen.', false),
  ('werkbonnen', 'Werkbonnen', 'Werkbonnen met taken, materialen en foto’s.', false),
  ('uren', 'Urenregistratie', 'Uren schrijven per project of werkbon.', false),
  ('agenda', 'Agenda', 'Afspraken en ingeplande werkbonnen.', false),
  ('adres_autocomplete', 'Adres-autocomplete', 'Adressen automatisch aanvullen via PDOK.', false),
  ('afspraakherinnering', 'Afspraakherinnering', 'Automatische herinnering voor afspraken.', false),
  ('email_templates_bewerken', 'E-mailtemplates bewerken', 'De standaard e-mailtemplates aanpassen.', false),
  ('digitale_handtekening', 'Digitale handtekening', 'Offertes online laten ondertekenen door de klant.', false),
  ('betaalherinneringen', 'Automatische betaalherinneringen', 'Herinneringen bij openstaande facturen.', false),
  ('boekhoudkoppeling', 'Boekhoudkoppeling', 'Koppeling met Moneybird, SnelStart of AFAS.', false),
  ('btw_overzicht', 'BTW-overzicht', 'BTW per periode uit de boekhoudkoppeling.', false),
  ('kosten_nacalculatie', 'Kosten & nacalculatie', 'Kosten registreren en marge per project bewaken.', false),
  ('eigen_email_templates', 'Eigen e-mailtemplates', 'Zelf nieuwe e-mailtemplates aanmaken.', false),
  ('rollen_rechten', 'Rollen & rechten', 'Per teamlid instellen wat hij mag zien en doen.', false),
  ('planning', 'Planningsmodule', 'Weekplanning met drag & drop op medewerker en voertuig.', false),
  ('stripe_betaallink', 'Stripe betaallink', 'iDEAL-betaalknop op je facturen via Stripe.', false),
  ('voertuigen', 'Voertuigen', 'Voertuigen beheren en inplannen in de planning.', false),
  ('hosting', 'Website-hosting', 'Wij draaien en onderhouden je bedrijfswebsite.', false),
  ('gedeelde_werkruimte', 'Gedeelde werkruimte', 'Iedereen ziet elkaars agenda, projecten en werkbonnen zonder rechtenbeheer. Past bij een bedrijf van één of twee personen.', true);

DELETE FROM public.plan_features;
INSERT INTO public.plan_features (plan, feature) VALUES
  ('starter', 'crm_pipeline'),
  ('starter', 'klanten'),
  ('starter', 'leads'),
  ('starter', 'offertes'),
  ('starter', 'facturen'),
  ('starter', 'werkbonnen'),
  ('starter', 'uren'),
  ('starter', 'agenda'),
  ('starter', 'adres_autocomplete'),
  ('starter', 'afspraakherinnering'),
  ('starter', 'email_templates_bewerken'),
  ('groei', 'crm_pipeline'),
  ('groei', 'klanten'),
  ('groei', 'leads'),
  ('groei', 'offertes'),
  ('groei', 'facturen'),
  ('groei', 'werkbonnen'),
  ('groei', 'uren'),
  ('groei', 'agenda'),
  ('groei', 'adres_autocomplete'),
  ('groei', 'afspraakherinnering'),
  ('groei', 'email_templates_bewerken'),
  ('groei', 'digitale_handtekening'),
  ('groei', 'betaalherinneringen'),
  ('groei', 'boekhoudkoppeling'),
  ('groei', 'btw_overzicht'),
  ('groei', 'kosten_nacalculatie'),
  ('groei', 'eigen_email_templates'),
  ('groei', 'gedeelde_werkruimte'),
  ('team', 'crm_pipeline'),
  ('team', 'klanten'),
  ('team', 'leads'),
  ('team', 'offertes'),
  ('team', 'facturen'),
  ('team', 'werkbonnen'),
  ('team', 'uren'),
  ('team', 'agenda'),
  ('team', 'adres_autocomplete'),
  ('team', 'afspraakherinnering'),
  ('team', 'email_templates_bewerken'),
  ('team', 'digitale_handtekening'),
  ('team', 'betaalherinneringen'),
  ('team', 'boekhoudkoppeling'),
  ('team', 'btw_overzicht'),
  ('team', 'kosten_nacalculatie'),
  ('team', 'eigen_email_templates'),
  ('team', 'rollen_rechten'),
  ('team', 'planning'),
  ('team', 'stripe_betaallink'),
  ('team', 'voertuigen');

DELETE FROM public.plan_limits;
INSERT INTO public.plan_limits (plan, limit_key, limit_value, telwijze) VALUES
  ('starter', 'gebruikers', 1, 'voorraad'),
  ('starter', 'klanten', 100, 'voorraad'),
  ('starter', 'offertes', 20, 'periode'),
  ('starter', 'facturen', 20, 'periode'),
  ('groei', 'gebruikers', 2, 'voorraad'),
  ('groei', 'klanten', NULL, 'voorraad'),
  ('groei', 'offertes', NULL, 'periode'),
  ('groei', 'facturen', NULL, 'periode'),
  ('team', 'gebruikers', NULL, 'voorraad'),
  ('team', 'klanten', NULL, 'voorraad'),
  ('team', 'offertes', NULL, 'periode'),
  ('team', 'facturen', NULL, 'periode');

DELETE FROM public.plan_modules;
INSERT INTO public.plan_modules (module_key, label, feature, price, vereist) VALUES
  ('stripe_betaallink', 'Stripe betaallink', 'stripe_betaallink', 10, NULL),
  ('planning', 'Planningsmodule', 'planning', 10, NULL),
  ('voertuigen', 'Voertuigen', 'voertuigen', 5, 'planning'),
  ('hosting', 'Website-hosting', 'hosting', 5, NULL);

DELETE FROM public.plan_module_tiers;
INSERT INTO public.plan_module_tiers (plan, module_key) VALUES
  ('groei', 'stripe_betaallink'),
  ('groei', 'planning'),
  ('groei', 'voertuigen'),
  ('groei', 'hosting'),
  ('team', 'hosting');

COMMIT;
