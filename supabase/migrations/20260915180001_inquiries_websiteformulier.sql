-- Websiteaanvragen: een formulier op een website komt binnen als aanvraag in
-- het dashboard van het juiste bedrijf.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Het contactformulier op bossbase.nl deed tot nu toe niets: het toonde
-- "Bericht ontvangen" en gooide de invoer weg. Dit maakt de keten
--
--     formulier → Edge Function public-website-inquiry → inquiries → dashboard
--
-- De bestaande tabel `website_aanvragen` is iets anders (de aanvragen voor een
-- gratis website bij het abonnement, super-admin) en wordt hier niet geraakt.
-- Leads zijn in BossBase deals; een aanvraag is nadrukkelijk nog géén deal. Pas
-- na beoordelen zet een gebruiker hem om naar een klant (en eventueel een deal)
-- — daarvoor krijgt de aanvraag een customer_id en deal_id.
--
-- ── Het ontwerp in drie regels ─────────────────────────────────────────────
-- 1. Een formulier (website_forms) hoort bij één bedrijf en heeft een openbaar,
--    onraadbaar token. Dat token staat in de website en is géén geheim: het
--    zegt alleen wélk formulier. Meerdere bedrijven = meerdere rijen.
-- 2. De browser schrijft nooit zelf. anon heeft op geen van deze tabellen enig
--    recht; alleen de Edge Function (service_role) slaat op, en die haalt het
--    company_id uit het formulier, nooit uit de request-body.
-- 3. Lezen en de status wijzigen mag binnen het eigen bedrijf met het recht
--    'verkoop' — hetzelfde recht als de pipeline, via current_company_id() en
--    bb_has_permission(), zoals de rest van BossBase.
--
-- ── Raakt bestaande data? ───────────────────────────────────────────────────
-- Nee. Alleen nieuwe tabellen, één nieuwe functie, één triggerfunctie en één
-- seed-rij (het formulier van BossBase Admin, zie onderaan).


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Formulieren
-- ═══════════════════════════════════════════════════════════════════════════
create table public.website_forms (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  -- Twee v4-uuid's aan elkaar: 244 willekeurige bits, zonder extensie nodig.
  public_token    text not null unique
                    default ('wf_' || replace(gen_random_uuid()::text, '-', '')
                                   || replace(gen_random_uuid()::text, '-', ''))
                    check (public_token ~ '^[A-Za-z0-9_-]{32,128}$'),
  is_active       boolean not null default true,
  -- Volledige origins, zoals de browser ze in de Origin-header zet:
  -- 'https://bossbase.nl', geen pad en geen slash aan het eind.
  allowed_domains text[] not null default '{}',
  settings        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index website_forms_company_id_idx on public.website_forms (company_id);

create trigger website_forms_updated_at
  before update on public.website_forms
  for each row execute function public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Aanvragen
-- ═══════════════════════════════════════════════════════════════════════════
-- De lengtes zijn gelijk aan AANVRAAG_LIMIETEN in
-- supabase/functions/_shared/websiteAanvraag.ts. De functie keurt eerder af met
-- een nette melding; deze checks zijn het tweede slot.
create table public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  form_id       uuid references public.website_forms(id) on delete set null,
  -- Gevuld bij omzetten naar klant/lead. Beide volgen het bestaande model:
  -- customers.id en deals.id; assigned_to verwijst naar profiles zoals
  -- deals.assigned_to.
  customer_id   uuid references public.customers(id) on delete set null,
  deal_id       uuid references public.deals(id) on delete set null,
  assigned_to   uuid references public.profiles(id) on delete set null,
  name          text not null check (char_length(name) between 1 and 120),
  company_name  text check (char_length(company_name) <= 160),
  email         text not null check (char_length(email) between 3 and 254),
  phone         text check (char_length(phone) <= 40),
  subject       text check (char_length(subject) <= 160),
  message       text not null check (char_length(message) between 1 and 5000),
  source        text not null default 'website' check (char_length(source) between 1 and 60),
  source_url    text check (char_length(source_url) <= 2048),
  status        text not null default 'nieuw'
                  check (status in ('nieuw', 'in_behandeling', 'gekwalificeerd', 'afgewezen', 'spam')),
  is_test       boolean not null default false,
  -- Idempotentiesleutel uit de browser. Een dubbelklik of een retry na een
  -- netwerkfout stuurt dezelfde id mee en levert zo geen tweede aanvraag op.
  submission_id uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Het overzicht vraagt altijd "van mijn bedrijf, nieuwste eerst", en filtert op
-- status. company_id staat vooraan omdat elke RLS-controle daarop filtert.
create index inquiries_company_created_idx on public.inquiries (company_id, created_at desc);
create index inquiries_company_status_idx  on public.inquiries (company_id, status);
create index inquiries_form_id_idx         on public.inquiries (form_id);
create index inquiries_customer_id_idx     on public.inquiries (customer_id) where customer_id is not null;
create index inquiries_deal_id_idx         on public.inquiries (deal_id) where deal_id is not null;
create unique index inquiries_form_submission_uniq
  on public.inquiries (form_id, submission_id) where submission_id is not null;

create trigger inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

-- ── Kruistenant-slot ────────────────────────────────────────────────────────
-- Een foreign key controleert alleen dát de rij bestaat, niet bij wélk bedrijf
-- hij hoort, en loopt buiten RLS om. Zonder deze trigger kon een gebruiker de
-- customer_id van een klant van een ánder bedrijf aan zijn eigen aanvraag
-- hangen. SECURITY DEFINER zodat de controle ook werkt waar RLS de andere rij
-- verbergt; de trigger zelf vraagt geen EXECUTE van de aanroeper.
create or replace function public.bb_inquiries_zelfde_bedrijf()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.form_id is not null and not exists (
       select 1 from public.website_forms f where f.id = new.form_id and f.company_id = new.company_id) then
    raise exception 'Formulier hoort niet bij dit bedrijf' using errcode = '23514';
  end if;
  if new.customer_id is not null and not exists (
       select 1 from public.customers c where c.id = new.customer_id and c.company_id = new.company_id) then
    raise exception 'Klant hoort niet bij dit bedrijf' using errcode = '23514';
  end if;
  if new.deal_id is not null and not exists (
       select 1 from public.deals d where d.id = new.deal_id and d.company_id = new.company_id) then
    raise exception 'Deal hoort niet bij dit bedrijf' using errcode = '23514';
  end if;
  if new.assigned_to is not null and not exists (
       select 1 from public.profiles p where p.id = new.assigned_to and p.company_id = new.company_id) then
    raise exception 'Medewerker hoort niet bij dit bedrijf' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.bb_inquiries_zelfde_bedrijf() from public, anon, authenticated;

create trigger inquiries_zelfde_bedrijf
  before insert or update of company_id, form_id, customer_id, deal_id, assigned_to on public.inquiries
  for each row execute function public.bb_inquiries_zelfde_bedrijf();


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Rate limiting
-- ═══════════════════════════════════════════════════════════════════════════
-- Zelfde opzet als boss_rate_limit / bb_boss_claim_bericht: een teller per
-- sleutel met een vast venster, geclaimd onder FOR UPDATE zodat gelijktijdige
-- verzoeken elkaar niet inhalen. De sleutel is 'ip:<hmac>', 'email:<hmac>' of
-- 'form:<uuid>' — de functie hasht IP en e-mail vóór ze hier komen, er staat
-- dus nooit een ruw IP-adres of e-mailadres in.
create table public.website_inquiry_attempts (
  sleutel      text primary key check (char_length(sleutel) <= 200),
  window_start timestamptz not null default now(),
  aantal       integer not null default 0
);

create or replace function public.bb_website_inquiry_claim(p_sleutel text, p_max integer, p_venster_sec integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_start  timestamptz;
  v_aantal integer;
begin
  if p_sleutel is null or char_length(p_sleutel) > 200 or p_max < 1 or p_venster_sec < 1 then
    return false;
  end if;

  insert into public.website_inquiry_attempts (sleutel, window_start, aantal)
  values (p_sleutel, now(), 0)
  on conflict (sleutel) do nothing;

  select window_start, aantal into v_start, v_aantal
  from public.website_inquiry_attempts where sleutel = p_sleutel
  for update;

  if v_start < now() - make_interval(secs => p_venster_sec) then
    v_start  := now();
    v_aantal := 0;
  end if;

  if v_aantal >= p_max then
    return false;
  end if;

  update public.website_inquiry_attempts
     set window_start = v_start, aantal = v_aantal + 1
   where sleutel = p_sleutel;

  -- Af en toe opruimen, zodat de tabel niet eindeloos groeit. Een dag is ruim
  -- langer dan het langste venster (een uur).
  if random() < 0.02 then
    delete from public.website_inquiry_attempts where window_start < now() - interval '1 day';
  end if;

  return true;
end;
$$;

revoke all on function public.bb_website_inquiry_claim(text, integer, integer) from public, anon, authenticated;
grant execute on function public.bb_website_inquiry_claim(text, integer, integer) to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS en rechten
-- ═══════════════════════════════════════════════════════════════════════════
-- De default privileges geven een nieuwe tabel SELECT/INSERT/UPDATE/DELETE aan
-- anon en authenticated (alleen TRUNCATE is sinds 20260902140000 weg). Dat
-- halen we hier volledig weg en geven daarna precies terug wat nodig is.
revoke all on table public.website_forms            from anon, authenticated;
revoke all on table public.inquiries                from anon, authenticated;
revoke all on table public.website_inquiry_attempts from anon, authenticated;

alter table public.website_forms            enable row level security;
alter table public.inquiries                enable row level security;
alter table public.website_inquiry_attempts enable row level security;
-- website_inquiry_attempts: bewust géén policies. Alleen service_role (die RLS
-- omzeilt) en de SECURITY DEFINER-functie hierboven komen erbij.

-- Formulieren: inzien binnen het eigen bedrijf (voor later beheer in het
-- dashboard). Aanmaken en wijzigen loopt voorlopig alleen via SQL/service_role.
grant select on public.website_forms to authenticated;

create policy website_forms_select on public.website_forms
  for select to authenticated
  using (company_id = (select public.current_company_id())
         and (select public.bb_has_permission('verkoop')));

-- Aanvragen: lezen en een beperkt aantal kolommen wijzigen. Geen INSERT en geen
-- DELETE voor clients: binnenkomen doet alleen de Edge Function, en weggooien
-- heet hier "status spam".
grant select on public.inquiries to authenticated;
grant update (status, assigned_to, customer_id, deal_id) on public.inquiries to authenticated;

create policy inquiries_select on public.inquiries
  for select to authenticated
  using (company_id = (select public.current_company_id())
         and (select public.bb_has_permission('verkoop')));

create policy inquiries_update on public.inquiries
  for update to authenticated
  using (company_id = (select public.current_company_id())
         and (select public.bb_has_permission('verkoop')))
  with check (company_id = (select public.current_company_id())
              and (select public.bb_has_permission('verkoop')));


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Het formulier van BossBase Admin
-- ═══════════════════════════════════════════════════════════════════════════
-- Het company_id is opgezocht in de gekoppelde database
-- (select id from companies where name = 'BossBase Admin'), niet geraden. Het
-- staat hier als id en niet als naam, zodat een hernoemd of tweede bedrijf met
-- dezelfde naam nooit dit formulier krijgt. Bestaat het bedrijf niet (een
-- lokale of andere omgeving), dan voegt dit niets toe.
--
-- Het token wordt hier gegenereerd. Na het pushen uitlezen met:
--   select public_token from website_forms
--    where company_id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca'
--      and settings->>'source' = 'bossbase_website';
-- en zetten als VITE_BOSSBASE_FORM_TOKEN (lokaal in .env.local, in Vercel bij
-- de environment variables).
insert into public.website_forms (company_id, name, allowed_domains, settings)
select c.id,
       'Contactformulier bossbase.nl',
       array['https://bossbase.nl', 'https://www.bossbase.nl',
             'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'],
       jsonb_build_object('source', 'bossbase_website')
  from public.companies c
 where c.id = '8131d2e8-4190-4b5e-8ff2-c0c5aac68aca'
   and not exists (select 1 from public.website_forms f
                    where f.company_id = c.id and f.settings->>'source' = 'bossbase_website');


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Zelfcontrole
-- ═══════════════════════════════════════════════════════════════════════════
-- Controleert de rechten zoals ze ná deze migratie echt staan, niet zoals we
-- denken dat ze staan. Klopt er iets niet, dan faalt de hele migratie.
do $$
declare
  v_fout text[] := '{}';
  t text;
  p text;
begin
  foreach t in array array['public.website_forms', 'public.inquiries', 'public.website_inquiry_attempts'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('anon', t, p) then v_fout := v_fout || format('anon %s op %s', p, t); end if;
    end loop;
    foreach p in array array['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('authenticated', t, p) then v_fout := v_fout || format('authenticated %s op %s', p, t); end if;
    end loop;
  end loop;

  if has_table_privilege('authenticated', 'public.website_inquiry_attempts', 'SELECT')
     or has_table_privilege('authenticated', 'public.website_inquiry_attempts', 'UPDATE') then
    v_fout := v_fout || 'authenticated heeft rechten op website_inquiry_attempts'::text;
  end if;
  if has_table_privilege('authenticated', 'public.website_forms', 'UPDATE') then
    v_fout := v_fout || 'authenticated mag website_forms wijzigen'::text;
  end if;
  foreach p in array array['company_id', 'form_id', 'name', 'email', 'phone', 'message', 'source', 'is_test', 'metadata', 'created_at'] loop
    if has_column_privilege('authenticated', 'public.inquiries', p, 'UPDATE') then
      v_fout := v_fout || format('authenticated mag inquiries.%s wijzigen', p);
    end if;
  end loop;

  if has_function_privilege('anon', 'public.bb_website_inquiry_claim(text, integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.bb_website_inquiry_claim(text, integer, integer)', 'EXECUTE') then
    v_fout := v_fout || 'bb_website_inquiry_claim uitvoerbaar voor clients'::text;
  end if;
  if has_function_privilege('anon', 'public.bb_inquiries_zelfde_bedrijf()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.bb_inquiries_zelfde_bedrijf()', 'EXECUTE') then
    v_fout := v_fout || 'bb_inquiries_zelfde_bedrijf uitvoerbaar voor clients'::text;
  end if;

  if cardinality(v_fout) > 0 then
    raise exception 'Rechten op de aanvraagtabellen kloppen niet: %', array_to_string(v_fout, '; ');
  end if;
end $$;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Zie _TEMPLATE.sql en CLAUDE.md. Daarna: npm run migratie:check -- inquiries website_forms
notify pgrst, 'reload schema';
