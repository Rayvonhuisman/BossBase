// Gedeelde BTW-bereken-logica (zelfde berekening als in de kosten-/offerte-flow).
// `mode` = 'excl' → bedrag is exclusief BTW; 'incl' → bedrag is inclusief BTW.
// Geeft { excl, btw, incl } terug, alle op 2 decimalen afgerond.
export function calcBtw(bedrag, pct, mode = 'excl') {
  const b = Number(bedrag) || 0;
  const p = Number(pct) || 0;
  if (mode === 'incl') {
    const incl = b;
    const excl = Math.round((incl / (1 + p / 100)) * 100) / 100;
    const btw = Math.round((incl - excl) * 100) / 100;
    return { excl, btw, incl };
  }
  const excl = b;
  const btw = Math.round((excl * p / 100) * 100) / 100;
  return { excl, btw, incl: Math.round((excl + btw) * 100) / 100 };
}

// Opties voor de BTW-keuze, consistent met offertes/facturen.
export const BTW_PCT_OPTIONS = [21, 9, 0];
