-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, H5 (drift D1, sec-rollen 3, functioneel A6) en M4.
--
-- Permissieve policies worden met OF gecombineerd. Op een aantal tabellen stond
-- een policy die alleen op het bedrijf filterde — deels oude dashboardpolicies
-- die in geen migratie voorkwamen. Die hieven de strengere regels op. Gemeten
-- als medewerker zonder enig recht (Groei): pipelinefasen, materialen, alle
-- activiteiten, sent_emails en klant_tijdlijn wijzigen én verwijderen lukte
-- (één update raakte 14 fasen en 350 activiteiten).
--
-- Deze migratie zet per tabel één set policies neer, met de bedoelde rechten:
--   pipeline_stages  schrijven: alleen admin (zoals 004/20260921144345 bedoelden)
--   activities       wijzigen/verwijderen: planning, of toegewezen aan jou, of
--                    bij een deal met recht verkoop, of bij een werkbon met
--                    werkbonnen_bewerken, of nog aan niemand toegewezen
--   materialen       aanmaken/wijzigen/verwijderen: recht inkoopprijzen (de
--                    bibliotheek bevat inkoopprijzen; dat recht toont ze ook)
--   voertuigen       aanmaken/wijzigen/verwijderen: admin of planning
--   sent_emails      leden mogen alleen toevoegen (mailarchief), zonder
--                    appointment_id — dat is de dubbelpost-sleutel van de cron
--   klant_tijdlijn   leden mogen alleen toevoegen; wijzigen/verwijderen niet
--   customers        toevoegen: klanten_bewerken, verkoop, offertes,
--                    werkbonnen_bewerken of planning (de flows die een klant
--                    aanmaken); wijzigen/verwijderen bleef al op recht
--   leveranciers     toevoegen: klanten_bewerken of kosten
--   calendar_events  toevoegen: planning/werkbonnen_bewerken/verkoop, of voor jezelf
--   factuur_regels   schrijven op recht facturen in plaats van op rol
-- Lezen verandert niet (Groei-werkruimte blijft gedeeld).
--
-- mark_factuur_betaald (M4): een ingelogde aanroeper moet recht facturen hebben.
-- De Stripe-webhook (service_role, geen auth.uid()) blijft werken.

begin;

-- ── pipeline_stages ─────────────────────────────────────────────────────────
drop policy if exists "Users can insert own company pipeline stages" on public.pipeline_stages;
drop policy if exists "Users can update own company pipeline stages" on public.pipeline_stages;
drop policy if exists "Users can delete own company pipeline stages" on public.pipeline_stages;
drop policy if exists "Users can view own company pipeline stages" on public.pipeline_stages;
drop policy if exists pipeline_stages_update on public.pipeline_stages;
create policy pipeline_stages_update on public.pipeline_stages for update to authenticated
  using (company_id = public.current_company_id()
         and (select p.role from public.profiles p where p.id = auth.uid()) = 'admin')
  with check (company_id = public.current_company_id()
         and (select p.role from public.profiles p where p.id = auth.uid()) = 'admin');

-- ── activities ──────────────────────────────────────────────────────────────
drop policy if exists "Users can update own company activities" on public.activities;
drop policy if exists "Users can delete own company activities" on public.activities;
drop policy if exists "Users can insert own company activities" on public.activities;
create policy activities_insert on public.activities for insert to authenticated
  with check (company_id = public.current_company_id());
create policy activities_update on public.activities for update to authenticated
  using (company_id = public.current_company_id() and (
           public.bb_has_permission('planning')
        or assigned_to = auth.uid() or auth.uid() = any (assigned_to_ids)
        or (assigned_to is null and coalesce(cardinality(assigned_to_ids), 0) = 0)
        or (deal_id is not null and public.bb_has_permission('verkoop'))
        or (public.bb_has_permission('werkbonnen_bewerken')
            and exists (select 1 from public.werkbonnen w where w.activity_id = activities.id))))
  with check (company_id = public.current_company_id());
