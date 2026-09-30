-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De algemene voorwaarden, de privacyverklaring en de verwerkersovereenkomst
-- beloven bewaartermijnen die de software tot nu toe niet naleefde. Opzeggen
-- zette alleen een vlag (cancel_company_account, 20260624140000) en de
-- aangekondigde opschoonjob bestond niet. Afgesproken termijnen (30-09-2026):
--
--   bedrijf, na het einde van het abonnement  2 jaar, daarna alles weg,
--                                             ook bestanden en inlogaccounts
--   contactformulier van BossBase zelf        1 jaar
--   gesprekken met Boss                       12 maanden
--   meldpunt                                  2 jaar (met schermafbeelding)
--   verzonden mails                           zolang de klant bestaat
--   resettokens en aanmeldcodes               24 uur
--
-- Deze migratie levert de databasekant. De edge function `opschonen` doet wat
-- SQL niet kan (bestanden via de Storage-API, inlogaccounts via de Auth-API) en
-- draait dagelijks. Met {"droogloop": true} verwijdert hij niets en laat hij
-- alleen zien wat hij zou verwijderen.
--
-- WANNEER IS EEN ABONNEMENT AFGELOPEN (bb_opschoning_einde)
--   - lopend Stripe-abonnement (actief, trial, betaalprobleem): nooit;
--   - door Stripe beëindigd (status 'opgezegd'): cancelled_at;
--   - account verwijderd zonder lopend Stripe-abonnement: companies.opgezegd_op;
--   - proefperiode zonder betaald abonnement: trial_ends_at.
--   Al het andere (zoals een handmatig actief bedrijf zonder Stripe) niet.
--
-- WAT HOORT BIJ EEN BEDRIJF
--   - Rijen: 60 tabellen hangen met ON DELETE CASCADE aan companies. Drie
--     uitzonderingen regelt deze migratie: werkbon_fotos (NO ACTION, zou het
--     verwijderen blokkeren), dashboard_widgets (geen FK) en de tabellen met
--     SET NULL (mail_fouten, meldingen, snelstart_webhook_log,
--     stripe_billing_events), die anders met persoonsgegevens achterblijven.
--   - Bestanden: alles onder de map <company_id>/ in een bucket, plus bestanden
--     waar de eigen rijen naar verwijzen (handtekeningen staan niet in een
--     bedrijfsmap maar heten naar de offerte of werkbon).
--   - Inlogaccounts: de profielen van het bedrijf, behalve superbeheerders en
--     mensen die ook lid zijn van een ander bedrijf. Die gaan pas na de rijen,
--     want werkbon_uren.profile_id (NO ACTION) blokkeert eerder verwijderen.
--
-- Gemeten vóór het draaien (30-09-2026): 7 bedrijven, geen enkel abonnement
-- beëindigd, 0 opgezegd. De eerste run verwijdert dus geen bedrijf.

begin;

