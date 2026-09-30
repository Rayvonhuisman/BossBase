-- ── Terugdraaien van 20260930182000_toegang_na_deactivatie ──────────────────
-- VOLGORDE IS BELANGRIJK: eerst de pre-request-instelling van de rol
-- authenticator weghalen, dan de functie. Die instelling geldt voor de hele
-- database-cluster; staat hij nog en is de functie weg, dan weigert PostgREST
-- ELK verzoek (lokaal getest). Na het terugdraaien kan een gedeactiveerde
-- gebruiker met een nog geldig access token (max. 1 uur) weer gegevens lezen.

alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';

begin;

do $$
declare t record;
begin
  for t in select tablename from pg_policies where schemaname = 'public' and policyname = 'bb_alleen_actieve_gebruikers' loop
    execute format('drop policy bb_alleen_actieve_gebruikers on public.%I', t.tablename);
  end loop;
end $$;
drop policy if exists bb_alleen_actieve_gebruikers on storage.objects;

drop function if exists public.bb_voor_verzoek();
drop function if exists public.bb_ik_ben_actief();

CREATE OR REPLACE FUNCTION public.bb_mag_abonnement_beheren(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT p.role = 'admin' AND p.actief IS DISTINCT FROM false
    FROM public.profiles p WHERE p.id = p_user_id
  ), false)
$function$;

select
  (select count(*) from pg_policies where policyname = 'bb_alleen_actieve_gebruikers') as blokkades_over,
  (select rolconfig::text from pg_roles where rolname = 'authenticator') as authenticator_config;

commit;

notify pgrst, 'reload schema';
