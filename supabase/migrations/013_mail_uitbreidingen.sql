-- =============================================================================
-- Mail uitbreidingen: herinneringen, templates, sent_emails
-- =============================================================================

-- 1. Betaalherinneringen tracking op facturen
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS betaaltermijn_dagen integer DEFAULT 14;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS herinnering_1_verstuurd_at timestamptz;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS herinnering_2_verstuurd_at timestamptz;

-- 2. Email templates uitbreiden
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS auto_versturen boolean DEFAULT false;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS auto_dagen integer DEFAULT 7;

-- 3. Sent emails uitbreiden
ALTER TABLE sent_emails ADD COLUMN IF NOT EXISTS appointment_id uuid;
ALTER TABLE sent_emails ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- 4. Verwijder de twee bestaande offerte/factuur templates (worden vervangen)
DELETE FROM email_templates WHERE type IN ('offerte','factuur','offerte_geaccepteerd','herinnering_1','herinnering_2','aanvraag_ontvangen','welkom','afspraak_bevestiging','afspraak_herinnering','algemeen');

-- 5. Seed 10 nieuwe standaard templates voor alle bestaande companies
-- ── Offerte versturen ────────────────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'offerte', 'Offerte versturen',
  'Uw offerte van {{bedrijfsnaam}}',
  E'Beste {{klant_naam}},\n\nHierbij sturen wij u offerte {{offerte_nummer}} toe.\n\nTotaalbedrag: {{totaal_bedrag}}\nGeldig tot: {{vervaldatum}}\n\nVia onderstaande link kunt u de offerte bekijken en digitaal ondertekenen:\n{{link}}\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, false, 7
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen;

-- ── Offerte geaccepteerd ─────────────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'offerte_geaccepteerd', 'Offerte geaccepteerd',
  'Bevestiging: uw offerte is geaccepteerd',
  E'Beste {{klant_naam}},\n\nHartelijk dank! Uw offerte {{offerte_nummer}} is succesvol ondertekend.\n\nWij gaan zo snel mogelijk voor u aan de slag. U ontvangt binnenkort meer informatie over de planning.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, true, 0
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen;

-- ── Factuur versturen ────────────────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'factuur', 'Factuur versturen',
  'Factuur {{factuur_nummer}} van {{bedrijfsnaam}}',
  E'Beste {{klant_naam}},\n\nHierbij ontvangt u factuur {{factuur_nummer}} van {{bedrijfsnaam}}.\n\nTotaalbedrag: {{totaal_bedrag}}\nBetaaltermijn: {{vervaldatum}}\n\nGelieve het totaalbedrag voor de betaaltermijn over te maken onder vermelding van {{factuur_nummer}}.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, false, 7
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen;

-- ── Betaalherinnering 1 (vriendelijk) ───────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'herinnering_1', 'Betaalherinnering 1 (vriendelijk)',
  'Vriendelijke herinnering: factuur {{factuur_nummer}}',
  E'Beste {{klant_naam}},\n\nWij willen u vriendelijk herinneren dat factuur {{factuur_nummer}} nog openstaat.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nMocht u dit bedrag reeds hebben overgemaakt, dan kunt u deze herinnering als niet verzonden beschouwen.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, true, 7
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen, auto_dagen = EXCLUDED.auto_dagen;

-- ── Betaalherinnering 2 (urgent) ─────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'herinnering_2', 'Betaalherinnering 2 (urgent)',
  'Tweede herinnering: factuur {{factuur_nummer}} nog openstaand',
  E'Beste {{klant_naam}},\n\nDit is een tweede herinnering voor factuur {{factuur_nummer}}, welke reeds is vervallen.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nWij verzoeken u dringend dit bedrag zo spoedig mogelijk te voldoen. Bij uitblijven van betaling zien wij ons genoodzaakt verdere stappen te ondernemen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, true, 14
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen, auto_dagen = EXCLUDED.auto_dagen;

-- ── Aanvraag ontvangen ───────────────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'aanvraag_ontvangen', 'Aanvraag ontvangen',
  'Bedankt voor uw aanvraag, {{klant_naam}}',
  E'Beste {{klant_naam}},\n\nBedankt voor uw aanvraag! Wij hebben uw bericht ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, true, 0
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen;

-- ── Welkom nieuwe klant ──────────────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'welkom', 'Welkom nieuwe klant',
  'Welkom bij {{bedrijfsnaam}}',
  E'Beste {{klant_naam}},\n\nWelkom bij {{bedrijfsnaam}}! Wij zijn blij u als nieuwe klant te mogen verwelkomen.\n\nHeeft u vragen of opmerkingen? U kunt altijd contact met ons opnemen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, false, 0
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen;

-- ── Afspraakbevestiging ──────────────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'afspraak_bevestiging', 'Afspraakbevestiging',
  'Bevestiging afspraak op {{afspraak_datum}}',
  E'Beste {{klant_naam}},\n\nHierbij bevestigen wij uw afspraak.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nMocht u de afspraak willen verzetten, neem dan tijdig contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, true, 0
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen;

-- ── Afspraakherinnering ──────────────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'afspraak_herinnering', 'Afspraakherinnering',
  'Herinnering: u heeft morgen een afspraak',
  E'Beste {{klant_naam}},\n\nDit is een herinnering voor uw afspraak van morgen.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, true, 1
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen, auto_dagen = EXCLUDED.auto_dagen;

-- ── Algemeen bericht ─────────────────────────────────────────────────────────
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen)
SELECT id,
  'algemeen', 'Algemeen bericht',
  '',
  E'Beste {{klant_naam}},\n\n\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  '', true, true, false, 0
FROM companies
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name, onderwerp = EXCLUDED.onderwerp, body = EXCLUDED.body, auto_versturen = EXCLUDED.auto_versturen;
