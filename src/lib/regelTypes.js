// ─────────────────────────────────────────────────────────────────────────────
// Gedeeld regeltype-systeem voor offerte- en factuurregels.
//
// Vaste types: Uren (uurtarief), Km (reiskostentarief), Overig (prijs × aantal,
// heette voorheen "Vast bedrag" met type-waarde 'vast' — die waarde blijft in de
// DB staan om oude data niet te breken; alleen het label is "Overig").
//
// Daarnaast kan een bedrijf eigen eenheden aanmaken (zie eigenEenheidService).
// Die krijgen in een regel het type 'eigen:<id>', zodat bij bewerken de juiste
// eenheid + prijs + BTW wordt teruggelezen i.p.v. geraden.
//
// Verwijderde vaste types m²/Stuks blijven als oude data leesbaar (LEGACY) maar
// staan niet meer in de keuzelijst.
//
// typeCfg() geeft een config terug die compatibel is met de bestaande regel-
// render: { label, omschrPh, hasV1, v1Step, v1Ph, v2Ph, unit, regelLabel(r) }.
// ─────────────────────────────────────────────────────────────────────────────

const mkCfg = (value, label, omschrPh, { step = '1', unit = '' } = {}) => ({
  value, label, omschrPh,
  hasV1: true, v1Step: step, v1Ph: '0', v2Ph: '0,00', unit,
  regelLabel: r => `${r.aantal}${unit ? ' ' + unit : ''} × €${r.eenheidsprijs}`,
});

// Vaste types in de keuzelijst.
const FIXED = {
  uren: mkCfg('uren', 'Uren',   'Arbeidsuren',    { step: '0.5', unit: 'u' }),
  km:   mkCfg('km',   'Km',     'Reisvergoeding', { step: '1',   unit: 'km' }),
  vast: mkCfg('vast', 'Overig', 'Overige kosten', { step: '1',   unit: '' }),
};
export const FIXED_TYPE_ORDER = ['uren', 'km', 'vast'];

// Oude (verwijderde) vaste types — alleen voor weergave van bestaande data.
const LEGACY = {
  m2:    mkCfg('m2',    'm²',    'Prijs per m²',    { step: '0.01', unit: 'm²' }),
  stuks: mkCfg('stuks', 'Stuks', 'Materiaalkosten', { step: '1',    unit: 'st' }),
};

export const EIGEN_PREFIX = 'eigen:';
export const isEigenType = t => typeof t === 'string' && t.startsWith(EIGEN_PREFIX);
export const eigenIdFromType = t => isEigenType(t) ? t.slice(EIGEN_PREFIX.length) : null;
export const eigenType = id => `${EIGEN_PREFIX}${id}`;

// Weergave-config voor één regeltype. Handelt vaste types, eigen eenheden
// (eigen:<id>) en oude data (m2/stuks, verwijderde eenheid) af. Geeft altijd
// iets terug — valt in het uiterste geval terug op "Overig".
export function typeCfg(type, eenheden = []) {
  if (FIXED[type]) return FIXED[type];
  if (isEigenType(type)) {
    const e = eenheden.find(x => x.id === eigenIdFromType(type));
    if (e) return mkCfg(type, e.naam, e.naam, { step: '1', unit: e.eenheidLabel || '' });
    // eenheid verwijderd → toon als "Overig", behoud het opgeslagen bedrag.
    return mkCfg(type, 'Overig', 'Overige kosten', { step: '1', unit: '' });
  }
  if (LEGACY[type]) return LEGACY[type];
  return FIXED.vast;
}

// Opties voor de keuzelijst: vaste types + eigen eenheden van het bedrijf.
export function typeOptions(eenheden = []) {
  return [
    ...FIXED_TYPE_ORDER.map(k => ({ value: k, label: FIXED[k].label })),
    ...eenheden.map(e => ({ value: eigenType(e.id), label: e.naam })),
  ];
}

// Zoals typeOptions, maar zorgt dat het huidige regeltype altijd selecteerbaar
// blijft. Voor oude data (m²/Stuks) of een verwijderde eigen eenheid voegt dit
// het bestaande type als optie toe (met zijn juiste label), zodat de keuzelijst
// niet leeg klapt en het opgeslagen type niet stilletjes wijzigt.
export function typeOptionsWith(eenheden = [], currentType) {
  const opts = typeOptions(eenheden);
  if (currentType && !opts.some(o => o.value === currentType)) {
    opts.push({ value: currentType, label: typeCfg(currentType, eenheden).label });
  }
  return opts;
}

// Een opgeslagen BTW-percentage (getal) → de juiste dropdown-staat.
// 21/9 zijn vaste opties; al het andere valt onder "Anders".
export function btwToSelect(pct) {
  if (pct === 21) return { btw: '21', btwAnders: '' };
  if (pct === 9)  return { btw: '9',  btwAnders: '' };
  return { btw: 'anders', btwAnders: String(pct) };
}

// Past een type-wissel toe op een regel: vult de standaardprijs (en bij een
// eigen eenheid ook de eigen BTW) voor. Aantal blijft door de gebruiker invulbaar.
export function applyTypeChange(r, newType, instDefaults, eenheden = []) {
  const base = { ...r, type: newType };
  if (newType === 'uren') return { ...base, eenheidsprijs: instDefaults?.uurtarief ?? 0 };
  if (newType === 'km')   return { ...base, eenheidsprijs: instDefaults?.reiskostenPerKm ?? 0 };
  if (newType === 'vast') return { ...base, eenheidsprijs: 0 };
  if (isEigenType(newType)) {
    const e = eenheden.find(x => x.id === eigenIdFromType(newType));
    if (e) {
      const pct = e.btwPct != null ? e.btwPct : (instDefaults?.btwPct ?? 21);
      return { ...base, eenheidsprijs: e.standaardPrijs ?? 0, ...btwToSelect(pct) };
    }
  }
  return base;
}

// Tekst die bij een lege omschrijving wordt opgeslagen.
export function omschrijvingFallback(type, eenheden = []) {
  return typeCfg(type, eenheden).omschrPh || '';
}

// Reconstrueert een UI-regel uit een opgeslagen item (offerte_item / factuur_regel).
// Nieuwe regels hebben type + btwPct → die worden verbatim teruggelezen, óók voor
// eigen eenheden. Oude data (NULL) valt veilig terug: type geraden uit aantal en
// het BTW-tarief afgeleid uit de document-totalen, zodat het BEDRAG niet verandert.
export function reconstructRegel(item, doc, eenheden = []) {
  const totExcl = Number(doc?.totaalExcl || 0);
  const totIncl = Number(doc?.totaalIncl || 0);
  const fallbackBtw = totExcl > 0 ? Math.round((totIncl / totExcl - 1) * 1000) / 10 : 21;
  const snapStd = pct => [9, 21].find(s => Math.abs(s - pct) < 1.5) ?? pct;
  const pct = item.btwPct != null ? item.btwPct : snapStd(fallbackBtw);
  const type = item.type || (item.aantal > 1 ? 'uren' : 'vast');
  return {
    id: crypto.randomUUID(),
    omschrijving: item.omschrijving || '',
    type,
    aantal: item.aantal ?? 1,
    eenheidsprijs: item.prijsPer ?? item.eenheidsprijs ?? 0,
    ...btwToSelect(pct),
  };
}
