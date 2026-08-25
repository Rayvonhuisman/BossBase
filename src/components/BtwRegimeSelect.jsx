// Gedeelde BTW-keuze op een offerte-/factuurregel.
//
// De uitleg staat als gewone tekst onder de regellijst en niet in een popover:
// popovers in deze modals belanden onder andere blokken door de stacking
// contexts van de .afu-animaties.

import {
  regimeOpties, regimeVanRegel, pctVanRegime, regimeCfg,
  NUL_TARIEF_UITLEG, VERLEGD_MENG_WAARSCHUWING, heeftVerlegdConflict,
} from '../lib/btwRegime';

export default function BtwRegimeSelect({ r, setRegel }) {
  const regime = regimeVanRegel(r);
  const cfg = regimeCfg(regime);
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
        title={cfg.uitleg}
        style={{ minWidth: 0, width: '100%' }}
      >
        {regimeOpties(huidigPct).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {cfg.kort && (
        <div style={{ fontSize: 10, lineHeight: 1.25, color: 'var(--dl)' }}>{cfg.kort}</div>
      )}
    </div>
  );
}

// Uitleg onder de regellijst. Verschijnt alleen zodra er een 0%-regel staat —
// dat is precies waar iemand de verkeerde van de twee kan kiezen.
export function VerlegdUitleg({ regels = [] }) {
  const regimes = regels.map(regimeVanRegel);
  const heeftNul = regimes.includes('vrijgesteld') || regimes.includes('verlegd');
  const conflict = heeftVerlegdConflict(regels);
  if (!heeftNul) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontSize: 11.5, lineHeight: 1.45, color: 'var(--dm)',
        background: 'var(--bg2, rgba(0,0,0,.03))', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 10px',
      }}>
        {NUL_TARIEF_UITLEG}
      </div>
      {conflict && (
        <div style={{
          fontSize: 11.5, lineHeight: 1.45, color: 'var(--dm)', fontWeight: 500,
          background: 'var(--warn-bg, rgba(224,176,80,.10))', border: '1px solid var(--warn-bd, #e0b050)',
          borderRadius: 8, padding: '8px 10px',
        }}>
          {VERLEGD_MENG_WAARSCHUWING}
        </div>
      )}
    </div>
  );
}
