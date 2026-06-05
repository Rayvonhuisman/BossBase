-- =============================================================================
-- Mail + digitale handtekening
-- =============================================================================

-- 1. Voeg extra kolommen toe aan bestaande email_templates tabel
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS body_html text NOT NULL DEFAULT '';
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- 2. Verstuurde mails bijhouden
CREATE TABLE IF NOT EXISTS sent_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  to_email     text NOT NULL,
  subject      text NOT NULL,
  related_type text,
  related_id   uuid,
  sent_at      timestamptz DEFAULT now(),
  status       text DEFAULT 'sent'
);
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sent_emails_company" ON sent_emails;
CREATE POLICY "sent_emails_company" ON sent_emails
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- 3. Digitale handtekening kolommen op offertes
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS sign_token uuid DEFAULT gen_random_uuid();
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS signed_by_name text;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS signed_by_email text;

-- Zorg dat bestaande rijen een sign_token krijgen
UPDATE offertes SET sign_token = gen_random_uuid() WHERE sign_token IS NULL;

-- 4. Publieke RPC om offerte op te halen via sign_token (geen auth nodig)
CREATE OR REPLACE FUNCTION get_offerte_by_sign_token(p_token uuid)
RETURNS TABLE (
  id              uuid,
  nummer          text,
  omschrijving    text,
  status          text,
  totaal_excl     numeric,
  totaal_incl     numeric,
  geldig_tot      date,
  customer_id     uuid,
  company_id      uuid,
  signed_at       timestamptz,
  sign_token      uuid,
  marge_pct       numeric,
  btw_pct         numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT o.id, o.nummer, o.omschrijving, o.status,
           o.totaal_excl, o.totaal_incl, o.geldig_tot,
           o.customer_id, o.company_id, o.signed_at, o.sign_token,
           o.marge_pct, o.btw_pct
    FROM offertes o
    WHERE o.sign_token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION get_offerte_by_sign_token TO anon;
GRANT EXECUTE ON FUNCTION get_offerte_by_sign_token TO authenticated;

-- Publieke RPC voor regelitems van een offerte via sign_token
CREATE OR REPLACE FUNCTION get_offerte_items_by_token(p_token uuid)
RETURNS TABLE (
  id           uuid,
  omschrijving text,
  eenheid      text,
  aantal       numeric,
  prijs_per    numeric,
  subtotaal    numeric,
  volgorde     int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT oi.id, oi.omschrijving, oi.eenheid, oi.aantal,
           oi.prijs_per, oi.subtotaal, oi.volgorde
    FROM offerte_items oi
    JOIN offertes o ON o.id = oi.offerte_id
    WHERE o.sign_token = p_token
    ORDER BY oi.volgorde;
END;
$$;

GRANT EXECUTE ON FUNCTION get_offerte_items_by_token TO anon;
GRANT EXECUTE ON FUNCTION get_offerte_items_by_token TO authenticated;

-- Publieke RPC voor bedrijfsinformatie bij offerte (logo, naam)
CREATE OR REPLACE FUNCTION get_company_by_sign_token(p_token uuid)
RETURNS TABLE (
  name         text,
  logo_url     text,
  email        text,
  phone        text,
  address      text,
  city         text,
  branding_color text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT c.name, c.logo_url, c.email, c.phone, c.address, c.city, c.branding_color
    FROM companies c
    JOIN offertes o ON o.company_id = c.id
    WHERE o.sign_token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION get_company_by_sign_token TO anon;
GRANT EXECUTE ON FUNCTION get_company_by_sign_token TO authenticated;

-- Publieke RPC voor klantnaam bij offerte
CREATE OR REPLACE FUNCTION get_customer_by_sign_token(p_token uuid)
RETURNS TABLE (
  name  text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT cu.name, cu.email
    FROM customers cu
    JOIN offertes o ON o.customer_id = cu.id
    WHERE o.sign_token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_by_sign_token TO anon;
GRANT EXECUTE ON FUNCTION get_customer_by_sign_token TO authenticated;

-- 5. Standaard mail templates voor factuur en offerte per bestaande company
INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief)
SELECT
  c.id AS company_id,
  'offerte' AS type,
  'Offerte verstuurd' AS name,
  'Offerte {{offerte_nummer}} van {{bedrijfsnaam}}' AS onderwerp,
  'Beste {{klant_naam}},

Hierbij ontvangt u offerte {{offerte_nummer}}.

Omschrijving: {{omschrijving}}
Totaalbedrag: {{totaal_bedrag}}
Geldig tot: {{vervaldatum}}

U kunt de offerte bekijken en ondertekenen via onderstaande link:
{{link}}

Met vriendelijke groet,
{{bedrijfsnaam}}' AS body,
  '<p>Beste {{klant_naam}},</p>
<p>Hierbij ontvangt u offerte <strong>{{offerte_nummer}}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <tr><td style="color:#6b7280;padding:4px 0">Omschrijving</td><td>{{omschrijving}}</td></tr>
  <tr><td style="color:#6b7280;padding:4px 0">Totaalbedrag</td><td><strong>{{totaal_bedrag}}</strong></td></tr>
  <tr><td style="color:#6b7280;padding:4px 0">Geldig tot</td><td>{{vervaldatum}}</td></tr>
</table>
<p style="margin:24px 0">
  <a href="{{link}}" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
    Offerte bekijken &amp; ondertekenen
  </a>
</p>
<p>Met vriendelijke groet,<br>{{bedrijfsnaam}}</p>' AS body_html,
  true AS is_default,
  true AS actief
FROM companies c
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name,
      body_html = EXCLUDED.body_html,
      is_default = EXCLUDED.is_default;

INSERT INTO email_templates (company_id, type, name, onderwerp, body, body_html, is_default, actief)
SELECT
  c.id AS company_id,
  'factuur' AS type,
  'Factuur verstuurd' AS name,
  'Factuur {{factuur_nummer}} van {{bedrijfsnaam}}' AS onderwerp,
  'Beste {{klant_naam}},

Bijgaand ontvangt u factuur {{factuur_nummer}}.

Totaalbedrag: {{totaal_bedrag}}
Vervaldatum: {{vervaldatum}}

Graag uw betaling voor de vervaldatum ontvangen onder vermelding van {{factuur_nummer}}.

Met vriendelijke groet,
{{bedrijfsnaam}}' AS body,
  '<p>Beste {{klant_naam}},</p>
<p>Bijgaand ontvangt u factuur <strong>{{factuur_nummer}}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <tr><td style="color:#6b7280;padding:4px 0">Factuurnummer</td><td><strong>{{factuur_nummer}}</strong></td></tr>
  <tr><td style="color:#6b7280;padding:4px 0">Totaalbedrag</td><td><strong>{{totaal_bedrag}}</strong></td></tr>
  <tr><td style="color:#6b7280;padding:4px 0">Vervaldatum</td><td>{{vervaldatum}}</td></tr>
</table>
<p>Graag uw betaling voor de vervaldatum ontvangen onder vermelding van <strong>{{factuur_nummer}}</strong>.</p>
<p>Met vriendelijke groet,<br>{{bedrijfsnaam}}</p>' AS body_html,
  true AS is_default,
  true AS actief
FROM companies c
ON CONFLICT (company_id, type) DO UPDATE
  SET name = EXCLUDED.name,
      body_html = EXCLUDED.body_html,
      is_default = EXCLUDED.is_default;
