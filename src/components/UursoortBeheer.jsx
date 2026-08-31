// Beheer van de uursoorten: het lijstje waaruit je kiest bij het boeken van uren.
//
// Puur labels. Er hangt bewust GEEN tarief aan — de prijs van een uur staat op
// één plek (Uurtarief bij Standaardwaarden) en dat moet zo blijven; twee
// getallen die hetzelfde horen te zijn, lopen uit elkaar.
//
// Zelfde opzet als de kostencategorieën: drie standaardsoorten die je niet kunt
// verwijderen, zelf aanvullen mag, en wat in gebruik is zet je op inactief in
// plaats van weg te gooien.

import { useEffect, useState } from 'react';
import { useToast } from '../lib/toast.jsx';
import {
  listUursoorten, createUursoort, updateUursoort, deleteUursoort, getUursoortGebruik,
} from '../services/uursoortService.js';

export default function UursoortBeheer() {
  const toast = useToast();
  const [soorten, setSoorten] = useState([]);
  const [gebruik, setGebruik] = useState({});
  const [laden, setLaden] = useState(true);
  const [nieuw, setNieuw] = useState('');
  const [bezig, setBezig] = useState(false);
  const [bewerktId, setBewerktId] = useState(null);
  const [bewerktNaam, setBewerktNaam] = useState('');

  const laad = () => {
    setLaden(true);
    Promise.all([listUursoorten({ inclusiefInactief: true }), getUursoortGebruik()])
      .then(([l, g]) => { setSoorten(l); setGebruik(g); })
      .catch(() => {})
      .finally(() => setLaden(false));
  };
  useEffect(laad, []);

  const voegToe = async () => {
    if (!nieuw.trim()) return;
    setBezig(true);
    try {
      const s = await createUursoort(nieuw);
      setSoorten(l => [...l, s]);
      setNieuw('');
      toast.success(`"${s.naam}" toegevoegd`);
    } catch (err) {
      toast.error(err.message || 'Toevoegen mislukt');
    } finally {
      setBezig(false);
    }
  };

  const zetActief = async (s, actief) => {
    try {
      const bij = await updateUursoort(s.id, { actief });
      setSoorten(l => l.map(x => (x.id === s.id ? bij : x)));
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    }
  };

  const hernoem = async (s) => {
    const naam = bewerktNaam.trim();
    setBewerktId(null);
    if (!naam || naam === s.naam) return;
    try {
      const bij = await updateUursoort(s.id, { naam });
      setSoorten(l => l.map(x => (x.id === s.id ? bij : x)));
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    }
  };

  const verwijder = async (s) => {
    if (!confirm(`"${s.naam}" verwijderen?`)) return;
    try {
      await deleteUursoort(s.id);
      setSoorten(l => l.filter(x => x.id !== s.id));
      toast.success(`"${s.naam}" verwijderd`);
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  const actieveAantal = soorten.filter(s => s.actief).length;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div className="card-title">Uursoorten</div>
        <div className="card-sub">
          Waaruit je kiest bij het boeken van uren. Alleen een label — het uurtarief hierboven
          geldt voor alle soorten.
        </div>
      </div>

      {laden && <div style={{ fontSize: '.82rem', color: 'var(--dl)' }}>Laden…</div>}

      {!laden && actieveAantal <= 1 && (
        <div style={{
          fontSize: '.8rem', color: 'var(--dm)', background: 'var(--bgs)',
          border: '1px solid var(--border)', borderRadius: 'var(--r8)',
          padding: '9px 12px', marginBottom: 10,
        }}>
          Met één actieve soort wordt de keuze niet getoond bij het boeken — dat scheelt de
          monteur een handeling. Zet er een tweede aan en de keuzelijst verschijnt vanzelf.
        </div>
      )}

      {!laden && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {soorten.map(s => {
            const aantal = gebruik[s.id] || 0;
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  border: '1px solid var(--border)', borderRadius: 'var(--r8)',
                  background: s.actief ? '#fff' : 'var(--bgs)',
                  opacity: s.actief ? 1 : 0.7,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {bewerktId === s.id ? (
                    <input
                      autoFocus
                      value={bewerktNaam}
                      onChange={e => setBewerktNaam(e.target.value)}
                      onBlur={() => hernoem(s)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') hernoem(s);
                        if (e.key === 'Escape') setBewerktId(null);
                      }}
                      style={{ width: '100%', fontSize: '.86rem' }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setBewerktId(s.id); setBewerktNaam(s.naam); }}
                      title="Naam wijzigen"
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontWeight: 600, fontSize: '.86rem', color: 'var(--dk)', textAlign: 'left',
                      }}
                    >
                      {s.naam}
                    </button>
                  )}
                  <div style={{ fontSize: '.72rem', color: 'var(--dl)' }}>
                    {s.standaard ? 'standaard' : 'zelf toegevoegd'}
                    {' · '}
                    {aantal ? `${aantal} ${aantal === 1 ? 'urenregel' : 'urenregels'}` : 'ongebruikt'}
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem', color: 'var(--dm)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={s.actief}
                    onChange={e => zetActief(s, e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Actief
                </label>

                {/* Standaardsoorten blijven staan; in gebruik = inactief zetten. */}
                {!s.standaard && aantal === 0 && (
                  <button className="btn btn-ghost btn-xs" onClick={() => verwijder(s)}>
                    Verwijderen
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && voegToe()}
          placeholder="Nieuwe soort, bijvoorbeeld Storingsdienst"
          style={{ flex: 1, minWidth: 0, fontSize: '.86rem' }}
        />
        <button className="btn btn-p btn-sm" onClick={voegToe} disabled={bezig || !nieuw.trim()}>
          Toevoegen
        </button>
      </div>
    </div>
  );
}
