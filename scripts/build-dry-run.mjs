#!/usr/bin/env node
// Bouwt één droogloop-bestand uit de migratie + het testscript.
//
//     node scripts/build-dry-run.mjs
//     → supabase/tests/_dryrun_plan_matrix.sql
//
// Waarom een generator en geen handgeschreven bestand: beide bronbestanden
// bevatten hun eigen BEGIN/COMMIT. Zou je ze achter elkaar plakken, dan COMMIT
// de migratie halverwege en is de "droogloop" ineens permanent. Deze generator
// strípt elke transactiegrens en zet er precies één omheen, met ROLLBACK.
//
// Regenereer dit bestand na elke wijziging aan de migratie of de tests.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const MIGRATIE = 'supabase/migrations/20260728120000_plan_matrix.sql'
const UPGRADE  = 'supabase/migrations/20260728121000_upgrade_requests.sql'
const FALLBACK = 'supabase/migrations/20260728150000_plan_matrix_fallback.sql'
const PROVISION= 'supabase/migrations/20260728160000_provision_account_subscription.sql'
const BILLING  = 'supabase/migrations/20260730120000_stripe_billing.sql'
const HOSTING  = 'supabase/migrations/20260730121000_plan_matrix_hosting.sql'
const WELKOM   = 'supabase/migrations/20260730130000_welkomstactie.sql'
const TEST     = 'supabase/tests/plan_matrix_test.sql'
const TEST_BIL = 'supabase/tests/billing_test.sql'
const UIT      = 'supabase/tests/_dryrun_plan_matrix.sql'

// Haalt transactiegrenzen weg die op een eigen regel staan. Alleen regels die
// exact BEGIN;/COMMIT;/ROLLBACK; zijn — nooit het BEGIN van een plpgsql-blok,
// want dat staat altijd ingesprongen of gevolgd door code.
function stripTransacties(sql, naam) {
  let verwijderd = 0
  const out = sql
    .split('\n')
    .map(regel => {
      if (/^(BEGIN|COMMIT|ROLLBACK)\s*;\s*$/i.test(regel)) {
        verwijderd++
        return `-- [droogloop] transactiegrens verwijderd: ${regel.trim()}`
      }
      return regel
    })
    .join('\n')
  console.error(`  ${naam}: ${verwijderd} transactiegrenzen gestript`)
  return out
}

const delen = [
  `-- =============================================================================
-- _dryrun_plan_matrix.sql — GEGENEREERD, niet met de hand bewerken.
--   node scripts/build-dry-run.mjs
--
-- Draait de migratie én de tests in ÉÉN transactie die eindigt op ROLLBACK.
-- Er wijzigt niets permanent. Alle interne BEGIN/COMMIT zijn eruit gehaald,
-- anders zou de migratie halverwege alsnog wegschrijven.
--
-- Draaien:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/_dryrun_plan_matrix.sql
--
-- Of plak de inhoud in de Supabase SQL-editor en voer hem in één keer uit.
--
-- LET OP: dit neemt kortstondig ACCESS EXCLUSIVE locks op de tabellen waarvan
-- policies worden herschreven. Op een drukke productiedatabase kunnen queries
-- daardoor even wachten. Draai het bij voorkeur op een rustig moment.
-- =============================================================================

BEGIN;

SET LOCAL client_min_messages = NOTICE;
SET LOCAL statement_timeout = '120s';
-- Blijf niet eindeloos op een lock wachten; liever netjes falen dan productie
-- laten vastlopen.
SET LOCAL lock_timeout = '10s';

DO $droogloop$ BEGIN RAISE NOTICE '=== DROOGLOOP GESTART (eindigt op ROLLBACK) ==='; END $droogloop$;
`,
]

console.error('Droogloop bouwen:')
for (const [pad, naam] of [[MIGRATIE, 'migratie'], [UPGRADE, 'upgrade_requests'], [FALLBACK, 'fallback'], [PROVISION, 'provision_account'],
                            [BILLING, 'stripe_billing'], [HOSTING, 'plan_matrix_hosting'], [WELKOM, 'welkomstactie'],
                            [TEST, 'tests'], [TEST_BIL, 'billing_tests']]) {
  delen.push(`\n-- ======================= ${naam} (${pad}) =======================\n`)
  delen.push(stripTransacties(readFileSync(pad, 'utf8'), naam))
}

delen.push(`
DO $droogloop$ BEGIN RAISE NOTICE '=== DROOGLOOP KLAAR — alles wordt teruggedraaid ==='; END $droogloop$;

-- Positieve bevestiging als RIJ, niet als NOTICE: de Management API geeft
-- NOTICE-regels niet terug, dus zonder dit zou "geen foutmelding" het enige
-- signaal zijn. Faalt een ASSERT, dan komt die melding als fout terug en wordt
-- deze SELECT nooit bereikt.
SELECT
  'ALLE TESTS GESLAAGD'                                              AS resultaat,
  (SELECT count(*) FROM public.plan_features)                        AS matrix_features,
  (SELECT count(*) FROM public.plan_limits)                          AS matrix_limieten,
  (SELECT count(*) FROM public.plan_modules)                         AS matrix_modules,
  (SELECT count(*) FROM public.companies)                            AS bedrijven,
  (SELECT count(*) FROM public.companies c
    WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.company_id = c.id))
                                                                     AS bedrijven_zonder_abonnement,
  (SELECT count(*) FROM public.plan_usage_events)                    AS ledger_rijen,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'plan\\_%')       AS plan_policies;

ROLLBACK;
`)

mkdirSync(dirname(UIT), { recursive: true })
writeFileSync(UIT, delen.join('\n'))
console.error(`\nGeschreven naar ${UIT}`)
