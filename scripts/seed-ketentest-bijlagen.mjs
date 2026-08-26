// Zet de bijlagen klaar voor de ketentest: een PDF per factuur en één bon bij
// een kostenpost.
//
// Waarom een apart script en niet in de seed-SQL: de bestanden zelf staan in de
// opslag, niet in de database. En de opmaak van een factuur zit in jsPDF, dus
// er valt server-side niets te genereren — de app schrijft die PDF weg vanuit de
// browser bij het versturen.
//
// Deze PDF's zijn daarom een NABOOTSING, niet de echte factuuropmaak. Voor de
// ketentest is dat genoeg: het gaat erom dat er een bestand van de juiste naam
// op het juiste pad staat, zodat de koppeling het als document aan de boeking
// kan hangen. Wil je de echte opmaak testen, verstuur de factuur dan vanuit
// BossBase — dan overschrijft de app deze kopie.
//
// Draaien:  node scripts/seed-ketentest-bijlagen.mjs
// Vereist:  .env.local met VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(r => r.includes('=') && !r.trim().startsWith('#'))
    .map(r => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim()]),
)

const COMPANY = '7e57c0de-0000-4000-a000-000000000002'
const KOST_MET_BON = '7e57c0de-0004-4000-a000-000000000001'

// Factuur-id → (nummer, omschrijving, bedragen). Dezelfde vaste id's als in
// seed-snelstart-ketentest.sql; het pad is {company_id}/{factuur_id}.pdf, want
// dat is waar pushFactuurPdf hem zoekt.
const FACTUREN = [
  { id: '7e57c0de-0003-4000-a000-000000000001', nummer: 'TF-001', regels: [['Werk 21%', 100, 21]] },
  { id: '7e57c0de-0003-4000-a000-000000000002', nummer: 'TF-002', regels: [['Werk 21%', 200, 21], ['Werk 9%', 100, 9], ['Werk vrijgesteld', 50, 0]] },
  { id: '7e57c0de-0003-4000-a000-000000000003', nummer: 'TF-003', regels: [['Onderaanneming (btw verlegd)', 300, 0]] },
  { id: '7e57c0de-0003-4000-a000-000000000004', nummer: 'TF-004', regels: [['Onderaanneming (btw verlegd)', 100, 0], ['Werk 21%', 100, 21]] },
  { id: '7e57c0de-0003-4000-a000-00000000000c', nummer: 'TC-001', regels: [['Creditering TF-001', -100, 21]] },
]

const euro = n => `EUR ${Number(n).toFixed(2)}`

function maakPdf({ nummer, regels }) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(nummer.startsWith('TC') ? 'CREDITFACTUUR' : 'FACTUUR', 20, 25)
  doc.setFontSize(11)
  doc.text(`Nummer: ${nummer}`, 20, 38)
  doc.text('TEST SnelStart BV — ketentest', 20, 46)

  let y = 62
  doc.setFontSize(10)
  for (const [oms, bedrag, pct] of regels) {
    doc.text(oms, 20, y)
    doc.text(`${pct}%`, 140, y, { align: 'right' })
    doc.text(euro(bedrag), 190, y, { align: 'right' })
    y += 8
  }

  const excl = regels.reduce((s, [, b]) => s + b, 0)
  const btw = regels.reduce((s, [, b, p]) => s + b * p / 100, 0)
  y += 6
  doc.text('Subtotaal excl. btw', 20, y); doc.text(euro(excl), 190, y, { align: 'right' }); y += 8
  doc.text('Btw', 20, y);                doc.text(euro(btw), 190, y, { align: 'right' });  y += 8
  doc.setFontSize(12)
  doc.text('Totaal incl. btw', 20, y);   doc.text(euro(excl + btw), 190, y, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}

function maakBon() {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('INKOOPBON', 20, 25)
  doc.setFontSize(11)
  doc.text('Test Leverancier Compleet', 20, 38)
  doc.text('Test materiaal met bon', 20, 46)
  doc.text('EUR 200,00 excl. btw — 21% btw EUR 42,00', 20, 54)
  doc.text('Totaal EUR 242,00', 20, 62)
  return Buffer.from(doc.output('arraybuffer'))
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const { error: loginErr } = await sb.auth.signInWithPassword({
  email: 'snelstart.test@bossbase.nl',
  password: 'SnelStartTest!2608',
})
if (loginErr) { console.error('Inloggen mislukt:', loginErr.message); process.exit(1) }

for (const f of FACTUREN) {
  const pad = `${COMPANY}/${f.id}.pdf`
  const { error } = await sb.storage.from('factuur-pdfs')
    .upload(pad, maakPdf(f), { contentType: 'application/pdf', upsert: true })
  console.log(error ? `✗ ${f.nummer}: ${error.message}` : `✓ ${f.nummer} → ${pad}`)
}

// Bon in de privébucket, en het pad in bijlage_url zodat de koppeling hem vindt.
// bijlage_url bevat een JSON-array met opslagpaden, geen URL.
const bonPad = `${COMPANY}/ketentest-bon.pdf`
const { error: bonErr } = await sb.storage.from('kosten-bijlagen')
  .upload(bonPad, maakBon(), { contentType: 'application/pdf', upsert: true })
if (bonErr) {
  console.log(`✗ bon: ${bonErr.message}`)
} else {
  const { error: updErr } = await sb.from('job_costs')
    .update({ bijlage_url: JSON.stringify([bonPad]), snelstart_bijlage_gesynct: false })
    .eq('id', KOST_MET_BON)
  console.log(updErr ? `✗ bon koppelen: ${updErr.message}` : `✓ bon → ${bonPad}`)
}