create policy activities_delete on public.activities for delete to authenticated
  using (company_id = public.current_company_id() and (
           public.bb_has_permission('planning')
        or assigned_to = auth.uid() or auth.uid() = any (assigned_to_ids)
        or (assigned_to is null and coalesce(cardinality(assigned_to_ids), 0) = 0)
        or (deal_id is not null and public.bb_has_permission('verkoop'))
        or (public.bb_has_permission('werkbonnen_bewerken')
            and exists (select 1 from public.werkbonnen w where w.activity_id = activities.id))));

-- ── materialen ──────────────────────────────────────────────────────────────
drop policy if exists materialen_insert on public.materialen;
drop policy if exists materialen_update on public.materialen;
drop policy if exists materialen_delete on public.materialen;
create policy materialen_insert on public.materialen for insert to authenticated
  with check (company_id = public.current_company_id() and public.bb_mag_schrijven()
              and public.bb_has_permission('inkoopprijzen'));
create policy materialen_update on public.materialen for update to authenticated
  using (company_id = public.current_company_id() and public.bb_has_permission('inkoopprijzen'))
  with check (company_id = public.current_company_id());
create policy materialen_delete on public.materialen for delete to authenticated
  using (company_id = public.current_company_id() and public.bb_has_permission('inkoopprijzen'));

-- ── voertuigen ──────────────────────────────────────────────────────────────
drop policy if exists voertuigen_insert on public.voertuigen;
drop policy if exists voertuigen_update on public.voertuigen;
drop policy if exists voertuigen_delete on public.voertuigen;
create policy voertuigen_insert on public.voertuigen for insert to authenticated
  with check (company_id = public.current_company_id() and public.bb_is_admin_or_permission('planning'));
create policy voertuigen_update on public.voertuigen for update to authenticated
  using (company_id = public.current_company_id() and public.bb_is_admin_or_permission('planning'))
  with check (company_id = public.current_company_id());
create policy voertuigen_delete on public.voertuigen for delete to authenticated
  using (company_id = public.current_company_id() and public.bb_is_admin_or_permission('planning'));

-- ── sent_emails ─────────────────────────────────────────────────────────────
drop policy if exists sent_emails_company on public.sent_emails;
create policy sent_emails_select on public.sent_emails for select to authenticated
  using (company_id = public.current_company_id());
create policy sent_emails_insert on public.sent_emails for insert to authenticated
  with check (company_id = public.current_company_id() and appointment_id is null);

-- ── klant_tijdlijn ──────────────────────────────────────────────────────────
drop policy if exists "company members can manage klant_tijdlijn" on public.klant_tijdlijn;
create policy klant_tijdlijn_select on public.klant_tijdlijn for select to authenticated
  using (company_id = public.current_company_id());
create policy klant_tijdlijn_insert on public.klant_tijdlijn for insert to authenticated
  with check (company_id = public.current_company_id());

-- ── customers / leveranciers / calendar_events: toevoegen met recht ──────────
drop policy if exists "Users can insert own company customers" on public.customers;
create policy customers_insert on public.customers for insert to authenticated
  with check (company_id = public.current_company_id() and (
       public.bb_has_permission('klanten_bewerken') or public.bb_has_permission('verkoop')
    or public.bb_has_permission('offertes') or public.bb_has_permission('werkbonnen_bewerken')
    or public.bb_has_permission('planning')));

drop policy if exists "Users can insert own company leveranciers" on public.leveranciers;
create policy leveranciers_insert on public.leveranciers for insert to authenticated
  with check (company_id = public.current_company_id() and (
       public.bb_has_permission('klanten_bewerken') or public.bb_has_permission('kosten')));

drop policy if exists "Users can insert own company calendar events" on public.calendar_events;
create policy calendar_events_insert on public.calendar_events for insert to authenticated
  with check (company_id = public.current_company_id() and (
       public.bb_has_permission('planning') or public.bb_has_permission('werkbonnen_bewerken')
    or public.bb_has_permission('verkoop') or assigned_to = auth.uid() or assigned_to is null));

