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

// Twee droogloopsets. Zonder argument de volledige abonnementsmatrix; met
// `readonly` alleen de read-only-migratie plus zijn eigen tests. Die tweede is
// bewust apart: de matrix-droogloop draait migraties die allang in productie
// staan, en dat maakt de uitvoer onnodig lang wanneer je één nieuwe migratie
// wilt controleren.
const SET = process.argv[2] || 'matrix'

const MIGRATIE = 'supabase/migrations/20260728120000_plan_matrix.sql'
const UPGRADE  = 'supabase/migrations/20260728121000_upgrade_requests.sql'
const FALLBACK = 'supabase/migrations/20260728150000_plan_matrix_fallback.sql'
const PROVISION= 'supabase/migrations/20260728160000_provision_account_subscription.sql'
const BILLING  = 'supabase/migrations/20260730120000_stripe_billing.sql'
const HOSTING  = 'supabase/migrations/20260730121000_plan_matrix_hosting.sql'
const WELKOM   = 'supabase/migrations/20260730130000_welkomstactie.sql'
const JAARVERPL= 'supabase/migrations/20260731120000_jaarverplichting.sql'
const STOPTOP  = 'supabase/migrations/20260731130000_stopt_op.sql'
const READONLY = 'supabase/migrations/20260803120000_readonly.sql'
const TEST     = 'supabase/tests/plan_matrix_test.sql'
const TEST_BIL = 'supabase/tests/billing_test.sql'
const TEST_RO  = 'supabase/tests/readonly_test.sql'

const SETS = {
  matrix: {
    uit: 'supabase/tests/_dryrun_plan_matrix.sql',
    delen: [[MIGRATIE, 'migratie'], [UPGRADE, 'upgrade_requests'], [FALLBACK, 'fallback'],
            [PROVISION, 'provision_account'], [BILLING, 'stripe_billing'],
            [HOSTING, 'plan_matrix_hosting'], [WELKOM, 'welkomstactie'],
            [TEST, 'tests'], [TEST_BIL, 'billing_tests']],
  },
  readonly: {
    uit: 'supabase/tests/_dryrun_readonly.sql',
    delen: [[JAARVERPL, 'jaarverplichting'], [STOPTOP, 'stopt_op'],
            [READONLY, 'readonly'], [TEST_RO, 'readonly_tests']],
    // De Management API geeft alleen het laatste resultaat terug, dus de
    // volledige uitslag komt als rijen uit de tabel die de tests hebben gevuld.
    slot: `SELECT nr, naam, CASE WHEN geslaagd THEN 'PASS' ELSE 'FAIL' END AS uitslag, detail
FROM ro_resultaat ORDER BY nr;`,
  },
}

if (!SETS[SET]) {
  console.error(`Onbekende set "${SET}". Kies uit: ${Object.keys(SETS).join(', ')}`)
  process.exit(1)
}
const UIT = SETS[SET].uit

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
-- ${UIT.split('/').pop()} — GEGENEREERD, niet met de hand bewerken.
--   node scripts/build-dry-run.mjs ${SET}
--
-- Draait de migratie én de tests in ÉÉN transactie die eindigt op ROLLBACK.
-- Er wijzigt niets permanent. Alle interne BEGIN/COMMIT zijn eruit gehaald,
-- anders zou de migratie halverwege alsnog wegschrijven.
--
-- Draaien:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ${UIT}
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

console.error(`Droogloop bouwen (set: ${SET}):`)
for (const [pad, naam] of SETS[SET].delen) {
  delen.push(`\n-- ======================= ${naam} (${pad}) =======================\n`)
  delen.push(stripTransacties(readFileSync(pad, 'utf8'), naam))
}

delen.push(`
DO $droogloop$ BEGIN RAISE NOTICE '=== DROOGLOOP KLAAR — alles wordt teruggedraaid ==='; END $droogloop$;

-- Bevestiging als RIJEN, niet als NOTICE: de Management API geeft NOTICE- en
-- WARNING-regels niet terug — en ze toont alleen het LAATSTE resultaat. Zonder
-- dit zou "geen foutmelding" het enige signaal zijn, en dat is precies hoe een
-- gefaalde test ongemerkt groen kleurt.
${SETS[SET].slot ?? `SELECT
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
    WHERE schemaname = 'public' AND policyname LIKE 'plan\\_%')       AS plan_policies,
  (SELECT count(*) FROM pg_policies
    WHERE policyname LIKE 'readonly\\_%')                            AS readonly_policies;`}

ROLLBACK;
`)

mkdirSync(dirname(UIT), { recursive: true })
writeFileSync(UIT, delen.join('\n'))
console.error(`\nGeschreven naar ${UIT}`)
