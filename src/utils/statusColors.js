// ─────────────────────────────────────────────────────────────────────────────
// Centrale status → kleur + label mapping voor de HELE app.
//
// Waarom: statussen ("Lopend", "Betaald", "Te laat", …) werden op verschillende
// pagina's met verschillende kleuren getoond (oranje vs grijs vs amber) en met
// verschillende schrijfwijzen ("in_uitvoering" vs "In uitvoering" vs "lopend").
// Deze helper is de ENIGE bron: hij normaliseert de status-waarde en geeft per
// domein een consistente kleur (tone) + nette Nederlandse weergave terug.
//
// Verandert NIETS aan de waardes in de database — puur weergave (kleur + label).
// ─────────────────────────────────────────────────────────────────────────────

// De 5 canonieke tonen. De hex-waardes zijn exact gelijk aan de bestaande
// .badge .b-* CSS-klassen, zodat correcte badges niet verspringen en alleen de
// afwijkende plekken worden rechtgetrokken. `cls` = badge-klasse (className),
// `bg`/`color`/`dot` = inline gebruik, `chip` = dashboard-widget Chip-tone.
export const STATUS_TONES = {
  gray:   { cls: 'b-gray',   bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af', chip: 'neutral' },
  blue:   { cls: 'b-blue',   bg: '#eff6ff', color: '#2563eb', dot: '#2563eb', chip: 'info'    },
  orange: { cls: 'b-orange', bg: '#fff4ec', color: '#e8784a', dot: '#e8784a', chip: 'orange'  },
  green:  { cls: 'b-green',  bg: '#ecfdf5', color: '#15A34A', dot: '#15A34A', chip: 'success' },
  red:    { cls: 'b-red',    bg: '#fef2f2', color: '#dc2626', dot: '#dc2626', chip: 'warn'    },
  // Voor wat niet in BossBase is gemaakt maar uit de boekhouding komt. De
  // klasse .b-purple stond al in bb-dashboard.css.
  purple: { cls: 'b-purple', bg: '#f5f3ff', color: '#7c3aed', dot: '#7c3aed', chip: 'neutral' },
};

// Per domein: genormaliseerde status-key → [tone, NL-label]. Varianten/spellingen
// van dezelfde status wijzen naar dezelfde tone + hetzelfde label.
const DOMAINS = {
  // PROJECT — Lopend = oranje, Afgerond = groen, Geannuleerd = rood, Concept = grijs.
  project: {
    concept:          ['gray',   'Concept'],
    offerte_akkoord:  ['blue',   'Offerte akkoord'],
    lopend:           ['orange', 'Lopend'],
    in_uitvoering:    ['orange', 'Lopend'],
    wachten_op_klant: ['orange', 'Wachten op klant'],
    te_factureren:    ['blue',   'Te factureren'],
    afgerond:         ['green',  'Afgerond'],
    gepauzeerd:       ['gray',   'Gepauzeerd'],
    geannuleerd:      ['red',    'Geannuleerd'],
    risico:           ['red',    'Risico'],
  },
  // FACTUUR — Concept = grijs, Verzonden/Open = blauw, Betaald = groen, Te laat = rood.
  factuur: {
    concept:    ['gray',  'Concept'],
    aangemaakt: ['gray',  'Concept'],
    verzonden:  ['blue',  'Verzonden'],
    verstuurd:  ['blue',  'Verzonden'],
    open:       ['blue',  'Open'],
    betaald:    ['green', 'Betaald'],
    verlopen:   ['red',   'Te laat'],
    te_laat:    ['red',   'Te laat'],
    vervallen:  ['red',   'Te laat'],
    // Uit SnelStart opgehaald, niet in BossBase gemaakt. Eigen kleur zodat je in
    // de lijst meteen ziet welk deel van het omzetbeeld uit de boekhouding komt
    // — die facturen hebben geen regels met eigen prijzen, geen PDF en zijn
    // niet te bewerken.
    geboekt:    ['purple', 'Uit SnelStart'],
  },
  // OFFERTE — Concept = grijs, Verzonden = blauw, Geaccepteerd = groen, Afgewezen = rood.
  offerte: {
    concept:      ['gray',  'Concept'],
    verzonden:    ['blue',  'Verzonden'],
    verstuurd:    ['blue',  'Verzonden'],
    bekeken:      ['blue',  'Bekeken'],
    geaccepteerd: ['green', 'Geaccepteerd'],
    afgewezen:    ['red',   'Afgewezen'],
    verlopen:     ['red',   'Verlopen'],
  },
  // WERKBON — Gepland = blauw, In uitvoering = oranje, Afgerond = groen.
  werkbon: {
    gepland:       ['blue',   'Gepland'],
    planned:       ['blue',   'Gepland'],
    in_uitvoering: ['orange', 'In uitvoering'],
    in_progress:   ['orange', 'In uitvoering'],
    afgerond:      ['green',  'Afgerond'],
    done:          ['green',  'Afgerond'],
  },
  // ACTIVITEIT — Open = grijs, Vandaag = blauw, Te laat = rood, Gereed = groen.
  activiteit: {
    open:      ['gray',  'Open'],
    today:     ['blue',  'Vandaag'],
    vandaag:   ['blue',  'Vandaag'],
    overdue:   ['red',   'Te laat'],
    te_laat:   ['red',   'Te laat'],
    completed: ['green', 'Gereed'],
    done:      ['green', 'Gereed'],
    gereed:    ['green', 'Gereed'],
  },
  // PRIORITEIT (aanvraag/deal) — Hoog = opvallend rood, Laag = rustig grijs.
  // Normaal (med) heeft bewust geen badge in de lijst (voorkomt ruis).
  priority: {
    high: ['red',  'Hoog'],
    med:  ['gray', 'Normaal'],
    low:  ['gray', 'Laag'],
  },
};

// Generieke fallback wanneer geen domein is meegegeven of de status onbekend is
// binnen het domein. Dekt zowel Nederlandse als oudere Engelse keys af.
const GENERIC = {
  concept: ['gray', 'Concept'], draft: ['gray', 'Concept'], aangemaakt: ['gray', 'Concept'],
  verzonden: ['blue', 'Verzonden'], sent: ['blue', 'Verzonden'], verstuurd: ['blue', 'Verzonden'],
  viewed: ['blue', 'Bekeken'], bekeken: ['blue', 'Bekeken'],
  gepland: ['blue', 'Gepland'], planned: ['blue', 'Gepland'], today: ['blue', 'Vandaag'], vandaag: ['blue', 'Vandaag'],
  open: ['gray', 'Open'],
  lopend: ['orange', 'Lopend'], in_uitvoering: ['orange', 'In uitvoering'], in_progress: ['orange', 'In uitvoering'],
  betaald: ['green', 'Betaald'], paid: ['green', 'Betaald'],
  geaccepteerd: ['green', 'Geaccepteerd'], accepted: ['green', 'Geaccepteerd'],
  afgerond: ['green', 'Afgerond'], completed: ['green', 'Afgerond'], done: ['green', 'Afgerond'], gereed: ['green', 'Gereed'],
  afgewezen: ['red', 'Afgewezen'], declined: ['red', 'Afgewezen'], geannuleerd: ['red', 'Geannuleerd'],
  verlopen: ['red', 'Te laat'], expired: ['red', 'Verlopen'], overdue: ['red', 'Te laat'], te_laat: ['red', 'Te laat'], vervallen: ['red', 'Te laat'],
  risico: ['red', 'Risico'], gepauzeerd: ['gray', 'Gepauzeerd'], lost: ['gray', 'Verloren'],
  new_lead: ['green', 'Nieuwe aanvraag'], nieuw: ['green', 'Nieuw'],
};

// "In uitvoering" / "in-uitvoering" / "  Lopend " → "in_uitvoering" / "lopend".
function normalize(status) {
  return String(status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function prettify(status) {
  const t = String(status ?? '').replace(/_/g, ' ').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Centrale lookup. Geeft alles wat een render-site nodig heeft:
 *   { tone, label, className, badgeClass, chip, bg, color, dot }
 * @param {string} status  Ruwe status-waarde (elke schrijfwijze).
 * @param {string} [domain] 'project' | 'factuur' | 'offerte' | 'werkbon' | 'activiteit'
 */
export function statusInfo(status, domain) {
  const key = normalize(status);
  const entry = (domain && DOMAINS[domain] && DOMAINS[domain][key]) || GENERIC[key];
  const [toneName, label] = entry || ['gray', prettify(status)];
  const tone = STATUS_TONES[toneName] || STATUS_TONES.gray;
  return {
    tone: toneName,
    label,
    className: `badge ${tone.cls}`,
    badgeClass: tone.cls,
    chip: tone.chip,
    bg: tone.bg,
    color: tone.color,
    dot: tone.dot,
  };
}

export const statusLabel = (status, domain) => statusInfo(status, domain).label;
export const statusChipTone = (status, domain) => statusInfo(status, domain).chip;
