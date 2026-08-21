-- BTW-regime op factuur- en offerteregels.
--
-- Aanleiding: btw_pct alleen zegt niet wélke btw-rubriek van toepassing is. 0%
-- kan vrijgesteld, verlegd of export zijn. De SnelStart-koppeling moest daarom
-- raden en raadde fout: 0%-regels werden geboekt als "btw-vrij", vielen terug op
-- het eerste beste verkoopgrootboek en belandden op "Omzet verlegd" — zonder de
-- bijbehorende btw-regel, waardoor rubriek 2a leeg bleef.
--
-- Bewust drie regimes: dat is wat ambachtelijke ondernemers gebruiken.
-- Vrijgesteld en export komen bij deze doelgroep vrijwel niet voor.
--
-- Backfill: 21% → normaal, 9% → verlaagd, 0% → verlegd (voor deze doelgroep de
-- enige realistische reden voor 0%), afwijkende percentages → normaal.

-- ── kolom ───────────────────────────────────────────────────────────────────
alter table public.factuur_regels add column if not exists btw_regime text;
alter table public.offerte_items  add column if not exists btw_regime text;

-- ── backfill uit het bestaande percentage ───────────────────────────────────
update public.factuur_regels
   set btw_regime = case
         when btw_pct = 9 then 'verlaagd'
         when btw_pct = 0 then 'verlegd'
         else 'normaal'
       end
 where btw_regime is null;

update public.offerte_items
   set btw_regime = case
         when btw_pct = 9 then 'verlaagd'
         when btw_pct = 0 then 'verlegd'
         else 'normaal'
       end
 where btw_regime is null;

-- ── default + not null ──────────────────────────────────────────────────────
alter table public.factuur_regels alter column btw_regime set default 'normaal';
alter table public.offerte_items  alter column btw_regime set default 'normaal';

alter table public.factuur_regels alter column btw_regime set not null;
alter table public.offerte_items  alter column btw_regime set not null;

-- ── toegestane waarden ──────────────────────────────────────────────────────
alter table public.factuur_regels drop constraint if exists factuur_regels_btw_regime_check;
alter table public.factuur_regels
  add constraint factuur_regels_btw_regime_check
  check (btw_regime in ('normaal', 'verlaagd', 'verlegd'));

alter table public.offerte_items drop constraint if exists offerte_items_btw_regime_check;
alter table public.offerte_items
  add constraint offerte_items_btw_regime_check
  check (btw_regime in ('normaal', 'verlaagd', 'verlegd'));

-- Verlegd is per definitie 0%: dit voorkomt dat regime en percentage uit elkaar
-- lopen en de boekhouding weer moet gaan raden.
alter table public.factuur_regels drop constraint if exists factuur_regels_verlegd_nul_check;
alter table public.factuur_regels
  add constraint factuur_regels_verlegd_nul_check
  check (btw_regime <> 'verlegd' or coalesce(btw_pct, 0) = 0);

alter table public.offerte_items drop constraint if exists offerte_items_verlegd_nul_check;
alter table public.offerte_items
  add constraint offerte_items_verlegd_nul_check
  check (btw_regime <> 'verlegd' or coalesce(btw_pct, 0) = 0);

comment on column public.factuur_regels.btw_regime is
  'BTW-rubriek van de regel: normaal (21%), verlaagd (9%) of verlegd (0%, onderaanneming bouw). Bepaalt de grootboek- en btw-mapping richting de boekhoudkoppeling.';
comment on column public.offerte_items.btw_regime is
  'BTW-rubriek van de regel: normaal (21%), verlaagd (9%) of verlegd (0%, onderaanneming bouw).';
