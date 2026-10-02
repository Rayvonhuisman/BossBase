-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, H10 (functioneel-b F-B1, F-B18).
--
-- Een factuur met "0% — btw verlegd" of "vrijgesteld" kon niet worden
-- aangemaakt. De frontend stuurde `btw_pct: 21` mee (`Number(0 || 21)`), de
-- database weigerde dat terecht met factuur_regels_verlegd_nul_check. Omdat kop
-- en regels in losse verzoeken werden opgeslagen, stond de kop er dan al: een
-- conceptfactuur zonder (of met een deel van de) regels, met een verbruikt
-- nummer. Gemeten in de audit: BB-F166 (0 regels) en BB-F165 (3 van 4).
--
-- Deze functie maakt kop en regels in één transactie aan. Faalt één regel, dan
-- staat er niets. Het btw-percentage volgt uit het regime: verlegd en
-- vrijgesteld zijn altijd 0%, wat de client ook stuurt.
--
-- SECURITY INVOKER: de bestaande RLS op facturen en factuur_regels blijft
-- gewoon gelden (bedrijf, recht `facturen`, alleen-lezen, maandlimiet). De
-- controles vooraf dienen alleen om een Nederlandse melding te geven in plaats
-- van "new row violates row-level security policy".
--
-- Ook gebruikt voor creditnota's (p_kop.credit_van_factuur_id): dan wordt de
-- originele factuur in dezelfde transactie op gecrediteerd gezet.

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
    snapshot_plaats, snapshot_email, snapshot_kvk, snapshot_btw
  ) values (
    v_company,
    nullif(p_kop->>'customer_id', '')::uuid,
    nullif(p_kop->>'project_id', '')::uuid,
    v_nummer,
    coalesce(nullif(p_kop->>'factuurdatum', '')::date, current_date),
    nullif(p_kop->>'vervaldatum', '')::date,
    coalesce(nullif(p_kop->>'betalingskenmerk', ''), v_nummer),
    case when p_kop->>'status' in ('concept', 'verzonden') then p_kop->>'status' else 'concept' end,
    nullif(p_kop->>'notities', ''),
    coalesce(nullif(p_kop->>'betaaltermijn_dagen', '')::int, 14),
    v_credit,
    nullif(p_kop->>'credit_van_factuur_id', '')::uuid,
    p_kop->>'snapshot_logo_url', p_kop->>'snapshot_branding_color', p_kop->>'snapshot_bedrijfsnaam',
    p_kop->>'snapshot_adres', p_kop->>'snapshot_postcode', p_kop->>'snapshot_plaats',
    p_kop->>'snapshot_email', p_kop->>'snapshot_kvk', p_kop->>'snapshot_btw'
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

select r.rolname
  from pg_roles r, pg_proc p
 where p.proname = 'bb_factuur_aanmaken' and p.pronamespace = 'public'::regnamespace
   and r.rolname in ('anon', 'authenticated', 'service_role')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
