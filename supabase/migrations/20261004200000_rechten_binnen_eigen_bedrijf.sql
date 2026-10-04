-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Productbesluit van 4 oktober 2026, twee regels die de database nog niet
-- afdwong:
--
--   * Een recht telt alleen binnen het eigen bedrijf.
--   * De gedeelde werkruimte (Groei) geeft operationele samenwerking: agenda,
--     projecten, werkbonnen, taken, materialen, dagen, foto's. Geen pipeline,
--     offertes, facturen, kosten of omzet.
--
-- ── 1. Een recht telt alleen binnen het eigen bedrijf ──────────────────────
-- bb_has_permission(), bb_is_admin_or_permission() en bb_mag_inkoopprijs_zien()
-- zochten in user_permissions alleen op user_id. Een rij met het company_id
-- van een ander bedrijf telde dus ook. 20261004190000 zorgt dat zo'n rij niet
-- meer via de app kan ontstaan; hier krijgen de functies de controle zelf,
-- zodat een rij die er langs een andere weg komt nooit een recht oplevert.
-- Op productie stonden er op 4-10-2026 nul van (33 rijen gecontroleerd).
--
-- De controle op een gedeactiveerd account uit 20261002132803 blijft staan:
-- actief, en dan admin of een recht. bb_mag_inkoopprijs_zien() krijgt die
-- controle er nu ook bij; hij miste hem nog.
--
-- ── 2. Gedeelde werkruimte uit de financiele policies ───────────────────────
-- Sinds 20260919220742 (deals, facturen, offertes, kosten) en 20261002182241
-- (factuur- en offerteregels) gaf de feature inzage zonder recht, en via
-- 20261002134307 ook in de klanttijdlijn en het mailarchief, en via
-- 20261002182831 in de factuur-PDF's en kostenbijlagen in de opslag. Dat was
-- destijds de oplossing voor "een recht dat niemand kan toekennen is een
-- blokkade"; sinds 20261004190000 kan de beheerder van een Groei-bedrijf het
-- recht wél toekennen, en dan hoort de feature geen vervanging meer te zijn.
--
-- Veertien policies, elk letterlijk de huidige definitie minus de
-- werkruimte-tak (gegenereerd uit pg_policies, niet overgetypt):
--
--   deals_select, deal_notities_select                      verkoop
--   offertes_select, offerte_items_select                   offertes
--   facturen_select, factuur_regels_select                  facturen
--   job_costs: view, insert, update, delete                 kosten, of op een
--                                                           werkbon werkbonnen_bewerken
--                                                           of verantwoordelijke
--   klant_tijdlijn_select                                   bb_tijdlijn_recht_ok(type):
--                                                           financiele regels op recht,
--                                                           de rest voor iedereen
--   sent_emails_select                                      bb_mail_recht_ok(related_type): idem
--   storage factuur_pdfs_select                             facturen
--   storage kosten_bijlagen_select                          kosten of werkbonnen_bewerken
--
-- Niet geraakt, bewust: activities, calendar_events, projects, werkbonnen,
-- werkbon_taken, werkbon_materialen, werkbon_dagen, werkbon_fotos,
-- project_fotos (ook in de opslag). Dat is de samenwerking.
--
-- GEVOLG: in een Groei-bedrijf ziet de tweede persoon zonder recht daarna geen
-- pipeline, offertes, facturen en kosten meer. De beheerder kent het recht toe
-- onder Team → Rechten. Wie het recht al als rij had, merkt niets.
--
-- Terugdraaien: supabase/rollback/20261004200000_rechten_binnen_eigen_bedrijf.rollback.sql

begin;

-- ── 1. De rechtenfuncties ───────────────────────────────────────────────────
-- Zelfde signaturen: CREATE OR REPLACE, de grants blijven staan
-- (authenticated en service_role).
create or replace function public.bb_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select actief is not false from profiles where id = auth.uid()), false)
     and (
          coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
       or exists (select 1
                    from user_permissions up
                    join profiles ik on ik.id = up.user_id
                   where up.user_id = auth.uid()
                     and up.permission = p_permission
                     and up.granted
                     and up.company_id = ik.company_id)
     );
$function$;

comment on function public.bb_has_permission(text) is
  'Actief account, en dan admin of een expliciet toegekend recht uit user_permissions van het eigen bedrijf. Een rij met een ander company_id telt niet (20261004200000).';

create or replace function public.bb_is_admin_or_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select actief is not false from profiles where id = auth.uid()), false)
     and (
          coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
       or exists (select 1
                    from user_permissions up
                    join profiles ik on ik.id = up.user_id
                   where up.user_id = auth.uid()
                     and up.permission = p_permission
                     and up.granted
                     and up.company_id = ik.company_id)
     );
