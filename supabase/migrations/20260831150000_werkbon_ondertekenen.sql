-- Werkbon ondertekenen bij afronden.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een afgeronde klus was tot nu toe alleen een status in BossBase. De klant
-- tekende niets, dus bij een discussie achteraf ("dat werk is nooit gedaan",
-- "dat materiaal heb ik niet besteld") is er geen bewijs. Deze migratie maakt
-- van de werkbon een document dat de klant ter plekke of per mail ondertekent,
-- met exact hetzelfde mechanisme als de offerte: een sign_token in de URL en
-- SECURITY DEFINER-functies die precies de velden teruggeven die de klant mag
-- zien — en geen enkele meer.
--
-- Wat de klant NIET te zien krijgt, ook niet via deze functies:
--   * inkoopprijzen (werkbon_materiaal_inkoop) — die staan al achter
--     bb_mag_inkoopprijs_zien() en komen hier in geen enkele returns-lijst voor;
--   * verkoopprijzen (werkbon_materialen.prijs_per, .subtotaal) en meerwerk-
--     bedragen — een werkbon is geen factuur; bedragen horen op de factuur;
--   * de interne briefing (werkbonnen.notes), de oude tekstkolom
--     (werkbonnen.werkbon_notities) en elke logregel die niet expliciet als
--     klantnotitie is gemarkeerd;
--   * de naam van de medewerker per urenregel — dat is loonadministratie. Wie er
--     namens het bedrijf voor het werk staat komt uit een eigen functie
--     (get_werkbon_uitvoerders_by_sign_token) en is een ander gegeven;
--   * taken die niet zijn afgevinkt. De klant tekent voor het uitgevoerde werk.
--
-- Ondertekend = op slot. Uren, taken en materiaal kunnen daarna niet meer
-- wijzigen; een correctie is een nieuwe werkbon. Dat wordt met een trigger
-- afgedwongen en niet alleen in de UI, want de UI is niet de bewaker.
--
-- Genummerd als de offertes: WB-001, doorlopend per bedrijf, geen jaartal. Het
-- nummer komt uit een trigger en niet uit de frontend, zodat élke werkbon er
-- een krijgt — ook die uit de planning of de agenda.


-- ── 1. Kolommen op werkbonnen ───────────────────────────────────────────────

alter table public.werkbonnen
  add column if not exists nummer                  text,
  add column if not exists sign_token              uuid not null default gen_random_uuid(),
  add column if not exists ondertekend_op          timestamptz,
  add column if not exists handtekening_url        text,
  add column if not exists ondertekend_door_naam   text,
  add column if not exists ondertekend_door_email  text,
  add column if not exists ondertekende_pdf_url    text,
  add column if not exists verstuurd_naar_email    text,
  add column if not exists verstuurd_op            timestamptz;

comment on column public.werkbonnen.nummer is
  'WB-001, doorlopend per bedrijf. Gezet door bb_werkbon_nummer_trigger.';
comment on column public.werkbonnen.sign_token is
  'Publieke ondertekenlink: /werkbon/<sign_token>. Zelfde patroon als offertes.sign_token.';
comment on column public.werkbonnen.verstuurd_naar_email is
  'Adres waar de ondertekenlink heen is gestuurd (terugvalroute als de klant niet ter plekke tekent).';


-- ── 2. Nummers voor bestaande werkbonnen ────────────────────────────────────
-- Op volgorde van aanmaak, per bedrijf. Gemeten vóór het draaien: 3 bedrijven,
-- samen 11 werkbonnen, allemaal zonder nummer.

with genummerd as (
  select id, 'WB-' || lpad(row_number() over (partition by company_id order by created_at, id)::text, 3, '0') as nr
  from public.werkbonnen
  where nummer is null
)
update public.werkbonnen w
set    nummer = g.nr
from   genummerd g
where  w.id = g.id;

create unique index if not exists werkbonnen_company_nummer_uniq
  on public.werkbonnen (company_id, nummer);

create unique index if not exists werkbonnen_sign_token_uniq
  on public.werkbonnen (sign_token);


-- ── 3. Nummer-trigger voor nieuwe werkbonnen ────────────────────────────────
-- In de database en niet in de servicelaag: een werkbon wordt op vier plekken
-- aangemaakt (werkbonnenpagina, planning, agenda, vanuit een offerte) en een
-- werkbon zonder nummer levert een PDF zonder kenmerk op.

