// Planning van een werkbon over meerdere dagen.
//
// De database kent alleen losse dagen (tabel werkbon_dagen): een werkbon staat
// op dag X als die dag in de lijst staat. "Periode" en "extra losse dagen" zijn
// alleen twee manieren om die lijst in te vullen; dit bestand vertaalt heen en
// terug. gepland_op op de werkbon is de vroegste dag en wordt door de database
// bijgehouden.
//
// Tijden: de werkbon heeft één standaardtijd die voor elke dag geldt. Een dag
// kan daarvan afwijken (starttijd/eindtijd op de dag zelf); leeg = standaard.

export const MAX_DAGEN = 60;

const DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// Rekenen op 12:00 lokale tijd: dan kan een zomer-/wintertijdwissel de dag
// nooit laten verspringen.
const naarDate = iso => new Date(`${iso}T12:00:00`);
const pad = n => String(n).padStart(2, '0');
const naarIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tijd = t => (t ? String(t).slice(0, 5) : '');

export function plusDagen(iso, n) {
  const d = naarDate(iso);
  d.setDate(d.getDate() + n);
  return naarIso(d);
}

export const isWeekend = iso => [0, 6].includes(naarDate(iso).getDay());

/** Aantal kalenderdagen van a t/m b (inclusief beide). */
export const kalenderdagen = (a, b) =>
  Math.round((naarDate(b) - naarDate(a)) / 86400000) + 1;

/** "ma 3 nov" */
export function korteDatum(iso) {
  if (!iso) return '';
  const d = naarDate(iso);
  if (Number.isNaN(d.valueOf())) return iso;
  return `${DAG_KORT[d.getDay()]} ${d.getDate()} ${MAAND_KORT[d.getMonth()]}`;
}

// ── Lezen ────────────────────────────────────────────────────────────────────

/**
 * De dagen van een werkbon, gesorteerd. Een werkbon zonder dagenlijst (demo-
 * data, of de database heeft de tabel nog niet) valt terug op gepland_op.
 */
export function werkbonDagen(w) {
  if (Array.isArray(w?.dagen) && w.dagen.length) return w.dagen;
  return w?.geplandOp ? [{ id: null, datum: w.geplandOp, starttijd: null, eindtijd: null }] : [];
}

export const staatOpDag = (w, iso) => werkbonDagen(w).some(d => d.datum === iso);

/** Tijden die op die dag gelden: de afwijking van de dag, anders de standaard. */
export const tijdenOpDag = (w, dag) => ({
  starttijd: tijd(dag?.starttijd) || tijd(w?.starttijd) || null,
  eindtijd: tijd(dag?.eindtijd) || tijd(w?.eindtijd) || null,
});

/**
 * Ingepland = minstens één dag met een starttijd. Zelfde definitie als de
 * planning altijd had (datum én starttijd), maar dan per dag.
 */
export const isIngepland = w => werkbonDagen(w).some(d => tijdenOpDag(w, d).starttijd);

/** "ma 3 nov" of "ma 3 nov – vr 7 nov · 5 dagen" */
export function planningLabel(w) {
  const dagen = werkbonDagen(w);
  if (!dagen.length) return '';
  if (dagen.length === 1) return korteDatum(dagen[0].datum);
  return `${korteDatum(dagen[0].datum)} – ${korteDatum(dagen[dagen.length - 1].datum)} · ${dagen.length} dagen`;
}

// ── Formulier ────────────────────────────────────────────────────────────────
// Formulierstaat: { startdatum, einddatum, weekend, extra: [iso], afwijkend: { iso: { starttijd, eindtijd } } }

export const legePlanning = (startdatum = '') => ({
  startdatum, einddatum: '', weekend: false, extra: [], afwijkend: {},
});

// De langste aaneengesloten reeks vanaf de eerste dag. Zonder weekend slaat de
// reeks za/zo over (vr → ma telt als aansluitend).
function reeksVanaf(start, set, metWeekend) {
  const reeks = [start];
  let cur = start;
  for (;;) {
    let volgende = plusDagen(cur, 1);
    if (!metWeekend) while (isWeekend(volgende)) volgende = plusDagen(volgende, 1);
    if (!set.has(volgende)) return reeks;
    reeks.push(volgende);
    cur = volgende;
  }
}

