// Planning van een werkbon over meerdere dagen.
//
// De database kent alleen losse dagen (tabel werkbon_dagen): een werkbon staat
// op dag X als die dag in de lijst staat. In het formulier kies je die dagen in
// een kalender — tik aan, tik uit. gepland_op op de werkbon is de vroegste dag
// en wordt door de database bijgehouden.
//
// Tijden: de werkbon heeft één standaardtijd die voor elke dag geldt. Een dag
// kan daarvan afwijken (starttijd/eindtijd op de dag zelf); leeg = standaard.
// Een geplande dag heeft altijd een tijd: zonder starttijd tekent de planning
// geen blok, en dan zou de dag stil uit beeld vallen.
//
// Ploeg: standaard werkt de hele ploeg van de werkbon (assigned_to_ids) elke
// dag. Een dag kan een eigen dagploeg hebben (medewerker_ids): altijd een deel
// van de ploeg, en leeg betekent niemand. NULL = de hele ploeg.

export const MAX_DAGEN = 60;

/** Wat er klaarstaat zodra je de eerste dag aantikt en er nog geen tijd is. */
export const STANDAARD_TIJD = { starttijd: '08:00', eindtijd: '16:30' };

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
//   dagen     [iso]                      — de aangetikte dagen
//   afwijkend { iso: { starttijd, eindtijd } }
//   ploeg     { iso: [profielId] }       — alleen voor dagen met een eigen dagploeg

export const legePlanning = (dag = '') => ({ dagen: dag ? [dag] : [], afwijkend: {}, ploeg: {} });

/** De gekozen dagen, gesorteerd en zonder dubbelen. */
export const geplandeDatums = p => [...new Set(p?.dagen || [])].filter(Boolean).sort();

/** Een dag in de kalender aan- of uittikken. */
export function wisselDag(p, iso) {
  const set = new Set(p.dagen || []);
  if (set.has(iso)) set.delete(iso);
  else set.add(iso);
  return { ...p, dagen: [...set].sort() };
}

/**
 * Zonder planningsmodule: de klus begint op deze dag. Eén dag wordt gewoon die
 * dag; een bestaande meerdaagse bon schuift in zijn geheel mee — precies wat de
 * database doet als alleen gepland_op verandert.
 */
export function verplaatsNaar(p, iso) {
  const huidig = geplandeDatums(p);
  if (huidig.length <= 1) return { ...p, dagen: [iso] };
  const verschil = Math.round((naarDate(iso) - naarDate(huidig[0])) / 86400000);
  return { ...p, dagen: huidig.map(d => plusDagen(d, verschil)) };
}

/** Terugvertalen van opgeslagen dagen naar het formulier. */
export function planningUitWerkbon(w) {
  const dagen = werkbonDagen(w);
  const afwijkend = {};
  const ploeg = {};
  for (const d of dagen) {
    if (d.starttijd || d.eindtijd) afwijkend[d.datum] = { starttijd: tijd(d.starttijd), eindtijd: tijd(d.eindtijd) };
    if (Array.isArray(d.medewerkerIds)) ploeg[d.datum] = d.medewerkerIds;
  }
  return { dagen: dagen.map(d => d.datum), afwijkend, ploeg };
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

/**
 * Foutmelding voor het formulier, of '' als alles klopt. Een geplande dag moet
 * een tijd hebben: zonder starttijd tekent de planning geen blok.
 */
export function controleerPlanning(p, { starttijd, eindtijd } = {}) {
  const datums = geplandeDatums(p);
  if (datums.length > MAX_DAGEN) {
    return `Een werkbon kan maximaal ${MAX_DAGEN} dagen hebben; dit zijn er ${datums.length}. Verdeel de klus over meerdere werkbonnen.`;
  }
  if (!datums.length) return '';
  const start = tijd(starttijd);
  const eind = tijd(eindtijd);
  if (!start || !eind) return 'Vul een begin- en eindtijd in. Een dag zonder tijd verschijnt niet in de planning.';
  if (eind <= start) return 'De eindtijd moet na de begintijd liggen.';
  if (datums.length > 1) {
    for (const d of datums) {
      const af = p.afwijkend?.[d];
      if (!af) continue;
      const s = tijd(af.starttijd);
      const e = tijd(af.eindtijd);
      if (!s || !e) return `Vul voor ${korteDatum(d)} een begin- en eindtijd in, of zet hem terug op de standaardtijd.`;
      if (e <= s) return `Op ${korteDatum(d)} moet de eindtijd na de begintijd liggen.`;
    }
  }
  return '';
}
