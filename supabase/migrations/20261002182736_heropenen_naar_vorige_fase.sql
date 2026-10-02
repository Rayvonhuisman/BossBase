-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een verloren aanvraag heropenen zette hem altijd terug in de eerste fase
-- ("Nieuwe aanvragen"), ook als hij al in "Wacht op akkoord" stond (audit
-- 2026-10-01, functioneel-a A19). De fase van vóór het verlies werd nergens
-- bewaard.
--
-- Nu: bij de overgang naar verloren onthoudt de database de fase ervoor
-- (deals.stage_voor_verlies). Bij heropenen (status lost → open) zet hij de deal
-- daarin terug, als die fase nog bestaat; anders blijft de fase die de app
-- meestuurt (de eerste). De trigger heet bb_deal_fase_…, zodat hij vóór
-- bb_deal_status_uit_fase draait: die rekent daarna de status uit de herstelde
-- fase (open of gewonnen).

begin;

alter table public.deals
  add column if not exists stage_voor_verlies uuid references public.pipeline_stages(id) on delete set null;

create or replace function public.bb_deal_fase_voor_verlies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'lost' and old.status is distinct from 'lost' then
    new.stage_voor_verlies := old.stage_id;
  elsif old.status = 'lost' and new.status is distinct from 'lost' then
    if old.stage_voor_verlies is not null and exists (
         select 1 from pipeline_stages s
          where s.id = old.stage_voor_verlies and s.company_id = new.company_id) then
      new.stage_id := old.stage_voor_verlies;
    end if;
    new.stage_voor_verlies := null;
  end if;
  return new;
end;
$$;

revoke all on function public.bb_deal_fase_voor_verlies() from public, anon, authenticated;

drop trigger if exists bb_deal_fase_voor_verlies on public.deals;
create trigger bb_deal_fase_voor_verlies
  before update of status on public.deals
  for each row execute function public.bb_deal_fase_voor_verlies();

notify pgrst, 'reload schema';

select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'deals' and column_name = 'stage_voor_verlies';

commit;
