import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, RotateCcw, Truck, UserPlus, X } from 'lucide-react';
import { initials } from '../bb-shared.jsx';
import { MemberMultiSelect } from './MemberMultiSelect.jsx';
import { getWerkbonnen } from '../services/werkbonService.js';
import { geplandeDatums, korteDatum, tijdVanDag } from '../utils/werkbonDagen.js';
import {
  bezettingVanVoertuig, koppelingVanDag, magKoppelen, voertuigDubbel, voertuigTijd,
  voertuigenVanDag, voertuigWaarschuwingen,
} from '../utils/voertuigDagen.js';

// Voertuigen op een werkbon: één blok, per bus een kaart, en in die kaart de
// dagen. Eerst stonden de bussen als chips tussen de dagen en koppelde je
// iemand via zijn avatar aan een bus — dat was op één rij twee dingen tegelijk
// en de meldingen zaten verspreid. Nu staat per bus bij elkaar: rijdt hij die
// dag mee, hoe laat, wie zitten erin, en wat er niet klopt.
//
// Het model verandert niet (utils/voertuigDagen.js): p.voertuigen per dag,
// p.voertuigTijden per dag per bus, p.koppeling per dag { persoon: bus }.

const zetDag = (obj, datum, waarde) => {
  const rest = { ...(obj || {}) };
  if (waarde && (!Array.isArray(waarde) ? Object.keys(waarde).length : waarde.length)) rest[datum] = waarde;
  else delete rest[datum];
  return rest;
};

function Avatar({ m }) {
  return m.avatarUrl
    ? <img src={m.avatarUrl} alt="" className="av av-sm" style={{ objectFit: 'cover' }} />
    : <span className="av av-sm av-0">{initials(m.naam || '?')}</span>;
}

