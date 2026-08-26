-- Factuurtotalen kunnen niet meer uiteenlopen met de regels.
--
-- facturen.totaal_excl en totaal_incl waren een momentopname: één keer
-- weggeschreven bij het aanmaken, daarna door niets meer gecontroleerd. De
-- SnelStart-export rekent uit de REGELS, de schermen tonen het OPGESLAGEN veld.
-- Die twee liepen op vijf facturen uiteen, tot €19 per stuk, zonder dat iets dat
-- signaleerde.
--
-- Waarom een trigger en geen afgeleide kolom: een generated column mag in
-- Postgres niet naar een andere tabel kijken, dus een echte afleiding kan alleen
-- via een view over facturen heen. Dat raakt elke RLS-policy, elke PostgREST-
-- embed en tientallen aanroepen — veel risico voor hetzelfde resultaat. Een
-- trigger doet het werk zonder dat er één aanroep verandert, en vangt ook
-- schrijvers die de applicatie niet kent: SQL-scripts, edge functions, imports.
--
-- De afrondregel volgt bewust useRegelTotals (FacturenPage) én
-- pushVerkoopboeking (_shared/snelstart.ts): btw wordt PER TARIEF gegroepeerd en
-- per groep afgerond, daarna opgeteld. Eén keer afronden over het totaal zou een
-- nieuw structureel centverschil met de boekhouding introduceren.

-- Berekent de totalen van één factuur uit zijn regels. Geeft NULL terug als er
-- geen regels zijn — een factuur in aanbouw mag niet op nul gezet worden.
create or replace function public.bb_factuurtotalen(p_factuur_id uuid)
returns table (excl numeric, incl numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  with per_tarief as (
    select coalesce(fr.btw_pct, 21)          as pct,
           coalesce(fr.btw_regime, 'normaal') as regime,
           sum(round(coalesce(fr.regelprijs, 0), 2)) as excl
      from public.factuur_regels fr
     where fr.factuur_id = p_factuur_id
     group by 1, 2
  ),
  totalen as (
    select round(sum(excl), 2) as excl,
           -- Vrijgesteld en verlegd leveren geen btw op, ongeacht het
           -- percentage dat er toevallig bij staat. Zo blijft het totaal gelijk
           -- aan wat de boekhouding geboekt krijgt.
           sum(case when regime in ('vrijgesteld', 'verlegd') then 0
                    else round(excl * pct / 100, 2) end) as btw
      from per_tarief
  )
  select excl, round(excl + btw, 2) from totalen where excl is not null;
$$;

comment on function public.bb_factuurtotalen(uuid) is
  'Totalen van een factuur uit zijn regels; btw per tarief afgerond, gelijk aan de UI en de boekhoudexport. Leeg als de factuur geen regels heeft.';

-- Herberekenen en wegschrijven. Alleen schrijven als er iets verandert, zodat
-- een sync of import geen onnodige updates (en updated_at-bewegingen) oplevert.
create or replace function public.bb_herbereken_factuurtotalen(p_factuur_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_excl numeric;
  v_incl numeric;
begin
  if p_factuur_id is null then return; end if;
  select excl, incl into v_excl, v_incl from public.bb_factuurtotalen(p_factuur_id);
  if v_excl is null then return; end if;

  update public.facturen
     set totaal_excl = v_excl,
         totaal_incl = v_incl
   where id = p_factuur_id
     and (totaal_excl is distinct from v_excl or totaal_incl is distinct from v_incl);
end;
$$;

-- ── Trigger 1: regel wijzigt → totalen bij ──────────────────────────────────
create or replace function public.bb_factuurtotalen_bij_regel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.bb_herbereken_factuurtotalen(coalesce(new.factuur_id, old.factuur_id));
  -- Een regel die naar een andere factuur verhuist laat er twee scheef achter.
  if tg_op = 'UPDATE' and new.factuur_id is distinct from old.factuur_id then
    perform public.bb_herbereken_factuurtotalen(old.factuur_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_factuur_regels_totalen on public.factuur_regels;
create trigger trg_factuur_regels_totalen
after insert or update or delete on public.factuur_regels
for each row execute function public.bb_factuurtotalen_bij_regel();

-- ── Trigger 2: meegegeven totalen worden overschreven ───────────────────────
-- Zonder deze kan iemand de kolommen nog steeds los van de regels zetten — via
-- een script, een import, of updateFactuur dat de totalen gewoon meestuurt.
-- Alleen bij UPDATE: op het moment van INSERT bestaan de regels nog niet, die
-- worden er daarna pas ingezet en dan doet trigger 1 zijn werk.
create or replace function public.bb_factuurtotalen_forceren()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_excl numeric;
  v_incl numeric;
begin
  select excl, incl into v_excl, v_incl from public.bb_factuurtotalen(new.id);
  if v_excl is null then return new; end if;  -- factuur zonder regels: met rust laten
  new.totaal_excl := v_excl;
  new.totaal_incl := v_incl;
  return new;
end;
$$;

drop trigger if exists trg_facturen_totalen_forceren on public.facturen;
create trigger trg_facturen_totalen_forceren
before update on public.facturen
for each row execute function public.bb_factuurtotalen_forceren();
