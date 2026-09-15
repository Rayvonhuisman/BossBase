-- De oude tabel `notes` opruimen.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Deal-notities staan sinds 20260915120000 in `deal_notities`. `notes` wordt
-- daarna door geen enkel scherm meer gebruikt; de demo-scripts, readonly-tests
-- en het rollbackscript zijn in dezelfde commit omgezet.
--
-- ── Volgorde ────────────────────────────────────────────────────────────────
-- Deze migratie staat bewust als .pending. Eerst:
--   1. 20260915120000_deal_notities draaien,
--   2. de frontend pushen en de Vercel-deploy afwachten,
--   3. dan pas deze: .pending weghalen, dry-run, push.
-- Draai je hem vóór stap 2, dan vraagt de deal-drawer van de live versie nog
-- naar `notes` en krijgt hij een 404.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Gemeten op 2026-09-15: 0 rijen. Er hangen geen views, functies, triggers of
-- foreign keys aan `notes`, alleen zijn eigen vijf policies (die gaan mee).
-- Het blok hieronder weigert te draaien als er alsnog iets in staat dat niet in
-- deal_notities terecht is gekomen: dan eerst uitzoeken, niet weggooien.


do $$
declare
  zonder_deal   int;
  niet_over     int;
begin
  if to_regclass('public.notes') is null then
    return;
  end if;

  select count(*) into zonder_deal
    from public.notes
   where deal_id is null and coalesce(btrim(content), '') <> '';

  select count(*) into niet_over
    from public.notes n
   where n.deal_id is not null
     and coalesce(btrim(n.content), '') <> ''
     and not exists (
       select 1 from public.deal_notities x
        where x.deal_id = n.deal_id and x.note = btrim(n.content) and x.created_at = n.created_at
     );

  if zonder_deal > 0 or niet_over > 0 then
    raise exception 'notes is niet leeg: % notitie(s) zonder deal, % niet overgezet naar deal_notities — eerst uitzoeken',
      zonder_deal, niet_over;
  end if;
end $$;

drop table if exists public.notes;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