export function WerkbonVoertuigenBlok({
  planning: p, onChange, alle = [], ids = [], onIds, ploeg = [], standaard,
  werkbonId = null, disabled = false, className = '', style,
}) {
  const datums = geplandeDatums(p);
  const ploegIds = ploeg.map(m => m.id);
  const namen = Object.fromEntries(ploeg.map(m => [m.id, m.naam]));
  const gekozen = ids.map(id => alle.find(v => v.id === id)).filter(Boolean);

  // Welke kaart staat open. Eén bus: altijd open; meer bussen: de eerste.
  const [openBus, setOpenBus] = useState(null);
  const open = openBus ?? gekozen[0]?.id ?? null;
  // Het invulvak "eigen tijd" dat open staat: { datum, vid } of null.
  const [tijdOpen, setTijdOpen] = useState(null);
  // De lijst "wie rijdt mee" die open staat: { datum, vid } of null.
  const [kiesOpen, setKiesOpen] = useState(null);

  // Staat een bus op dat moment al op een andere werkbon? Eén keer ophalen.
  const [werkbonnen, setWerkbonnen] = useState([]);
  useEffect(() => {
    let actief = true;
    getWerkbonnen().then(l => { if (actief) setWerkbonnen(l); }).catch(() => {});
    return () => { actief = false; };
  }, []);

  const vctx = useMemo(
    () => ({ p, standaard, ploegIds, voertuigen: gekozen, naamVan: id => namen[id] || 'Medewerker' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, standaard?.starttijd, standaard?.eindtijd, ids.join(','), ploegIds.join(',')],
  );

  const set = patch => onChange({ ...p, ...patch });
  const dagPloeg = d => (Array.isArray(p.ploeg?.[d]) ? p.ploeg[d] : ploegIds);

  // Bus op een dag mee of niet. Gaat hij eruit, dan ook zijn eigen tijd en wie
  // erin zat. Staan alle bussen weer aan, dan volgt de dag de werkbon.
  const wisselDagMee = (d, vid) => {
    const alleIds = gekozen.map(v => v.id);
    const nu = voertuigenVanDag(vctx, d);
    const nieuw = nu.includes(vid) ? nu.filter(x => x !== vid) : [...nu, vid];
    const patch = {
      voertuigen: nieuw.length === alleIds.length && alleIds.every(x => nieuw.includes(x))
        ? zetDag(p.voertuigen, d, null)
        : { ...(p.voertuigen || {}), [d]: nieuw },
    };
    if (!nieuw.includes(vid)) {
      const tijden = { ...(p.voertuigTijden?.[d] || {}) };
      delete tijden[vid];
      patch.voertuigTijden = zetDag(p.voertuigTijden, d, tijden);
      const koppeling = { ...(p.koppeling?.[d] || {}) };
      Object.keys(koppeling).forEach(pid => { if (koppeling[pid] === vid) delete koppeling[pid]; });
      patch.koppeling = zetDag(p.koppeling, d, koppeling);
      if (tijdOpen?.datum === d && tijdOpen?.vid === vid) setTijdOpen(null);
      if (kiesOpen?.datum === d && kiesOpen?.vid === vid) setKiesOpen(null);
    }
    set(patch);
  };

  const zetTijd = (d, vid, patch) => set({
    voertuigTijden: {
      ...(p.voertuigTijden || {}),
      [d]: { ...(p.voertuigTijden?.[d] || {}), [vid]: { ...(p.voertuigTijden?.[d]?.[vid] || {}), ...patch } },
    },
  });
  const wisTijd = (d, vid) => {
    const dag = { ...(p.voertuigTijden?.[d] || {}) };
    delete dag[vid];
    set({ voertuigTijden: zetDag(p.voertuigTijden, d, dag) });
  };
  const openTijd = (d, vid) => {
    if (!p.voertuigTijden?.[d]?.[vid]) zetTijd(d, vid, { ...tijdVanDag(p, d, standaard) });
    setKiesOpen(null);
    setTijdOpen({ datum: d, vid });
  };

  // Iemand in een bus zetten of eruit halen. Past het niet, dan staat de reden
  // al in de lijst en is de regel niet aan te klikken — hier gebeurt niets meer.
  const koppel = (d, pid, vid) => {
    const dag = { ...(p.koppeling?.[d] || {}) };
    if (vid) dag[pid] = vid;
    else delete dag[pid];
    set({ koppeling: zetDag(p.koppeling, d, dag) });
  };

  const kiezer = (
    <div className="f full" style={{ marginBottom: gekozen.length ? 10 : 0 }}>
      <label>Bussen op deze klus <span className="wbd-opt">(meerdere mogelijk)</span></label>
      {alle.length ? (
        <MemberMultiSelect
          members={alle.map(v => ({
            id: v.id,
            fullName: v.zitplaatsen ? `${v.naam} · ${v.zitplaatsen} ${v.zitplaatsen === 1 ? 'plek' : 'plekken'}` : v.naam,
          }))}
          value={ids}
          onChange={onIds}
          disabled={disabled}
        />
      ) : (
        <div style={{ fontSize: 12, color: 'var(--dl)' }}>Nog geen voertuigen. Voeg ze toe bij Instellingen → Voertuigen.</div>
      )}
    </div>
  );

  return (
    <div className={`wbv ${className}`} style={style}>
      <span className="wbd-kop">Voertuigen</span>
      {kiezer}

      {gekozen.length > 0 && datums.length === 0 && (
        <div className="wbv-leeg">Kies eerst de dagen hierboven; daarna plan je per dag een bus in.</div>
      )}

      {gekozen.map(v => {
        const dagenMee = datums.filter(d => voertuigenVanDag(vctx, d).includes(v.id));
        const uit = open !== v.id;
        // Alles wat op deze bus niet klopt, met de dag erbij: vol, iemand buiten
        // de bustijd, of de bus staat al op een andere werkbon.
        const meldingen = datums.flatMap(d => {
          if (!dagenMee.includes(d)) return [];
          const w = voertuigWaarschuwingen(vctx, d);
          const k = koppelingVanDag(vctx, d);
          const vt = voertuigTijd(vctx, d, v.id);
          const eigen = [
            ...(w.perVoertuig[v.id] || []),
            ...Object.entries(w.perPersoon).filter(([pid]) => k[pid] === v.id).flatMap(([, t]) => t),
            ...voertuigDubbel({ werkbonnen, werkbonId, datum: d, vid: v.id, starttijd: vt.starttijd, eindtijd: vt.eindtijd })
              .map(c => `Staat ook op ${c.titel} (${c.starttijd}–${c.eindtijd}).`),
          ];
          return eigen.map(tekst => `${korteDatum(d)}: ${tekst}`);
        });

        return (
          <div key={v.id} className={`wbv-kaart${meldingen.length ? ' heeft-melding' : ''}`}>
            <button
              type="button"
              className="wbv-kaart-kop"
              onClick={() => setOpenBus(uit ? v.id : '__dicht__')}
              aria-expanded={!uit}
            >
              <span className="wbd-voertuig-kleur" style={{ background: v.kleur }} />
              <span className="wbv-naam">{v.naam}</span>
              <span className="wbv-plekken">{v.zitplaatsen ? `${v.zitplaatsen} ${v.zitplaatsen === 1 ? 'plek' : 'plekken'}` : 'plekken onbekend'}</span>
              <span className="wbv-dagen">
                {datums.length === 0 ? '' : dagenMee.length === datums.length ? 'alle dagen' : `${dagenMee.length} van ${datums.length} dagen`}
              </span>
              {meldingen.length > 0 && <AlertTriangle size={14} className="wbv-waarschuwing" />}
              <span className="wbv-pijl">{uit ? '▾' : '▴'}</span>
            </button>

            {!uit && (
              <div className="wbv-dagen-lijst">
                {datums.map(d => {
                  const aan = dagenMee.includes(d);
                  const dagTijd = tijdVanDag(p, d, standaard);
                  const vt = voertuigTijd(vctx, d, v.id);
                  const eigenTijd = aan && !!p.voertuigTijden?.[d]?.[v.id]
                    && (vt.starttijd !== dagTijd.starttijd || vt.eindtijd !== dagTijd.eindtijd);
                  const koppeling = koppelingVanDag(vctx, d);
                  const inzittenden = ploeg.filter(m => koppeling[m.id] === v.id);
                  const bezet = aan ? bezettingVanVoertuig(vctx, d, v.id) : 0;
                  const vol = v.zitplaatsen && bezet >= v.zitplaatsen;
                  const kiesHier = kiesOpen?.datum === d && kiesOpen?.vid === v.id;
                  const tijdHier = tijdOpen?.datum === d && tijdOpen?.vid === v.id;

                  return (
                    <div key={d} className={`wbv-dag${aan ? ' mee' : ''}`}>
                      <label className="wbv-mee">
                        <input
                          type="checkbox"
                          checked={aan}
                          onChange={() => wisselDagMee(d, v.id)}
                          disabled={disabled}
                          aria-label={`${v.naam} rijdt mee op ${korteDatum(d)}`}
                        />
                        <span className="wbv-dag-datum">{korteDatum(d)}</span>
                      </label>

                      {!aan && <span className="wbv-niet-mee">rijdt niet mee</span>}

                      {aan && (
                        <>
                          <span className="wbv-tijd">{vt.starttijd || '?'}–{vt.eindtijd || '?'}</span>
                          <button type="button" className="wbd-link" disabled={disabled}
                            onClick={() => (eigenTijd ? wisTijd(d, v.id) : openTijd(d, v.id))}>
                            {eigenTijd ? <><RotateCcw size={12} /> tijd van de dag</> : <><Clock size={12} /> eigen tijd</>}
                          </button>
                          <span className={`wbv-bezetting${vol ? ' vol' : ''}`}>
                            {v.zitplaatsen ? `${bezet}/${v.zitplaatsen}` : `${bezet}`}
                          </span>
                          <span className="wbv-inzittenden">
                            {inzittenden.map(m => (
                              <span key={m.id} className="wbv-inzittende">
                                <Avatar m={m} />
                                <span>{m.naam}</span>
                                <button type="button" aria-label={`${m.naam} uit ${v.naam}`} disabled={disabled}
                                  onClick={() => koppel(d, m.id, null)}><X size={12} /></button>
                              </span>
                            ))}
                            <button type="button" className="wbv-toevoegen" disabled={disabled}
                              onClick={() => { setTijdOpen(null); setKiesOpen(kiesHier ? null : { datum: d, vid: v.id }); }}>
                              <UserPlus size={13} /> wie rijdt mee
                            </button>
                          </span>
                        </>
                      )}

                      {tijdHier && (
                        <div className="wbd-pt" role="group" aria-label={`Eigen tijd voor ${v.naam}`}>
                          <div className="wbd-pt-kop">Eigen tijd voor {v.naam} · {korteDatum(d)}</div>
                          <div className="wbd-tijd">
                            <input type="time" value={p.voertuigTijden?.[d]?.[v.id]?.starttijd || ''}
                              onChange={e => zetTijd(d, v.id, { starttijd: e.target.value })} aria-label={`Begintijd ${v.naam}`} />
                            <span className="wbd-dag-tijd">→</span>
                            <input type="time" value={p.voertuigTijden?.[d]?.[v.id]?.eindtijd || ''}
                              onChange={e => zetTijd(d, v.id, { eindtijd: e.target.value })} aria-label={`Eindtijd ${v.naam}`} />
                          </div>
                          <div className="wbd-pt-knoppen">
                            <button type="button" className="wbd-link" onClick={() => { wisTijd(d, v.id); setTijdOpen(null); }}>Zelfde tijd als de dag</button>
                            <button type="button" className="btn btn-p btn-sm" onClick={() => setTijdOpen(null)}>Klaar</button>
                          </div>
                        </div>
                      )}

                      {kiesHier && (
                        <div className="wbv-kies" role="group" aria-label={`Wie rijdt mee in ${v.naam} op ${korteDatum(d)}`}>
                          <div className="wbd-pt-kop">Wie rijdt mee · {korteDatum(d)}</div>
                          {ploeg.filter(m => dagPloeg(d).includes(m.id)).length === 0 && (
                            <div className="wbv-leeg">Niemand werkt op deze dag.</div>
                          )}
                          {ploeg.filter(m => dagPloeg(d).includes(m.id)).map(m => {
                            const zitHier = koppeling[m.id] === v.id;
                            const andere = koppeling[m.id] && !zitHier
                              ? gekozen.find(x => x.id === koppeling[m.id]) : null;
                            // Zelfde toets als de database doet bij een nieuwe koppeling.
                            const reden = zitHier ? '' : magKoppelen(vctx, d, m.id, v.id);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                className={`wbv-kandidaat${zitHier ? ' zit' : ''}`}
                                disabled={disabled || (!zitHier && !!reden)}
                                onClick={() => koppel(d, m.id, zitHier ? null : v.id)}
                              >
                                <Avatar m={m} />
                                <span className="wbv-kandidaat-naam">{m.naam}</span>
                                {zitHier
                                  ? <span className="wbv-kandidaat-info">rijdt mee — klik om eruit te halen</span>
                                  : reden
                                    ? <span className="wbv-kandidaat-info waarom">{reden}</span>
                                    : andere
                                      ? <span className="wbv-kandidaat-info">zit nu in {andere.naam}</span>
                                      : null}
                              </button>
                            );
                          })}
                          <div className="wbd-pt-knoppen">
                            <span />
                            <button type="button" className="btn btn-p btn-sm" onClick={() => setKiesOpen(null)}>Klaar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {meldingen.length > 0 && (
                  <div className="wbv-meldingen" role="status">
                    {meldingen.map(tekst => (
                      <span key={tekst}><AlertTriangle size={12} /> {tekst}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {gekozen.length === 0 && alle.length > 0 && (
        <div className="wbv-leeg"><Truck size={13} /> Nog geen bus gekozen voor deze klus.</div>
      )}
    </div>
  );
}

export default WerkbonVoertuigenBlok;
