-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M1. Op Team ziet een medewerker zonder het recht facturen,
-- offertes of verkoop de deals, facturen en offertes zelf terecht niet (0 rijen),
-- maar wel de bijtabellen, die alleen op bedrijf filterden:
--   - klant_tijdlijn: regels als "Factuur BB-F151 betaald (€17075.04)" —
--     298 regels met bedragen, genoeg om de omzet te reconstrueren;
--   - deal_notities: alle verkoopnotities (67);
--   - sent_emails: ontvanger, onderwerp en soms de volledige mailtekst.
--
-- Nu volgt elk van deze tabellen hetzelfde recht als de tabel waar hij bij hoort.
-- Op Groei (gedeelde werkruimte) verandert er niets: daar ziet iedereen alles,
-- bewust. Admins zien alles (bb_has_permission geeft voor admin true).
--
-- Projectbedragen (projects.project_value, werkbon_materialen-prijzen) blijven
-- een schermafscherming: RLS kan geen kolommen verbergen en de app leest die
-- tabellen op tientallen plekken met *. De rechtenuitleg zegt dat nu eerlijk.

begin;

-- Welk recht hoort bij een tijdlijnregel? NULL = geen verkoopinformatie, mag elk
-- lid van het bedrijf zien (klant aangemaakt, afspraak, notitie, werkbon, …).
create or replace function public.bb_tijdlijn_recht_ok(p_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_type like 'factuur%' then public.bb_has_permission('facturen')
    when p_type like 'offerte%' then public.bb_has_permission('offertes')
    when p_type like 'deal%'    then public.bb_has_permission('verkoop')
    when p_type = 'email_verstuurd' then public.bb_has_permission('facturen')
                                      or public.bb_has_permission('offertes')
                                      or public.bb_has_permission('verkoop')
    else true
  end
$$;
revoke all on function public.bb_tijdlijn_recht_ok(text) from public, anon, authenticated;
grant execute on function public.bb_tijdlijn_recht_ok(text) to authenticated, service_role;

create or replace function public.bb_mail_recht_ok(p_related_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_related_type = 'factuur' then public.bb_has_permission('facturen')
    when p_related_type = 'offerte' then public.bb_has_permission('offertes')
    when p_related_type = 'deal'    then public.bb_has_permission('verkoop')
    when p_related_type in ('werkbon', 'calendar_event') then true
    else coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
  end
$$;
revoke all on function public.bb_mail_recht_ok(text) from public, anon, authenticated;
grant execute on function public.bb_mail_recht_ok(text) to authenticated, service_role;

drop policy if exists klant_tijdlijn_select on public.klant_tijdlijn;
create policy klant_tijdlijn_select on public.klant_tijdlijn
  for select to authenticated
  using (company_id = (select public.current_company_id())
         and ((select public.bb_gedeelde_werkruimte()) or public.bb_tijdlijn_recht_ok(type)));

drop policy if exists sent_emails_select on public.sent_emails;
create policy sent_emails_select on public.sent_emails
  for select to authenticated
  using (company_id = (select public.current_company_id())
         and ((select public.bb_gedeelde_werkruimte()) or public.bb_mail_recht_ok(related_type)));

drop policy if exists deal_notities_select on public.deal_notities;
create policy deal_notities_select on public.deal_notities
  for select to authenticated
  using (company_id = (select public.current_company_id())
         and (select (public.bb_gedeelde_werkruimte() or public.bb_has_permission('verkoop'))));

notify pgrst, 'reload schema';

select string_agg(r.rolname || ':' || p.proname, ',') as rechten
  from pg_roles r, pg_proc p
 where p.proname in ('bb_tijdlijn_recht_ok', 'bb_mail_recht_ok') and p.pronamespace = 'public'::regnamespace
   and r.rolname in ('anon', 'authenticated', 'service_role')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

commit;
