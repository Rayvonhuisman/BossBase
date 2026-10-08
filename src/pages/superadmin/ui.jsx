import { createContext, useContext, useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Gedeelde bouwstenen van de superadmin. Alles met de klassen van het
// dashboard (page-hd, card, lsec, lrow, dt, badge, sc, tabs, drawer); wat
// ontbreekt staat in superadmin.css.

export const SaContext = createContext(null);
export const useSa = () => useContext(SaContext);

export const euro = (n, dec = 0) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(n) || 0);

export function datum(iso, jaar = false) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', ...(jaar ? { year: 'numeric' } : {}) });
}
export function tijdstip(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function geleden(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const dagen = Math.ceil(-diff / 86400000);
    return dagen <= 1 ? 'morgen' : `over ${dagen} dagen`;
  }
  const min = Math.floor(diff / 60000);
  if (min < 2) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const uur = Math.floor(min / 60);
  if (uur < 24) return `${uur} uur geleden`;
  const dagen = Math.floor(uur / 24);
  if (dagen < 7) return `${dagen} ${dagen === 1 ? 'dag' : 'dagen'} geleden`;
  return datum(iso, new Date(iso).getFullYear() !== new Date().getFullYear());
}
export const dagenSinds = iso => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);
export const dagenTot = iso => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : 0);

export const PAKKETTEN = [
  { id: 'starter', label: 'Starter', prijs: 29 },
  { id: 'groei', label: 'Groei', prijs: 39 },
  { id: 'team', label: 'Team', prijs: 59 },
];
export const pakketLabel = id => PAKKETTEN.find(p => p.id === id)?.label ?? (id || '—');

export function Kop({ titel, sub, children }) {
  return (
    <div className="page-hd afu">
      <div>
        <h1>{titel}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="page-hd-actions">{children}</div>}
    </div>
  );
}

export function Laden({ fout, herlaad }) {
  if (fout) {
    return (
      <div className="card card-p" style={{ color: '#dc2626', fontSize: 13 }}>
        {fout} {herlaad && <button className="btn btn-s btn-xs" style={{ marginLeft: 8 }} onClick={herlaad}>Opnieuw</button>}
      </div>
    );
  }
  return <div className="lsec-empty">Laden…</div>;
}

export function Stat({ label, waarde, sub, kleur }) {
  return (
    <div className="sc">
      <div className="sc-val" style={kleur ? { color: kleur } : undefined}>{waarde}</div>
      <div className="sc-label">{label}</div>
      {sub && <div className="sc-sub">{sub}</div>}
    </div>
  );
}

