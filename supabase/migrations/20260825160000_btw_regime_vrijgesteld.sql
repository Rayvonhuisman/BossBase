-- Regime 'vrijgesteld' erbij: vier regimes in plaats van drie.
--
-- Aanleiding: de eerdere backfill maakte van élke 0%-regel 'verlegd', omdat dat
-- voor onze doelgroep de meest waarschijnlijke reden voor 0% leek. Dat blijkt te
-- grof. SnelStart kent vrijgesteld en verlegd als twee verschillende dingen
-- (grootboekfuncties VerkopenBtwVrij naast VerkopenOmzetOnbelastVerlegd), en
-- weigert een verkoopboeking waarin verlegd samen met belaste regels staat
-- (BOE-0062). Vrijgestelde omzet die als verlegd geboekt wordt, laat de hele
-- factuur mislukken.
--
-- Export binnen/buiten de EU nemen we bewust NIET op: onze doelgroep levert niet
-- over de grens, en elke extra keuze is een kans op een verkeerde.

alter table public.factuur_regels drop constraint if exists factuur_regels_btw_regime_check;
alter table public.factuur_regels
  add constraint factuur_regels_btw_regime_check
  check (btw_regime in ('normaal', 'verlaagd', 'vrijgesteld', 'verlegd'));

alter table public.offerte_items drop constraint if exists offerte_items_btw_regime_check;
alter table public.offerte_items
  add constraint offerte_items_btw_regime_check
  check (btw_regime in ('normaal', 'verlaagd', 'vrijgesteld', 'verlegd'));

-- Vrijgesteld is net als verlegd per definitie 0%.
alter table public.factuur_regels drop constraint if exists factuur_regels_verlegd_nul_check;
alter table public.factuur_regels
  add constraint factuur_regels_verlegd_nul_check
  check (btw_regime not in ('verlegd', 'vrijgesteld') or coalesce(btw_pct, 0) = 0);

alter table public.offerte_items drop constraint if exists offerte_items_verlegd_nul_check;
alter table public.offerte_items
  add constraint offerte_items_verlegd_nul_check
  check (btw_regime not in ('verlegd', 'vrijgesteld') or coalesce(btw_pct, 0) = 0);

comment on column public.factuur_regels.btw_regime is
  'BTW-rubriek van de regel: normaal (21%), verlaagd (9%), vrijgesteld (0%, wettelijk vrijgestelde dienst) of verlegd (0%, btw verlegd naar de opdrachtgever).';
comment on column public.offerte_items.btw_regime is
  'BTW-rubriek van de regel: normaal (21%), verlaagd (9%), vrijgesteld (0%) of verlegd (0%).';

-- ── Correctie van de eerdere backfill ───────────────────────────────────────
-- Er is GEEN betrouwbare manier om achteraf te bepalen waarom een 0%-regel 0%
-- was: het datamodel legde dat destijds niet vast. Raden zou stilzwijgend
-- verkeerde btw-rubrieken opleveren, en dat is erger dan een zichtbaar
-- verkeerde die de gebruiker zelf corrigeert.
--
-- Daarom alleen waar de omschrijving het letterlijk zégt. Dat dekt de testdata
-- (regels met "vrijgesteld" in de omschrijving) en laat alle andere rijen met
-- rust. Een echte klant corrigeert zelf, of merkt het aan een geweigerde
-- boeking — en die fout is nu tenminste zichtbaar in de sync-melding.
update public.factuur_regels
   set btw_regime = 'vrijgesteld'
 where btw_regime = 'verlegd'
   and coalesce(btw_pct, 0) = 0
   and omschrijving ilike '%vrijgesteld%';

update public.offerte_items
   set btw_regime = 'vrijgesteld'
 where btw_regime = 'verlegd'
   and coalesce(btw_pct, 0) = 0
   and omschrijving ilike '%vrijgesteld%';
