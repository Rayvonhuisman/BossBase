import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, Info, RotateCcw, UserMinus, UserPlus, X } from 'lucide-react';
import AdresZoeker, { adresRegel } from './AdresZoeker.jsx';
import ActieMenu from './ActieMenu.jsx';
import { initials } from '../bb-shared.jsx';
import { vandaagIso } from '../lib/datumTijd.js';
import { getWerkbonnen } from '../services/werkbonService.js';
import { listActivities } from '../services/activityService.js';
import {
  STANDAARD_TIJD, controleerPlanning, dubbeleBoekingen, geplandeDatums, isWeekend, korteDatum,
  maandNaam, tijdVanDag, verplaatsNaar, wisselDag,
} from '../utils/werkbonDagen.js';

// Gedeelde velden voor elk werkbonformulier (werkbonpagina, planning): de
// geplande dagen, de tijd per dag, de ploeg per dag en de locatie. Zie
// utils/werkbonDagen.js voor het model.

const hhmm = t => (t ? String(t).slice(0, 5) : '');
const pad = n => String(n).padStart(2, '0');

function TijdVelden({ label, starttijd, eindtijd, onTijden, disabled }) {
  return (
    <div className="f">
      <label>{label}</label>
      <div className="wbd-tijd">
        <input type="time" value={hhmm(starttijd)} onChange={e => onTijden?.({ starttijd: e.target.value })} disabled={disabled} aria-label="Begintijd" />
        <span className="wbd-dag-tijd">→</span>
        <input type="time" value={hhmm(eindtijd)} onChange={e => onTijden?.({ eindtijd: e.target.value })} disabled={disabled} aria-label="Eindtijd" />
      </div>
    </div>
  );
}

// Zelfde avatar als linksonder in de zijbalk: de foto als die er is, anders de
// initialen in het groene rondje (av av-0), met dezelfde initials()-helper.
function MedewerkerAvatar({ m }) {
  return m.avatarUrl
    ? <img src={m.avatarUrl} alt="" className="av av-sm" style={{ objectFit: 'cover' }} />
    : <span className="av av-sm av-0">{initials(m.naam || '?')}</span>;
}

// ── Kalender ─────────────────────────────────────────────────────────────────

const WEEKDAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const maandVan = iso => {
  const [j, m] = (iso || vandaagIso()).split('-').map(Number);
  return { j, m: m - 1 };
};

/**
 * Eén maand, maandag eerst. De enige manier om dagen te kiezen: tik een dag aan
 * of uit. Met `enkel` (zonder planningsmodule) kies je één dag — de dag waarop
 * de klus begint.
 */
