#!/usr/bin/env node
// Vergelijkt de live database met wat er in git staat, en stopt met een
// exitcode als er iets is weggelopen.
//
//     npm run db:drift                   tegen het gekoppelde project (read-only)
//     npm run db:drift:local             tegen de lokale Supabase-database
//     npm run db:drift -- --verbose      toont ook wat er wél klopt
//
// De lokale variant geeft --db-url mee. Die vlag accepteert UITSLUITEND
// localhost of 127.0.0.1; elke andere host wordt geweigerd met exitcode 2,
// voordat er ook maar één query vertrekt. In lokale modus vervalt de
// ledger-vergelijking (een baselinedatabase heeft die historie per definitie
// niet) en komt er een cutoff-controle voor in de plaats.
//
// WAAROM DIT BESTAAT
// Twee keer eerder liep de werkelijkheid weg van de repository zonder dat
// iemand het merkte:
//
//   1. Migratie 20260907210753 (urenregistratie_werkbon_koppeling) stond in
//      productie en in geen enkele branch. Ontdekt bij toeval, tijdens een
//      audit, ruim een dag later.
//   2. Elf kerntabellen — companies, profiles, customers, deals, activities,
//      calendar_events, facturen, factuur_regels, pipeline_stages, job_costs
//      en notes — zijn nooit door een migratie aangemaakt. `supabase db push`
//      merkt daar niets van, want die kijkt alleen naar de migratielijst en
//      niet naar het schema zelf.
//
// Van allebei geldt hetzelfde: er was geen enkel signaal. Dit script is dat
// signaal. Draai het na elke `supabase db push`, en in elk geval wekelijks.
//
// WAT HET DOET
//   A. migratieversies    live-ledger  vs  supabase/migrations/*.sql
//                         (lokale modus: cutoff-controle in plaats hiervan)
//   B. schema-objecten    live-catalogus vs supabase/baseline/*.sql
//   C. RLS                staat hij nog aan op elke tenanttabel?
//   D. baseline-hygiëne   staat er geen DML in het baselinebestand?
//   E. planconfiguratie   is de feature-matrix gevuld? (alleen lokale modus)
//
// WAT HET NIET DOET — en niet mag gaan doen
//   Geen `db push`, geen `migration repair`, geen DDL, geen enkele write.
//   Het leest uitsluitend catalogusinformatie en aantallen; geen rij uit een
//   klanttabel komt dit script binnen. Er wordt geen sleutel of secret gelezen
//   of geprint.
//
// EXITCODES
//   0  geen drift
//   1  drift gevonden (details in de uitvoer)
//   2  het script kon zijn werk niet doen (CLI ontbreekt, baseline weg, ...)

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const VERBOSE = process.argv.includes('--verbose')
const MIGRATIEMAP = 'supabase/migrations'
const BASELINEMAP = 'supabase/baseline'

// ── Doeldatabase ─────────────────────────────────────────────────────────────
// Zonder --db-url praat dit script met het gekoppelde project (read-only).
// Mét --db-url praat het met een opgegeven database, en dan MOET die lokaal
// zijn. Die eis is hard en staat hier vooraan, niet ergens halverwege: een
// typefout in een URL mag nooit betekenen dat een testrun tegen productie gaat.
const LOKALE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

function doelDatabase() {
  const i = process.argv.indexOf('--db-url')
  if (i < 0) return { lokaal: false, args: ['--linked'], omschrijving: 'gekoppeld project (read-only)' }

  const url = process.argv[i + 1]
  if (!url) {
    console.error('--db-url zonder waarde.')
    process.exit(2)
  }

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
    console.error('db:drift:local draait uitsluitend tegen localhost of 127.0.0.1.')
    console.error('Wil je het gekoppelde project controleren, gebruik dan `npm run db:drift` zonder --db-url.')
    process.exit(2)
  }

  return { lokaal: true, args: ['--db-url', url], omschrijving: `lokaal ${host}:${port}` }
}

const DOEL = doelDatabase()

// Tabellen die per definitie multi-tenant zijn. Verliest één van deze zijn RLS,
// dan staat de administratie van elk bedrijf open voor elk ander bedrijf. Dat is
// geen "waarschuwing" maar een storing.
const TENANTTABELLEN = [
  'companies', 'profiles', 'user_permissions', 'company_members',
  'customers', 'deals', 'pipeline_stages', 'activities', 'calendar_events',
  'offertes', 'offerte_items', 'facturen', 'factuur_regels',
  'werkbonnen', 'werkbon_taken', 'werkbon_materialen', 'werkbon_uren',
  'werkbon_notities', 'werkbon_fotos', 'urenregistratie', 'projects',
  'notifications', 'klant_tijdlijn', 'notes', 'job_costs', 'sent_emails',
  'email_templates', 'materialen', 'leveranciers', 'subscriptions',
  'boss_conversations',
]

