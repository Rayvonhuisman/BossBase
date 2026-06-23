-- ============================================================================
-- E-mailtemplates per bedrijf: seed-functie + backfill + provision-hook
-- ----------------------------------------------------------------------------
-- Oorzaak van "Template niet gevonden — voer de database-migratie uit":
-- de oude seed (20260101000000_mail_uitbreidingen) deed INSERT ... SELECT id
-- FROM companies en seedde dus alleen bedrijven die tóén bestonden. Bedrijven
-- die later via provision_account zijn aangemaakt (o.a. Dakdekker Neliss)
-- kregen nooit de 9 standaard templates → lege templates-pagina.
-- ============================================================================

-- Idempotente seed-functie: voegt de 9 standaard templates toe voor één bedrijf.
-- ON CONFLICT DO NOTHING zodat bestaande (eventueel aangepaste) templates nooit
-- worden overschreven. SECURITY DEFINER zodat het ook vanuit provision_account
-- en de backfill werkt zonder RLS-problemen.
CREATE OR REPLACE FUNCTION public.seed_default_email_templates(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    (p_company_id, 'welkom', 'Welkom nieuwe klant',
      'Welkom bij {{bedrijfsnaam}}',
      E'Beste {{klant_naam}},\n\nWelkom bij {{bedrijfsnaam}}! Wij zijn blij u als nieuwe klant te mogen verwelkomen.\n\nHeeft u vragen of opmerkingen? U kunt altijd contact met ons opnemen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
      '', true, true, false, 0),
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

-- Backfill: seed alle bestaande bedrijven die (nog) templates missen.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    PERFORM public.seed_default_email_templates(c.id);
  END LOOP;
END $$;

-- Provision-hook: elk NIEUW bedrijf krijgt voortaan automatisch de templates.
CREATE OR REPLACE FUNCTION public.provision_account(p_company_name text, p_full_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_kvk text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_company_id UUID;
  v_existing   UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT company_id INTO v_existing FROM profiles WHERE id = v_user_id;

  IF v_existing IS NOT NULL THEN
    IF p_full_name IS NOT NULL THEN
      UPDATE profiles SET full_name = p_full_name WHERE id = v_user_id;
    END IF;
    RETURN json_build_object('company_id', v_existing, 'status', 'existing');
  END IF;

  INSERT INTO companies (name, email, phone, kvk)
  VALUES (p_company_name, NULLIF(p_email, ''), NULLIF(p_phone, ''), NULLIF(p_kvk, ''))
  RETURNING id INTO v_company_id;

  INSERT INTO profiles (id, company_id, full_name, role)
  VALUES (
    v_user_id, v_company_id,
    COALESCE(NULLIF(p_full_name, ''), split_part(p_email, '@', 1), 'Gebruiker'),
    'admin'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    full_name  = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    role       = 'admin';

  INSERT INTO pipeline_stages (company_id, name, position)
  VALUES
    (v_company_id, 'Nieuwe aanvraag',    0),
    (v_company_id, 'Contact opgenomen',  1),
    (v_company_id, 'Afspraak gepland',   2),
    (v_company_id, 'Offerte verstuurd',  3),
    (v_company_id, 'Akkoord',            4),
    (v_company_id, 'In uitvoering',      5),
    (v_company_id, 'Afgerond',           6)
  ON CONFLICT DO NOTHING;

  -- Standaard e-mailtemplates voor het nieuwe bedrijf.
  PERFORM public.seed_default_email_templates(v_company_id);

  RETURN json_build_object('company_id', v_company_id, 'status', 'created');
END;
$function$;
