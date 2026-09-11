// Planning van een werkbon over meerdere dagen.
//
// De database kent alleen losse dagen (tabel werkbon_dagen): een werkbon staat
// op dag X als die dag in de lijst staat. Het formulier geeft twee manieren om
// die lijst te vullen — een periode (start t/m eind) en tikken in de kalender —
// en dit bestand vertaalt heen en terug. gepland_op op de werkbon is de vroegste
// dag en wordt door de database bijgehouden.
//
// Tijden: de werkbon heeft één standaardtijd die voor elke dag geldt. Een dag
// kan daarvan afwijken (starttijd/eindtijd op de dag zelf); leeg = standaard.
//
// Ploeg: standaard werkt de hele ploeg van de werkbon (assigned_to_ids) elke
// dag. Een dag kan een eigen dagploeg hebben (medewerker_ids): altijd een deel
// van de ploeg, en leeg betekent niemand. NULL = de hele ploeg.

export const MAX_DAGEN = 60;

const DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MAAND_LANG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

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

/** "september 2026" — maand is 0-based, zoals bij Date. */
export const maandNaam = (jaar, maand) => `${MAAND_LANG[maand]} ${jaar}`;

// ── Lezen ────────────────────────────────────────────────────────────────────

/**
 * De dagen van een werkbon, gesorteerd. Een werkbon zonder dagenlijst (demo-
 * data, of de database heeft de tabel nog niet) valt terug op gepland_op.
 */
export function werkbonDagen(w) {
  if (Array.isArray(w?.dagen) && w.dagen.length) return w.dagen;
  return w?.geplandOp
    ? [{ id: null, datum: w.geplandOp, starttijd: null, eindtijd: null, medewerkerIds: null }]
    : [];
}

export const staatOpDag = (w, iso) => werkbonDagen(w).some(d => d.datum === iso);

/** Tijden die op die dag gelden: de afwijking van de dag, anders de standaard. */
export const tijdenOpDag = (w, dag) => ({
  starttijd: tijd(dag?.starttijd) || tijd(w?.starttijd) || null,
  eindtijd: tijd(dag?.eindtijd) || tijd(w?.eindtijd) || null,
});

/** Wie er die dag werkt: de dagploeg als die er is, anders de hele ploeg. */
export const ploegOpDag = (w, dag) =>
  (Array.isArray(dag?.medewerkerIds) ? dag.medewerkerIds : (w?.assignedToIds || []));

/**
 * Staat deze medewerker op die datum op de werkbon? Zonder uid: staat de
 * werkbon die dag gepland. De oude enkele assigned_to telt mee zolang er geen
 * dagploeg is (werkbonnen van vóór assigned_to_ids).
 */
export const staatOpDagVoor = (w, iso, uid) =>
  werkbonDagen(w).some(d => d.datum === iso && (
    !uid
    || ploegOpDag(w, d).includes(uid)
    || (!Array.isArray(d.medewerkerIds) && w?.assignedTo === uid)
  ));

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
// Formulierstaat:
//   startdatum, einddatum, weekend  — de periode (einddatum en weekend optioneel)
//   uit    [iso]                    — dagen binnen de periode die er toch niet bij horen
//   extra  [iso]                    — dagen buiten de periode die er wél bij horen
//   afwijkend { iso: { starttijd, eindtijd } }
//   ploeg     { iso: [profielId] }  — alleen voor dagen met een eigen dagploeg

export const legePlanning = (startdatum = '') => ({
  startdatum, einddatum: '', weekend: false, extra: [], uit: [], afwijkend: {}, ploeg: {},
});

/** De dagen van de periode: start, en t/m eind alleen ma–vr tenzij weekend. */
export function periodeDatums(p) {
  if (!p?.startdatum) return [];
  const lijst = [p.startdatum];
  if (!p.einddatum || p.einddatum <= p.startdatum || kalenderdagen(p.startdatum, p.einddatum) > MAX_DAGEN) return lijst;
  for (let d = plusDagen(p.startdatum, 1); d <= p.einddatum; d = plusDagen(d, 1)) {
    if (p.weekend || !isWeekend(d)) lijst.push(d);
  }
  return lijst;
}

/**
 * Alle geplande datums: de periode min de weggetikte dagen, plus de losse dagen.
 * De startdatum hoort er altijd bij — die heb je zelf gekozen, ook op een
 * zaterdag.
 */
export function geplandeDatums(p) {
  if (!p?.startdatum) return [];
  const uit = new Set(p.uit || []);
  const set = new Set(periodeDatums(p).filter(d => d === p.startdatum || !uit.has(d)));
  for (const d of p.extra || []) if (d && d > p.startdatum) set.add(d);
  return [...set].sort();
}