const bevindingen = []
const meld = (ernst, onderwerp, tekst) => bevindingen.push({ ernst, onderwerp, tekst })

// ── Live lezen ───────────────────────────────────────────────────────────────
// Eén route naar de database, en die is read-only: de Management API via het
// CLI-token. Geen psql, geen Docker, geen wachtwoord op schijf. Zie CLAUDE.md.
function query(sql) {
  let uit
  try {
    uit = execFileSync('supabase', ['db', 'query', ...DOEL.args, sql], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    })
  } catch (e) {
    console.error(DOEL.lokaal
      ? 'Kon de lokale database niet bevragen. Draait `supabase start`?'
      : 'Kon de database niet bevragen. Ben je ingelogd met de Supabase CLI en is het project gekoppeld?')
    console.error(String(e.stderr || e.message).split('\n')[0])
    process.exit(2)
  }
  // De CLI zet er soms een regel voor ("Initialising login role...") en een
  // update-melding achter. Pak het JSON-blok, niet de rest.
  const start = uit.indexOf('{')
  const eind = uit.lastIndexOf('}')
  if (start < 0 || eind < start) {
    console.error('Onverwacht antwoord van de database (geen JSON).')
    process.exit(2)
  }
  return JSON.parse(uit.slice(start, eind + 1)).rows ?? []
}

// ── A. Migratieversies ───────────────────────────────────────────────────────
function migratiebestanden() {
  const lokaal = new Map()
  for (const f of readdirSync(MIGRATIEMAP)) {
    const m = /^(\d+)_(.+)\.sql$/.exec(f)
    if (m) lokaal.set(m[1], m[2])
    // .sql.pending wordt bewust overgeslagen door db push (zie CLAUDE.md) en
    // hoort dus ook hier niet als drift te tellen.
  }
  return lokaal
}

// In lokale modus is de ledger-vergelijking zinloos: een baselinedatabase is
// juist gebouwd ZONDER de migratiehistorie af te spelen. Wat daar wél telt is de
// cutoff-afspraak uit docs/DATABASE_BASELINE_STRATEGY.md: de baseline is de foto
// tot en met een bepaalde migratieversie, en alles daarna moet er los overheen.
// Staat er een migratiebestand dat nieuwer is dan de cutoff, dan is de
// baselinedatabase per definitie niet compleet.
function checkCutoff(cutoff) {
  const lokaal = migratiebestanden()
  const naCutoff = [...lokaal.keys()].filter(v => v > cutoff).sort()
  for (const v of naCutoff) {
    meld('fout', 'cutoff', `${v} (${lokaal.get(v)}) is nieuwer dan de baseline-cutoff ${cutoff} en moet apart op de baselinedatabase worden gedraaid.`)
  }
  return { lokaal: lokaal.size, cutoff, naCutoff: naCutoff.length }
}

function checkMigraties() {
  const live = new Map(query(
    "select version, name from supabase_migrations.schema_migrations order by version"
  ).map(r => [r.version, r.name]))

  const lokaal = migratiebestanden()

  for (const [v, naam] of live) {
    if (!lokaal.has(v)) {
      meld('fout', 'migratie', `${v} (${naam}) staat live maar niet in ${MIGRATIEMAP}/. Haal hem op uit de ledger voordat iemand een herbouw probeert.`)
    }
  }
  for (const [v, naam] of lokaal) {
    if (!live.has(v)) {
      meld('let-op', 'migratie', `${v} (${naam}) staat lokaal maar is niet live toegepast — openstaande migratie, of hij is nooit gepusht.`)
    }
  }
  // Naamverschillen zijn cosmetisch: de ledger bewaart de naam van toen, en een
  // hernoemd bestand verandert daar niets aan. Wel melden, niet als fout.
  for (const [v, naam] of lokaal) {
    if (live.has(v) && live.get(v) !== naam) {
      meld('info', 'migratie', `${v}: bestand heet "${naam}", ledger zegt "${live.get(v)}".`)
    }
  }
  return { live: live.size, lokaal: lokaal.size }
}

// ── B. Schema-objecten tegen de baseline ─────────────────────────────────────
function baselinePad() {
  if (!existsSync(BASELINEMAP)) return null
  const kandidaten = readdirSync(BASELINEMAP).filter(f => /^live_public_schema_\d+\.sql$/.test(f)).sort()
  return kandidaten.length ? join(BASELINEMAP, kandidaten[kandidaten.length - 1]) : null
}

