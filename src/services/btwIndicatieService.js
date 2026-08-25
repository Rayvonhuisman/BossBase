import { supabase } from '../lib/supabase'

// BTW-indicatie: berekend uit de eigen facturen en kosten in BossBase.
//
// Dit is NADRUKKELIJK geen aangifte. Wat er buiten BossBase om is geboekt —
// journaalposten van de boekhouder, correcties, suppleties — zit hier niet in.
// De rubrieken die we niet kunnen kennen worden expliciet als "onbekend"
// teruggegeven, zodat de UI ze kan tonen in plaats van weglaten; anders lijkt
// het overzicht compleet terwijl het dat niet is.
//
// Werkt zonder boekhoudkoppeling: iedereen heeft facturen en kosten.

// Rubrieken die we uit eigen data kunnen afleiden, en de rest.
export const RUBRIEKEN = [
  { code: '1a', label: 'Leveringen/diensten belast met hoog tarief', kanWij: true },
  { code: '1b', label: 'Leveringen/diensten belast met laag tarief', kanWij: true },
  { code: '1c', label: 'Leveringen/diensten belast met overige tarieven', kanWij: false },
  { code: '1d', label: 'Privégebruik', kanWij: false },
  { code: '1e', label: 'Leveringen/diensten met 0%, vrijgesteld of btw verlegd', kanWij: true },
  // 2a is de ONTVANGENDE kant: btw die naar jou is verlegd bij een inkoop.
  // Dat houden wij niet bij. Wat wij factureren met btw verlegd hoort in 1e —
  // zo staat het ook in SnelStart's eigen handleiding.
  { code: '2a', label: 'Btw verlegd naar u (bij inkoop)', kanWij: false },
  { code: '3a', label: 'Leveringen naar landen buiten de EU', kanWij: false },
  { code: '3b', label: 'Leveringen naar landen binnen de EU', kanWij: false },
  { code: '3c', label: 'Installatie/afstandsverkopen binnen de EU', kanWij: false },
  { code: '4a', label: 'Leveringen uit landen buiten de EU', kanWij: false },
  { code: '4b', label: 'Leveringen uit landen binnen de EU', kanWij: false },
  { code: '5b', label: 'Voorbelasting', kanWij: true },
]

const rond = n => Math.round((Number(n) || 0) * 100) / 100

// Regime van een factuurregel. Rijen van vóór de btw_regime-migratie hebben het
// veld niet; die leiden we af uit het percentage, net als elders in de app.
const regimeVan = r => {
  const opgeslagen = r.btw_regime
  if (['normaal', 'verlaagd', 'vrijgesteld', 'verlegd'].includes(opgeslagen)) return opgeslagen
  // Zonder regime (regels van vóór btw_regime): 0% valt terug op vrijgesteld,
  // de onschuldigste aanname.
  const pct = Number(r.btw_pct ?? 21)
  if (pct === 9) return 'verlaagd'
  if (pct === 0) return 'vrijgesteld'
  return 'normaal'
}

/**
 * Berekent de BTW-indicatie voor één periode.
 *
 * @param {object} opties
 *   start, eind  — ISO-datums (inclusief)
 *   stelsel      — 'factuur' (op factuurdatum) of 'kas' (op betaaldatum)
 */
