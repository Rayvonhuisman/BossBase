-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Aanvragen via een websiteformulier kwamen binnen op een aparte pagina
-- (Aanvragen) en moesten daar met de hand worden omgezet naar een klant en een
-- deal. Die pagina vervalt (besluit 30-09-2026): een aanvraag hoort meteen in de
-- pipeline, als nieuw project in de eerste fase, net als een aanvraag die je met
-- de knop maakt.
--
-- Twee soorten formulieren:
--   - Een formulier op de website van een KLANT van BossBase: de aanvraag wordt
--     een klant (op e-mailadres gezocht, anders nieuw) en een deal in de eerste
--     fase. De bestaande trigger bb_deal_project_aanmaken maakt het project.
--   - Het formulier op bossbase.nl zelf: dat zijn aanvragen voor BossBase, geen
--     klus. Die blijven een inquiry, komen binnen in de superadmin en gaan per
--     mail naar info@bossbase.nl (edge function public-website-inquiry). Het
--     formulier krijgt daarvoor settings.bestemming = 'superadmin'.
--
-- De inquiry blijft bestaan als bron: het project toont "Via: website" uit
-- inquiries (getAanvraagBron) en de rate limit en privacyregistratie staan erop.
--
-- Gemeten (30-09-2026): 1 formulier (bossbase.nl, BossBase Admin), 5 aanvragen,
-- alle vijf van bossbase.nl. Er zijn nog geen formulieren van klanten.

begin;

-- ── 1. Het formulier van bossbase.nl ────────────────────────────────────────
update public.website_forms
   set settings = coalesce(settings, '{}'::jsonb) || '{"bestemming": "superadmin"}'::jsonb
 where id = '6a45035d-4843-4572-8b04-b6e9b3f837f3';

-- ── 2. Aanvraag van een klantformulier → klant + deal ───────────────────────
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
    insert into public.customers (company_id, name, contactpersoon, email, phone)
    values (
      new.company_id,
      coalesce(nullif(btrim(new.company_name), ''), new.name),
      case when nullif(btrim(new.company_name), '') is not null then new.name end,
      new.email,
      new.phone
    )
    returning id into v_klant;
  end if;

  insert into public.deals (company_id, customer_id, stage_id, title, description, expected_revenue, status)
  values (
    new.company_id,
    v_klant,
    v_fase,
    coalesce(nullif(btrim(new.subject), ''), 'Aanvraag via de website'),
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

drop trigger if exists bb_websiteaanvraag_naar_pipeline on public.inquiries;
create trigger bb_websiteaanvraag_naar_pipeline
  after insert on public.inquiries
  for each row execute function public.bb_websiteaanvraag_naar_pipeline();

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select settings->>'bestemming' from public.website_forms
    where id = '6a45035d-4843-4572-8b04-b6e9b3f837f3') as bossbase_formulier,
  (select count(*) from pg_trigger where tgname = 'bb_websiteaanvraag_naar_pipeline') as trigger_er,
  (select count(*) from pg_roles r, pg_proc p
    where p.proname = 'bb_websiteaanvraag_naar_pipeline' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as lekken;

commit;

notify pgrst, 'reload schema';
