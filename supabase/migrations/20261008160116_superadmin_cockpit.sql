-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De superadmin wordt opnieuw opgezet als losse pagina's (Vandaag, Aanvragen,
-- Klanten, Omzet, Websites, Support, Analytics, Systeem, Logboek). Deze
-- migratie legt de databasekant: alles wat er nieuw bij komt. Ze is
-- bewust ADDITIEF: de huidige superadmin blijft er gewoon mee werken. Het
-- weghalen van de oude superbeheer-RLS-regels gebeurt pas bij de livegang van
-- de nieuwe pagina's, in een aparte migratie.
--
-- 1. superadmin_log — elke handeling in de superadmin (wie, wat, wanneer, bij
--    wie, voor/na). Alleen toevoegen; een regel krijgt één keer zijn uitkomst
--    en is daarna niet meer te wijzigen of te wissen, door niemand.
-- 2. sa_aanvragen — de pipeline van een aanvraag via bossbase.nl (nieuw,
--    contact gehad, demo, in proef, klant, afgewezen). Los van
--    inquiries.status, want die tabel delen we met de websiteformulieren van
--    klanten en hun statussen betekenen iets anders.
--    Bestaande aanvragen worden omgezet (keuze gebruiker 2026-10-08):
--      nieuw → nieuw, in_behandeling → contact, gekwalificeerd → demo
--      (of proef/klant als er al een account bij hoort), afgewezen →
--      afgewezen, spam → afgewezen met reden "Spam".
-- 3. sa_notities — notities als tijdlijn (bij een aanvraag of een klant). Het
--    oude notitieveld subscriptions.notes wordt de eerste notitie.
-- 4. sa_vandaag — "Later" en "Afgehandeld" op de lijst Vandaag.
-- 5. boss_conversations.doorzet_afgehandeld_op — een doorgezette Boss-vraag
--    afhandelen.
-- 6. stripe_facturen — facturen uit Stripe (webhook + eenmalig ophalen).
--    Tot nu toe bewaarden we geen enkele betaling.
-- 7. omzet_momentopnames — per bedrijf per maand: pakket, status en MRR.
--    Zonder dit is de omzet van vorige maanden niet terug te rekenen, want een
--    pakketwijziging overschrijft de oude waarde. Een cron schrijft elke nacht
--    de stand van de lopende maand; de laatste nacht van de maand blijft staan.
-- 8. Eigen cookievrije meting van bossbase.nl: website_meting + meting_zout,
--    en companies.aanmeldbron (het kanaal waarlangs een account binnenkwam).
-- 9. Leesfuncties voor de edge function `superadmin` (alleen service_role).


-- ── 1. Logboek ──────────────────────────────────────────────────────────────
create table public.superadmin_log (
  id           bigint generated always as identity primary key,
  op           timestamptz not null default now(),
  door         uuid not null,
  door_naam    text,
  actie        text not null,
  omschrijving text not null,
  soort        text not null check (soort in ('aanvraag', 'klant', 'website', 'support', 'systeem')),
  -- Geen foreign key: het logboek moet blijven staan als een bedrijf wordt
  -- verwijderd, en een cascade zou een update zijn die de grendel tegenhoudt.
  company_id   uuid,
  doel         text,
  doel_id      text,
  voor         jsonb,
  na           jsonb,
  uitkomst     text check (uitkomst in ('gelukt', 'mislukt')),
  fout         text
);
create index superadmin_log_op_idx on public.superadmin_log (op desc);
create index superadmin_log_company_idx on public.superadmin_log (company_id, op desc);

alter table public.superadmin_log enable row level security;
-- Geen policies: alleen de edge function (service_role) leest en schrijft.
revoke all on table public.superadmin_log from public, anon, authenticated, service_role;
grant select, insert, update on table public.superadmin_log to service_role;

