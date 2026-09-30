-- Droogloop van de opschoonjob tegen productie: ALLEEN LEZEN, alleen aantallen.
-- Geen namen, e-mailadressen of id's in de uitvoer.
--   supabase db query --linked -f supabase/tests/opschonen_droogloop.sql
--
-- Gebruikt de selectieregels van 20260930083452 (einde abonnement) en de
-- gecorrigeerde bestandsregel van 20260930160000 (inline, want die migratie is
-- nog niet uitgerold). Termijn: 2 jaar (voorstel, niet goedgekeurd).
with einde as (
  select c.id,
         public.bb_opschoning_einde(c.id) as einde,
         case
           when s.stripe_subscription_id is not null and s.status in ('actief','trial','betaalprobleem') then 'lopend Stripe-abonnement'
           when s.status = 'opgezegd' then 'Stripe-abonnement beëindigd'
           when c.status = 'opgezegd' then 'opgezegd via de app, geen lopend abonnement'
           when s.status = 'trial' and s.stripe_subscription_id is null then 'proefperiode zonder betaald abonnement'
           else 'overig (bv. handmatig actief, geen Stripe)'
         end as soort
    from public.companies c
    left join lateral (select * from public.subscriptions x where x.company_id = c.id order by x.created_at desc limit 1) s on true
), verwijzingen(company_id, u) as (
            select company_id, signature_url from public.offertes union all select company_id, signed_pdf_url from public.offertes
  union all select company_id, handtekening_url from public.werkbonnen union all select company_id, ondertekende_pdf_url from public.werkbonnen
  union all select company_id, url from public.werkbon_fotos union all select company_id, url from public.project_fotos
  union all select company_id, bijlage_url from public.job_costs union all select company_id, logo_url from public.customers
  union all select id, logo_url from public.companies union all select company_id, avatar_url from public.profiles
  union all select company_id, avatar_url from public.company_members union all select company_id, screenshot_pad from public.meldingen
), vw as (
  select distinct v.company_id, o.bucket_id, o.name from verwijzingen v join storage.objects o on v.u is not null and (
     v.u = o.name or v.u = o.bucket_id || '/' || o.name
     or (position('/' || o.bucket_id || '/' || o.name in v.u) > 0
         and substr(v.u, position('/' || o.bucket_id || '/' || o.name in v.u) + length(o.bucket_id) + length(o.name) + 2, 1) !~ '[A-Za-z0-9._%/-]'))
)
select json_build_object(
  'peildatum', now()::date,
  'termijn', '2 jaar na einde abonnement (voorstel)',
  'bedrijven_per_soort', (select json_agg(json_build_object(
        'soort', soort, 'aantal', n, 'nu_te_verwijderen', nu, 'eerste_verwijderdatum', eerste) order by soort)
      from (select soort, count(*) n,
                   count(*) filter (where einde < now() - interval '2 years') nu,
                   (min(einde) + interval '2 years')::date eerste
              from einde group by soort) x),
  'uitzonderingen', json_build_object(
      'superbeheerders_nooit_verwijderd', (select count(*) from public.profiles where is_super_admin),
      'profielen_ook_lid_van_ander_bedrijf', (select count(distinct m.profile_id) from public.company_members m join public.profiles p on p.id = m.profile_id where m.company_id <> p.company_id),
      'bestanden_door_meer_dan_een_bedrijf_gebruikt', (select count(*) from (select bucket_id, name from vw group by 1, 2 having count(distinct company_id) > 1) x),
      'bestanden_zonder_verwijzing_en_niet_in_bedrijfsmap', (select count(*) from storage.objects o
          where not exists (select 1 from vw where vw.bucket_id = o.bucket_id and vw.name = o.name)
            and split_part(o.name, '/', 1) not in (select id::text from public.companies))),
  'losse_termijnen_nu', (select json_agg(json_build_object('soort', soort, 'aantal', aantal)) from public.bb_opschoning_termijnen_te_verwijderen()),
  'cron_actief', exists (select 1 from cron.job where jobname = 'opschonen-daily' and active)
) as droogloop;
