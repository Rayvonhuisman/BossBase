import { useRef, useState } from 'react';
import AdresZoeker, { adresRegel } from './AdresZoeker.jsx';
import { vandaagIso } from '../lib/datumTijd.js';
import {
  STANDAARD_TIJD, controleerPlanning, geplandeDatums, isWeekend, korteDatum, maandNaam,
  verplaatsNaar, wisselDag,
} from '../utils/werkbonDagen.js';

// Gedeelde velden voor elk werkbonformulier (werkbonpagina, planning): de
// geplande dagen, de tijden, de ploeg per dag en de locatie. Zie
// utils/werkbonDagen.js voor het model.

const hhmm = t => (t ? String(t).slice(0, 5) : '');
const pad = n => String(n).padStart(2, '0');
const initialen = naam => (naam || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

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
 * De kalender met daaronder de tijd. Zodra het meer dan één dag is, verschijnt
 * ernaast de dagenlijst: per dag een afwijkende tijd, en per dag wie er werkt.
 *
 * `ploeg` = de medewerkers van de werkbon als [{ id, naam }]. Standaard werkt
 * iedereen elke dag; tik iemand weg op een dag dat hij er niet is.
 */
export function WerkbonDagenVelden({
  planning: p, onChange, starttijd, eindtijd, onTijden, ploeg = [],
  disabled = false, className = '', style, meerdaags = true, onUpgrade,
}) {
  // Het aantal dagen bij het openen. Zonder planningsmodule tonen we dat alleen;
  // bij het verplaatsen van de klus mag die melding niet mee verspringen.
  const [aantalBijOpenen] = useState(() => geplandeDatums(p).length);
  // Het invulvak "eigen tijd" dat open staat: { datum, pid } of null.
  const [eigenTijdOpen, setEigenTijdOpen] = useState(null);
  // Lang indrukken op de initialen = eigen tijd; de klik die daarop volgt mag
  // de persoon dan niet ook nog aan/uit zetten.
  const druk = useRef({ timer: null, lang: false });
  const set = patch => onChange({ ...p, ...patch });
  const datums = geplandeDatums(p);
  const fout = controleerPlanning(p, { starttijd, eindtijd });

  // Eerste dag aangetikt en nog geen tijd: de gewone werkdag alvast invullen.
  // Een dag zonder tijd valt uit de planning; zo hoeft bijna niemand iets te typen.
  const vulTijdIn = () => {
    if (!hhmm(starttijd) && !hhmm(eindtijd)) onTijden?.({ ...STANDAARD_TIJD });
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
  const standaard = hhmm(starttijd)
    ? `${hhmm(starttijd)}${hhmm(eindtijd) ? `–${hhmm(eindtijd)}` : ''}`
    : 'nog geen tijd';
  const ploegIds = ploeg.map(m => m.id);
  const dagPloeg = datum => (Array.isArray(p.ploeg?.[datum]) ? p.ploeg[datum] : ploegIds);

  const zetAfwijking = (datum, patch) => set({
    afwijkend: {
      ...p.afwijkend,
      [datum]: { starttijd: hhmm(starttijd), eindtijd: hhmm(eindtijd), ...p.afwijkend[datum], ...patch },
    },
  });
  const wisAfwijking = datum => {
    const rest = { ...p.afwijkend };
    delete rest[datum];
    set({ afwijkend: rest });
  };

  // Iemand op één dag weg- of terugtikken. Is het daarna weer de hele ploeg, dan
  // vervalt de afwijking: die dag volgt dan gewoon de ploeg van de werkbon.
  // Wie er uit gaat, verliest ook zijn eigen tijd op die dag.
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
  const dagTijd = d => ((meer && p.afwijkend?.[d]) ? p.afwijkend[d] : { starttijd: hhmm(starttijd), eindtijd: hhmm(eindtijd) });
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
    if (!p.persoonTijden?.[d]?.[pid]) zetEigenTijd(d, pid, { ...dagTijd(d) });
    setEigenTijdOpen({ datum: d, pid });
  };
  const startDruk = (d, pid) => {
    druk.current.lang = false;
    clearTimeout(druk.current.timer);
    druk.current.timer = setTimeout(() => { druk.current.lang = true; openEigenTijd(d, pid); }, 450);
  };
  const stopDruk = () => clearTimeout(druk.current.timer);

  return (
    <div className={`wbd ${className}`} style={style}>
      <span className="wbd-kop">Dagen</span>
      <div className="wbd-kal-wrap">
        <div className="wbd-kal-kolom">
          <Kalender
            p={p}
            disabled={disabled}
            onTik={iso => { if (!datums.length) vulTijdIn(); onChange(wisselDag(p, iso)); }}
          />
          <TijdVelden
            label={meer ? 'Tijd (elke dag)' : 'Tijd'}
            starttijd={starttijd} eindtijd={eindtijd} onTijden={onTijden} disabled={disabled}
          />
        </div>

        {/* Ook bij één dag als er twee of meer mensen op staan: daar zet je
            een eigen tijd per persoon. */}
        {datums.length > 0 && (meer || ploeg.length > 1) && (
          <div className="wbd-lijst">
            <div className="wbd-lijst-kop">
              {meer ? `${datums.length} dagen gepland · standaardtijd ${standaard}` : `${korteDatum(datums[0])} · ${standaard}`}
            </div>
            {ploeg.length > 0 && (
              <div className="wbd-lijst-uitleg">
                {meer
                  ? 'Standaard werkt de hele ploeg elke dag, op dezelfde tijd. Tik iemand weg op een dag dat hij er niet is.'
                  : 'Standaard werkt de hele ploeg op dezelfde tijd.'}
                {' '}Rechtsklik of houd de initialen vast voor een eigen tijd.
              </div>
            )}
            {datums.map(d => {
              const af = meer ? p.afwijkend[d] : null;
              const eigenPloeg = Array.isArray(p.ploeg?.[d]);
              const eigenTijden = p.persoonTijden?.[d] || {};
              const afwijkers = ploeg.filter(m => dagPloeg(d).includes(m.id) && eigenTijden[m.id]);
              const open = eigenTijdOpen?.datum === d ? ploeg.find(m => m.id === eigenTijdOpen.pid) : null;
              return (
                <div key={d} className={`wbd-dag${eigenPloeg ? ' eigen-ploeg' : ''}`}>
                  <span className="wbd-dag-datum">{korteDatum(d)}</span>
                  {af ? (
                    <>
                      <input type="time" value={af.starttijd || ''} onChange={e => zetAfwijking(d, { starttijd: e.target.value })} disabled={disabled} aria-label={`Begintijd ${korteDatum(d)}`} />
                      <span className="wbd-dag-tijd">→</span>
                      <input type="time" value={af.eindtijd || ''} onChange={e => zetAfwijking(d, { eindtijd: e.target.value })} disabled={disabled} aria-label={`Eindtijd ${korteDatum(d)}`} />
                      <button type="button" className="wbd-link" onClick={() => wisAfwijking(d)} disabled={disabled}>standaardtijd</button>
                    </>
                  ) : (
                    <>
                      <span className="wbd-dag-tijd">{standaard}</span>
                      {meer && <button type="button" className="wbd-link" onClick={() => zetAfwijking(d, {})} disabled={disabled}>andere tijd</button>}
                    </>
                  )}
                  {ploeg.length > 0 && (
                    <span className="wbd-ploeg">
                      {ploeg.map(m => {
                        const werkt = dagPloeg(d).includes(m.id);
                        const eigen = werkt ? eigenTijden[m.id] : null;
                        const tip = `${m.naam}${eigen ? ` · ${eigen.starttijd || '?'}–${eigen.eindtijd || '?'}` : ''}${werkt ? ' · rechtsklik: eigen tijd' : ' — niet op deze dag'}`;
                        return (
                          // Tik = aan/uit voor die dag (de standaard, snel).
                          // Rechtsklik of lang indrukken = eigen tijd (de
                          // uitzondering). data-tip toont direct de naam en,
                          // als die er is, de eigen tijd; oranje ring = wijkt af.
                          <button
                            key={m.id}
                            type="button"
                            className={`wbd-ploeg-chip${werkt ? ' aan' : ''}${eigen ? ' eigen-tijd' : ''}`}
                            onClick={() => {
                              if (druk.current.lang) { druk.current.lang = false; return; }
                              wisselPersoon(d, m.id);
                            }}
                            onContextMenu={e => { e.preventDefault(); if (werkt && !disabled) openEigenTijd(d, m.id); }}
                            onPointerDown={() => { if (werkt && !disabled) startDruk(d, m.id); }}
                            onPointerUp={stopDruk}
                            onPointerLeave={stopDruk}
                            disabled={disabled}
                            aria-pressed={werkt}
                            aria-label={`${m.naam} ${werkt ? 'werkt' : 'werkt niet'} op ${korteDatum(d)}${eigen ? `, eigen tijd ${eigen.starttijd}–${eigen.eindtijd}` : ''}. Tik om te wisselen; rechtsklik of lang indrukken voor een eigen tijd.`}
                            data-tip={tip}
                          >
                            {initialen(m.naam)}
                          </button>
                        );
                      })}
                    </span>
                  )}
                  {afwijkers.length > 0 && !open && (
                    <div className="wbd-dag-eigen">
                      Eigen tijd: {afwijkers.map(m => `${m.naam} ${eigenTijden[m.id].starttijd || '?'}–${eigenTijden[m.id].eindtijd || '?'}`).join(' · ')}
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
