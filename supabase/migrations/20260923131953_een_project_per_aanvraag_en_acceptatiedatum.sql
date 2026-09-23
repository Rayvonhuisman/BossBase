-- ── Waarom ──────────────────────────────────────────────────────────────────
-- 1. Eén project per aanvraag, afgedwongen.
--    Sinds 20260921190434 krijgt elke aanvraag een project via een trigger.
--    "Nieuw project" liet je daarna nog steeds een aanvraag kiezen, en maakte
--    dan een tweede project bij dezelfde aanvraag; de pipeline opende het
--    oudste en het nieuwe was vanaf daar onvindbaar. De frontend werkt nu het
--    bestaande project bij (createProject), maar een tweede route (import,
--    API, een vergeten scherm) kan het opnieuw doen. Een unieke index sluit dat.
--    Gemeten op 23-09-2026: 0 aanvragen met meer dan één project, dus de index
--    kan zonder opruimen worden aangemaakt.
--
-- 2. offertes.geaccepteerd_op werd nergens gezet: niet bij ondertekenen
--    (edge function sign-offerte zet alleen signed_at) en niet bij het met de
--    hand op geaccepteerd zetten in de app. Van de 80 geaccepteerde offertes
--    hadden er 25 geen datum. Een trigger vangt beide routes, zonder de edge
--    function opnieuw te hoeven deployen.
--    Bijvullen alleen waar een echte bron is: signed_at (23 offertes). De
--    overige 2 hebben geen ondertekening en blijven leeg - een verzonnen datum
--    is erger dan geen datum.

begin;

-- ── 1. Unieke index op projects.deal_id ─────────────────────────────────────
create unique index if not exists projects_deal_id_uniek
  on public.projects (deal_id)
  where deal_id is not null;

-- ── 2. Acceptatiedatum ──────────────────────────────────────────────────────
create or replace function public.bb_offerte_geaccepteerd_op()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'geaccepteerd'
     and (tg_op = 'INSERT' or old.status is distinct from 'geaccepteerd')
     and new.geaccepteerd_op is null then
    new.geaccepteerd_op := coalesce(new.signed_at, now());
  elsif tg_op = 'UPDATE' and old.status = 'geaccepteerd' and new.status is distinct from 'geaccepteerd' then
    -- Terug naar verzonden of afgewezen: dan is hij niet (meer) geaccepteerd.
    new.geaccepteerd_op := null;
  end if;
  return new;
end;
$$;

revoke all on function public.bb_offerte_geaccepteerd_op() from public, anon, authenticated;
grant execute on function public.bb_offerte_geaccepteerd_op() to service_role;

drop trigger if exists bb_offerte_geaccepteerd_op on public.offertes;
create trigger bb_offerte_geaccepteerd_op
  before insert or update of status on public.offertes
  for each row execute function public.bb_offerte_geaccepteerd_op();

update public.offertes
   set geaccepteerd_op = signed_at
 where status = 'geaccepteerd'
   and geaccepteerd_op is null
   and signed_at is not null;

-- ── 3. De uitkomst ──────────────────────────────────────────────────────────
select
  (select count(*) from pg_indexes where indexname = 'projects_deal_id_uniek')                 as index_er,
  (select count(*) from public.offertes where status = 'geaccepteerd' and geaccepteerd_op is null) as geaccepteerd_zonder_datum,
  (select count(*) from pg_roles r, pg_proc p
    where p.proname = 'bb_offerte_geaccepteerd_op' and p.pronamespace = 'public'::regnamespace
      and r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE'))                                   as lekken;

commit;

notify pgrst, 'reload schema';
