-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De proefperiode volgt weer het pakket dat iemand bij het aanmelden koos
-- (Groei of Team), met de mogelijkheid om losse modules gratis te proberen.
-- Vervangt 20261008111006_trial_alle_functies, die in de proef alle functies
-- aanzette. Op verzoek van Niels (2026-10-08).
--
-- 1. bb_has_feature: terug naar pakket + modules, plus: tijdens een lopende
--    proef telt een geprobeerde module (proef_modules) mee. Na de proef niet
--    meer; de gegevens blijven staan, dus de module kan later weer aan.
-- 2. proef_modules: welke modules een bedrijf in zijn proef probeerde. Ook na
--    de proef bewaard: het abonnement zet ze dan voorgeselecteerd klaar en de
--    proefmails van dag 11 en 14 noemen ze.
-- 3. bb_proef_module_starten: één klik, alleen in de proef, alleen de beheerder
--    van het abonnement, met afhankelijkheden (voertuigen neemt planning mee).
-- 4. bb_proef_pakket_wisselen: in de proef van Groei naar Team of terug.
-- 5. get_plan_status: ook de geprobeerde modules.
--
-- Gemeten vóór het draaien: 5 bedrijven in een proef (3 Groei, 2 Team).


-- ── 1. Geprobeerde modules ──────────────────────────────────────────────────
create table if not exists public.proef_modules (
  company_id uuid not null references public.companies(id) on delete cascade,
  module_key text not null references public.plan_modules(module_key) on delete cascade,
  gestart_op timestamptz not null default now(),
  gestart_door uuid references auth.users(id) on delete set null,
  primary key (company_id, module_key)
);
alter table public.proef_modules enable row level security;
revoke all on table public.proef_modules from anon, authenticated;
grant select on table public.proef_modules to authenticated;

drop policy if exists proef_modules_eigen on public.proef_modules;
create policy proef_modules_eigen on public.proef_modules for select to authenticated
  using (company_id = public.bb_current_company());


-- ── 2. Welke functies heeft een bedrijf ─────────────────────────────────────
create or replace function public.bb_has_feature(p_company_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select (
    not public.bb_plan_geconfigureerd(p_company_id)
    and not coalesce((select pfd.intern from public.plan_feature_defs pfd where pfd.feature = p_feature), false)
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
  ) or (
    -- Een module die in de lopende proef gratis geprobeerd wordt.
    public.bb_is_trial(p_company_id)
    and exists (
      select 1
      from public.proef_modules pr
      join public.plan_modules pm on pm.module_key = pr.module_key
      where pr.company_id = p_company_id and pm.feature = p_feature
    )
  )
$$;

revoke all on function public.bb_has_feature(uuid, text) from public, anon, authenticated;
grant execute on function public.bb_has_feature(uuid, text) to service_role;


-- ── 3. Een module gratis proberen ───────────────────────────────────────────
-- Geeft de modules terug die nu (ook) aan staan, inclusief een vereiste.
create or replace function public.bb_proef_module_starten(p_module text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.bb_current_company();
  v_tier text;
  v_vereist text;
  v_keys text[];
begin
  if v_company is null then raise exception 'Geen bedrijf' using errcode = '42501'; end if;
  if not public.bb_mag_abonnement_beheren() then
    raise exception 'Alleen de eigenaar van het bedrijf kan een module aanzetten.' using errcode = '42501';
  end if;
  if not public.bb_is_trial(v_company) then
    raise exception 'Gratis proberen kan alleen tijdens de proefperiode.' using errcode = '22023';
  end if;

  v_tier := public.bb_effective_tier(v_company);
  if not exists (select 1 from public.plan_module_tiers where module_key = p_module and plan = v_tier) then
    -- Niet los te kiezen bij dit pakket: zit er al in (Team), of bestaat niet.
    raise exception 'Deze module kun je bij je pakket niet los kiezen.' using errcode = '22023';
  end if;

  select vereist into v_vereist from public.plan_modules where module_key = p_module;
  v_keys := array_remove(array[v_vereist, p_module], null);

  insert into public.proef_modules (company_id, module_key, gestart_door)
  select v_company, k, auth.uid() from unnest(v_keys) k
  on conflict (company_id, module_key) do nothing;

  return jsonb_build_object('modules', to_jsonb(v_keys));
end;
$$;

revoke all on function public.bb_proef_module_starten(text) from public, anon, authenticated;
grant execute on function public.bb_proef_module_starten(text) to authenticated;


-- ── 4. In de proef van pakket wisselen ──────────────────────────────────────
create or replace function public.bb_proef_pakket_wisselen(p_plan text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.bb_current_company();
begin
  if p_plan not in ('groei', 'team') then raise exception 'Kies Groei of Team.' using errcode = '22023'; end if;
  if v_company is null then raise exception 'Geen bedrijf' using errcode = '42501'; end if;
  if not public.bb_mag_abonnement_beheren() then
    raise exception 'Alleen de eigenaar van het bedrijf kan het pakket wisselen.' using errcode = '42501';
  end if;
  if not public.bb_is_trial(v_company) then
    raise exception 'Wisselen met één klik kan alleen tijdens de proefperiode.' using errcode = '22023';
  end if;
  update public.subscriptions set plan = p_plan
   where company_id = v_company and status = 'trial' and stripe_subscription_id is null;
  return p_plan;
end;
$$;

revoke all on function public.bb_proef_pakket_wisselen(text) from public, anon, authenticated;
grant execute on function public.bb_proef_pakket_wisselen(text) to authenticated;


-- ── 5. Plan-status: ook de geprobeerde modules ──────────────────────────────
create or replace function public.get_plan_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier',          public.bb_effective_tier(c.id),
    'plan',          coalesce((select s.plan   from public.subscriptions s where s.company_id = c.id), 'trial'),
    'status',        coalesce((select s.status from public.subscriptions s where s.company_id = c.id), 'trial'),
    'trial',         public.bb_is_trial(c.id),
    'trialEndsAt',   (select s.trial_ends_at from public.subscriptions s where s.company_id = c.id),
    'periodeStart',  public.bb_periode_start(c.id),
    'periodeEind',   (public.bb_periode_start(c.id) + interval '1 month' - interval '1 day')::date,
    'readonly',      public.bb_is_readonly(c.id),
    'readonlyReden', public.bb_readonly_reden(c.id),
    'magBeheren',    public.bb_mag_abonnement_beheren(),
    'modules',       coalesce((select jsonb_agg(cm.module_key)
                               from public.company_modules cm
                               where cm.company_id = c.id and cm.actief), '[]'::jsonb),
    'proefModules',  coalesce((select jsonb_agg(pr.module_key order by pr.gestart_op)
                               from public.proef_modules pr
                               where pr.company_id = c.id), '[]'::jsonb),
    'features',      coalesce((select jsonb_agg(pfd.feature)
                               from public.plan_feature_defs pfd
                               where public.bb_has_feature(c.id, pfd.feature)), '[]'::jsonb),
    'limits',        coalesce((select jsonb_object_agg(pl.limit_key, jsonb_build_object(
                                 'max',      public.bb_limit(c.id, pl.limit_key),
                                 'gebruikt', public.bb_usage(c.id, pl.limit_key),
                                 'telwijze', pl.telwijze
                               ))
                               from public.plan_limits pl
                               where pl.plan = public.bb_effective_tier(c.id)), '{}'::jsonb)
  )
  from public.companies c
  where c.id = public.bb_current_company()
$$;

revoke all on function public.get_plan_status() from public, anon;
grant execute on function public.get_plan_status() to authenticated, service_role;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
