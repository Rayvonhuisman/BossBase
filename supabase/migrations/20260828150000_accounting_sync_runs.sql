-- Sync-runs vastleggen: wanneer is er gesynchroniseerd, lukte het, en wat ging er mis.
--
-- Aanleiding: er komt een nachtelijke cron (zie 20260828160000). Draait die om
-- 03:20 en mislukt er een boeking, dan stond dat tot nu toe alleen in de
-- functielogs — en die leest niemand. Een mislukte boeking bleef daardoor
-- onzichtbaar tot iemand toevallig zijn boekhouding naliep.
--
-- Bewust een TABEL en geen kolommen op accounting_connections: kolommen
-- overschrijven zichzelf elke run, en juist de geschiedenis is bruikbaar als je
-- later wilt weten wanneer iets stuk is gegaan.
--
-- Schrijven doet alleen de service-role (de edge functions). Lezen mag je eigen
-- bedrijf; er is geen insert-, update- of delete-policy voor gewone gebruikers,
-- want een gebruiker hoort zijn eigen synchronisatiehistorie niet te kunnen
-- bijstellen.

create table if not exists public.accounting_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  provider      text not null,                       -- 'snelstart' | 'moneybird' | 'afas'
  onderdeel     text not null,                       -- 'kosten-facturen' | 'contacten'
  bron          text not null default 'handmatig',   -- 'cron' | 'handmatig'
  gestart_op    timestamptz not null default now(),
  -- Leeg terwijl hij loopt. Blijft hij leeg, dan is de functie halverwege
  -- afgekapt (timeout) — ook dat wil je kunnen zien.
  klaar_op      timestamptz,
  gelukt        boolean,
  fout          text,                                -- harde fout die de run afbrak
  fouten        jsonb not null default '[]'::jsonb,  -- regels die niet geboekt zijn
  meldingen     jsonb not null default '[]'::jsonb,  -- wel doorgegaan, wél aandacht waard
  samenvatting  jsonb,
  constraint accounting_sync_runs_bron_chk check (bron in ('cron', 'handmatig'))
);

comment on table public.accounting_sync_runs is
  'Eén rij per synchronisatie per bedrijf. Voedt "laatste automatische sync" en de Meldingen-tab bij de integratie.';

-- De app vraagt altijd hetzelfde: de laatste run van dit bedrijf voor deze
-- provider. Daar is deze index precies op gesneden.
create index if not exists accounting_sync_runs_laatste_idx
  on public.accounting_sync_runs (company_id, provider, gestart_op desc);

alter table public.accounting_sync_runs enable row level security;

drop policy if exists accounting_sync_runs_select on public.accounting_sync_runs;
create policy accounting_sync_runs_select on public.accounting_sync_runs
  for select using (company_id = current_company_id());

-- Opruimen: er komt één rij per bedrijf per onderdeel per dag bij, dus dit
-- groeit traag (twee koppelingen ≈ 730 rijen per bedrijf per jaar). Bewust geen
-- cron die oude rijen wist: bij dit tempo is dat vooruit optimaliseren. Loopt
-- het ooit vol, dan is een 'delete where gestart_op < now() - interval ''1 jaar'''
-- genoeg.
