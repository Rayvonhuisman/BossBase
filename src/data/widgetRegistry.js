export const WIDGET_CATEGORIES = {
  popular:   { label: 'Populair' },
  planning:  { label: 'Planning' },
  financial: { label: 'Financieel' },
  crm:       { label: 'CRM' },
  execution: { label: 'Uitvoering' },
  charts:    { label: 'Analyse & Grafieken' },
};

// Canonical size order (matches CSS grid spans: small=3, medium=4, large=6, full=12)
export const ALL_SIZES = ['small', 'medium', 'large', 'full'];

// supportedSizes: only the formats in which the widget stays readable.
// Widgets without supportedSizes support every size.
export const WIDGET_REGISTRY = [
  // ── Popular ──────────────────────────────────────────────
  { type: 'actions_today',          iconKey: 'act',     label: 'Activiteiten vandaag',          category: 'popular',  defaultSize: 'large',  description: 'Openstaande activiteiten voor vandaag' },
  { type: 'quick_actions',          iconKey: 'dash',    label: 'Snelle acties',           category: 'popular',  defaultSize: 'medium', description: 'Knoppen voor veelgebruikte acties' },
  // ── Planning ─────────────────────────────────────────────
  { type: 'agenda_week',            iconKey: 'cal',     label: 'Agenda deze week',        category: 'planning', defaultSize: 'large',  supportedSizes: ['large', 'full'], description: 'Afspraken en geplande activiteiten' },
  { type: 'werkbonnen_today',       iconKey: 'wo',      label: 'Werkbonnen vandaag',      category: 'planning', defaultSize: 'medium', description: 'Werkbonnen voor vandaag' },
  { type: 'uren_registratie',       iconKey: 'hours',   label: 'Urenregistratie',         category: 'planning', defaultSize: 'medium', description: 'Geregistreerde uren deze week' },
  // ── Financial ─────────────────────────────────────────────
  { type: 'open_pipeline_value',    iconKey: 'brief',   label: 'Open pipelinewaarde',     category: 'financial', defaultSize: 'small', description: 'Totale waarde van alle open deals' },
  { type: 'accepted_value',         iconKey: 'euro',    label: 'Geaccepteerde waarde',    category: 'financial', defaultSize: 'small', description: 'Waarde van akkoord-deals en verder' },
  { type: 'revenue_month',          iconKey: 'revenue', label: 'Omzet deze maand',        category: 'financial', defaultSize: 'small', description: 'Gefactureerd deze maand, excl. btw' },
  { type: 'profit_month',           iconKey: 'trend',   label: 'Winst deze maand',        category: 'financial', defaultSize: 'small', description: 'Geschatte winst op basis van deals' },
  { type: 'costs_per_job',          iconKey: 'costs',   label: 'Kosten per klus',         category: 'financial', defaultSize: 'medium', supportedSizes: ['medium', 'large', 'full'], description: 'Gemiddelde kosten per afgeronde klus' },
  { type: 'costs_month',            iconKey: 'costs',   label: 'Kosten deze maand',        category: 'financial', defaultSize: 'small', description: 'Geschatte kosten afgelopen maand' },
  { type: 'billable',               iconKey: 'euro',    label: 'Te factureren',            category: 'financial', defaultSize: 'small', description: 'Waarde van klussen klaar voor facturatie' },
  { type: 'open_offertes',          iconKey: 'quotes',  label: 'Open offertes',           category: 'financial', defaultSize: 'large',  supportedSizes: ['medium', 'large', 'full'], description: 'Offertes in concept of verstuurd' },
  { type: 'open_facturen',          iconKey: 'euro',    label: 'Openstaande facturen',    category: 'financial', defaultSize: 'large',  supportedSizes: ['medium', 'large', 'full'], description: 'Verzonden facturen die nog niet betaald zijn' },
  // ── CRM ──────────────────────────────────────────────────
  { type: 'customers',              iconKey: 'cust',    label: 'Klanten',                 category: 'crm',       defaultSize: 'small', description: 'Totaal aantal actieve klanten' },
  { type: 'new_leads',              iconKey: 'pipe',    label: 'Nieuwe aanvragen',        category: 'crm',       defaultSize: 'medium', description: 'Deals in de fase Nieuwe aanvragen' },
  { type: 'active_deals',           iconKey: 'pipe',    label: 'Actieve deals',           category: 'crm',       defaultSize: 'large',  supportedSizes: ['large', 'full'], description: 'Deals in actieve pipeline fasen' },
  { type: 'conversion_overview',    iconKey: 'pipe',    label: 'Conversie overzicht',     category: 'crm',       defaultSize: 'large',  supportedSizes: ['medium', 'large', 'full'], description: 'Verdeling deals over pipeline fasen' },
  // ── Charts ───────────────────────────────────────────────
  { type: 'monthly_revenue_chart',   iconKey: 'revenue', label: 'Omzet per maand',         category: 'charts',    defaultSize: 'large', supportedSizes: ['large', 'full'], description: 'Lijngrafiek omzet per maand, excl. btw' },
  { type: 'monthly_profit_chart',    iconKey: 'trend',   label: 'Winst per maand',         category: 'charts',    defaultSize: 'large', supportedSizes: ['large', 'full'], description: 'Staafgrafiek winst per maand' },
  { type: 'pipeline_stage_chart',    iconKey: 'pipe',    label: 'Pipeline per fase',       category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Waarde per pipeline fase' },
  { type: 'conversion_funnel',       iconKey: 'pipe',    label: 'Conversiefunnel',         category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Trechter van lead tot afgerond' },
  { type: 'invoice_status_chart',    iconKey: 'euro',    label: 'Factuurstatus',           category: 'charts',    defaultSize: 'large', supportedSizes: ['large', 'full'], description: 'Verdeling facturen per status' },
  { type: 'job_costs_bar_chart',     iconKey: 'costs',   label: 'Kosten per klant',        category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Geregistreerde kosten per klant' },
  { type: 'weekly_hours_histogram',  iconKey: 'hours',   label: 'Uren per week',           category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Histogram gewerkte uren per week' },
  { type: 'activities_per_day_chart',iconKey: 'act',     label: 'Activiteiten per dag',    category: 'charts',    defaultSize: 'medium', supportedSizes: ['medium', 'large', 'full'], description: 'Activiteiten per dag van de week' },
  { type: 'top_customers_chart',     iconKey: 'cust',    label: 'Top klanten',             category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Klanten gesorteerd op dealwaarde' },
];

// ── Size helpers ──────────────────────────────────────────────
export function getSupportedSizes(type) {
  const meta = WIDGET_REGISTRY.find(r => r.type === type);
  const sizes = meta && Array.isArray(meta.supportedSizes) ? meta.supportedSizes : ALL_SIZES;
  return sizes.length ? sizes : ALL_SIZES;
}

// Returns a valid size for a widget. Used as a safe, non-destructive
// normalization at load time — never writes to Supabase by itself.
export function normalizeWidgetSize(type, size) {
  const sizes = getSupportedSizes(type);
  if (size && sizes.includes(size)) return size;
  const meta = WIDGET_REGISTRY.find(r => r.type === type);
  if (meta && meta.defaultSize && sizes.includes(meta.defaultSize)) return meta.defaultSize;
  return sizes[0];
}

// ── Default layouts ───────────────────────────────────────────
// Every preset size below is validated against supportedSizes.
const w = (type, size) => ({
  widget_type: type,
  size: normalizeWidgetSize(type, size || WIDGET_REGISTRY.find(r => r.type === type)?.defaultSize),
});

export const DEFAULT_LAYOUTS = {
  medewerker: {
    label: 'Medewerker',
    iconKey: 'wo',
    description: 'Werkbonnen, activiteiten, agenda en je uren',
    widgets: [
      w('werkbonnen_today',  'large'),   // 6
      w('uren_registratie',  'large'),   // 6  → rij 1 = 12 ✓
      w('agenda_week',       'large'),   // 6  (toont standaard "Vandaag")
      w('actions_today',     'large'),   // 6  → rij 2 = 12 ✓
    ],
  },
  standaard: {
    label: 'Standaard',
    iconKey: 'dash',
    description: 'Algemeen dagelijks overzicht',
    widgets: [
      w('open_pipeline_value',   'small'),  // 3
      w('accepted_value',        'small'),  // 3
      w('customers',             'small'),  // 3
      w('actions_today',         'small'),  // 3  → row 1 = 12 ✓ (KPI)
      w('actions_today',         'large'),  // 6  (lijst)
      w('new_leads',             'large'),  // 6  → row 2 = 12 ✓
      w('open_offertes',         'large'),  // 6
      w('active_deals',          'large'),  // 6  → row 3 = 12 ✓
      w('monthly_revenue_chart', 'full'),   // 12 → row 4 = 12 ✓
    ],
  },
  sales: {
    label: 'Verkoopgericht',
    iconKey: 'euro',
    description: 'Focus op pipeline en omzet',
    widgets: [
      w('open_pipeline_value',  'small'),   // 3
      w('accepted_value',       'small'),   // 3
      w('revenue_month',        'small'),   // 3
      w('profit_month',         'small'),   // 3  → row 1 = 12 ✓
      w('new_leads',            'large'),   // 6
      w('active_deals',         'large'),   // 6  → row 2 = 12 ✓
      w('open_offertes',        'large'),   // 6
      w('conversion_overview',  'large'),   // 6  → row 3 = 12 ✓
    ],
  },
  planning: {
    label: 'Planninggericht',
    iconKey: 'cal',
    description: 'Focus op uitvoering en agenda',
    widgets: [
      // Stond op 'overdue_tasks'; die tegel is weg. De KPI-variant van
      // actions_today toont sinds de tellerfix zelf "X vandaag · Y te laat".
      w('actions_today',            'small'),  // 3
      w('customers',                'small'),  // 3
      w('werkbonnen_today',         'small'),  // 3
      w('uren_registratie',         'small'),  // 3  → row 1 = 12 ✓
      w('actions_today',            'large'),  // 6
      w('agenda_week',              'large'),  // 6  → row 2 = 12 ✓
      // Rij 3 stond op 3x medium met last_customer_activity; die tegel is weg.
      w('quick_actions',            'large'),  // 6
      w('activities_per_day_chart', 'large'),  // 6  → row 3 = 12 ✓
    ],
  },
  financial: {
    label: 'Financieel',
    iconKey: 'revenue',
    description: 'Focus op geld en offertes',
    widgets: [
      w('revenue_month',         'small'),   // 3
      w('profit_month',          'small'),   // 3
      w('costs_month',           'small'),   // 3
      w('billable',              'small'),   // 3  → row 1 = 12 ✓
      w('monthly_revenue_chart', 'large'),   // 6
      w('open_facturen',         'large'),   // 6  → row 2 = 12 ✓
      w('monthly_profit_chart',  'large'),   // 6
      w('invoice_status_chart',  'large'),   // 6  → row 3 = 12 ✓
      // Rij 4 was top_customers naast lead_source_chart; die laatste is weg
      // (er is geen bron-kolom op deals), dus Top klanten vult de rij nu zelf.
      w('top_customers_chart',   'full'),    // 12 → row 4 = 12 ✓
      w('conversion_overview',   'full'),    // 12 → row 5 = 12 ✓
    ],
  },
};

export const DEFAULT_LAYOUT_KEY = 'standaard';
// Medewerkers (en planners) starten met een uitvoerende layout i.p.v. de
// admin-standaard met financiële/pipeline-widgets.
export const DEFAULT_MEDEWERKER_LAYOUT_KEY = 'medewerker';

export function getDefaultWidgets(layoutKey = DEFAULT_LAYOUT_KEY) {
  const layout = DEFAULT_LAYOUTS[layoutKey] || DEFAULT_LAYOUTS[DEFAULT_LAYOUT_KEY];
  return layout.widgets.map((wd, i) => ({
    id: `default-${i}`,
    widget_type: wd.widget_type,
    title: null,
    size: normalizeWidgetSize(wd.widget_type, wd.size),
    settings: {},
    position: i,
  }));
}

// Bestaat dit widget-type nog? Een opgeslagen dashboard kan een type bevatten
// dat sindsdien is verwijderd; dat zou anders als "nog niet beschikbaar"
// renderen. DashboardHome filtert ze hiermee weg bij het laden.
export const bestaatWidget = type => WIDGET_REGISTRY.some(r => r.type === type);

export function getWidgetMeta(type) {
  return WIDGET_REGISTRY.find(r => r.type === type) || { type, label: type, category: 'popular', defaultSize: 'medium' };
}

// Een vooraf gedefinieerde layout is alleen kiesbaar als de gebruiker élke
// widget erin mag zien. Dat was al zo voor rechten; nu telt het abonnement even
// hard mee, zodat de financiële layout niet aan te klikken is voor een Starter
// die de kostentegels erin toch niet krijgt.
export function layoutZichtbaar(layoutKey, gebruiker) {
  const layout = DEFAULT_LAYOUTS[layoutKey];
  if (!layout) return false;
  return layout.widgets.every(wd => magWidgetZien(wd.widget_type, gebruiker));
}

// Welke widgets een recht vereisen. Financiële widgets (omzet, winst, waarde,
// kosten, facturen, offertes) zijn alleen zichtbaar voor wie het bijbehorende
// recht heeft; admins zien alles. Widgets die hier niet in staan zijn voor
// iedereen zichtbaar (eigen activiteiten, werkbonnen, agenda, nieuwe aanvragen, etc.).
export const WIDGET_PERMISSION = {
  // Bedrijfsfinanciën (omzet/winst/pipeline-waarde)
  open_pipeline_value:   'bedrijfsfinancien',
  accepted_value:        'bedrijfsfinancien',
  revenue_month:         'bedrijfsfinancien',
  profit_month:          'bedrijfsfinancien',
  monthly_revenue_chart: 'bedrijfsfinancien',
  monthly_profit_chart:  'bedrijfsfinancien',
  pipeline_stage_chart:  'bedrijfsfinancien',
  top_customers_chart:   'bedrijfsfinancien',
  // Kosten
  costs_per_job:         'kosten',
  costs_month:           'kosten',
  job_costs_bar_chart:   'kosten',
  // Facturen
  billable:              'facturen',
  open_facturen:         'facturen',
  invoice_status_chart:  'facturen',
  // Offertes
  open_offertes:         'offertes',
  // Verkooppijplijn / CRM (deals) — alleen zichtbaar met can('verkoop')
  new_leads:             'verkoop',
  active_deals:          'verkoop',
  conversion_overview:   'verkoop',
  conversion_funnel:     'verkoop',
  // Activiteiten van het hele team. Een array betekent "één van deze rechten
  // is genoeg" en spiegelt letterlijk de SELECT-policy op activities:
  //   bb_gedeelde_werkruimte() OR planning OR agenda_inzien OR (het is van jou)
  // Precies die twee rechten staan erin — alles_inzien nadrukkelijk NIET. Wie
  // dat recht wel heeft maar deze twee niet, krijgt van de database alleen zijn
  // eigen rijen terug; de tegel zou dan een veel te laag getal tonen alsof dat
  // het teamtotaal was.
  activities_per_day_chart: ['planning', 'agenda_inzien'],
};

// ── ABONNEMENT ────────────────────────────────────────────────────────────────
// Een recht zegt "mag deze gebruiker het", een feature zegt "zit het in dit
// abonnement". Beide moeten kloppen — dezelfde scheiding als PLAN_GATED_PAGES
// in App.jsx, en met dezelfde sleutels uit features.js.
//
// Bewust kort. Bijna elke feature (klanten, offertes, facturen, agenda, uren)
// zit al in Starter, dus een gate erop is altijd waar: dat beschermt niets en
// suggereert alleen dat er iets bewaakt wordt. Alleen wat écht buiten een
// pakket valt staat hier. Vandaar dat de navigatie ook maar twee gates kent.
//
// kosten_nacalculatie zit in Groei en Team, niet in Starter — zonder deze kaart
// kon een Starter de kostentegels gewoon toevoegen terwijl de Kosten-pagina
// zelf voor hem verborgen is.
export const WIDGET_FEATURE = {
  costs_per_job:       'kosten_nacalculatie',
  costs_month:         'kosten_nacalculatie',
  job_costs_bar_chart: 'kosten_nacalculatie',
};

// Widgets waarbij de rechteneis vervalt in een gedeelde werkruimte. Ook dit
// volgt de policy: bij Groei (1-2 personen) ziet iedereen elkaars werk zonder
// rechtenbeheer, dus daar klopt het teamtotaal zónder recht. Zou de tegel daar
// tóch verborgen worden, dan verstopten we cijfers die de gebruiker mag zien.
const GEDEELDE_WERKRUIMTE_WIDGETS = new Set(['activities_per_day_chart']);

/**
 * Mag deze gebruiker deze widget zien? Eén plek voor de hele afweging —
 * abonnement én rechten — zodat het dashboard, de toevoegen-modal en de
 * layoutkiezer niet uit elkaar kunnen lopen. Ze deden alle drie hun eigen
 * `!p || !can || can(p)` en dat is precies het soort herhaling waarbij er
 * later één wordt vergeten.
 *
 * @param {{can?: (r: string) => boolean, has?: (f: string) => boolean}} gebruiker
 */
export function magWidgetZien(type, { can, has } = {}) {
  // 1. Abonnement eerst: dit staat boven de rol. Een admin op Starter hoort de
  //    kostentegels net zomin te zien als zijn medewerker.
  const feature = WIDGET_FEATURE[type];
  if (feature && has && !has(feature)) return false;

  // 2. In een gedeelde werkruimte vervalt de rechteneis voor teambrede tegels.
  if (GEDEELDE_WERKRUIMTE_WIDGETS.has(type) && has && has('gedeelde_werkruimte')) return true;

  // 3. Het recht. Een array = één ervan volstaat.
  const nodig = WIDGET_PERMISSION[type];
  if (!nodig || !can) return true;
  return Array.isArray(nodig) ? nodig.some(r => can(r)) : can(nodig);
}
