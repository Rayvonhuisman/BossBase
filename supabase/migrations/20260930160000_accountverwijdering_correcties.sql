-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Correcties op "Account verwijderen" en de opschoonjob (20260930083452).
-- Getest in een geïsoleerde database met de productiestructuur (PGlite, zie
-- supabase/tests/accountverwijdering_test.mjs); niets hiervan is op productie
-- uitgeprobeerd.
--
-- 1. Toegang eindigt niet echt. delete_own_account en cancel_company_account
--    zetten alleen profiles.actief = false. De app logt dan uit, maar het
--    inlogaccount blijft bruikbaar: opnieuw inloggen lukt, en de database geeft
--    via de API gewoon de bedrijfsgegevens terug (current_company_id() kijkt
--    niet naar actief). Nu worden de inlogaccounts geblokkeerd (banned_until,
--    net als "deactiveren" in delete-team-member) en de sessies ingetrokken.
--    Heractiveren gaat zoals nu via Team → activeren, of voor een heel bedrijf
--    door een superbeheerder.
--
-- 2. Iedere beheerder kon het hele bedrijf opzeggen, ook de eigenaar
--    buitensluiten. Elders is de eigenaar juist beschermd (delete-team-member,
--    bb_profiel_bewaken). Nu: alleen de eigenaar zegt het bedrijf op (of een
--    beheerder als er geen eigenaar is vastgelegd). Een andere beheerder
--    deactiveert alleen zichzelf. Superbeheerders worden niet mee
--    gedeactiveerd: dat zijn medewerkers van BossBase, geen teamleden.
--
-- 3. De opschoonjob faalt bij een bedrijf waarvan de beheerder nog actief is
--    (proefperiode verlopen, of abonnement via Stripe beëindigd zonder op
--    "Account verwijderen" te drukken): bb_profiel_bewaken weigert het profiel
--    van de laatste actieve beheerder te verwijderen, en de hele verwijdering
--    draait terug ("Dit is de laatste beheerder van het bedrijf"). Zo'n bedrijf
--    zou elke nacht opnieuw falen. De functie deactiveert nu eerst de profielen.
--    (Een ondertekende werkbon blokkeert het verwijderen niet; ook getest.)
--
-- 4. "Behalve superbeheerders" klopte maar half: hun inlogaccount bleef, maar
--    hun profiel ging via de cascade mee met het bedrijf. Nu wordt dat profiel
--    eerst losgekoppeld (company_id = null).
--
-- 5. bb_opschoning_bestanden koos bestanden op "de bestandsnaam komt ergens in
--    een verwijzing voor". Gemeten op productie: een bedrijf verwijst naar
--    <eigen map>/werkbon-…pdf, en daardoor werd ook het gelijknamige oude
--    bestand in de wortel van de bucket gekozen — dat van een ánder bedrijf
--    (twee gevallen: signed-werkbonnen en signed-offertes). Nu moet de
--    verwijzing naar dezelfde bucket en precies dat pad wijzen, en blijft een
--    bestand staan waar een ander bedrijf ook naar verwijst. Een verwijzing die
--    als JSON-lijst is opgeslagen (kosten-bijlagen) telt nog steeds mee.
--
-- 6. anon had EXECUTE op delete_own_account en cancel_company_account (zonder
--    gevolg, auth.uid() is dan leeg, maar niet de bedoeling).
--
-- Wat deze migratie NIET doet: de termijn van 2 jaar wijzigen of de dagelijkse
-- cron aanzetten (20260930083835_opschonen_cron.sql.pending). Dat zijn
-- beleidskeuzes.

begin;

