-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een vakbedrijf vraagt vaak dingen die wij niet kennen: "Soort dak",
-- "Oppervlakte in m²", "Wanneer kunt u?". Die moet een ondernemer zelf kunnen
-- toevoegen aan zijn websiteformulier (20261005183127):
--
--   - kant-en-klaar formulier: eigen velden met een naam, een soort (tekst,
--     getal, keuze, ja/nee, datum) en verplicht of niet;
--   - koppelen: een veld van zijn eigen formulier dat bij geen BossBase-veld
--     past, wordt een eigen veld met een eigen naam (doel 'eigen').
--
-- Wat er is ingevuld komt op de aanvraag in inquiries.eigen_velden, als lijst
-- [{ "naam": "Soort dak", "waarde": "Plat" }]. De naam wordt bij binnenkomst
-- vastgelegd (uit de instellingen van dat moment, niet uit wat de browser
-- stuurt), zodat een later hernoemd of verwijderd veld een oude aanvraag niet
-- verandert.
--
-- Daarnaast onthoudt het formulier de pagina waarop "Velden ophalen" is
-- gedaan (settings.pagina_url), zodat de ondernemer die niet opnieuw hoeft te
-- typen.
--
-- bb_websiteformulier_opslaan krijgt twee parameters erbij, met een default:
-- een frontend die nog de oude zes meestuurt, blijft werken (PostgREST kiest de
-- functie op naam van de argumenten en vult de rest aan). Dat vraagt een
-- drop-and-create; de rechten worden hieronder opnieuw gezet en gecontroleerd.
--
-- ── Raakt bestaande data? ───────────────────────────────────────────────────
-- Nee: een nieuwe kolom met default '[]' en nieuwe sleutels in settings.

begin;

alter table public.inquiries
  add column if not exists eigen_velden jsonb not null default '[]'::jsonb
    check (jsonb_typeof(eigen_velden) = 'array' and jsonb_array_length(eigen_velden) <= 30
           and pg_column_size(eigen_velden) <= 40000);

drop function if exists public.bb_websiteformulier_opslaan(boolean, text[], text, text[], jsonb, text);

