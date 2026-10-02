-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M5. Een admin mag zijn eigen bedrijfsgegevens bijwerken
-- (naam, adres, logo, IBAN …), maar een paar kolommen op companies horen bij het
-- abonnement of bij ons, niet bij de klant:
--   - periode_start: anker van de maandperiode voor de Starter-limieten. Door
--     hem in de toekomst te zetten ging het verbruik van 165/20 naar 0/20.
--   - is_testbedrijf: haalt een bedrijf uit check-herinneringen.
--   - trial_mails_uitgesloten / trial_mails_afgemeld_op: afmelden loopt via de
--     ondertekende afmeldlink (edge function trial-mails-afmelden, service-rol).
-- bb_companies_bewaken beschermde alleen eigenaar_id, status en opgezegd_op.
-- De service-rol en postgres (edge functions, webhooks, migraties) vallen buiten
-- de controle, net als nu; een super-admin mag alles.

begin;

create or replace function public.bb_companies_bewaken()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('anon', 'authenticated')
     and (new.eigenaar_id is distinct from old.eigenaar_id
          or new.status is distinct from old.status
          or new.opgezegd_op is distinct from old.opgezegd_op
          or new.periode_start is distinct from old.periode_start
          or new.is_testbedrijf is distinct from old.is_testbedrijf
          or new.trial_mails_uitgesloten is distinct from old.trial_mails_uitgesloten
          or new.trial_mails_afgemeld_op is distinct from old.trial_mails_afgemeld_op)
     and not coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false)
  then
    raise exception 'Deze gegevens van het bedrijf horen bij het abonnement en kun je hier niet wijzigen.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';

select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.companies'::regclass and tgfoid = 'public.bb_companies_bewaken'::regproc;

commit;
