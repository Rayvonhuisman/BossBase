-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De gratis website (welkomstactie bij een jaarabonnement) liep tot nu toe via
-- één mail met "antwoord maar met je gegevens" en een statusveld in het
-- superadmin. Dit maakt er een volledig traject van, met alles in onze eigen
-- database en opslag:
--
--   1. Een persoonlijke intakelink met een geheime, tijdelijke sleutel
--      (website_tokens). Alleen de sha256 van de sleutel staat hier; de sleutel
--      zelf zit alleen in de link. Een sleutel verloopt na 30 dagen of zodra de
--      intake is verstuurd.
--   2. De intake zelf, het gekozen pakket (basis, compleet, pro), de link naar de
--      site, de feedbackronde en de status op website_aanvragen.
--   3. Betalingen en abonnementsregels (website_betalingen): een upgrade via
--      iDEAL, of in 12 termijnen; hosting vanaf livegang; een domein per jaar.
--      De regels zet de functie website-termijnen als factuurregel op de
--      eerstvolgende abonnementsfactuur in Stripe.
--   4. Wijzigings- en domeinverzoeken (website_verzoeken).
--   5. Een private bucket voor logo's en foto's uit de intake.
--
-- Hosting was een module die je bij het abonnement los kon aanzetten. Dat kan
-- niet meer: hosting hoort bij de website en gaat in bij livegang. De rij in
-- plan_modules blijft (de prijs), de koppeling aan pakketten gaat eruit zodat
-- billing-checkout en billing-wijzig hem weigeren.
--
-- Gemeten vóór het draaien (2026-10-07): website_aanvragen 0 rijen,
-- company_modules met hosting 0 rijen, subscriptions met gratis_website 0.
-- Er wordt dus geen bestaande data omgezet; de statusvertaling hieronder is
-- alleen voor de volledigheid.


-- ── 1. Website-aanvragen: het traject ───────────────────────────────────────
alter table public.website_aanvragen drop constraint if exists website_aanvragen_status_chk;

update public.website_aanvragen set status = case status
  when 'open'              then 'wacht_op_intake'
  when 'gegevens_gevraagd' then 'wacht_op_intake'
  when 'in_behandeling'    then 'in_bouw'
  when 'opgeleverd'        then 'live'
  else status end;

alter table public.website_aanvragen
  alter column status set default 'wacht_op_intake',
  add column if not exists pakket              text not null default 'basis',
  add column if not exists intake              jsonb,
  add column if not exists intake_ontvangen_op timestamptz,
  add column if not exists site_url            text,
  add column if not exists live_op             timestamptz,
  add column if not exists feedback            text,
  add column if not exists feedback_op         timestamptz,
  add column if not exists status_gewijzigd_op timestamptz,
  add column if not exists taak_id             uuid,
  add column if not exists domein              text,
  -- Gekozen in de intake: extra's als {sleutel: aantal}, domein en e-mail via
  -- ons. Domein en e-mail gaan als regel op het abonnement in bij livegang.
  add column if not exists extras              jsonb not null default '{}'::jsonb,
  add column if not exists domein_via_ons      boolean not null default false,
  add column if not exists email               boolean not null default false;

alter table public.website_aanvragen
  add constraint website_aanvragen_status_chk check (status in (
    'wacht_op_intake', 'intake_ontvangen', 'in_bouw', 'ter_beoordeling', 'live', 'geannuleerd')),
  add constraint website_aanvragen_pakket_chk check (pakket in ('basis', 'compleet', 'pro'));