-- ── factuur_regels: recht facturen i.p.v. rol ───────────────────────────────
drop policy if exists factuur_regels_insert on public.factuur_regels;
drop policy if exists factuur_regels_update on public.factuur_regels;
drop policy if exists factuur_regels_delete on public.factuur_regels;
create policy factuur_regels_insert on public.factuur_regels for insert to authenticated
  with check (company_id = public.current_company_id() and public.bb_has_permission('facturen'));
create policy factuur_regels_update on public.factuur_regels for update to authenticated
  using (company_id = public.current_company_id() and public.bb_has_permission('facturen'))
  with check (company_id = public.current_company_id() and public.bb_has_permission('facturen'));
create policy factuur_regels_delete on public.factuur_regels for delete to authenticated
  using (company_id = public.current_company_id() and public.bb_has_permission('facturen'));

-- ── mark_factuur_betaald: recht facturen voor ingelogde aanroepers ──────────
create or replace function public.mark_factuur_betaald(p_factuur_id uuid, p_betaald_op date default null::date, p_stripe_status text default null::text, p_stripe_intent text default null::text, p_expected_company_id uuid default null::uuid, p_expected_amount_cents bigint default null::bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v facturen;
  v_company_id   uuid;
  v_total_cents  bigint;
begin
  -- User-pad: eigen bedrijf, actief account én recht facturen. Service-role
  -- (auth.uid() is null, de Stripe-webhook) levert de verwachtingen aan.
  if auth.uid() is not null then
    if not public.bb_ik_ben_actief() then
      raise exception 'Dit account is gedeactiveerd.' using errcode = '42501';
    end if;
    if not public.bb_has_permission('facturen') then
      raise exception 'Je hebt geen recht om facturen te beheren.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from facturen f join profiles p on p.company_id = f.company_id
      where f.id = p_factuur_id and p.id = auth.uid()
    ) then
      raise exception 'geen toegang tot deze factuur';
    end if;
  end if;

  select company_id, round(totaal_incl * 100)::bigint
    into v_company_id, v_total_cents
    from public.facturen
   where id = p_factuur_id;

  if not found then
    return jsonb_build_object('changed', false);
  end if;

  if p_expected_company_id is not null
     and p_expected_company_id is distinct from v_company_id then
    raise exception 'company mismatch voor factuur % (verwacht %, factuur %)',
      p_factuur_id, p_expected_company_id, v_company_id;
  end if;

  if p_expected_amount_cents is not null
     and p_expected_amount_cents is distinct from v_total_cents then
    raise exception 'bedrag mismatch voor factuur % (betaald %, factuur %)',
      p_factuur_id, p_expected_amount_cents, v_total_cents;
  end if;

  update public.facturen
     set status = 'betaald',
         betaald_op = coalesce(p_betaald_op, betaald_op, current_date),
         stripe_payment_status = coalesce(p_stripe_status, stripe_payment_status),
         stripe_payment_intent_id = coalesce(p_stripe_intent, stripe_payment_intent_id),
         updated_at = now()
   where id = p_factuur_id
     and status is distinct from 'betaald'
  returning * into v;

  if not found then
    return jsonb_build_object('changed', false);
  end if;

  return jsonb_build_object(
    'changed', true,
    'customer_id', v.customer_id,
    'company_id', v.company_id,
    'nummer', v.nummer,
    'totaal_incl', v.totaal_incl
  );
end;
$function$;

notify pgrst, 'reload schema';

select
  (select count(*) from pg_policies where schemaname = 'public' and policyname like 'Users can %'
      and tablename in ('pipeline_stages','activities','customers','leveranciers','calendar_events')
      and cmd <> 'SELECT' and cmd <> 'DELETE' and cmd <> 'UPDATE') as oude_insert_policies_moet_0,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'mark_factuur_betaald' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as mark_rechten;

commit;
