-- Grootboekrekening per kostencategorie en omzetsoort, instelbaar per bedrijf.
--
-- Laag 1 (grootboekKeuze.ts) kiest op voorkeursnummer uit het standaard
-- SnelStart-rekeningschema. Dat dekt de meeste administraties, maar niet alle:
-- een dakdekker boekt materiaal ergens anders dan een webshop, en wie zijn
-- schema heeft aangepast heeft die nummers misschien niet eens.
--
-- Deze tabel is laag 2: een expliciete keuze die vóór de voorkeursnummers gaat.
-- Staat er niets in, dan gebeurt er niets anders dan voorheen.
--
-- Sleutel is 'kosten:<categorie>' of 'omzet:<regime>'. Bewust tekst en geen
-- enum: de categorieënlijst leeft in de applicatie (kostenCategorieen.js) en
-- moet niet vastgeklonken zitten in een databasetype dat bij elke wijziging een
-- migratie vraagt.
--
-- grootboek_id en omschrijving staan erbij als momentopname voor de UI, maar het
-- NUMMER is leidend bij het boeken: id's zijn per administratie uniek en zouden
-- na een herstel of overzetting niet meer kloppen.

create table if not exists public.grootboek_voorkeuren (
  company_id       uuid    not null references public.companies(id) on delete cascade,
  provider         text    not null default 'snelstart',
  sleutel          text    not null,
  grootboek_nummer integer not null,
  grootboek_id     text,
  omschrijving     text,
  updated_at       timestamptz not null default now(),
  primary key (company_id, provider, sleutel)
);

comment on table public.grootboek_voorkeuren is
  'Door de klant gekozen grootboekrekening per kostencategorie/omzetsoort. Gaat vóór de standaard voorkeursnummers in grootboekKeuze.ts.';
comment on column public.grootboek_voorkeuren.grootboek_nummer is
  'Leidend bij het boeken. grootboek_id en omschrijving zijn momentopnames voor de weergave.';

alter table public.grootboek_voorkeuren enable row level security;

-- Lezen mag iedereen binnen het bedrijf: de sync draait met de service-role,
-- maar het instellingenscherm leest als gewone gebruiker.
drop policy if exists grootboek_voorkeuren_select on public.grootboek_voorkeuren;
create policy grootboek_voorkeuren_select on public.grootboek_voorkeuren
  for select using (company_id = current_company_id());

-- Wijzigen alleen door admins: dit raakt hoe de hele boekhouding wordt ingedeeld.
-- Bewust niet via bb_has_permission(): die geeft rol 'planner' automatisch elk
-- recht, en een planner hoort geen grootboekindeling te veranderen.
drop policy if exists grootboek_voorkeuren_insert on public.grootboek_voorkeuren;
create policy grootboek_voorkeuren_insert on public.grootboek_voorkeuren
  for insert with check (
    company_id = current_company_id()
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );

drop policy if exists grootboek_voorkeuren_update on public.grootboek_voorkeuren;
create policy grootboek_voorkeuren_update on public.grootboek_voorkeuren
  for update using (
    company_id = current_company_id()
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );

drop policy if exists grootboek_voorkeuren_delete on public.grootboek_voorkeuren;
create policy grootboek_voorkeuren_delete on public.grootboek_voorkeuren
  for delete using (
    company_id = current_company_id()
    and coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
  );
