import { useEffect, useRef, useState } from 'react';
import AdresZoeker, { adresRegel } from './AdresZoeker.jsx';
import { vandaagIso } from '../lib/datumTijd.js';
import {
  controleerPlanning, geplandeDatums, isWeekend, korteDatum, maandNaam, periodeDatums,
  periodeHeeftWeekend, plusDagen, wisselDag, zetStartdatum,
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
        <input type="time" value={hhmm(starttijd)} onChange={e => onTijden?.({ starttijd: e.target.value })} disabled={disabled} aria-label="Starttijd" />
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
 * Eén maand, maandag eerst. Een tik op een dag voegt hem toe of haalt hem weg —
 * geen losse knop meer. Groen = gepland, gearceerd = binnen de periode maar
 * weggetikt, zwart omrand = startdatum.
 */
function Kalender({ p, onWissel, disabled }) {
  const [zicht, setZicht] = useState(() => maandVan(p.startdatum));
  // Een andere startdatum via het datumveld: de kalender springt mee.
  useEffect(() => {
    if (p.startdatum) setZicht(maandVan(p.startdatum));
  }, [p.startdatum]);

  const gepland = new Set(geplandeDatums(p));
  const periode = new Set(periodeDatums(p));
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
          const isGepland = gepland.has(iso);
          const isStart = iso === p.startdatum;
          const klassen = [
            'wbd-kal-dag',
            isGepland && 'is-gepland',
            isStart && 'is-start',
            !isGepland && periode.has(iso) && 'is-uit',
            isWeekend(iso) && 'is-weekend',
            iso === vandaag && 'is-vandaag',
          ].filter(Boolean).join(' ');
          const titel = isStart
            ? 'Startdatum — wijzig die in het datumveld'
            : isGepland ? `${korteDatum(iso)} weghalen` : `${korteDatum(iso)} toevoegen`;
          return (
            <button
              key={iso}
              type="button"
              className={klassen}
              disabled={disabled || (!!p.startdatum && iso < p.startdatum)}
              onClick={() => onWissel(iso)}
              title={titel}
              aria-pressed={isGepland}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="wbd-kal-uitleg">
        {p.startdatum ? 'Tik op een dag om hem toe te voegen of weg te halen.' : 'Tik op de eerste dag van de klus.'}
      </div>
    </div>
  );
}

// ── Dagen ────────────────────────────────────────────────────────────────────

/**
 * Startdatum, optioneel een einddatum (periode), de tijd en een kalender om
 * losse dagen aan of uit te tikken. Zodra het meer dan één dag is, verschijnt
 * de dagenlijst: per dag een afwijkende tijd, en per dag wie er werkt.
 *
 * `ploeg` = de medewerkers van de werkbon als [{ id, naam }]. Standaard werkt
 * iedereen elke dag; tik iemand weg op een dag dat hij er niet is.
 */
export function WerkbonDagenVelden({
  planning: p, onChange, starttijd, eindtijd, onTijden, ploeg = [],
  disabled = false, className = '', style, meerdaags = true, onUpgrade,
}) {
  // Het aantal dagen bij het openen. Zonder planningsmodule tonen we dat alleen;
  // bij het schuiven van de startdatum mag die melding niet mee verspringen.
  const [aantalBijOpenen] = useState(() => geplandeDatums(p).length);
  const set = patch => onChange({ ...p, ...patch });

  // Zonder planningsmodule: één datum en de tijd. Meerdere dagen, tijden per dag
  // en de ploeg per dag horen bij de planningsmodule — Team, of als module bij
  // Groei. Een werkbon die al meerdere dagen heeft (ingepland toen de module er
  // wel was) houdt die; een andere startdatum schuift ze in zijn geheel mee.
  if (!meerdaags) {
    return (
      <div className={`wbd ${className}`} style={style}>
        <div className="wbd-rij">
          <div className="f">
            <label>{aantalBijOpenen > 1 ? 'Startdatum' : 'Datum'}</label>
            <input type="date" value={p.startdatum} onChange={e => set({ startdatum: e.target.value })} disabled={disabled} />
          </div>
          <TijdVelden label="Tijd" starttijd={starttijd} eindtijd={eindtijd} onTijden={onTijden} disabled={disabled} />
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
  const datums = fout ? [] : geplandeDatums(p);
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
  const wisselPersoon = (datum, id) => {
    const nu = dagPloeg(datum).filter(x => ploegIds.includes(x));
    const nieuw = nu.includes(id) ? nu.filter(x => x !== id) : [...nu, id];
    const rest = { ...(p.ploeg || {}) };
    if (nieuw.length === ploegIds.length && ploegIds.every(x => nieuw.includes(x))) delete rest[datum];
    else rest[datum] = nieuw;
    set({ ploeg: rest });
  };

  return (
    <div className={`wbd ${className}`} style={style}>
      <div className="wbd-rij">
        <div className="f">
          <label>Startdatum</label>
          <input type="date" value={p.startdatum} onChange={e => onChange(zetStartdatum(p, e.target.value))} disabled={disabled} />
        </div>
        <div className="f">
          <label>Einddatum <span className="wbd-opt">(optioneel)</span></label>
          <input
            type="date" value={p.einddatum} min={p.startdatum ? plusDagen(p.startdatum, 1) : undefined}
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

      <div className="wbd-rij">
        <TijdVelden
          label={meer ? 'Tijd (elke dag)' : 'Tijd'}
          starttijd={starttijd} eindtijd={eindtijd} onTijden={onTijden} disabled={disabled}
        />
      </div>

      <div className="wbd-kal-wrap">
        <Kalender p={p} onWissel={iso => onChange(wisselDag(p, iso))} disabled={disabled} />

        {meer && (
          <div className="wbd-lijst">
            <div className="wbd-lijst-kop">{datums.length} dagen gepland · standaardtijd {standaard}</div>
            {ploeg.length > 0 && (
              <div className="wbd-lijst-uitleg">
                Standaard werkt de hele ploeg elke dag. Tik iemand weg op een dag dat hij er niet is.
              </div>
            )}
            {datums.map(d => {
              const af = p.afwijkend[d];
              const eigenPloeg = Array.isArray(p.ploeg?.[d]);
              return (
                <div key={d} className={`wbd-dag${eigenPloeg ? ' eigen-ploeg' : ''}`}>
                  <span className="wbd-dag-datum">{korteDatum(d)}</span>
                  {af ? (
                    <>
                      <input type="time" value={af.starttijd || ''} onChange={e => zetAfwijking(d, { starttijd: e.target.value })} disabled={disabled} aria-label={`Starttijd ${korteDatum(d)}`} />
                      <span className="wbd-dag-tijd">→</span>
                      <input type="time" value={af.eindtijd || ''} onChange={e => zetAfwijking(d, { eindtijd: e.target.value })} disabled={disabled} aria-label={`Eindtijd ${korteDatum(d)}`} />
                      <button type="button" className="wbd-link" onClick={() => wisAfwijking(d)} disabled={disabled}>standaardtijd</button>
                    </>
                  ) : (
                    <>
                      <span className="wbd-dag-tijd">{standaard}</span>
                      <button type="button" className="wbd-link" onClick={() => zetAfwijking(d, {})} disabled={disabled}>andere tijd</button>
                    </>
                  )}
                  {ploeg.length > 0 && (
                    <span className="wbd-ploeg">
                      {ploeg.map(m => {
                        const aan = dagPloeg(d).includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={`wbd-ploeg-chip${aan ? ' aan' : ''}`}
                            onClick={() => wisselPersoon(d, m.id)}
                            disabled={disabled}
                            aria-pressed={aan}
                            title={aan
                              ? `${m.naam} werkt op ${korteDatum(d)} — tik om weg te halen`
                              : `${m.naam} is er op ${korteDatum(d)} niet — tik om toe te voegen`}
                          >
                            {initialen(m.naam)}
                          </button>
                        );
                      })}
                    </span>
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
