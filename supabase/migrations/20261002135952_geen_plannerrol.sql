-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M17 (functioneel-b F-B13). De rol "planner" bestaat niet: in
-- profiles.role staan alleen admin en medewerker. Toch rekende de code met
-- planner als vangnet — in 21 policies, in bb_has_permission (een planner kreeg
-- álle rechten), in bb_mag_werkbon_uren_beheren en in bb_teamlid_bijwerken, en
-- CLAUDE.md beschreef "admin en planner als vangnet". Wat in de praktijk
-- gebeurde: alleen een admin kwam door, en een medewerker met het recht
-- "planning" (Pieter) kon niet de uren van anderen zien of boeken. Erger: de
-- schrijf-policies van offerte_items, werkbon_taken (insert/delete) en
-- werkbon_materialen (delete) lieten alleen admin/planner toe, dus een
-- medewerker met het recht offertes kon geen offerteregels opslaan.
--
-- Nu: overal het recht dat bij die tabel hoort in plaats van de rol.
--   urenregistratie                      eigen uren, of admin/planning
--   activiteit_notities                  schrijver, of admin/planning
--   deal_notities                        schrijver, of admin/verkoop
--   project_notes                        schrijver, of admin/projecten_bewerken
--   werkbon_notities                     schrijver, of admin/werkbonnen_bewerken
--   offerte_items                        recht offertes (zoals offertes zelf)
--   werkbon_taken (insert/delete),
--   werkbon_materialen (delete)          zelfde regel als hun update-policy
--   eigen_eenheden                       alleen admin (instelling)
-- bb_has_permission geeft alleen een admin alle rechten. bb_teamlid_bijwerken
-- accepteert de rol planner niet meer, en profiles.role mag alleen nog admin of
-- medewerker zijn (gemeten: 0 rijen met een andere waarde).

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
$function$;

