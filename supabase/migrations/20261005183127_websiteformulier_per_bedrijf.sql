-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Elk bedrijf moet aanvragen van zijn eigen website kunnen ontvangen. De keten
-- bestaat al en is getest met bossbase.nl:
--
--     formulier → public-website-inquiry → inquiries → (trigger) klant + deal → project
--
-- (migraties 20260915180001, 20260921190434, 20260930131450). Wat ontbrak:
--
-- 1. Een bedrijf kon zijn eigen formulier niet aanmaken of beheren: website_forms
--    was alleen via SQL te vullen. Daarvoor komen twee RPC's, aangeroepen vanuit
--    Instellingen › Websiteformulier. Bewust RPC's en geen UPDATE-recht op de
--    tabel: in settings staat ook 'bestemming' en 'source'. Mocht een bedrijf
--    daar zelf 'superadmin' in zetten, dan gingen zijn aanvragen als mail naar
--    info@bossbase.nl. De RPC schrijft alleen sleutels die hij kent.
-- 2. De velden van een vakbedrijf: adres, postcode, plaats en gewenste datum.
--    Die komen als kolommen op inquiries (de functie valideert ze, de checks
--    hieronder zijn het tweede slot, gelijk aan AANVRAAG_LIMIETEN in
--    _shared/websiteAanvraag.ts). Foto's gaan niet in deze tabel: die zet de
--    functie als project_fotos bij het project, waar ze al getoond worden.
-- 3. De trigger maakte een nieuwe klant zonder adres en zonder bron. Nu krijgt
--    een nieuwe klant adres, postcode, plaats en bron 'Website'. Bij een
--    bestaande klant (zelfde e-mailadres) worden alleen LEGE velden aangevuld;
--    wat het bedrijf zelf heeft ingevuld, overschrijft een websitebezoeker niet.
--
-- ── Raakt bestaande data? ───────────────────────────────────────────────────
-- Nee. Gemeten 2026-10-05: 1 formulier (bossbase.nl, bestemming superadmin),
-- 6 aanvragen, allemaal van bossbase.nl. Nieuwe kolommen zijn nullable; de
-- trigger verandert alleen voor nieuwe aanvragen van niet-superadmin-formulieren.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Nieuwe velden op inquiries
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.inquiries
  add column if not exists address        text check (char_length(address) <= 200),
  add column if not exists postcode       text check (char_length(postcode) <= 16),
  add column if not exists city           text check (char_length(city) <= 120),
  add column if not exists gewenste_datum text check (char_length(gewenste_datum) <= 80);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Trigger: aanvraag → klant (met adres en bron) + deal
-- ═══════════════════════════════════════════════════════════════════════════
-- Zelfde functie als in 20260930131450, met adres, bron en het aanvullen van
-- lege velden bij een bestaande klant. create or replace op een triggerfunctie
-- met dezelfde signatuur: de grants blijven staan (gecontroleerd onderaan).
create or replace function public.bb_websiteaanvraag_naar_pipeline()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bestemming text;
  v_fase       uuid;
  v_klant      uuid;
  v_deal       uuid;
