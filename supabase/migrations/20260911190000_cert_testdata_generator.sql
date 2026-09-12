-- Dagelijkse testactiviteit voor de SnelStart-certificering.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- SnelStart kijkt tijdens de certificering ongeveer twaalf dagen mee. De crons
-- draaien al elke nacht, maar als er niets nieuws is gebeurd zien ze alleen
-- lege runs. Deze generator zet elke nacht een handvol boekingen klaar zodat er
-- echt verkeer over de koppeling gaat.
--
-- ── Waar hij NIET komt ──────────────────────────────────────────────────────
-- Uitsluitend in TEST SnelStart BV. Dat is geen filter maar een grens:
--   1. De functie neemt GEEN bedrijf als parameter. Er is dus niets om op een
--      ander bedrijf te richten; het id staat als constante in de code.
--   2. Vóór er iets gebeurt wordt gecontroleerd of dat id ook echt het bedrijf
--      is dat "TEST SnelStart BV" heet. Klopt de naam niet, dan stopt de
--      functie met een exception in plaats van door te gaan.
-- Wordt die testcompany ooit hernoemd of verwijderd, dan doet de generator
-- niets meer. Dat is met opzet: liever stil vallen dan ergens anders schrijven.
--
-- ── Noodrem ─────────────────────────────────────────────────────────────────
-- De cron blijft staan, de generator gaat uit:
--     update public.cert_testdata_instellingen set actief = false;
-- Weer aan:
--     update public.cert_testdata_instellingen set actief = true;
-- Hij staat na deze migratie UIT. Zet hem zelf aan als je de aanvraag indient.
--
-- ── Opruimen na de certificering ────────────────────────────────────────────
-- Alles wat de generator maakt staat in cert_testdata_log. Opruimen in één keer:
--     select public.bb_cert_testdata_opruimen();
-- Dat wist alleen wat híj heeft aangemaakt; bestaande testdata blijft staan.
-- In SnelStart zelf blijven de boekingen staan — die administratie ruim je daar
-- op, of je laat ze staan omdat het een testadministratie is. De facturen zijn
-- daar te herkennen aan het nummer: CERT-JJMMDD-n.
--
-- ── Tijdstip ────────────────────────────────────────────────────────────────
-- 02:30 UTC, dus een half uur vóór snelstart-sync-contacten (03:00) en vijftig
-- minuten vóór snelstart-import-kosten (03:20). Alles wat hier wordt aangemaakt
-- gaat dus dezelfde nacht mee met de bestaande crons. De generator roept die
-- syncs bewust NIET zelf aan: dan zouden de crons erna alsnog leeg draaien, en
-- juist die lege runs waren de aanleiding.
--
-- ── Let op bij het lezen van de code ────────────────────────────────────────
-- De markering mag NIET in externe_referentie. Zowel de facturen- als de
-- kosten-export eisen `externe_referentie is null` (dat veld betekent daar
-- "komt uit SnelStart, moet niet terug"). Vullen we het, dan wordt de testdata
-- juist nooit geëxporteerd. Vandaar de aparte logtabel.

-- ── Instellingen: precies één rij ───────────────────────────────────────────
create table if not exists public.cert_testdata_instellingen (
  -- De check dwingt af dat er maar één rij kan bestaan.
  id                   boolean primary key default true check (id),
  actief               boolean not null default false,
  facturen_per_dag_max smallint not null default 2 check (facturen_per_dag_max between 0 and 5),
  kosten_per_dag_max   smallint not null default 2 check (kosten_per_dag_max between 0 and 5),
  laatste_run          timestamptz
);

insert into public.cert_testdata_instellingen (id) values (true)
on conflict (id) do nothing;

alter table public.cert_testdata_instellingen enable row level security;
-- Geen policies: alleen service_role en de SECURITY DEFINER-functie komen erbij.
revoke all on table public.cert_testdata_instellingen from anon, authenticated;