CREATE OR REPLACE FUNCTION public.bb_mag_werkbon_uren_beheren(p_werkbon uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.werkbonnen w
    where w.id = p_werkbon
      and w.company_id = (select company_id from public.profiles where id = auth.uid())
      and (
        auth.uid() = any (w.assigned_to_ids)
        or auth.uid() = any (w.verantwoordelijke_ids)
        or coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
        or public.bb_has_permission('planning')
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.bb_teamlid_bijwerken(p_profile_id uuid, p_rol text DEFAULT NULL::text, p_naam text DEFAULT NULL::text, p_telefoon text DEFAULT NULL::text, p_uren numeric DEFAULT NULL::numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller         uuid := auth.uid();
  v_caller_rol     text;
  v_caller_company uuid;
  v_caller_super   boolean;
  v_company        uuid;
  v_rol_nu         text;
  v_eigenaar       uuid;
BEGIN
  -- Een gedeactiveerde gebruiker mag niets meer, ook niet met een access-token
  -- dat nog niet verlopen is (audit 2026-10-01, H6).
  if not public.bb_ik_ben_actief() then
    raise exception 'Dit account is gedeactiveerd.' using errcode = '42501';
  end if;
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd' USING ERRCODE = '28000';
  END IF;

  SELECT role, company_id, coalesce(is_super_admin, false)
    INTO v_caller_rol, v_caller_company, v_caller_super
    FROM public.profiles WHERE id = v_caller;

  SELECT company_id, role INTO v_company, v_rol_nu
    FROM public.profiles WHERE id = p_profile_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Teamlid niet gevonden' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_caller_super
     AND (v_caller_rol IS DISTINCT FROM 'admin' OR v_caller_company IS DISTINCT FROM v_company) THEN
    RAISE EXCEPTION 'Alleen een beheerder van dit bedrijf kan teamleden aanpassen.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_rol IS NOT NULL AND p_rol NOT IN ('admin', 'medewerker') THEN
    RAISE EXCEPTION 'Onbekende rol: %', p_rol USING ERRCODE = 'check_violation';
  END IF;

  SELECT eigenaar_id INTO v_eigenaar FROM public.companies WHERE id = v_company;

  -- De eigenaar is van zichzelf. Een andere beheerder blijft eraf.
  IF v_eigenaar IS NOT NULL AND p_profile_id = v_eigenaar
     AND v_caller <> v_eigenaar AND NOT v_caller_super THEN
    RAISE EXCEPTION 'De eigenaar van het account kan alleen door de eigenaar zelf worden aangepast.'
      USING ERRCODE = 'insufficient_privilege', HINT = 'eigenaar';
  END IF;

  -- De trigger vangt dit ook af; hier staat het voor de nette melding.
  IF p_rol IS NOT NULL AND v_rol_nu = 'admin' AND p_rol <> 'admin'
     AND public.bb_actieve_admins(v_company, p_profile_id) = 0 THEN
    RAISE EXCEPTION 'Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan.'
      USING ERRCODE = 'check_violation', HINT = 'laatste_admin';
  END IF;

  UPDATE public.profiles
     SET role      = coalesce(p_rol, role),
         full_name = coalesce(nullif(btrim(p_naam), ''), full_name)
   WHERE id = p_profile_id;

  -- Telefoon en uren staan niet op profiles maar op company_members. Bestaat
  -- die rij (lang niet altijd), houd hem dan gelijk.
  UPDATE public.company_members
     SET phone          = coalesce(p_telefoon, phone),
         hours_per_week = coalesce(p_uren, hours_per_week),
         full_name      = coalesce(nullif(btrim(p_naam), ''), full_name),
         role           = coalesce(p_rol, role),
         updated_at     = now()
   WHERE profile_id = p_profile_id;

  RETURN (SELECT row_to_json(x) FROM (
    SELECT p.id, p.company_id, p.full_name, p.role, p.actief, p.avatar_url, p.created_at
      FROM public.profiles p WHERE p.id = p_profile_id) x);
END;
$function$;

drop policy if exists activiteit_notities_update on public.activiteit_notities;
create policy activiteit_notities_update on public.activiteit_notities
  for update to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (created_by = auth.uid() or public.bb_is_admin_or_permission('planning')))
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()));
drop policy if exists activiteit_notities_delete on public.activiteit_notities;
create policy activiteit_notities_delete on public.activiteit_notities
  for delete to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (created_by = auth.uid() or public.bb_is_admin_or_permission('planning')));
drop policy if exists deal_notities_update on public.deal_notities;
create policy deal_notities_update on public.deal_notities
  for update to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (created_by = auth.uid() or public.bb_is_admin_or_permission('verkoop')))
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()));
drop policy if exists deal_notities_delete on public.deal_notities;
create policy deal_notities_delete on public.deal_notities
  for delete to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (created_by = auth.uid() or public.bb_is_admin_or_permission('verkoop')));
drop policy if exists project_notes_update on public.project_notes;
create policy project_notes_update on public.project_notes
  for update to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (created_by = auth.uid() or public.bb_is_admin_or_permission('projecten_bewerken')))
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()));
drop policy if exists project_notes_delete on public.project_notes;
create policy project_notes_delete on public.project_notes
  for delete to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (created_by = auth.uid() or public.bb_is_admin_or_permission('projecten_bewerken')));
drop policy if exists werkbon_notities_update on public.werkbon_notities;
create policy werkbon_notities_update on public.werkbon_notities
  for update to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (created_by = auth.uid() or public.bb_is_admin_or_permission('werkbonnen_bewerken')))
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()));
drop policy if exists werkbon_notities_delete on public.werkbon_notities;
create policy werkbon_notities_delete on public.werkbon_notities
  for delete to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (created_by = auth.uid() or public.bb_is_admin_or_permission('werkbonnen_bewerken')));
