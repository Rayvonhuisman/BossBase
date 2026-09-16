// Planning van een werkbon over meerdere dagen.
//
// De database kent alleen losse dagen (tabel werkbon_dagen): een werkbon staat
// op dag X als die dag in de lijst staat. In het formulier kies je die dagen in
// een kalender — tik aan, tik uit. gepland_op op de werkbon is de vroegste dag
// en wordt door de database bijgehouden.
//
// Tijden: in het formulier heeft elke dag zijn eigen begin- en eindtijd. Een
// nieuwe dag neemt de tijd van de dag ervoor over. In de database blijft het
// zoals het was: de tijd van de eerste dag is de tijd van de werkbon
// (starttijd/eindtijd), en een andere dag slaat alleen een tijd op als die
// afwijkt. Een geplande dag heeft altijd een tijd: zonder starttijd tekent de
// planning geen blok, en dan zou de dag stil uit beeld vallen.
//
// Ploeg: standaard werkt de hele ploeg van de werkbon (assigned_to_ids) elke
// dag. Een dag kan een eigen dagploeg hebben (medewerker_ids): altijd een deel
// van de ploeg, en leeg betekent niemand. NULL = de hele ploeg.
//
// Tijd per persoon: iemand kan op een dag een eigen tijd hebben
// (medewerker_tijden), bijv. de een 08:00–12:00 en de ander 13:00–17:00. De
// tijd van iemand is: zijn eigen tijd op die dag → de tijd van die dag → de
// tijd van de werkbon. Alleen wie afwijkt staat erin.

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
    ? [{ id: null, datum: w.geplandOp, starttijd: null, eindtijd: null, medewerkerIds: null, medewerkerTijden: null }]
    : [];
}

export const staatOpDag = (w, iso) => werkbonDagen(w).some(d => d.datum === iso);

/** Tijden die op die dag gelden: de tijd van de dag, anders die van de werkbon. */
export const tijdenOpDag = (w, dag) => ({
  starttijd: tijd(dag?.starttijd) || tijd(w?.starttijd) || null,
  eindtijd: tijd(dag?.eindtijd) || tijd(w?.eindtijd) || null,
});

/** Wie er die dag werkt: de dagploeg als die er is, anders de hele ploeg. */
export const ploegOpDag = (w, dag) =>
  (Array.isArray(dag?.medewerkerIds) ? dag.medewerkerIds : (w?.assignedToIds || []));

/** De tijd van één persoon op een dag: zijn eigen tijd → de tijd van de dag → die van de werkbon. */
export function tijdenVoorPersoon(w, dag, pid) {
  const eigen = pid ? dag?.medewerkerTijden?.[pid] : null;
  if (eigen && tijd(eigen.starttijd)) return { starttijd: tijd(eigen.starttijd), eindtijd: tijd(eigen.eindtijd) || null };
  return tijdenOpDag(w, dag);
}

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
//   dagen          [iso]                      — de aangetikte dagen
//   tijden         { iso: { starttijd, eindtijd } } — de tijd per dag; ontbreekt een
//                  dag, dan geldt de tijd van de werkbon (starttijd/eindtijd)
//   ploeg          { iso: [profielId] }       — alleen voor dagen met een eigen dagploeg
//   persoonTijden  { iso: { profielId: { starttijd, eindtijd } } } — alleen wie afwijkt

export const legePlanning = (dag = '') => ({ dagen: dag ? [dag] : [], tijden: {}, ploeg: {}, persoonTijden: {} });

/** De gekozen dagen, gesorteerd en zonder dubbelen. */
export const geplandeDatums = p => [...new Set(p?.dagen || [])].filter(Boolean).sort();

/**
 * De tijd die in het formulier bij een dag staat. Heeft de dag nog geen eigen
 * regel, dan de tijd van de werkbon (`standaard`). Een regel met een leeg veld
 * blijft leeg — dan moet de controle het zien.
 */
