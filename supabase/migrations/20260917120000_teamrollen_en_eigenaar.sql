-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Onder Team kon de rol van een teamlid niet worden gewijzigd. Niet alleen die
-- van een admin: van niemand. Twee oorzaken, die elkaar verborgen hielden.
--
--   1. De teamlijst toont echte teamleden uit `profiles` (company_members is
--      voor de meeste bedrijven leeg en bevat alleen openstaande uitnodigingen).
--      updateTeamMember() schreef blind naar company_members op dat id, raakte
--      nul rijen, en .single() gaf "Opslaan mislukt".
--   2. Ook mét de juiste tabel zou het niet werken: de rol staat op profiles, en
--      de trigger protect_profile_privileges zet NEW.role terug op OLD.role
--      zodra de aanroeper `authenticated` is. Een rolwijziging vanuit de app
--      verdween dus geruisloos — geen foutmelding, geen wijziging.
--
-- Deze migratie voegt toe wat er nodig is om het wél te kunnen, mét de grenzen
-- eromheen: een eigenaar per bedrijf, een RPC die de wijziging namens de
-- database doet, en een trigger die de harde grenzen bewaakt.
--
-- Verdeling van de handhaving, en waarom:
--
--   • De TRIGGER bewaakt wat waar moet zijn ongeacht wie het probeert: de
--     eigenaar kan niet worden verwijderd, en de laatste beheerder kan niet
--     worden verwijderd of gedegradeerd. Dat geldt dus ook voor de edge function
--     die met de service role draait.
--   • De RPC bewaakt wat van de AANROEPER afhangt: alleen een beheerder van
--     hetzelfde bedrijf mag aanpassen, en de eigenaar kan alleen door zichzelf
--     worden aangepast. Een trigger kan dat niet: die weet niet wie er belt als
--     de service role aan de knoppen zit.
--   • DEACTIVEREN blijft bewust BUITEN de trigger. cancel_company_account() zet
--     bij het opzeggen álle profielen van het bedrijf op actief = false, de
--     laatste beheerder incluis. Een trigger die dat blokkeert, breekt het
--     opzeggen van een account. Deactiveren wordt daarom in delete-team-member
--     bewaakt, die de aanroeper wél kent.
--
-- Gemeten vóór het draaien: 7 bedrijven, elk met minstens één admin-profiel, en
-- geen enkele met een eigenaar (de kolom bestond niet). De backfill zet per
-- bedrijf de oudste admin als eigenaar; dat is degene die het bedrijf heeft
-- aangemaakt, want provision_account() maakt de eerste gebruiker admin.

begin;

-- ── De wijziging ────────────────────────────────────────────────────────────

alter table public.companies
  add column if not exists eigenaar_id uuid references public.profiles(id) on delete set null;

comment on column public.companies.eigenaar_id is
  'De eigenaar van het account: degene die het bedrijf heeft aangemaakt. Beschermd — een andere beheerder kan hem niet aanpassen of verwijderen.';

-- Backfill: de oudste admin per bedrijf. NULLS LAST omdat created_at op oude
-- profielrijen leeg kan zijn; die komen dan achteraan in plaats van vooraan.
update public.companies c
   set eigenaar_id = k.id
  from (
    select distinct on (p.company_id) p.company_id, p.id
      from public.profiles p
     where p.role = 'admin' and p.company_id is not null
     order by p.company_id, p.created_at nulls last, p.id
  ) k
 where k.company_id = c.id
   and c.eigenaar_id is null;

create index if not exists companies_eigenaar_idx on public.companies (eigenaar_id);

-- Hoeveel actieve beheerders houdt het bedrijf over als we p_behalve buiten
-- beschouwing laten? Eén plek, zodat trigger en RPC hetzelfde tellen.
create or replace function public.bb_actieve_admins(p_company_id uuid, p_behalve uuid default null)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
    FROM public.profiles
   WHERE company_id = p_company_id
     AND role = 'admin'
     AND actief
     AND (p_behalve IS NULL OR id <> p_behalve)
$$;

