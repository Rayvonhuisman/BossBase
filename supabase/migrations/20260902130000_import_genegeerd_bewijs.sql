-- De prullenbak van de boekhoudimport afdwingbaar maken.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- import_genegeerd bepaalt wat een sync NIET meer importeert. De INSERT-policy
-- eiste alleen dat de rij bij je eigen bedrijf hoort. Gemeten met een echte
-- API-call: een medewerker kon daarmee zélf een externe_id toevoegen en zo de
-- import van een factuur of kostenpost stilleggen die er nog gewoon is. Geen
-- datalek, wél een manier om stilletjes boekingen te laten verdwijnen.
--
-- ── Waarom geen "mocht je dit record verwijderen?"-controle ──────────────────
-- Dat kan niet betrouwbaar. Op het moment dat de servicelaag hier schrijft is
-- het record al weg; er valt niets meer te toetsen en de enige informatie die
-- rest is de bewering van de aanroeper zelf.
--
-- Wat wél te toetsen valt is de toestand die ná een echte verwijdering hoort te
-- gelden: het record met dat externe_id bestaat niet (meer) bij dit bedrijf.
-- Precies dát kan een aanvaller niet fabriceren voor iets wat er nog wél staat —
-- en dat is het misbruik dat we willen tegenhouden.
--
-- Restrisico dat blijft: iemand kan een externe_id opgeven dat bij ons helemaal
-- niet voorkomt. Dat onderscheid is met de beschikbare gegevens niet te maken,
-- en de schade is klein: een import die nooit bestond wordt overgeslagen.
--
-- Gemeten vóór het draaien: 2 rijen, allebei provider 'snelstart', soort 'klant'.
-- De controle hieronder draait alleen op nieuwe rijen; bestaande blijven staan.

create or replace function public.bb_import_genegeerd_bewijs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bestaat boolean;
begin
  -- 1. Alleen voor het eigen bedrijf. De policy zegt dit ook, maar een trigger
  --    die security definer draait moet niet op een policy vertrouwen.
  if new.company_id is distinct from current_company_id() then
    raise exception 'Prullenbakregel hoort niet bij je eigen bedrijf'
      using errcode = 'check_violation';
  end if;

  -- 2. Vaste woordenlijst: een onbekende soort wordt door getGenegeerd() nooit
  --    teruggelezen en zou dus een stille no-op zijn.
  if new.provider is null or new.provider not in ('snelstart', 'moneybird', 'afas') then
    raise exception 'Onbekende provider voor de prullenbak: %', new.provider
      using errcode = 'check_violation';
  end if;
  if new.soort is null or new.soort not in ('klant', 'leverancier', 'factuur', 'kost') then
    raise exception 'Onbekende soort voor de prullenbak: %', new.soort
      using errcode = 'check_violation';
  end if;
  if new.externe_id is null or btrim(new.externe_id) = '' then
    raise exception 'Prullenbakregel zonder externe_id'
      using errcode = 'check_violation';
  end if;

  -- 3. De kern: het record mag niet meer bestaan. Welke kolom de externe sleutel
  --    draagt verschilt per soort — klanten en leveranciers dragen snelstart_id,
  --    facturen en kosten de generieke externe_referentie.
  select case new.soort
    when 'klant' then exists (
      select 1 from public.customers c
       where c.company_id = new.company_id and c.snelstart_id = new.externe_id)
    when 'leverancier' then exists (
      select 1 from public.leveranciers l
       where l.company_id = new.company_id and l.snelstart_id = new.externe_id)
    when 'factuur' then exists (
      select 1 from public.facturen f
       where f.company_id = new.company_id and f.externe_referentie = new.externe_id)
    when 'kost' then exists (
      select 1 from public.job_costs k
       where k.company_id = new.company_id and k.externe_referentie = new.externe_id)
  end into v_bestaat;

  if v_bestaat then
    raise exception 'Dit record bestaat nog in BossBase; verwijder het daar in plaats van het hier over te slaan'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.bb_import_genegeerd_bewijs() from public, anon, authenticated;

drop trigger if exists bb_import_genegeerd_bewijs_trigger on public.import_genegeerd;
create trigger bb_import_genegeerd_bewijs_trigger
  before insert on public.import_genegeerd
  for each row execute function public.bb_import_genegeerd_bewijs();

comment on function public.bb_import_genegeerd_bewijs() is
  'Laat een prullenbakregel alleen toe als het bijbehorende record echt weg is. Zie de migratie voor de afweging.';


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Vaste afsluiting van elke migratie; zie CLAUDE.md, "Database en migraties".
notify pgrst, 'reload schema';