export function tijdVanDag(p, iso, standaard = {}) {
  const t = p?.tijden?.[iso];
  return t
    ? { starttijd: tijd(t.starttijd), eindtijd: tijd(t.eindtijd) }
    : { starttijd: tijd(standaard.starttijd), eindtijd: tijd(standaard.eindtijd) };
}

/**
 * Een dag in de kalender aan- of uittikken. Een nieuwe dag neemt de tijd over
 * van de dag ervoor (of, als die er niet is, van de eerstvolgende): wie een
 * reeks gelijke dagen aantikt, vult de tijd maar één keer in.
 */
export function wisselDag(p, iso, standaard = {}) {
  const set = new Set(p.dagen || []);
  const tijden = { ...(p.tijden || {}) };
  if (set.has(iso)) {
    set.delete(iso);
    delete tijden[iso];
  } else {
    const gesorteerd = [...set].sort();
    const bron = gesorteerd.filter(d => d < iso).pop() || gesorteerd.find(d => d > iso);
    tijden[iso] = bron
      ? tijdVanDag(p, bron, standaard)
      : { starttijd: tijd(standaard.starttijd) || STANDAARD_TIJD.starttijd, eindtijd: tijd(standaard.eindtijd) || STANDAARD_TIJD.eindtijd };
    set.add(iso);
  }
  return { ...p, dagen: [...set].sort(), tijden };
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
  return {
    ...p,
    dagen: huidig.map(d => plusDagen(d, verschil)),
    tijden: Object.fromEntries(Object.entries(p.tijden || {}).map(([d, t]) => [plusDagen(d, verschil), t])),
  };
}

/** Terugvertalen van opgeslagen dagen naar het formulier: elke dag met zijn eigen tijd. */
export function planningUitWerkbon(w) {
  const dagen = werkbonDagen(w);
  const tijden = {};
  const ploeg = {};
  const persoonTijden = {};
  for (const d of dagen) {
    tijden[d.datum] = { starttijd: tijd(d.starttijd) || tijd(w?.starttijd), eindtijd: tijd(d.eindtijd) || tijd(w?.eindtijd) };
    if (Array.isArray(d.medewerkerIds)) ploeg[d.datum] = d.medewerkerIds;
    if (d.medewerkerTijden && Object.keys(d.medewerkerTijden).length) {
      persoonTijden[d.datum] = Object.fromEntries(Object.entries(d.medewerkerTijden)
        .map(([pid, t]) => [pid, { starttijd: tijd(t?.starttijd), eindtijd: tijd(t?.eindtijd) }]));
    }
  }
  return { dagen: dagen.map(d => d.datum), tijden, ploeg, persoonTijden };
}

/**
 * Eén blok in de planning op een nieuwe tijd zetten. Geeft terug wat er naar de
 * database moet: `dagen` (voor zetWerkbonDagen) en `standaard` (de tijd van de
 * werkbon zelf, die gelijk is aan die van de eerste dag).
 *
 * Met `pid`: alleen die persoon op die dag krijgt een eigen tijd. De rest van
 * de ploeg en de andere dagen blijven staan — een blok verslepen mag nooit
 * ongemerkt de hele ploeg verzetten. Komt de nieuwe tijd weer gelijk aan die
 * van de dag, dan vervalt de eigen tijd, zodat er geen afwijkingen blijven
 * hangen die niets meer afwijken.
 *
 * Zonder `pid` (blok zonder medewerker, of de voertuigweergave): alleen de tijd
 * van díé datum. Loopt via dezelfde vertaling als het werkbonformulier, zodat
 * een verschuiving van dag 1 — waarvan de tijd de standaardtijd ís — de andere
 * dagen niet meeneemt: die houden hun tijd als eigen dagtijd.
 */
