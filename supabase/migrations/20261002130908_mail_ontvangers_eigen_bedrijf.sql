-- ── Waarom ──────────────────────────────────────────────────────────────────
-- send-email accepteerde van elke ingelogde gebruiker een vrije ontvanger,
-- afzendernaam, HTML en bijlagen, en verstuurde dat vanaf noreply@bossbase.nl
-- (audit 2026-10-01, K2: live een mail met afzender "Uw Bank Beveiliging").
--
-- Vanaf nu mag een gebruiker alleen nog mailen naar adressen die bij zijn eigen
-- bedrijf horen: klanten, leveranciers, teamleden (ook openstaande
-- uitnodigingen), aanvragen uit het websiteformulier, en het bedrijfsadres zelf.
-- Deze functie geeft de adressen terug die daar NIET bij horen; send-email
-- weigert de mail als die lijst niet leeg is.
--
-- Alleen service_role: de functie zegt of een adres bij een bedrijf hoort, en
-- dat is informatie die een buitenstaander niet hoort te kunnen opvragen.

create or replace function public.bb_mail_ontvangers_buiten_bedrijf(p_company uuid, p_emails text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(e), '{}')
    from (select distinct lower(btrim(x)) as e from unnest(p_emails) x where btrim(coalesce(x, '')) <> '') v
   where not exists (select 1 from customers      c where c.company_id = p_company and lower(btrim(c.email)) = v.e)
     and not exists (select 1 from leveranciers   l where l.company_id = p_company and lower(btrim(l.email)) = v.e)
     and not exists (select 1 from company_members m where m.company_id = p_company and lower(btrim(m.email)) = v.e)
     and not exists (select 1 from inquiries      i where i.company_id = p_company and lower(btrim(i.email)) = v.e)
     and not exists (select 1 from companies      k where k.id = p_company
                        and (lower(btrim(k.email)) = v.e or lower(btrim(k.reply_to_email)) = v.e));
$$;

revoke all on function public.bb_mail_ontvangers_buiten_bedrijf(uuid, text[]) from public, anon, authenticated;
grant execute on function public.bb_mail_ontvangers_buiten_bedrijf(uuid, text[]) to service_role;

notify pgrst, 'reload schema';

select r.rolname
  from pg_roles r, pg_proc p
 where p.proname = 'bb_mail_ontvangers_buiten_bedrijf' and p.pronamespace = 'public'::regnamespace
   and r.rolname in ('anon', 'authenticated', 'service_role')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
