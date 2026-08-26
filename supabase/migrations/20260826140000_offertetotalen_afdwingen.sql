-- Offertetotalen kunnen niet meer uiteenlopen met de regels.
--
-- Zelfde constructie als 20260826120000 voor facturen, maar het gat was hier
-- groter: bij facturen bestond alleen een INSERT voor de regels, bij offertes
-- bestaan createOfferteItem, updateOfferteItem én deleteOfferteItem en raakt
-- géén van drieën offertes.totaal_excl/totaal_incl aan. Een prijs aanpassen of
-- een regel weggooien liet de totalen dus gewoon staan.
--
-- Dat is zichtbaar naar de klant: de offerte-PDF drukt de regels af en zet
-- daaronder het OPGESLAGEN subtotaal. Lopen die uiteen, dan staat er een lijst
-- van €56 met een subtotaal van €70 eronder.
--
-- marge_pct krijgt bewust GEEN uitzondering. Die kolom is inert: er is geen
-- invoerveld meer, calculateOfferteTotals komt nooit voorbij zijn vroege
-- terugkeer omdat elke aanroeper de totalen meegeeft, en de tien offertes van
-- de enige echte administratie hebben marge 25 terwijl hun totaal_excl exact
-- gelijk is aan de som van de regels. De offertes waar totaal_excl wél 1,25×
-- de regels is komen uit code die niet meer bestaat.
--
-- Btw-percentage per regel, met offertes.btw_pct als terugval: offerte_items.
-- btw_pct is nullable en staat bij 52 van de 77 regels leeg. Dat is dezelfde
-- terugval die de PDF gebruikt. btw_regime is nergens leeg (0 van 77), dus de
-- coalesce daarop is een formaliteit — hij staat er om de functie ook op nieuwe
-- data te laten kloppen als dat ooit verandert.

-- Berekent de totalen van één offerte uit zijn regels. Leeg als er geen regels
-- zijn — een offerte in aanbouw mag niet op nul gezet worden.
create or replace function public.bb_offertetotalen(p_offerte_id uuid)
returns table (excl numeric, incl numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  with per_tarief as (
    select coalesce(i.btw_pct, o.btw_pct, 21)  as pct,
           coalesce(i.btw_regime, 'normaal')   as regime,
           sum(round(coalesce(i.subtotaal, 0), 2)) as excl
      from public.offerte_items i
      join public.offertes o on o.id = i.offerte_id
     where i.offerte_id = p_offerte_id
     group by 1, 2
  ),
  totalen as (
    select round(sum(excl), 2) as excl,
           sum(case when regime in ('vrijgesteld', 'verlegd') then 0
                    else round(excl * pct / 100, 2) end) as btw
      from per_tarief
  )
  select excl, round(excl + btw, 2) from totalen where excl is not null;
$$;

comment on function public.bb_offertetotalen(uuid) is
  'Totalen van een offerte uit zijn regels; btw per tarief afgerond. Leeg als de offerte geen regels heeft.';

create or replace function public.bb_herbereken_offertetotalen(p_offerte_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_excl numeric;
  v_incl numeric;
begin
  if p_offerte_id is null then return; end if;
  select excl, incl into v_excl, v_incl from public.bb_offertetotalen(p_offerte_id);
  if v_excl is null then return; end if;

  update public.offertes
     set totaal_excl = v_excl,
         totaal_incl = v_incl
   where id = p_offerte_id
     and (totaal_excl is distinct from v_excl or totaal_incl is distinct from v_incl);
end;
$$;

-- ── Trigger 1: regel wijzigt → totalen bij ──────────────────────────────────
create or replace function public.bb_offertetotalen_bij_regel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.bb_herbereken_offertetotalen(coalesce(new.offerte_id, old.offerte_id));
  if tg_op = 'UPDATE' and new.offerte_id is distinct from old.offerte_id then
    perform public.bb_herbereken_offertetotalen(old.offerte_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_offerte_items_totalen on public.offerte_items;
create trigger trg_offerte_items_totalen
after insert or update or delete on public.offerte_items
for each row execute function public.bb_offertetotalen_bij_regel();

-- ── Trigger 2: meegegeven totalen worden overschreven ───────────────────────
-- Alleen bij UPDATE: bij INSERT bestaan de regels nog niet.
create or replace function public.bb_offertetotalen_forceren()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_excl numeric;
  v_incl numeric;
begin
  select excl, incl into v_excl, v_incl from public.bb_offertetotalen(new.id);
  if v_excl is null then return new; end if;  -- offerte zonder regels: met rust laten
  new.totaal_excl := v_excl;
  new.totaal_incl := v_incl;
  return new;
end;
$$;

drop trigger if exists trg_offertes_totalen_forceren on public.offertes;
create trigger trg_offertes_totalen_forceren
before update on public.offertes
for each row execute function public.bb_offertetotalen_forceren();

-- ── Bestaande offertes rechtzetten ──────────────────────────────────────────
-- Offertes zonder regels blijven ongemoeid: bb_offertetotalen geeft dan niets
-- terug en bb_herbereken_offertetotalen stopt. Dat is precies de ene offerte
-- van €1.860,38 in het demobedrijf die uit het oude model komt.
do $$
declare r record;
begin
  for r in select id from public.offertes loop
    perform public.bb_herbereken_offertetotalen(r.id);
  end loop;
end $$;