export function verzetTijd(w, datum, pid, nieuw) {
  const p = planningUitWerkbon(w);
  if (!p.dagen.includes(datum)) throw new Error('Deze dag staat niet (meer) op de werkbon. Ververs de planning.');
  const t = { starttijd: tijd(nieuw.starttijd), eindtijd: tijd(nieuw.eindtijd) };

  if (pid) {
    const dagTijd = tijdVanDag(p, datum);
    const eigen = { ...(p.persoonTijden[datum] || {}) };
    if (t.starttijd === dagTijd.starttijd && t.eindtijd === dagTijd.eindtijd) delete eigen[pid];
    else eigen[pid] = t;
    p.persoonTijden = { ...p.persoonTijden, [datum]: eigen };
  } else {
    p.tijden = { ...p.tijden, [datum]: t };
  }

  const standaard = tijdVanDag(p, geplandeDatums(p)[0], { starttijd: w.starttijd, eindtijd: w.eindtijd });
  return { dagen: dagenUitPlanning(p, w.assignedToIds || [], standaard), standaard };
}

const zelfdeSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/**
 * De dagenlijst die naar de database gaat:
 * [{ datum, starttijd, eindtijd, medewerker_ids, medewerker_tijden }].
 *
 * De tijd van de eerste dag is de tijd van de werkbon zelf; een andere dag
 * krijgt alleen een eigen tijd mee als die daarvan afwijkt. `standaard` is de
 * tijd van de werkbon zoals het formulier hem kent.
 *
 * `ploegIds` is de huidige ploeg van de werkbon. Een dagploeg wordt daartegen
 * bijgesneden (wie van de ploeg af is, valt eruit), en is hij weer de hele
 * ploeg, dan gaat hij als NULL mee — zo werkt iemand die later bij de ploeg
 * komt vanzelf ook op die dag mee. Eigen tijden gaan alleen mee voor wie die
 * dag in de (dag)ploeg staat.
 */
export function dagenUitPlanning(p, ploegIds = null, standaard = {}) {
  const datums = geplandeDatums(p);
  const eerste = datums.length ? tijdVanDag(p, datums[0], standaard) : null;
  const team = Array.isArray(ploegIds) ? ploegIds.filter(Boolean) : null;
  return datums.map((datum, i) => {
    let medewerker_ids = null;
    const eigen = p.ploeg?.[datum];
    if (team && Array.isArray(eigen)) {
      const binnen = eigen.filter(id => team.includes(id));
      medewerker_ids = zelfdeSet(binnen, team) ? null : binnen;
    }
    const dagploeg = medewerker_ids ?? team ?? [];
    let medewerker_tijden = null;
    const pt = p.persoonTijden?.[datum];
    if (pt && team) {
      const geldig = Object.entries(pt).filter(([pid, t]) => dagploeg.includes(pid) && tijd(t?.starttijd) && tijd(t?.eindtijd));
      if (geldig.length) {
        medewerker_tijden = Object.fromEntries(geldig.map(([pid, t]) => [pid, { starttijd: tijd(t.starttijd), eindtijd: tijd(t.eindtijd) }]));
      }
    }
    const t = tijdVanDag(p, datum, standaard);
    const wijktAf = i > 0 && eerste && (t.starttijd !== eerste.starttijd || t.eindtijd !== eerste.eindtijd);
    return {
      datum,
      starttijd: wijktAf ? (t.starttijd || null) : null,
      eindtijd: wijktAf ? (t.eindtijd || null) : null,
      medewerker_ids,
      medewerker_tijden,
    };
  });
}

/**
 * Foutmelding voor het formulier, of '' als alles klopt. Elke geplande dag
 * moet een begin- en eindtijd hebben: zonder starttijd tekent de planning geen
 * blok. `starttijd`/`eindtijd` = de tijd van de werkbon, voor dagen zonder eigen
 * regel.
 */
