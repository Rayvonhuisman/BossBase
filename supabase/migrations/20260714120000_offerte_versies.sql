-- Offerte-versies: een verstuurde (nog niet getekende) offerte kan worden
-- aangepast; daarbij ontstaat een nieuwe VERSIE (nummer + "-v2", "-v3", …) en
-- wordt de oude versie gemarkeerd als "vervangen". De ondertekenlink van de
-- oude versie blijft vindbaar via het token, maar de publieke pagina toont dan
-- een "niet meer geldig / vervangen"-melding i.p.v. de ondertekenmogelijkheid.
--
-- Zo tekent een klant nooit een andere offerte dan hij op zijn scherm ziet:
-- zodra er een nieuwe versie is, is de oude link dood.

alter table public.offertes
  add column if not exists vervangen_op          timestamptz,
  add column if not exists vervangen_door_nummer text;

comment on column public.offertes.vervangen_op is
  'Gezet zodra deze (verstuurde, nog niet getekende) offerte is vervangen door een nieuwere versie. De oude ondertekenlink is dan niet meer geldig.';
comment on column public.offertes.vervangen_door_nummer is
  'Het offertenummer van de nieuwere versie die deze offerte vervangt.';

-- Publieke RPC uitbreiden met vervangen_op + vervangen_door_nummer, zodat de
-- ondertekenpagina een verlopen/vervangen offerte kan herkennen. Overige
-- kolommen ongewijzigd t.o.v. 20260624120000.
DROP FUNCTION IF EXISTS public.get_offerte_by_sign_token(uuid);

CREATE FUNCTION public.get_offerte_by_sign_token(p_token uuid)
 RETURNS TABLE(id uuid, nummer text, omschrijving text, status text, totaal_excl numeric, totaal_incl numeric, geldig_tot date, customer_id uuid, company_id uuid, signed_at timestamp with time zone, sign_token uuid, marge_pct numeric, btw_pct numeric, created_at timestamp with time zone, sent_to_email text, vervangen_op timestamp with time zone, vervangen_door_nummer text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT o.id, o.nummer, o.omschrijving, o.status,
           o.totaal_excl, o.totaal_incl, o.geldig_tot,
           o.customer_id, o.company_id, o.signed_at, o.sign_token,
           o.marge_pct, o.btw_pct, o.created_at, o.sent_to_email,
           o.vervangen_op, o.vervangen_door_nummer
    FROM offertes o
    WHERE o.sign_token = p_token;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_offerte_by_sign_token(uuid) TO anon, authenticated;
