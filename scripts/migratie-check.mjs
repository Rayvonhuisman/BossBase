#!/usr/bin/env node
// Controleert of de REST-API een tabel kent, en verhelpt een verouderde
// PostgREST-schema-cache als dat niet zo is.
//
//     npm run migratie:check -- werkbon_uren
//     npm run migratie:check -- accounting_sync_runs uursoorten
//
// WAAROM DIT BESTAAT
// PostgREST houdt een schema-cache. Staat een nieuwe tabel of kolom daar nog
// niet in, dan geeft de API een 404 op iets dat wél bestaat. De app lijkt stuk
// terwijl de database klopt — dat is drie keer in één week gebeurd, en het kost
// elke keer tijd voordat je doorhebt dat het de cache is en niet je code.
//
// Supabase's event trigger `pgrst_ddl_watch` stuurt bij DDL een NOTIFY, en elke
// migratie stuurt er zelf ook één (zie _TEMPLATE.sql). Beide vertrekken bij
// dezelfde commit. Hoort PostgREST ze op dát moment niet — verbroken listener,
// herstartende instantie — dan blijft de cache oud en helpt alleen een LATERE
// notify. Dit script is die latere notify, plus het bewijs dat hij is geland.
//
// Draai het direct na `supabase db push`.

import { execFileSync } from 'node:child_process'

const PROJECT_REF = 'mawzqpnsluljxpbarhng'
const BASE = `https://${PROJECT_REF}.supabase.co`
const POGINGEN = 6
const WACHT_MS = 4000

const tabellen = process.argv.slice(2).filter(a => !a.startsWith('-'))
if (!tabellen.length) {
  console.error('Geef minstens één tabelnaam mee, bijvoorbeeld:\n  npm run migratie:check -- werkbon_uren')
  process.exit(2)
}

function anonKey() {
  const uit = execFileSync('supabase', ['projects', 'api-keys', '--project-ref', PROJECT_REF], { encoding: 'utf8' })
  for (const regel of uit.split('\n')) {
    if (regel.trim().startsWith('anon')) return regel.split('|')[1].trim()
  }
  throw new Error('anon-key niet gevonden — ben je ingelogd met de Supabase CLI?')
}

function stuurNotify() {
  // Via de Management API, want psql is hier niet beschikbaar.
  execFileSync('supabase', ['db', 'query', '--linked', "notify pgrst, 'reload schema'"], { stdio: 'ignore' })
}

const wacht = ms => new Promise(r => setTimeout(r, ms))

async function bereikbaar(tabel, key) {
  const res = await fetch(`${BASE}/rest/v1/${tabel}?select=*&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  // 200 = bekend. 401/403 = bekend maar afgeschermd door RLS, ook goed: de
  // cache kent de tabel dan. 404 = niet in de cache.
  return res.status === 200 || res.status === 401 || res.status === 403
}

const key = anonKey()
let alleGoed = true

for (const tabel of tabellen) {
  let ok = false
  for (let poging = 1; poging <= POGINGEN; poging++) {
    ok = await bereikbaar(tabel, key)
    if (ok) {
      console.log(`✓ ${tabel} — bekend bij de API${poging > 1 ? ` (na ${poging} pogingen)` : ''}`)
      break
    }
    if (poging === 1) console.log(`… ${tabel} nog niet in de cache, notify sturen`)
    stuurNotify()
    await wacht(WACHT_MS)
  }
  if (!ok) {
    console.error(`✗ ${tabel} — na ${POGINGEN} pogingen nog steeds niet bekend bij de API.`)
    console.error('  Bestaat de tabel wel? Controleer met:')
    console.error(`    supabase db query --linked "select to_regclass('public.${tabel}')"`)
    alleGoed = false
  }
}

process.exit(alleGoed ? 0 : 1)
