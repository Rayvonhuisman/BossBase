-- =============================================================================
-- BossBase: mark_factuur_betaald — defense-in-depth binding op bedrijf + bedrag
-- Bestand : supabase/migrations/20260722113000_stripe_webhook_bind_account_amount.sql
--
-- Context: de Stripe-webhook zette een factuur op betaald puur op basis van
-- metadata.factuur_id. Een kwaadwillende die zelf een Stripe-account koppelt kon
-- zo een factuur van een ANDER bedrijf op "betaald" zetten door een klein bedrag
-- aan zichzelf te betalen met de juiste factuur-UUID in de metadata.
--
-- De account-binding (event.account hoort bij het bedrijf van de factuur) zit in
-- de webhook zelf (Stripe-specifiek). Deze migratie voegt de DATA-LAAG-backstop
-- toe: mark_factuur_betaald krijgt twee optionele "verwachting"-parameters en
-- WEIGERT (raise) als ze niet kloppen met de factuur. Zo is de check zowel in de
-- edge function als in de database afgedwongen.
--
-- Backward compatible: de handmatige "markeer betaald"-actie (factuurService.js)
-- roept aan met alleen p_factuur_id (+ p_betaald_op); de nieuwe params defaulten
-- naar NULL → geen extra afdwinging op dat pad (de bestaande ownership-check via
-- auth.uid() blijft daar leidend). De idempotente status-transitie blijft gelijk.
-- =============================================================================

-- De oude 4-arg-signatuur moet weg: anders zou een aanroep met alleen
-- p_factuur_id/p_betaald_op ambigu worden tussen de oude en nieuwe overload.
drop function if exists public.mark_factuur_betaald(uuid, date, text, text);

create or replace function public.mark_factuur_betaald(
  p_factuur_id            uuid,
  p_betaald_op            date   default null,
  p_stripe_status         text   default null,
  p_stripe_intent         text   default null,
  p_expected_company_id   uuid   default null,
  p_expected_amount_cents bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v facturen;
  v_company_id   uuid;
  v_total_cents  bigint;
begin
  -- Ownership (user-pad): een ingelogde user mag alleen facturen van zijn eigen
  -- bedrijf op betaald zetten. Een service-role aanroep (auth.uid() IS NULL, bv.
  -- de webhook) mag dat, maar levert dan wél de verwachtingen aan (zie onder).
  if auth.uid() is not null then
    if not exists (
      select 1 from facturen f join profiles p on p.company_id = f.company_id
      where f.id = p_factuur_id and p.id = auth.uid()
    ) then
      raise exception 'geen toegang tot deze factuur';
    end if;
  end if;

  -- Huidige bedrijf + factuurtotaal (in centen) ophalen voor de verificatie.
  select company_id, round(totaal_incl * 100)::bigint
    into v_company_id, v_total_cents
    from public.facturen
   where id = p_factuur_id;

  if not found then
    return jsonb_build_object('changed', false);
  end if;

  -- Defense-in-depth: als de aanroeper verwachtingen meegeeft, MOETEN ze kloppen
  -- met de factuur. Mismatch = betaling hoort niet bij deze factuur/dit bedrag →
  -- harde stop, géén status-wijziging.
  if p_expected_company_id is not null
     and p_expected_company_id is distinct from v_company_id then
    raise exception 'company mismatch voor factuur % (verwacht %, factuur %)',
      p_factuur_id, p_expected_company_id, v_company_id;
  end if;

  if p_expected_amount_cents is not null
     and p_expected_amount_cents is distinct from v_total_cents then
    raise exception 'bedrag mismatch voor factuur % (betaald %, factuur %)',
      p_factuur_id, p_expected_amount_cents, v_total_cents;
  end if;

  -- Idempotente status-transitie: alleen op betaald zetten als dat nog niet zo is.
  update public.facturen
     set status = 'betaald',
         betaald_op = coalesce(p_betaald_op, betaald_op, current_date),
         stripe_payment_status = coalesce(p_stripe_status, stripe_payment_status),
         stripe_payment_intent_id = coalesce(p_stripe_intent, stripe_payment_intent_id),
         updated_at = now()
   where id = p_factuur_id
     and status is distinct from 'betaald'
  returning * into v;

  if not found then
    return jsonb_build_object('changed', false);
  end if;

  return jsonb_build_object(
    'changed', true,
    'customer_id', v.customer_id,
    'company_id', v.company_id,
    'nummer', v.nummer,
    'totaal_incl', v.totaal_incl
  );
end;
$$;

revoke all on function public.mark_factuur_betaald(uuid, date, text, text, uuid, bigint) from public, anon;
grant execute on function public.mark_factuur_betaald(uuid, date, text, text, uuid, bigint) to authenticated, service_role;
