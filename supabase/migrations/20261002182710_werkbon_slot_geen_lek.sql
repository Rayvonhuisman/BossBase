-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, laag (sec-scheiding B7): de "werkbon op slot"-trigger draait
-- vóór de RLS-check. Wie een werkbon-id van een ander bedrijf kende en een rij
-- met het company_id van dat bedrijf probeerde in te voegen, kreeg "Werkbon is op
-- 16-09-2026 ondertekend" terug: bestaan én ondertekendatum lekten. (Met het
-- eigen company_id houdt a0_verwijzingen_zelfde_bedrijf het al eerder tegen.)
--
-- Nu: voor een ingelogde gebruiker van een ander bedrijf een algemene weigering
-- zonder datum. Binnen het eigen bedrijf, en voor service-rol/definer-paden
-- (auth.uid() leeg), blijft de duidelijke melding met datum.

begin;

create or replace function public.bb_werkbon_op_slot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_werkbon_id    uuid;
  v_ondertekend   timestamptz;
  v_bedrijf       uuid;
begin
  if tg_op = 'DELETE' then v_werkbon_id := old.werkbon_id;
  else                     v_werkbon_id := new.werkbon_id;
  end if;

  select ondertekend_op, company_id into v_ondertekend, v_bedrijf
    from public.werkbonnen where id = v_werkbon_id;

  if v_ondertekend is not null then
    if auth.uid() is not null and v_bedrijf is distinct from public.bb_current_company() then
      raise exception 'Geen toegang tot deze werkbon.' using errcode = '42501';
    end if;
    raise exception
      'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
      to_char(v_ondertekend, 'DD-MM-YYYY')
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

revoke all on function public.bb_werkbon_op_slot() from public, anon, authenticated;

notify pgrst, 'reload schema';

select 1 as klaar;

commit;
