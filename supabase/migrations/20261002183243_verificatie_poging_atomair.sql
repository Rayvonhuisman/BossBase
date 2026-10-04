-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (sec-edge B-13): verify-code las `attempts`, vergeleek
-- de code en schreef daarna attempts + 1. Gelijktijdige verzoeken lazen dezelfde
-- teller, zodat er meer dan vijf pogingen per code mogelijk waren.
-- Deze functie verhoogt de teller in één statement, alleen zolang hij onder het
-- maximum zit, en geeft de nieuwe stand terug (geen rij = maximum bereikt).
-- Alleen voor service_role: verify-code roept hem aan.

create or replace function public.bb_verificatie_poging(p_id uuid, p_max int)
returns int
language sql
security definer
set search_path = public
as $$
  update email_verification_codes
     set attempts = attempts + 1
   where id = p_id and attempts < p_max and verified_at is null
  returning attempts;
$$;

revoke all on function public.bb_verificatie_poging(uuid, int) from public, anon, authenticated;
grant execute on function public.bb_verificatie_poging(uuid, int) to service_role;

notify pgrst, 'reload schema';

select r.rolname from pg_roles r, pg_proc p
 where p.proname = 'bb_verificatie_poging' and p.pronamespace = 'public'::regnamespace
   and r.rolname in ('anon', 'authenticated', 'service_role')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
