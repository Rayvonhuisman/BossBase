-- Gebruikerslimiet afdwingen op elke weg naar binnen
-- ──────────────────────────────────────────────────────────────────────────────
-- Groei heeft ruimte voor 2 gebruikers (de beheerder telt mee), Starter voor 1.
-- Tot nu toe hield alleen de uitnodiging dat tegen: een restrictive policy op
-- INSERT in company_members. Drie andere wegen liepen eromheen, en die gebruiken
-- allemaal de service role, die RLS overslaat:
--
--   * heractiveren (delete-team-member, action=activate) zette profiles.actief
--     op true zonder te tellen. Op Groei: deactiveer er één, nodig iemand uit,
--     heractiveer → drie.
--   * een uitnodiging accepteren (accept-invite, en handle_new_user bij gewoon
--     registreren met een uitgenodigd adres) zette het profiel in het bedrijf
--     zonder te tellen. Een uitnodiging van vóór een overstap naar Groei kon zo
--     nog altijd worden ingewisseld.
--   * alles wat rechtstreeks in de database company_id of actief op een profiel
--     zet.
--
-- De poort zit nu op de plek waar een plek écht bezet raakt: het profiel. Een
-- trigger op profiles telt bij elke INSERT en bij elke UPDATE die company_id of
-- actief verandert. Daarnaast een trigger op company_members, zodat ook een
-- uitnodiging via de service role wordt tegengehouden, en mét een leesbare
-- melding: de bestaande policy geeft alleen "violates row-level security".
--
-- Beide gooien dezelfde fout, met HINT 'gebruikerslimiet'. Daar herkent de app
-- hem aan, en dan gaat de beheerder naar de abonnementspagina om te upgraden.
--
-- Telling: actieve profielen plus openstaande uitnodigingen, net als bb_usage.
-- Bij het accepteren telt de eigen uitnodiging niet mee: die wordt nu ingewisseld.
--
-- Overstappen naar een kleiner pakket controleerde al op de gebruikers
-- (bb_mag_wisselen en bb_downgrade_blokkades, in billing-wijzig en
-- billing-checkout). Het Stripe-portaal kan geen pakket wijzigen. Daar verandert
-- niets.
--
-- Bestaande data: niemand wordt verwijderd of gedeactiveerd. Gemeten op
-- 2026-10-01: één bedrijf zit boven zijn limiet, het testbedrijf "TEST Stamvol
-- Bouw BV" (7e57c0de-0000-4000-b000-000000000000), Groei met 10 actieve
-- gebruikers. Dat blijft zo; er kan alleen niemand meer bij tot het onder de
-- limiet zit of upgradet.

-- ── Hoeveel plekken bezet, zonder de persoon die erbij wil ──────────────────
create or replace function public.bb_gebruikersplek_vrij(
  p_company_id uuid,
  p_profile_id uuid default null,
  p_email      text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.bb_limit(p_company_id, 'gebruikers') is null
      or (
        (select count(*) from public.profiles p
          where p.company_id = p_company_id
            and p.actief is distinct from false
            and p.id is distinct from p_profile_id)
        +
        (select count(*) from public.company_members cm
          where cm.company_id = p_company_id
            and cm.accepted_at is null and cm.profile_id is null
            and (p_email is null or lower(cm.email) is distinct from lower(p_email)))
        + 1
      ) <= public.bb_limit(p_company_id, 'gebruikers');
$$;

revoke all on function public.bb_gebruikersplek_vrij(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bb_gebruikersplek_vrij(uuid, uuid, text) to service_role;

-- ── De melding ──────────────────────────────────────────────────────────────
create or replace function public.bb_gebruikerslimiet_melding(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select format(
    'Je pakket %s heeft ruimte voor %s, inclusief de beheerder. Upgrade naar %s om meer mensen toe te voegen.',
    initcap(public.bb_effective_tier(p_company_id)),
    case when public.bb_limit(p_company_id, 'gebruikers') = 1 then '1 gebruiker'
         else public.bb_limit(p_company_id, 'gebruikers') || ' gebruikers' end,
    case public.bb_effective_tier(p_company_id) when 'starter' then 'Groei of Team' else 'Team' end
  );
$$;

revoke all on function public.bb_gebruikerslimiet_melding(uuid) from public, anon, authenticated;
grant execute on function public.bb_gebruikerslimiet_melding(uuid) to service_role;

-- ── Trigger op profiles ─────────────────────────────────────────────────────
create or replace function public.bb_gebruikerslimiet_profiel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  -- Neemt dit profiel er een plek bij? Alleen als het actief in een bedrijf
  -- terechtkomt waar het daarvoor niet actief was.
  if new.company_id is null or new.actief is false then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.company_id is not distinct from new.company_id
     and old.actief is distinct from false then
    return new;
  end if;

  -- Twee gelijktijdige aanmeldingen bij hetzelfde bedrijf mogen niet allebei
  -- de laatste plek zien.
  perform pg_advisory_xact_lock(hashtext('gebruikerslimiet:' || new.company_id::text));

  -- Zijn eigen uitnodiging telt niet mee: die wordt nu ingewisseld.
  select u.email into v_email from auth.users u where u.id = new.id;

  if not public.bb_gebruikersplek_vrij(new.company_id, new.id, v_email) then
    raise exception using
      message = public.bb_gebruikerslimiet_melding(new.company_id),
      errcode = 'check_violation',
      hint    = 'gebruikerslimiet';
  end if;
  return new;
end;
$$;

revoke all on function public.bb_gebruikerslimiet_profiel() from public, anon, authenticated;

drop trigger if exists bb_gebruikerslimiet on public.profiles;
create trigger bb_gebruikerslimiet
  before insert or update of company_id, actief on public.profiles
  for each row execute function public.bb_gebruikerslimiet_profiel();

-- ── Trigger op company_members (uitnodigingen) ──────────────────────────────
create or replace function public.bb_gebruikerslimiet_uitnodiging()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Alleen een openstaande uitnodiging houdt een plek bezet. Een rij die al aan
  -- een profiel hangt, telt via dat profiel.
  if new.profile_id is not null or new.accepted_at is not null or new.company_id is null then
    return new;
  end if;
  -- Bij een update alleen als hij nú pas een openstaande uitnodiging wordt.
  if tg_op = 'UPDATE'
     and old.company_id is not distinct from new.company_id
     and old.profile_id is null and old.accepted_at is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('gebruikerslimiet:' || new.company_id::text));

  if not public.bb_gebruikersplek_vrij(new.company_id) then
    raise exception using
      message = public.bb_gebruikerslimiet_melding(new.company_id),
      errcode = 'check_violation',
      hint    = 'gebruikerslimiet';
  end if;
  return new;
end;
$$;

revoke all on function public.bb_gebruikerslimiet_uitnodiging() from public, anon, authenticated;

drop trigger if exists bb_gebruikerslimiet on public.company_members;
create trigger bb_gebruikerslimiet
  before insert or update of company_id, profile_id, accepted_at on public.company_members
  for each row execute function public.bb_gebruikerslimiet_uitnodiging();

notify pgrst, 'reload schema';