begin
  select f.settings->>'bestemming' into v_bestemming
    from public.website_forms f where f.id = new.form_id;
  -- Aanvragen voor BossBase zelf horen niet in een pipeline.
  if v_bestemming = 'superadmin' then
    return new;
  end if;

  select s.id into v_fase
    from public.pipeline_stages s
   where s.company_id = new.company_id
   order by s.position
   limit 1;
  if v_fase is null then
    return new;   -- bedrijf zonder fasen: laat de aanvraag staan, niets breken
  end if;

  -- Bestaande klant op e-mailadres, anders een nieuwe. Met een bedrijfsnaam is
  -- dat de klant en de invuller de contactpersoon.
  select c.id into v_klant
    from public.customers c
   where c.company_id = new.company_id
     and lower(c.email) = lower(new.email)
   order by c.created_at
   limit 1;

  if v_klant is null then
    insert into public.customers (company_id, name, contactpersoon, email, phone, address, postcode, city, source)
    values (
      new.company_id,
      coalesce(nullif(btrim(new.company_name), ''), new.name),
      case when nullif(btrim(new.company_name), '') is not null then new.name end,
      new.email,
      new.phone,
      nullif(btrim(new.address), ''),
      nullif(btrim(new.postcode), ''),
      nullif(btrim(new.city), ''),
      'Website'
    )
    returning id into v_klant;
  else
    -- Alleen aanvullen wat leeg is. Een ander adres dan de klant al heeft, is
    -- vaak gewoon een andere klus; dat staat op de aanvraag zelf.
    update public.customers c
       set phone    = coalesce(nullif(btrim(c.phone), ''),    nullif(btrim(new.phone), '')),
           address  = coalesce(nullif(btrim(c.address), ''),  nullif(btrim(new.address), '')),
           postcode = coalesce(nullif(btrim(c.postcode), ''), nullif(btrim(new.postcode), '')),
           city     = coalesce(nullif(btrim(c.city), ''),     nullif(btrim(new.city), ''))
     where c.id = v_klant
       and (    (nullif(btrim(c.phone), '')    is null and nullif(btrim(new.phone), '')    is not null)
             or (nullif(btrim(c.address), '')  is null and nullif(btrim(new.address), '')  is not null)
             or (nullif(btrim(c.postcode), '') is null and nullif(btrim(new.postcode), '') is not null)
             or (nullif(btrim(c.city), '')     is null and nullif(btrim(new.city), '')     is not null));
  end if;

  insert into public.deals (company_id, customer_id, stage_id, title, description, expected_revenue, status)
  values (
    new.company_id,
    v_klant,
    v_fase,
    case when new.is_test then 'Testaanvraag via de website'
         else coalesce(nullif(btrim(new.subject), ''), 'Aanvraag via de website') end,
    new.message,
    0,
    'open'
  )
  returning id into v_deal;

  update public.inquiries
     set customer_id = v_klant,
         deal_id     = v_deal,
         status      = 'in_behandeling'
   where id = new.id;

  return new;
end;
$$;

revoke all on function public.bb_websiteaanvraag_naar_pipeline() from public, anon, authenticated;
grant execute on function public.bb_websiteaanvraag_naar_pipeline() to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Het formulier van het eigen bedrijf
-- ═══════════════════════════════════════════════════════════════════════════
-- Eén formulier per bedrijf. Het formulier van bossbase.nl (bestemming
-- superadmin) telt niet mee, zodat ook BossBase Admin hier een gewoon
-- formulier krijgt.
--
-- settings voor een bedrijfsformulier:
--   modus       'kant_en_klaar' | 'koppelen'
--   velden      extra velden in het kant-en-klare formulier
--               (phone, address, postcode, city, gewenste_datum, fotos);
--               naam, e-mail en omschrijving staan er altijd in
--   koppeling   [{ "veld": "<name-attribuut>", "doel": "<BossBase-veld>" }]
--   privacy_url link naar de privacyverklaring van het bedrijf (optioneel)

create or replace function public.bb_websiteformulier_rij()
returns public.website_forms
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.*
    from public.website_forms f
   where f.company_id = public.current_company_id()
     and coalesce(f.settings->>'bestemming', '') <> 'superadmin'
   order by f.created_at
   limit 1;
$$;

revoke all on function public.bb_websiteformulier_rij() from public, anon, authenticated;

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
  if v_f.id is null then
    if not public.bb_mag_schrijven() then
      return null;
    end if;
    insert into public.website_forms (company_id, name, is_active, allowed_domains, settings)
    values (v_bedrijf, 'Websiteformulier', true, '{}',
            jsonb_build_object('modus', 'kant_en_klaar',
                               'velden', jsonb_build_array('phone', 'address', 'postcode', 'city'),
                               'koppeling', '[]'::jsonb))
    returning * into v_f;
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