export function controleerPlanning(p, { starttijd, eindtijd } = {}) {
  const datums = geplandeDatums(p);
  if (datums.length > MAX_DAGEN) {
    return `Een werkbon kan maximaal ${MAX_DAGEN} dagen hebben; dit zijn er ${datums.length}. Verdeel de klus over meerdere werkbonnen.`;
  }
  for (const d of datums) {
    const t = tijdVanDag(p, d, { starttijd, eindtijd });
    if (!t.starttijd || !t.eindtijd) {
      return datums.length > 1
        ? `Vul voor ${korteDatum(d)} een begin- en eindtijd in. Een dag zonder tijd verschijnt niet in de planning.`
        : 'Vul een begin- en eindtijd in. Een dag zonder tijd verschijnt niet in de planning.';
    }
    if (t.eindtijd <= t.starttijd) return `Op ${korteDatum(d)} moet de eindtijd na de begintijd liggen.`;
  }
  for (const d of datums) {
    for (const t of Object.values(p.persoonTijden?.[d] || {})) {
      const s = tijd(t?.starttijd);
      const e = tijd(t?.eindtijd);
      if (!s || !e) return `Een eigen tijd op ${korteDatum(d)} heeft een begin- en eindtijd nodig.`;
      if (e <= s) return `Op ${korteDatum(d)} ligt een eigen eindtijd vóór de begintijd.`;
    }
  }
  return '';
}

// ── Dubbel ingepland ─────────────────────────────────────────────────────────

const naarMinuten = t => {
  const [h, m] = tijd(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
const overlapt = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

/**
 * Staat deze persoon op deze dag, op een overlappend moment, al ergens anders
 * ingepland? Kijkt naar de andere werkbonnen (met ieders dagploeg en eigen tijd)
 * en naar activiteiten. Geeft [{ soort, titel, starttijd, eindtijd }] terug.
 *
 * Dit is bewust géén beschikbaarheidscheck: verlof en afwezigheid bestaan (nog)
 * niet. Het zegt alleen wat zeker is — dat iemand op dat moment al op iets
 * anders staat.
 *
 * `werkbonId` = de werkbon zelf (die telt niet mee); `negeerActiviteitId` = de
 * activiteit die bij deze werkbon hoort (bij "activiteit + werkbon" aangemaakt).
 * Afgeronde werkbonnen en afgeronde activiteiten tellen niet.
 */
export function dubbeleBoekingen({
  werkbonnen = [], activiteiten = [], werkbonId = null, negeerActiviteitId = null,
  datum, pid, starttijd, eindtijd,
}) {
  if (!pid || !datum || !tijd(starttijd)) return [];
  const s = naarMinuten(starttijd);
  const e = tijd(eindtijd) ? naarMinuten(eindtijd) : s + 60;
  const botsingen = [];
  for (const w of werkbonnen) {
    if (!w || w.id === werkbonId || w.status === 'afgerond') continue;
    for (const dag of werkbonDagen(w)) {
      if (dag.datum !== datum || !ploegOpDag(w, dag).includes(pid)) continue;
      const t = tijdenVoorPersoon(w, dag, pid);
      if (!t.starttijd) continue;
      const ws = naarMinuten(t.starttijd);
      const we = t.eindtijd ? naarMinuten(t.eindtijd) : ws + 60;
      if (overlapt(s, e, ws, we)) botsingen.push({ soort: 'werkbon', titel: w.titel || 'Werkbon', starttijd: t.starttijd, eindtijd: t.eindtijd });
    }
  }
  for (const a of activiteiten) {
    if (!a || a.id === negeerActiviteitId || a.date !== datum || !tijd(a.time)) continue;
    if (a.status === 'completed' || a.status === 'done') continue;
    const ids = a.assignedToIds?.length ? a.assignedToIds : (a.assignee ? [a.assignee] : []);
    if (!ids.includes(pid)) continue;
    const as = naarMinuten(a.time);
    const ae = tijd(a.endTime) ? naarMinuten(a.endTime) : as + 30;
    if (overlapt(s, e, as, ae)) botsingen.push({ soort: 'activiteit', titel: a.title || 'Activiteit', starttijd: tijd(a.time), eindtijd: tijd(a.endTime) });
  }
  return botsingen;
}
