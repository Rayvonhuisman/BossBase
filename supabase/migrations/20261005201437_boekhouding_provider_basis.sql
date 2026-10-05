-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Stap 1 van de Moneybird-herbouw: de gedeelde stukken van de SnelStart-
-- koppeling krijgen een provider in plaats van vast 'snelstart'.
--
-- 1. De prullenbak (import_genegeerd) had al een provider-kolom, maar de
--    bewijs-trigger keek alleen naar SnelStart: een klant of leverancier werd
--    op snelstart_id gecontroleerd en de externe referentie werd ontdaan van
--    het voorvoegsel 'snelstart_'. Voor Moneybird kon daardoor nooit iets in
--    de prullenbak: de controle "bestaat dit record nog?" keek naar de
--    verkeerde kolom. Nu per provider de eigen kolom en het eigen voorvoegsel.
--
-- 2. grootboek_voorkeuren.grootboek_nummer was verplicht. SnelStart werkt met
--    vaste rekeningnummers; Moneybird niet — daar is het id leidend en is een
--    rekeningcode optioneel (veel administraties hebben er geen). Het nummer
--    mag dus leeg zijn; SnelStart vult het altijd en leest alleen het nummer.
--
-- Raakt geen bestaande data: alleen een constraint versoepeld en de
-- triggerfunctie vervangen (zelfde naam en signatuur, rechten blijven staan).


-- ── De wijziging ────────────────────────────────────────────────────────────
alter table public.grootboek_voorkeuren alter column grootboek_nummer drop not null;

create or replace function public.bb_import_genegeerd_bewijs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bestaat boolean;
  -- Het voorvoegsel van de externe referentie hoort bij de provider:
  -- 'snelstart_<id>[_n]' of 'moneybird_<id>[_n]'. Zelfde bewerking als
  -- negeerBijImport in de app: voorvoegsel eraf, alles vanaf het eerste
  -- resterende underscore eraf.
  v_prefix text := '^' || new.provider || '_';
begin
  if new.company_id is distinct from current_company_id() then
    raise exception 'Prullenbakregel hoort niet bij je eigen bedrijf'
      using errcode = 'check_violation';
  end if;

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

  select case new.soort
    when 'klant' then exists (
      select 1 from public.customers c
       where c.company_id = new.company_id
         and split_part(regexp_replace(
               case new.provider when 'moneybird' then c.moneybird_id else c.snelstart_id end,
               v_prefix, ''), '_', 1) = new.externe_id)
    when 'leverancier' then exists (
      select 1 from public.leveranciers l
       where l.company_id = new.company_id
         and split_part(regexp_replace(
               case new.provider when 'moneybird' then l.moneybird_id else l.snelstart_id end,
               v_prefix, ''), '_', 1) = new.externe_id)
    when 'factuur' then exists (
      select 1 from public.facturen f
       where f.company_id = new.company_id
         and f.externe_referentie ~ v_prefix
         and split_part(regexp_replace(f.externe_referentie, v_prefix, ''), '_', 1) = new.externe_id)
    when 'kost' then exists (
      select 1 from public.job_costs k
       where k.company_id = new.company_id
         and k.externe_referentie ~ v_prefix
         and split_part(regexp_replace(k.externe_referentie, v_prefix, ''), '_', 1) = new.externe_id)
  end into v_bestaat;

  if v_bestaat then
    raise exception 'Dit record bestaat nog in BossBase; verwijder het daar in plaats van het hier over te slaan'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

-- Triggerfunctie: niemand hoeft hem rechtstreeks aan te roepen.
revoke all on function public.bb_import_genegeerd_bewijs() from public, anon, authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
