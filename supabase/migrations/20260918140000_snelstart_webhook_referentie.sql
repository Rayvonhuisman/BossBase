-- SnelStart-webhook: een eigen referentiesleutel per bedrijf, en een log.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Bij een productiekoppeling sturen wij de klant naar SnelStart met een
-- `referenceKey`. SnelStart POST daarna de koppelsleutel naar onze webhook, met
-- diezelfde ReferenceKey erbij. Aan die waarde hangt dus de vraag bij wélk
-- bedrijf de sleutel hoort.
--
-- Tot nu toe was dat het company_id. Dat is geen geheim: het staat in URL's,
-- storage-paden en de sessie van elke medewerker. Wie een company_id van een
-- ander bedrijf kent, kan de activatielink zelf bouwen, bij SnelStart inloggen
-- met zijn EIGEN administratie en bevestigen. De webhook zet dan zijn sleutel
-- bij het andere bedrijf, en vanaf dat moment boeken wij de facturen van dat
-- bedrijf in de administratie van de aanvaller. Een Regenerate doet hetzelfde
-- met een bestaande koppeling.
--
-- Nu: per bedrijf een willekeurige referentiesleutel (192 bits), die alleen een
-- admin van dat bedrijf via een RPC opvraagt. De webhook accepteert uitsluitend
-- sleutels uit deze tabel. Hij blijft per bedrijf gelijk, want SnelStart stuurt
-- bij Regenerate en Delete dezelfde ReferenceKey mee als bij Create: roteren
-- zou een lopende koppeling onbereikbaar maken.
--
-- Het log: SnelStart doet bij een niet-2xx GEEN nieuwe poging. Een webhook die
-- faalt en alleen in de functielogs spoor achterlaat, is een klant die denkt dat
-- hij gekoppeld is en het niet is. mail_fouten is er voor post en zegt "is er een
-- mail blijven liggen"; dit is iets anders en krijgt daarom een eigen tabel. Hier
-- komt elke aanroep in, ook de geslaagde — het zijn er een handvol per klant per
-- jaar, en "wanneer is deze koppeling aangemaakt" is een vraag die terugkomt.
-- De koppelsleutel zelf komt er NOOIT in.
--
-- Raakt geen bestaande data. De activatieflow staat nog uit (geen AppShortName),
-- dus er zijn geen lopende koppelingen die op company_id als ReferenceKey
-- vertrouwen.


-- ── Referentiesleutels ──────────────────────────────────────────────────────
create table if not exists public.snelstart_referenties (
  company_id    uuid primary key references public.companies(id) on delete cascade,
  reference_key text not null unique,
  aangemaakt_op timestamptz not null default now()
);

-- RLS aan en géén policy: alleen de service-role (webhook) en de RPC hieronder
-- komen erbij.
alter table public.snelstart_referenties enable row level security;
revoke all on table public.snelstart_referenties from anon, authenticated;


-- Geeft de referentiesleutel van het bedrijf van de aanroeper, en maakt hem aan
-- als hij er nog niet is. Alleen voor admins: dit is de sleutel waarmee iemand
-- een SnelStart-administratie aan dit bedrijf hangt.
create or replace function public.snelstart_referentie()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company uuid;
  v_role    text;
  v_key     text;
begin
  select p.company_id, p.role into v_company, v_role
  from public.profiles p where p.id = auth.uid();

  if v_company is null then
    raise exception 'Geen bedrijf gevonden';
  end if;
  if v_role is distinct from 'admin' then
    raise exception 'Alleen admins kunnen koppelingen beheren';
  end if;

  insert into public.snelstart_referenties (company_id, reference_key)
  values (v_company, 'bb_' || encode(gen_random_bytes(24), 'hex'))
  on conflict (company_id) do nothing;

  select r.reference_key into v_key
  from public.snelstart_referenties r where r.company_id = v_company;
  return v_key;
end;
$$;

revoke all on function public.snelstart_referentie() from public, anon, authenticated;
grant execute on function public.snelstart_referentie() to authenticated;


-- ── Webhooklog ──────────────────────────────────────────────────────────────
create table if not exists public.snelstart_webhook_log (
  id            uuid primary key default gen_random_uuid(),
  ontvangen_op  timestamptz not null default now(),
  -- Zoals SnelStart hem stuurde: 'Create', 'Regenerate', 'Delete', of wat er
  -- ook binnenkwam (afgekapt) als het geen van die drie was.
  actie         text,
  company_id    uuid references public.companies(id) on delete set null,
  -- Momentopname, zodat de regel leesbaar blijft als het bedrijf vertrekt.
  bedrijf_naam  text,
  -- 'verwerkt' = 2xx teruggegeven; 'geweigerd' = ongeldig verzoek (4xx);
  -- 'fout' = aan onze kant misgegaan (5xx). Alleen de laatste twee vragen actie.
  uitkomst      text not null check (uitkomst in ('verwerkt', 'geweigerd', 'fout')),
  http_status   int not null,
  melding       text
);

create index if not exists idx_snelstart_webhook_log_op on public.snelstart_webhook_log (ontvangen_op desc);

alter table public.snelstart_webhook_log enable row level security;

-- Zelfde opzet als mail_fouten: BossBase zelf leest, alleen de service-role
-- schrijft.
drop policy if exists snelstart_webhook_log_super_admin on public.snelstart_webhook_log;
create policy snelstart_webhook_log_super_admin on public.snelstart_webhook_log
  for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin));

revoke all on table public.snelstart_webhook_log from anon;
revoke insert, update, delete, truncate on table public.snelstart_webhook_log from authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- snelstart_referenties snelstart_webhook_log
notify pgrst, 'reload schema';