// Namen kunnen bare of "gequote" zijn (een policy als
// "company members can manage klant_tijdlijn" heeft spaties).
const NAAM = '(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
const kaal = s => s.replace(/^"|"$/g, '')

// De functiesignatures komen uit de `-- @signature`-markers die de baseline
// meekrijgt, NIET uit de CREATE-regel. Dat is een bewuste keuze:
// pg_get_functiondef() zet DEFAULT-waarden in de argumentenlijst (twaalf
// functies hier hebben die) en breekt soms af over meerdere regels, terwijl
// pg_get_function_identity_arguments() precies levert wat een functie uniek
// maakt. Vergelijken op de CREATE-regel zou dus vals alarm geven, en vergelijken
// op alleen de naam — wat dit script eerst deed — is juist te grof: er zijn
// twaalf overloaded functies (121 signatures op 109 namen), en het verdwijnen
// van één signature bleef daardoor onzichtbaar.
function uitBaseline(tekst) {
  const alle = (re, groep = 1) =>
    new Set([...tekst.matchAll(re)].map(m => kaal(m[groep])))
  const signatures = alle(/^-- @signature (.+)$/gm)
  return {
    heeftMarkers: signatures.size > 0,
    functies:  signatures,
    functienamen: new Set([...signatures].map(s => s.slice(0, s.indexOf('(')))),
    tabellen:  alle(new RegExp(`^CREATE TABLE IF NOT EXISTS public\\.(${NAAM}) \\(`, 'gm')),
    indexen:   alle(new RegExp(`^CREATE (?:UNIQUE )?INDEX (${NAAM}) ON `, 'gm')),
    triggers:  new Set([...tekst.matchAll(new RegExp(`^CREATE (?:CONSTRAINT )?TRIGGER (${NAAM})[\\s\\S]*?ON public\\.(${NAAM})`, 'gm'))]
                 .map(m => `${kaal(m[2])}.${kaal(m[1])}`)),
    policies:  new Set([...tekst.matchAll(new RegExp(`^CREATE POLICY (${NAAM}) ON public\\.(${NAAM})`, 'gm'))]
                 .map(m => `${kaal(m[2])}.${kaal(m[1])}`)),
    fks:       alle(new RegExp(`^ALTER TABLE public\\.${NAAM} ADD CONSTRAINT (${NAAM}) FOREIGN KEY`, 'gm')),
    rls:       alle(new RegExp(`^ALTER TABLE public\\.(${NAAM}) ENABLE ROW LEVEL SECURITY;`, 'gm')),
  }
}

function uitLive() {
  const s = rows => new Set(rows.map(r => r.naam))
  const signatures = s(query(
    "select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as naam " +
    "from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'"
  ))
  return {
    functies: signatures,
    functienamen: new Set([...signatures].map(x => x.slice(0, x.indexOf('(')))),
    tabellen: s(query("select c.relname as naam from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")),
    indexen:  s(query("select i.indexname as naam from pg_indexes i join pg_class c on c.relname=i.indexname join pg_namespace n on n.oid=c.relnamespace and n.nspname=i.schemaname where i.schemaname='public' and not exists (select 1 from pg_constraint k where k.conindid=c.oid)")),
    triggers: s(query("select c.relname||'.'||t.tgname as naam from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal")),
    policies: s(query("select tablename||'.'||policyname as naam from pg_policies where schemaname='public'")),
    fks:      s(query("select c.conname as naam from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and c.contype='f'")),
    rls:      s(query("select c.relname as naam from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")),
  }
}

function vergelijk(soort, base, live, ernstNieuw = 'fout') {
  const nieuwLive = [...live].filter(x => !base.has(x)).sort()
  const wegLive = [...base].filter(x => !live.has(x)).sort()
  for (const x of nieuwLive) {
    meld(ernstNieuw, soort, `live heeft "${x}", de baseline niet — schema gewijzigd zonder de baseline bij te werken.`)
  }
  for (const x of wegLive) {
    meld('let-op', soort, `de baseline heeft "${x}", live niet (meer) — verwijderd, hernoemd, of de baseline is verouderd.`)
  }
  return { gelijk: nieuwLive.length === 0 && wegLive.length === 0, base: base.size, live: live.size }
}

