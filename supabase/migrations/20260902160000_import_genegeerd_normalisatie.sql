-- De prullenbaktrigger vergeleek appels met peren.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- negeerBijImport() normaliseert de referentie vóór het opslaan:
--
--     String(ref).replace(/^snelstart_/, '').split('_')[0]
--
-- De tabellen bewaren hem anders:
--
--     customers.snelstart_id          68499e54-…              → prullenbak: 68499e54-…   MATCHT
--     leveranciers.snelstart_id       idem                    → idem                     MATCHT
--     facturen.externe_referentie     snelstart_894d20e7-…    → prullenbak: 894d20e7-…   matcht niet
--     job_costs.externe_referentie    snelstart_4e290f91-…_0  → prullenbak: 4e290f91-…   matcht niet
--
-- De trigger uit 20260902130000 vergeleek met de rauwe kolom. Voor klanten en
-- leveranciers klopte dat; voor facturen en kosten vond hij nooit iets, dus liet
-- hij daar alles door en bood hij geen enkele bescherming — precies bij de twee
-- soorten waar het over geld gaat.
--
-- Nu dezelfde normalisatie aan bèide kanten. De verwijdering zelf gaat aan de
-- prullenbakregel vooraf (zie customerService/jobCostService), dus de echte
-- flow vindt het record niet meer en blijft werken.

create or replace function public.bb_import_genegeerd_bewijs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bestaat boolean;
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

  -- Zelfde bewerking als negeerBijImport: prefix eraf, alles vanaf het eerste
  -- resterende underscore eraf. Zo vergelijken beide kanten hetzelfde.
  select case new.soort
    when 'klant' then exists (
      select 1 from public.customers c
       where c.company_id = new.company_id
         and split_part(regexp_replace(c.snelstart_id, '^snelstart_', ''), '_', 1) = new.externe_id)
    when 'leverancier' then exists (
      select 1 from public.leveranciers l
       where l.company_id = new.company_id
         and split_part(regexp_replace(l.snelstart_id, '^snelstart_', ''), '_', 1) = new.externe_id)
    when 'factuur' then exists (
      select 1 from public.facturen f
       where f.company_id = new.company_id
         and split_part(regexp_replace(f.externe_referentie, '^snelstart_', ''), '_', 1) = new.externe_id)
    when 'kost' then exists (
      select 1 from public.job_costs k
       where k.company_id = new.company_id
         and split_part(regexp_replace(k.externe_referentie, '^snelstart_', ''), '_', 1) = new.externe_id)
  end into v_bestaat;

  if v_bestaat then
    raise exception 'Dit record bestaat nog in BossBase; verwijder het daar in plaats van het hier over te slaan'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.bb_import_genegeerd_bewijs() from public, anon, authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
