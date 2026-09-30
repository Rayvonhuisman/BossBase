===== bb_actieve_admins
CREATE OR REPLACE FUNCTION public.bb_actieve_admins(p_company_id uuid, p_behalve uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
    FROM public.profiles
   WHERE company_id = p_company_id
     AND role = 'admin'
     AND actief
     AND (p_behalve IS NULL OR id <> p_behalve)
$function$

===== bb_factuurtotalen_bij_regel
CREATE OR REPLACE FUNCTION public.bb_factuurtotalen_bij_regel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.bb_herbereken_factuurtotalen(coalesce(new.factuur_id, old.factuur_id));
  -- Een regel die naar een andere factuur verhuist laat er twee scheef achter.
  if tg_op = 'UPDATE' and new.factuur_id is distinct from old.factuur_id then
    perform public.bb_herbereken_factuurtotalen(old.factuur_id);
  end if;
  return null;
end;
$function$

===== bb_offertetotalen_bij_regel
CREATE OR REPLACE FUNCTION public.bb_offertetotalen_bij_regel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.bb_herbereken_offertetotalen(coalesce(new.offerte_id, old.offerte_id));
  if tg_op = 'UPDATE' and new.offerte_id is distinct from old.offerte_id then
    perform public.bb_herbereken_offertetotalen(old.offerte_id);
  end if;
  return null;
end;
$function$

===== bb_voertuig_verwijderd
CREATE OR REPLACE FUNCTION public.bb_voertuig_verwijderd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.werkbonnen w
     set voertuig_ids = array_remove(w.voertuig_ids, old.id)
   where w.company_id = old.company_id
     and old.id = any (w.voertuig_ids);
  return old;
end;
$function$

===== bb_werkbon_dag_op_slot
CREATE OR REPLACE FUNCTION public.bb_werkbon_dag_op_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ondertekend timestamptz;
begin
  select ondertekend_op into v_ondertekend
    from public.werkbonnen
   where id = case when tg_op = 'DELETE' then old.werkbon_id else new.werkbon_id end;

  if v_ondertekend is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' and exists (
    select 1 from public.werkbon_dagen d where d.werkbon_id = new.werkbon_id and d.datum = new.datum
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.werkbon_id = old.werkbon_id
     and new.datum = old.datum
     and new.starttijd is not distinct from old.starttijd
     and new.eindtijd is not distinct from old.eindtijd
     and ((new.medewerker_tijden is not distinct from old.medewerker_tijden
           and new.voertuig_tijden is not distinct from old.voertuig_tijden)
          or pg_trigger_depth() > 1) then
    return new;
  end if;

  raise exception
    'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
    to_char(v_ondertekend, 'DD-MM-YYYY')
    using errcode = 'check_violation';
end;
$function$

===== bb_werkbon_dagen_na
CREATE OR REPLACE FUNCTION public.bb_werkbon_dagen_na()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

===== bb_werkbon_op_slot
CREATE OR REPLACE FUNCTION public.bb_werkbon_op_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_werkbon_id    uuid;
  v_ondertekend   timestamptz;
begin
  if tg_op = 'DELETE' then v_werkbon_id := old.werkbon_id;
  else                     v_werkbon_id := new.werkbon_id;
  end if;

  select ondertekend_op into v_ondertekend
    from public.werkbonnen where id = v_werkbon_id;

  if v_ondertekend is not null then
    raise exception
      'Werkbon is op % ondertekend en staat op slot. Maak een nieuwe werkbon voor een correctie.',
      to_char(v_ondertekend, 'DD-MM-YYYY')
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$

===== bb_werkbon_status_gevolgen
CREATE OR REPLACE FUNCTION public.bb_werkbon_status_gevolgen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deal uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.bb_project_status_bijwerken(OLD.project_id);
    RETURN OLD;
  END IF;

  PERFORM public.bb_project_status_bijwerken(NEW.project_id);
  IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    PERFORM public.bb_project_status_bijwerken(OLD.project_id);
  END IF;

  -- De werkbon duwt de pipeline zelf ook vooruit; via zijn eigen deal, of die
  -- van het project waar hij aan hangt.
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    v_deal := coalesce(NEW.deal_id, (SELECT deal_id FROM public.projects WHERE id = NEW.project_id));
    PERFORM public.bb_deal_naar_fase(v_deal, NEW.status);
  END IF;

  RETURN NEW;
END;
$function$

===== bb_profiel_bewaken
CREATE OR REPLACE FUNCTION public.bb_profiel_bewaken()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eigenaar uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT eigenaar_id INTO v_eigenaar FROM public.companies WHERE id = OLD.company_id;

    IF v_eigenaar IS NOT NULL AND OLD.id = v_eigenaar THEN
      RAISE EXCEPTION 'De eigenaar van het account kan niet worden verwijderd. Draag eerst het eigenaarschap over.'
        USING ERRCODE = 'check_violation', HINT = 'eigenaar';
    END IF;

    IF OLD.role = 'admin' AND OLD.actief AND OLD.company_id IS NOT NULL
       AND public.bb_actieve_admins(OLD.company_id, OLD.id) = 0 THEN
      RAISE EXCEPTION 'Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan.'
        USING ERRCODE = 'check_violation', HINT = 'laatste_admin';
    END IF;

    RETURN OLD;
  END IF;

  -- UPDATE. Alleen een rol die van admin áf gaat kan het bedrijf zonder
  -- beheerder achterlaten. Deactiveren bewust niet: zie de kop van dit bestand.
  IF NEW.role IS DISTINCT FROM OLD.role AND OLD.role = 'admin' AND NEW.role <> 'admin'
     AND OLD.actief AND OLD.company_id IS NOT NULL
     AND public.bb_actieve_admins(OLD.company_id, OLD.id) = 0 THEN
    RAISE EXCEPTION 'Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan.'
      USING ERRCODE = 'check_violation', HINT = 'laatste_admin';
  END IF;

  RETURN NEW;
END;
$function$

