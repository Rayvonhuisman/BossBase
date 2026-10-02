-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (sec-scheiding B5): een gebruiker kon het company_id
-- van zijn eigen rijen naar een ander bedrijf zetten. De UPDATE-policies van
-- notifications en boss_conversations kijken naar user_id, niet naar het bedrijf.
-- Er lekte niets, maar de data raakte inconsistent. Gemeten vóór deze migratie
-- (teruggedraaide transactie, als Stamvol-admin): notifications 9 rijen
-- verplaatst, boss_conversations 2. dashboard_widgets en de drie werkbon-
-- kindtabellen werden al tegengehouden (RLS resp. a0_verwijzingen_zelfde_bedrijf).
--
-- Een rij verhuist nooit van bedrijf. Een trigger maakt company_id daarom
-- onwijzigbaar op deze tabellen, ook voor wie de policy wél zou toelaten.

begin;

create or replace function public.bb_company_id_onwijzigbaar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'Een rij kan niet naar een ander bedrijf worden verplaatst.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.bb_company_id_onwijzigbaar() from public, anon, authenticated;

drop trigger if exists bb_company_id_onwijzigbaar on public.notifications;
create trigger bb_company_id_onwijzigbaar before update of company_id on public.notifications
  for each row execute function public.bb_company_id_onwijzigbaar();
drop trigger if exists bb_company_id_onwijzigbaar on public.boss_conversations;
create trigger bb_company_id_onwijzigbaar before update of company_id on public.boss_conversations
  for each row execute function public.bb_company_id_onwijzigbaar();
drop trigger if exists bb_company_id_onwijzigbaar on public.dashboard_widgets;
create trigger bb_company_id_onwijzigbaar before update of company_id on public.dashboard_widgets
  for each row execute function public.bb_company_id_onwijzigbaar();

notify pgrst, 'reload schema';

select count(*) as triggers_moet_3 from pg_trigger where tgname = 'bb_company_id_onwijzigbaar';

commit;
