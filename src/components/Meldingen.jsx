import { useEffect, useState } from 'react';
import { useToast } from '../lib/toast.jsx';
import {
  listMeldingen, zetMeldingStatus, screenshotUrl, getMeldactieInstelling, zetMeldactie,
} from '../services/meldpuntService.js';

// Overzicht van de meldingen uit het meldpunt, voor het super-admin portaal.
// Hier staat ook de schakelaar voor de actie: uit betekent dat de prijzen uit
// het formulier verdwijnen, de meldknop blijft werken.

const STATUSSEN = [
  { key: 'nieuw',       label: 'Nieuw',       kleur: '#b45309', bg: '#fffbeb' },
  { key: 'opgepakt',    label: 'Opgepakt',    kleur: '#1d4ed8', bg: '#eff6ff' },
  { key: 'afgehandeld', label: 'Afgehandeld', kleur: '#15803d', bg: '#f0fdf4' },
  { key: 'afgewezen',   label: 'Afgewezen',   kleur: '#6b7280', bg: '#f3f4f6' },
];
const SOORT = {
  bug:  { label: 'Bug',  kleur: '#b91c1c', bg: '#fef2f2' },
  idee: { label: 'Idee', kleur: '#6d28d9', bg: '#f5f3ff' },
};

const statusInfo = k => STATUSSEN.find(s => s.key === k) || { label: k, kleur: '#6b7280', bg: '#f3f4f6' };
const fmt = d => d ? new Date(d).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const pill = (bg, kleur) => ({ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color: kleur, whiteSpace: 'nowrap' });