-- ── 1. Wanneer eindigde het abonnement ──────────────────────────────────────
create or replace function public.bb_opschoning_einde(p_company uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when s.stripe_subscription_id is not null
         and s.status in ('actief', 'trial', 'betaalprobleem')  then null
    when s.status = 'opgezegd'                                  then coalesce(s.cancelled_at, c.opgezegd_op)
    when c.status = 'opgezegd'                                  then c.opgezegd_op
    when s.status = 'trial' and s.stripe_subscription_id is null then s.trial_ends_at
    else null
  end
  from public.companies c
  left join lateral (
    select * from public.subscriptions x
     where x.company_id = c.id
     order by x.created_at desc
     limit 1
  ) s on true
  where c.id = p_company
$$;

-- ── 2. Bestanden van een bedrijf ────────────────────────────────────────────
create or replace function public.bb_opschoning_bestanden(p_company uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path to 'public', 'storage'
as $$
  with verwijzingen(u) as (
              select signature_url        from public.offertes        where company_id = p_company
    union all select signed_pdf_url       from public.offertes        where company_id = p_company
    union all select handtekening_url     from public.werkbonnen      where company_id = p_company
    union all select ondertekende_pdf_url from public.werkbonnen      where company_id = p_company
    union all select url                  from public.werkbon_fotos   where company_id = p_company
    union all select url                  from public.project_fotos   where company_id = p_company
    union all select bijlage_url          from public.job_costs       where company_id = p_company
    union all select logo_url             from public.customers       where company_id = p_company
    union all select logo_url             from public.companies       where id         = p_company
    union all select avatar_url           from public.profiles        where company_id = p_company
    union all select avatar_url           from public.company_members where company_id = p_company
    union all select screenshot_pad       from public.meldingen       where company_id = p_company
  )
  select o.bucket_id, o.name
    from storage.objects o
   where split_part(o.name, '/', 1) = p_company::text
      or (
        exists (select 1 from verwijzingen v where v.u is not null and position(o.name in v.u) > 0)
        -- Nooit iets uit de map van een ander bestaand bedrijf.
        and split_part(o.name, '/', 1) not in (select id::text from public.companies where id <> p_company)
      )
$$;

-- ── 3. Inlogaccounts van een bedrijf ────────────────────────────────────────
create or replace function public.bb_opschoning_gebruikers(p_company uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id
    from public.profiles p
   where p.company_id = p_company
     and not coalesce(p.is_super_admin, false)
     and not exists (
       select 1 from public.company_members m
        where m.profile_id = p.id and m.company_id <> p_company
     )
$$;

-- ── 4. Welke bedrijven komen in aanmerking ──────────────────────────────────
create or replace function public.bb_opschoning_kandidaten(p_jaren int default 2)
returns table (company_id uuid, naam text, einde timestamptz, gebruikers bigint, klanten bigint, bestanden bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.name, e.einde,
         (select count(*) from public.bb_opschoning_gebruikers(c.id)),
         (select count(*) from public.customers k where k.company_id = c.id),
         (select count(*) from public.bb_opschoning_bestanden(c.id))
    from public.companies c
    cross join lateral (select public.bb_opschoning_einde(c.id) as einde) e
   where e.einde is not null
     and e.einde < now() - make_interval(years => p_jaren)
   order by e.einde
$$;

-- ── 5. De rijen van een bedrijf verwijderen ─────────────────────────────────
-- Controleert zelf opnieuw of het bedrijf in aanmerking komt, zodat ook een
-- verkeerde aanroep nooit een lopend bedrijf kan wissen.
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

-- ── 6. Bewaartermijnen van losse gegevens ───────────────────────────────────
-- Het contactformulier van BossBase zelf: de aanvragen van BossBase Admin
-- (8131d2e8-…, het bedrijf van het formulier op bossbase.nl, zie migratie
-- 20260915180001). Vast id en niet "het bedrijf van een superbeheerder": ook
-- Dakdekker Niels heeft een superbeheerder, en diens aanvragen zijn geen
-- contactformulier van BossBase. Aanvragen via formulieren op de sites van
-- klanten zijn gegevens van die klant en vallen onder de 2-jaarregel hierboven.
create or replace function public.bb_opschoning_termijnen_te_verwijderen()
returns table (soort text, aantal bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select 'contactformulier', count(*) from public.inquiries i
   where i.created_at < now() - interval '1 year'
     and i.company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca'::uuid  -- BossBase Admin
  union all
  select 'boss_gesprekken', count(*) from public.boss_conversations
   where coalesce(updated_at, created_at) < now() - interval '12 months'
  union all
  select 'meldpunt', count(*) from public.meldingen
   where aangemaakt_op < now() - interval '2 years'
  union all
  select 'resettokens', count(*) from public.password_reset_tokens
   where created_at < now() - interval '24 hours'
  union all
  select 'aanmeldcodes', count(*) from public.email_verification_codes
   where created_at < now() - interval '24 hours'
$$;

-- Schermafbeeldingen van meldingen die weg mogen; de edge function haalt ze
-- uit de opslag vóór bb_opschoning_termijnen() de rijen verwijdert.
create or replace function public.bb_opschoning_meldpunt_bestanden()
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path to 'public', 'storage'
as $$
  select o.bucket_id, o.name
    from storage.objects o
    join public.meldingen m on m.screenshot_pad is not null and position(o.name in m.screenshot_pad) > 0
   where o.bucket_id = 'meldingen'
     and m.aangemaakt_op < now() - interval '2 years'
$$;

create or replace function public.bb_opschoning_termijnen()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v jsonb := '{}'::jsonb;
  n int;
begin
  delete from public.inquiries i
   where i.created_at < now() - interval '1 year'
     and i.company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca'::uuid;  -- BossBase Admin
  get diagnostics n = row_count; v := v || jsonb_build_object('contactformulier', n);

  delete from public.boss_conversations
   where coalesce(updated_at, created_at) < now() - interval '12 months';
  get diagnostics n = row_count; v := v || jsonb_build_object('boss_gesprekken', n);

  delete from public.meldingen
   where aangemaakt_op < now() - interval '2 years';
  get diagnostics n = row_count; v := v || jsonb_build_object('meldpunt', n);

  delete from public.password_reset_tokens    where created_at < now() - interval '24 hours';
  get diagnostics n = row_count; v := v || jsonb_build_object('resettokens', n);
  delete from public.email_verification_codes where created_at < now() - interval '24 hours';
  get diagnostics n = row_count; v := v || jsonb_build_object('aanmeldcodes', n);
  delete from public.password_reset_attempts     where window_start < now() - interval '24 hours';
  delete from public.email_verification_attempts where window_start < now() - interval '24 hours';

  return v;
end;
$$;

-- ── 7. Verzonden mails: zolang de klant bestaat ─────────────────────────────
-- Was SET NULL: de mail (met volledige inhoud) bleef staan zonder klant.
alter table public.sent_emails drop constraint sent_emails_customer_id_fkey;
alter table public.sent_emails
  add constraint sent_emails_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete cascade;

-- ── Rechten: alleen service_role ────────────────────────────────────────────
revoke all on function public.bb_opschoning_einde(uuid)                  from public, anon, authenticated;
revoke all on function public.bb_opschoning_bestanden(uuid)              from public, anon, authenticated;
revoke all on function public.bb_opschoning_gebruikers(uuid)             from public, anon, authenticated;
revoke all on function public.bb_opschoning_kandidaten(int)              from public, anon, authenticated;
revoke all on function public.bb_opschoning_verwijder(uuid, int)         from public, anon, authenticated;
revoke all on function public.bb_opschoning_termijnen_te_verwijderen()   from public, anon, authenticated;
revoke all on function public.bb_opschoning_meldpunt_bestanden()         from public, anon, authenticated;
revoke all on function public.bb_opschoning_termijnen()                  from public, anon, authenticated;
grant execute on function public.bb_opschoning_einde(uuid)                  to service_role;
grant execute on function public.bb_opschoning_bestanden(uuid)              to service_role;
grant execute on function public.bb_opschoning_gebruikers(uuid)             to service_role;
grant execute on function public.bb_opschoning_kandidaten(int)              to service_role;
grant execute on function public.bb_opschoning_verwijder(uuid, int)         to service_role;
grant execute on function public.bb_opschoning_termijnen_te_verwijderen()   to service_role;
grant execute on function public.bb_opschoning_meldpunt_bestanden()         to service_role;
grant execute on function public.bb_opschoning_termijnen()                  to service_role;

-- ── De uitkomst ─────────────────────────────────────────────────────────────
-- De cron komt in een aparte migratie, pas nadat de droogloop is bekeken.
select
  (select count(*) from public.bb_opschoning_kandidaten(2)) as bedrijven_nu,
  (select count(*) from pg_roles r, pg_proc p
    where p.proname like 'bb_opschoning_%' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as lekken;

commit;

notify pgrst, 'reload schema';