create or replace function public.bb_werkbon_nummer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_volgend int;
begin
  if new.nummer is not null and new.nummer <> '' then
    return new;
  end if;
  select coalesce(max((substring(nummer from '^WB-(\d+)$'))::int), 0) + 1
    into v_volgend
    from public.werkbonnen
   where company_id = new.company_id
     and nummer ~ '^WB-\d+$';
  new.nummer := 'WB-' || lpad(v_volgend::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists bb_werkbon_nummer_trigger on public.werkbonnen;
create trigger bb_werkbon_nummer_trigger
  before insert on public.werkbonnen
  for each row execute function public.bb_werkbon_nummer();


-- ── 4. Klantnotities ────────────────────────────────────────────────────────
-- Het notitielog krijgt één vlagje. Standaard false: alles wat er nu staat is
-- geschreven als interne notitie en moet dat blijven. De interne briefing
-- (werkbonnen.notes) en de oude tekstkolom (werkbonnen.werkbon_notities)
-- blijven ongemoeid.

alter table public.werkbon_notities
  add column if not exists voor_klant boolean not null default false;

comment on column public.werkbon_notities.voor_klant is
  'true = deze regel staat op de werkbon-PDF en op de ondertekenpagina.';


-- ── 5. Ondertekend = op slot ────────────────────────────────────────────────
-- Uren, taken en materiaal liggen vast zodra er getekend is. Meerwerk en
-- foto''s blijven bewust open: die staan niet als afgesproken werk op de bon.

create or replace function public.bb_werkbon_op_slot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_werkbon_id    uuid;
  v_ondertekend   timestamptz;
begin
  if tg_op = 'DELETE' then v_werkbon_id := old.werkbon_id;
  else                     v_werkbon_id := new.werkbon_id;
  end if;

  select ondertekend_op into v_ondertekend
    from public.werkbonnen where id = v_werkbon_id;

  if v_ondertekend is not null then
    raise exception
      'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
      to_char(v_ondertekend, 'DD-MM-YYYY')
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists bb_werkbon_uren_op_slot       on public.werkbon_uren;
drop trigger if exists bb_werkbon_taken_op_slot      on public.werkbon_taken;
drop trigger if exists bb_werkbon_materialen_op_slot on public.werkbon_materialen;

create trigger bb_werkbon_uren_op_slot
  before insert or update or delete on public.werkbon_uren
  for each row execute function public.bb_werkbon_op_slot();

create trigger bb_werkbon_taken_op_slot
  before insert or update or delete on public.werkbon_taken
  for each row execute function public.bb_werkbon_op_slot();

create trigger bb_werkbon_materialen_op_slot
  before insert or update or delete on public.werkbon_materialen
  for each row execute function public.bb_werkbon_op_slot();


-- ── 6. Opslag voor de ondertekende PDF ──────────────────────────────────────
-- Privé, net als signed-offertes en signatures. De link die we opslaan is een
-- signed URL met lange geldigheid; er is dus geen leespolicy nodig en de bon is
-- niet zonder token op te vragen.

insert into storage.buckets (id, name, public)
values ('signed-werkbonnen', 'signed-werkbonnen', false)
on conflict (id) do nothing;


-- ── 7. Publieke leesfuncties op het sign_token ──────────────────────────────
-- SECURITY DEFINER en dus buiten RLS om: de returns-lijst ÍS de afscherming.
-- Elke kolom die hier niet staat, kan de ondertekenpagina niet opvragen.
-- Voeg hier nooit een prijs- of notes-kolom aan toe.

create or replace function public.get_werkbon_by_sign_token(p_token uuid)
returns table(
  id uuid, company_id uuid, customer_id uuid, nummer text, titel text,
  omschrijving text, locatie text, gepland_op date, gestart_op timestamptz,
  afgerond_op timestamptz, status text, ondertekend_op timestamptz,
  ondertekend_door_naam text, verstuurd_naar_email text
)
language sql
security definer
set search_path to 'public'
as $$
  select w.id, w.company_id, w.customer_id, w.nummer, w.titel,
         w.omschrijving, w.locatie, w.gepland_op, w.gestart_op,
         w.afgerond_op, w.status, w.ondertekend_op,
         w.ondertekend_door_naam, w.verstuurd_naar_email
  from public.werkbonnen w
  where w.sign_token = p_token;
$$;

-- Uitsluitend de afgevinkte taken. De klant tekent voor het uitgevoerde werk;
-- een lijst met wat er nog openstaat maakt van het aftekenen een onderhandeling.
-- Openstaande punten blijven in de app op de werkbon staan.
create or replace function public.get_werkbon_taken_by_sign_token(p_token uuid)
returns table(omschrijving text, afgerond boolean, volgorde integer)
language sql
security definer
set search_path to 'public'
as $$
  select t.omschrijving, t.afgerond, t.volgorde
  from public.werkbon_taken t
  join public.werkbonnen w on w.id = t.werkbon_id
  where w.sign_token = p_token
    and t.afgerond = true
  order by t.volgorde, t.created_at;
$$;

-- Naam, aantal en eenheid. Geen prijs_per, geen subtotaal, geen inkoopprijs.
create or replace function public.get_werkbon_materialen_by_sign_token(p_token uuid)
returns table(naam text, eenheid text, aantal numeric)
language sql
security definer
set search_path to 'public'
as $$
  select m.naam, m.eenheid, m.aantal
  from public.werkbon_materialen m
  join public.werkbonnen w on w.id = m.werkbon_id
  where w.sign_token = p_token
  order by m.created_at;
$$;

-- Gewerkte tijd, geen tarieven en geen namen. Wie het werk deed is
-- loonadministratie; de klant ziet wanneer er gewerkt is en hoe lang. De
-- opmerking gaat wél mee: die verklaart een uitloop.
create or replace function public.get_werkbon_uren_by_sign_token(p_token uuid)
returns table(
  datum date, start_tijd time without time zone,
  eind_tijd time without time zone, pauze_minuten integer, uren numeric,
  notitie text
)
language sql
security definer
set search_path to 'public'
as $$
  select u.datum, u.start_tijd, u.eind_tijd, u.pauze_minuten, u.uren, u.notitie
  from public.werkbon_uren u
  join public.werkbonnen w on w.id = u.werkbon_id
  where w.sign_token = p_token
  order by u.datum, u.start_tijd nulls last;
$$;

-- Wie er namens het bedrijf voor het werk staat: de uitvoerder(s) en de
-- verantwoordelijke van de werkbon. Dit is bewust een ander gegeven dan wie de
-- uren boekte — die namen komen hierboven niet meer mee.
create or replace function public.get_werkbon_uitvoerders_by_sign_token(p_token uuid)
returns table(naam text, verantwoordelijk boolean)
language sql
security definer
set search_path to 'public'
as $$
  select p.full_name, (p.id = any(w.verantwoordelijke_ids))
  from public.werkbonnen w
  join public.profiles p
    on p.id = any(w.assigned_to_ids) or p.id = any(w.verantwoordelijke_ids)
  where w.sign_token = p_token
    and coalesce(p.full_name, '') <> ''
  order by (p.id = any(w.verantwoordelijke_ids)) desc, p.full_name;
$$;

-- Uitsluitend regels die expliciet als klantnotitie zijn gemarkeerd.
create or replace function public.get_werkbon_notities_by_sign_token(p_token uuid)
returns table(note text, created_at timestamptz)
language sql
security definer
set search_path to 'public'
as $$
  select n.note, n.created_at
  from public.werkbon_notities n
  join public.werkbonnen w on w.id = n.werkbon_id
  where w.sign_token = p_token
    and n.voor_klant = true
  order by n.created_at;
$$;

-- Opslagpaden. De ondertekenpagina wisselt ze bij de edge function om voor
-- kortlopende signed URLs; de bucket blijft privé.
create or replace function public.get_werkbon_fotos_by_sign_token(p_token uuid)
returns table(pad text, categorie text)
language sql
security definer
set search_path to 'public'
as $$
  select f.url, f.categorie
  from public.werkbon_fotos f
  join public.werkbonnen w on w.id = f.werkbon_id
  where w.sign_token = p_token
  order by f.created_at;
$$;

create or replace function public.get_company_by_werkbon_token(p_token uuid)
returns table(
  name text, logo_url text, email text, phone text, address text,
  postal_code text, city text, kvk text, btw_number text, branding_color text
)
language sql
security definer
set search_path to 'public'
as $$
  select c.name, c.logo_url, c.email, c.phone, c.address,
         c.postal_code, c.city, c.kvk, c.btw_number, c.branding_color
  from public.companies c
  join public.werkbonnen w on w.company_id = c.id
  where w.sign_token = p_token;
$$;

create or replace function public.get_customer_by_werkbon_token(p_token uuid)
returns table(name text, email text, phone text, address text, postcode text, city text)
language sql
security definer
set search_path to 'public'
as $$
  select cu.name, cu.email, cu.phone, cu.address, cu.postcode, cu.city
  from public.customers cu
  join public.werkbonnen w on w.customer_id = cu.id
  where w.sign_token = p_token;
$$;

-- Expliciet toekennen: de ondertekenpagina draait zonder sessie (anon).
do $$
declare fn text;
begin
  foreach fn in array array[
    'get_werkbon_by_sign_token',
    'get_werkbon_taken_by_sign_token',
    'get_werkbon_materialen_by_sign_token',
    'get_werkbon_uren_by_sign_token',
    'get_werkbon_uitvoerders_by_sign_token',
    'get_werkbon_notities_by_sign_token',
    'get_werkbon_fotos_by_sign_token',
    'get_company_by_werkbon_token',
    'get_customer_by_werkbon_token'
  ] loop
    execute format('revoke all on function public.%I(uuid) from public', fn);
    execute format('grant execute on function public.%I(uuid) to anon, authenticated, service_role', fn);
  end loop;
end $$;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Vaste afsluiting van elke migratie; zie CLAUDE.md, "Database en migraties".
-- Hier extra van belang: deze migratie eindigt op GRANT/REVOKE, en juist die
-- commando's staan niet in de lijst waar pgrst_ddl_watch op luistert.
notify pgrst, 'reload schema';