-- Aanmaken doet de webhook; de nieuwe beginstatus is "wacht op intake".
create or replace function public.bb_open_website_aanvraag(p_company_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_nieuw int := 0;
begin
  if not exists (
    select 1 from public.subscriptions
    where company_id = p_company_id and welkomstactie = 'gratis_website'
  ) then
    return 'genegeerd: geen websitekeuze vastgelegd';
  end if;

  insert into public.website_aanvragen (company_id, status)
  values (p_company_id, 'wacht_op_intake')
  on conflict (company_id) do nothing;

  get diagnostics v_nieuw = row_count;
  return case when v_nieuw > 0 then 'aangemaakt' else 'bestond al' end;
end;
$$;

revoke all on function public.bb_open_website_aanvraag(uuid) from public, anon, authenticated;
grant execute on function public.bb_open_website_aanvraag(uuid) to service_role;


-- ── 2. Sleutels voor de intakelink ──────────────────────────────────────────
-- Geen policies: alleen de edge functions (service_role) lezen en schrijven.
create table if not exists public.website_tokens (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  hash        text not null unique,
  verloopt_op timestamptz not null,
  gebruikt_op timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_website_tokens_company on public.website_tokens (company_id);
alter table public.website_tokens enable row level security;
revoke all on table public.website_tokens from anon, authenticated;


-- ── 3. Betalingen en abonnementsregels ──────────────────────────────────────
-- soort 'upgrade' = pakket (met de extra's uit de intake), 'extra' = een extra
-- die later is besteld; 'hosting', 'domein' en 'email' zijn doorlopende regels.
-- wijze 'ideal'      eenmalig via Stripe Checkout; status open → betaald.
-- wijze 'abonnement' een regel op het bestaande abonnement. Per keer
--                    `per_keer` euro, elke `interval_maanden` maanden, in totaal
--                    `aantal_totaal` keer (null = doorlopend, zoals hosting).
--                    website-termijnen zet hem op de eerstvolgende factuur en
--                    houdt `aantal_gedaan` en `laatst_voor_periode` bij.
create table if not exists public.website_betalingen (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  soort               text not null,
  omschrijving        text not null,
  pakket              text,
  extras              jsonb,
  bedrag              numeric(10,2) not null,
  wijze               text not null,
  status              text not null default 'open',
  per_keer            numeric(10,2),
  interval_maanden    int,
  aantal_totaal       int,
  aantal_gedaan       int not null default 0,
  start_op            timestamptz,
  laatst_voor_periode timestamptz,
  laatst_gefactureerd timestamptz,
  stripe_session_id   text unique,
  stripe_invoiceitems text[] not null default '{}',
  fout                text,
  betaald_op          timestamptz,
  created_at          timestamptz not null default now(),
  constraint website_betalingen_soort_chk  check (soort in ('upgrade', 'extra', 'hosting', 'domein', 'email')),
  constraint website_betalingen_wijze_chk  check (wijze in ('ideal', 'abonnement')),
  constraint website_betalingen_status_chk check (status in ('open', 'betaald', 'loopt', 'afgerond', 'gestopt', 'mislukt'))
);
create index if not exists idx_website_betalingen_company on public.website_betalingen (company_id);
create index if not exists idx_website_betalingen_lopend on public.website_betalingen (status) where status = 'loopt';
alter table public.website_betalingen enable row level security;
revoke all on table public.website_betalingen from anon, authenticated;
grant select on table public.website_betalingen to authenticated;

drop policy if exists website_betalingen_eigen on public.website_betalingen;
create policy website_betalingen_eigen on public.website_betalingen for select to authenticated
  using (company_id = public.bb_current_company());


-- ── 4. Wijzigings- en domeinverzoeken ───────────────────────────────────────
create table if not exists public.website_verzoeken (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  soort           text not null,
  omschrijving    text not null,
  status          text not null default 'nieuw',
  aangemaakt_door uuid references auth.users(id) on delete set null,
  notitie         text,
  afgehandeld_op  timestamptz,
  created_at      timestamptz not null default now(),
  constraint website_verzoeken_soort_chk  check (soort in ('wijziging', 'uitbreiding', 'domein', 'email')),
  constraint website_verzoeken_status_chk check (status in ('nieuw', 'in_behandeling', 'prijsopgave', 'afgerond', 'afgewezen'))
);
create index if not exists idx_website_verzoeken_company on public.website_verzoeken (company_id, created_at desc);
alter table public.website_verzoeken enable row level security;
revoke all on table public.website_verzoeken from anon, authenticated;
grant select on table public.website_verzoeken to authenticated;

drop policy if exists website_verzoeken_eigen on public.website_verzoeken;
create policy website_verzoeken_eigen on public.website_verzoeken for select to authenticated
  using (company_id = public.bb_current_company());


-- ── 5. Opslag voor de intake ────────────────────────────────────────────────
-- Private. Uploaden gaat met een ondertekende upload-URL die website-intake
-- afgeeft na controle van de sleutel; lezen alleen via ondertekende links uit
-- website-beheer. Daarom geen storage-policies voor anon of authenticated.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('website-intake', 'website-intake', false, 26214400, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'image/svg+xml', 'image/gif', 'application/pdf'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ── 6. Hosting is geen losse module meer ────────────────────────────────────
delete from public.plan_module_tiers where module_key = 'hosting';


-- ── 7. Wat de klant in zijn dashboard ziet ──────────────────────────────────
-- Eén aanroep voor de pagina Website. Alleen het eigen bedrijf; geen intake-
-- inhoud (die is voor ons), wel status, pakket, link, betalingen en verzoeken.
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
        'extras',            w.extras)
      from public.website_aanvragen w where w.company_id = c.id),
    'betalingen', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'soort', b.soort, 'omschrijving', b.omschrijving, 'pakket', b.pakket,
        'bedrag', b.bedrag, 'wijze', b.wijze, 'status', b.status, 'perKeer', b.per_keer,
        'intervalMaanden', b.interval_maanden, 'aantalTotaal', b.aantal_totaal,
        'aantalGedaan', b.aantal_gedaan, 'startOp', b.start_op, 'betaaldOp', b.betaald_op,
        'createdAt', b.created_at) order by b.created_at)
      from public.website_betalingen b where b.company_id = c.id), '[]'::jsonb),
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


-- ── 8. Dagelijks de abonnementsregels op de factuur zetten ─────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'website-termijnen') then
    perform cron.unschedule('website-termijnen');
  end if;
end
$$;

select cron.schedule(
  'website-termijnen',
  '15 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/website-termijnen',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object(
      'scheduled', true,
      'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')
    ),
    timeout_milliseconds := 120000
  );
  $cron$
);


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
