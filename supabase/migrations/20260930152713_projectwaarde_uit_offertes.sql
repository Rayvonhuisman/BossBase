-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De projectwaarde was een los getal: bij het aanmaken de "verwachte omzet" uit
-- de aanvraag, daarna alleen met de hand te wijzigen. Een geaccepteerde offerte
-- veranderde er niets aan. De pipeline las deals.expected_revenue, dat door
-- bb_project_naar_deal met project_value gelijk wordt gehouden.
--
-- Afspraak (30-09-2026):
--   - De projectwaarde is de som van de geaccepteerde offertes van het project.
--   - Zolang er geen geaccepteerde offerte is: de geschatte waarde uit de
--     aanvraag.
--   - Met de hand overschrijven blijft kunnen; dan blijft die waarde staan tot
--     iemand hem weer op automatisch zet.
--   - De pipeline toont dezelfde waarde (via de bestaande spiegeling naar de
--     deal).
--
-- Bedragen incl. btw, net als het formulier "Nieuw project" (label "incl. BTW",
-- vulde al het offertetotaal incl. in) en "Te factureren" op de projectkaart,
-- dat de projectwaarde met gefactureerde bedragen incl. btw vergelijkt.
--
-- Twee kolommen erbij:
--   geschatte_waarde  de schatting uit de aanvraag; los bewaard, want
--                     project_value zelf wordt overschreven zodra er een offerte
--                     geaccepteerd is;
--   waarde_bron       'offertes' | 'aanvraag' | 'handmatig'.
--
-- Gemeten vóór het draaien (30-09-2026): projecten met een geaccepteerde
-- offerte waarvan de waarde verandert: 53 bij het testbedrijf, 3 bij Dakdekker
-- Niels, 0 bij BossBase Admin. Projecten zonder geaccepteerde offerte houden
-- hun huidige waarde; die wordt hun geschatte waarde.

begin;

alter table public.projects
  add column if not exists geschatte_waarde numeric(12,2),
  add column if not exists waarde_bron text not null default 'aanvraag'
    check (waarde_bron in ('offertes', 'aanvraag', 'handmatig'));

comment on column public.projects.geschatte_waarde is
  'Geschatte waarde uit de aanvraag. Geldt als projectwaarde zolang er geen geaccepteerde offerte is.';
comment on column public.projects.waarde_bron is
  'Waar project_value vandaan komt: offertes (som geaccepteerde, incl. btw), aanvraag (geschatte_waarde) of handmatig.';

