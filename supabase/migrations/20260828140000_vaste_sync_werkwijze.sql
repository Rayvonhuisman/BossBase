-- Vaste sync-werkwijze: de twee schakelaars vervallen.
--
-- Tot nu toe kon een bedrijf per koppeling twee dingen aanzetten:
--   * sync_paid_only  → alleen BETAALDE facturen naar de boekhouding
--   * import_costs    → kosten wel/niet meenemen (alleen SnelStart las dit)
--
-- Beide zijn eruit. Wat er nu gebeurt ligt vast:
--   * alle facturen worden geboekt BEHALVE concepten — die zijn nog niet
--     verstuurd en horen dus niet in de boekhouding;
--   * kosten gaan altijd mee, beide richtingen op.
--
-- Waarom vast: een half gesynchroniseerde administratie is lastiger te
-- herstellen dan een volledige, en de schakelaars maakten onzichtbaar waarom
-- een factuur níét in de boekhouding stond.
--
-- De KOLOMMEN blijven staan. Ze worden nergens meer gelezen (frontend noch edge
-- functions, gecontroleerd op 28-08-2026), maar weggooien is onomkeerbaar en
-- levert niets op. Deze migratie zet ze alleen gelijk aan het nieuwe gedrag,
-- zodat er geen rij achterblijft die iets anders suggereert dan er gebeurt.
--
-- Effect op de bestaande bedrijven (gemeten vóór deze migratie):
--   * geen enkel bedrijf had sync_paid_only aan;
--   * beide gekoppelde SnelStart-bedrijven hadden import_costs al aan;
--   * de Moneybird-koppeling had import_costs uit, maar die vlag werd aan de
--     Moneybird-kant sowieso niet gelezen.
--   * er is geen enkele factuur die door de nieuwe statusregel nieuw in
--     aanmerking komt: alles zonder externe_referentie staat op concept,
--     verzonden of betaald.
-- Feitelijk verandert er dus voor niemand iets in gedrag; dit legt de situatie
-- alleen vast in plaats van hem instelbaar te laten.

update public.accounting_connections
   set import_costs   = true,
       sync_paid_only = false,
       updated_at     = now()
 where coalesce(import_costs, false) is distinct from true
    or coalesce(sync_paid_only, false) is distinct from false;

comment on column public.accounting_connections.import_costs is
  'VERVALLEN (28-08-2026). Kosten gaan altijd mee. Kolom blijft staan voor historie; wordt nergens gelezen.';

comment on column public.accounting_connections.sync_paid_only is
  'VERVALLEN (28-08-2026). Alle facturen behalve concepten gaan mee. Kolom blijft staan voor historie; wordt nergens gelezen.';

-- get_snelstart_sync_targets() geeft de twee kolommen nog terug. De aanroeper
-- (forEachSnelStartCompany) leest ze niet meer. Bewust niet aangepast: de
-- signatuur wijzigen vraagt drop+create van een SECURITY DEFINER-functie, en
-- daar staan rechten aan die je dan opnieuw goed moet zetten — risico zonder
-- opbrengst.
