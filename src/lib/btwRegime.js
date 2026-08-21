// ─────────────────────────────────────────────────────────────────────────────
// BTW-regime op een offerte- of factuurregel.
//
// Alleen een percentage is niet genoeg: 0% kan vrijgesteld, verlegd of export
// zijn en dat zijn verschillende rubrieken in de aangifte. Zonder regime moest
// de boekhoudkoppeling raden, en die raadde fout (0% belandde op "omzet
// verlegd" terwijl de code "btw-vrij" bedoelde).
//
// Bewust beperkt tot drie regimes: dat is wat ambachtelijke ondernemers echt
// gebruiken. Vrijgesteld en export komen bij deze doelgroep vrijwel niet voor
// en zijn daarom (nog) geen optie.
// ─────────────────────────────────────────────────────────────────────────────

export const BTW_REGIMES = [
  { value: 'normaal',  label: '21% — normaal', pct: 21 },
  { value: 'verlaagd', label: '9% — verlaagd', pct: 9 },
  { value: 'verlegd',  label: '0% — btw verlegd', pct: 0 },
];

export const DEFAULT_REGIME = 'normaal';

export const VERLEGD_KORT = 'Opdrachtgever draagt de btw af';

export const VERLEGD_UITLEG =
  'BTW verlegd: jij brengt geen btw in rekening, je opdrachtgever draagt die zelf af. '
  + 'Dit geldt bij onderaanneming in de bouw. Vermeld op de factuur "btw verlegd" '
  + 'plus het btw-nummer van je opdrachtgever.';

export const regimeCfg = regime =>
  BTW_REGIMES.find(r => r.value === regime) || BTW_REGIMES[0];

// Opgeslagen percentage → regime. Alleen bedoeld voor regels van vóór de
// migratie (btw_regime nog leeg) en voor de werkbon/materiaal-flow die met
// kale percentages werkt.
export function regimeVanPct(pct) {
  const p = Number(pct);
  if (p === 9) return 'verlaagd';
  if (p === 0) return 'verlegd';
  return 'normaal';
}

// Regime → percentage. 'anders' bestaat alleen in de UI (oude regels met een
// afwijkend tarief) en houdt zijn eigen percentage.
export const pctVanRegime = (regime, huidigPct = 21) =>
  regime === 'anders' ? (Number(huidigPct) || 0) : regimeCfg(regime).pct;

// Wat er in de kolom btw_regime terechtkomt. 'anders' is geen geldig regime in
// de database: zo'n regel is gewoon normaal belast, alleen tegen een afwijkend
// percentage.
export const regimeVoorOpslag = regime => (regime === 'anders' ? 'normaal' : (regime || DEFAULT_REGIME));

// Keuzelijst voor één regel. Een regel met een afwijkend percentage (oude data,
// bijvoorbeeld 6%) houdt zijn eigen optie, zodat openen-en-opslaan het bedrag
// niet stilletjes verandert.
export function regimeOpties(huidigPct) {
  const opts = BTW_REGIMES.map(r => ({ value: r.value, label: r.label }));
  const p = Number(huidigPct);
  if (Number.isFinite(p) && ![21, 9, 0].includes(p)) {
    opts.push({ value: 'anders', label: `${p}% — anders` });
  }
  return opts;
}

// Regime van een UI-regel bepalen: expliciet gezet regime wint, anders afleiden
// uit het percentage (oude data), en een afwijkend percentage wordt 'anders'.
export function regimeVanRegel(r) {
  if (r?.btwRegime) return r.btwRegime;
  const pct = Number(r?.btw === 'anders' ? r?.btwAnders : r?.btw);
  if (Number.isFinite(pct) && ![21, 9, 0].includes(pct)) return 'anders';
  return regimeVanPct(pct);
}
