-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Vervolg op 20260930152713. De projectwaarde uit geaccepteerde offertes werd
-- incl. btw opgeteld. Besluit 30-09-2026: exclusief btw, zodat hij klopt met de
-- omzetcijfers (dashboard en facturen rekenen omzet met totaal_excl). Op de
-- projectkaart rekenen "Gefactureerd" en "Te factureren" voortaan ook excl.
--
-- Alleen de som verandert; de regels (offertes, anders de schatting, handmatig
-- blijft staan) niet. Alle niet-handmatige projecten worden opnieuw uitgerekend;
-- bb_project_naar_deal zet de pipeline gelijk.

begin;

create or replace function public.bb_projectwaarde_bijwerken(p_project uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p        record;
  v_som    numeric;
  v_n      int;
  v_waarde numeric;
  v_bron   text;
begin
  select id, deal_id, offerte_id, project_value, geschatte_waarde, waarde_bron
    into p from public.projects where id = p_project;
  if p.id is null or p.waarde_bron = 'handmatig' then
    return;
  end if;

  select coalesce(sum(o.totaal_excl), 0), count(*)
    into v_som, v_n
    from public.offertes o
   where o.status = 'geaccepteerd'
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
$$;

revoke all on function public.bb_projectwaarde_bijwerken(uuid) from public, anon, authenticated;
grant execute on function public.bb_projectwaarde_bijwerken(uuid) to service_role;

-- Ook reageren op een gewijzigd totaal excl.
drop trigger if exists bb_offerte_projectwaarde on public.offertes;
create trigger bb_offerte_projectwaarde
  after insert or delete or update of status, totaal_excl, totaal_incl, deal_id on public.offertes
  for each row execute function public.bb_offerte_projectwaarde();

comment on column public.projects.waarde_bron is
  'Waar project_value vandaan komt: offertes (som geaccepteerde, excl. btw), aanvraag (geschatte_waarde) of handmatig.';

do $b$
declare r record;
begin
  for r in select id from public.projects where waarde_bron = 'offertes' loop
    perform public.bb_projectwaarde_bijwerken(r.id);
  end loop;
end $b$;

select
  (select count(*) from public.projects p
    where p.waarde_bron = 'offertes'
      and p.project_value <> (select coalesce(sum(o.totaal_excl), 0) from public.offertes o
                               where o.status = 'geaccepteerd' and (o.deal_id = p.deal_id or o.id = p.offerte_id))) as afwijkend,
  (select count(*) from public.projects p join public.deals d on d.id = p.deal_id
    where d.expected_revenue is distinct from p.project_value)                                                   as pipeline_wijkt_af;

commit;

notify pgrst, 'reload schema';
