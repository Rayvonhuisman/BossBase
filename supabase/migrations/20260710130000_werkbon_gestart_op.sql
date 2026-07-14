-- =============================================================================
-- BossBase: startmoment van een werkbon vastleggen (gestart_op)
-- Bestand : supabase/migrations/20260710130000_werkbon_gestart_op.sql
--
-- Achtergrond:
--   Een werkbon kende al een afrondmoment (afgerond_op, gezet bij status
--   'afgerond'), maar géén startmoment. Bij de overgang naar 'in_uitvoering'
--   werd alleen de status gezet. Deze kolom legt dat startmoment vast zodat we
--   het later kunnen benutten (bv. doorlooptijd). De service vult gestart_op
--   éénmalig (= now() bij de eerste overgang naar in_uitvoering) en overschrijft
--   een bestaand startmoment niet. Wordt een klus direct afgerond (zonder
--   tussenstap), dan blijft gestart_op leeg — er was immers geen echt startmoment.
--
-- Veilig / idempotent: alleen een nieuwe, nullable kolom. Geen bestaande data
-- wordt gewijzigd of verwijderd.
-- =============================================================================

alter table public.werkbonnen add column if not exists gestart_op timestamptz;

comment on column public.werkbonnen.gestart_op is
  'Moment waarop de werkbon is gestart (eerste overgang status → in_uitvoering). Eenmalig gezet, nooit overschreven. Leeg als de klus direct is afgerond zonder tussenstap.';