-- De grendel. Een regel wordt geschreven vóór de handeling (uitkomst leeg) en
-- krijgt daarna één keer zijn uitkomst (plus eventueel de stand erna en een
-- foutmelding). Verder niets: geen wijziging van wat er gebeurde, geen wissen.
create function public.bb_superadmin_log_grendel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'Het superadmin-logboek kan niet worden gewist';
  end if;
  if old.uitkomst is not null
     or new.uitkomst is null
     or new.id is distinct from old.id
     or new.op is distinct from old.op
     or new.door is distinct from old.door
     or new.door_naam is distinct from old.door_naam
     or new.actie is distinct from old.actie
     or new.omschrijving is distinct from old.omschrijving
     or new.soort is distinct from old.soort
     or new.company_id is distinct from old.company_id
     or new.doel is distinct from old.doel
     or new.doel_id is distinct from old.doel_id
     or new.voor is distinct from old.voor then
    raise exception 'Een regel in het superadmin-logboek krijgt alleen één keer een uitkomst';
  end if;
  return new;
end
$$;
revoke all on function public.bb_superadmin_log_grendel() from public, anon, authenticated;

create trigger superadmin_log_grendel
  before update or delete on public.superadmin_log
  for each row execute function public.bb_superadmin_log_grendel();
-- TRUNCATE gaat langs rijtriggers heen; daarom ook een statementtrigger.
create trigger superadmin_log_geen_truncate
  before truncate on public.superadmin_log
  for each statement execute function public.bb_superadmin_log_grendel();


-- ── 2. Pipeline van aanvragen via bossbase.nl ───────────────────────────────
create table public.sa_aanvragen (
  inquiry_id        uuid primary key references public.inquiries(id) on delete cascade,
  fase              text not null default 'nieuw'
                    check (fase in ('nieuw', 'contact', 'demo', 'proef', 'klant', 'afgewezen')),
  afwijsreden       text,
  volgende_stap     text,
  -- Het account dat bij deze aanvraag hoort (zelfde e-mailadres). Gezet door de
  -- edge function zodra het er is; daarmee schuift de kaart naar proef/klant.
  company_id        uuid references public.companies(id) on delete set null,
  fase_gewijzigd_op timestamptz not null default now(),
  aangemaakt_op     timestamptz not null default now()
);
create index sa_aanvragen_fase_idx on public.sa_aanvragen (fase);
alter table public.sa_aanvragen enable row level security;
revoke all on table public.sa_aanvragen from public, anon, authenticated;
grant select, insert, update, delete on table public.sa_aanvragen to service_role;

-- Bij welk bedrijf hoort een e-mailadres? Eerst een gebruiker met dat adres,
-- anders het e-mailadres van het bedrijf zelf. Testbedrijven tellen niet.
create function public.sa_bedrijf_bij_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select p.company_id
       from auth.users u
       join public.profiles p on p.id = u.id
       join public.companies c on c.id = p.company_id
      where lower(u.email) = lower(trim(p_email))
        and not coalesce(c.is_testbedrijf, false)
      order by p.created_at
      limit 1),
    (select c.id from public.companies c
      where lower(c.email) = lower(trim(p_email))
        and not coalesce(c.is_testbedrijf, false)
      order by c.created_at
      limit 1)
  )
$$;
revoke all on function public.sa_bedrijf_bij_email(text) from public, anon, authenticated;
grant execute on function public.sa_bedrijf_bij_email(text) to service_role;