// ── D. Baseline-hygiëne ──────────────────────────────────────────────────────
// Splitst op top-level puntkomma's en respecteert $tag$-blokken en '-strings.
// Zonder die splitsing valt elke plpgsql-functie met een INSERT erin ten
// onrechte door de mand.
function splitsStatements(s) {
  const uit = []
  let buf = '', i = 0, dollar = null
  while (i < s.length) {
    if (dollar) {
      if (s.startsWith(dollar, i)) { buf += dollar; i += dollar.length; dollar = null; continue }
      buf += s[i++]; continue
    }
    if (s[i] === "'") {
      let j = i + 1
      while (j < s.length) {
        if (s[j] === "'") { if (s[j + 1] === "'") { j += 2; continue } break }
        j++
      }
      buf += s.slice(i, j + 1); i = j + 1; continue
    }
    if (s.startsWith('--', i)) {
      let j = s.indexOf('\n', i); if (j < 0) j = s.length
      buf += s.slice(i, j); i = j; continue
    }
    const d = /^\$[A-Za-z_0-9]*\$/.exec(s.slice(i))
    if (d) { dollar = d[0]; buf += dollar; i += dollar.length; continue }
    if (s[i] === ';') { uit.push(buf); buf = ''; i++; continue }
    buf += s[i++]
  }
  if (buf.trim()) uit.push(buf)
  return uit
}

const TOEGESTAAN = [
  'CREATE EXTENSION', 'CREATE TYPE', 'CREATE SEQUENCE', 'CREATE TABLE', 'ALTER TABLE',
  'CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION', 'CREATE OR REPLACE VIEW',
  'CREATE MATERIALIZED VIEW', 'CREATE INDEX', 'CREATE UNIQUE INDEX', 'CREATE TRIGGER',
  'CREATE POLICY', 'GRANT', 'REVOKE', 'COMMENT ON',
  // SET hoort erbij: de baseline zet check_function_bodies uit tijdens het
  // laden (zie de toelichting in het baselinebestand zelf). Een sessie-
  // instelling is geen data en geen onbekend commando.
  'SET ',
]

function checkBaselineHygiene(tekst) {
  let aantal = 0
  for (const st of splitsStatements(tekst)) {
    const k = st.replace(/--[^\n]*/g, '').split(/\s+/).join(' ').trim().toUpperCase()
    if (!k) continue
    aantal++
    if (!TOEGESTAAN.some(t => k.startsWith(t))) {
      meld('fout', 'baseline', `statement begint met iets anders dan DDL: "${k.slice(0, 70)}…". Een baseline hoort geen data of onbekende commando's te bevatten.`)
    }
  }
  return aantal
}

// ── Uitvoeren ────────────────────────────────────────────────────────────────
console.log(`Driftcontrole BossBase — alleen-lezen — doel: ${DOEL.omschrijving}\n`)

