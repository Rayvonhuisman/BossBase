// Voertuigen inplannen op een werkbon: per dag, met eigen tijden, en wie er in
// welk voertuig zit. Zelfde opbouw als de ploeg in utils/werkbonDagen.js.
//
// De database (migratie 20260916120000_voertuigen_per_dag):
//   werkbon.voertuigIds          de voertuigen van de werkbon
//   dag.voertuigIds              null = alle voertuigen van de werkbon, een lijst = een deel
//   dag.voertuigTijden           { voertuigId: { starttijd, eindtijd } } — alleen afwijkers
//   dag.medewerkerVoertuig       { profielId: voertuigId } — wie waarin zit; niet verplicht
//
// De tijd van een voertuig op een dag: zijn eigen tijd → de tijd van de dag →
// de tijd van de werkbon. Net als bij een persoon.
//
// Twee regels, in de database en hier precies gelijk:
//   * wie gekoppeld wordt, werkt binnen de tijd van het voertuig;
//   * er zitten nooit méér mensen tegelijk in dan er plekken zijn.
// Tijden lopen van begin tot eind, zonder het eindpunt: 10:00–12:00 en
// 12:00–17:00 overlappen niet. De database toetst alleen een NIEUWE koppeling;
// klopt een bestaande later niet meer, dan is dat een waarschuwing.

import { korteDatum, planningUitWerkbon, ploegOpDag, tijdVanDag, tijdenOpDag, werkbonDagen } from './werkbonDagen.js';

