// Zet de publicatiedatum van kennisbankartikelen die er nog geen hebben.
//
//   npm run publicatiedatum -- 2026-10-06
//
// Draai dit op de dag dat de artikelen live gaan, en commit het resultaat. Een
// artikel dat al een datum heeft, blijft ongemoeid: een build of een tweede
// run werkt nooit een datum bij. Een latere inhoudelijke wijziging leg je met de
// hand vast als "gewijzigd" in de kop van dat artikel.

import fs from 'node:fs';
import path from 'node:path';

const datum = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || '') || Number.isNaN(Date.parse(datum))) {
  console.error('Gebruik: npm run publicatiedatum -- JJJJ-MM-DD');
  process.exit(1);
}
const vandaag = new Date().toISOString().slice(0, 10);
if (datum < vandaag) {
  console.error(`${datum} ligt in het verleden (vandaag is ${vandaag}); dat zou artikelen terugdateren.`);
  process.exit(1);
}

const MAP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/content/kennisbank');
let gezet = 0;
for (const f of fs.readdirSync(MAP).filter(f => f.endsWith('.md'))) {
  const p = path.join(MAP, f);
  const bron = fs.readFileSync(p, 'utf8');
  const m = bron.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) throw new Error(`${f}: geen kop`);
  const kop = JSON.parse(m[1]);
  if (kop.gepubliceerd) continue;
  // Direct na "volgorde" invoegen, zodat de rest van het bestand gelijk blijft.
  const nieuw = bron.replace(/("volgorde":\s*\d+,)/, `$1\n  "gepubliceerd": "${datum}",`);
  if (nieuw === bron) throw new Error(`${f}: kon "volgorde" niet vinden`);
  JSON.parse(nieuw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)[1]);
  fs.writeFileSync(p, nieuw);
  gezet++;
}
console.log(`Publicatiedatum ${datum} gezet bij ${gezet} artikel(en).`);
