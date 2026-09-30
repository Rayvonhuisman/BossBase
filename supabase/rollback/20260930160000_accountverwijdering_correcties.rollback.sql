-- ── Terugdraaien van 20260930160000_accountverwijdering_correcties ──────────
-- Zet de functies terug zoals ze op productie stonden vóór deze migratie
-- (letterlijk uit de catalogus, 30-09-2026) en haalt de nieuwe objecten weg.
--
-- Wat hiermee NIET terugkomt:
-- - Accounts die met de nieuwe functies zijn gedeactiveerd, blijven geblokkeerd
--   en hun sessies blijven weg. Heractiveren per account (bewust, niet in bulk):
--     update auth.users set banned_until = null where id = '<id>';
--     update public.profiles set actief = true, verwijderd_op = null where id = '<id>';
-- - Wat de opschoonjob al heeft verwijderd (alleen als hij heeft gedraaid; de
--   cron staat niet aan). Verwijderde rijen, bestanden en inlogaccounts zijn
--   alleen terug te halen uit een back-up.

begin;

drop trigger if exists bb_companies_bewaken on public.companies;
drop function if exists public.bb_companies_bewaken();

CREATE OR REPLACE FUNCTION public.delete_own_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.profiles
     set actief = false, verwijderd_op = coalesce(verwijderd_op, now())
   where id = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_company_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_company uuid; v_role text;
begin
  select company_id, role into v_company, v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'admin' then
    raise exception 'Alleen een beheerder kan het bedrijf opzeggen';
  end if;
  if v_company is null then
    raise exception 'Geen bedrijf gekoppeld aan dit account';
  end if;
  update public.companies set status = 'opgezegd', opgezegd_op = coalesce(opgezegd_op, now()) where id = v_company;
  update public.profiles set actief = false, verwijderd_op = coalesce(verwijderd_op, now()) where company_id = v_company;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bb_opschoning_bestanden(p_company uuid)
 RETURNS TABLE(bucket_id text, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.bb_opschoning_verwijder(p_company uuid, p_jaren integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

drop function if exists public.bb_toegang_beeindigen(uuid[]);
drop function if exists public.bb_verwijst_naar(text, text, text);

-- Rechten zoals vóór de migratie (bb_opschoning_*: alleen service_role).
revoke all on function public.bb_opschoning_bestanden(uuid)      from public, anon, authenticated;
revoke all on function public.bb_opschoning_verwijder(uuid, int) from public, anon, authenticated;
grant execute on function public.bb_opschoning_bestanden(uuid)      to service_role;
grant execute on function public.bb_opschoning_verwijder(uuid, int) to service_role;
grant execute on function public.delete_own_account()     to authenticated, service_role;
grant execute on function public.cancel_company_account() to authenticated, service_role;

select count(*) as nieuwe_objecten_over from pg_proc
 where pronamespace = 'public'::regnamespace and proname in ('bb_companies_bewaken', 'bb_toegang_beeindigen', 'bb_verwijst_naar');

commit;

notify pgrst, 'reload schema';
