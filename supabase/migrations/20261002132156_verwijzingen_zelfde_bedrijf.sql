-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, H3 (en M3). Verwijzingen als offertes.deal_id,
-- werkbonnen.project_id en facturen.project_id waren gewone foreign keys: de
-- policies controleerden alleen de company_id van de rij zelf, niet waar de
-- verwijzing naartoe wees. De SECURITY DEFINER-triggers die erop reageren
-- (bb_offerte_akkoord_gevolgen, bb_werkbon_status_gevolgen, …) pasten daarna de
-- deal of het project aan, zonder bedrijfscheck. Gesimuleerd: bedrijf A zette een
-- deal van bedrijf B op "Akkoord" en de projectwaarde van € 2.406 op € 1.002.405.
-- Hetzelfde gat liet A regels en notities hangen aan offertes en werkbonnen van B
-- (die verschenen op B's publieke ondertekenpagina).
--
-- Eén generieke BEFORE-trigger op elke tabel met een verwijzing naar een andere
-- bedrijfstabel: de verwezen rij moet bij hetzelfde bedrijf horen. De trigger
-- heet a0_… zodat hij vóór de andere BEFORE-triggers draait (die lekten anders
-- in hun foutmelding iets van de vreemde rij, audit sec-scheiding B7).
-- De foutmelding zegt niet of de rij bestaat, alleen dat hij niet van jou is.
--
-- Gemeten vóór het draaien: 61 verwijzingen (zonder die naar profiles en
-- companies), 0 bestaande rijen die naar een ander bedrijf wijzen.
--
-- Extra laag: bb_projectwaarde_bijwerken telt alleen offertes van het eigen
-- bedrijf mee.

create or replace function public.bb_verwijzingen_zelfde_bedrijf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i        int;
  v_kolom  text;
  v_doel   text;
  v_nieuw  jsonb := to_jsonb(new);
  v_oud    jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_bedrijf uuid := (to_jsonb(new)->>'company_id')::uuid;
  v_waarde text;
  v_ok     boolean;
begin
  for i in 0 .. tg_nargs - 1 loop
    v_kolom := split_part(tg_argv[i], ':', 1);
    v_doel  := split_part(tg_argv[i], ':', 2);
    v_waarde := v_nieuw->>v_kolom;
    continue when v_waarde is null;
    -- Bij een update alleen controleren als de verwijzing of het bedrijf wijzigt.
    continue when tg_op = 'UPDATE'
              and v_waarde is not distinct from v_oud->>v_kolom
              and (v_nieuw->>'company_id') is not distinct from (v_oud->>'company_id');
    execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', v_doel)
      into v_ok using v_waarde::uuid, v_bedrijf;
    if not v_ok then
      raise exception 'Verwijzing hoort niet bij dit bedrijf (%)', v_kolom
        using errcode = '23514', hint = 'ander_bedrijf';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.bb_verwijzingen_zelfde_bedrijf() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select tabel, string_agg(format('%L', kolom || ':' || doel), ', ' order by kolom) as args
      from (
        select c.conrelid::regclass::text as tabel, a.attname as kolom,
               replace(c.confrelid::regclass::text, 'public.', '') as doel
          from pg_constraint c
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
         where c.contype = 'f' and c.connamespace = 'public'::regnamespace
           and array_length(c.conkey, 1) = 1
           and exists (select 1 from information_schema.columns x where x.table_schema = 'public'
                        and x.table_name = c.conrelid::regclass::text and x.column_name = 'company_id')
           and exists (select 1 from information_schema.columns x where x.table_schema = 'public'
                        and x.table_name = replace(c.confrelid::regclass::text, 'public.', '') and x.column_name = 'company_id')
           and c.confrelid::regclass::text not in ('companies', 'profiles')
         group by 1, 2, 3
      ) fk
     group by tabel
  loop
    execute format('drop trigger if exists a0_verwijzingen_zelfde_bedrijf on public.%I', r.tabel);
    execute format('create trigger a0_verwijzingen_zelfde_bedrijf before insert or update on public.%I '
                   'for each row execute function public.bb_verwijzingen_zelfde_bedrijf(%s)', r.tabel, r.args);
  end loop;
end $$;

-- Projectwaarde: alleen geaccepteerde offertes van het eigen bedrijf.
create or replace function public.bb_projectwaarde_bijwerken(p_project uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p        record;
  v_som    numeric;
  v_n      int;
  v_waarde numeric;
  v_bron   text;
begin
  select id, company_id, deal_id, offerte_id, project_value, geschatte_waarde, waarde_bron
    into p from public.projects where id = p_project;
  if p.id is null or p.waarde_bron = 'handmatig' then
    return;
  end if;

  select coalesce(sum(o.totaal_excl), 0), count(*)
    into v_som, v_n
    from public.offertes o
   where o.status = 'geaccepteerd'
     and o.company_id = p.company_id
     and (o.deal_id = p.deal_id or o.id = p.offerte_id);

  if v_n > 0 then
    v_waarde := v_som;                           v_bron := 'offertes';
  else
    v_waarde := coalesce(p.geschatte_waarde, 0); v_bron := 'aanvraag';
  end if;

  update public.projects
     set project_value = v_waarde,
         waarde_bron   = v_bron
   where id = p_project
     and (project_value is distinct from v_waarde or waarde_bron is distinct from v_bron);
end;
$function$;

notify pgrst, 'reload schema';

select count(*) as tabellen_met_trigger
  from pg_trigger where tgname = 'a0_verwijzingen_zelfde_bedrijf';
