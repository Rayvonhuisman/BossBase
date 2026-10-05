-- ── Waarom ──────────────────────────────────────────────────────────────────
-- bb_websiteformulier() (20261005183127) maakt het formulier aan als het er nog
-- niet is. Twee gelijktijdige aanroepen zagen allebei "nog niet" en maakten er
-- elk één: gezien bij het testen, waar React in de ontwikkelmodus een effect
-- twee keer draait (2 ms na elkaar). Een dubbelklik of twee tabbladen kunnen
-- hetzelfde. Daarna wisselde de code op het scherm van token, afhankelijk van
-- welke rij er het eerst uitkwam.
--
-- Nu: één bedrijfsformulier per bedrijf, afgedwongen met een unieke index (het
-- formulier van bossbase.nl, bestemming superadmin, telt niet mee), en de
-- aanmaak met on conflict do nothing.
--
-- ── Raakt bestaande data? ───────────────────────────────────────────────────
-- Gemeten 2026-10-05: één dubbel, bij het testbedrijf TEST Stamvol Bouw BV
-- (7e57c0de-…), allebei van 13:28:17. Het jongste is leeg (geen domeinen, geen
-- aanvragen) en gaat weg; het oudste is het formulier dat in gebruik is.

begin;

delete from public.website_forms f
 where coalesce(f.settings->>'bestemming', '') <> 'superadmin'
   and not exists (select 1 from public.inquiries i where i.form_id = f.id)
   and exists (select 1 from public.website_forms o
                where o.company_id = f.company_id
                  and coalesce(o.settings->>'bestemming', '') <> 'superadmin'
                  and (o.created_at, o.id) < (f.created_at, f.id));

create unique index if not exists website_forms_een_per_bedrijf
  on public.website_forms (company_id)
  where coalesce(settings->>'bestemming', '') <> 'superadmin';

create or replace function public.bb_websiteformulier()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bedrijf uuid := public.current_company_id();
  v_f       public.website_forms;
begin
  if v_bedrijf is null or not public.bb_has_permission('instellingen') then
    raise exception 'Geen toegang tot het websiteformulier' using errcode = '42501';
  end if;

  v_f := public.bb_websiteformulier_rij();

  -- Nog geen formulier: nu aanmaken. Een account op alleen-lezen maakt niets
  -- aan (de readonly-trigger zou het ook weigeren); dan geven we null terug.
  -- Loopt er tegelijk een tweede aanroep, dan wint er één en leest de ander
  -- daarna diens rij.
  if v_f.id is null then
    if not public.bb_mag_schrijven() then
      return null;
    end if;
    insert into public.website_forms (company_id, name, is_active, allowed_domains, settings)
    values (v_bedrijf, 'Websiteformulier', true, '{}',
            jsonb_build_object('modus', 'kant_en_klaar',
                               'velden', jsonb_build_array('phone', 'address', 'postcode', 'city'),
                               'koppeling', '[]'::jsonb))
    on conflict (company_id) where coalesce(settings->>'bestemming', '') <> 'superadmin' do nothing;
    v_f := public.bb_websiteformulier_rij();
  end if;

  return jsonb_build_object(
    'id',          v_f.id,
    'token',       v_f.public_token,
    'actief',      v_f.is_active,
    'domeinen',    to_jsonb(v_f.allowed_domains),
    'modus',       coalesce(v_f.settings->>'modus', 'kant_en_klaar'),
    'velden',      coalesce(v_f.settings->'velden', '[]'::jsonb),
    'koppeling',   coalesce(v_f.settings->'koppeling', '[]'::jsonb),
    'privacy_url', v_f.settings->>'privacy_url'
  );
end;
$$;

revoke all on function public.bb_websiteformulier() from public, anon, authenticated;
grant execute on function public.bb_websiteformulier() to authenticated;

-- Verwacht: dubbele 0, index 1, rechten authenticated,service_role.
select
  (select count(*) from (select company_id from public.website_forms
                          where coalesce(settings->>'bestemming', '') <> 'superadmin'
                          group by company_id having count(*) > 1) x) as dubbele,
  (select count(*) from pg_indexes where indexname = 'website_forms_een_per_bedrijf') as index,
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r, pg_proc p
    where p.proname = 'bb_websiteformulier' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rechten;

commit;

notify pgrst, 'reload schema';
