#!/usr/bin/env node
// Genereert het seed-SQL voor de feature-/limietmatrix uit src/lib/features.js.
// De JS-matrix is de bron; de database krijgt exact dezelfde waarden, zodat de
// server-side afdwinging nooit uit de pas kan lopen met de UI.
//
//   node scripts/gen-plan-matrix.mjs            → SQL naar stdout
//   node scripts/gen-plan-matrix.mjs -o out.sql → SQL naar bestand
//
// Wijzig je de matrix, plak de output dan in een NIEUWE migratie (de seed is
// idempotent: hij wist en herschrijft de drie plan_*-tabellen in één transactie).

import { writeFileSync } from 'node:fs'
import { TIER_IDS } from '../src/lib/tiers.js'
import {
  FEATURES, TIER_FEATURES, MODULES, MODULE_TIERS, LIMIT_DEFS, TIER_LIMITS,
} from '../src/lib/features.js'

const q = s => `'${String(s).replace(/'/g, "''")}'`
const n = v => (v == null ? 'NULL' : String(v))

const lines = []
const w = s => lines.push(s)

w('-- GEGENEREERD door scripts/gen-plan-matrix.mjs — niet met de hand bewerken.')
w('-- Bron: src/lib/features.js')
w('BEGIN;')
w('')

w('DELETE FROM public.plan_feature_defs;')
w('INSERT INTO public.plan_feature_defs (feature, label, uitleg, intern) VALUES')
w(FEATURES.map(f => `  (${q(f.key)}, ${q(f.label)}, ${q(f.uitleg)}, ${f.intern ? 'true' : 'false'})`).join(',\n') + ';')
w('')

w('DELETE FROM public.plan_features;')
w('INSERT INTO public.plan_features (plan, feature) VALUES')
w(
  TIER_IDS.flatMap(t => (TIER_FEATURES[t] || []).map(f => `  (${q(t)}, ${q(f)})`)).join(',\n') + ';'
)
w('')

w('DELETE FROM public.plan_limits;')
w('INSERT INTO public.plan_limits (plan, limit_key, limit_value, telwijze) VALUES')
w(
  TIER_IDS.flatMap(t =>
    LIMIT_DEFS.map(l => `  (${q(t)}, ${q(l.key)}, ${n(TIER_LIMITS[t]?.[l.key] ?? null)}, ${q(l.telwijze)})`)
  ).join(',\n') + ';'
)
w('')

w('DELETE FROM public.plan_modules;')
w('INSERT INTO public.plan_modules (module_key, label, feature, price, vereist) VALUES')
w(
  MODULES.map(m => `  (${q(m.key)}, ${q(m.label)}, ${q(m.feature)}, ${n(m.price)}, ${m.vereist ? q(m.vereist) : 'NULL'})`).join(',\n') + ';'
)
w('')

w('DELETE FROM public.plan_module_tiers;')
w('INSERT INTO public.plan_module_tiers (plan, module_key) VALUES')
w(
  MODULE_TIERS.flatMap(t => MODULES.map(m => `  (${q(t)}, ${q(m.key)})`)).join(',\n') + ';'
)
w('')
w('COMMIT;')

const sql = lines.join('\n') + '\n'
const outIdx = process.argv.indexOf('-o')
if (outIdx > -1 && process.argv[outIdx + 1]) {
  writeFileSync(process.argv[outIdx + 1], sql)
  console.error(`geschreven naar ${process.argv[outIdx + 1]}`)
} else {
  process.stdout.write(sql)
}
