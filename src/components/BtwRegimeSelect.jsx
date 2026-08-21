// Gedeelde BTW-keuze op een offerte-/factuurregel. Verving de twee losse
// BtwSelect-kopieën in OffertesPage en FacturenPage, zodat het regime overal
// op dezelfde manier gekozen en opgeslagen wordt.
//
// De uitleg bij "verlegd" staat bewust als gewone tekst onder de regels en niet
// in een popover: popovers in deze modals belanden onder andere blokken door de
// stacking contexts van de .afu-animaties.

import { regimeOpties, regimeVanRegel, pctVanRegime, VERLEGD_KORT, VERLEGD_UITLEG } from '../lib/btwRegime';

export default function BtwRegimeSelect({ r, setRegel }) {
  const regime = regimeVanRegel(r);
  const huidigPct = r.btw === 'anders' ? Number(r.btwAnders || 0) : Number(r.btw);

  const kies = waarde => {
    // Regime én percentage lopen samen: het percentage blijft leidend voor alle
    // bestaande berekeningen (totalen, PDF), het regime bepaalt de rubriek.
    setRegel(r.id, 'btwRegime', waarde);
    setRegel(r.id, 'btw', String(pctVanRegime(waarde, huidigPct)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden' }}>
      <select
        value={regime}
        onChange={e => kies(e.target.value)}
        title={regime === 'verlegd' ? VERLEGD_UITLEG : undefined}
        style={{ minWidth: 0, width: '100%' }}
      >
        {regimeOpties(huidigPct).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {regime === 'verlegd' && (
        <div style={{ fontSize: 10, lineHeight: 1.25, color: 'var(--dl)' }}>{VERLEGD_KORT}</div>
      )}
    </div>
  );
}

// Eén regel uitleg onder de regellijst, alleen zichtbaar zodra er daadwerkelijk
// een regel op verlegd staat.
export function VerlegdUitleg({ regels = [] }) {
  if (!regels.some(r => regimeVanRegel(r) === 'verlegd')) return null;
  return (
    <div style={{
      fontSize: 11.5, lineHeight: 1.45, color: 'var(--dm)',
      background: 'var(--bg2, rgba(0,0,0,.03))', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 10px',
    }}>
      {VERLEGD_UITLEG}
    </div>
  );
}
