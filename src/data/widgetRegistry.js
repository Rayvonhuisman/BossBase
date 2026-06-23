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
  { type: 'notes',                  iconKey: 'note',    label: 'Notities',                category: 'popular',  defaultSize: 'medium', description: 'Persoonlijk notitieblok' },
  { type: 'overdue_tasks',          iconKey: 'clock',   label: 'Taken die te laat zijn',  category: 'popular',  defaultSize: 'medium', description: 'Activiteiten die over datum zijn' },
  // ── Planning ─────────────────────────────────────────────
  { type: 'agenda_week',            iconKey: 'cal',     label: 'Agenda deze week',        category: 'planning', defaultSize: 'large',  supportedSizes: ['large', 'full'], description: 'Afspraken en geplande activiteiten' },
  { type: 'werkbonnen_today',       iconKey: 'wo',      label: 'Werkbonnen vandaag',      category: 'planning', defaultSize: 'medium', description: 'Werkbonnen voor vandaag' },
  { type: 'uren_registratie',       iconKey: 'hours',   label: 'Urenregistratie',         category: 'planning', defaultSize: 'medium', description: 'Geregistreerde uren deze week' },
  // ── Financial ─────────────────────────────────────────────
  { type: 'open_pipeline_value',    iconKey: 'brief',   label: 'Open pipelinewaarde',     category: 'financial', defaultSize: 'small', description: 'Totale waarde van alle open deals' },
  { type: 'accepted_value',         iconKey: 'euro',    label: 'Geaccepteerde waarde',    category: 'financial', defaultSize: 'small', description: 'Waarde van akkoord-deals en verder' },
  { type: 'revenue_month',          iconKey: 'revenue', label: 'Omzet deze maand',        category: 'financial', defaultSize: 'small', description: 'Gefactureerde omzet deze maand' },
  { type: 'profit_month',           iconKey: 'trend',   label: 'Winst deze maand',        category: 'financial', defaultSize: 'small', description: 'Geschatte winst op basis van deals' },
  { type: 'costs_per_job',          iconKey: 'costs',   label: 'Kosten per klus',         category: 'financial', defaultSize: 'medium', supportedSizes: ['medium', 'large', 'full'], description: 'Gemiddelde kosten per afgeronde klus' },
  { type: 'costs_month',            iconKey: 'costs',   label: 'Kosten deze maand',        category: 'financial', defaultSize: 'small', description: 'Geschatte kosten afgelopen maand' },
  { type: 'billable',               iconKey: 'euro',    label: 'Te factureren',            category: 'financial', defaultSize: 'small', description: 'Waarde van klussen klaar voor facturatie' },
  { type: 'open_offertes',          iconKey: 'quotes',  label: 'Open offertes',           category: 'financial', defaultSize: 'large',  supportedSizes: ['medium', 'large', 'full'], description: 'Offertes in concept of verstuurd' },
  { type: 'open_facturen',          iconKey: 'euro',    label: 'Openstaande facturen',    category: 'financial', defaultSize: 'large',  supportedSizes: ['medium', 'large', 'full'], description: 'Geaccepteerde offertes nog niet betaald' },
  // ── CRM ──────────────────────────────────────────────────
  { type: 'customers',              iconKey: 'cust',    label: 'Klanten',                 category: 'crm',       defaultSize: 'small', description: 'Totaal aantal actieve klanten' },
  { type: 'new_leads',              iconKey: 'pipe',    label: 'Nieuwe aanvragen',        category: 'crm',       defaultSize: 'medium', description: 'Deals in de fase Nieuwe aanvragen' },
  { type: 'active_deals',           iconKey: 'pipe',    label: 'Actieve deals',           category: 'crm',       defaultSize: 'large',  supportedSizes: ['large', 'full'], description: 'Deals in actieve pipeline fasen' },
  { type: 'last_customer_activity', iconKey: 'act',     label: 'Laatste klantactiviteit', category: 'crm',       defaultSize: 'large',  supportedSizes: ['medium', 'large', 'full'], description: 'Recente activiteiten per klant' },
  { type: 'lead_followup',          iconKey: 'call',    label: 'Lead opvolging',          category: 'crm',       defaultSize: 'medium', supportedSizes: ['medium', 'large', 'full'], description: 'Leads gesorteerd op opvolgdatum met belknop' },
  { type: 'conversion_overview',    iconKey: 'pipe',    label: 'Conversie overzicht',     category: 'crm',       defaultSize: 'large',  supportedSizes: ['medium', 'large', 'full'], description: 'Verdeling deals over pipeline fasen' },
  // ── Charts ───────────────────────────────────────────────
  { type: 'monthly_revenue_chart',   iconKey: 'revenue', label: 'Omzet per maand',         category: 'charts',    defaultSize: 'large', supportedSizes: ['large', 'full'], description: 'Lijngrafiek omzet per maand' },
  { type: 'monthly_profit_chart',    iconKey: 'trend',   label: 'Winst per maand',         category: 'charts',    defaultSize: 'large', supportedSizes: ['large', 'full'], description: 'Staafgrafiek winst per maand' },
  { type: 'pipeline_stage_chart',    iconKey: 'pipe',    label: 'Pipeline per fase',       category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Waarde per pipeline fase' },
  { type: 'conversion_funnel',       iconKey: 'pipe',    label: 'Conversiefunnel',         category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Trechter van lead tot afgerond' },
  { type: 'invoice_status_chart',    iconKey: 'euro',    label: 'Factuurstatus',           category: 'charts',    defaultSize: 'large', supportedSizes: ['large', 'full'], description: 'Verdeling facturen per status' },
  { type: 'job_costs_bar_chart',     iconKey: 'costs',   label: 'Kosten per klant',        category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Geregistreerde kosten per klant' },
  { type: 'weekly_hours_histogram',  iconKey: 'hours',   label: 'Uren per week',           category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Histogram gewerkte uren per week' },
  { type: 'activities_per_day_chart',iconKey: 'act',     label: 'Activiteiten per dag',    category: 'charts',    defaultSize: 'medium', supportedSizes: ['medium', 'large', 'full'], description: 'Activiteiten per dag van de week' },
  { type: 'lead_source_chart',       iconKey: 'pipe',    label: 'Lead bronnen',            category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Verdeling leads per bron' },
  { type: 'top_customers_chart',     iconKey: 'cust',    label: 'Top klanten',             category: 'charts',    defaultSize: 'large', supportedSizes: ['medium', 'large', 'full'], description: 'Klanten gesorteerd op omzet' },
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
      w('open_offertes',        'medium'),  // 4
      w('lead_followup',        'medium'),  // 4
      w('conversion_overview',  'medium'),  // 4  → row 3 = 12 ✓
    ],
  },
  planning: {
    label: 'Planninggericht',
    iconKey: 'cal',
    description: 'Focus op uitvoering en agenda',
    widgets: [
      w('overdue_tasks',            'small'),  // 3
      w('customers',                'small'),  // 3
      w('werkbonnen_today',         'small'),  // 3
      w('uren_registratie',         'small'),  // 3  → row 1 = 12 ✓
      w('actions_today',            'large'),  // 6
      w('agenda_week',              'large'),  // 6  → row 2 = 12 ✓
      w('last_customer_activity',   'medium'), // 4
      w('quick_actions',            'medium'), // 4
      w('activities_per_day_chart', 'medium'), // 4  → row 3 = 12 ✓
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
      w('top_customers_chart',   'large'),   // 6
      w('lead_source_chart',     'large'),   // 6  → row 4 = 12 ✓
      w('conversion_overview',   'full'),    // 12 → row 5 = 12 ✓
    ],
  },
};

export const DEFAULT_LAYOUT_KEY = 'standaard';

export function getDefaultWidgets() {
  return DEFAULT_LAYOUTS[DEFAULT_LAYOUT_KEY].widgets.map((wd, i) => ({
    id: `default-${i}`,
    widget_type: wd.widget_type,
    title: null,
    size: normalizeWidgetSize(wd.widget_type, wd.size),
    settings: {},
    position: i,
  }));
}

export function getWidgetMeta(type) {
  return WIDGET_REGISTRY.find(r => r.type === type) || { type, label: type, category: 'popular', defaultSize: 'medium' };
}
