-- Testbedrijven markeren, zodat automatische klantmail daar niet uitgaat.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De afspraakherinnering mailt de klant rechtstreeks. In testdata kunnen per
-- ongeluk echte adressen staan, en dan krijgt een echte klant post over een
-- afspraak die niet bestaat. Dat is erger dan een gemiste herinnering.
--
-- De vlag staat op het BEDRIJF, niet op de klant: de cron beslist per bedrijf,
-- en een testbedrijf hoort in zijn geheel geen klantpost te sturen.

alter table public.companies
  add column if not exists is_testbedrijf boolean not null default false;

comment on column public.companies.is_testbedrijf is
  'Testbedrijf: automatische klantmail (afspraakherinnering) wordt overgeslagen.';

-- ── Aanzetten waar een BossBase-test- of beheeradres lid is ──────────────────
-- Adressen staan op TWEE plekken en allebei tellen mee:
--   1. het loginadres van het profiel (auth.users) — profiles heeft geen
--      e-mailkolom, dus daar valt niets te matchen;
--   2. het adres op de lidmaatschapsrij (company_members), inclusief nog
--      openstaande uitnodigingen — anders mist een bedrijf waar de uitnodiging
--      is verstuurd maar nog niet geaccepteerd.
--
-- Glasmeesters is een ECHTE klant en wordt nooit gemarkeerd. Hij matcht op dit
-- moment ook niet (gemeten: nul treffers), maar de uitsluiting staat er zodat
-- een latere uitnodiging met een @bossbase.nl-adres zijn klantmail niet alsnog
-- stilzet. Op id én naam, zodat een hernoeming het slot niet opent.
with adressen as (
  select p.company_id, u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email is not null
  union
  select cm.company_id, cm.email
  from public.company_members cm
  where cm.email is not null
)
update public.companies c
set is_testbedrijf = true
where c.id <> '066b7931-812a-4aae-821d-f5022283f532'::uuid  -- Glasmeesters
  and c.name <> 'Glasmeesters'
  and exists (
    select 1
    from adressen a
    where a.company_id = c.id
      and (
        a.email ilike 'nielsgrevink+%'
        or a.email ilike '%@bossbase.nl'
        or lower(a.email) in ('nielsgrevink@gmail.com', 'nielsgrevink@live.nl', 'info@bossbase.nl')
      )
  );

-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- companies
notify pgrst, 'reload schema';