export function Meldingen() {
  const toast = useToast();
  const [rijen, setRijen] = useState([]);
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState('nieuw');
  const [soort, setSoort] = useState('alle');
  const [open, setOpen] = useState(null);
  const [actie, setActie] = useState(null);       // waarde uit platform_instellingen
  const [actieBezig, setActieBezig] = useState(false);

  const laad = () => {
    setLaden(true);
    Promise.all([listMeldingen(), getMeldactieInstelling()])
      .then(([m, a]) => { setRijen(m); setActie(a?.waarde ?? null); })
      .catch(e => toast.error(e.message || 'Meldingen laden mislukt'))
      .finally(() => setLaden(false));
  };
  useEffect(laad, []); // eslint-disable-line react-hooks/exhaustive-deps

  const zetStatus = async (id, status) => {
    try {
      await zetMeldingStatus(id, status);
      setRijen(rs => rs.map(r => r.id === id ? { ...r, status } : r));
    } catch (e) { toast.error(e.message); }
  };

  const wisselActie = async () => {
    if (!actie) return;
    const nieuw = { ...actie, actief: !actie.actief };
    setActieBezig(true);
    try {
      await zetMeldactie(nieuw);
      setActie(nieuw);
      toast.success(nieuw.actief ? 'Actie staat aan' : 'Actie staat uit; de meldknop blijft werken');
    } catch (e) { toast.error(e.message); }
    finally { setActieBezig(false); }
  };

  const bekijkScreenshot = async pad => {
    // Venster eerst openen, dan pas de URL zetten: na een await ziet de browser
    // het niet meer als een klik en blokkeert hij de pop-up.
    const w = window.open('', '_blank');
    try { const url = await screenshotUrl(pad); if (w) w.location.href = url; }
    catch (e) { w?.close(); toast.error(e.message); }
  };

  const zichtbaar = rijen
    .filter(r => filter === 'alle' || r.status === filter)
    .filter(r => soort === 'alle' || r.soort === soort);
  const nieuwCount = rijen.filter(r => r.status === 'nieuw').length;

  const knop = actief => ({
    padding: '4px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
    border: actief ? 'none' : '1px solid var(--br)',
    background: actief ? '#1DDB62' : 'transparent',
    color: actief ? '#0D0D0D' : '#6b7280',
    fontWeight: actief ? 700 : 500,
  });

  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Meldingen</div>
        {nieuwCount > 0 && <span style={pill('#fffbeb', '#b45309')}>{nieuwCount} nieuw</span>}
        <button className="btn btn-ghost btn-sm" onClick={laad} disabled={laden} style={{ marginLeft: 'auto' }}>
          {laden ? 'Laden…' : 'Vernieuwen'}
        </button>
      </div>

      {/* Actie-schakelaar */}
      {actie && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: actie.actief ? '#f0fdf4' : '#f8f9fa', border: '1px solid var(--border)', marginBottom: 14, fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700 }}>
            <input type="checkbox" checked={!!actie.actief} disabled={actieBezig} onChange={wisselActie} />
            Actie met prijzen {actie.actief ? 'aan' : 'uit'}
          </label>
          <span style={{ color: '#6b7280' }}>
            {(actie.prijzen || []).join(' · ')}
          </span>
          <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 'auto' }}>
            {actie.actief ? 'Melders zien de prijzen en doen mee.' : 'De meldknop werkt; de prijzen worden niet getoond.'}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[...STATUSSEN.map(s => s.key), 'alle'].map(k => (
          <button key={k} onClick={() => setFilter(k)} style={knop(filter === k)}>
            {k === 'alle' ? 'Alle' : statusInfo(k).label}
          </button>
        ))}
        <span style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        {['alle', 'bug', 'idee'].map(k => (
          <button key={k} onClick={() => setSoort(k)} style={knop(soort === k)}>
            {k === 'alle' ? 'Bugs en ideeën' : k === 'bug' ? 'Bugs' : 'Ideeën'}
          </button>
        ))}
      </div>

      {laden ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Laden…</div>
      ) : zichtbaar.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '10px 0' }}>
          {filter === 'nieuw' ? 'Geen nieuwe meldingen.' : 'Niets in deze selectie.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <th style={{ padding: '6px 10px 6px 0' }}>#</th>
                <th style={{ padding: '6px 10px' }}>Melding</th>
                <th style={{ padding: '6px 10px' }}>Van</th>
                <th style={{ padding: '6px 10px' }}>Waar</th>
                <th style={{ padding: '6px 10px' }}>Wanneer</th>
                <th style={{ padding: '6px 0 6px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map(r => {
                const s = SOORT[r.soort] || SOORT.bug;
                const uitgeklapt = open === r.id;
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: '9px 10px 9px 0', color: '#9ca3af' }}>{r.nummer}</td>
                    <td style={{ padding: '9px 10px', maxWidth: 420 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <span style={pill(s.bg, s.kleur)}>{s.label}</span>
                        {r.actie_deelname && <span style={{ fontSize: 11, color: '#15803d' }}>doet mee aan actie</span>}
                        {!r.mail_verstuurd_op && <span style={{ fontSize: 11, color: '#b91c1c' }}>mail niet verstuurd</span>}
                      </div>
                      <div
                        onClick={() => setOpen(uitgeklapt ? null : r.id)}
                        title={uitgeklapt ? 'Inklappen' : 'Alles tonen'}
                        style={{
                          cursor: 'pointer', whiteSpace: 'pre-wrap', lineHeight: 1.45,
                          ...(uitgeklapt ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
                        }}
                      >
                        {r.omschrijving}
                      </div>
                      {r.screenshot_pad && (
                        <button className="btn btn-ghost btn-xs" style={{ padding: '4px 0', marginTop: 4 }} onClick={() => bekijkScreenshot(r.screenshot_pad)}>
                          Schermafbeelding bekijken
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ fontWeight: 600 }}>{r.bedrijf_naam || '—'}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>
                        {r.gebruiker_naam || ''}{r.gebruiker_rol ? ` (${r.gebruiker_rol})` : ''}
                      </div>
                      {r.gebruiker_email && <a href={`mailto:${r.gebruiker_email}`} style={{ fontSize: 12 }}>{r.gebruiker_email}</a>}
                      {r.abonnement && <div style={{ color: '#9ca3af', fontSize: 12 }}>{r.abonnement}</div>}
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 12 }}>
                      <div>{r.pagina || '—'}</div>
                      <div style={{ color: '#9ca3af' }}>{r.browser || ''}</div>
                    </td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>{fmt(r.aangemaakt_op)}</td>
                    <td style={{ padding: '9px 0 9px 10px' }}>
                      <select value={r.status} onChange={e => zetStatus(r.id, e.target.value)} style={{ fontSize: 12, padding: '3px 6px' }}>
                        {STATUSSEN.map(s2 => <option key={s2.key} value={s2.key}>{s2.label}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
