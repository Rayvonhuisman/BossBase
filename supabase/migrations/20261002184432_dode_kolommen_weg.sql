-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01 (code C-10): kolommen die nergens gevuld en nergens gelezen
-- worden. Gemeten vóór het draaien: alle waarden NULL.
--
-- * urenregistratie.werkbon_id / customer_id / deal_id — urenregistratie is
--   bewust de werkdag van een medewerker, zonder werkbon, klant of deal (zie
--   CLAUDE.md "Uren"; uren op een klus staan in werkbon_uren). 0 van 583 rijen
--   gevuld; geen code, policy of functie die ze leest. De verwijzingstrigger op
--   deze tabel controleerde alleen deze drie kolommen en vervalt daarmee.
-- * inquiries.assigned_to — 0 rijen gevuld, nergens in de app of de functies.
--   bb_inquiries_zelfde_bedrijf controleerde hem; die controle gaat eruit.
--
-- calendar_events.deal_id blijft: calendarService schrijft hem nog als hij wordt
-- meegegeven. activities.google_* blijven: de Google-sync bestaat nog in code.

begin;

drop trigger if exists a0_verwijzingen_zelfde_bedrijf on public.urenregistratie;
alter table public.urenregistratie
  drop column if exists werkbon_id,
  drop column if exists customer_id,
  drop column if exists deal_id;

create or replace function public.bb_inquiries_zelfde_bedrijf()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.form_id is not null and not exists (
       select 1 from public.website_forms f where f.id = new.form_id and f.company_id = new.company_id) then
    raise exception 'Formulier hoort niet bij dit bedrijf' using errcode = '23514';
  end if;
  if new.customer_id is not null and not exists (
       select 1 from public.customers c where c.id = new.customer_id and c.company_id = new.company_id) then
    raise exception 'Klant hoort niet bij dit bedrijf' using errcode = '23514';
  end if;
  if new.deal_id is not null and not exists (
       select 1 from public.deals d where d.id = new.deal_id and d.company_id = new.company_id) then
    raise exception 'Deal hoort niet bij dit bedrijf' using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists inquiries_zelfde_bedrijf on public.inquiries;
alter table public.inquiries drop column if exists assigned_to;
create trigger inquiries_zelfde_bedrijf
  before insert or update of company_id, form_id, customer_id, deal_id on public.inquiries
  for each row execute function public.bb_inquiries_zelfde_bedrijf();

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'urenregistratie' and column_name in ('werkbon_id', 'customer_id', 'deal_id'))
        or (table_name = 'inquiries' and column_name = 'assigned_to'))) as resterend_moet_0,
  (select string_agg(r.rolname, ',') from pg_roles r, pg_proc p
    where p.proname = 'bb_inquiries_zelfde_bedrijf' and r.rolname in ('anon','authenticated','service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rechten;

commit;