-- Fase die bij een gekoppeld bedrijf hoort: proef zolang er geen betaald
-- abonnement is, klant zodra er een is geweest.
create function public.sa_fase_van_bedrijf(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.status in ('actief', 'betaalprobleem', 'opgezegd') then 'klant'
    when s.status = 'trial' or s.status is null then 'proef'
    else 'proef'
  end
  from public.companies c
  left join public.subscriptions s on s.company_id = c.id
  where c.id = p_company_id
$$;
revoke all on function public.sa_fase_van_bedrijf(uuid) from public, anon, authenticated;
grant execute on function public.sa_fase_van_bedrijf(uuid) to service_role;

-- Bestaande aanvragen omzetten.
insert into public.sa_aanvragen (inquiry_id, fase, afwijsreden, company_id, fase_gewijzigd_op, aangemaakt_op)
select
  i.id,
  case i.status
    when 'in_behandeling' then 'contact'
    when 'gekwalificeerd' then
      case when public.sa_bedrijf_bij_email(i.email) is not null
           then public.sa_fase_van_bedrijf(public.sa_bedrijf_bij_email(i.email))
           else 'demo' end
    when 'afgewezen' then 'afgewezen'
    when 'spam' then 'afgewezen'
    else 'nieuw'
  end,
  case i.status when 'spam' then 'Spam' when 'afgewezen' then 'Afgewezen' end,
  case when i.status = 'gekwalificeerd' then public.sa_bedrijf_bij_email(i.email) end,
  coalesce(i.updated_at, i.created_at),
  i.created_at
from public.inquiries i
join public.website_forms f on f.id = i.form_id
where f.settings->>'bestemming' = 'superadmin'
on conflict (inquiry_id) do nothing;


-- ── 3. Notities ─────────────────────────────────────────────────────────────
create table public.sa_notities (
  id         uuid primary key default gen_random_uuid(),
  doel_soort text not null check (doel_soort in ('aanvraag', 'klant')),
  doel_id    uuid not null,
  tekst      text not null check (length(trim(tekst)) > 0),
  door       uuid,
  door_naam  text,
  op         timestamptz not null default now()
);
create index sa_notities_doel_idx on public.sa_notities (doel_soort, doel_id, op desc);
alter table public.sa_notities enable row level security;
revoke all on table public.sa_notities from public, anon, authenticated;
grant select, insert on table public.sa_notities to service_role;

-- Het oude notitieveld wordt de eerste notitie. Het veld zelf blijft staan.
insert into public.sa_notities (doel_soort, doel_id, tekst, door_naam, op)
select 'klant', s.company_id, s.notes, 'Uit het oude notitieveld', coalesce(s.created_at, now())
from public.subscriptions s
where nullif(trim(s.notes), '') is not null;


-- ── 4. Later / afgehandeld op Vandaag ───────────────────────────────────────
-- De sleutel beschrijft één voorval (bijv. 'proef:<bedrijf>:<einddatum>'),
-- zodat een nieuw voorval van hetzelfde soort gewoon weer verschijnt.
create table public.sa_vandaag (
  sleutel text primary key,
  status  text not null check (status in ('later', 'klaar')),
  tot     timestamptz,
  door    uuid,
  op      timestamptz not null default now()
);
alter table public.sa_vandaag enable row level security;
revoke all on table public.sa_vandaag from public, anon, authenticated;
grant select, insert, update, delete on table public.sa_vandaag to service_role;


-- ── 5. Doorgezette Boss-vragen afhandelen ───────────────────────────────────
alter table public.boss_conversations add column if not exists doorzet_afgehandeld_op timestamptz;


-- ── 6. Facturen uit Stripe ──────────────────────────────────────────────────
create table public.stripe_facturen (
  stripe_invoice_id      text primary key,
  company_id             uuid,
  stripe_customer_id     text,
  stripe_subscription_id text,
  nummer                 text,
  stripe_status          text,
  betaalstatus           text not null check (betaalstatus in ('betaald', 'mislukt', 'open', 'vervallen', 'concept')),
  soort                  text not null check (soort in ('abonnement', 'website', 'overig')),
  omschrijving           text,
  bedrag                 numeric(12,2),
  bedrag_excl            numeric(12,2),
  valuta                 text,
  regels                 jsonb not null default '[]'::jsonb,
  periode_start          timestamptz,
  periode_eind           timestamptz,
  factuurdatum           timestamptz,
  betaald_op             timestamptz,
  pogingen               int,
  volgende_poging        timestamptz,
  fout                   text,
  url                    text,
  pdf                    text,
  bijgewerkt_op          timestamptz not null default now()
);
create index stripe_facturen_company_idx on public.stripe_facturen (company_id, factuurdatum desc);
create index stripe_facturen_status_idx on public.stripe_facturen (betaalstatus);
alter table public.stripe_facturen enable row level security;
revoke all on table public.stripe_facturen from public, anon, authenticated;
grant select, insert, update on table public.stripe_facturen to service_role;


-- ── 7. Omzet per maand ──────────────────────────────────────────────────────
create table public.omzet_momentopnames (
  maand          date not null check (maand = date_trunc('month', maand)::date),
  company_id     uuid not null,
  plan           text,
  status         text,
  interval       text,
  mrr            numeric(10,2) not null default 0,
  -- 'momentopname' = stand uit onze database, elke nacht bijgewerkt voor de
  -- lopende maand. 'stripe' = achteraf afgeleid uit de facturen in Stripe, voor
  -- maanden van vóór de momentopnames.
  bron           text not null default 'momentopname' check (bron in ('momentopname', 'stripe')),
  vastgelegd_op  timestamptz not null default now(),
  primary key (maand, company_id)
);
alter table public.omzet_momentopnames enable row level security;
revoke all on table public.omzet_momentopnames from public, anon, authenticated;
grant select, insert, update on table public.omzet_momentopnames to service_role;

-- MRR van een bedrijf nu: pakketprijs + extra gebruikers + modules, alleen
-- voor een betaald abonnement. Prijzen gelijk aan src/lib/tiers.js en
-- plan_modules. Een proef telt niet mee, een opgezegd abonnement dat nog
-- loopt (stopt_op in de toekomst) wel.
create function public.sa_mrr(p_company_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when s.status in ('actief', 'betaalprobleem')
        or (s.status = 'opgezegd' and coalesce(s.stopt_op, s.current_period_end) > now()) then
        (case s.plan when 'starter' then 29 when 'groei' then 39 when 'team' then 59 else 0 end)
        + coalesce(s.extra_gebruikers, 0) * 10
        + coalesce((select sum(m.price)
                      from public.company_modules cm
                      join public.plan_modules m on m.module_key = cm.module_key
                     where cm.company_id = s.company_id and cm.actief), 0)
      else 0
    end
    from public.subscriptions s
    where s.company_id = p_company_id
  ), 0)