const bpad = baselinePad()
if (!bpad) {
  meld('fout', 'baseline', `geen baselinebestand gevonden in ${BASELINEMAP}/. Zonder baseline is schemadrift niet te zien.`)
} else {
  const tekst = readFileSync(bpad, 'utf8')

  if (DOEL.lokaal) {
    const m = /^--\s+Peilmoment\s+:\s+(\d+)/m.exec(tekst)
    if (!m) {
      meld('fout', 'cutoff', 'de baseline vermeldt geen peilmoment; de cutoff is dan niet te controleren.')
    } else {
      const c = checkCutoff(m[1])
      console.log(`  ${'cutoff'.padEnd(18)} baseline ${c.cutoff}   migraties erna: ${c.naCutoff}`)
    }
  } else {
    const mig = checkMigraties()
    console.log(`  ${'migraties'.padEnd(18)} lokaal   ${String(mig.lokaal).padStart(3)}   live  ${String(mig.live).padStart(3)}`)
  }
  const base = uitBaseline(tekst)
  const live = uitLive()

  // Een baseline zonder @signature-markers is van vóór 10-09-2026. Dan kán de
  // functievergelijking niet kloppen, en dat mag niet stil gebeuren.
  if (!base.heeftMarkers) {
    meld('fout', 'baseline', 'geen `-- @signature`-markers gevonden. Deze baseline is te oud om functies op signature te vergelijken; regenereer hem.')
  }

  const LABEL = { functies: 'functiesignatures', fks: 'foreign keys', rls: 'rls-status' }
  const soorten = ['tabellen', 'functies', 'indexen', 'triggers', 'policies', 'fks', 'rls']
  for (const soort of soorten) {
    const r = vergelijk(soort, base[soort], live[soort])
    const naam = LABEL[soort] ?? soort
    console.log(`  ${naam.padEnd(18)} baseline ${String(r.base).padStart(4)}   live ${String(r.live).padStart(4)}   ${r.gelijk ? 'gelijk' : 'AFWIJKING'}`)
    // Bij de functies ook de naamtelling erbij, zodat het verschil tussen
    // signatures en namen zichtbaar blijft en niemand zich er nog op verkijkt.
    if (soort === 'functies') {
      const bn = base.functienamen.size, ln = live.functienamen.size
      console.log(`  ${'  waarvan namen'.padEnd(18)} baseline ${String(bn).padStart(4)}   live ${String(ln).padStart(4)}   `
        + `${bn === ln ? 'gelijk' : 'AFWIJKING'}   (${live.functies.size - ln} overload${live.functies.size - ln === 1 ? '' : 's'})`)
      if (bn !== ln) meld('fout', 'functies', `aantal unieke functienamen loopt uiteen: baseline ${bn}, live ${ln}.`)
    }
  }

  // C. RLS op de tenanttabellen. Apart van de baselinevergelijking: ook als de
  // baseline is bijgewerkt mag dit nooit verdwijnen.
  const zonderRls = TENANTTABELLEN.filter(t => live.tabellen.has(t) && !live.rls.has(t))
  for (const t of zonderRls) {
    meld('fout', 'rls', `${t} heeft GEEN row level security. Elke ingelogde gebruiker kan de rijen van elk bedrijf lezen.`)
  }
  const onbekend = TENANTTABELLEN.filter(t => !live.tabellen.has(t))
  for (const t of onbekend) meld('let-op', 'rls', `tenanttabel ${t} bestaat niet (meer) live — pas de lijst in dit script aan.`)
  console.log(`  ${'rls-tenantcheck'.padEnd(18)} ${TENANTTABELLEN.length - onbekend.length} tenanttabellen gecontroleerd    ${zonderRls.length ? 'AFWIJKING' : 'gelijk'}`)

  // E. Planconfiguratie. Alleen zinvol op een lokale baselinedatabase: daar is de
  // matrix niet meegekomen met het schema, en een lege matrix zet via de
  // veiligheidsklep in bb_has_feature() stilletjes elke feature open — inclusief
  // gedeelde_werkruimte, die de rechtencontrole in vier policies buitenspel zet.
  // Dat heeft op 15-09-2026 een testrun laten meten wat er niet was.
  if (DOEL.lokaal) {
    const rijen = query('select count(*)::int as n from public.plan_features')[0]?.n ?? 0
    const gw = query("select coalesce(string_agg(plan, ', ' order by plan), '(geen)') as p from public.plan_features where feature = 'gedeelde_werkruimte'")[0]?.p
    console.log(`  ${'planconfiguratie'.padEnd(18)} plan_features ${String(rijen).padStart(3)} rijen        ${rijen === 0 ? 'LEEG' : 'gevuld'}`)
    if (rijen === 0) {
      meld('fout', 'planconfiguratie', 'plan_features is leeg. Elke feature staat daardoor aan (veiligheidsklep in bb_has_feature) en RLS-tests meten niets. Draai `npm run db:seed:local`.')
    } else {
      console.log(`  ${'  gedeelde_werkruimte'.padEnd(18)} zit op: ${gw}`)
    }
  }

  const n = checkBaselineHygiene(tekst)
  console.log(`  ${'baseline-hygiene'.padEnd(18)} ${n} statements${' '.repeat(Math.max(0, 15 - String(n).length))}${bevindingen.some(b => b.onderwerp === 'baseline') ? 'AFWIJKING' : 'alleen DDL'}`)
  console.log(`\n  baseline: ${bpad}`)
}

// ── Rapport ──────────────────────────────────────────────────────────────────
const fouten = bevindingen.filter(b => b.ernst === 'fout')
const letop = bevindingen.filter(b => b.ernst === 'let-op')
const info = bevindingen.filter(b => b.ernst === 'info')

console.log()
if (!bevindingen.length) {
  console.log('GEEN DRIFT — live, git en baseline lopen gelijk.')
  process.exit(0)
}
for (const [label, lijst] of [['FOUT', fouten], ['LET OP', letop], ['INFO', info]]) {
  if (!lijst.length) continue
  console.log(`${label} (${lijst.length})`)
  for (const b of lijst) console.log(`  [${b.onderwerp}] ${b.tekst}`)
  console.log()
}
if (!fouten.length && !letop.length && VERBOSE === false && info.length) {
  console.log('Alleen informatieve punten; geen actie nodig.')
}
process.exit(fouten.length || letop.length ? 1 : 0)
