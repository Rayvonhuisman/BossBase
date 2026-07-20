-- =============================================================================
-- BossBase: permanente betaallink via een niet-raadbaar betaaltoken (stap 5)
-- Bestand : supabase/migrations/20260720120000_factuur_betaaltoken.sql
--
-- De factuurmail linkt niet meer direct naar een (tijdelijke) Stripe Checkout
-- Session, maar naar /betaal/<token>. Dat token is per factuur onraadbaar, zodat
-- niemand via factuur-id's andermans betaalinfo kan opvragen. Bij elke klik maakt
-- de edge function stripe-pay-link een VERSE sessie → de maillink blijft altijd
-- geldig.
-- =============================================================================

alter table public.facturen add column if not exists stripe_payment_token text;

-- Uniek (waar gezet); meerdere NULL's toegestaan.
create unique index if not exists facturen_stripe_payment_token_key
  on public.facturen (stripe_payment_token)
  where stripe_payment_token is not null;

comment on column public.facturen.stripe_payment_token is
  'Onraadbaar token voor de publieke betaallink /betaal/<token>. Onafhankelijk van de factuur-id.';

-- ── Publieke branding-lookup nu op TOKEN (i.p.v. rauwe factuur-id) ──────────
-- Zowel de tussenpagina (/betaal) als de bedankpagina (/betaald) hebben alleen
-- het token. Geeft uitsluitend niet-gevoelige branding terug; NULL bij een
-- onbekend token → nette fallback.
drop function if exists public.get_payment_branding(uuid);

create or replace function public.get_payment_branding(p_token text)
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
  where f.stripe_payment_token = p_token;
$$;

grant execute on function public.get_payment_branding(text) to anon, authenticated, service_role;