/**
 * Een dag in de kalender aan- of uittikken. Binnen de periode wordt hij
 * "uit", daarbuiten een losse dag. Zonder startdatum wordt de eerste tik de
 * startdatum; de startdatum zelf wissel je in het datumveld, niet hier.
 */
export function wisselDag(p, iso) {
  if (!p.startdatum) return { ...p, startdatum: iso };
  if (iso <= p.startdatum) return p;
  const extra = new Set(p.extra || []);
  const uit = new Set(p.uit || []);
  const inPeriode = periodeDatums(p).includes(iso);
  if (geplandeDatums(p).includes(iso)) {
    extra.delete(iso);
    if (inPeriode) uit.add(iso);
  } else {
    uit.delete(iso);
    if (!inPeriode) extra.add(iso);
  }
  return { ...p, extra: [...extra].sort(), uit: [...uit].sort() };
}

/** Nieuwe startdatum. Wat daarvoor ligt, valt weg; een einddatum die er niet meer na ligt ook. */
export function zetStartdatum(p, v) {
  return {
    ...p,
    startdatum: v,
    einddatum: p.einddatum && v && p.einddatum <= v ? '' : p.einddatum,
    extra: (p.extra || []).filter(d => !v || d > v),
    uit: (p.uit || []).filter(d => !v || d > v),
  };
}

/**
 * Terugvertalen van opgeslagen dagen naar het formulier. Past alles binnen één
 * periode van hooguit 60 dagen, dan wordt het de periode van de eerste t/m de
 * laatste dag en worden de gaten "uit". Anders: startdatum plus losse dagen.
 * De kalender toont daarna precies wat er opgeslagen was.
 */
export function planningUitWerkbon(w) {
  const dagen = werkbonDagen(w);
  if (!dagen.length) return legePlanning();
  const datums = dagen.map(d => d.datum);
  const start = datums[0];
  const laatste = datums[datums.length - 1];
  const afwijkend = {};
  const ploeg = {};
  for (const d of dagen) {
    if (d.starttijd || d.eindtijd) afwijkend[d.datum] = { starttijd: tijd(d.starttijd), eindtijd: tijd(d.eindtijd) };
    if (Array.isArray(d.medewerkerIds)) ploeg[d.datum] = d.medewerkerIds;
  }
  if (datums.length === 1) return { ...legePlanning(start), afwijkend, ploeg };
  if (kalenderdagen(start, laatste) > MAX_DAGEN) {
    return { ...legePlanning(start), extra: datums.slice(1), afwijkend, ploeg };
  }
  const weekend = datums.slice(1).some(isWeekend);
  const set = new Set(datums);
  const periode = periodeDatums({ startdatum: start, einddatum: laatste, weekend });
  return {
    startdatum: start, einddatum: laatste, weekend,
    extra: [], uit: periode.filter(d => !set.has(d)),
    afwijkend, ploeg,
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

const zelfdeSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/**
 * De dagenlijst die naar de database gaat:
 * [{ datum, starttijd, eindtijd, medewerker_ids }].
 *
 * `ploegIds` is de huidige ploeg van de werkbon. Een dagploeg wordt daartegen
 * bijgesneden (wie van de ploeg af is, valt eruit), en is hij weer de hele
 * ploeg, dan gaat hij als NULL mee — zo werkt iemand die later bij de ploeg
 * komt vanzelf ook op die dag mee. Bij één dag geldt alleen de werkbon zelf:
 * geen afwijkende tijd en geen dagploeg.
 */
export function dagenUitPlanning(p, ploegIds = null) {
  const datums = geplandeDatums(p);
  const eenDag = datums.length === 1;
  const team = Array.isArray(ploegIds) ? ploegIds.filter(Boolean) : null;
  return datums.map(datum => {
    let medewerker_ids = null;
    const eigen = p.ploeg?.[datum];
    if (!eenDag && team && Array.isArray(eigen)) {
      const binnen = eigen.filter(id => team.includes(id));
      medewerker_ids = zelfdeSet(binnen, team) ? null : binnen;
    }
    return {
      datum,
      starttijd: (!eenDag && p.afwijkend?.[datum]?.starttijd) || null,
      eindtijd: (!eenDag && p.afwijkend?.[datum]?.eindtijd) || null,
      medewerker_ids,
    };
  });
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
  const aantal = geplandeDatums(p).length;
  if (aantal > MAX_DAGEN) {
    return `Een werkbon kan maximaal ${MAX_DAGEN} dagen hebben; dit zijn er ${aantal}. Verdeel de klus over meerdere werkbonnen.`;
  }
  return '';
}
