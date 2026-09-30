-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De beperking na afloop (20260803120000, "readonly" in de code) sluit "uren boeken" voor een bedrijf zonder
-- geldig abonnement, via een restrictive INSERT-policy met bb_mag_schrijven()
-- op urenregistratie. werkbon_uren bestond toen nog niet en kreeg die policy
-- nooit: na afloop van een opgezegd abonnement kon je daar nog uren boeken
-- (lokaal aangetoond, supabase/tests/lokaal/test_functies.mjs). Zelfde regel,
-- zelfde vorm als de andere readonly_*-policies.

begin;

drop policy if exists readonly_werkbon_uren on public.werkbon_uren;
create policy readonly_werkbon_uren on public.werkbon_uren
  as restrictive for insert to authenticated
  with check (public.bb_mag_schrijven());

select count(*) as readonly_policy from pg_policies
 where schemaname = 'public' and tablename = 'werkbon_uren' and policyname = 'readonly_werkbon_uren';

commit;

notify pgrst, 'reload schema';
