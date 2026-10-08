-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Hosting (en domein en e-mail) ging alleen als regel op het BossBase-abonnement.
-- Zonder lopend Stripe-abonnement werd er dus niets gefactureerd, en na opzeggen
-- bleef de site online zonder dat iemand het merkte. Op verzoek van Niels
-- (2026-10-08):
--
-- 1. Een eigen hostingabonnement: hosting, plus e-mail en domein als die gekozen
--    zijn, via dezelfde Checkout als het BossBase-abonnement. wijze 'los' op
--    website_betalingen, met het id van dat abonnement.
-- 2. Livegang alleen met betaalde hosting (website-beheer bewaakt dat).
-- 3. Na opzeggen een mail aan de klant met de keuze om alleen de website online
--    te houden; betaalt hij niet binnen 14 dagen na het einde, dan "Actie nodig"
--    in de superadmin en een mail aan info@bossbase.nl. website-termijnen houdt
--    dat dagelijks bij, met deze drie tijdstippen op website_aanvragen.
--
-- Gemeten vóór het draaien: 1 aanvraag (testbedrijf 40905fa9), geen live sites.


-- ── 1. Losse hosting als betaalwijze ────────────────────────────────────────
alter table public.website_betalingen drop constraint if exists website_betalingen_wijze_chk;
alter table public.website_betalingen
  add constraint website_betalingen_wijze_chk check (wijze in ('ideal', 'termijnen', 'abonnement', 'los'));


-- ── 2. Bewaking na opzeggen ─────────────────────────────────────────────────
alter table public.website_aanvragen
  add column if not exists hosting_einde_op    timestamptz,  -- wanneer de hosting via het abonnement stopt/stopte
  add column if not exists hosting_mail_op     timestamptz,  -- klant gemaild: houd je site online
  add column if not exists offline_melding_op  timestamptz;  -- info@ gemaild: site offline halen


-- ── 3. Wat de klant ziet: ook de stand van de hosting ───────────────────────
-- hosting.abonnementLoopt: er loopt een Stripe-abonnement waar de hosting als
--   regel op kan. Zonder dat is een eigen hostingabonnement nodig.
-- hosting.stoptOp / gestopt: het BossBase-abonnement stopt of is gestopt.
-- hosting.losLoopt: er loopt een eigen hostingabonnement.
create or replace function public.get_mijn_website()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'welkomstactie',   s.welkomstactie,
    'interval',        s.billing_interval,
    'tier',            public.bb_effective_tier(c.id),
    'heeftStripe',     (s.stripe_subscription_id is not null),
    'magBeheren',      public.bb_mag_abonnement_beheren(),
    'hosting', jsonb_build_object(
        'abonnementLoopt', (s.stripe_subscription_id is not null and coalesce(s.stripe_status, '') in ('active', 'trialing', 'past_due')),
        'stoptOp',         case when s.stopt_op is not null then s.stopt_op
                                when s.cancel_at_period_end then s.current_period_end end,
        'gestopt',         (s.status = 'opgezegd' or s.stripe_status = 'canceled'),
        'losLoopt',        exists (select 1 from public.website_betalingen b
                                    where b.company_id = c.id and b.soort = 'hosting' and b.wijze = 'los' and b.status = 'loopt')),
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
        'extras',            w.extras,
        'hostingEindeOp',    w.hosting_einde_op)
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
