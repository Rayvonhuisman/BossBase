-- De publieke ondertekenpagina (en de bijbehorende PDF) toonde een "-" als
-- offertedatum: de RPC get_offerte_by_sign_token gaf geldig_tot wél terug maar
-- created_at niet. created_at toevoegen aan de return-set.
DROP FUNCTION IF EXISTS public.get_offerte_by_sign_token(uuid);

CREATE FUNCTION public.get_offerte_by_sign_token(p_token uuid)
 RETURNS TABLE(id uuid, nummer text, omschrijving text, status text, totaal_excl numeric, totaal_incl numeric, geldig_tot date, customer_id uuid, company_id uuid, signed_at timestamp with time zone, sign_token uuid, marge_pct numeric, btw_pct numeric, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT o.id, o.nummer, o.omschrijving, o.status,
           o.totaal_excl, o.totaal_incl, o.geldig_tot,
           o.customer_id, o.company_id, o.signed_at, o.sign_token,
           o.marge_pct, o.btw_pct, o.created_at
    FROM offertes o
    WHERE o.sign_token = p_token;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_offerte_by_sign_token(uuid) TO anon, authenticated;