-- ── Logboek: wat heeft de generator aangemaakt ──────────────────────────────
create table if not exists public.cert_testdata_log (
  id            uuid primary key default gen_random_uuid(),
  soort         text not null check (soort in ('factuur','factuurregel','kostenpost','klant','leverancier')),
  record_id     uuid not null,
  omschrijving  text,
  aangemaakt_op timestamptz not null default now()
);

create index if not exists cert_testdata_log_soort on public.cert_testdata_log (soort, aangemaakt_op);

alter table public.cert_testdata_log enable row level security;
revoke all on table public.cert_testdata_log from anon, authenticated;


-- ── De generator ────────────────────────────────────────────────────────────
create or replace function public.bb_cert_testdata_genereren(p_forceer boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  -- HARDE GRENS. Geen parameter, geen variabele: dit staat vast.
  c_company  constant uuid := '7e57c0de-0000-4000-a000-000000000002';
  c_naam     constant text := 'TEST SnelStart BV';

  v_bedrijf     text;
  v_inst        public.cert_testdata_instellingen%rowtype;
  v_run         uuid;
  v_meldingen   text[] := '{}';
  v_facturen    int := 0;
  v_kosten      int := 0;
  v_klanten     int := 0;
  v_leveranciers int := 0;
  v_credits     int := 0;

  v_klant       uuid;
  v_leverancier uuid;
  v_factuur     uuid;
  v_kostenpost  uuid;
  v_bron        record;
  r             int;
  v_nummer      text;
  v_volgnr      int;
  v_regels      int;
  v_modus       text;
  v_excl        numeric;
  v_incl        numeric;
  v_prijs       numeric;
  v_aantal      numeric;
  v_pct         numeric;
  v_regime      text;
  v_oms         text;
  i             int;
  n             int;

  -- Realistische regels voor een dakdekkersbedrijf.
  c_werk_21 constant text[] := array[
    'Dakgoot vervangen, 12 strekkende meter',
    'EPDM dakbedekking aanbrengen',
    'Zinken kilgoot herstellen',
    'Hemelwaterafvoer vernieuwen',
    'Dakraam plaatsen inclusief gootstuk',
    'Isolatieplaten aanbrengen op plat dak'
  ];
  -- 9% geldt voor arbeid aan woningen ouder dan twee jaar.
  c_werk_9 constant text[] := array[
    'Arbeidsloon dakdekker (woning ouder dan 2 jaar)',
    'Arbeidsloon herstel dakpannen (woning ouder dan 2 jaar)',
    'Arbeidsloon voegwerk schoorsteen (woning ouder dan 2 jaar)'
  ];
  c_werk_verlegd constant text[] := array[
    'Dakwerkzaamheden in onderaanneming',
    'Plaatsen dakbedekking in onderaanneming',
    'Renovatie plat dak in onderaanneming'
  ];
  c_werk_vrij constant text[] := array[
    'Doorbelaste verzekeringspremie opstal',
    'Doorbelaste leges omgevingsvergunning'
  ];
  c_kosten constant text[] := array[
    'Dakpannen en panlatten', 'Bitumen rollen', 'Steigerhuur week',
    'Brandstof bedrijfsbus', 'Accuboormachine', 'Werkkleding en veiligheidsschoenen',
    'Kitspuit en afdichtingsmateriaal', 'Afvoer bouwafval container'
  ];
  c_categorie constant text[] := array['Materiaal','Gereedschap','Reiskosten','Algemene kosten'];

  c_klantnamen constant text[] := array[
    'Van Dijk Vastgoed','Bakker Woningbeheer','De Groot Onderhoud','Jansen Bouw',
    'Vermeulen Verhuur','Smit Projectontwikkeling','Hendriks Beheer','Visser Vastgoed'
  ];
  c_levnamen constant text[] := array[
    'Dakmaterialen Nederland','Bouwstoffen Van Loon','Gereedschapshuis Peters',
    'Steigerverhuur Midden','Isolatiegroothandel Zuid'
  ];
  c_plaatsen constant text[] := array['Alkmaar','Hoorn','Purmerend','Zaandam','Heerhugowaard','Den Helder'];
  c_straten  constant text[] := array['Kerkstraat','Molenweg','Industrieweg','Havenkade','Schoolstraat'];

  kies text;
begin
  -- ── 1. De grens ───────────────────────────────────────────────────────────
  select c.name into v_bedrijf from public.companies c where c.id = c_company;

  if v_bedrijf is null then
    raise exception 'cert-testdata: bedrijf % bestaat niet — generator gestopt', c_company;
  end if;
  if v_bedrijf is distinct from c_naam then
    raise exception 'cert-testdata: bedrijf % heet "%" in plaats van "%" — generator gestopt',
      c_company, v_bedrijf, c_naam;
  end if;

  -- ── 2. De noodrem ─────────────────────────────────────────────────────────
  select * into v_inst from public.cert_testdata_instellingen where id;
  if not found then
    raise exception 'cert-testdata: geen instellingenrij gevonden';
  end if;
  if not v_inst.actief then
    return jsonb_build_object('overgeslagen', true, 'reden', 'generator staat uit');
  end if;

  -- Twee keer op een dag draaien levert dubbel werk op; dat ziet er juist
  -- onnatuurlijk uit. Handmatig forceren kan met p_forceer.
  if not p_forceer and exists (
    select 1 from public.cert_testdata_log
    where aangemaakt_op >= date_trunc('day', now())
  ) then
    return jsonb_build_object('overgeslagen', true, 'reden', 'vandaag al gedraaid');
  end if;

  -- ── 3. Run vastleggen ─────────────────────────────────────────────────────
  -- Deze regel staat BUITEN het blok hieronder, en dat is het hele punt. Een
  -- exception-blok in PL/pgSQL is een subtransactie: gaat er iets mis, dan wordt
  -- alles binnen dat blok teruggedraaid. Stond de run-regel daar ook in, dan
  -- verdween juist het bewijs van de mislukking samen met de mislukking zelf.
  insert into public.accounting_sync_runs (company_id, provider, onderdeel, bron)
  values (c_company, 'snelstart', 'testdata', 'cron')
  returning id into v_run;

  begin

  -- ── 4. Af en toe een nieuwe klant ─────────────────────────────────────────
  if random() < 0.25 then
    kies := c_klantnamen[1 + floor(random() * array_length(c_klantnamen, 1))::int];
    insert into public.customers (company_id, name, email, phone, address, postcode, city)
    values (
      c_company,
      kies || ' ' || to_char(now(), 'DDMM'),
      lower(replace(split_part(kies, ' ', 1), '''', '')) || '@voorbeeld.nl',
      '072' || lpad((100000 + floor(random() * 899999))::text, 6, '0'),
      c_straten[1 + floor(random() * array_length(c_straten, 1))::int] || ' ' || (1 + floor(random() * 120))::text,
      (1500 + floor(random() * 400))::text || ' ' || chr(65 + floor(random()*26)::int) || chr(65 + floor(random()*26)::int),
      c_plaatsen[1 + floor(random() * array_length(c_plaatsen, 1))::int]
    )
    returning id into v_klant;
    insert into public.cert_testdata_log (soort, record_id, omschrijving) values ('klant', v_klant, kies);
    v_klanten := 1;
  end if;

  -- ── 5. Af en toe een nieuwe leverancier ───────────────────────────────────
  if random() < 0.25 then
    kies := c_levnamen[1 + floor(random() * array_length(c_levnamen, 1))::int];
    insert into public.leveranciers (company_id, naam, email, address, postcode, city, actief)
    values (
      c_company,
      kies || ' ' || to_char(now(), 'DDMM'),
      lower(replace(split_part(kies, ' ', 1), '''', '')) || '@voorbeeld.nl',
      c_straten[1 + floor(random() * array_length(c_straten, 1))::int] || ' ' || (1 + floor(random() * 120))::text,
      (1500 + floor(random() * 400))::text || ' ' || chr(65 + floor(random()*26)::int) || chr(65 + floor(random()*26)::int),
      c_plaatsen[1 + floor(random() * array_length(c_plaatsen, 1))::int],
      true
    )
    returning id into v_leverancier;
    insert into public.cert_testdata_log (soort, record_id, omschrijving) values ('leverancier', v_leverancier, kies);
    v_leveranciers := 1;
  end if;

  -- ── 6. Facturen ───────────────────────────────────────────────────────────
  n := 1 + floor(random() * greatest(v_inst.facturen_per_dag_max, 1))::int;
  n := least(n, v_inst.facturen_per_dag_max);

  for i in 1..greatest(n, 0) loop
    -- Een klant met adres; zonder adres klaagt SnelStart over de relatie.
    select c.id into v_klant
    from public.customers c
    where c.company_id = c_company and coalesce(c.address, '') <> ''
    order by random() limit 1;

    if v_klant is null then
      v_meldingen := v_meldingen || 'Geen klant met adres gevonden; factuur overgeslagen.';
      exit;
    end if;

    select coalesce(max(substring(f.nummer from 'CERT-\d{6}-(\d+)')::int), 0) + 1
      into v_volgnr
    from public.facturen f
    where f.company_id = c_company and f.nummer like 'CERT-' || to_char(now(), 'YYMMDD') || '-%';

    v_nummer := 'CERT-' || to_char(now(), 'YYMMDD') || '-' || v_volgnr::text;

    -- Regime per FACTUUR, niet per regel. Verlegd en vrijgesteld mogen niet
    -- gemengd worden met belaste regels: SnelStart weigert dat met BOE-0062.
    v_modus := case
      when random() < 0.10 then 'verlegd'
      when random() < 0.18 then 'vrijgesteld'
      when random() < 0.55 then 'gemengd'
      else 'normaal'
    end;

    insert into public.facturen (
      company_id, customer_id, nummer, factuurdatum, vervaldatum,
      status, betaaltermijn_dagen, totaal_excl, totaal_incl
    ) values (
      c_company, v_klant, v_nummer, current_date, current_date + 14,
      'verzonden', 14, 0, 0
    ) returning id into v_factuur;

    v_excl := 0;
    v_incl := 0;
    v_regels := 1 + floor(random() * 3)::int;

    for r in 1..v_regels loop
      if v_modus = 'verlegd' then
        v_regime := 'verlegd'; v_pct := 0;
        v_oms := c_werk_verlegd[1 + floor(random() * array_length(c_werk_verlegd, 1))::int];
      elsif v_modus = 'vrijgesteld' then
        v_regime := 'vrijgesteld'; v_pct := 0;
        v_oms := c_werk_vrij[1 + floor(random() * array_length(c_werk_vrij, 1))::int];
      elsif v_modus = 'gemengd' and r = 2 then
        v_regime := 'verlaagd'; v_pct := 9;
        v_oms := c_werk_9[1 + floor(random() * array_length(c_werk_9, 1))::int];
      else
        v_regime := 'normaal'; v_pct := 21;
        v_oms := c_werk_21[1 + floor(random() * array_length(c_werk_21, 1))::int];
      end if;

      v_aantal := case when v_regime = 'verlaagd' then (2 + floor(random() * 14)) else 1 end;
      v_prijs  := case
        when v_regime = 'verlaagd' then 42.50 + floor(random() * 20)
        else round((180 + random() * 2400)::numeric, 2)
      end;

      insert into public.factuur_regels (
        factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs,
        btw_pct, btw_regime, regelprijs, volgorde
      ) values (
        v_factuur, c_company, 'werk', v_oms, v_aantal, v_prijs,
        v_pct, v_regime, round(v_aantal * v_prijs, 2), r
      );

      v_excl := v_excl + round(v_aantal * v_prijs, 2);
      v_incl := v_incl + round(v_aantal * v_prijs * (1 + v_pct / 100), 2);
    end loop;

    update public.facturen
       set totaal_excl = v_excl, totaal_incl = v_incl
     where id = v_factuur;

    insert into public.cert_testdata_log (soort, record_id, omschrijving)
    values ('factuur', v_factuur, v_nummer || ' (' || v_modus || ', ' || v_excl::text || ' excl)');
    v_facturen := v_facturen + 1;
  end loop;

  -- ── 7. Kostenposten ───────────────────────────────────────────────────────
  n := 1 + floor(random() * greatest(v_inst.kosten_per_dag_max, 1))::int;
  n := least(n, v_inst.kosten_per_dag_max);

  for i in 1..greatest(n, 0) loop
    -- Een kostenpost ZONDER leverancier wordt niet geëxporteerd, dus dat is
    -- een harde voorwaarde en geen nice-to-have.
    select l.id into v_leverancier
    from public.leveranciers l
    where l.company_id = c_company and coalesce(l.actief, true)
    order by random() limit 1;

    if v_leverancier is null then
      v_meldingen := v_meldingen || 'Geen leverancier gevonden; kostenpost overgeslagen.';
      exit;
    end if;

    v_pct := case when random() < 0.2 then 9 else 21 end;
    v_oms := c_kosten[1 + floor(random() * array_length(c_kosten, 1))::int];

    insert into public.job_costs (
      company_id, description, amount, category, cost_date,
      leverancier_id, btw_percentage, btw_inclusief
    ) values (
      c_company, v_oms, round((35 + random() * 900)::numeric, 2),
      c_categorie[1 + floor(random() * array_length(c_categorie, 1))::int],
      current_date, v_leverancier, v_pct, false
    ) returning id into v_kostenpost;

    insert into public.cert_testdata_log (soort, record_id, omschrijving)
    values ('kostenpost', v_kostenpost, v_oms);
    v_kosten := v_kosten + 1;
  end loop;

  -- ── 8. Af en toe een creditfactuur ────────────────────────────────────────
  -- Alleen op een eerdere CERT-factuur die nog niet gecrediteerd is. Een
  -- creditering is bij ons een factuur met negatieve bedragen (SnelStart kent
  -- geen creditnota-type), zie de import in snelstart-import-kosten.
  if random() < 0.20 then
    select f.id, f.nummer, f.customer_id, f.totaal_excl
      into v_bron
    from public.facturen f
    where f.company_id = c_company
      and f.nummer like 'CERT-%'
      and not coalesce(f.is_credit, false)
      and not coalesce(f.gecrediteerd, false)
      and f.totaal_excl > 0
      and f.factuurdatum < current_date
    order by random() limit 1;

    if found then
      v_volgnr := (select coalesce(max(substring(f.nummer from 'CERTC-(\d+)')::int), 0) + 1
                   from public.facturen f
                   where f.company_id = c_company and f.nummer like 'CERTC-%');
      v_nummer := 'CERTC-' || v_volgnr::text;
      v_prijs  := -1 * round(v_bron.totaal_excl * 0.25, 2);   -- deelcreditering

      insert into public.facturen (
        company_id, customer_id, nummer, factuurdatum, vervaldatum, status,
        betaaltermijn_dagen, totaal_excl, totaal_incl, is_credit, credit_van_factuur_id
      ) values (
        c_company, v_bron.customer_id, v_nummer, current_date, current_date + 14, 'verzonden',
        14, v_prijs, round(v_prijs * 1.21, 2), true, v_bron.id
      ) returning id into v_factuur;

      insert into public.factuur_regels (
        factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs,
        btw_pct, btw_regime, regelprijs, volgorde
      ) values (
        v_factuur, c_company, 'werk', 'Creditering ' || v_bron.nummer, 1, v_prijs,
        21, 'normaal', v_prijs, 1
      );

      update public.facturen set gecrediteerd = true where id = v_bron.id;

      insert into public.cert_testdata_log (soort, record_id, omschrijving)
      values ('factuur', v_factuur, v_nummer || ' (credit op ' || v_bron.nummer || ')');
      v_credits := 1;
    end if;
  end if;

  -- ── 9. Afronden ───────────────────────────────────────────────────────────
  update public.cert_testdata_instellingen set laatste_run = now() where id;

  update public.accounting_sync_runs
     set klaar_op = now(),
         gelukt = true,
         -- meldingen is jsonb, niet text[] — vandaar de omzetting.
         meldingen = to_jsonb(v_meldingen),
         samenvatting = jsonb_build_object(
           'facturen', v_facturen, 'creditfacturen', v_credits,
           'kostenposten', v_kosten, 'klanten', v_klanten, 'leveranciers', v_leveranciers)
   where id = v_run;

  return jsonb_build_object(
    'facturen', v_facturen, 'creditfacturen', v_credits, 'kostenposten', v_kosten,
    'klanten', v_klanten, 'leveranciers', v_leveranciers, 'meldingen', v_meldingen);

  exception when others then
    -- Alles wat het blok had aangemaakt is nu teruggedraaid; de run-regel niet.
    -- Bewust NIET opnieuw opgooien: dan zou de cron de hele transactie afbreken
    -- en was ook deze update weg. Een mislukte nacht hoort zichtbaar te zijn.
    update public.accounting_sync_runs
       set klaar_op = now(), gelukt = false, fout = sqlerrm
     where id = v_run;
    return jsonb_build_object('gelukt', false, 'fout', sqlerrm);
  end;
end;
$fn$;

revoke all on function public.bb_cert_testdata_genereren(boolean) from public, anon, authenticated;
grant execute on function public.bb_cert_testdata_genereren(boolean) to service_role;


-- ── Opruimen ────────────────────────────────────────────────────────────────
-- Wist precies wat de generator heeft aangemaakt, in de juiste volgorde.
create or replace function public.bb_cert_testdata_opruimen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c_company constant uuid := '7e57c0de-0000-4000-a000-000000000002';
  c_naam    constant text := 'TEST SnelStart BV';
  v_bedrijf text;
  v_f int; v_k int; v_c int; v_l int;
begin
  select c.name into v_bedrijf from public.companies c where c.id = c_company;
  if v_bedrijf is distinct from c_naam then
    raise exception 'cert-testdata opruimen: bedrijf heet "%" in plaats van "%" — gestopt', v_bedrijf, c_naam;
  end if;

  -- Regels verdwijnen met de factuur mee (FK cascade), dus alleen de facturen.
  with weg as (
    delete from public.facturen f
    using public.cert_testdata_log l
    where l.soort = 'factuur' and l.record_id = f.id and f.company_id = c_company
    returning f.id
  ) select count(*) into v_f from weg;

  with weg as (
    delete from public.job_costs j
    using public.cert_testdata_log l
    where l.soort = 'kostenpost' and l.record_id = j.id and j.company_id = c_company
    returning j.id
  ) select count(*) into v_k from weg;

  with weg as (
    delete from public.customers c
    using public.cert_testdata_log l
    where l.soort = 'klant' and l.record_id = c.id and c.company_id = c_company
    returning c.id
  ) select count(*) into v_c from weg;

  with weg as (
    delete from public.leveranciers lv
    using public.cert_testdata_log l
    where l.soort = 'leverancier' and l.record_id = lv.id and lv.company_id = c_company
    returning lv.id
  ) select count(*) into v_l from weg;

  delete from public.cert_testdata_log;

  return jsonb_build_object('facturen', v_f, 'kostenposten', v_k, 'klanten', v_c, 'leveranciers', v_l);
end;
$fn$;

revoke all on function public.bb_cert_testdata_opruimen() from public, anon, authenticated;
grant execute on function public.bb_cert_testdata_opruimen() to service_role;


-- ── Cron: 02:30 UTC, vóór de twee sync-crons ────────────────────────────────
create extension if not exists pg_cron;

select cron.unschedule('snelstart-cert-testdata')
where exists (select 1 from cron.job where jobname = 'snelstart-cert-testdata');

select cron.schedule(
  'snelstart-cert-testdata',
  '30 2 * * *',
  $cron$ select public.bb_cert_testdata_genereren(); $cron$
);

notify pgrst, 'reload schema';
