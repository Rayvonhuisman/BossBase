-- Mislukte mails vastleggen, en de dode template "Welkom" opruimen.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Uit het mailonderzoek bleek dat mails op veel plekken stil kunnen falen: een
-- lege catch, een null-retour, of een fout die alleen in de console belandt.
-- Niemand ziet dan dat een klant zijn offerte, bevestiging of herinnering nooit
-- kreeg.
--
-- Bewust NIET elke verstuurde mail loggen. `sent_emails` is het archief op de
-- klantkaart en betekent "dit is verstuurd"; daar mislukkingen in mengen kost die
-- tabel zijn betekenis, en veel mislukte mails hebben helemaal geen klant of
-- bedrijf (meldpunt, trial-mails, notificaties naar collega's). Deze tabel geeft
-- één antwoord op één vraag: is er post blijven liggen? Hij blijft leeg zolang
-- alles goed gaat.
--
-- `company_id` mag leeg zijn (post van BossBase zelf) en verwijst met ON DELETE
-- SET NULL, met de bedrijfsnaam als momentopname ernaast: vertrekt een bedrijf,
-- dan blijft de fout leesbaar.
--
-- Raakt geen bestaande data, behalve het verwijderen van de 'welkom'-templates
-- (zie onder).

create table if not exists public.mail_fouten (
  id               uuid primary key default gen_random_uuid(),
  opgetreden_op    timestamptz not null default now(),
  -- Wat voor mail: 'offerte', 'herinnering_1', 'trial_7', 'toewijzing',
  -- 'ondertekenbevestiging_klant', 'ondertekende_pdf', …
  soort            text not null default 'onbekend',
  ontvanger        text,
  company_id       uuid references public.companies(id) on delete set null,
  bedrijf_naam     text,
  fout             text not null,
  -- Waar de mail vandaan kwam: 'send-email', 'stuurBossBaseMail', 'trial-mails', …
  bron             text not null default 'onbekend',
  gerelateerd_type text,
  gerelateerd_id   uuid
);

create index if not exists idx_mail_fouten_op on public.mail_fouten (opgetreden_op desc);

alter table public.mail_fouten enable row level security;

-- Alleen BossBase zelf leest dit; schrijven doet uitsluitend de service-role
-- vanuit de edge functions.
drop policy if exists mail_fouten_super_admin on public.mail_fouten;
create policy mail_fouten_super_admin on public.mail_fouten
  for all to authenticated
  using      (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin));

revoke all on table public.mail_fouten from anon;
revoke insert, update, delete on table public.mail_fouten from authenticated;


-- ── Template "Welkom" weg ───────────────────────────────────────────────────
-- Deze template ("Welkom bij {{bedrijfsnaam}}", bedoeld voor een nieuwe klant van
-- het bedrijf) is vanaf dag één nooit verstuurd: er is geen enkele aanroep in de
-- code en hij heeft niet eens een automatisch-verzenden-schakelaar. Gemeten vóór
-- het verwijderen: 5 rijen, één per bedrijf, allemaal ongewijzigd ten opzichte van
-- de standaardtekst (identieke md5 op onderwerp+body). Er gaat dus geen door een
-- bedrijf geschreven tekst verloren.
delete from public.email_templates where type = 'welkom';

-- En de seedfunctie opnieuw, zonder de 'welkom'-regel. Verder woord voor woord
-- gelijk aan 20260623030000_seed_email_templates_per_company.sql, zodat nieuwe
-- bedrijven exact dezelfde standaardteksten houden.
-- CREATE OR REPLACE behoudt de bestaande rechten op deze functie (geen DROP), dus
-- de aanroep vanuit de provisioning blijft werken.
create or replace function public.seed_default_email_templates(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
  VALUES
    (p_company_id, 'offerte', 'Offerte versturen',
      'Uw offerte van {{bedrijfsnaam}}',
      E'Beste {{klant_naam}},\n\nHierbij sturen wij u offerte {{offerte_nummer}} toe.\n\nTotaalbedrag: {{totaal_bedrag}}\nGeldig tot: {{vervaldatum}}\n\nVia onderstaande link kunt u de offerte bekijken en digitaal ondertekenen:\n{{link}}\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, false, 7),
    (p_company_id, 'offerte_geaccepteerd', 'Offerte geaccepteerd',
      'Bevestiging: uw offerte is geaccepteerd',
      E'Beste {{klant_naam}},\n\nHartelijk dank! Uw offerte {{offerte_nummer}} is succesvol ondertekend.\n\nWij gaan zo snel mogelijk voor u aan de slag. U ontvangt binnenkort meer informatie over de planning.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 0),
    (p_company_id, 'factuur', 'Factuur versturen',
      'Factuur {{factuur_nummer}} van {{bedrijfsnaam}}',
      E'Beste {{klant_naam}},\n\nHierbij ontvangt u factuur {{factuur_nummer}} van {{bedrijfsnaam}}.\n\nTotaalbedrag: {{totaal_bedrag}}\nBetaaltermijn: {{vervaldatum}}\n\nGelieve het totaalbedrag voor de betaaltermijn over te maken onder vermelding van {{factuur_nummer}}.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, false, 7),
    (p_company_id, 'herinnering_1', 'Betaalherinnering 1 (vriendelijk)',
      'Vriendelijke herinnering: factuur {{factuur_nummer}}',
      E'Beste {{klant_naam}},\n\nWij willen u vriendelijk herinneren dat factuur {{factuur_nummer}} nog openstaat.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nMocht u dit bedrag reeds hebben overgemaakt, dan kunt u deze herinnering als niet verzonden beschouwen.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 7),
    (p_company_id, 'herinnering_2', 'Betaalherinnering 2 (urgent)',
      'Tweede herinnering: factuur {{factuur_nummer}} nog openstaand',
      E'Beste {{klant_naam}},\n\nDit is een tweede herinnering voor factuur {{factuur_nummer}}, welke reeds is vervallen.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nWij verzoeken u dringend dit bedrag zo spoedig mogelijk te voldoen. Bij uitblijven van betaling zien wij ons genoodzaakt verdere stappen te ondernemen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 14),
    (p_company_id, 'aanvraag_ontvangen', 'Aanvraag ontvangen',
      'Bedankt voor uw aanvraag, {{klant_naam}}',
      E'Beste {{klant_naam}},\n\nBedankt voor uw aanvraag! Wij hebben uw bericht ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 0),
    (p_company_id, 'afspraak_bevestiging', 'Afspraakbevestiging',
      'Bevestiging afspraak op {{afspraak_datum}}',
      E'Beste {{klant_naam}},\n\nHierbij bevestigen wij uw afspraak.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nMocht u de afspraak willen verzetten, neem dan tijdig contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 0),
    (p_company_id, 'afspraak_herinnering', 'Afspraakherinnering',
      'Herinnering: u heeft morgen een afspraak',
      E'Beste {{klant_naam}},\n\nDit is een herinnering voor uw afspraak van morgen.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 1)
  ON CONFLICT (company_id, type) DO NOTHING;
END;
$$;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- mail_fouten
notify pgrst, 'reload schema';
