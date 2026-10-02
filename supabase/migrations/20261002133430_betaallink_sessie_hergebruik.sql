-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Stripe-review na audit 2026-10-01 (fork F6).
--
-- 1. De publieke betaallink (/betaal/<token> → stripe-pay-link) maakte bij élke
--    aanroep een nieuwe Checkout-sessie op het Stripe-account van het bedrijf.
--    Wie het token heeft, kon zo onbeperkt sessies laten aanmaken (geen rate
--    limit) en overschreef telkens de sessie-id op de factuur. Voortaan wordt een
--    open sessie van minder dan 30 minuten oud hergebruikt. Daarvoor is het
--    aanmaakmoment nodig: kolom stripe_checkout_aangemaakt_op.
--
-- 2. De bedankpagina /betaald toonde altijd "Betaling gelukt", ook zonder
--    betaling (een gedeelde of zelfgemaakte link). get_payment_branding geeft nu
--    ook terug of de factuur al als betaald is verwerkt, zodat de pagina alleen
--    dan "ontvangen" zegt en anders "wordt verwerkt". Wie het token heeft, kon dat
--    al zien via stripe-pay-link (state 'paid'); er lekt dus niets nieuws.
--    Zelfde retourtype (jsonb), dus create or replace houdt de bestaande rechten.

begin;

alter table public.facturen add column if not exists stripe_checkout_aangemaakt_op timestamptz;

create or replace function public.get_payment_branding(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'company_name', c.name,
    'logo_url', c.logo_url,
    'branding_color', c.branding_color,
    'betaald', f.status = 'betaald'
  )
  from public.facturen f
  join public.companies c on c.id = f.company_id
  where f.stripe_payment_token = p_token
    and coalesce(p_token, '') <> '';
$function$;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
    where table_name = 'facturen' and column_name = 'stripe_checkout_aangemaakt_op') as kolom,
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r, pg_proc p
    where p.proname = 'get_payment_branding' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as rechten;

commit;
