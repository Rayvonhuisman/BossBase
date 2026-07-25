-- De publieke sign-token RPC's gaven te weinig kolommen terug, waardoor het adres
-- wegviel op de offerte-PDF die de klant via de ondertekenlink krijgt:
--   * get_customer_by_sign_token gaf alleen name + email — geen address/postcode/city,
--     dus het hele AAN-blok bleef beperkt tot naam en e-mail.
--   * get_company_by_sign_token gaf geen postal_code/kvk/btw_number, terwijl
--     OfferteSigneren die wel naar de PDF doorgeeft — dus VAN miste de postcode
--     en de KvK/BTW-regel.
-- De in-app PDF's (offertepagina, facturenpagina) hadden dit niet: die krijgen de
-- volledige klantrij mee. Alleen dit publieke pad was incompleet.
--
-- Beide functies leveren een nieuwe kolomset op, dus DROP + CREATE (CREATE OR
-- REPLACE kan het RETURNS TABLE-type niet wijzigen).
--
-- Toegang blijft ongewijzigd: alleen opvraagbaar met een geldig sign_token, dat
-- hoort bij precies één offerte. De klant ziet hiermee zijn eigen adres en de
-- bedrijfsgegevens van de afzender — exact wat er sowieso op de offerte staat.

DROP FUNCTION IF EXISTS get_customer_by_sign_token(uuid);

CREATE FUNCTION get_customer_by_sign_token(p_token uuid)
RETURNS TABLE (
  name     text,
  email    text,
  address  text,
  postcode text,
  city     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT cu.name, cu.email, cu.address, cu.postcode, cu.city
    FROM customers cu
    JOIN offertes o ON o.customer_id = cu.id
    WHERE o.sign_token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_by_sign_token TO anon;
GRANT EXECUTE ON FUNCTION get_customer_by_sign_token TO authenticated;

DROP FUNCTION IF EXISTS get_company_by_sign_token(uuid);

CREATE FUNCTION get_company_by_sign_token(p_token uuid)
RETURNS TABLE (
  name           text,
  logo_url       text,
  email          text,
  phone          text,
  address        text,
  postal_code    text,
  city           text,
  kvk            text,
  btw_number     text,
  branding_color text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT c.name, c.logo_url, c.email, c.phone, c.address,
           c.postal_code, c.city, c.kvk, c.btw_number, c.branding_color
    FROM companies c
    JOIN offertes o ON o.company_id = c.id
    WHERE o.sign_token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION get_company_by_sign_token TO anon;
GRANT EXECUTE ON FUNCTION get_company_by_sign_token TO authenticated;