export function Tabs({ waarde, opties, onKies }) {
  return (
    <div className="tabs">
      {opties.map(o => (
        <button key={o.id} className={`tab${waarde === o.id ? ' active' : ''}`} onClick={() => onKies(o.id)}>
          {o.label}{o.n != null && o.n > 0 && <span className="sa-tab-n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Lade({ titel, sub, onSluit, acties, children }) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onSluit(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onSluit]);
  return (
    <>
      <div className="drawer-overlay" onClick={onSluit} />
      <div className="drawer">
        <div className="drawer-hd">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{titel}</div>
            {sub && <div style={{ fontSize: 12, color: 'var(--dl)', marginTop: 2 }}>{sub}</div>}
          </div>
          <button className="drawer-x" onClick={onSluit} aria-label="Sluiten"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          {acties && <div className="sa-knoppen" style={{ marginBottom: 20 }}>{acties}</div>}
          {children}
        </div>
      </div>
    </>
  );
}

export function Sectie({ titel, children, rechts }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="lsec-hd"><div className="lsec-title">{titel}</div>{rechts}</div>
      {children}
    </div>
  );
}

export function Rij({ label, waarde }) {
  if (waarde === '' || waarde == null || waarde === false) return null;
  return (
    <div className="sa-rij">
      <span>{label}</span>
      <span>{waarde}</span>
    </div>
  );
}

// Kleine activiteitslijn (7 weken), zonder bibliotheek.
export function Lijntje({ waarden, breed = 72, hoog = 22 }) {
  const reeks = waarden?.length > 1 ? waarden : [0, 0];
  const max = Math.max(1, ...reeks);
  const stap = breed / (reeks.length - 1);
  const punten = reeks.map((v, i) => `${(i * stap).toFixed(1)},${(hoog - 2 - (v / max) * (hoog - 4)).toFixed(1)}`).join(' ');
  const g = gezondheid(reeks);
  return (
    <svg width={breed} height={hoog} viewBox={`0 0 ${breed} ${hoog}`} role="img" aria-label={`Activiteit: ${g.label.toLowerCase()}`}>
      <polyline points={punten} fill="none" stroke={g.kleur} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Actief / neemt af / stil, op de laatste twee weken tegen de eerste twee.
export function gezondheid(w) {
  const reeks = w?.length ? w : [0];
  const laatste = reeks.slice(-2).reduce((a, x) => a + x, 0);
  const eerste = reeks.slice(0, 2).reduce((a, x) => a + x, 0);
  if (laatste === 0 && reeks.every(x => x === 0)) return { label: 'Niets gedaan', badge: 'b-gray', kleur: '#9ca3af' };
  if (laatste === 0) return { label: 'Stil', badge: 'b-red', kleur: '#dc2626' };
  if (laatste < eerste * 0.6) return { label: 'Neemt af', badge: 'b-orange', kleur: '#e8784a' };
  return { label: 'Actief', badge: 'b-green', kleur: '#15A34A' };
}

export function StatusBadge({ k }) {
  if (k.isTest) return <span className="badge b-concept">Test</span>;
  const a = k.abonnement;
  switch (k.status) {
    case 'proef': return <span className="badge b-orange">Proef{a?.proefTot ? (dagenTot(a.proefTot) < 0 ? ` · verlopen ${datum(a.proefTot)}` : ` t/m ${datum(a.proefTot)}`) : ''}</span>;
    case 'actief': return <span className="badge b-paid">{a?.stoptOp ? `Stopt ${datum(a.stoptOp)}` : `Actief${a?.interval ? ` · ${a.interval === 'jaar' ? 'jaar' : 'maand'}` : ''}`}</span>;
    case 'betaalprobleem': return <span className="badge b-overdue">Betaalprobleem</span>;
    case 'opgezegd': return <span className="badge b-lost">Opgezegd{a?.stoptOp ? ` · stopt ${datum(a.stoptOp)}` : ''}</span>;
    case 'geblokkeerd': return <span className="badge b-declined">Geblokkeerd</span>;
    default: return <span className="badge b-lost">Geen abonnement</span>;
  }
}

export function BedrijfLogo({ k, maat = 28 }) {
  if (k.logoUrl) return <img src={k.logoUrl} alt="" className="sa-logo" style={{ width: maat, height: maat, objectFit: 'contain', background: 'var(--bgs)' }} />;
  const letters = (k.naam || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return <div className="sa-logo" style={{ width: maat, height: maat, background: k.kleur || '#334155', fontSize: maat > 36 ? 15 : 11 }}>{letters}</div>;
}

export function Notities({ lijst, onToevoegen }) {
  return (
    <NotitieInvoer onToevoegen={onToevoegen}>
      <div className="sa-tijdlijn">
        {lijst.map((n, i) => (
          <div key={i} className="sa-tl-rij">
            <div className="lrow-sub">{tijdstip(n.op)} · {n.door || 'onbekend'}</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.tekst}</div>
          </div>
        ))}
        {lijst.length === 0 && <div className="lrow-sub">Nog geen notities.</div>}
      </div>
    </NotitieInvoer>
  );
}

function NotitieInvoer({ onToevoegen, children }) {
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);
  return (
    <>
      <textarea className="sa-input" style={{ minHeight: 70 }} value={tekst} onChange={e => setTekst(e.target.value)} placeholder="Wat is er besproken of afgesproken?" />
      <button className="btn btn-p btn-sm" style={{ marginTop: 8 }} disabled={!tekst.trim() || bezig} onClick={async () => {
        setBezig(true);
        try { await onToevoegen(tekst.trim()); setTekst(''); } finally { setBezig(false); }
      }}>{bezig ? 'Opslaan…' : 'Notitie toevoegen'}</button>
      {children}
    </>
  );
}
