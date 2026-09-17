-- Planningwijzigingen verzamelen voor één dagelijkse samenvatting per medewerker.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Wie ingepland staat en van wie de klus verschuift, hoorde dat tot nu toe
-- helemaal niet: slepen in de planning, een andere tijd, of van de bon af
-- gehaald worden gaf geen melding en geen mail.
--
-- Bij elke verschuiving meteen mailen wordt spam: tijdens het puzzelen schuift
-- een planner een blok drie keer heen en weer. Daarom worden wijzigingen hier
-- verzameld en stuurt een cron 's avonds ÉÉN mail per medewerker met de stand
-- van zijn week. De melding IN de app komt wel meteen; alleen de post wordt
-- gebundeld.
--
-- 18:00 is bewust: dan hoor je vanavond nog dat je morgen ergens anders moet
-- zijn. Een ochtendmail zou dat te laat maken.
--
-- Raakt geen bestaande data.

create table if not exists public.planning_wijzigingen (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  -- De medewerker die het aangaat (niet degene die de wijziging maakte).
  user_id        uuid not null references auth.users(id) on delete cascade,
  werkbon_id     uuid references public.werkbonnen(id) on delete set null,
  -- Momentopname: de bon kan later verdwijnen, de mail moet leesbaar blijven.
  werkbon_nummer text,
  titel          text,
  klant          text,
  -- 'ingepland' = nieuw op de planning, 'verzet' = andere dag of tijd,
  -- 'afgehaald' = van de werkbon of van die dag af.
  soort          text not null,
  oude_datum     date,
  oude_start     text,
  oude_eind      text,
  nieuwe_datum   date,
  nieuwe_start   text,
  nieuwe_eind    text,
  aangemaakt_op  timestamptz not null default now(),
  -- Gezet zodra de wijziging in een samenvattingsmail is meegegaan.
  verwerkt_op    timestamptz,

  constraint planning_wijzigingen_soort_chk check (soort in ('ingepland', 'verzet', 'afgehaald'))
);

-- De cron zoekt per medewerker de onverwerkte regels.
create index if not exists idx_planning_wijzigingen_open
  on public.planning_wijzigingen (user_id, verwerkt_op, aangemaakt_op);

alter table public.planning_wijzigingen enable row level security;

-- Lezen: je eigen regels (handig voor een toekomstig overzicht in de app).
drop policy if exists planning_wijzigingen_eigen on public.planning_wijzigingen;
create policy planning_wijzigingen_eigen on public.planning_wijzigingen
  for select to authenticated
  using (user_id = auth.uid());

-- Schrijven: de planner legt in de browser vast wat hij verschoof. Alleen binnen
-- het eigen bedrijf, en alleen voor een collega uit datzelfde bedrijf — anders
-- kon je een willekeurige gebruiker post bezorgen.
drop policy if exists planning_wijzigingen_invoeren on public.planning_wijzigingen;
create policy planning_wijzigingen_invoeren on public.planning_wijzigingen
  for insert to authenticated
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = user_id
        and p.company_id = (select company_id from public.profiles where id = auth.uid())
    )
  );

-- Bijwerken en wissen doet alleen de samenvattingsfunctie (service_role).
revoke all on table public.planning_wijzigingen from anon;
revoke update, delete on table public.planning_wijzigingen from authenticated;


-- ── Dagelijkse samenvatting ─────────────────────────────────────────────────
-- Zelfde opzet als check-herinneringen-daily en trial-mails-daily: net.http_post
-- met de sleutel uit de vault.
select cron.unschedule('planning-samenvatting-daily')
where exists (select 1 from cron.job where jobname = 'planning-samenvatting-daily');

select cron.schedule(
  'planning-samenvatting-daily',
  '0 18 * * *',
  $$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/planning-samenvatting',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $$
);


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- planning_wijzigingen
notify pgrst, 'reload schema';
