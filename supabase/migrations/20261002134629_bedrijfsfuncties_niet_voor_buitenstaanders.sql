-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M2 (+ Stripe-review S8). Zestien SECURITY DEFINER-functies
-- met een p_company_id-/p_user_id-parameter waren uitvoerbaar door anon en
-- authenticated en controleerden niet of het om het eigen bedrijf ging. Zonder
-- login kon iedereen met een bedrijfs-id het pakket, de proefstatus, de
-- opzegdatum en het aantal klanten, gebruikers, offertes en facturen opvragen
-- (live gezien voor Stamvol). Het bedrijfs-id was te vinden door de publieke
-- bucket bedrijf-logos te LIJSTEN. bb_zet_standaard_kostencategorieen schreef
-- als anon in elk bedrijf.
--
-- Wie roept de varianten met parameter aan? Gecontroleerd in de code en in
-- productie (policies, functies, edge functions, frontend):
--   - de frontend gebruikt alleen de varianten zónder parameter;
--   - edge functions (billing-checkout, billing-wijzig, _shared/billing.ts,
--     meldpunt, sign-offerte, sign-werkbon, check-herinneringen) roepen ze aan
--     met de service-rol;
--   - de varianten zonder parameter en andere definer-functies draaien als
--     eigenaar en hebben dus geen EXECUTE van de gebruiker nodig;
--   - policies: alleen bb_offerte_telt_mee(company_id, …) (plan_limiet_offertes)
--     en bb_mag_abonnement_beheren() (upgrade_requests_update, via de default
--     auth.uid()). Die draaien als de gebruiker, dus houden EXECUTE en krijgen
--     een guard: alleen het eigen bedrijf / de eigen gebruiker.
--   - bb_factuur_aanmaken (invoker) gebruikt bb_within_limit('facturen'), de
--     variant zonder bedrijfsparameter; die blijft open.
-- Voor de overige: EXECUTE weg bij anon en authenticated, service_role houdt hem.
--
-- Publieke buckets: de SELECT-policies "avatars_read_public" en
-- "bedrijf-logos public read" stonden LIJSTEN van de hele bucket toe aan
-- iedereen. Voor het tonen via de publieke URL is geen policy nodig. De app
-- lijst en verwijdert alleen in de map van het eigen bedrijf (logo opruimen,
-- oude profielfoto weghalen); daarvoor blijft SELECT op de eigen map.

begin;

do $$
declare f text;
begin
  foreach f in array array[
    'public.bb_downgrade_blokkades(uuid, text)',
    'public.bb_effective_tier(uuid)',
    'public.bb_has_feature(uuid, text)',
    'public.bb_is_readonly(uuid)',
    'public.bb_is_trial(uuid)',
    'public.bb_limit(uuid, text)',
    'public.bb_mag_direct_opzeggen(uuid)',
    'public.bb_mag_wisselen(uuid, text)',
    'public.bb_nieuwe_looptijd(uuid, text)',
    'public.bb_opzegbaar_per(uuid)',
    'public.bb_periode_start(uuid)',
    'public.bb_plan_geconfigureerd(uuid)',
    'public.bb_readonly_reden(uuid)',
    'public.bb_usage(uuid, text)',
    'public.bb_within_limit(uuid, text)',
    'public.bb_zet_standaard_kostencategorieen(uuid)',
    'public.seed_default_lost_reasons(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Guard: alleen je eigen bedrijf. Zonder ingelogde gebruiker (service-rol) geen beperking.
create or replace function public.bb_offerte_telt_mee(p_company_id uuid, p_nummer text, p_customer_id uuid, p_id uuid default null::uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select not (
    coalesce(p_nummer, '') ~ '-v[0-9]+$'
    and (auth.uid() is null
         or p_company_id = (select company_id from public.profiles where id = auth.uid()))
    and exists (
      select 1 from public.offertes o
      where o.company_id = p_company_id
        and (p_id is null or o.id <> p_id)
        and o.customer_id is not distinct from p_customer_id
        -- zelfde basisnummer: het origineel (BB-005) of een eerdere versie
        and left(o.nummer, length(regexp_replace(p_nummer, '-v[0-9]+$', '')))
            = regexp_replace(p_nummer, '-v[0-9]+$', '')
        and (o.nummer = regexp_replace(p_nummer, '-v[0-9]+$', '') or o.nummer ~ '-v[0-9]+$')
    )
  )
$function$;
revoke all on function public.bb_offerte_telt_mee(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.bb_offerte_telt_mee(uuid, text, uuid, uuid) to authenticated, service_role;

-- Guard: een gebruiker mag dit alleen over zichzelf vragen.
create or replace function public.bb_mag_abonnement_beheren(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select p.role = 'admin' and p.actief is distinct from false
           and (c.eigenaar_id is null or c.eigenaar_id = p.id)
      from public.profiles p
      left join public.companies c on c.id = p.company_id
     where p.id = p_user_id
       and (auth.uid() is null or p_user_id = auth.uid())
  ), false)
$function$;
revoke all on function public.bb_mag_abonnement_beheren(uuid) from public, anon;
grant execute on function public.bb_mag_abonnement_beheren(uuid) to authenticated, service_role;

-- Publieke buckets: niet meer lijsten door buitenstaanders.
drop policy if exists avatars_read_public on storage.objects;
create policy avatars_eigen_map_lezen on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (public.current_user_company_id())::text);

drop policy if exists "bedrijf-logos public read" on storage.objects;
create policy bedrijf_logos_eigen_map_lezen on storage.objects
  for select to authenticated
  using (bucket_id = 'bedrijf-logos'
         and (storage.foldername(name))[1] = (public.current_user_company_id())::text);

notify pgrst, 'reload schema';

select
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and pg_get_function_identity_arguments(p.oid) ~ 'p_company_id uuid|p_user_id uuid|p_company uuid'
      and has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_met_bedrijfsparameter_moet_0,
  (select string_agg(p.proname, ',') from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and pg_get_function_identity_arguments(p.oid) ~ 'p_company_id uuid|p_user_id uuid|p_company uuid'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')) as authenticated_houdt;

commit;
