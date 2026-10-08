-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Drie wijzigingen in het websitetraject, op verzoek van Niels (2026-10-08):
--
-- 1. Eerst betalen, dan pas de intake indienen. Bij een bedrag bewaart
--    website-intake de intake als concept bij de betaling (`gegevens`); pas als
--    Stripe meldt dat er betaald is, rondt billing-webhook de intake af. Zo
--    kan een intake met een upgrade nooit binnenkomen zonder betaling.
-- 2. Betalen in 12 termijnen is een eigen Stripe-abonnement dat in Checkout
--    wordt afgesloten (eerste termijn meteen), in plaats van een regel op het
--    BossBase-abonnement: dat kon geen betaling vooraf garanderen en werkte
--    niet zonder lopend Stripe-abonnement. wijze 'termijnen', met het id van
--    dat abonnement in `stripe_subscription_id`.
-- 3. Zakelijke e-mail per adres (€ 9 per adres per maand): `email_aantal`.
--
-- Gemeten vóór het draaien: 1 aanvraag en 1 betaling, allebei van het
-- testbedrijf 40905fa9 (nielsgrevink+webtest1). Geen klantdata.


-- ── 1. Aanvragen: aantal e-mailadressen ─────────────────────────────────────
alter table public.website_aanvragen
  add column if not exists email_aantal int not null default 0;

update public.website_aanvragen set email_aantal = 1 where email and email_aantal = 0;


-- ── 2. Betalingen: concept-intake, termijnen als eigen abonnement ───────────
alter table public.website_betalingen
  add column if not exists gegevens               jsonb,
  add column if not exists stripe_subscription_id text;

alter table public.website_betalingen drop constraint if exists website_betalingen_wijze_chk;
alter table public.website_betalingen
  add constraint website_betalingen_wijze_chk check (wijze in ('ideal', 'termijnen', 'abonnement'));

alter table public.website_betalingen drop constraint if exists website_betalingen_status_chk;
alter table public.website_betalingen
  add constraint website_betalingen_status_chk check (status in ('open', 'betaald', 'loopt', 'afgerond', 'gestopt', 'mislukt', 'vervallen'));

create index if not exists idx_website_betalingen_stripe_sub
  on public.website_betalingen (stripe_subscription_id) where stripe_subscription_id is not null;


-- ── 3. Wat de klant ziet: ook het aantal e-mailadressen ─────────────────────
create or replace function public.get_mijn_website()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'welkomstactie',   s.welkomstactie,
    'interval',        s.billing_interval,
    'tier',            public.bb_effective_tier(c.id),
    'heeftStripe',     (s.stripe_subscription_id is not null),
    'magBeheren',      public.bb_mag_abonnement_beheren(),
    'aanvraag', (select jsonb_build_object(
        'status',            w.status,
        'pakket',            w.pakket,
        'siteUrl',           w.site_url,
        'aangevraagdOp',     w.aangevraagd_op,
        'intakeOntvangenOp', w.intake_ontvangen_op,
        'liveOp',            w.live_op,
        'feedback',          w.feedback,
        'feedbackOp',        w.feedback_op,
        'domein',            w.domein,
        'domeinViaOns',      w.domein_via_ons,
        'email',             w.email,
        'emailAantal',       w.email_aantal,
        'extras',            w.extras)
      from public.website_aanvragen w where w.company_id = c.id),
    'betalingen', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'soort', b.soort, 'omschrijving', b.omschrijving, 'pakket', b.pakket,
        'bedrag', b.bedrag, 'wijze', b.wijze, 'status', b.status, 'perKeer', b.per_keer,
        'intervalMaanden', b.interval_maanden, 'aantalTotaal', b.aantal_totaal,
        'aantalGedaan', b.aantal_gedaan, 'startOp', b.start_op, 'betaaldOp', b.betaald_op,
        'createdAt', b.created_at) order by b.created_at)
      from public.website_betalingen b
      where b.company_id = c.id and b.status <> 'vervallen'), '[]'::jsonb),
    'verzoeken', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'soort', v.soort, 'omschrijving', v.omschrijving, 'status', v.status,
        'createdAt', v.created_at, 'afgehandeldOp', v.afgehandeld_op) order by v.created_at desc)
      from public.website_verzoeken v where v.company_id = c.id), '[]'::jsonb)
  )
  from public.companies c
  left join public.subscriptions s on s.company_id = c.id
  where c.id = public.bb_current_company()
$$;

revoke all on function public.get_mijn_website() from public, anon, authenticated;
grant execute on function public.get_mijn_website() to authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
