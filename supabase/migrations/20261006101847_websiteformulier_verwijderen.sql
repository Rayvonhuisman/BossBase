-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een ondernemer moet zijn websiteformulier ook weer uit BossBase kunnen halen
-- (Instellingen › Websiteformulier › Meer instellingen › Formulier verwijderen).
--
-- Wat verwijderen doet:
--   - de rij in website_forms gaat weg, en daarmee het token: de code op de
--     website werkt niet meer (public-website-inquiry geeft formulier_onbekend);
--   - aanvragen die al binnen zijn blijven staan, met hun klant en project.
--     inquiries.form_id wordt leeg (de foreign key staat op ON DELETE SET NULL).
--
-- bb_websiteformulier() maakte het formulier aan bij de eerste keer openen.
-- Na verwijderen zou het dan meteen terugkomen, met een nieuwe code. Daarom
-- krijgt hij p_aanmaken: de pagina vraagt eerst zonder aanmaken en toont bij
-- "geen formulier" een knop om er een in te stellen. De default blijft true,
-- zodat bestaande aanroepen (websiteformulier-velden, bb_websiteformulier_opslaan)
-- niets merken. Een parameter erbij vraagt drop-and-create; de rechten worden
-- hieronder opnieuw gezet en gecontroleerd.
--
-- ── Raakt bestaande data? ───────────────────────────────────────────────────
-- Nee. Alleen functies.

begin;

drop function if exists public.bb_websiteformulier();

create function public.bb_websiteformulier(p_aanmaken boolean default true)
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

  if v_f.id is null then
    -- Niet aanmaken gevraagd, of een account op alleen-lezen (de
    -- readonly-trigger zou het ook weigeren): dan is er gewoon geen formulier.
    if not coalesce(p_aanmaken, true) or not public.bb_mag_schrijven() then
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
    'id',           v_f.id,
    'token',        v_f.public_token,
    'actief',       v_f.is_active,
    'domeinen',     to_jsonb(v_f.allowed_domains),
    'modus',        coalesce(v_f.settings->>'modus', 'kant_en_klaar'),
    'velden',       coalesce(v_f.settings->'velden', '[]'::jsonb),
    'koppeling',    coalesce(v_f.settings->'koppeling', '[]'::jsonb),
    'eigen_velden', coalesce(v_f.settings->'eigen_velden', '[]'::jsonb),
    'privacy_url',  v_f.settings->>'privacy_url',
    'pagina_url',   v_f.settings->>'pagina_url'
  );
end;
$$;

revoke all on function public.bb_websiteformulier(boolean) from public, anon, authenticated;
grant execute on function public.bb_websiteformulier(boolean) to authenticated;

-- Het formulier van het eigen bedrijf weghalen. Het formulier van bossbase.nl
-- (bestemming superadmin) valt buiten bb_websiteformulier_rij en kan hier dus
-- nooit geraakt worden.
create function public.bb_websiteformulier_verwijderen()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_f public.website_forms;
begin
  if public.current_company_id() is null or not public.bb_has_permission('instellingen') then
    raise exception 'Geen toegang tot het websiteformulier' using errcode = '42501';
  end if;

  v_f := public.bb_websiteformulier_rij();
  if v_f.id is null then
    return false;
  end if;

  delete from public.website_forms where id = v_f.id;
  return true;
end;
$$;

revoke all on function public.bb_websiteformulier_verwijderen() from public, anon, authenticated;
grant execute on function public.bb_websiteformulier_verwijderen() to authenticated;

-- Verwacht: beide functies alleen authenticated en service_role.
select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || r.rolname, ', '
                  order by p.proname, r.rolname) as rechten
  from pg_roles r, pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('bb_websiteformulier', 'bb_websiteformulier_verwijderen')
   and r.rolname in ('anon', 'authenticated', 'service_role')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

commit;

notify pgrst, 'reload schema';