-- ── 1. De waarde van één project uitrekenen ─────────────────────────────────
create or replace function public.bb_projectwaarde_bijwerken(p_project uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p       record;
  v_som   numeric;
  v_n     int;
  v_waarde numeric;
  v_bron  text;
begin
  select id, deal_id, offerte_id, project_value, geschatte_waarde, waarde_bron
    into p from public.projects where id = p_project;
  if p.id is null or p.waarde_bron = 'handmatig' then
    return;
  end if;

  select coalesce(sum(o.totaal_incl), 0), count(*)
    into v_som, v_n
    from public.offertes o
   where o.status = 'geaccepteerd'
     and (o.deal_id = p.deal_id or o.id = p.offerte_id);

  if v_n > 0 then
    v_waarde := v_som;                          v_bron := 'offertes';
  else
    v_waarde := coalesce(p.geschatte_waarde, 0); v_bron := 'aanvraag';
  end if;

  update public.projects
     set project_value = v_waarde,
         waarde_bron   = v_bron
   where id = p_project
     and (project_value is distinct from v_waarde or waarde_bron is distinct from v_bron);
end;
$$;

revoke all on function public.bb_projectwaarde_bijwerken(uuid) from public, anon, authenticated;
grant execute on function public.bb_projectwaarde_bijwerken(uuid) to service_role;

-- ── 2. Bij elke wijziging van een offerte ───────────────────────────────────
create or replace function public.bb_offerte_projectwaarde()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select p.id from public.projects p
     where (tg_op <> 'DELETE' and (p.deal_id = new.deal_id or p.offerte_id = new.id))
        or (tg_op <> 'INSERT' and (p.deal_id = old.deal_id or p.offerte_id = old.id))
  loop
    perform public.bb_projectwaarde_bijwerken(r.id);
  end loop;
  return coalesce(new, old);
end;
$$;

revoke all on function public.bb_offerte_projectwaarde() from public, anon, authenticated;
grant execute on function public.bb_offerte_projectwaarde() to service_role;

drop trigger if exists bb_offerte_projectwaarde on public.offertes;
create trigger bb_offerte_projectwaarde
  after insert or delete or update of status, totaal_incl, deal_id on public.offertes
  for each row execute function public.bb_offerte_projectwaarde();

-- ── 3. Handmatig terug naar automatisch, of offerte aan het project koppelen ─
create or replace function public.bb_project_waarde_herbereken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.bb_projectwaarde_bijwerken(new.id);
  return new;
end;
$$;

revoke all on function public.bb_project_waarde_herbereken() from public, anon, authenticated;
grant execute on function public.bb_project_waarde_herbereken() to service_role;

drop trigger if exists bb_project_waarde_herbereken on public.projects;
create trigger bb_project_waarde_herbereken
  after update of waarde_bron, offerte_id, geschatte_waarde on public.projects
  for each row
  when (new.waarde_bron <> 'handmatig'
        and (old.waarde_bron is distinct from new.waarde_bron
          or old.offerte_id  is distinct from new.offerte_id
          or old.geschatte_waarde is distinct from new.geschatte_waarde))
  execute function public.bb_project_waarde_herbereken();

-- ── 4. Nieuw project krijgt de schatting uit de aanvraag ────────────────────
create or replace function public.bb_deal_project_aanmaken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.projects p where p.deal_id = new.id) then
    return new;
  end if;

  insert into public.projects (company_id, customer_id, deal_id, name, description,
                               project_value, geschatte_waarde, waarde_bron, status, assigned_to)
  values (
    new.company_id,
    new.customer_id,
    new.id,
    coalesce(nullif(btrim(new.title), ''), 'Aanvraag'),
    new.description,
    coalesce(new.expected_revenue, 0),
    coalesce(new.expected_revenue, 0),
    'aanvraag',
    'gepland',
    new.assigned_to
  );

  return new;
end;
$$;

revoke all on function public.bb_deal_project_aanmaken() from public, anon, authenticated;
grant execute on function public.bb_deal_project_aanmaken() to service_role;

-- ── 5. Bestaande projecten ──────────────────────────────────────────────────
-- Schatting: de huidige projectwaarde, of, als die 0 is, de verwachte omzet
-- van de aanvraag. Dat laatste raakt de projecten van de bijvulling van 21-09,
-- die met waarde 0 zijn aangemaakt terwijl de aanvraag wel een bedrag had.
update public.projects p
   set geschatte_waarde = case
         when p.project_value > 0 then p.project_value
         else coalesce((select d.expected_revenue from public.deals d where d.id = p.deal_id), 0)
       end
 where p.geschatte_waarde is null;

do $b$
declare r record;
begin
  for r in select id from public.projects loop
    perform public.bb_projectwaarde_bijwerken(r.id);
  end loop;
end $b$;

-- De pipeline eenmalig gelijkzetten. Daarna houdt bb_project_naar_deal het
-- bij, maar die vuurt alleen bij een wijziging, en oude verschillen (van vóór
-- die trigger) blijven anders staan.
update public.deals d
   set expected_revenue = p.project_value
  from public.projects p
 where p.deal_id = d.id
   and d.expected_revenue is distinct from p.project_value;

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select count(*) filter (where waarde_bron = 'offertes') from public.projects) as uit_offertes,
  (select count(*) filter (where waarde_bron = 'aanvraag') from public.projects) as uit_aanvraag,
  (select count(*) from public.projects p join public.deals d on d.id = p.deal_id
    where d.expected_revenue is distinct from p.project_value)                  as pipeline_wijkt_af,
  (select count(*) from pg_roles r, pg_proc p
    where p.proname in ('bb_projectwaarde_bijwerken', 'bb_offerte_projectwaarde', 'bb_project_waarde_herbereken', 'bb_deal_project_aanmaken')
      and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE'))                  as lekken;

commit;

notify pgrst, 'reload schema';