$function$;

create or replace function public.bb_mag_inkoopprijs_zien()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select actief is not false from profiles where id = auth.uid()), false)
     and (
          coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
       or exists (select 1
                    from user_permissions up
                    join profiles ik on ik.id = up.user_id
                   where up.user_id = auth.uid()
                     and up.permission = 'inkoopprijzen'
                     and up.granted
                     and up.company_id = ik.company_id)
     );
$function$;

-- ── 2. Gedeelde werkruimte uit de financiele policies ───────────────────────
alter policy "deal_notities_select" on public.deal_notities
  using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT bb_has_permission('verkoop'::text))));

alter policy "deals_select" on public.deals
  using (((company_id = ( SELECT p.company_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ( SELECT bb_has_permission('verkoop'::text))));

alter policy "facturen_select" on public.facturen
  using (((company_id = current_company_id()) AND ( SELECT bb_has_permission('facturen'::text))));

alter policy "factuur_regels_select" on public.factuur_regels
  using (((company_id = current_company_id()) AND ( SELECT bb_has_permission('facturen'::text))));

alter policy "Users can delete own company job costs" on public.job_costs
  using (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

alter policy "Users can insert own company job costs" on public.job_costs
  with check (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

alter policy "Users can update own company job costs" on public.job_costs
  using (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))))
  with check (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

alter policy "Users can view own company job costs" on public.job_costs
  using (((company_id = current_company_id()) AND (( SELECT bb_has_permission('kosten'::text)) OR ((werkbon_id IS NOT NULL) AND (( SELECT bb_has_permission('werkbonnen_bewerken'::text) AS bb_has_permission) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

alter policy "klant_tijdlijn_select" on public.klant_tijdlijn
  using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND bb_tijdlijn_recht_ok(type)));

alter policy "offerte_items_select" on public.offerte_items
  using (((company_id = current_company_id()) AND ( SELECT bb_has_permission('offertes'::text))));

alter policy "offertes_select" on public.offertes
  using (((company_id = current_company_id()) AND ( SELECT bb_has_permission('offertes'::text))));

alter policy "sent_emails_select" on public.sent_emails
  using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND bb_mail_recht_ok(related_type)));

alter policy "factuur_pdfs_select" on storage.objects
  using (((bucket_id = 'factuur-pdfs'::text) AND ((storage.foldername(name))[1] = (current_user_company_id())::text) AND ( SELECT bb_is_admin_or_permission('facturen'::text))));

alter policy "kosten_bijlagen_select" on storage.objects
  using (((bucket_id = 'kosten-bijlagen'::text) AND ((storage.foldername(name))[1] = (current_user_company_id())::text) AND ( SELECT (bb_is_admin_or_permission('kosten'::text) OR bb_has_permission('werkbonnen_bewerken'::text)))));

-- De uitleg van de feature weer in lijn met wat hij doet.
update public.plan_feature_defs
   set uitleg = 'Iedereen ziet elkaars agenda, projecten en werkbonnen zonder rechtenbeheer. Offertes, facturen, pipeline en kosten vragen een recht. Past bij een bedrijf van één of twee personen.'
 where feature = 'gedeelde_werkruimte';

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('bb_has_permission', 'bb_is_admin_or_permission', 'bb_mag_inkoopprijs_zien')
      and prosrc ~ 'up.company_id = ik.company_id'
      and prosrc ~ 'actief is not false')                                              as functies_met_bedrijfs_en_actiefcontrole,
  (select count(*) from pg_policies
    where ((schemaname = 'public'
              and tablename in ('deals', 'deal_notities', 'offertes', 'offerte_items', 'facturen',
                                'factuur_regels', 'job_costs', 'project_kosten', 'klant_tijdlijn',
                                'sent_emails', 'inquiries', 'website_forms'))
        or (schemaname = 'storage' and policyname in ('factuur_pdfs_select', 'kosten_bijlagen_select')))
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'bb_gedeelde_werkruimte') as financiele_policies_met_werkruimte,
  (select count(*) from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'bb_gedeelde_werkruimte') as operationele_policies_met_werkruimte,
  (select string_agg(p.proname || ':' || coalesce((select string_agg(r.rolname, '+' order by r.rolname) from pg_roles r
            where r.rolname in ('anon', 'authenticated', 'service_role')
              and has_function_privilege(r.rolname, p.oid, 'EXECUTE')), '-'), ' ' order by p.proname)
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('bb_has_permission', 'bb_is_admin_or_permission', 'bb_mag_inkoopprijs_zien')) as uitvoerrechten;

commit;

notify pgrst, 'reload schema';