create or replace function public.bb_websiteformulier_opslaan(
  p_actief      boolean,
  p_domeinen    text[],
  p_modus       text,
  p_velden      text[],
  p_koppeling   jsonb,
  p_privacy_url text
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
  v_rij      jsonb;
  v_privacy  text := nullif(btrim(coalesce(p_privacy_url, '')), '');
begin
  if public.current_company_id() is null or not public.bb_has_permission('instellingen') then
    raise exception 'Geen toegang tot het websiteformulier' using errcode = '42501';
  end if;

  v_f := public.bb_websiteformulier_rij();
  if v_f.id is null then
    raise exception 'Er is nog geen websiteformulier' using errcode = 'P0002';
  end if;

  -- Domeinen: volledige origins zoals de browser ze in de Origin-header zet.
  -- De app maakt van "mijnbedrijf.nl" al https://mijnbedrijf.nl en
  -- https://www.mijnbedrijf.nl; hier alleen controleren.
  if cardinality(coalesce(p_domeinen, '{}')) > 20 then
    raise exception 'Maximaal 20 domeinen' using errcode = '22023';
  end if;
  foreach v_d in array coalesce(p_domeinen, '{}') loop
    v_d := lower(btrim(v_d));
    if v_d !~ '^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$' then
      raise exception 'Ongeldig domein: %', v_d using errcode = '22023';
    end if;
    -- De pagina's van BossBase zelf horen niet in deze lijst: daarmee zou het
    -- kant-en-klare formulier ook los, buiten de eigen website, werken.
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

  -- Koppeling: per veld van het eigen formulier één BossBase-veld.
  if p_koppeling is not null and jsonb_typeof(p_koppeling) = 'array' then
    if jsonb_array_length(p_koppeling) > 40 then
      raise exception 'Maximaal 40 gekoppelde velden' using errcode = '22023';
    end if;
    for v_rij in select * from jsonb_array_elements(p_koppeling) loop
      if jsonb_typeof(v_rij) <> 'object'
         or coalesce(char_length(btrim(v_rij->>'veld')), 0) not between 1 and 120
         or coalesce(v_rij->>'doel', '') not in ('name', 'email', 'phone', 'address', 'postcode', 'city',
                                                 'message', 'gewenste_datum', 'fotos') then
        raise exception 'Ongeldige koppeling' using errcode = '22023';
      end if;
      v_koppel := v_koppel || jsonb_build_array(jsonb_build_object('veld', btrim(v_rij->>'veld'), 'doel', v_rij->>'doel'));
    end loop;
  end if;

  if v_privacy is not null and (char_length(v_privacy) > 300 or v_privacy !~ '^https?://[^\s<>"]+$') then
    raise exception 'Ongeldige link naar de privacyverklaring' using errcode = '22023';
  end if;

  -- Alleen de eigen sleutels; bestemming en source blijven wat ze waren.
  update public.website_forms
     set is_active       = coalesce(p_actief, is_active),
         allowed_domains = v_domeinen,
         settings        = (coalesce(settings, '{}'::jsonb) - 'modus' - 'velden' - 'koppeling' - 'privacy_url')
                           || jsonb_build_object('modus', p_modus,
                                                 'velden', to_jsonb(v_velden),
                                                 'koppeling', v_koppel)
                           || case when v_privacy is null then '{}'::jsonb
                                   else jsonb_build_object('privacy_url', v_privacy) end
   where id = v_f.id;

  return public.bb_websiteformulier();
end;
$$;

revoke all on function public.bb_websiteformulier_opslaan(boolean, text[], text, text[], jsonb, text) from public, anon, authenticated;
grant execute on function public.bb_websiteformulier_opslaan(boolean, text[], text, text[], jsonb, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. De uitkomst
-- ═══════════════════════════════════════════════════════════════════════════
-- NOTICE-regels komen niet terug via de Management API; vandaar deze rij.
-- Verwacht: nieuwe_kolommen 4, lekken leeg, rpc_authenticated beide functies.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'inquiries'
      and column_name in ('address', 'postcode', 'city', 'gewenste_datum')) as nieuwe_kolommen,
  (select string_agg(p.proname || ':' || r.rolname, ', ' order by p.proname, r.rolname)
     from pg_roles r, pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
      and (   (r.rolname = 'anon'
               and p.proname in ('bb_websiteaanvraag_naar_pipeline', 'bb_websiteformulier_rij',
                                 'bb_websiteformulier', 'bb_websiteformulier_opslaan'))
           or (r.rolname = 'authenticated'
               and p.proname in ('bb_websiteaanvraag_naar_pipeline', 'bb_websiteformulier_rij')))) as lekken,
  (select string_agg(p.proname, ', ' order by p.proname)
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('bb_websiteformulier', 'bb_websiteformulier_opslaan')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')) as rpc_authenticated;

commit;

-- Daarna: npm run migratie:check -- inquiries website_forms
notify pgrst, 'reload schema';