$$;
revoke all on function public.sa_mrr(uuid) from public, anon, authenticated;
grant execute on function public.sa_mrr(uuid) to service_role;

create function public.sa_omzet_momentopname()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maand date := date_trunc('month', (now() at time zone 'Europe/Amsterdam'))::date;
  v_aantal int;
begin
  insert into public.omzet_momentopnames (maand, company_id, plan, status, interval, mrr, bron, vastgelegd_op)
  select v_maand, c.id, s.plan,
         case when c.status = 'geblokkeerd' then 'geblokkeerd' else coalesce(s.status, 'geen') end,
         s.billing_interval, public.sa_mrr(c.id), 'momentopname', now()
  from public.companies c
  left join public.subscriptions s on s.company_id = c.id
  where not coalesce(c.is_testbedrijf, false)
  on conflict (maand, company_id) do update
    set plan = excluded.plan, status = excluded.status, interval = excluded.interval,
        mrr = excluded.mrr, bron = 'momentopname', vastgelegd_op = now();
  get diagnostics v_aantal = row_count;
  return v_aantal;
end
$$;
revoke all on function public.sa_omzet_momentopname() from public, anon, authenticated;
grant execute on function public.sa_omzet_momentopname() to service_role;

-- Elke nacht de lopende maand bijwerken. De laatste run van een maand blijft
-- staan als de stand aan het einde van die maand.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'omzet-momentopname') then
    perform cron.unschedule('omzet-momentopname');
  end if;
end
$$;
select cron.schedule('omzet-momentopname', '50 21 * * *', $cron$ select public.sa_omzet_momentopname(); $cron$);

