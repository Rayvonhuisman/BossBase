-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De proefperiodemails bevatten een aanbod. Dat mag zonder toestemming aan onze
-- eigen klanten (art. 11.7 lid 3 Telecommunicatiewet), maar dan moet elke mail
-- een afmeldmogelijkheid hebben. De edge function trial-mails-afmelden zet bij
-- afmelden companies.trial_mails_uitgesloten aan (bb_trial_mail_kandidaten
-- slaat die bedrijven al over) en legt hier vast wanneer dat gebeurde.

begin;

alter table public.companies
  add column if not exists trial_mails_afgemeld_op timestamptz;

comment on column public.companies.trial_mails_afgemeld_op is
  'Tijdstip waarop de beheerder zich afmeldde voor de proefperiodemails (via de link in de mail).';

select count(*) filter (where column_name = 'trial_mails_afgemeld_op') as kolom_er
  from information_schema.columns
 where table_schema = 'public' and table_name = 'companies';

commit;

notify pgrst, 'reload schema';