drop policy if exists eigen_eenheden_insert on public.eigen_eenheden;
create policy eigen_eenheden_insert on public.eigen_eenheden
  for insert to authenticated
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (select profiles.role from profiles where profiles.id = auth.uid()) = 'admin');
drop policy if exists eigen_eenheden_update on public.eigen_eenheden;
create policy eigen_eenheden_update on public.eigen_eenheden
  for update to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (select profiles.role from profiles where profiles.id = auth.uid()) = 'admin')
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (select profiles.role from profiles where profiles.id = auth.uid()) = 'admin');
drop policy if exists eigen_eenheden_delete on public.eigen_eenheden;
create policy eigen_eenheden_delete on public.eigen_eenheden
  for delete to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (select profiles.role from profiles where profiles.id = auth.uid()) = 'admin');
drop policy if exists offerte_items_insert on public.offerte_items;
create policy offerte_items_insert on public.offerte_items
  for insert to authenticated
  with check (company_id = current_company_id() and bb_has_permission('offertes'));
drop policy if exists offerte_items_update on public.offerte_items;
create policy offerte_items_update on public.offerte_items
  for update to authenticated
  using (company_id = current_company_id() and bb_has_permission('offertes'))
  with check (company_id = current_company_id() and bb_has_permission('offertes'));
drop policy if exists offerte_items_delete on public.offerte_items;
create policy offerte_items_delete on public.offerte_items
  for delete to authenticated
  using (company_id = current_company_id() and bb_has_permission('offertes'));
drop policy if exists urenregistratie_select on public.urenregistratie;
create policy urenregistratie_select on public.urenregistratie
  for select to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (profile_id = auth.uid() or public.bb_is_admin_or_permission('planning')));
drop policy if exists urenregistratie_insert on public.urenregistratie;
create policy urenregistratie_insert on public.urenregistratie
  for insert to authenticated
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (profile_id = auth.uid() or public.bb_is_admin_or_permission('planning')));
drop policy if exists urenregistratie_update on public.urenregistratie;
create policy urenregistratie_update on public.urenregistratie
  for update to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (profile_id = auth.uid() or public.bb_is_admin_or_permission('planning')))
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (profile_id = auth.uid() or public.bb_is_admin_or_permission('planning')));
drop policy if exists urenregistratie_delete on public.urenregistratie;
create policy urenregistratie_delete on public.urenregistratie
  for delete to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (profile_id = auth.uid() or public.bb_is_admin_or_permission('planning')));
drop policy if exists werkbon_taken_insert on public.werkbon_taken;
create policy werkbon_taken_insert on public.werkbon_taken
  for insert to authenticated
  with check (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and exists (select 1 from werkbonnen w where w.id = werkbon_taken.werkbon_id and w.company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (bb_gedeelde_werkruimte() or bb_has_permission('werkbonnen_bewerken') or auth.uid() = any (w.verantwoordelijke_ids))));
drop policy if exists werkbon_taken_delete on public.werkbon_taken;
create policy werkbon_taken_delete on public.werkbon_taken
  for delete to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and exists (select 1 from werkbonnen w where w.id = werkbon_taken.werkbon_id and w.company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (bb_gedeelde_werkruimte() or bb_has_permission('werkbonnen_bewerken') or auth.uid() = any (w.verantwoordelijke_ids))));
drop policy if exists werkbon_materialen_delete on public.werkbon_materialen;
create policy werkbon_materialen_delete on public.werkbon_materialen
  for delete to authenticated
  using (company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and exists (select 1 from werkbonnen w where w.id = werkbon_materialen.werkbon_id and w.company_id = (select profiles.company_id from profiles where profiles.id = auth.uid()) and (bb_gedeelde_werkruimte() or bb_has_permission('werkbonnen_bewerken') or auth.uid() = any (w.verantwoordelijke_ids))));

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'medewerker'));

notify pgrst, 'reload schema';

select
  (select count(*) from pg_policies where coalesce(qual, '') || coalesce(with_check, '') like '%planner%') as policies_met_planner_moet_0,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and pg_get_functiondef(oid) like '%''planner''%') as functies_met_planner_moet_0;

commit;