function Kalender({ p, onTik, disabled, enkel = false }) {
  const gepland = geplandeDatums(p);
  const [zicht, setZicht] = useState(() => maandVan(gepland[0]));
  const aan = new Set(gepland);
  const vandaag = vandaagIso();
  const aantal = new Date(zicht.j, zicht.m + 1, 0).getDate();
  const voorloop = (new Date(zicht.j, zicht.m, 1).getDay() + 6) % 7;
  const cellen = [
    ...Array(voorloop).fill(null),
    ...Array.from({ length: aantal }, (_, i) => `${zicht.j}-${pad(zicht.m + 1)}-${pad(i + 1)}`),
  ];
  const schuif = n => setZicht(z => {
    const d = new Date(z.j, z.m + n, 1);
    return { j: d.getFullYear(), m: d.getMonth() };
  });
  const uitleg = enkel
    ? 'Tik op de dag van de klus.'
    : gepland.length ? 'Tik op een dag om hem toe te voegen of weg te halen.' : 'Tik de dagen van de klus aan.';

  return (
    <div className="wbd-kal">
      <div className="wbd-kal-kop">
        <button type="button" onClick={() => schuif(-1)} aria-label="Vorige maand">‹</button>
        <span>{maandNaam(zicht.j, zicht.m)}</span>
        <button type="button" onClick={() => schuif(1)} aria-label="Volgende maand">›</button>
      </div>
      <div className="wbd-kal-grid">
        {WEEKDAGEN.map(w => <span key={w} className="wbd-kal-wd">{w}</span>)}
        {cellen.map((iso, i) => {
          if (!iso) return <span key={`leeg-${i}`} className="wbd-kal-leeg" />;
          const isAan = aan.has(iso);
          const klassen = [
            'wbd-kal-dag',
            isAan && 'is-gepland',
            isWeekend(iso) && 'is-weekend',
            iso === vandaag && 'is-vandaag',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={iso}
              type="button"
              className={klassen}
              disabled={disabled}
              onClick={() => onTik(iso)}
              title={enkel ? `${korteDatum(iso)} kiezen` : isAan ? `${korteDatum(iso)} weghalen` : `${korteDatum(iso)} toevoegen`}
              aria-pressed={isAan}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="wbd-kal-uitleg">{uitleg}</div>
    </div>
  );
}

// ── Dagen ────────────────────────────────────────────────────────────────────

/**
 * De kalender, met ernaast de gekozen dagen. Elke dag heeft zijn eigen begin-
 * en eindtijd; een nieuwe dag neemt de tijd van de dag ervoor over, en met één
 * knop zet je de tijd van de eerste dag op alle dagen. De tijd van de eerste dag
 * is de tijd van de werkbon zelf (`starttijd`/`eindtijd`, via `onTijden`).
 *
 * `ploeg` = de medewerkers van de werkbon als [{ id, naam, avatarUrl }]. Een
 * klik op iemands avatar opent het acties-menu om die persoon van een dag af te halen of
 * een eigen tijd te geven.
 */
export function WerkbonDagenVelden({
  planning: p, onChange, starttijd, eindtijd, onTijden, ploeg = [],
  disabled = false, className = '', style, meerdaags = true, onUpgrade,
  werkbonId = null, activiteitId = null,
}) {
  // Het aantal dagen bij het openen. Zonder planningsmodule tonen we dat alleen;
  // bij het verplaatsen van de klus mag die melding niet mee verspringen.
  const [aantalBijOpenen] = useState(() => geplandeDatums(p).length);
  // Het invulvak "eigen tijd" dat open staat: { datum, pid } of null.
  const [eigenTijdOpen, setEigenTijdOpen] = useState(null);
  // Uitleg achter het info-icoontje. Sluit op een klik ernaast.
  const [uitlegOpen, setUitlegOpen] = useState(false);
  const uitlegRef = useRef(null);
  useEffect(() => {
    if (!uitlegOpen) return undefined;
    const sluit = e => { if (uitlegRef.current && !uitlegRef.current.contains(e.target)) setUitlegOpen(false); };
    document.addEventListener('mousedown', sluit);
    return () => document.removeEventListener('mousedown', sluit);
  }, [uitlegOpen]);

  // Dubbel ingepland: wat staat er al in de planning? Eén keer ophalen als het
  // formulier opent — alleen met de planningsmodule, net als de rest hier.
  const [bezetting, setBezetting] = useState({ werkbonnen: [], activiteiten: [] });
  useEffect(() => {
    if (!meerdaags) return undefined;
    let actief = true;
    Promise.all([getWerkbonnen().catch(() => []), listActivities().catch(() => [])])
      .then(([werkbonnen, activiteiten]) => { if (actief) setBezetting({ werkbonnen, activiteiten }); });
    return () => { actief = false; };
  }, [meerdaags]);
  // De waarschuwing die open staat: "<datum>|<pid>" of null. Sluit op een klik ernaast.
  const [dubbelOpen, setDubbelOpen] = useState(null);
  useEffect(() => {
    if (!dubbelOpen) return undefined;
    const sluit = e => { if (!e.target.closest?.('.wbd-dubbel')) setDubbelOpen(null); };
    document.addEventListener('mousedown', sluit);
    return () => document.removeEventListener('mousedown', sluit);
  }, [dubbelOpen]);

  const set = patch => onChange({ ...p, ...patch });
  const datums = geplandeDatums(p);
  const standaard = { starttijd: hhmm(starttijd), eindtijd: hhmm(eindtijd) };
  const fout = controleerPlanning(p, standaard);
  const eerste = datums.length ? tijdVanDag(p, datums[0], standaard) : null;

  // De tijd van de eerste dag ís de tijd van de werkbon. Wijzigt die (of wordt
  // een andere dag de eerste), dan gaat hij mee naar het formulier — zodat alles
  // wat alleen de werkbontijd leest (PDF, oudere schermen) blijft kloppen.
  useEffect(() => {
    if (!meerdaags || !eerste) return;
    if (eerste.starttijd !== standaard.starttijd || eerste.eindtijd !== standaard.eindtijd) onTijden?.({ ...eerste });
  }, [meerdaags, eerste?.starttijd, eerste?.eindtijd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eerste dag aangetikt en nog geen tijd: de gewone werkdag alvast invullen.
  const vulTijdIn = () => {
    if (!standaard.starttijd && !standaard.eindtijd) onTijden?.({ ...STANDAARD_TIJD });
  };

  // Zonder planningsmodule: één dag en de tijd. Meerdere dagen, tijden per dag
  // en de ploeg per dag horen bij de planningsmodule — Team, of als module bij
  // Groei. Een werkbon die al meerdere dagen heeft (ingepland toen de module er
  // wel was) houdt die; een andere startdag verplaatst de hele klus.
  if (!meerdaags) {
    return (
      <div className={`wbd ${className}`} style={style}>
        <span className="wbd-kop">{aantalBijOpenen > 1 ? 'Startdag' : 'Dag'}</span>
        <div className="wbd-kal-wrap">
          <div className="wbd-kal-kolom">
            <Kalender p={p} enkel disabled={disabled} onTik={iso => { vulTijdIn(); onChange(verplaatsNaar(p, iso)); }} />
            <TijdVelden label="Tijd" starttijd={starttijd} eindtijd={eindtijd} onTijden={onTijden} disabled={disabled} />
          </div>
        </div>
        {aantalBijOpenen > 1 ? (
          <div className="wbd-slot">
            Deze werkbon staat op {aantalBijOpenen} dagen. Tik een andere startdag aan om de hele klus te verplaatsen;
            de dagen zelf aanpassen kan met de planningsmodule.
          </div>
        ) : (
          <div className="wbd-slot">
            Een klus over meerdere dagen plannen? Dat zit in de{' '}
            <button type="button" className="wbd-link-inline" onClick={onUpgrade}>planningsmodule</button>.
          </div>
        )}
        {fout && <div className="wbd-fout" role="alert">{fout}</div>}
      </div>
    );
  }

  const meer = datums.length > 1;
  const ploegIds = ploeg.map(m => m.id);
  const dagPloeg = datum => (Array.isArray(p.ploeg?.[datum]) ? p.ploeg[datum] : ploegIds);

  const zetDagTijd = (d, patch) => set({
    tijden: { ...(p.tijden || {}), [d]: { ...tijdVanDag(p, d, standaard), ...patch } },
  });
  // Eén knop: de tijd van de eerste dag op alle dagen. Alleen zichtbaar als de
  // tijden verschillen — anders valt er niets over te nemen.
  const iedereenGelijk = datums.every(d => {
    const t = tijdVanDag(p, d, standaard);
    return t.starttijd === eerste?.starttijd && t.eindtijd === eerste?.eindtijd;
  });
  const voorAlleDagen = () => set({ tijden: Object.fromEntries(datums.map(d => [d, { ...eerste }])) });

  // Wie er uit gaat, verliest ook zijn eigen tijd op die dag. Is het daarna weer
  // de hele ploeg, dan vervalt de afwijking: die dag volgt de ploeg van de werkbon.
  const wisselPersoon = (datum, id) => {
    const nu = dagPloeg(datum).filter(x => ploegIds.includes(x));
    const nieuw = nu.includes(id) ? nu.filter(x => x !== id) : [...nu, id];
    const rest = { ...(p.ploeg || {}) };
    if (nieuw.length === ploegIds.length && ploegIds.every(x => nieuw.includes(x))) delete rest[datum];
    else rest[datum] = nieuw;
    const tijden = { ...(p.persoonTijden || {}) };
    if (!nieuw.includes(id) && tijden[datum]?.[id]) {
      const dag = { ...tijden[datum] };
      delete dag[id];
      if (Object.keys(dag).length) tijden[datum] = dag;
      else delete tijden[datum];
      if (eigenTijdOpen?.datum === datum && eigenTijdOpen?.pid === id) setEigenTijdOpen(null);
    }
    set({ ploeg: rest, persoonTijden: tijden });
  };

  // Eigen tijd per persoon: een uitzondering op de tijd van de dag.
  const zetEigenTijd = (d, pid, patch) => set({
    persoonTijden: {
      ...(p.persoonTijden || {}),
      [d]: { ...(p.persoonTijden?.[d] || {}), [pid]: { ...(p.persoonTijden?.[d]?.[pid] || {}), ...patch } },
    },
  });
  const wisEigenTijd = (d, pid) => {
    const dag = { ...(p.persoonTijden?.[d] || {}) };
    delete dag[pid];
    const rest = { ...(p.persoonTijden || {}) };
    if (Object.keys(dag).length) rest[d] = dag;
    else delete rest[d];
    set({ persoonTijden: rest });
  };
  // Openen begint met de tijd van de dag: je past alleen aan wat anders is.
  const openEigenTijd = (d, pid) => {
    if (!p.persoonTijden?.[d]?.[pid]) zetEigenTijd(d, pid, { ...tijdVanDag(p, d, standaard) });
    setEigenTijdOpen({ datum: d, pid });
  };

  const tikDag = iso => {
    let std = standaard;
    if (!datums.length && !standaard.starttijd && !standaard.eindtijd) {
      std = STANDAARD_TIJD;
      onTijden?.({ ...STANDAARD_TIJD });
    }
    onChange(wisselDag(p, iso, std));
  };

  return (
    <div className={`wbd ${className}`} style={style}>
      <span className="wbd-kop">Dagen</span>
      <div className="wbd-kal-wrap">
        <div className="wbd-kal-kolom">
          <Kalender p={p} disabled={disabled} onTik={tikDag} />
        </div>

        {datums.length > 0 && (
          <div className="wbd-lijst">
            <div className="wbd-lijst-kop">
              <span>{meer ? `${datums.length} dagen gepland` : '1 dag gepland'}</span>
              {/* Uitleg achter een info-icoontje — hetzelfde als bij de
                  modulekeuze (AbonnementPage): op klik, niet op hover, want op
                  een tablet bestaat hover niet. */}
              <span className="ab-module-info" ref={uitlegRef}>
                <button
                  type="button"
                  className="ab-info-knop"
                  aria-label="Hoe werken de tijden en de ploeg?"
                  aria-expanded={uitlegOpen}
                  onClick={() => setUitlegOpen(o => !o)}
                >
                  <Info size={15} strokeWidth={2} />
                </button>
                {uitlegOpen && (
                  <span className="ab-uitleg" role="dialog" aria-label="Tijden en ploeg">
                    <span className="ab-uitleg-kop">
                      Tijden en ploeg
                      <button type="button" className="ab-uitleg-x" aria-label="Sluiten" onClick={() => setUitlegOpen(false)}><X size={13} /></button>
                    </span>
                    Vul per dag de begin- en eindtijd in. Een nieuwe dag neemt de tijd van de dag ervoor over.
                    {meer ? ' Met "voor alle dagen" zet je de tijd van de eerste dag op elke dag.' : ''}
                    {ploeg.length > 0 ? ' Klik op iemands avatar om die persoon van een dag af te halen of een eigen tijd te geven.' : ''}
                  </span>
                )}
              </span>
            </div>

            {datums.map((d, i) => {
              const t = tijdVanDag(p, d, standaard);
              const eigenPloeg = Array.isArray(p.ploeg?.[d]);
              const eigenTijden = p.persoonTijden?.[d] || {};
              const afwijkers = ploeg.filter(m => dagPloeg(d).includes(m.id) && eigenTijden[m.id]);
              const open = eigenTijdOpen?.datum === d ? ploeg.find(m => m.id === eigenTijdOpen.pid) : null;
              return (
                <div key={d} className={`wbd-dag${eigenPloeg ? ' eigen-ploeg' : ''}`}>
                  <span className="wbd-dag-datum">{korteDatum(d)}</span>
                  <input type="time" value={t.starttijd} onChange={e => zetDagTijd(d, { starttijd: e.target.value })} disabled={disabled} aria-label={`Begintijd ${korteDatum(d)}`} />
                  <span className="wbd-dag-tijd">→</span>
                  <input type="time" value={t.eindtijd} onChange={e => zetDagTijd(d, { eindtijd: e.target.value })} disabled={disabled} aria-label={`Eindtijd ${korteDatum(d)}`} />
                  {i === 0 && meer && !iedereenGelijk && (
                    <button type="button" className="wbd-alle" onClick={voorAlleDagen} disabled={disabled}>voor alle dagen</button>
                  )}
                  {ploeg.length > 0 && (
                    <span className="wbd-ploeg">
                      {ploeg.map(m => {
                        const werkt = dagPloeg(d).includes(m.id);
                        const eigen = werkt ? eigenTijden[m.id] : null;
                        const tip = `${m.naam}${eigen ? ` · ${eigen.starttijd || '?'}–${eigen.eindtijd || '?'}` : ''}${werkt ? '' : ' — niet op deze dag'}`;
                        // Staat deze persoon op dat moment al ergens anders?
                        const persoonTijd = eigen?.starttijd ? eigen : t;
                        const dubbel = werkt
                          ? dubbeleBoekingen({ ...bezetting, werkbonId, negeerActiviteitId: activiteitId, datum: d, pid: m.id, starttijd: persoonTijd.starttijd, eindtijd: persoonTijd.eindtijd })
                          : [];
                        const sleutel = `${d}|${m.id}`;
                        return (
                          <span key={m.id} className="wbd-persoon">
                          {/* Klik op de avatar = het acties-menu (hetzelfde als bij
                              facturen en offertes): wel/niet op deze dag, een eigen
                              tijd, of terug naar de tijd van de dag. */}
                          <ActieMenu
                            titel={`Opties voor ${m.naam}`}
                            items={[
                              {
                                label: werkt ? 'Niet op deze dag' : 'Wel op deze dag',
                                icon: werkt ? <UserMinus size={14} /> : <UserPlus size={14} />,
                                onClick: () => wisselPersoon(d, m.id),
                              },
                              werkt && {
                                label: 'Andere tijd voor deze persoon',
                                icon: <Clock size={14} />,
                                onClick: () => openEigenTijd(d, m.id),
                              },
                              eigen && {
                                label: 'Terug naar de tijd van de dag',
                                icon: <RotateCcw size={14} />,
                                onClick: () => {
                                  wisEigenTijd(d, m.id);
                                  if (eigenTijdOpen?.datum === d && eigenTijdOpen?.pid === m.id) setEigenTijdOpen(null);
                                },
                              },
                            ]}
                            trigger={({ open: menuOpen, wissel }) => (
                              <button
                                type="button"
                                className={`wbd-ploeg-chip${werkt ? ' aan' : ''}${eigen ? ' eigen-tijd' : ''}`}
                                onClick={wissel}
                                disabled={disabled}
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                aria-label={`${m.naam} ${werkt ? 'werkt' : 'werkt niet'} op ${korteDatum(d)}${eigen ? `, eigen tijd ${eigen.starttijd}–${eigen.eindtijd}` : ''}. Klik voor opties.`}
                                data-tip={menuOpen ? undefined : tip}
                              >
                                <MedewerkerAvatar m={m} />
                              </button>
                            )}
                          />
                          {dubbel.length > 0 && (
                            // Oranje driehoekje: deze persoon staat op dat moment al
                            // op iets anders. Uitleg op klik, zoals het info-icoontje.
                            <span className="ab-module-info wbd-dubbel">
                              <button
                                type="button"
                                className="wbd-dubbel-knop"
                                aria-label={`${m.naam} staat op ${korteDatum(d)} dubbel ingepland — uitleg`}
                                aria-expanded={dubbelOpen === sleutel}
                                onClick={() => setDubbelOpen(o => (o === sleutel ? null : sleutel))}
                              >
                                <AlertTriangle size={13} strokeWidth={2.2} />
                              </button>
                              {dubbelOpen === sleutel && (
                                <span className="ab-uitleg" role="dialog" aria-label="Dubbel ingepland">
                                  <span className="ab-uitleg-kop">
                                    Dubbel ingepland
                                    <button type="button" className="ab-uitleg-x" aria-label="Sluiten" onClick={() => setDubbelOpen(null)}><X size={13} /></button>
                                  </span>
                                  {m.naam} staat op {korteDatum(d)} al ingepland: {dubbel.map(c => `${c.titel} (${c.starttijd || '?'}–${c.eindtijd || '?'})`).join(', ')}.
                                  {' '}Met deze werkbon wordt {m.naam} op dat moment dubbel ingepland.
                                </span>
                              )}
                            </span>
                          )}
                          </span>
                        );
                      })}
                    </span>
                  )}
                  {afwijkers.length > 0 && !open && (
                    // Wijkt iemand af, dan het hele overzicht van die dag: wie werkt
                    // er, en van hoe laat tot hoe laat — ook wie de dagtijd volgt.
                    <div className="wbd-dag-eigen">
                      {ploeg.filter(m => dagPloeg(d).includes(m.id)).map(m => {
                        const pt = eigenTijden[m.id] || t;
                        return (
                          <span key={m.id} className={`wbd-dag-persoon${eigenTijden[m.id] ? ' eigen' : ''}`}>
                            <span>{m.naam}</span>
                            <span>{pt.starttijd || '?'}–{pt.eindtijd || '?'}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {open && (
                    <div className="wbd-pt" role="group" aria-label={`Eigen tijd voor ${open.naam}`}>
                      <div className="wbd-pt-kop">Eigen tijd voor {open.naam} · {korteDatum(d)}</div>
                      <div className="wbd-tijd">
                        <input type="time" value={eigenTijden[open.id]?.starttijd || ''} onChange={e => zetEigenTijd(d, open.id, { starttijd: e.target.value })} aria-label={`Begintijd ${open.naam}`} />
                        <span className="wbd-dag-tijd">→</span>
                        <input type="time" value={eigenTijden[open.id]?.eindtijd || ''} onChange={e => zetEigenTijd(d, open.id, { eindtijd: e.target.value })} aria-label={`Eindtijd ${open.naam}`} />
                      </div>
                      <div className="wbd-pt-knoppen">
                        <button type="button" className="wbd-link" onClick={() => { wisEigenTijd(d, open.id); setEigenTijdOpen(null); }}>Zelfde tijd als de rest</button>
                        <button type="button" className="btn btn-p btn-sm" onClick={() => setEigenTijdOpen(null)}>Klaar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {fout && <div className="wbd-fout" role="alert">{fout}</div>}
    </div>
  );
}

// ── Locatie ──────────────────────────────────────────────────────────────────

/**
 * Het adres van de klant als locatie. Bij een nieuwe werkbon gaat dat vanzelf,
 * zolang de gebruiker nog geen eigen locatie typte. Staat er al een andere
 * locatie — altijd bij een bestaande werkbon — dan vragen we het, want een klus
 * is niet altijd op het adres van de klant.
 */
export function useKlantAdres({ customers, locatie, setLocatie, vragenBijWijzigen = false }) {
  // De laatste waarde die wíj invulden; zolang die er staat, mag hij stil mee.
  const automatischRef = useRef(null);
  const [voorstel, setVoorstel] = useState(null);

  const klantGekozen = klantId => {
    setVoorstel(null);
    const klant = (customers || []).find(c => c.id === klantId);
    const adres = klant ? adresRegel(klant) : '';
    if (!adres) return;
    const huidig = (locatie || '').trim();
    if (huidig === adres) return;
    const stilInvullen = !huidig || (!vragenBijWijzigen && huidig === automatischRef.current);
    if (stilInvullen) {
      automatischRef.current = adres;
      setLocatie(adres);
      return;
    }
    setVoorstel({ adres, klantNaam: klant.name });
  };

  const neemOver = () => {
    if (voorstel) {
      automatischRef.current = voorstel.adres;
      setLocatie(voorstel.adres);
    }
    setVoorstel(null);
  };

  return { klantGekozen, voorstel, neemOver, houdHuidige: () => setVoorstel(null) };
}

/** Locatieveld met de PDOK-adreszoeker, plus de vraag uit useKlantAdres. */
export function WerkbonLocatieVeld({ value, onChange, voorstel, onNeemOver, onHoudHuidige, disabled = false, className = '', style }) {
  return (
    <div className={className} style={style}>
      <AdresZoeker
        className="adres-zoeker-veld"
        label="Locatie"
        value={value || ''}
        onChange={onChange}
        volledigAdres
        disabled={disabled}
        placeholder="Zoek straat + huisnummer + plaats"
        hint="Kies een adres uit de lijst, of typ zelf een omschrijving (bijv. bouwkavel)."
      />
      {voorstel && (
        <div className="wb-adres-vraag" role="status">
          <span>Adres van {voorstel.klantNaam} overnemen? <strong>{voorstel.adres}</strong></span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-p btn-sm" onClick={onNeemOver}>Overnemen</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onHoudHuidige}>Huidige houden</button>
          </span>
        </div>
      )}
    </div>
  );
}
