-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Het projectoverzicht wordt de plek waar een klus begint: wat de klant wil,
-- waar, wanneer, via welke bron, met foto's. Twee dingen zaten dat in de weg.
--
-- 1. DE AANVRAAGTEKST STOND OP DE DEAL.
--    deals_select eist bb_has_permission('verkoop'). Een medewerker met alleen
--    'projecten' kan die rij dus niet lezen — hij zag een leeg aanvraagblok op
--    een project dat hij verder wél mag openen. De tekst verhuist daarom naar
--    projects.description, waar projects_select hem al doorlaat (bedrijf, plus
--    toegewezen zijn of een werkbon op het project).
--
--    Bewust GEEN uitzondering in deals_select en GEEN security definer-functie
--    die dealkolommen teruggeeft: dan zou de aanvraag van élk project van het
--    bedrijf te lezen zijn, ook voor wie dat project niet mag zien. De tekst
--    verplaatsen is minder machinerie en sluit precies aan op de rechten die er
--    al zijn.
--
--    Gemeten vóór het draaien (productie, 21-09-2026), 172 projecten met deal:
--      39x tekst alleen op de deal      -> wordt gekopieerd naar het project
--      29x tekst alleen op het project  -> blijft staan
--      13x allebei, maar verschillend   -> blijft staan; op het project staat
--                                          daar seed-ruis ("Adres: ..."), op de
--                                          deal de echte aanvraagtekst. Die 13
--                                          krijgen de dealtekst erbóven, met de
--                                          oude regel eronder, zodat er niets
--                                          verdwijnt.
--       0x allebei en gelijk
--    De deal behoudt zijn description: de pipeline en de mobiele app lezen die
--    nog, en er wordt in deze migratie niets verwijderd of hernoemd.
--
-- 2. ER WAS GEEN PLEK VOOR FOTO'S BIJ EEN AANVRAAG.
--    Werkbonnen hebben die wel (werkbon_fotos + bucket werkbon-fotos). Dit is
--    datzelfde patroon, op het project: privébucket, pad
--    <company>/<project>/<uuid>.<ext>, alleen het pad in de tabel, en tonen via
--    een signed URL. De policies zijn één op één gespiegeld, met
--    'projecten_bewerken' waar de werkbonversie 'werkbonnen_bewerken' gebruikt.

begin;

-- ── 1. Aanvraagtekst naar het project ───────────────────────────────────────
-- Alleen waar het project nog niets heeft.
update public.projects p
   set description = d.description,
       updated_at  = now()
  from public.deals d
 where d.id = p.deal_id
   and coalesce(btrim(d.description), '') <> ''
   and coalesce(btrim(p.description), '')  = '';

-- En waar allebei iets staat maar verschillend: de aanvraag bovenaan, het oude
-- projectregeltje eronder. Niets gaat verloren en de lezer ziet eerst waar het
-- om gaat.
update public.projects p
   set description = d.description || E'\n\n' || p.description,
       updated_at  = now()
  from public.deals d
 where d.id = p.deal_id
   and coalesce(btrim(d.description), '') <> ''
   and coalesce(btrim(p.description), '') <> ''
   and btrim(d.description) <> btrim(p.description)
   and position(btrim(d.description) in p.description) = 0;

-- ── 2. Foto's bij een project ───────────────────────────────────────────────
create table if not exists public.project_fotos (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  url        text not null,           -- opslagpad; weergave via signed URL
  categorie  text,
  created_at timestamptz not null default now()
);

comment on table public.project_fotos is
  'Foto''s bij de aanvraag van een project. Zelfde opzet als werkbon_fotos: url is het opslagpad in de privébucket project-fotos, niet een publieke link.';

create index if not exists project_fotos_project_idx on public.project_fotos (project_id, created_at desc);
create index if not exists project_fotos_company_idx on public.project_fotos (company_id);

alter table public.project_fotos enable row level security;

-- Zien: iedereen van het bedrijf, net als bij werkbon_fotos. De tabel draagt
-- geen bedragen; wie het project mag openen hoort de foto's erbij te zien.
drop policy if exists project_fotos_select on public.project_fotos;
create policy project_fotos_select on public.project_fotos
  for select using (company_id = public.current_user_company_id());

