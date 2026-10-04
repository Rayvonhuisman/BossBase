#!/usr/bin/env node
// Vult de planconfiguratie van een LOKALE database.
//
//     npm run db:seed:local
//     node scripts/db-seed-config.mjs --db-url postgresql://…@127.0.0.1:54322/postgres
//
// WAAROM DIT BESTAAT
// De schema-baseline (supabase/baseline/) bevat geen enkele rij — dat is opzet:
// er hoort geen klantdata in. Maar vijf tabellen daarin zijn géén klantdata maar
// CONFIGURATIE, en het rechtenmodel hangt ervan af:
//
//     plan_feature_defs   welke features bestaan, en welke intern zijn
//     plan_features       welk pakket welke feature heeft
//     plan_limits         de limieten per pakket
//     plan_modules        de losse modules
//     plan_module_tiers   bij welk pakket een module te koop is
//
// Staat plan_features leeg, dan slaat de veiligheidsklep in bb_has_feature() aan:
//
//     NOT bb_plan_geconfigureerd(company) AND NOT <feature is intern>   →  true
//
// en staat ELKE feature aan. Inclusief `gedeelde_werkruimte`, die in de
// RLS-policies van werkbonnen, activities, calendar_events en projects de hele
// rechtencontrole buitenspel zet: iedereen binnen het bedrijf ziet dan alles.
//
// Dat is op 15-09-2026 echt gebeurd. De securitytests draaiden op een verse
// baselinedatabase en een medewerker "zag" de werkbon van zijn collega. Geen bug
// in de policy — een lege configuratietabel. De tests hadden grotendeels groen
// kunnen kleuren zonder iets te meten.
//
// BRON VAN WAARHEID
// src/lib/tiers.js (pakketnamen en prijzen) en src/lib/features.js (welke
// features en limieten bij welk pakket horen). Dezelfde bestanden die de UI
// gebruikt. Dit script roept scripts/gen-plan-matrix.mjs aan — de generator die
// er al was en die de productie-migraties ook heeft gevoed — zodat er geen
// tweede lijst ontstaat die uit de pas kan lopen.
//
// EIGENSCHAPPEN
//   deterministisch   dezelfde bron levert dezelfde rijen; geen willekeur,
//                     geen tijdstempels, geen volgnummers
//   herhaalbaar       de seed wist en herschrijft de vijf tabellen; twee keer
//                     draaien geeft exact dezelfde eindtoestand
//   atomair           alles gaat als één DO-blok naar de database, dus er is
//                     geen moment waarop plan_features half gevuld is
//   alleen lokaal     elke niet-lokale host wordt geweigerd vóór er iets vertrekt
//
// WAT HET NIET DOET
// Geen klantdata, geen bedrijven, geen gebruikers, geen abonnementen. Alleen de
// vijf plan_*-tabellen hierboven.

import { execFileSync } from 'node:child_process'

const LOKALE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

function doelDatabase() {
  const i = process.argv.indexOf('--db-url')
  if (i < 0 || !process.argv[i + 1]) {
    console.error('Geef de doeldatabase op met --db-url.')
    console.error('Deze seed draait uitsluitend lokaal; er is met opzet geen terugval op --linked.')
    process.exit(2)
  }
  const url = process.argv[i + 1]
  let host, port
  try {
    const u = new URL(url)
    host = u.hostname
    port = u.port || '5432'
  } catch {
    console.error('--db-url is geen geldige URL.')
    process.exit(2)
  }
  if (!LOKALE_HOSTS.has(host)) {
    // Bewust geen URL in de melding: daar staat een wachtwoord in.
    console.error(`GEWEIGERD: host "${host}" is niet lokaal.`)
    console.error('Deze seed schrijft in de database en draait daarom uitsluitend tegen localhost of 127.0.0.1.')
    process.exit(2)
  }
  return { url, host, port }
}

const DOEL = doelDatabase()

// ── De matrix ophalen bij de bestaande generator ─────────────────────────────
let matrixSql
try {
  matrixSql = execFileSync('node', ['scripts/gen-plan-matrix.mjs'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (e) {
  console.error('scripts/gen-plan-matrix.mjs gaf een fout:')
  console.error(String(e.stderr || e.message).split('\n').slice(0, 5).join('\n'))
  process.exit(2)
}

// De generator levert commentaar, BEGIN/COMMIT en tien DELETE/INSERT-statements.
// Die gaan hier in één DO-blok: `supabase db query` stuurt de tekst als één
// prepared statement en accepteert er daarom maar één — en een DO-blok is er
// één, én meteen atomair.
const body = matrixSql
  .split('\n')
  .filter(r => !/^\s*--/.test(r))
  .filter(r => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(r))
  .join('\n')
  .trim()

const statements = (body.match(/;/g) || []).length
if (statements < 10) {
  console.error(`De generator leverde maar ${statements} statements; verwacht er minstens tien. Gestopt.`)
  process.exit(2)
}

// $seed$ als tag, niet $$: de gegenereerde SQL bevat labels en teksten waarin een
// losse $$ ooit kan opduiken, en dan valt het blok stil middenin.
const doBlok = `DO $seed$\nBEGIN\n${body}\nEND\n$seed$;`

// ── Toepassen ────────────────────────────────────────────────────────────────
console.log(`Planconfiguratie seeden — doel: lokaal ${DOEL.host}:${DOEL.port}`)
console.log(`  bron:       src/lib/tiers.js + src/lib/features.js (via scripts/gen-plan-matrix.mjs)`)
console.log(`  statements: ${statements}, als één atomair DO-blok`)

const query = sql => {
  try {
    return execFileSync('supabase', ['db', 'query', '--db-url', DOEL.url, sql], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    })
  } catch (e) {
    console.error('\nDe database gaf een fout:')
    console.error(String(e.stderr || e.stdout || e.message).split('\n').slice(0, 8).join('\n'))
    process.exit(1)
  }
}

query(doBlok)

// ── Controleren ──────────────────────────────────────────────────────────────
// Niet "geen foutmelding, dus gelukt" — natellen. Een seed die stilletjes
// niets doet is precies het probleem dat dit script moet oplossen.
const uit = query(`
  select json_build_object(
    'plan_feature_defs', (select count(*) from public.plan_feature_defs),
    'plan_features',     (select count(*) from public.plan_features),
    'plan_limits',       (select count(*) from public.plan_limits),
    'plan_modules',      (select count(*) from public.plan_modules),
    'plan_module_tiers', (select count(*) from public.plan_module_tiers),
    'gedeelde_werkruimte_plannen',
      (select coalesce(string_agg(plan, ', ' order by plan), '(geen)')
         from public.plan_features where feature = 'gedeelde_werkruimte')
  ) as telling`)

const i = uit.indexOf('{')
const telling = JSON.parse(uit.slice(i, uit.lastIndexOf('}') + 1)).rows[0].telling

console.log('')
let leeg = false
for (const [tabel, n] of Object.entries(telling)) {
  if (tabel === 'gedeelde_werkruimte_plannen') continue
  console.log(`  ${tabel.padEnd(20)} ${String(n).padStart(4)} rijen`)
  if (n === 0) leeg = true
}
console.log(`\n  gedeelde_werkruimte zit op: ${telling.gedeelde_werkruimte_plannen}`)

if (leeg) {
  console.error('\nEen van de plan-tabellen is nog steeds leeg. De seed heeft niet gedaan wat hij moest doen.')
  process.exit(1)
}

console.log('\nPlanconfiguratie staat. Elk pakket krijgt nu de features die erbij horen,')
console.log('en de veiligheidsklep in bb_has_feature() staat niet meer alles open.')