revoke all on function public.bb_actieve_admins(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bb_actieve_admins(uuid, uuid) to service_role;

-- ── Trigger: de harde grenzen, ongeacht wie het probeert ────────────────────
create or replace function public.bb_profiel_bewaken()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eigenaar uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT eigenaar_id INTO v_eigenaar FROM public.companies WHERE id = OLD.company_id;

    IF v_eigenaar IS NOT NULL AND OLD.id = v_eigenaar THEN
      RAISE EXCEPTION 'De eigenaar van het account kan niet worden verwijderd. Draag eerst het eigenaarschap over.'
        USING ERRCODE = 'check_violation', HINT = 'eigenaar';
    END IF;

    IF OLD.role = 'admin' AND OLD.actief AND OLD.company_id IS NOT NULL
       AND public.bb_actieve_admins(OLD.company_id, OLD.id) = 0 THEN
      RAISE EXCEPTION 'Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan.'
        USING ERRCODE = 'check_violation', HINT = 'laatste_admin';
    END IF;

    RETURN OLD;
  END IF;

  -- UPDATE. Alleen een rol die van admin áf gaat kan het bedrijf zonder
  -- beheerder achterlaten. Deactiveren bewust niet: zie de kop van dit bestand.
  IF NEW.role IS DISTINCT FROM OLD.role AND OLD.role = 'admin' AND NEW.role <> 'admin'
     AND OLD.actief AND OLD.company_id IS NOT NULL
     AND public.bb_actieve_admins(OLD.company_id, OLD.id) = 0 THEN
    RAISE EXCEPTION 'Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan.'
      USING ERRCODE = 'check_violation', HINT = 'laatste_admin';
  END IF;

  RETURN NEW;
END;
$$;

revoke all on function public.bb_profiel_bewaken() from public, anon, authenticated;

-- Naam begint met bb_ zodat hij vóór protect_privileges draait (triggers gaan op
-- alfabetische volgorde): we willen de échte NEW.role zien, niet de door
-- protect_profile_privileges teruggezette waarde.
drop trigger if exists bb_profiel_bewaken on public.profiles;
create trigger bb_profiel_bewaken
  before update or delete on public.profiles
  for each row execute function public.bb_profiel_bewaken();

-- ── RPC: een teamlid bijwerken, met de aanroeper in beeld ───────────────────
create or replace function public.bb_teamlid_bijwerken(
  p_profile_id uuid,
  p_rol        text    default null,
  p_naam       text    default null,
  p_telefoon   text    default null,
  p_uren       numeric default null
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller         uuid := auth.uid();
  v_caller_rol     text;
  v_caller_company uuid;
  v_caller_super   boolean;
  v_company        uuid;
  v_rol_nu         text;
  v_eigenaar       uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd' USING ERRCODE = '28000';
  END IF;

  SELECT role, company_id, coalesce(is_super_admin, false)
    INTO v_caller_rol, v_caller_company, v_caller_super
    FROM public.profiles WHERE id = v_caller;

  SELECT company_id, role INTO v_company, v_rol_nu
    FROM public.profiles WHERE id = p_profile_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Teamlid niet gevonden' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_caller_super
     AND (v_caller_rol IS DISTINCT FROM 'admin' OR v_caller_company IS DISTINCT FROM v_company) THEN
    RAISE EXCEPTION 'Alleen een beheerder van dit bedrijf kan teamleden aanpassen.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_rol IS NOT NULL AND p_rol NOT IN ('admin', 'medewerker', 'planner') THEN
    RAISE EXCEPTION 'Onbekende rol: %', p_rol USING ERRCODE = 'check_violation';
  END IF;

  SELECT eigenaar_id INTO v_eigenaar FROM public.companies WHERE id = v_company;

  -- De eigenaar is van zichzelf. Een andere beheerder blijft eraf.
  IF v_eigenaar IS NOT NULL AND p_profile_id = v_eigenaar
     AND v_caller <> v_eigenaar AND NOT v_caller_super THEN
    RAISE EXCEPTION 'De eigenaar van het account kan alleen door de eigenaar zelf worden aangepast.'
      USING ERRCODE = 'insufficient_privilege', HINT = 'eigenaar';
  END IF;

  -- De trigger vangt dit ook af; hier staat het voor de nette melding.
  IF p_rol IS NOT NULL AND v_rol_nu = 'admin' AND p_rol <> 'admin'
     AND public.bb_actieve_admins(v_company, p_profile_id) = 0 THEN
    RAISE EXCEPTION 'Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan.'
      USING ERRCODE = 'check_violation', HINT = 'laatste_admin';
  END IF;

  UPDATE public.profiles
     SET role      = coalesce(p_rol, role),
         full_name = coalesce(nullif(btrim(p_naam), ''), full_name)
   WHERE id = p_profile_id;

  -- Telefoon en uren staan niet op profiles maar op company_members. Bestaat
  -- die rij (lang niet altijd), houd hem dan gelijk.
  UPDATE public.company_members
     SET phone          = coalesce(p_telefoon, phone),
         hours_per_week = coalesce(p_uren, hours_per_week),
         full_name      = coalesce(nullif(btrim(p_naam), ''), full_name),
         role           = coalesce(p_rol, role),
         updated_at     = now()
   WHERE profile_id = p_profile_id;

  RETURN (SELECT row_to_json(x) FROM (
    SELECT p.id, p.company_id, p.full_name, p.role, p.actief, p.avatar_url, p.created_at
      FROM public.profiles p WHERE p.id = p_profile_id) x);
END;
$$;

-- anon en authenticated staan hier met naam: `revoke all ... from public` haalt
-- de Supabase-defaultgrants niet weg (zie CLAUDE.md). De app roept deze functie
-- aan als ingelogde gebruiker, dus authenticated krijgt hem daarna terug.
revoke all on function public.bb_teamlid_bijwerken(uuid, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.bb_teamlid_bijwerken(uuid, text, text, text, numeric) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
