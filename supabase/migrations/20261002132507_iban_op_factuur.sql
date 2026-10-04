-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, H11 (functioneel-b F-B4). De factuur vroeg de klant het
-- bedrag over te maken, maar er stond nergens een rekeningnummer en er was ook
-- geen plek om het in te vullen. Zonder Stripe-betaallink (niet in Groei) kon de
-- klant dus niet betalen.
--
-- Nieuw: companies.iban en companies.iban_tnv, met een mod-97-controle in de
-- database (de frontend controleert hetzelfde, maar de database is de grens).
-- Bij versturen bevriest de factuur ze in snapshot_iban/snapshot_iban_tnv, net
-- als de andere bedrijfsgegevens: een verstuurde factuur verandert niet meer als
-- het bedrijf later van bank wisselt.
--
-- Daarnaast een aanscherping van bb_factuur_aanmaken (20261002131950): alleen een
-- creditnota mag direct als 'verzonden' worden aangemaakt; elke andere nieuwe
-- factuur begint als concept, zoals createFactuur altijd al deed.

create or replace function public.bb_iban_geldig(p_iban text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_num text := '';
  v_rest int := 0;
  c text;
begin
  if v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then return false; end if;
  if left(v, 2) = 'NL' and length(v) <> 18 then return false; end if;
  v := substr(v, 5) || left(v, 4);
  foreach c in array regexp_split_to_array(v, '') loop
    v_num := v_num || case when c ~ '[A-Z]' then (ascii(c) - 55)::text else c end;
  end loop;
  -- mod 97 in stukjes: het getal past niet in een bigint.
  while length(v_num) > 0 loop
    v_rest := ((v_rest::text || left(v_num, 7))::bigint % 97)::int;
    v_num := substr(v_num, 8);
  end loop;
  return v_rest = 1;
end;
$$;

revoke all on function public.bb_iban_geldig(text) from public, anon, authenticated;
grant execute on function public.bb_iban_geldig(text) to authenticated, service_role;

alter table public.companies
  add column if not exists iban text,
  add column if not exists iban_tnv text;
alter table public.companies drop constraint if exists companies_iban_geldig;
alter table public.companies add constraint companies_iban_geldig
  check (iban is null or public.bb_iban_geldig(iban));

alter table public.facturen
  add column if not exists snapshot_iban text,
  add column if not exists snapshot_iban_tnv text;

-- bb_factuur_aanmaken: status verzonden alleen voor een creditnota, en de
-- iban-snapshot meenemen (creditnota erft de bevroren gegevens van het origineel).
create or replace function public.bb_factuur_aanmaken(p_kop jsonb, p_regels jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_credit  boolean := coalesce((p_kop->>'is_credit')::boolean, false);
  v_id      uuid;
  v_nummer  text := nullif(btrim(p_kop->>'nummer'), '');
  r         jsonb;
  v_i       int := 0;
  v_regime  text;
  v_pct     numeric;
  v_aantal  numeric;
  v_prijs   numeric;
begin
  if v_company is null then
    raise exception 'Geen bedrijf gekoppeld aan dit account.' using errcode = '42501';
  end if;
  if not public.bb_has_permission('facturen') then
    raise exception 'Je hebt geen recht om facturen te maken.' using errcode = '42501', hint = 'geen_recht';
  end if;
  if not v_credit and not public.bb_mag_schrijven() then
    raise exception 'Je account staat op alleen-lezen. Sluit een abonnement af om weer facturen te maken.'
      using errcode = '42501', hint = 'readonly';
  end if;
  if not v_credit and not public.bb_within_limit('facturen') then
    raise exception 'Je hebt het maximale aantal facturen voor deze maand bereikt. Upgrade je abonnement om meer facturen te maken.'
      using errcode = '42501', hint = 'limiet';
  end if;
  if v_nummer is null then
    raise exception 'Factuurnummer ontbreekt.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_regels, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_regels, '[]'::jsonb)) = 0 then
    raise exception 'Een factuur heeft minstens één regel nodig.' using errcode = '22023';
  end if;

  insert into facturen (
    company_id, customer_id, project_id, nummer, factuurdatum, vervaldatum, betalingskenmerk,
    status, notities, betaaltermijn_dagen, is_credit, credit_van_factuur_id,
    snapshot_logo_url, snapshot_branding_color, snapshot_bedrijfsnaam, snapshot_adres, snapshot_postcode,
    snapshot_plaats, snapshot_email, snapshot_kvk, snapshot_btw, snapshot_iban, snapshot_iban_tnv
  ) values (
    v_company,
    nullif(p_kop->>'customer_id', '')::uuid,
    nullif(p_kop->>'project_id', '')::uuid,
    v_nummer,
    coalesce(nullif(p_kop->>'factuurdatum', '')::date, current_date),
    nullif(p_kop->>'vervaldatum', '')::date,
    coalesce(nullif(p_kop->>'betalingskenmerk', ''), v_nummer),
    case when v_credit then 'verzonden' else 'concept' end,
    nullif(p_kop->>'notities', ''),
    coalesce(nullif(p_kop->>'betaaltermijn_dagen', '')::int, 14),
    v_credit,
    case when v_credit then nullif(p_kop->>'credit_van_factuur_id', '')::uuid end,
    p_kop->>'snapshot_logo_url', p_kop->>'snapshot_branding_color', p_kop->>'snapshot_bedrijfsnaam',
    p_kop->>'snapshot_adres', p_kop->>'snapshot_postcode', p_kop->>'snapshot_plaats',
    p_kop->>'snapshot_email', p_kop->>'snapshot_kvk', p_kop->>'snapshot_btw',
    p_kop->>'snapshot_iban', p_kop->>'snapshot_iban_tnv'
  )
  returning id into v_id;

  for r in select value from jsonb_array_elements(p_regels) loop
    v_regime := coalesce(nullif(r->>'btw_regime', ''), 'normaal');
    if v_regime not in ('normaal', 'verlaagd', 'vrijgesteld', 'verlegd') then v_regime := 'normaal'; end if;
    v_pct := case when v_regime in ('vrijgesteld', 'verlegd') then 0
                  else coalesce(nullif(r->>'btw_pct', '')::numeric, case when v_regime = 'verlaagd' then 9 else 21 end) end;
    v_aantal := coalesce(nullif(r->>'aantal', '')::numeric, 1);
    v_prijs  := coalesce(nullif(r->>'eenheidsprijs', '')::numeric, 0);
    if nullif(btrim(r->>'omschrijving'), '') is null then
      raise exception 'Elke regel heeft een omschrijving nodig.' using errcode = '22023';
    end if;
    insert into factuur_regels (factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs,
                                btw_pct, btw_regime, regelprijs, volgorde)
    values (v_id, v_company, coalesce(nullif(r->>'type', ''), 'stuks'), btrim(r->>'omschrijving'),
            v_aantal, v_prijs, v_pct, v_regime, round(v_aantal * v_prijs, 2),
            coalesce(nullif(r->>'volgorde', '')::int, v_i));
    v_i := v_i + 1;
  end loop;

  if v_credit and (p_kop->>'credit_van_factuur_id') is not null then
    update facturen set gecrediteerd = true, updated_at = now()
     where id = (p_kop->>'credit_van_factuur_id')::uuid and company_id = v_company;
  end if;

  return v_id;
end;
$$;

revoke all on function public.bb_factuur_aanmaken(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bb_factuur_aanmaken(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';

select
  public.bb_iban_geldig('NL91 ABNA 0417 1643 00') as geldig_moet_true,
  public.bb_iban_geldig('NL91ABNA0417164301')     as fout_moet_false,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'bb_factuur_aanmaken' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rpc_rechten,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'bb_iban_geldig' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as iban_rechten;
