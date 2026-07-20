-- =============================================================================
-- BossBase: backend voor de Stripe-webhook (stap 4)
-- Bestand : supabase/migrations/20260718170000_stripe_webhook_backend.sql
--
-- 1. facturen.moneybird_payment_registered_at — idempotentie-marker: is de
--    betaling al in Moneybird geregistreerd? Voorkomt dubbele betaalregistratie.
-- 2. mark_factuur_betaald() — GEDEELDE, idempotente "markeer betaald"-route,
--    gebruikt door zowel de webhook (service-role) als de handmatige actie (user).
--    Atomair: zet alleen op betaald als de status dat nog niet is. Levert dat
--    niets op → geen dubbele sync/log.
-- 3. get_payment_branding() — publieke (anon) branding-lookup voor de bedankpagina.
-- =============================================================================

alter table public.facturen add column if not exists moneybird_payment_registered_at timestamptz;
comment on column public.facturen.moneybird_payment_registered_at is
  'Moment waarop de betaling in Moneybird is geregistreerd. Niet-null = al geregistreerd (idempotentie).';

-- ── Gedeelde, idempotente "markeer betaald"-route ───────────────────────────
-- Ownership: een ingelogde user mag alleen facturen van zijn eigen bedrijf op
-- betaald zetten; een service-role aanroep (auth.uid() IS NULL, bv. de webhook)
-- is toegestaan. Retourneert { changed:false } als de factuur al betaald was
-- (of niet bestaat), anders { changed:true, ...velden } voor de vervolgacties
-- (tijdlijn + boekhoud-sync) die de aanroeper daarna doet.
create or replace function public.mark_factuur_betaald(
  p_factuur_id  uuid,
  p_betaald_op  date default null,
  p_stripe_status text default null,
  p_stripe_intent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v facturen;
begin
  if auth.uid() is not null then
    if not exists (
      select 1 from facturen f join profiles p on p.company_id = f.company_id
      where f.id = p_factuur_id and p.id = auth.uid()
    ) then
      raise exception 'geen toegang tot deze factuur';
    end if;
  end if;

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

revoke all on function public.mark_factuur_betaald(uuid, date, text, text) from public, anon;
grant execute on function public.mark_factuur_betaald(uuid, date, text, text) to authenticated, service_role;

-- ── Publieke branding-lookup voor de bedankpagina (klant is niet ingelogd) ──
-- Geeft alleen niet-gevoelige branding terug (naam, logo, kleur) op basis van
-- een onraadbare factuur-uuid. NULL als de factuur niet bestaat → nette fallback.
create or replace function public.get_payment_branding(p_factuur_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'company_name', c.name,
    'logo_url', c.logo_url,
    'branding_color', c.branding_color
  )
  from public.facturen f
  join public.companies c on c.id = f.company_id
  where f.id = p_factuur_id;
$$;

grant execute on function public.get_payment_branding(uuid) to anon, authenticated, service_role;
