-- ── Terugdraaien van 20261004200000_rechten_binnen_eigen_bedrijf ────────────
-- Zet de drie functies en de veertien policies terug zoals ze op 4-10-2026 in
-- de catalogus stonden (gegenereerd, niet overgetypt). LET OP: daarmee telt een
-- recht uit een ander bedrijf weer mee, en geeft de gedeelde werkruimte weer
-- inzage in deals, offertes, facturen, kosten, tijdlijn, mailarchief, PDF's en
-- bijlagen. De controle op een gedeactiveerd account blijft staan; die zat al
-- in de stand waar dit naar terugkeert.
begin;

CREATE OR REPLACE FUNCTION public.bb_has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = 'admin' and actief is not false from profiles where id = auth.uid()), false)
    or (exists (select 1 from user_permissions where user_id = auth.uid() and permission = p_permission and granted)
        and coalesce((select actief is not false from profiles where id = auth.uid()), false));
$function$
;

CREATE OR REPLACE FUNCTION public.bb_is_admin_or_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = 'admin' and actief is not false from profiles where id = auth.uid()), false)
    or (exists (select 1 from user_permissions where user_id = auth.uid() and permission = p_permission and granted)
        and coalesce((select actief is not false from profiles where id = auth.uid()), false));
$function$
;

CREATE OR REPLACE FUNCTION public.bb_mag_inkoopprijs_zien()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
      or exists (
        select 1 from user_permissions
        where user_id = auth.uid() and permission = 'inkoopprijzen' and granted
      );
$function$
;

alter policy "deal_notities_select" on public.deal_notities
  using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT (bb_gedeelde_werkruimte() OR bb_has_permission('verkoop'::text)))));

alter policy "deals_select" on public.deals
  using (((company_id = ( SELECT p.company_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ( SELECT (bb_gedeelde_werkruimte() OR bb_has_permission('verkoop'::text)))));

alter policy "facturen_select" on public.facturen
  using (((company_id = current_company_id()) AND ( SELECT (bb_gedeelde_werkruimte() OR bb_has_permission('facturen'::text)))));

alter policy "factuur_regels_select" on public.factuur_regels
  using (((company_id = current_company_id()) AND ( SELECT (bb_gedeelde_werkruimte() OR bb_has_permission('facturen'::text)))));

alter policy "Users can delete own company job costs" on public.job_costs
  using (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

alter policy "Users can insert own company job costs" on public.job_costs
  with check (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

alter policy "Users can update own company job costs" on public.job_costs
  using (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))))
  with check (((company_id = current_company_id()) AND (bb_has_permission('kosten'::text) OR ((werkbon_id IS NOT NULL) AND (bb_gedeelde_werkruimte() OR bb_has_permission('werkbonnen_bewerken'::text) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

alter policy "Users can view own company job costs" on public.job_costs
  using (((company_id = current_company_id()) AND (( SELECT (bb_gedeelde_werkruimte() OR bb_has_permission('kosten'::text))) OR ((werkbon_id IS NOT NULL) AND (( SELECT bb_has_permission('werkbonnen_bewerken'::text) AS bb_has_permission) OR (EXISTS ( SELECT 1
   FROM werkbonnen w
  WHERE ((w.id = job_costs.werkbon_id) AND (w.company_id = current_company_id()) AND (auth.uid() = ANY (w.verantwoordelijke_ids))))))))));

alter policy "klant_tijdlijn_select" on public.klant_tijdlijn
  using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND (( SELECT bb_gedeelde_werkruimte() AS bb_gedeelde_werkruimte) OR bb_tijdlijn_recht_ok(type))));

alter policy "offerte_items_select" on public.offerte_items
  using (((company_id = current_company_id()) AND ( SELECT (bb_gedeelde_werkruimte() OR bb_has_permission('offertes'::text)))));

alter policy "offertes_select" on public.offertes
  using (((company_id = current_company_id()) AND ( SELECT (bb_gedeelde_werkruimte() OR bb_has_permission('offertes'::text)))));

alter policy "sent_emails_select" on public.sent_emails
  using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND (( SELECT bb_gedeelde_werkruimte() AS bb_gedeelde_werkruimte) OR bb_mail_recht_ok(related_type))));

alter policy "factuur_pdfs_select" on storage.objects
  using (((bucket_id = 'factuur-pdfs'::text) AND ((storage.foldername(name))[1] = (current_user_company_id())::text) AND ( SELECT (bb_gedeelde_werkruimte() OR bb_is_admin_or_permission('facturen'::text)))));

alter policy "kosten_bijlagen_select" on storage.objects
  using (((bucket_id = 'kosten-bijlagen'::text) AND ((storage.foldername(name))[1] = (current_user_company_id())::text) AND ( SELECT (bb_gedeelde_werkruimte() OR bb_is_admin_or_permission('kosten'::text) OR bb_has_permission('werkbonnen_bewerken'::text)))));

update public.plan_feature_defs
   set uitleg = 'Iedereen ziet alles van het bedrijf zonder rechtenbeheer: agenda, projecten, werkbonnen, deals, offertes, facturen en kosten. Past bij een bedrijf van één of twee personen.'
 where feature = 'gedeelde_werkruimte';

select (select prosrc ~ 'ik.company_id' from pg_proc where oid = 'public.bb_has_permission(text)'::regprocedure) as bedrijfscontrole_nog,
       (select count(*) from pg_policies where schemaname in ('public','storage')
          and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'bb_gedeelde_werkruimte') as policies_met_werkruimte;

commit;

notify pgrst, 'reload schema';