-- ── Toegang beëindigen ──────────────────────────────────────────────────────
create or replace function public.bb_toegang_beeindigen(p_users uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  -- Dezelfde blokkade als de Auth-API zet bij ban_duration '876000h'.
  update auth.users set banned_until = now() + interval '100 years' where id = any(p_users);
  -- Sessies weg = refresh tokens weg (cascade). Een al uitgegeven access token
  -- blijft geldig tot hij verloopt (standaard een uur).
  delete from auth.sessions where user_id = any(p_users);
end;
$$;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Niet ingelogd';
  end if;
  update public.profiles
     set actief = false, verwijderd_op = coalesce(verwijderd_op, now())
   where id = v_uid;
  perform public.bb_toegang_beeindigen(array[v_uid]);
end;
$$;

create or replace function public.cancel_company_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid; v_role text; v_eigenaar uuid;
  v_users uuid[];
begin
  select company_id, role into v_company, v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen een beheerder kan het bedrijf opzeggen';
  end if;
  if v_company is null then
    raise exception 'Geen bedrijf gekoppeld aan dit account';
  end if;
  select eigenaar_id into v_eigenaar from public.companies where id = v_company;
  if v_eigenaar is not null and v_eigenaar <> v_uid then
    raise exception 'Alleen de eigenaar kan het bedrijf opzeggen'
      using errcode = 'insufficient_privilege', hint = 'eigenaar';
  end if;

  update public.companies set status = 'opgezegd', opgezegd_op = coalesce(opgezegd_op, now()) where id = v_company;

  select coalesce(array_agg(id), '{}') into v_users
    from public.profiles
   where company_id = v_company and not coalesce(is_super_admin, false);
  update public.profiles
     set actief = false, verwijderd_op = coalesce(verwijderd_op, now())
   where id = any(v_users);
  perform public.bb_toegang_beeindigen(v_users);
end;
$$;

-- ── Bestanden van een bedrijf ────────────────────────────────────────────────
-- Wijst verwijzing u naar bestand (bucket, naam)? Een verwijzing is een
-- (ondertekende of publieke) URL met /<bucket>/<naam> erin, of het kale pad.
create or replace function public.bb_verwijst_naar(u text, p_bucket text, p_naam text)
returns boolean
language sql
immutable
as $$
  select u is not null and (
    u = p_naam
    or u = p_bucket || '/' || p_naam
    or (position('/' || p_bucket || '/' || p_naam in u) > 0
        -- Direct na de naam mag het pad niet doorlopen (anders is het een
        -- ander bestand): einde, ?token=, of een afsluitend " of ] van een JSON-lijst.
        and substr(u, position('/' || p_bucket || '/' || p_naam in u) + length(p_bucket) + length(p_naam) + 2, 1) !~ '[A-Za-z0-9._%/-]')
  )
$$;

create or replace function public.bb_opschoning_bestanden(p_company uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path to 'public', 'storage'
as $$
  with verwijzingen(company_id, u) as (
              select company_id, signature_url        from public.offertes
    union all select company_id, signed_pdf_url       from public.offertes
    union all select company_id, handtekening_url     from public.werkbonnen
    union all select company_id, ondertekende_pdf_url from public.werkbonnen
    union all select company_id, url                  from public.werkbon_fotos
    union all select company_id, url                  from public.project_fotos
    union all select company_id, bijlage_url          from public.job_costs
    union all select company_id, logo_url             from public.customers
    union all select id,         logo_url             from public.companies
    union all select company_id, avatar_url           from public.profiles
    union all select company_id, avatar_url           from public.company_members
    union all select company_id, screenshot_pad       from public.meldingen
  )
  select o.bucket_id, o.name
    from storage.objects o
   where split_part(o.name, '/', 1) = p_company::text
      or (
        exists (select 1 from verwijzingen v
                 where v.company_id = p_company and public.bb_verwijst_naar(v.u, o.bucket_id, o.name))
        -- Nooit iets uit de map van een ander bestaand bedrijf, en nooit een
        -- bestand waar een ander bedrijf ook naar verwijst.
        and split_part(o.name, '/', 1) not in (select id::text from public.companies where id <> p_company)
        and not exists (select 1 from verwijzingen v
                         where v.company_id is distinct from p_company and public.bb_verwijst_naar(v.u, o.bucket_id, o.name))
      )
$$;

-- ── De rijen van een bedrijf verwijderen ─────────────────────────────────────
create or replace function public.bb_opschoning_verwijder(p_company uuid, p_jaren int default 2)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_einde timestamptz := public.bb_opschoning_einde(p_company);
  v_uit   jsonb := '{}'::jsonb;
  v_n     int;
begin
  if v_einde is null or v_einde >= now() - make_interval(years => p_jaren) then
    raise exception 'Bedrijf % komt niet in aanmerking voor opschoning (einde: %)', p_company, v_einde
      using errcode = 'P0001';
  end if;

  -- Profielen die blijven (superbeheerders, leden van een ander bedrijf):
  -- loskoppelen, anders gaan ze via de cascade toch mee.
  update public.profiles set company_id = null
   where company_id = p_company
     and id not in (select g.user_id from public.bb_opschoning_gebruikers(p_company) g);
  get diagnostics v_n = row_count; v_uit := v_uit || jsonb_build_object('profielen_losgekoppeld', v_n);

  -- bb_profiel_bewaken weigert de laatste actieve beheerder te verwijderen.
  update public.profiles set actief = false where company_id = p_company and actief;

  delete from public.werkbon_fotos         where company_id = p_company; get diagnostics v_n = row_count; v_uit := v_uit || jsonb_build_object('werkbon_fotos', v_n);
  delete from public.dashboard_widgets     where company_id = p_company; get diagnostics v_n = row_count; v_uit := v_uit || jsonb_build_object('dashboard_widgets', v_n);
  delete from public.mail_fouten           where company_id = p_company; get diagnostics v_n = row_count; v_uit := v_uit || jsonb_build_object('mail_fouten', v_n);
  delete from public.meldingen             where company_id = p_company; get diagnostics v_n = row_count; v_uit := v_uit || jsonb_build_object('meldingen', v_n);
  delete from public.snelstart_webhook_log where company_id = p_company; get diagnostics v_n = row_count; v_uit := v_uit || jsonb_build_object('snelstart_webhook_log', v_n);
  delete from public.stripe_billing_events where company_id = p_company; get diagnostics v_n = row_count; v_uit := v_uit || jsonb_build_object('stripe_billing_events', v_n);
  delete from public.companies             where id = p_company;         get diagnostics v_n = row_count; v_uit := v_uit || jsonb_build_object('companies', v_n);

  return v_uit;
end;
$$;

-- ── Rechten ─────────────────────────────────────────────────────────────────
revoke all on function public.bb_toegang_beeindigen(uuid[])        from public, anon, authenticated;
revoke all on function public.bb_verwijst_naar(text, text, text)   from public, anon, authenticated;
revoke all on function public.bb_opschoning_bestanden(uuid)        from public, anon, authenticated;
revoke all on function public.bb_opschoning_verwijder(uuid, int)   from public, anon, authenticated;
revoke all on function public.delete_own_account()                 from public, anon, authenticated;
revoke all on function public.cancel_company_account()             from public, anon, authenticated;
grant execute on function public.bb_toegang_beeindigen(uuid[])      to service_role;
grant execute on function public.bb_verwijst_naar(text, text, text) to service_role;
grant execute on function public.bb_opschoning_bestanden(uuid)      to service_role;
grant execute on function public.bb_opschoning_verwijder(uuid, int) to service_role;
grant execute on function public.delete_own_account()               to authenticated, service_role;
grant execute on function public.cancel_company_account()           to authenticated, service_role;

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select string_agg(r.rolname || ':' || p.proname, ', ' order by p.proname, r.rolname)
     from pg_roles r, pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('bb_toegang_beeindigen', 'bb_verwijst_naar', 'bb_opschoning_bestanden',
                        'bb_opschoning_verwijder', 'delete_own_account', 'cancel_company_account')
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as uitvoerbaar_voor_clients;

commit;

notify pgrst, 'reload schema';