const tijd = t => (t ? String(t).slice(0, 5) : '');
const naarMinuten = t => {
  const [h, m] = tijd(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
const overlapt = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const heeftTijd = t => !!(tijd(t?.starttijd) && tijd(t?.eindtijd));

// ── Opgeslagen werkbon lezen ─────────────────────────────────────────────────

/** Voertuigen op die dag: de eigen lijst van de dag, anders die van de werkbon. */
export const voertuigenOpDag = (w, dag) =>
  (Array.isArray(dag?.voertuigIds) ? dag.voertuigIds : (w?.voertuigIds || []));

/** Tijd van een voertuig op een dag: eigen tijd → tijd van de dag → tijd van de werkbon. */
export function tijdVanVoertuig(w, dag, vid) {
  const eigen = dag?.voertuigTijden?.[vid];
  if (heeftTijd(eigen)) return { starttijd: tijd(eigen.starttijd), eindtijd: tijd(eigen.eindtijd) };
  return tijdenOpDag(w, dag);
}

/** Het voertuig waar iemand die dag in zit, of null. */
export function voertuigVanPersoon(w, dag, pid) {
  const vid = dag?.medewerkerVoertuig?.[pid];
  if (!vid || !voertuigenOpDag(w, dag).includes(vid) || !ploegOpDag(w, dag).includes(pid)) return null;
  return vid;
}

/**
 * Per dag het voertuig van één persoon, met de tijd van dat voertuig. Voor
 * "jouw voertuig" op de werkbon en in de agenda. [{ datum, vid, starttijd, eindtijd }]
 */
export function voertuigenVoorPersoon(w, pid) {
  if (!pid) return [];
  return werkbonDagen(w).flatMap(dag => {
    const vid = voertuigVanPersoon(w, dag, pid);
    return vid ? [{ datum: dag.datum, vid, ...tijdVanVoertuig(w, dag, vid) }] : [];
  });
}

/**
 * Staat dit voertuig op dat moment al op een andere werkbon? Afgeronde
 * werkbonnen tellen niet. Geeft [{ titel, starttijd, eindtijd }] terug.
 */
export function voertuigDubbel({ werkbonnen = [], werkbonId = null, datum, vid, starttijd, eindtijd }) {
  if (!vid || !datum || !tijd(starttijd) || !tijd(eindtijd)) return [];
  const s = naarMinuten(starttijd);
  const e = naarMinuten(eindtijd);
  const botsingen = [];
  for (const w of werkbonnen) {
    if (!w || w.id === werkbonId || w.status === 'afgerond') continue;
    for (const dag of werkbonDagen(w)) {
      if (dag.datum !== datum || !voertuigenOpDag(w, dag).includes(vid)) continue;
      const t = tijdVanVoertuig(w, dag, vid);
      if (!heeftTijd(t)) continue;
      if (overlapt(s, e, naarMinuten(t.starttijd), naarMinuten(t.eindtijd))) {
        botsingen.push({ titel: w.titel || 'Werkbon', starttijd: t.starttijd, eindtijd: t.eindtijd });
      }
    }
  }
  return botsingen;
}

// ── Rekenen ──────────────────────────────────────────────────────────────────

const naarTijd = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Hoeveel mensen zitten er op het drukste moment in? `bezetters` = [{ starttijd, eindtijd }].
 */
export function hoogsteBezetting(bezetters) {
  const lijst = bezetters.filter(heeftTijd).map(b => [naarMinuten(b.starttijd), naarMinuten(b.eindtijd)]);
  return lijst.reduce((max, [s]) => Math.max(max, lijst.filter(([a, b]) => a <= s && s < b).length), 0);
}

/**
 * Het eerste aaneengesloten stuk waarin er meer dan `plekken` mensen tegelijk
 * in zitten, en dat overlapt met van–tot (standaard de hele dag). Geeft
 * { van, tot, aantal } of null. Zelfde rekenregel als bb_voertuig_te_vol.
 */
export function teVol(bezetters, plekken, van = null, tot = null) {
  if (!plekken) return null;
  const lijst = bezetters.filter(heeftTijd).map(b => [naarMinuten(b.starttijd), naarMinuten(b.eindtijd)]);
  const punten = [...new Set(lijst.flat())].sort((a, b) => a - b);
  const binnenVan = van ? naarMinuten(van) : 0;
  const binnenTot = tot ? naarMinuten(tot) : 24 * 60;
  let run = null;
  for (let i = 0; i < punten.length - 1; i++) {
    const a = punten[i];
    const b = punten[i + 1];
    const n = lijst.filter(([s, e]) => s <= a && a < e).length;
    if (n > plekken && a < binnenTot && b > binnenVan) {
      run = run ? { ...run, tot: b, aantal: Math.max(run.aantal, n) } : { van: a, tot: b, aantal: n };
    } else if (run) {
      break;
    }
  }
  return run ? { van: naarTijd(run.van), tot: naarTijd(run.tot), aantal: run.aantal } : null;
}

// ── Meldingen ────────────────────────────────────────────────────────────────
// Letterlijk dezelfde zinnen als de database, zodat opslaan niets anders zegt
// dan het formulier.

export const meldingBuitenTijd = (naam, pt, voertuigNaam, vt) =>
  `${naam} werkt ${pt.starttijd}–${pt.eindtijd}, ${voertuigNaam} staat ${vt.starttijd}–${vt.eindtijd}.`;

export const meldingVol = (voertuig, vol) =>
  `${voertuig.naam} heeft ${voertuig.zitplaatsen} ${voertuig.zitplaatsen === 1 ? 'plek' : 'plekken'}, tussen ${vol.van} en ${vol.tot} zitten er ${vol.aantal} in.`;

// ── Formulier ────────────────────────────────────────────────────────────────
// Naast de velden uit werkbonDagen.js (dagen, tijden, ploeg, persoonTijden)
// houdt het formulier bij:
//   voertuigen      { iso: [voertuigId] }            — alleen dagen met een eigen lijst
//   voertuigTijden  { iso: { voertuigId: { starttijd, eindtijd } } }
//   koppeling       { iso: { profielId: voertuigId } }
//
// `ctx` beschrijft de werkbon zoals het formulier hem nu kent:
//   { p, standaard, ploegIds, voertuigen: [{ id, naam, zitplaatsen }], naamVan: pid => naam }

/**
 * Dezelfde regels op een opgeslagen werkbon (planning, overzichten): bouwt de
 * `ctx` zoals het formulier hem zou hebben. `voertuigen` = alle voertuigen van
 * het bedrijf; alleen die van de werkbon doen mee.
 */
export function ctxVoorWerkbon(w, voertuigen, naamVan = () => '') {
  const p = { ...planningUitWerkbon(w), ...voertuigPlanningUitWerkbon(w) };
  return {
    p,
    standaard: { starttijd: tijd(w?.starttijd), eindtijd: tijd(w?.eindtijd) },
    ploegIds: w?.assignedToIds || [],
    voertuigen: (w?.voertuigIds || []).map(id => voertuigen.find(v => v.id === id)).filter(Boolean),
    naamVan: id => naamVan(id) || 'Medewerker',
  };
}

/** Terugvertalen van opgeslagen dagen naar het formulier. */
export function voertuigPlanningUitWerkbon(w) {
  const voertuigen = {};
  const voertuigTijden = {};
  const koppeling = {};
  for (const d of werkbonDagen(w)) {
    if (Array.isArray(d.voertuigIds)) voertuigen[d.datum] = d.voertuigIds;
    if (d.voertuigTijden && Object.keys(d.voertuigTijden).length) {
      voertuigTijden[d.datum] = Object.fromEntries(Object.entries(d.voertuigTijden)
        .map(([vid, t]) => [vid, { starttijd: tijd(t?.starttijd), eindtijd: tijd(t?.eindtijd) }]));
    }
    if (d.medewerkerVoertuig && Object.keys(d.medewerkerVoertuig).length) koppeling[d.datum] = { ...d.medewerkerVoertuig };
  }
  return { voertuigen, voertuigTijden, koppeling };
}

const alleIds = ctx => ctx.voertuigen.map(v => v.id);
const dagPloeg = (ctx, iso) =>
  (Array.isArray(ctx.p.ploeg?.[iso]) ? ctx.p.ploeg[iso].filter(id => ctx.ploegIds.includes(id)) : ctx.ploegIds);

/** Voertuigen op die dag, in het formulier. */
export const voertuigenVanDag = (ctx, iso) =>
  (Array.isArray(ctx.p.voertuigen?.[iso]) ? ctx.p.voertuigen[iso].filter(id => alleIds(ctx).includes(id)) : alleIds(ctx));

/** Tijd van een voertuig op die dag, in het formulier. */
export function voertuigTijd(ctx, iso, vid) {
  const eigen = ctx.p.voertuigTijden?.[iso]?.[vid];
  return heeftTijd(eigen) ? { starttijd: tijd(eigen.starttijd), eindtijd: tijd(eigen.eindtijd) } : tijdVanDag(ctx.p, iso, ctx.standaard);
}

/** Tijd van een persoon op die dag, in het formulier. */
export function persoonTijd(ctx, iso, pid) {
  const eigen = ctx.p.persoonTijden?.[iso]?.[pid];
  return heeftTijd(eigen) ? { starttijd: tijd(eigen.starttijd), eindtijd: tijd(eigen.eindtijd) } : tijdVanDag(ctx.p, iso, ctx.standaard);
}

/** De koppelingen die op die dag gelden: alleen wie er werkt, in een voertuig van die dag. */
export function koppelingVanDag(ctx, iso) {
  const ploeg = dagPloeg(ctx, iso);
  const voertuigen = voertuigenVanDag(ctx, iso);
  return Object.fromEntries(Object.entries(ctx.p.koppeling?.[iso] || {})
    .filter(([pid, vid]) => ploeg.includes(pid) && voertuigen.includes(vid)));
}

/** Het drukste moment in een voertuig op die dag. */
export function bezettingVanVoertuig(ctx, iso, vid) {
  const k = koppelingVanDag(ctx, iso);
  return hoogsteBezetting(Object.keys(k).filter(pid => k[pid] === vid).map(pid => persoonTijd(ctx, iso, pid)));
}

/**
 * Mag deze persoon op die dag in dit voertuig? '' = ja, anders de melding.
 * Toetst wat de database bij een nieuwe koppeling toetst.
 */
export function magKoppelen(ctx, iso, pid, vid) {
  const voertuig = ctx.voertuigen.find(v => v.id === vid);
  if (!voertuig) return '';
  const pt = persoonTijd(ctx, iso, pid);
  const vt = voertuigTijd(ctx, iso, vid);
  if (!heeftTijd(pt) || !heeftTijd(vt)) return '';
  if (pt.starttijd < vt.starttijd || pt.eindtijd > vt.eindtijd) {
    return meldingBuitenTijd(ctx.naamVan(pid), pt, voertuig.naam, vt);
  }
  if (voertuig.zitplaatsen) {
    const k = koppelingVanDag(ctx, iso);
    const anderen = Object.keys(k).filter(x => x !== pid && k[x] === vid);
    const vol = teVol([...anderen, pid].map(x => persoonTijd(ctx, iso, x)), voertuig.zitplaatsen, pt.starttijd, pt.eindtijd);
    if (vol) return meldingVol(voertuig, vol);
  }
  return '';
}

/**
 * Wat er op die dag niet (meer) klopt, voor de oranje driehoekjes:
 * { perPersoon: { pid: [tekst] }, perVoertuig: { vid: [tekst] } }.
 */
export function voertuigWaarschuwingen(ctx, iso) {
  const perPersoon = {};
  const perVoertuig = {};
  const k = koppelingVanDag(ctx, iso);
  for (const [pid, vid] of Object.entries(k)) {
    const voertuig = ctx.voertuigen.find(v => v.id === vid);
    const pt = persoonTijd(ctx, iso, pid);
    const vt = voertuigTijd(ctx, iso, vid);
    if (voertuig && heeftTijd(pt) && heeftTijd(vt) && (pt.starttijd < vt.starttijd || pt.eindtijd > vt.eindtijd)) {
      (perPersoon[pid] ||= []).push(meldingBuitenTijd(ctx.naamVan(pid), pt, voertuig.naam, vt));
    }
  }
  for (const voertuig of ctx.voertuigen) {
    if (!voertuig.zitplaatsen) continue;
    const vol = teVol(Object.keys(k).filter(pid => k[pid] === voertuig.id).map(pid => persoonTijd(ctx, iso, pid)), voertuig.zitplaatsen);
    if (vol) (perVoertuig[voertuig.id] ||= []).push(meldingVol(voertuig, vol));
  }
  return { perPersoon, perVoertuig };
}

/**
 * Vóór het opslaan: toets elke nieuwe koppeling zoals de database dat doet.
 * `origineel` = de koppelingen zoals ze opgeslagen waren ({ iso: { pid: vid } }).
 * Geeft de eerste melding terug, met de datum erbij als het om meer dagen gaat.
 */
export function controleerVoertuigen(ctx, origineel = {}) {
  const datums = [...new Set(ctx.p.dagen || [])].sort();
  for (const iso of datums) {
    for (const [pid, vid] of Object.entries(koppelingVanDag(ctx, iso))) {
      if (origineel?.[iso]?.[pid] === vid) continue;
      const melding = magKoppelen(ctx, iso, pid, vid);
      if (melding) return datums.length > 1 ? `${korteDatum(iso)}: ${melding}` : melding;
    }
  }
  return '';
}

const zelfdeSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/**
 * Voertuigvelden bij de dagen die naar de database gaan (dagenUitPlanning).
 * Elke dag krijgt alle drie de sleutels mee: zo overschrijft het formulier wat
 * er stond. Zonder sleutels (planning, oudere schermen) blijft het staan.
 */
export function metVoertuigen(dagen, ctx) {
  return dagen.map(d => {
    const iso = d.datum;
    const voertuigen = voertuigenVanDag(ctx, iso);
    const eigenLijst = Array.isArray(ctx.p.voertuigen?.[iso]) && !zelfdeSet(voertuigen, alleIds(ctx));
    const dagTijd = tijdVanDag(ctx.p, iso, ctx.standaard);
    const tijden = Object.entries(ctx.p.voertuigTijden?.[iso] || {})
      .filter(([vid, t]) => voertuigen.includes(vid) && heeftTijd(t)
        && (tijd(t.starttijd) !== dagTijd.starttijd || tijd(t.eindtijd) !== dagTijd.eindtijd))
      .map(([vid, t]) => [vid, { starttijd: tijd(t.starttijd), eindtijd: tijd(t.eindtijd) }]);
    const koppeling = koppelingVanDag(ctx, iso);
    return {
      ...d,
      voertuig_ids: eigenLijst ? voertuigen : null,
      voertuig_tijden: tijden.length ? Object.fromEntries(tijden) : null,
      medewerker_voertuig: Object.keys(koppeling).length ? koppeling : null,
    };
  });
}