-- Meteen een eerste momentopname.
select public.sa_omzet_momentopname();


-- ── 8. Eigen cookievrije meting van bossbase.nl ─────────────────────────────
-- Zie supabase/functions/meting en docs/juridisch/cookiebeleid.md. Geen
-- cookies, niets in de browser. Een bezoeker is een hash van IP-adres en
-- browser met een zout dat per dag wisselt en na die dag wordt gewist; het
-- IP-adres zelf wordt nergens bewaard. Na het wissen van het zout is een hash
-- niet meer terug te leiden en niet aan een volgende dag te koppelen.
create table public.meting_zout (
  dag  date primary key,
  zout text not null
);
alter table public.meting_zout enable row level security;
revoke all on table public.meting_zout from public, anon, authenticated;
grant select, insert, delete on table public.meting_zout to service_role;

create table public.website_meting (
  id           bigint generated always as identity primary key,
  op           timestamptz not null default now(),
  dag          date not null default (now() at time zone 'Europe/Amsterdam')::date,
  soort        text not null check (soort in ('pagina', 'gebeurtenis')),
  naam         text,
  pad          text,
  bron         text,
  verwijzer    text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  apparaat     text,
  bezoeker     text
);
create index website_meting_dag_idx on public.website_meting (dag);
create index website_meting_bezoeker_idx on public.website_meting (bezoeker, dag);
alter table public.website_meting enable row level security;
revoke all on table public.website_meting from public, anon, authenticated;
grant select, insert, delete on table public.website_meting to service_role;

-- Langs welk kanaal kwam een account binnen (bijv. "Google (organisch)").
-- Alleen het kanaal, nooit de bezoekershash.
alter table public.companies add column if not exists aanmeldbron text;


-- ── 9. Leesfuncties voor de superadmin ──────────────────────────────────────
-- Allemaal security definer en alleen voor service_role: de edge function
-- `superadmin` controleert wie er vraagt.

