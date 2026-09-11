import { useRef, useState } from 'react';
import AdresZoeker, { adresRegel } from './AdresZoeker.jsx';
import {
  controleerPlanning, dagenUitPlanning, korteDatum, periodeHeeftWeekend, plusDagen,
} from '../utils/werkbonDagen.js';

// Gedeelde velden voor elk werkbonformulier (werkbonpagina, planning): de
// geplande dagen en de locatie. Zie utils/werkbonDagen.js voor het model.

const hhmm = t => (t ? String(t).slice(0, 5) : '');

// ── Dagen ────────────────────────────────────────────────────────────────────

/**
 * Startdatum, optioneel een einddatum (periode) en losse extra dagen. Zodra het
 * meer dan één dag is, verschijnt de lijst met dagen; daar kan per dag een
 * afwijkende tijd, verder geldt de standaardtijd van de werkbon.
 */
export function WerkbonDagenVelden({
  planning: p, onChange, starttijd, eindtijd, disabled = false, className = '', style,
  meerdaags = true, onUpgrade,
}) {
  const [nieuweDag, setNieuweDag] = useState('');
  // Het aantal dagen bij het openen. Zonder planningsmodule tonen we dat alleen;
  // bij het schuiven van de startdatum mag die melding niet mee verspringen.
  const [aantalBijOpenen] = useState(() => dagenUitPlanning(p).length);
  const set = patch => onChange({ ...p, ...patch });

  // Zonder planningsmodule: één datum. Meerdere dagen (periode, losse dagen,
  // tijden per dag) hoort bij de planningsmodule — Team, of als module bij
  // Groei. Een werkbon die al meerdere dagen heeft (ingepland toen de module er
  // wel was) houdt die; een andere startdatum schuift ze in zijn geheel mee.
  if (!meerdaags) {
    return (
      <div className={`wbd ${className}`} style={style}>
        <div className="f">
          <label>{aantalBijOpenen > 1 ? 'Startdatum' : 'Datum'}</label>
          <input type="date" value={p.startdatum} onChange={e => set({ startdatum: e.target.value })} disabled={disabled} />
        </div>
        {aantalBijOpenen > 1 ? (
          <div className="wbd-slot">
            Deze werkbon staat op {aantalBijOpenen} dagen. Een andere startdatum schuift alle dagen mee;
            de dagen zelf aanpassen kan met de planningsmodule.
          </div>
        ) : (
          <div className="wbd-slot">
            Een klus over meerdere dagen plannen? Dat zit in de{' '}
            <button type="button" className="wbd-link-inline" onClick={onUpgrade}>planningsmodule</button>.
          </div>
        )}
      </div>
    );
  }

  const fout = controleerPlanning(p);
  const dagen = fout ? [] : dagenUitPlanning(p);
  const standaard = hhmm(starttijd)
    ? `${hhmm(starttijd)}${hhmm(eindtijd) ? `–${hhmm(eindtijd)}` : ''}`
    : 'nog geen tijd';
  const naStart = p.startdatum ? plusDagen(p.startdatum, 1) : undefined;

  // Een einddatum die niet meer ná de nieuwe start ligt, heeft geen betekenis meer.
  const zetStart = v => set({ startdatum: v, einddatum: p.einddatum && v && p.einddatum <= v ? '' : p.einddatum });

  const voegToe = () => {
    if (!nieuweDag) return;
    if (nieuweDag !== p.startdatum && !p.extra.includes(nieuweDag)) {
      set({ extra: [...p.extra, nieuweDag].sort() });
    }
    setNieuweDag('');
  };

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

  return (
    <div className={`wbd ${className}`} style={style}>
      <div className="wbd-rij">
        <div className="f">
          <label>Startdatum</label>
          <input type="date" value={p.startdatum} onChange={e => zetStart(e.target.value)} disabled={disabled} />
        </div>
        <div className="f">
          <label>Einddatum <span className="wbd-opt">(optioneel)</span></label>
          <input
            type="date" value={p.einddatum} min={naStart}
            onChange={e => set({ einddatum: e.target.value })}
            disabled={disabled || !p.startdatum}
            title={p.startdatum ? 'Laatste dag van een aaneengesloten periode' : 'Kies eerst een startdatum'}
          />
        </div>
      </div>

      {periodeHeeftWeekend(p) && (
        <label className="wbd-check">
          <input type="checkbox" checked={p.weekend} onChange={e => set({ weekend: e.target.checked })} disabled={disabled} />
          Ook op zaterdag en zondag
        </label>
      )}

      <div className="wbd-extra">
        <span className="wbd-extra-label">Losse extra dagen</span>
        {p.extra.map(d => (
          <span key={d} className="wbd-chip">
            {korteDatum(d)}
            <button type="button" onClick={() => set({ extra: p.extra.filter(x => x !== d) })} disabled={disabled} aria-label={`${korteDatum(d)} weghalen`}>×</button>
          </span>
        ))}
        <span className="wbd-extra-add">
          <input
            type="date" value={nieuweDag} min={naStart}
            onChange={e => setNieuweDag(e.target.value)}
            disabled={disabled || !p.startdatum}
            aria-label="Extra dag kiezen"
          />
          <button type="button" className="btn btn-s btn-sm" onClick={voegToe} disabled={disabled || !nieuweDag}>+ Dag</button>
        </span>
      </div>

      {fout && <div className="wbd-fout" role="alert">{fout}</div>}

      {dagen.length > 1 && (
        <div className="wbd-lijst">
          <div className="wbd-lijst-kop">{dagen.length} dagen gepland · standaardtijd {standaard}</div>
          {dagen.map(d => {
            const af = p.afwijkend[d.datum];
            return (
              <div key={d.datum} className="wbd-dag">
                <span className="wbd-dag-datum">{korteDatum(d.datum)}</span>
                {af ? (
                  <>
                    <input type="time" value={af.starttijd || ''} onChange={e => zetAfwijking(d.datum, { starttijd: e.target.value })} disabled={disabled} aria-label={`Starttijd ${korteDatum(d.datum)}`} />
                    <span className="wbd-dag-tijd">→</span>
                    <input type="time" value={af.eindtijd || ''} onChange={e => zetAfwijking(d.datum, { eindtijd: e.target.value })} disabled={disabled} aria-label={`Eindtijd ${korteDatum(d.datum)}`} />
                    <button type="button" className="wbd-link" onClick={() => wisAfwijking(d.datum)} disabled={disabled}>standaardtijd</button>
                  </>
                ) : (
                  <>
                    <span className="wbd-dag-tijd">{standaard}</span>
                    <button type="button" className="wbd-link" onClick={() => zetAfwijking(d.datum, {})} disabled={disabled}>andere tijd</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
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
