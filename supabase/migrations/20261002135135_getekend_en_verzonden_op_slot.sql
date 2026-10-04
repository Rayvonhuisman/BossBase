-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M7 (sec-dbfuncties D1, functioneel-b F-B7/F-B8/F-B15).
-- Ondertekende en verstuurde stukken waren niet echt op slot:
--   - van een ondertekende werkbon kon elke medewerker op Groei ondertekend_op
--     leegmaken (daarna was alles weer open), en status, klantnotities en foto's
--     bleven wijzigbaar;
--   - regels van een getekende offerte en van een verstuurde of betaalde factuur
--     waren te wijzigen, en de totalen rekenden mee (3.224,53 → 4.434,53);
--   - verzonden facturen en creditnota's waren te verwijderen (gat in de
--     nummering, en ze vallen onder de bewaarplicht);
--   - een concept zonder regels kon direct op "betaald".
--
-- De bewakers gelden alleen voor wat een gebruiker rechtstreeks doet
-- (current_user anon of authenticated). Edge functions met de service-rol
-- (ondertekenen, getekende PDF nazenden, Stripe-webhook, herinneringen,
-- boekhoudsync) en definer-functies (totaaltriggers, mark_factuur_betaald)
-- draaien als een andere rol en blijven dus werken.
-- Uitzondering voor regels: een factuur die in dezelfde transactie is aangemaakt
-- (bb_factuur_aanmaken maakt een creditnota direct als 'verzonden' aan en zet er
-- daarna de regels onder). Herkend aan created_at = now(): now() is het
-- begintijdstip van de transactie, en created_at krijgt dat als standaardwaarde.

begin;

-- ── Werkbon na ondertekenen ─────────────────────────────────────────────────
create or replace function public.bb_werkbon_getekend_bevriezen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_vrij text[] := array['updated_at', 'activity_id'];
begin
  if current_user not in ('anon', 'authenticated') or old.ondertekend_op is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Werkbon is op % ondertekend en kan niet meer worden verwijderd.',
      to_char(old.ondertekend_op, 'DD-MM-YYYY') using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - v_vrij) is distinct from (to_jsonb(old) - v_vrij) then
    raise exception 'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
      to_char(old.ondertekend_op, 'DD-MM-YYYY') using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.bb_werkbon_getekend_bevriezen() from public, anon, authenticated;

drop trigger if exists bb_werkbon_getekend_bevriezen on public.werkbonnen;
create trigger bb_werkbon_getekend_bevriezen
  before update or delete on public.werkbonnen
  for each row execute function public.bb_werkbon_getekend_bevriezen();

-- Notities en foto's: hetzelfde slot als taken, materialen, uren en dagen, maar
-- alleen voor wat een gebruiker rechtstreeks doet (invoker, met rolcheck), zodat
-- het opruimen van een bedrijf via de service-rol niet vastloopt.
create or replace function public.bb_werkbon_kind_op_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_werkbon_id  uuid := case when tg_op = 'DELETE' then old.werkbon_id else new.werkbon_id end;
  v_ondertekend timestamptz;
begin
  if current_user in ('anon', 'authenticated') then
    select ondertekend_op into v_ondertekend from werkbonnen where id = v_werkbon_id;
    if v_ondertekend is not null then
      raise exception 'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
        to_char(v_ondertekend, 'DD-MM-YYYY') using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.bb_werkbon_kind_op_slot() from public, anon, authenticated;

drop trigger if exists bb_werkbon_notities_op_slot on public.werkbon_notities;
create trigger bb_werkbon_notities_op_slot
  before insert or update or delete on public.werkbon_notities
  for each row execute function public.bb_werkbon_kind_op_slot();
drop trigger if exists bb_werkbon_fotos_op_slot on public.werkbon_fotos;
create trigger bb_werkbon_fotos_op_slot
  before insert or update or delete on public.werkbon_fotos
  for each row execute function public.bb_werkbon_kind_op_slot();

-- ── Offerte na ondertekenen ─────────────────────────────────────────────────
create or replace function public.bb_offerte_getekend_bevriezen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_vrij text[] := array['updated_at', 'deal_id', 'vervangen_op', 'vervangen_door_nummer'];
begin
  if current_user not in ('anon', 'authenticated') or old.signed_at is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Deze offerte is ondertekend en kan niet meer worden verwijderd.'
      using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - v_vrij) is distinct from (to_jsonb(old) - v_vrij) then
    raise exception 'Deze offerte is ondertekend en staat op slot. Herzie hem als nieuwe versie.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.bb_offerte_getekend_bevriezen() from public, anon, authenticated;

