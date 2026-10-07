-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Eén Moneybird-synchronisatie tegelijk per bedrijf.
--
-- Op 2026-10-07 drukte de gebruiker "Kosten/facturen synchroniseren" en een
-- seconde later "Contacten synchroniseren". Beide runs maakten voor dezelfde
-- nieuwe klant een Moneybird-contact aan: één aan de factuur, één aan de klant
-- in BossBase. Moneybird's zoekfunctie ziet een net aangemaakt contact niet
-- (cache), dus geen van beide runs kon de ander opmerken. Hetzelfde kan bij de
-- losse factuursync (op betaald zetten, Stripe) tijdens een lopende sync.
--
-- sync_bezig_sinds is het slot: een run zet het met één atomaire update als het
-- leeg is (of ouder dan 5 minuten: een afgekapte run mag het niet voor altijd
-- vasthouden) en maakt het leeg als hij klaar is. Alleen de edge functions
-- (service-rol) gebruiken het; authenticated kan het niet lezen (de tabel heeft
-- alleen leesrechten op de niet-geheime kolommen, zie 20260722140000).
--
-- Raakt geen bestaande data: nieuwe kolom, leeg.

alter table public.accounting_connections
  add column if not exists sync_bezig_sinds timestamptz;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
notify pgrst, 'reload schema';