-- Gebruikers met e-mail en laatste login (auth.users is niet via de API te lezen).
create function public.sa_gebruikers()
returns table (
  id uuid, company_id uuid, email text, full_name text, role text, telefoon text,
  laatste_login timestamptz, is_super_admin boolean, actief boolean, aangemaakt_op timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.company_id, u.email::text, p.full_name, p.role, p.telefoon,
         u.last_sign_in_at, coalesce(p.is_super_admin, false), coalesce(p.actief, true), p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.verwijderd_op is null
$$;
revoke all on function public.sa_gebruikers() from public, anon, authenticated;
grant execute on function public.sa_gebruikers() to service_role;

-- Activiteit per bedrijf per week (maandag), over de laatste p_weken weken:
-- alles wat er in de app wordt aangemaakt.
create function public.sa_activiteit(p_weken int default 7)
returns table (company_id uuid, week date, aantal bigint)
language sql
stable
security definer
set search_path = public
as $$
  with vanaf as (select date_trunc('week', now()) - make_interval(weeks => greatest(p_weken, 1) - 1) as t),
  rijen as (
    select company_id, created_at from public.offertes        where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.facturen         where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.werkbonnen       where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.calendar_events  where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.urenregistratie  where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.werkbon_uren     where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.activities       where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.customers        where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.deals            where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.projects         where created_at >= (select t from vanaf)
    union all select company_id, created_at from public.job_costs        where created_at >= (select t from vanaf)
  )
  select company_id, date_trunc('week', created_at)::date, count(*)
  from rijen
  where company_id is not null
  group by 1, 2
$$;
revoke all on function public.sa_activiteit(int) from public, anon, authenticated;
grant execute on function public.sa_activiteit(int) to service_role;

-- Welke functies gebruikte een bedrijf in de laatste p_dagen dagen.
create function public.sa_functiegebruik(p_dagen int default 30)
returns table (company_id uuid, functie text, aantal bigint)
language sql
stable
security definer
set search_path = public
as $$
  with vanaf as (select now() - make_interval(days => greatest(p_dagen, 1)) as t)
  select company_id, functie, count(*) from (
    select company_id, 'Offertes' as functie from public.offertes where created_at >= (select t from vanaf)
    union all select company_id, 'Facturen' from public.facturen where created_at >= (select t from vanaf)
    union all select company_id, 'Werkbonnen' from public.werkbonnen where created_at >= (select t from vanaf)
    union all select company_id, 'Planning' from public.calendar_events where created_at >= (select t from vanaf)
    union all select company_id, 'Uren' from public.urenregistratie where created_at >= (select t from vanaf)
    union all select company_id, 'Uren' from public.werkbon_uren where created_at >= (select t from vanaf)
    union all select company_id, 'Klanten en pipeline' from public.customers where created_at >= (select t from vanaf)
    union all select company_id, 'Klanten en pipeline' from public.deals where created_at >= (select t from vanaf)
    union all select company_id, 'Projecten en kosten' from public.projects where created_at >= (select t from vanaf)
    union all select company_id, 'Projecten en kosten' from public.job_costs where created_at >= (select t from vanaf)
    union all select company_id, 'Boss (chat)' from public.boss_conversations where created_at >= (select t from vanaf)
    union all select r.company_id, 'Boekhoudkoppeling' from public.accounting_sync_runs r where r.gestart_op >= (select t from vanaf)
  ) x
  where company_id is not null
  group by 1, 2
$$;
revoke all on function public.sa_functiegebruik(int) from public, anon, authenticated;
grant execute on function public.sa_functiegebruik(int) to service_role;

-- Gebruikscijfers per bedrijf (totaal), zoals de huidige bedrijfslade toont.
create function public.sa_gebruik_totaal(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'klanten',    (select count(*) from public.customers  where company_id = p_company_id),
    'projecten',  (select count(*) from public.projects   where company_id = p_company_id),
    'offertes',   (select count(*) from public.offertes   where company_id = p_company_id),
    'facturen',   (select count(*) from public.facturen   where company_id = p_company_id),
    'werkbonnen', (select count(*) from public.werkbonnen where company_id = p_company_id),
    'uren',       (select coalesce(sum(uren), 0) from public.werkbon_uren where company_id = p_company_id),
    'boss',       (select count(*) from public.boss_conversations where company_id = p_company_id),
    'laatsteActiviteit', (select max(created_at) from public.activities where company_id = p_company_id)
  )
$$;
revoke all on function public.sa_gebruik_totaal(uuid) from public, anon, authenticated;
grant execute on function public.sa_gebruik_totaal(uuid) to service_role;

-- Geplande taken: laatste run per taak en het aantal mislukte runs in 24 uur.
create function public.sa_cron_status()
returns table (naam text, schema text, actief boolean, laatst timestamptz, status text, duur_ms numeric, melding text, mislukt_24u bigint)
language sql
stable
security definer
set search_path = public, cron
as $$
  select j.jobname::text, j.schedule::text, j.active, d.start_time, d.status::text,
         round(extract(epoch from (d.end_time - d.start_time)) * 1000),
         left(d.return_message, 300),
         (select count(*) from cron.job_run_details r
           where r.jobid = j.jobid and r.status = 'failed' and r.start_time > now() - interval '24 hours')
  from cron.job j
  left join lateral (
    select * from cron.job_run_details r where r.jobid = j.jobid order by r.start_time desc limit 1
  ) d on true
  order by j.jobname
$$;
revoke all on function public.sa_cron_status() from public, anon, authenticated;
grant execute on function public.sa_cron_status() to service_role;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Uitkomst voor de droogloop.
select
  (select count(*) from public.sa_aanvragen) as aanvragen_omgezet,
  (select jsonb_object_agg(fase, n) from (select fase, count(*) n from public.sa_aanvragen group by fase) x) as per_fase,
  (select count(*) from public.sa_notities) as notities_overgenomen,
  (select count(*) from public.omzet_momentopnames) as momentopnames;
