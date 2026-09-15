-- Meldpunt voor bugs en verbeterideeën, plus de actie die meldingen beloont.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Vanuit de bovenbalk kan elke gebruiker een bug of idee doorgeven. Dat komt
-- binnen op info@bossbase.nl, maar een inbox is geen overzicht: mails raken
-- ondergesneeuwd en je ziet niet wat al is opgepakt. Daarom landt elke melding
-- óók hier, met status, zodat het super-admin portaal er een lijst van kan tonen.
--
-- Twee tabellen:
--
--   meldingen             Eén rij per melding. Aanmaken gebeurt uitsluitend door
--                         de edge function `meldpunt` (service_role): die bepaalt
--                         zelf bedrijf, gebruiker en abonnement, zodat een
--                         melder dat niet kan verzinnen. Geen insert-policy dus.
--
--   platform_instellingen Instellingen die voor héél BossBase gelden, niet per
--                         bedrijf. Eerste sleutel: `meldactie` — staat de actie
--                         met de prijzen aan, en wélke prijzen. Uitzetten laat de
--                         meldknop gewoon werken; alleen de tekst over de prijzen
--                         verdwijnt. Iedere ingelogde gebruiker mag lezen (de app
--                         moet weten of hij de prijzen toont), dus: NOOIT een
--                         geheim in deze tabel zetten.
--
-- Bedrijf, gebruiker en abonnement staan als momentopname op de melding, niet
-- alleen als verwijzing. Een bedrijf kan vertrekken of van pakket wisselen; de
-- melding moet dan nog steeds vertellen wie hem deed en in welke situatie. De
-- verwijzingen gaan bij verwijderen op NULL, de melding blijft.
--
-- Raakt geen bestaande data.


-- ── Platform-instellingen ───────────────────────────────────────────────────
create table if not exists public.platform_instellingen (
  sleutel         text primary key,
  waarde          jsonb not null,
  bijgewerkt_op   timestamptz not null default now(),
  bijgewerkt_door uuid references auth.users(id) on delete set null
);

alter table public.platform_instellingen enable row level security;

drop policy if exists platform_instellingen_lezen on public.platform_instellingen;
create policy platform_instellingen_lezen on public.platform_instellingen
  for select to authenticated using (true);

drop policy if exists platform_instellingen_super_admin on public.platform_instellingen;
create policy platform_instellingen_super_admin on public.platform_instellingen
  for all to authenticated
  using      (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin));

revoke all on table public.platform_instellingen from anon;

-- De actie begint aan. De prijzen staan hier en niet in de code, zodat de app,
-- de bevestigingsmail en het portaal dezelfde lijst tonen en een wijziging geen
-- deploy vraagt.
insert into public.platform_instellingen (sleutel, waarde)
values ('meldactie', jsonb_build_object(
  'actief', true,
  'prijzen', jsonb_build_array('Een MacBook Pro', 'Een Apple Watch Ultra', '3× een jaarabonnement BossBase')
))
on conflict (sleutel) do nothing;


-- ── Meldingen ───────────────────────────────────────────────────────────────
create table if not exists public.meldingen (
  id                uuid primary key default gen_random_uuid(),
  -- Oplopend nummer om in een mail of gesprek naar te verwijzen ("melding 12").
  nummer            bigint generated always as identity unique,
  soort             text not null,
  omschrijving      text not null,
  status            text not null default 'nieuw',

  company_id        uuid references public.companies(id) on delete set null,
  user_id           uuid references auth.users(id) on delete set null,

  -- Momentopname, zie boven.
  bedrijf_naam      text,
  gebruiker_naam    text,
  gebruiker_email   text,
  gebruiker_rol     text,
  abonnement        text,

  -- Waar de melder was en waarmee.
  pagina            text,
  pagina_url        text,
  browser           text,
  user_agent        text,
  scherm            text,

  screenshot_pad    text,                       -- in bucket `meldingen`
  actie_deelname    boolean not null default false,
  mail_verstuurd_op timestamptz,
  notitie           text,
  aangemaakt_op     timestamptz not null default now(),

  constraint meldingen_soort_chk  check (soort in ('bug', 'idee')),
  constraint meldingen_status_chk check (status in ('nieuw', 'opgepakt', 'afgehandeld', 'afgewezen')),
  constraint meldingen_omschrijving_chk check (char_length(omschrijving) between 1 and 5000)
);

create index if not exists idx_meldingen_status on public.meldingen (status, aangemaakt_op desc);
-- Voor de rate-limit in de edge function: meldingen van één gebruiker in het afgelopen uur.
create index if not exists idx_meldingen_user   on public.meldingen (user_id, aangemaakt_op desc);

alter table public.meldingen enable row level security;

-- Alleen BossBase zelf ziet en beheert meldingen. Een melder hoeft zijn eigen
-- meldingen niet terug te lezen; hij krijgt een bevestiging per mail.
drop policy if exists meldingen_super_admin on public.meldingen;
create policy meldingen_super_admin on public.meldingen
  for all to authenticated
  using      (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin));

-- Aanmaken loopt via de edge function. Geen insert-policy betekent al dat een
-- gebruiker niets kan toevoegen; het recht zelf halen we er ook af, dan hangt
-- het niet aan één ontbrekende policy.
revoke all on table public.meldingen from anon;
revoke insert, delete on table public.meldingen from authenticated;


-- ── Schermafbeeldingen ──────────────────────────────────────────────────────
-- Privé-bucket. Schrijven doet alleen de edge function (service_role, die gaat
-- langs RLS). Lezen alleen super-admins, via een signed URL in het portaal.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meldingen', 'meldingen', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists meldingen_screenshots_super_admin on storage.objects;
create policy meldingen_screenshots_super_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meldingen'
    and exists (select 1 from public.profiles where id = auth.uid() and is_super_admin)
  );


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--
--     npm run migratie:check -- meldingen platform_instellingen
notify pgrst, 'reload schema';