create function public.bb_websiteformulier_opslaan(
  p_actief       boolean,
  p_domeinen     text[],
  p_modus        text,
  p_velden       text[],
  p_koppeling    jsonb,
  p_privacy_url  text,
  p_eigen_velden jsonb default null,
  p_pagina_url   text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_f        public.website_forms;
  v_domeinen text[] := '{}';
  v_d        text;
  v_velden   text[] := '{}';
  v_koppel   jsonb := '[]'::jsonb;
  v_eigen    jsonb := '[]'::jsonb;
  v_rij      jsonb;
  v_opties   jsonb;
  v_ids      text[] := '{}';
  v_privacy  text := nullif(btrim(coalesce(p_privacy_url, '')), '');
  v_pagina   text := nullif(btrim(coalesce(p_pagina_url, '')), '');
begin
  if public.current_company_id() is null or not public.bb_has_permission('instellingen') then
    raise exception 'Geen toegang tot het websiteformulier' using errcode = '42501';
  end if;

  v_f := public.bb_websiteformulier_rij();
  if v_f.id is null then
    raise exception 'Er is nog geen websiteformulier' using errcode = 'P0002';
  end if;

  if cardinality(coalesce(p_domeinen, '{}')) > 20 then
    raise exception 'Maximaal 20 domeinen' using errcode = '22023';
  end if;
  foreach v_d in array coalesce(p_domeinen, '{}') loop
    v_d := lower(btrim(v_d));
    if v_d !~ '^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$' then
      raise exception 'Ongeldig domein: %', v_d using errcode = '22023';
    end if;
    if v_d ~ '^https?://([a-z0-9-]+\.)*bossbase\.nl(:[0-9]+)?$' then
      raise exception 'Vul het domein van je eigen website in, niet dat van BossBase' using errcode = '22023';
    end if;
    if not v_d = any(v_domeinen) then
      v_domeinen := v_domeinen || v_d;
    end if;
  end loop;

  if p_modus is null or p_modus not in ('kant_en_klaar', 'koppelen') then
    raise exception 'Onbekende manier: %', p_modus using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct v), '{}') into v_velden
    from unnest(coalesce(p_velden, '{}')) v
   where v in ('phone', 'address', 'postcode', 'city', 'gewenste_datum', 'fotos');

  -- Koppeling: per veld van het eigen formulier één BossBase-veld, of een
  -- eigen veld met een eigen naam.
  if p_koppeling is not null and jsonb_typeof(p_koppeling) = 'array' then
    if jsonb_array_length(p_koppeling) > 40 then
      raise exception 'Maximaal 40 gekoppelde velden' using errcode = '22023';
    end if;
    for v_rij in select * from jsonb_array_elements(p_koppeling) loop
      if jsonb_typeof(v_rij) <> 'object'
         or coalesce(char_length(btrim(v_rij->>'veld')), 0) not between 1 and 120
         or coalesce(v_rij->>'doel', '') not in ('name', 'email', 'phone', 'address', 'postcode', 'city',
                                                 'message', 'gewenste_datum', 'fotos', 'eigen') then
        raise exception 'Ongeldige koppeling' using errcode = '22023';
      end if;
      if v_rij->>'doel' = 'eigen' then
        if coalesce(char_length(btrim(v_rij->>'naam')), 0) not between 1 and 80 then
          raise exception 'Geef elk eigen veld een naam (maximaal 80 tekens)' using errcode = '22023';
        end if;
        v_koppel := v_koppel || jsonb_build_array(jsonb_build_object(
          'veld', btrim(v_rij->>'veld'), 'doel', 'eigen', 'naam', btrim(v_rij->>'naam')));
      else
        v_koppel := v_koppel || jsonb_build_array(jsonb_build_object('veld', btrim(v_rij->>'veld'), 'doel', v_rij->>'doel'));
      end if;
    end loop;
  else
    v_koppel := coalesce(v_f.settings->'koppeling', '[]'::jsonb);
  end if;

  -- Eigen velden van het kant-en-klare formulier.
  if p_eigen_velden is null then
    v_eigen := coalesce(v_f.settings->'eigen_velden', '[]'::jsonb);
  elsif jsonb_typeof(p_eigen_velden) <> 'array' or jsonb_array_length(p_eigen_velden) > 20 then
    raise exception 'Maximaal 20 eigen velden' using errcode = '22023';
  else
    for v_rij in select * from jsonb_array_elements(p_eigen_velden) loop
      if jsonb_typeof(v_rij) <> 'object'
         or coalesce(v_rij->>'id', '') !~ '^[a-z0-9_-]{1,40}$'
         or v_rij->>'id' = any(v_ids)
         or coalesce(char_length(btrim(v_rij->>'naam')), 0) not between 1 and 80
         or coalesce(v_rij->>'soort', '') not in ('tekst', 'getal', 'keuze', 'janee', 'datum') then
        raise exception 'Geef elk eigen veld een naam en een soort' using errcode = '22023';
      end if;
      v_ids := v_ids || (v_rij->>'id');
      v_opties := '[]'::jsonb;
      if v_rij->>'soort' = 'keuze' then
        select coalesce(jsonb_agg(btrim(o)), '[]'::jsonb) into v_opties
          from jsonb_array_elements_text(case when jsonb_typeof(v_rij->'opties') = 'array'
                                              then v_rij->'opties' else '[]'::jsonb end) o
         where char_length(btrim(o)) between 1 and 80;
        if jsonb_array_length(v_opties) < 2 or jsonb_array_length(v_opties) > 20 then
          raise exception 'Een keuzeveld ("%") heeft 2 tot 20 opties nodig', btrim(v_rij->>'naam') using errcode = '22023';
        end if;
      end if;
      v_eigen := v_eigen || jsonb_build_array(jsonb_build_object(
        'id', v_rij->>'id', 'naam', btrim(v_rij->>'naam'), 'soort', v_rij->>'soort',
        'opties', v_opties, 'verplicht', coalesce((v_rij->>'verplicht')::boolean, false)));
    end loop;
  end if;

  if v_privacy is not null and (char_length(v_privacy) > 300 or v_privacy !~ '^https?://[^\s<>"]+$') then
    raise exception 'Ongeldige link naar de privacyverklaring' using errcode = '22023';
  end if;
  if v_pagina is not null and (char_length(v_pagina) > 500 or v_pagina !~ '^https?://[^\s<>"]+$') then
    v_pagina := null;
  end if;
  if v_pagina is null then
    v_pagina := v_f.settings->>'pagina_url';
  end if;

  update public.website_forms
     set is_active       = coalesce(p_actief, is_active),
         allowed_domains = v_domeinen,
         settings        = (coalesce(settings, '{}'::jsonb) - 'modus' - 'velden' - 'koppeling' - 'privacy_url'
                                                            - 'eigen_velden' - 'pagina_url')
                           || jsonb_build_object('modus', p_modus,
                                                 'velden', to_jsonb(v_velden),
                                                 'koppeling', v_koppel,
                                                 'eigen_velden', v_eigen)
                           || case when v_privacy is null then '{}'::jsonb
                                   else jsonb_build_object('privacy_url', v_privacy) end
                           || case when v_pagina is null then '{}'::jsonb
                                   else jsonb_build_object('pagina_url', v_pagina) end
   where id = v_f.id;

  return public.bb_websiteformulier();
end;
$$;

revoke all on function public.bb_websiteformulier_opslaan(boolean, text[], text, text[], jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.bb_websiteformulier_opslaan(boolean, text[], text, text[], jsonb, text, jsonb, text) to authenticated;

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

revoke all on function public.bb_websiteformulier() from public, anon, authenticated;
grant execute on function public.bb_websiteformulier() to authenticated;

-- Verwacht: kolom 1, beide functies alleen authenticated,service_role.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'inquiries' and column_name = 'eigen_velden') as kolom,
  (select string_agg(p.proname || ':' || r.rolname, ', ' order by p.proname, r.rolname)
     from pg_roles r, pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('bb_websiteformulier', 'bb_websiteformulier_opslaan')
      and r.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rechten,
  (select count(*) from pg_proc where proname = 'bb_websiteformulier_opslaan') as aantal_opslaan;

commit;

-- Daarna: npm run migratie:check -- inquiries website_forms
notify pgrst, 'reload schema';
