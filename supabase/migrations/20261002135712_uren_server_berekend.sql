-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M16 (functioneel-b F-B6).
-- 1. Het urengetal kwam van de client. Als monteur werd 08:00–16:00 met 30 min
--    pauze als 12 uur geaccepteerd, en een werkbonuur van 4 uur als 99. De
--    nacalculatie en de werkbon-PDF rekenen met dat getal. Nu rekent de database
--    het zelf uit: eind − begin − pauze, op twee decimalen — dezelfde regel als
--    berekenUren() in src/services/urenService.js. Gemeten vóór het draaien:
--    0 bestaande rijen wijken af van die regel (587 urenregistratie, 404
--    werkbon_uren), dus bestaande data verandert niet.
--    Zonder begin- of eindtijd (1 rij) blijft het ingevoerde getal staan, maar
--    begrensd op 0–24.
-- 2. Een monteur kon werkbonuren op naam van een collega boeken. Voor een ander
--    boeken mag nu alleen een beheerder, een verantwoordelijke van die werkbon of
--    iemand met het recht 'planning' (CLAUDE.md "Uren": de werkbon bepaalt wie
--    mag boeken, met beheer en planning als vangnet).

begin;

create or replace function public.bb_uren_berekenen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_min numeric;
begin
  if new.start_tijd is not null and new.eind_tijd is not null then
    v_min := extract(epoch from (new.eind_tijd - new.start_tijd)) / 60 - coalesce(new.pauze_minuten, 0);
    if v_min <= 0 then
      raise exception 'De eindtijd moet na de begintijd liggen, en de pauze moet korter zijn dan de werktijd.'
        using errcode = 'check_violation';
    end if;
    new.uren := round(v_min / 60.0, 2);
  elsif new.uren is not null and (new.uren < 0 or new.uren > 24) then
    raise exception 'Een dag heeft hooguit 24 uur.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.bb_uren_berekenen() from public, anon, authenticated;

drop trigger if exists bb_uren_berekenen on public.urenregistratie;
create trigger bb_uren_berekenen
  before insert or update on public.urenregistratie
  for each row execute function public.bb_uren_berekenen();
drop trigger if exists bb_uren_berekenen on public.werkbon_uren;
create trigger bb_uren_berekenen
  before insert or update on public.werkbon_uren
  for each row execute function public.bb_uren_berekenen();

-- Mag de ingelogde gebruiker op deze werkbon uren boeken voor iemand anders?
create or replace function public.bb_mag_uren_voor_ander(p_werkbon uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' and actief is not false from profiles where id = auth.uid()), false)
      or public.bb_has_permission('planning')
      or exists (select 1 from werkbonnen w
                  where w.id = p_werkbon
                    and w.company_id = (select company_id from profiles where id = auth.uid())
                    and auth.uid() = any (w.verantwoordelijke_ids));
$$;
revoke all on function public.bb_mag_uren_voor_ander(uuid) from public, anon, authenticated;
grant execute on function public.bb_mag_uren_voor_ander(uuid) to authenticated, service_role;

drop policy if exists werkbon_uren_insert on public.werkbon_uren;
create policy werkbon_uren_insert on public.werkbon_uren
  for insert
  with check (company_id = current_company_id()
              and bb_mag_werkbon_uren_beheren(werkbon_id)
              and (profile_id = auth.uid() or public.bb_mag_uren_voor_ander(werkbon_id)));

drop policy if exists werkbon_uren_update on public.werkbon_uren;
create policy werkbon_uren_update on public.werkbon_uren
  for update
  using (company_id = current_company_id()
         and bb_mag_werkbon_uren_beheren(werkbon_id)
         and (profile_id = auth.uid() or public.bb_mag_uren_voor_ander(werkbon_id)))
  with check (company_id = current_company_id()
              and bb_mag_werkbon_uren_beheren(werkbon_id)
              and (profile_id = auth.uid() or public.bb_mag_uren_voor_ander(werkbon_id)));

notify pgrst, 'reload schema';

select
  (select count(*) from urenregistratie where start_tijd is not null and eind_tijd is not null
     and uren is distinct from round(((extract(epoch from eind_tijd - start_tijd) / 60 - coalesce(pauze_minuten, 0)) / 60.0)::numeric, 2)) as afwijkend_ur_moet_0,
  (select count(*) from werkbon_uren where start_tijd is not null and eind_tijd is not null
     and uren is distinct from round(((extract(epoch from eind_tijd - start_tijd) / 60 - coalesce(pauze_minuten, 0)) / 60.0)::numeric, 2)) as afwijkend_wu_moet_0;

commit;
