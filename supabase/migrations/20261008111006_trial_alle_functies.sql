-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Tijdens de 14 dagen gratis proberen golden de functies van het pakket dat bij
-- het aanmelden gekozen was. Bij Groei werkten de Stripe-betaallink, planning
-- en voertuigen daardoor niet, terwijl je juist alles wilt kunnen proberen. Op
-- verzoek van Niels (2026-10-08): in een lopende proefperiode werken alle
-- betaalde functies.
--
-- Interne gedragsregels (plan_feature_defs.intern, zoals de gedeelde
-- werkruimte van Groei) blijven bij het pakket horen: die zijn geen functie om
-- te proberen maar bepalen hoe rechten werken.
--
-- get_plan_status() leidt de lijst met functies af uit bb_has_feature, dus het
-- menu en de instellingen in de app volgen vanzelf.
--
-- Gemeten vóór het draaien: 5 bedrijven in een proefperiode (3 Groei, 2 Team).

create or replace function public.bb_has_feature(p_company_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select (
    not public.bb_plan_geconfigureerd(p_company_id)
    and not coalesce((select pfd.intern from public.plan_feature_defs pfd where pfd.feature = p_feature), false)
  ) or (
    -- Proefperiode: alles wat geen interne regel is.
    public.bb_is_trial(p_company_id)
    and exists (select 1 from public.plan_feature_defs pfd where pfd.feature = p_feature and not coalesce(pfd.intern, false))
  ) or exists (
    select 1 from public.plan_features pf
    where pf.plan = public.bb_effective_tier(p_company_id) and pf.feature = p_feature
  ) or exists (
    select 1
    from public.company_modules cm
    join public.plan_modules      pm  on pm.module_key  = cm.module_key
    join public.plan_module_tiers pmt on pmt.module_key = cm.module_key
                                     and pmt.plan = public.bb_effective_tier(p_company_id)
    where cm.company_id = p_company_id and cm.actief and pm.feature = p_feature
  )
$$;

-- Zelfde rechten als voorheen: alleen de server.
revoke all on function public.bb_has_feature(uuid, text) from public, anon, authenticated;
grant execute on function public.bb_has_feature(uuid, text) to service_role;

notify pgrst, 'reload schema';
