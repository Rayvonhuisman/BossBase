-- ── Waarom ──────────────────────────────────────────────────────────────────
-- werkbonnen.updated_at veranderde niet bij een wijziging (status, planning,
-- ondertekenen): er hing geen trigger aan, anders dan bij projects en de
-- notitietabellen (audit 2026-10-01, functioneel-b F-B19).
-- De naam begint met "werkbonnen_", zodat hij ná bb_werkbon_getekend_bevriezen
-- draait: die vergelijkt OLD en NEW en hoeft deze automatische wijziging niet te
-- zien.

begin;

drop trigger if exists werkbonnen_set_updated_at on public.werkbonnen;
create trigger werkbonnen_set_updated_at
  before update on public.werkbonnen
  for each row execute function public.set_updated_at();

select tgname from pg_trigger where tgname = 'werkbonnen_set_updated_at';

commit;
