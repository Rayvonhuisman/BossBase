-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, B-17. De gebruikerslimiet-trigger (bb_gebruikerslimiet op
-- profiles) behandelt heractiveren als "een plek erbij". Een bedrijf dat meer
-- gebruikers heeft dan zijn pakket toelaat (bijvoorbeeld na een downgrade van
-- Team naar Groei) kon daardoor een gedeactiveerde collega nooit meer
-- heractiveren — ook niet als het daarmee alleen terugkwam op het aantal dat er
-- vóór die deactivering al was. In Stamvol (Groei, limiet 2, 10 gebruikers)
-- bleef monteur2 zo na de audit geblokkeerd.
--
-- Nieuwe regel: bij deactiveren legt de database vast hoeveel gebruikers er op
-- dat moment actief waren (profiles.actief_bij_deactivering). Heractiveren mag
-- als het resultaat binnen de pakketlimiet blijft, óf niet boven het hoogste
-- vastgelegde aantal van de nu gedeactiveerde collega's uitkomt. Daarmee kan een
-- bedrijf nooit boven zijn eigen piek uitkomen; nieuwe uitnodigingen blijven aan
-- de gewone limiet gebonden.
--
-- De kolom is niet door een gebruiker te zetten: de trigger bepaalt hem en zet
-- elke andere wijziging terug (anders kon een beheerder er 1000 in schrijven).
--
-- Gemeten vóór het draaien: één gedeactiveerd profiel met deactivated_at
-- (monteur2, Stamvol, 9 actieve collega's). Dat krijgt als vastgelegd aantal
-- 9 + 1 = 10, het aantal van vóór zijn deactivering. De drie gedeactiveerde
-- profielen zonder deactivated_at (TEST 40a878, gesloten bedrijf) blijven leeg.

begin;

alter table public.profiles add column if not exists actief_bij_deactivering integer;

-- Backfill (vóór de trigger, die de kolom anders terugzet): alleen gedeactiveerde profielen met een deactiveringsdatum.
update public.profiles p
   set actief_bij_deactivering = (
     select count(*) + 1 from public.profiles q
      where q.company_id = p.company_id and q.actief is distinct from false)
 where p.actief is false and p.deactivated_at is not null and p.company_id is not null;


create or replace function public.bb_actief_bij_deactivering()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.actief_bij_deactivering := null;
    return new;
  end if;
  if old.actief is distinct from false and new.actief is false and new.company_id is not null then
    new.actief_bij_deactivering := (
      select count(*) from public.profiles p
       where p.company_id = new.company_id and p.actief is distinct from false);
  else
    new.actief_bij_deactivering := old.actief_bij_deactivering;
  end if;
  return new;
end;
$function$;

revoke all on function public.bb_actief_bij_deactivering() from public, anon, authenticated;

drop trigger if exists bb_actief_bij_deactivering on public.profiles;
create trigger bb_actief_bij_deactivering
  before insert or update on public.profiles
  for each row execute function public.bb_actief_bij_deactivering();

create or replace function public.bb_gebruikerslimiet_profiel()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text;
  v_piek  integer;
  v_na    integer;
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

  if public.bb_gebruikersplek_vrij(new.company_id, new.id, v_email) then
    return new;
  end if;

  -- Heractiveren in hetzelfde bedrijf: mag terug tot het aantal dat er vóór de
  -- deactiveringen actief was (B-17).
  if tg_op = 'UPDATE' and old.company_id is not distinct from new.company_id and old.actief is false then
    select max(p.actief_bij_deactivering) into v_piek
      from public.profiles p
     where p.company_id = new.company_id and p.actief is false;
    select count(*) + 1 into v_na
      from public.profiles p
     where p.company_id = new.company_id and p.actief is distinct from false and p.id <> new.id;
    if v_piek is not null and v_na <= v_piek then
      return new;
    end if;
  end if;

  raise exception using
    message = public.bb_gebruikerslimiet_melding(new.company_id),
    errcode = 'check_violation',
    hint    = 'gebruikerslimiet';
end;
$function$;

notify pgrst, 'reload schema';

select id, actief_bij_deactivering from public.profiles where actief is false order by deactivated_at nulls last;

commit;