drop trigger if exists bb_offerte_getekend_bevriezen on public.offertes;
create trigger bb_offerte_getekend_bevriezen
  before update or delete on public.offertes
  for each row execute function public.bb_offerte_getekend_bevriezen();

create or replace function public.bb_offerte_regels_op_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.offerte_id else new.offerte_id end;
begin
  if current_user in ('anon', 'authenticated')
     and exists (select 1 from offertes where id = v_id and signed_at is not null) then
    raise exception 'Deze offerte is ondertekend; de regels staan op slot.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.bb_offerte_regels_op_slot() from public, anon, authenticated;

drop trigger if exists bb_offerte_regels_op_slot on public.offerte_items;
create trigger bb_offerte_regels_op_slot
  before insert or update or delete on public.offerte_items
  for each row execute function public.bb_offerte_regels_op_slot();

-- ── Factuur na versturen ────────────────────────────────────────────────────
create or replace function public.bb_factuur_verzonden_bevriezen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Wat na versturen nog mag veranderen: status (betaald/geboekt), betaling,
  -- crediteren, herinneringen en de koppelingen met Stripe en de boekhouding.
  v_vrij text[] := array['updated_at', 'status', 'betaald_op', 'gecrediteerd',
    'herinnering_1_verstuurd_at', 'herinnering_2_verstuurd_at',
    'stripe_payment_intent_id', 'stripe_checkout_session_id', 'stripe_payment_url',
    'stripe_payment_status', 'stripe_payment_token', 'stripe_checkout_aangemaakt_op',
    'moneybird_id', 'moneybird_payment_registered_at', 'snelstart_id',
    'snelstart_bijlage_gesynct', 'externe_referentie'];
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'concept' or old.is_credit then
      raise exception 'Een verstuurde factuur of creditnota kun je niet verwijderen. Maak een creditnota om hem te corrigeren.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- Concept zonder regels kan niet op betaald.
  if old.status = 'concept' and new.status = 'betaald'
     and not exists (select 1 from factuur_regels where factuur_id = new.id) then
    raise exception 'Een factuur zonder regels kan niet op betaald.'
      using errcode = 'check_violation';
  end if;

  if old.status <> 'concept' then
    if new.status = 'concept' then
      raise exception 'Een verstuurde factuur kan niet terug naar concept.'
        using errcode = 'check_violation';
    end if;
    if (to_jsonb(new) - v_vrij) is distinct from (to_jsonb(old) - v_vrij) then
      raise exception 'Deze factuur is verstuurd en staat op slot. Corrigeer hem met een creditnota.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.bb_factuur_verzonden_bevriezen() from public, anon, authenticated;

drop trigger if exists bb_factuur_verzonden_bevriezen on public.facturen;
create trigger bb_factuur_verzonden_bevriezen
  before update or delete on public.facturen
  for each row execute function public.bb_factuur_verzonden_bevriezen();

create or replace function public.bb_factuur_regels_op_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.factuur_id else new.factuur_id end;
begin
  if current_user in ('anon', 'authenticated')
     and exists (select 1 from facturen f
                  where f.id = v_id and f.status <> 'concept'
                    -- niet in deze transactie aangemaakt (creditnota via
                    -- bb_factuur_aanmaken): created_at = now() is het tijdstip
                    -- van de huidige transactie
                    and f.created_at is distinct from now()) then
    raise exception 'Deze factuur is verstuurd; de regels staan op slot. Corrigeer hem met een creditnota.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.bb_factuur_regels_op_slot() from public, anon, authenticated;

drop trigger if exists bb_factuur_regels_op_slot on public.factuur_regels;
create trigger bb_factuur_regels_op_slot
  before insert or update or delete on public.factuur_regels
  for each row execute function public.bb_factuur_regels_op_slot();

notify pgrst, 'reload schema';

select count(*) as triggers_moet_7 from pg_trigger
 where not tgisinternal and tgname in ('bb_werkbon_getekend_bevriezen', 'bb_werkbon_notities_op_slot',
   'bb_werkbon_fotos_op_slot', 'bb_offerte_getekend_bevriezen', 'bb_offerte_regels_op_slot',
   'bb_factuur_verzonden_bevriezen', 'bb_factuur_regels_op_slot');

commit;
