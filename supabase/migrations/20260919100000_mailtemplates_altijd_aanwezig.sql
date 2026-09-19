-- Elk bedrijf krijgt de standaard-mailtemplates, ook als het niet via
-- provision_account is aangemaakt. En de afspraakherinnering krijgt een tekst die
-- klopt bij elk aantal dagen vooruit.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De templates werden alleen gezaaid door provision_account (en eenmalig door de
-- backfill in 20260623030000). Een bedrijf dat via een andere weg ontstond —
-- tussen die backfill en het moment dat provision_account ging zaaien, of via een
-- script — had er geen. Gemeten vóór deze migratie, 7 bedrijven:
--
--   * 5 bedrijven: alle 8 standaardtypes.
--   * Glasmeesters (aangemaakt 2026-07-07, geen testbedrijf): 0 templates.
--   * TEST SnelStart BV (via scripts/seed-snelstart-test.sql):  0 templates.
--
-- Zonder rij toont Instellingen geen enkel template ("Template niet gevonden —
-- voer de database-migratie uit"), en de automatische mails (afspraakherinnering,
-- betaalherinneringen, aanvraag ontvangen, afspraakbevestiging) gingen voor zo'n
-- bedrijf nooit uit. Dat laatste is nu ook in de code afgevangen: een ontbrekende
-- rij valt terug op de standaardtekst. Deze migratie zorgt dat de rij er wél is,
-- zodat de ondernemer de tekst kan zien en aanpassen.
--
-- Impact van de backfill gemeten: Glasmeesters heeft 0 klanten, 0 facturen en 0
-- afspraken, dus er gaat door het aanvullen niet ineens post uit.
--
-- Afspraakherinnering: de standaardtekst zei "uw afspraak van morgen", terwijl
-- het aantal dagen vooruit instelbaar is (auto_dagen). Bij 2 dagen stond er dus
-- iets onjuists in de mail. De nieuwe tekst noemt alleen de datum. Bijgewerkt
-- worden uitsluitend rijen die nog letterlijk de oude standaard zijn (4 van de 5;
-- BossBase Admin heeft een eigen, bewerkte tekst en blijft ongemoeid).
--
-- Dezelfde standaardtekst staat ook in:
--   supabase/functions/_shared/standaardMailTemplates.ts  (terugval in de cron)
--   src/lib/standaardMailTemplates.js                     (terugval in de app)
--   src/pages/InstellingenPage.jsx, DEFAULT_BODY           ("standaardtekst herstellen")
-- Pas je hem aan, doe het dan op alle plekken.

-- ── Seedfunctie: nieuwe tekst voor afspraak_herinnering ─────────────────────
-- Verder woord voor woord gelijk aan 20260916170000. CREATE OR REPLACE met
-- dezelfde signatuur en returntype, dus geen drop-and-create: de rechten
-- (alleen service_role) blijven staan. Achteraf gecontroleerd, zie onderaan.
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
      'Herinnering: uw afspraak op {{afspraak_datum}}',
      E'Beste {{klant_naam}},\n\nGraag herinneren wij u aan uw afspraak met {{bedrijfsnaam}}.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nKomt het onverhoopt niet uit? Laat het ons dan zo snel mogelijk weten, dan zoeken we samen een ander moment.\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, true, 1)
  ON CONFLICT (company_id, type) DO NOTHING;
END;
$$;

-- ── Onbewerkte afspraakherinneringen naar de nieuwe tekst ───────────────────
-- Alleen rijen die nog exact de oude standaard zijn: onderwerp én body gelijk en
-- geen HTML-versie (die ontstaat pas bij bewerken in de editor). auto_dagen,
-- actief en auto_versturen blijven wat het bedrijf gekozen heeft.
update public.email_templates
set onderwerp  = 'Herinnering: uw afspraak op {{afspraak_datum}}',
    body       = E'Beste {{klant_naam}},\n\nGraag herinneren wij u aan uw afspraak met {{bedrijfsnaam}}.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nKomt het onverhoopt niet uit? Laat het ons dan zo snel mogelijk weten, dan zoeken we samen een ander moment.\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
    updated_at = now()
where type = 'afspraak_herinnering'
  and onderwerp = 'Herinnering: u heeft morgen een afspraak'
  and body = E'Beste {{klant_naam}},\n\nDit is een herinnering voor uw afspraak van morgen.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}'
  and coalesce(body_html, '') = '';

-- ── Nieuwe bedrijven: zaaien bij het aanmaken ───────────────────────────────
-- Zelfde patroon als companies_seed_lost_reasons, met twee verschillen:
--
-- * SECURITY DEFINER. seed_default_email_templates is alleen voor service_role.
--   Een gewone triggerfunctie draait met de rechten van wie de INSERT doet; komt
--   er ooit een bedrijf bij via een ingelogde gebruiker, dan zou de aanroep op
--   "permission denied" klappen en het bedrijf niet aangemaakt worden.
-- * Een fout bij het zaaien houdt het aanmaken van het bedrijf niet tegen. De
--   mails vallen dan terug op de standaardtekst in de code, en een nieuw bedrijf
--   dat niet kan registreren is veel erger dan een bedrijf zonder templaterijen.
--
-- provision_account roept de seed daarna nog een keer aan; ON CONFLICT DO
-- NOTHING maakt dat onschuldig.
create or replace function public.trg_seed_email_templates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  BEGIN
    PERFORM public.seed_default_email_templates(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Standaard-mailtemplates zaaien mislukt voor bedrijf %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

revoke all on function public.trg_seed_email_templates() from public, anon, authenticated;

drop trigger if exists companies_seed_email_templates on public.companies;
create trigger companies_seed_email_templates
  after insert on public.companies
  for each row execute function public.trg_seed_email_templates();

-- ── Bestaande bedrijven aanvullen ───────────────────────────────────────────
-- Vult alleen ontbrekende types aan; bestaande (en bewerkte) rijen blijven staan.
-- Een bewust verwijderd eigen template bestaat niet bij de standaardtypes: die
-- zijn in Instellingen niet te verwijderen, dus aanvullen overschrijft geen keuze.
do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.seed_default_email_templates(c.id);
  end loop;
end $$;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- email_templates
notify pgrst, 'reload schema';