export async function berekenBtwIndicatie({ start, eind, stelsel = 'factuur' }) {
  // Welke datum bepaalt de periode? Bij het kasstelsel telt een factuur pas mee
  // zodra hij betaald is — dus alleen betaalde facturen, op hun betaaldatum.
  const datumVeld = stelsel === 'kas' ? 'betaald_op' : 'factuurdatum'

  let factuurQ = supabase
    .from('facturen')
    .select('id, nummer, status, is_credit, factuurdatum, betaald_op, factuur_regels(btw_pct, btw_regime, regelprijs)')
    .gte(datumVeld, start)
    .lte(datumVeld, eind)

  factuurQ = stelsel === 'kas'
    ? factuurQ.eq('status', 'betaald')
    : factuurQ.in('status', ['verzonden', 'betaald'])

  const [{ data: facturen, error: fErr }, { data: kosten, error: kErr }, { data: concepten }] = await Promise.all([
    factuurQ,
    supabase
      .from('job_costs')
      .select('id, amount, btw_percentage, btw_inclusief, werkbon_materiaal_id')
      .gte('cost_date', start)
      .lte('cost_date', eind),
    // Concepten binnen de periode: die tellen niet mee, maar de gebruiker moet
    // weten dat ze er zijn — anders lijkt het bedrag te laag zonder reden.
    supabase
      .from('facturen')
      .select('id')
      .eq('status', 'concept')
      .gte('factuurdatum', start)
      .lte('factuurdatum', eind),
  ])
  if (fErr) throw fErr
  if (kErr) throw kErr

  let btw1a = 0, omzet1a = 0;
  let btw1b = 0, omzet1b = 0;
  let omzet1e = 0;

  for (const f of (facturen || [])) {
    // Een creditfactuur haalt af. De regelbedragen staan er al negatief in,
    // maar we rekenen met absolute waarden × teken zodat oude rijen met een
    // positief bedrag op een creditfactuur ook goed vallen.
    const teken = f.is_credit ? -1 : 1
    for (const r of (f.factuur_regels || [])) {
      const bedrag = Math.abs(Number(r.regelprijs) || 0) * teken
      const regime = regimeVan(r)
      if (regime === 'verlaagd') { omzet1b += bedrag; btw1b += bedrag * 0.09; }
      // Vrijgesteld én verlegd komen allebei in 1e: dat is de rubriek voor
      // leveringen die bij jou onbelast zijn. 2a is voor de ontvanger.
      else if (regime === 'verlegd' || regime === 'vrijgesteld') { omzet1e += bedrag; }
      else { omzet1a += bedrag; btw1a += bedrag * (Number(r.btw_pct ?? 21) / 100); }
    }
  }

  // Voorbelasting. Werkbonmateriaal telt NIET mee: die spiegelregels gaan ook
  // niet naar de boekhouding — de inkoopfactuur van de leverancier is daar de
  // kostenpost, en die staat er als aparte kostenregel in.
  let btw5b = 0;
  let kostenZonderBtw = 0;
  for (const k of (kosten || [])) {
    if (k.werkbon_materiaal_id) continue
    const pct = k.btw_percentage
    if (pct == null) { kostenZonderBtw++; continue }
    const bedrag = Math.abs(Number(k.amount) || 0)
    btw5b += k.btw_inclusief
      ? bedrag - bedrag / (1 + Number(pct) / 100)
      : bedrag * (Number(pct) / 100)
  }

  const teBetalen = rond(btw1a + btw1b - btw5b)

  return {
    stelsel,
    periode: { start, eind },
    rubrieken: {
      '1a': { omzet: rond(omzet1a), btw: rond(btw1a) },
      '1b': { omzet: rond(omzet1b), btw: rond(btw1b) },
      // Vrijgesteld en verlegd hebben geen btw-bedrag; alleen de omzet telt.
      '1e': { omzet: rond(omzet1e), btw: 0 },
      '5b': { omzet: null, btw: rond(btw5b) },
    },
    teBetalen,
    // Waar de indicatie incompleet kan zijn.
    waarschuwingen: [
      concepten?.length
        ? `${concepten.length} ${concepten.length === 1 ? 'conceptfactuur telt' : 'conceptfacturen tellen'} niet mee — verstuur ze of pas de datum aan.`
        : null,
      kostenZonderBtw
        ? `${kostenZonderBtw} ${kostenZonderBtw === 1 ? 'kostenpost heeft' : 'kostenposten hebben'} geen btw-percentage — die voorbelasting ontbreekt.`
        : null,
    ].filter(Boolean),
  }
}