/**
 * Terugvertalen van opgeslagen dagen naar het formulier. De langste
 * aaneengesloten reeks vanaf de startdatum wordt de periode, de rest wordt
 * "extra dag". Wat je invulde komt zo terug zoals je het invulde.
 */
export function planningUitWerkbon(w) {
  const dagen = werkbonDagen(w);
  if (!dagen.length) return legePlanning();
  const set = new Set(dagen.map(d => d.datum));
  const start = dagen[0].datum;
  const zonder = reeksVanaf(start, set, false);
  const met = reeksVanaf(start, set, true);
  const reeks = met.length > zonder.length ? met : zonder;
  const inReeks = new Set(reeks);
  const afwijkend = {};
  for (const d of dagen) {
    if (d.starttijd || d.eindtijd) afwijkend[d.datum] = { starttijd: tijd(d.starttijd), eindtijd: tijd(d.eindtijd) };
  }
  return {
    startdatum: start,
    einddatum: reeks.length > 1 ? reeks[reeks.length - 1] : '',
    weekend: met.length > zonder.length,
    extra: dagen.map(d => d.datum).filter(d => !inReeks.has(d)),
    afwijkend,
  };
}

/** Bevat de periode (zonder de startdag zelf) een za of zo? Dan pas tonen we het vinkje. */
export function periodeHeeftWeekend(p) {
  if (!p.startdatum || !p.einddatum || p.einddatum <= p.startdatum) return false;
  if (kalenderdagen(p.startdatum, p.einddatum) > MAX_DAGEN) return false;
  for (let d = plusDagen(p.startdatum, 1); d <= p.einddatum; d = plusDagen(d, 1)) {
    if (isWeekend(d)) return true;
  }
  return false;
}

/**
 * De dagenlijst die naar de database gaat: [{ datum, starttijd, eindtijd }].
 * De startdatum telt altijd mee — ook op een zaterdag, want die heb je zelf
 * gekozen. De rest van de periode alleen op ma–vr, tenzij "ook za/zo" aan staat.
 */
export function dagenUitPlanning(p) {
  if (!p?.startdatum) return [];
  const datums = new Set([p.startdatum]);
  if (p.einddatum && p.einddatum > p.startdatum && kalenderdagen(p.startdatum, p.einddatum) <= MAX_DAGEN) {
    for (let d = plusDagen(p.startdatum, 1); d <= p.einddatum; d = plusDagen(d, 1)) {
      if (p.weekend || !isWeekend(d)) datums.add(d);
    }
  }
  for (const d of p.extra || []) if (d) datums.add(d);
  // Bij één dag ís de standaardtijd de tijd; een achtergebleven afwijking van
  // toen het er meer waren, telt dan niet meer.
  const eenDag = datums.size === 1;
  return [...datums].sort().map(datum => ({
    datum,
    starttijd: (!eenDag && p.afwijkend?.[datum]?.starttijd) || null,
    eindtijd: (!eenDag && p.afwijkend?.[datum]?.eindtijd) || null,
  }));
}

/** Foutmelding voor het formulier, of '' als alles klopt. */
export function controleerPlanning(p) {
  if (!p) return '';
  if (!p.startdatum && (p.einddatum || (p.extra || []).length)) {
    return 'Kies eerst een startdatum. Een einddatum of extra dag kan niet zonder.';
  }
  if (p.einddatum && p.einddatum < p.startdatum) {
    return 'De einddatum ligt vóór de startdatum.';
  }
  if (p.einddatum) {
    const n = kalenderdagen(p.startdatum, p.einddatum);
    if (n > MAX_DAGEN) {
      return `Een periode mag maximaal ${MAX_DAGEN} dagen beslaan; ${korteDatum(p.startdatum)} t/m ${korteDatum(p.einddatum)} is ${n} dagen. Kies een eerdere einddatum, of verdeel de klus over meerdere werkbonnen.`;
    }
  }
  if ((p.extra || []).some(d => d < p.startdatum)) {
    return 'Een extra dag ligt vóór de startdatum. Maak die dag de startdatum.';
  }
  const aantal = dagenUitPlanning(p).length;
  if (aantal > MAX_DAGEN) {
    return `Een werkbon kan maximaal ${MAX_DAGEN} dagen hebben; dit zijn er ${aantal}. Verdeel de klus over meerdere werkbonnen.`;
  }
  return '';
}
