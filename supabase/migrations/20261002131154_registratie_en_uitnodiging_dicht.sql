-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, H2. Twee gaten bij registratie:
--
-- 1. Uitnodiging kapen. handle_new_user koppelde elk nieuw auth-account aan een
--    openstaande uitnodiging met hetzelfde e-mailadres, met de rol uit die
--    uitnodiging (ook admin). Registratie staat open en bevestigt automatisch,
--    dus wie het adres van een genodigde kende, registreerde zich vóór de echte
--    genodigde en zat in het bedrijf (gesimuleerd: 152 klanten, 164 facturen
--    zichtbaar). Lid worden gaat voortaan alléén via accept-invite, met het token
--    uit de uitnodigingsmail. handle_new_user maakt altijd een kaal profiel.
--
-- 2. Verificatie alleen in de UI. De 6-cijferige code werd door geen enkele
--    functie afgedwongen. provision_account (bedrijf aanmaken) eist nu een
--    geverifieerd e-mailadres. verify-code zet email_verified_at vóór het
--    aanroepen; accept-invite zet hem zelf. Zonder bedrijf kan een account niets
--    (alle RLS gaat via company_id), en send-email eist de verificatie apart.
--
-- 3. Vervaldatum en bedrijfsnaam van een uitnodiging kwamen van de client
--    (sec-edge B-19). Een trigger zet ze nu zelf: 48 uur, naam uit companies.
--
-- Gemeten vóór het draaien: 0 openstaande uitnodigingen; alle profielen van
-- echte bedrijven hebben email_verified_at gevuld.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Altijd een kaal profiel, zonder bedrijf. Een uitnodiging accepteren gaat via
  -- accept-invite (token uit de mail), nooit op basis van alleen het e-mailadres.
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'admin'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

create or replace function public.provision_account(p_company_name text, p_full_name text default null::text, p_email text default null::text, p_phone text default null::text, p_kvk text default null::text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id    uuid := auth.uid();
  v_company_id uuid;
  v_existing   uuid;
  v_verified   timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  select company_id, email_verified_at into v_existing, v_verified from profiles where id = v_user_id;
  if v_existing is not null then
    if p_full_name is not null then
      update profiles set full_name = p_full_name where id = v_user_id;
    end if;
    insert into subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
    values (v_existing, 'groei', 'trial', 0, now(), now() + interval '14 days')
    on conflict (company_id) do nothing;
    return json_build_object('company_id', v_existing, 'status', 'existing');
  end if;
  -- Een nieuw bedrijf alleen na e-mailverificatie (verify-code zet de datum).
  if v_verified is null then
    raise exception 'Bevestig eerst je e-mailadres met de code uit de mail.'
      using errcode = '42501', hint = 'email_niet_geverifieerd';
  end if;
  insert into companies (name, email, phone, kvk)
  values (p_company_name, nullif(p_email, ''), nullif(p_phone, ''), nullif(p_kvk, ''))
  returning id into v_company_id;
  insert into profiles (id, company_id, full_name, role)
  values (v_user_id, v_company_id, coalesce(nullif(p_full_name, ''), split_part(p_email, '@', 1), 'Gebruiker'), 'admin')
  on conflict (id) do update set
    company_id = excluded.company_id,
    full_name  = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    role       = 'admin';
  insert into subscriptions (company_id, plan, status, price_per_month, started_at, trial_ends_at)
  values (v_company_id, 'groei', 'trial', 0, now(), now() + interval '14 days')
  on conflict (company_id) do nothing;
  perform public.seed_default_email_templates(v_company_id);
  return json_build_object('company_id', v_company_id, 'status', 'created');
end;
$function$;

-- anon kan provision_account niets laten doen (geen auth.uid()), maar hoeft hem
-- ook niet te kunnen aanroepen.
revoke execute on function public.provision_account(text, text, text, text, text) from public, anon;

-- Uitnodiging: vervaldatum en bedrijfsnaam bepaalt de database.
create or replace function public.bb_uitnodiging_server_velden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invite_token is not null
     and (tg_op = 'INSERT' or new.invite_token is distinct from old.invite_token) then
    new.invite_expires_at := now() + interval '48 hours';
    new.invite_company_name := (select name from companies where id = new.company_id);
  elsif tg_op = 'UPDATE' and new.invite_token is not null
     and new.invite_expires_at is distinct from old.invite_expires_at then
    -- Verlengen kan alleen door een nieuw token; nooit een verre datum.
    new.invite_expires_at := least(new.invite_expires_at, now() + interval '48 hours');
  end if;
  return new;
end;
$$;

revoke all on function public.bb_uitnodiging_server_velden() from public, anon, authenticated;

drop trigger if exists bb_uitnodiging_server_velden on public.company_members;
create trigger bb_uitnodiging_server_velden
  before insert or update on public.company_members
  for each row execute function public.bb_uitnodiging_server_velden();

notify pgrst, 'reload schema';

select
  (select count(*) from company_members where invite_token is not null) as open_uitnodigingen,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'provision_account' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as provision_rechten;

commit;
