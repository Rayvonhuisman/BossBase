-- Alleen de configuratie van de abonnementsmatrix (geen klantgegevens), nodig
-- voor bb_plan_geconfigureerd / bb_readonly_reden in de lokale omgeving.
select json_build_object(
  'plan_limits',       (select json_agg(t) from public.plan_limits t),
  'plan_features',     (select json_agg(t) from public.plan_features t),
  'plan_feature_defs', (select json_agg(t) from public.plan_feature_defs t),
  'plan_modules',      (select json_agg(t) from public.plan_modules t),
  'plan_module_tiers', (select json_agg(t) from public.plan_module_tiers t)
) as r;