-- Toevoegen en verwijderen: wie projecten mag bewerken, of wie aan dit project
-- is toegewezen. Gespiegeld op werkbon_fotos_insert/_delete.
drop policy if exists project_fotos_insert on public.project_fotos;
create policy project_fotos_insert on public.project_fotos
  for insert with check (
    company_id = public.current_user_company_id()
    and exists (
      select 1 from public.projects p
       where p.id = project_fotos.project_id
         and p.company_id = public.current_user_company_id()
         and (public.bb_gedeelde_werkruimte()
              or public.bb_has_permission('projecten_bewerken')
              or p.assigned_to = auth.uid())
    )
  );

drop policy if exists project_fotos_delete on public.project_fotos;
create policy project_fotos_delete on public.project_fotos
  for delete using (
    exists (
      select 1 from public.projects p
       where p.id = project_fotos.project_id
         and p.company_id = public.current_user_company_id()
         and (public.bb_gedeelde_werkruimte()
              or public.bb_has_permission('projecten_bewerken')
              or p.assigned_to = auth.uid())
    )
  );

-- Meekijk-abonnement schrijft niets, net als op elke andere tabel.
drop policy if exists readonly_project_fotos on public.project_fotos;
create policy readonly_project_fotos on public.project_fotos
  for insert with check (public.bb_mag_schrijven());

-- ── 3. De bucket ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-fotos', 'project-fotos', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists "project-fotos company read" on storage.objects;
create policy "project-fotos company read" on storage.objects
  for select using (
    bucket_id = 'project-fotos'
    and (storage.foldername(name))[1] = (public.current_user_company_id())::text
  );

drop policy if exists project_fotos_storage_insert on storage.objects;
create policy project_fotos_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'project-fotos'
    and (storage.foldername(name))[1] = (public.current_user_company_id())::text
    and exists (
      select 1 from public.projects p
       where p.id = ((storage.foldername(objects.name))[2])::uuid
         and p.company_id = public.current_user_company_id()
         and (public.bb_gedeelde_werkruimte()
              or public.bb_has_permission('projecten_bewerken')
              or p.assigned_to = auth.uid())
    )
  );

drop policy if exists project_fotos_storage_delete on storage.objects;
create policy project_fotos_storage_delete on storage.objects
  for delete using (
    bucket_id = 'project-fotos'
    and (storage.foldername(name))[1] = (public.current_user_company_id())::text
    and exists (
      select 1 from public.projects p
       where p.id = ((storage.foldername(objects.name))[2])::uuid
         and p.company_id = public.current_user_company_id()
         and (public.bb_gedeelde_werkruimte()
              or public.bb_has_permission('projecten_bewerken')
              or p.assigned_to = auth.uid())
    )
  );

-- readonly_uploads noemt de buckets waarvoor een meekijk-abonnement niet mag
-- uploaden bij naam. Zonder deze uitbreiding zou project-fotos de enige bucket
-- zijn die daar buiten valt.
drop policy if exists readonly_uploads on storage.objects;
create policy readonly_uploads on storage.objects
  for insert with check (
    bucket_id <> all (array['werkbon-fotos'::text, 'kosten-bijlagen'::text, 'project-fotos'::text])
    or public.bb_mag_schrijven()
  );

-- ── 4. De uitkomst ──────────────────────────────────────────────────────────
-- Alleen de rijen van het laatste statement komen terug via de Management API.
select
  (select count(*) from public.projects p join public.deals d on d.id = p.deal_id
    where coalesce(btrim(d.description),'') <> ''
      and coalesce(btrim(p.description),'')  = '')                      as nog_leeg_moet_0,
  (select count(*) from public.projects
    where coalesce(btrim(description),'') <> '')                        as projecten_met_tekst,
  (select count(*) from public.project_fotos)                           as fotos,
  (select count(*) from storage.buckets where id = 'project-fotos')     as bucket_bestaat;

commit;

notify pgrst, 'reload schema';
