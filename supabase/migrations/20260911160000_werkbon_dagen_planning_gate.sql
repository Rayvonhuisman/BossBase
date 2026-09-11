-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Meerdere dagen plannen hoort bij de planningsmodule: in het Team-pakket, of
-- als module van €10 bij Groei. Migratie 20260911133000 (werkbon_dagen) dwong
-- dat nergens af, en het werkbonformulier zit in élk pakket. Starter- en
-- Groei-klanten zonder module konden daardoor een periode, losse dagen en tijden
-- per dag zetten — een functie waar ze niet voor betalen. De app toont het blok
-- nu alleen nog met de module; dit is de afdwinging in de database, want die is
-- bij ons de waarheid (zie lib/features.js).
--
-- De grens: één dag mag altijd. Een datum op een werkbon hoort bij werkbonnen
-- en de agenda, die in elk pakket zitten, en had iedereen al vóór de dagen-tabel.
-- Een TWEEDE dag toevoegen mag alleen met bb_has_feature(bedrijf, 'planning').
--
-- Alleen toevoegen wordt tegengehouden. Schuiven (een andere startdatum) en
-- weghalen blijven mogen. Een bedrijf dat de module opzegt, houdt daarmee zijn
-- bestaande meerdaagse bonnen en kan ze verplaatsen; alleen uitbreiden kan niet
-- meer.
--
-- Gemeten vóór het draaien (11-09-2026): 1 werkbon met meer dan één dag, bij een
-- bedrijf mét planning. Die raakt deze migratie niet.


-- ── De wijziging ────────────────────────────────────────────────────────────
-- Zelfde functie als in 20260911133000, met de module-controle erbij. Zelfde
-- signatuur, dus create or replace houdt de bestaande rechten; ze worden
-- hieronder toch expliciet opnieuw gezet.
create or replace function public.bb_werkbon_dagen_na()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_werkbon uuid := coalesce(new.werkbon_id, old.werkbon_id);
  v_aantal  integer;
  v_eerste  date;
begin
  if tg_op <> 'DELETE' then
    select count(*) into v_aantal from public.werkbon_dagen where werkbon_id = v_werkbon;
    if v_aantal > 60 then
      raise exception 'Een werkbon kan maximaal 60 dagen hebben (nu %). Verdeel een langere klus over meerdere werkbonnen.', v_aantal
        using errcode = 'check_violation';
    end if;
    -- Een dag erbij terwijl er al een is: dat is meerdaags plannen.
    if tg_op = 'INSERT' and v_aantal > 1
       and not public.bb_has_feature(new.company_id, 'planning') then
      raise exception 'Een klus over meerdere dagen plannen zit in de planningsmodule (Team, of als module bij Groei).'
        using errcode = 'check_violation';
    end if;
  end if;

  if pg_trigger_depth() > 1 then
    return null;
  end if;

  select min(datum) into v_eerste from public.werkbon_dagen where werkbon_id = v_werkbon;
  update public.werkbonnen
     set gepland_op = v_eerste
   where id = v_werkbon
     and gepland_op is distinct from v_eerste;

  if tg_op = 'UPDATE' and old.werkbon_id <> new.werkbon_id then
    select min(datum) into v_eerste from public.werkbon_dagen where werkbon_id = old.werkbon_id;
    update public.werkbonnen
       set gepland_op = v_eerste
     where id = old.werkbon_id
       and gepland_op is distinct from v_eerste;
  end if;

  return null;
end;
$$;

revoke all on function public.bb_werkbon_dagen_na() from public, anon, authenticated;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
