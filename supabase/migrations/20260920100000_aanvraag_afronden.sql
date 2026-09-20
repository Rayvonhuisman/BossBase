-- Een aanvraag kan worden afgerond.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Een aanvraag kon niet dicht. `deals.status` kent alleen open, won en lost, en
-- "af" werd afgeleid uit de naam van de fase (stageCategory: /afgerond|gewonnen|
-- voltooid|opgeleverd/). Dat betekende: een bedrijf dat zijn fasen anders noemt
-- had helemaal geen "af", en een gewonnen klus bleef op het pipelinebord staan
-- tot iemand hem naar een fase sleepte die toevallig goed heette.
--
-- Daarom een eigen kolom, geen vierde status en geen naamregel:
--
--   * `status` blijft open|won|lost. "Akkoord" (won) en "afgerond" zijn twee
--     verschillende dingen: je kunt akkoord krijgen en het werk nog moeten doen.
--     Alles wat nu op status rekent (pipelinewaarde, funnel, filters) blijft
--     daardoor werken.
--   * De fase blijft staan waar hij stond. Zo is achteraf te zien waar de
--     aanvraag was toen hij werd afgerond, en de fasen blijven van het bedrijf.
--
-- Afronden is omkeerbaar: leeg de kolom en de aanvraag staat weer op het bord.
--
-- Wil dezelfde klant later opnieuw in de pipeline, dan komt er een nieuwe
-- aanvraag bij; de afgeronde blijft staan. Er is dus bewust geen uniciteit per
-- klant.
--
-- Rechten: deals_update eist al bb_has_permission('verkoop') in zowel qual als
-- with check, dus deze kolom valt daar vanzelf onder. Geen nieuwe policy.
--
-- Raakt geen bestaande data: de kolom begint overal leeg, en leeg betekent
-- precies wat er nu geldt (niet afgerond).

alter table public.deals add column afgerond_op timestamptz;

comment on column public.deals.afgerond_op is
  'Wanneer de aanvraag is afgerond. Leeg = loopt nog en staat op het pipelinebord. De fase en de status blijven staan zoals ze waren.';

-- Het bord en de klantkaart vragen per bedrijf om de lopende aanvragen.
create index deals_open_aanvragen_idx on public.deals (company_id) where afgerond_op is null;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- deals
notify pgrst, 'reload schema';
