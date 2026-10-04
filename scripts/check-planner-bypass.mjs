#!/usr/bin/env node
// Statische controle: geeft de code ergens toegang op de ROLNAAM planner?
//
//     npm run security:static
//
// Het model (20261002200000): een planner heeft uitsluitend wat expliciet is
// toegekend. bb_has_permission() en de policies dwingen dat af; deze controle
// bewaakt dat de frontend en de Edge Functions er niet stilletjes weer een
// rolcontrole naast zetten, en dat geen nieuwe migratie de bypass terugbrengt.
//
// Wat telt als treffer: de rol planner in een vergelijking of in een lijst met
// admin. Commentaar telt niet. Weergave van de rol (badge, keuzelijst) staat op
// de lijst met uitzonderingen hieronder, met de reden erbij.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

const UITZONDERINGEN = [
  // Laat zien welke rol iemand heeft en biedt hem alleen aan wie hem al heeft.
  { bestand: 'src/pages/TeamPage.jsx', reden: 'weergave van de rol, geen toegang' },
  // Demodata: een verzonnen team.
  { bestand: 'src/demo/', reden: 'demodata' },
]

const PATRONEN = [
  /role\s*(===|==|!==|!=)\s*['"]planner['"]/,
  /['"]planner['"]\s*(===|==)\s*[\w.?]*role/,
  /\[[^\]]*['"]admin['"][^\]]*['"]planner['"][^\]]*\]/,
  /\[[^\]]*['"]planner['"][^\]]*['"]admin['"][^\]]*\]/,
]
// In SQL: een rolcontrole die planner doorlaat.
const SQL_PATRONEN = [
  /role\s+in\s*\([^)]*'planner'[^)]*\)/i,
  /any\s*\(\s*array\s*\[[^\]]*'planner'/i,
  /role\s*=\s*'planner'/i,
]

function* bestanden(dir) {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules' || naam.startsWith('.')) continue
    const pad = join(dir, naam)
    if (statSync(pad).isDirectory()) yield* bestanden(pad)
    else yield pad
  }
}

const zonderCommentaar = (regel, sql) =>
  sql ? regel.replace(/--.*$/, '') : regel.replace(/\/\/.*$/, '').replace(/\{?\/\*.*?\*\/\}?/g, '')

const treffers = []
for (const [dir, ext, patronen, sql] of [
  ['src', /\.(js|jsx|ts|tsx)$/, PATRONEN, false],
  ['supabase/functions', /\.(ts|js)$/, PATRONEN, false],
]) {
  for (const pad of bestanden(join(ROOT, dir))) {
    const rel = relative(ROOT, pad)
    if (!ext.test(rel)) continue
    if (UITZONDERINGEN.some(u => rel.startsWith(u.bestand))) continue
    readFileSync(pad, 'utf8').split('\n').forEach((regel, i) => {
      const kaal = zonderCommentaar(regel, sql)
      if (patronen.some(p => p.test(kaal))) treffers.push(`${rel}:${i + 1}  ${regel.trim().slice(0, 120)}`)
    })
  }
}

// Migraties: alleen wat NA de fix komt. Oudere migraties bevatten de bypass
// uiteraard; die zijn geschiedenis en worden door 20261002200000 overschreven.
// De migratie zelf valt erbuiten: de ene `where p.role = 'planner'` daarin
// zoekt bestaande planners op om ze het recht planning te geven.
const FIX = '20261004200000'
for (const naam of readdirSync(join(ROOT, 'supabase/migrations')).sort()) {
  const versie = naam.split('_')[0]
  if (!/^\d+$/.test(versie) || versie <= FIX || !naam.endsWith('.sql')) continue
  readFileSync(join(ROOT, 'supabase/migrations', naam), 'utf8').split('\n').forEach((regel, i) => {
    const kaal = zonderCommentaar(regel, true)
    if (SQL_PATRONEN.some(p => p.test(kaal))) treffers.push(`supabase/migrations/${naam}:${i + 1}  ${regel.trim().slice(0, 120)}`)
  })
}

if (treffers.length) {
  console.error(`Rolcontrole op planner gevonden (${treffers.length}):\n`)
  for (const t of treffers) console.error('  ' + t)
  console.error('\nGebruik een recht: can()/magBewerken() in de frontend, bb_has_permission() in SQL.')
  process.exit(1)
}
console.log('Geen rolcontrole op planner in src/, supabase/functions/ of migraties na ' + FIX + '.')
