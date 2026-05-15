// ── BossBase Demo Dashboard Data ──────────────────────────────────────────────
// Realistische nep-data voor visueel testen van het dashboard.
// Geen database-inserts. Geen echte klantgegevens.
// Alle namen beginnen met "Demo".
// ─────────────────────────────────────────────────────────────────────────────

function relDate(dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

function relISO(dayOffset = 0, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function thisMonthISO() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const DEMO_CUSTOMERS = [
  { id: 'dc1', name: 'Demo Klant Jansen',          av: 0 },
  { id: 'dc2', name: 'Demo VVE Parkwijk',           av: 1 },
  { id: 'dc3', name: 'Demo Aannemer Willems BV',    av: 2 },
  { id: 'dc4', name: 'Demo Supermarkt Holding',     av: 3 },
  { id: 'dc5', name: 'Demo Familie Van den Berg',   av: 4 },
];

// stage-slugs die de bestaande widget-switch-cases begrijpen
function buildDeals(thisMonth) {
  return [
    // Nieuwe leads → zichtbaar in new_leads + open_pipeline_value
    { id: 'dd1', custId: 'dc1', customerName: 'Demo Klant Jansen',        stage: 'new_lead',    title: 'Demo Lead Badkamerrenovatie',        value: 4500,  city: 'Demo Amersfoort' },
    { id: 'dd2', custId: 'dc2', customerName: 'Demo VVE Parkwijk',         stage: 'new_lead',    title: 'Demo Lead Gevelrenovatie complex',    value: 28000, city: 'Demo Utrecht' },
    { id: 'dd3', custId: 'dc3', customerName: 'Demo Aannemer Willems BV',  stage: 'new_lead',    title: 'Demo Lead Stucwerk kantoor',          value: 6800,  city: 'Demo Hilversum' },
    // Actieve deals → active_deals + open_pipeline_value
    { id: 'dd4', custId: 'dc4', customerName: 'Demo Supermarkt Holding',   stage: 'in_progress', title: 'Demo Deal Verbouwing supermarkt',     value: 24500 },
    { id: 'dd5', custId: 'dc1', customerName: 'Demo Klant Jansen',         stage: 'approved',    title: 'Demo Deal Dakkapel plaatsen',         value: 8900 },
    { id: 'dd6', custId: 'dc2', customerName: 'Demo VVE Parkwijk',         stage: 'quote_sent',  title: 'Demo Offerte Buitenschilderwerk VVE', value: 20418 },
    { id: 'dd7', custId: 'dc5', customerName: 'Demo Familie Van den Berg', stage: 'contact',     title: 'Demo Lead Keukenrenovatie',           value: 12500 },
    { id: 'dd8', custId: 'dc3', customerName: 'Demo Aannemer Willems BV',  stage: 'planned',     title: 'Demo Deal Tegelwerk badkamer',        value: 5200 },
    // Afgerond/betaald deze maand → revenue_month + profit_month
    { id: 'dd9',  custId: 'dc4', customerName: 'Demo Supermarkt Holding',   stage: 'paid',      title: 'Demo Klus Kozijnen vervangen',        value: 9800,  createdAt: thisMonth },
    { id: 'dd10', custId: 'dc5', customerName: 'Demo Familie Van den Berg', stage: 'completed', title: 'Demo Klus Schilderwerk woonkamer',    value: 3812,  createdAt: thisMonth },
    { id: 'dd11', custId: 'dc1', customerName: 'Demo Klant Jansen',         stage: 'paid',      title: 'Demo Klus Dakgoot vervangen',         value: 4500,  createdAt: thisMonth },
  ];
}

function buildActivities() {
  return [
    // Vandaag → actions_today
    { id: 'da1', title: 'Demo Offerte nabellen Jansen',          type: 'call',   dueAt: relISO(0, 10), time: '10:00', custId: 'dc1' },
    { id: 'da2', title: 'Demo Inmeting buitengevel VVE',         type: 'visit',  dueAt: relISO(0, 14), time: '14:00', custId: 'dc2' },
    { id: 'da3', title: 'Demo E-mail offerte versturen Willems', type: 'email',  dueAt: relISO(0, 11), time: '11:00', custId: 'dc3' },
    // Verlaat (verleden datum) → overdue_tasks
    { id: 'da4', title: 'Demo Materialen bestellen week 19',     type: 'task',   dueAt: relISO(-4, 8),  time: '08:00', custId: 'dc4' },
    { id: 'da5', title: 'Demo Factuur opvolgen Van den Berg',    type: 'follow', dueAt: relISO(-2, 9),  time: '09:00', custId: 'dc5' },
    // Deze week → agenda_week
    { id: 'da6', title: 'Demo Follow-up VVE bestuursvergadering',type: 'follow', dueAt: relISO(1, 10), time: '10:00', custId: 'dc2' },
    { id: 'da7', title: 'Demo Oplevering controle supermarkt',   type: 'task',   dueAt: relISO(2, 16), time: '16:00', custId: 'dc4' },
    { id: 'da8', title: 'Demo Klantbezoek Van den Berg',         type: 'visit',  dueAt: relISO(3, 13), time: '13:00', custId: 'dc5' },
    // Afgerond → enkel in last_customer_activity
    { id: 'da9',  title: 'Demo Intake gesprek Jansen',           type: 'call',   dueAt: relISO(-5, 9),  time: '09:00', custId: 'dc1', status: 'completed' },
    { id: 'da10', title: 'Demo Offerte besproken Willems',       type: 'email',  dueAt: relISO(-3, 14), time: '14:00', custId: 'dc3', status: 'completed' },
  ];
}

function buildOffertes() {
  return [
    { id: 'do1', nummer: 'DEMO-001', omschrijving: 'Demo Offerte schilderwerk woonkamer Jansen',    status: 'verzonden',     customerName: 'Demo Klant Jansen',          totaalIncl: 4613 },
    { id: 'do2', nummer: 'DEMO-002', omschrijving: 'Demo Offerte buitenschilderwerk VVE Parkwijk',  status: 'verzonden',     customerName: 'Demo VVE Parkwijk',           totaalIncl: 20418 },
    { id: 'do3', nummer: 'DEMO-003', omschrijving: 'Demo Offerte badkamerrenovatie Van den Berg',   status: 'concept',       customerName: 'Demo Familie Van den Berg',   totaalIncl: 10254 },
    { id: 'do4', nummer: 'DEMO-004', omschrijving: 'Demo Offerte dakkapel plaatsen Jansen',         status: 'verzonden',     customerName: 'Demo Klant Jansen',          totaalIncl: 9800 },
    { id: 'do5', nummer: 'DEMO-005', omschrijving: 'Demo Factuur 001 verbouwing supermarkt',        status: 'geaccepteerd',  customerName: 'Demo Supermarkt Holding',     totaalIncl: 24500 },
    { id: 'do6', nummer: 'DEMO-006', omschrijving: 'Demo Factuur 002 schilderwerk kantoor Willems', status: 'geaccepteerd',  customerName: 'Demo Aannemer Willems BV',    totaalIncl: 8712 },
  ];
}

function buildWerkbonnen() {
  return [
    { id: 'dw1', titel: 'Demo Werkbon Schilderwerk kantoor De Vries',      locatie: 'Demo Industrieweg 55, Utrecht',     geplandOp: relDate(0), status: 'in_uitvoering', customerName: 'Demo Aannemer Willems BV' },
    { id: 'dw2', titel: 'Demo Werkbon Buitenschilderwerk VVE Parkwijk',    locatie: 'Demo Parkweg 1, Amersfoort',        geplandOp: relDate(0), status: 'gepland',       customerName: 'Demo VVE Parkwijk' },
    { id: 'dw3', titel: 'Demo Werkbon Badkamerrenovatie Van den Berg',     locatie: 'Demo Beukenlaan 34, Hilversum',     geplandOp: relDate(1), status: 'gepland',       customerName: 'Demo Familie Van den Berg' },
    { id: 'dw4', titel: 'Demo Werkbon Montage keuken Supermarkt Holding',  locatie: 'Demo Handelsweg 100, Amsterdam',   geplandOp: relDate(2), status: 'gepland',       customerName: 'Demo Supermarkt Holding' },
  ];
}

// ── Grafiekdata ───────────────────────────────────────────────────────────────

function buildMonthLabels(count = 6) {
  const labels = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return labels[d.getMonth()];
  });
}

const MONTH_LABELS = buildMonthLabels(6);

const DEMO_CHARTS = {
  monthlyRevenue: [
    { label: MONTH_LABELS[0], value: 19600 },
    { label: MONTH_LABELS[1], value: 21800 },
    { label: MONTH_LABELS[2], value: 14200 },
    { label: MONTH_LABELS[3], value: 18900 },
    { label: MONTH_LABELS[4], value: 24500 },
    { label: MONTH_LABELS[5], value: 18112 },
  ],
  monthlyProfit: [
    { label: MONTH_LABELS[0], value: 5490 },
    { label: MONTH_LABELS[1], value: 6100 },
    { label: MONTH_LABELS[2], value: 3980 },
    { label: MONTH_LABELS[3], value: 5290 },
    { label: MONTH_LABELS[4], value: 6860 },
    { label: MONTH_LABELS[5], value: 5071 },
  ],
  monthlyCosts: [
    { label: MONTH_LABELS[0], value: 11200 },
    { label: MONTH_LABELS[1], value: 12800 },
    { label: MONTH_LABELS[2], value: 8600 },
    { label: MONTH_LABELS[3], value: 10400 },
    { label: MONTH_LABELS[4], value: 14300 },
    { label: MONTH_LABELS[5], value: 10900 },
  ],
  pipelineByStage: [
    { label: 'Nieuwe lead',  value: 39300, color: '#3b82f6' },
    { label: 'Contact',      value: 12500, color: '#8b5cf6' },
    { label: 'Offerte',      value: 20418, color: '#f59e0b' },
    { label: 'Akkoord',      value: 8900,  color: '#10b981' },
    { label: 'Uitvoering',   value: 24500, color: '#1DDB62' },
    { label: 'Gepland',      value: 5200,  color: '#22c55e' },
  ],
  conversionFunnel: [
    { label: 'Leads',      value: 24, pct: 100 },
    { label: 'Contact',    value: 18, pct: 75  },
    { label: 'Offerte',    value: 12, pct: 50  },
    { label: 'Akkoord',    value: 8,  pct: 33  },
    { label: 'Afgerond',   value: 6,  pct: 25  },
  ],
  invoiceStatus: [
    { label: 'Betaald',       value: 14, color: '#1DDB62' },
    { label: 'Openstaand',    value: 6,  color: '#f59e0b' },
    { label: 'Te laat',       value: 2,  color: '#ef4444' },
    { label: 'Concept',       value: 4,  color: '#e2e8f0' },
  ],
  jobCostsByCustomer: [
    { label: 'Demo Supermarkt', value: 8400 },
    { label: 'Demo VVE',        value: 6200 },
    { label: 'Demo Van den Berg', value: 3100 },
    { label: 'Demo Jansen',     value: 2840 },
    { label: 'Demo Willems',    value: 1950 },
  ],
  weeklyHours: [
    { label: 'Wk 44', value: 38 },
    { label: 'Wk 45', value: 42 },
    { label: 'Wk 46', value: 35 },
    { label: 'Wk 47', value: 45 },
    { label: 'Wk 48', value: 40 },
    { label: 'Wk 49', value: 28 },
    { label: 'Wk 50', value: 42 },
    { label: 'Wk 51', value: 38 },
  ],
  dailyHours: (() => {
    const today = new Date().getDay();
    const worked = [0, 7.5, 8, 6, 4.5, 3, 0, 0];
    return ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((label, i) => ({
      label,
      value: i < (today === 0 ? 5 : today) ? worked[i + 1] : 0,
    }));
  })(),
  activitiesPerDay: [
    { label: 'Ma', value: 4 },
    { label: 'Di', value: 7 },
    { label: 'Wo', value: 3 },
    { label: 'Do', value: 8 },
    { label: 'Vr', value: 5 },
  ],
  leadSource: [
    { label: 'Website',       value: 35, color: '#1DDB62' },
    { label: 'Aanbeveling',   value: 28, color: '#3b82f6' },
    { label: 'Google',        value: 18, color: '#f59e0b' },
    { label: 'Social media',  value: 12, color: '#8b5cf6' },
    { label: 'Overig',        value: 7,  color: '#d1d5db' },
  ],
  topCustomers: [
    { label: 'Demo VVE Parkwijk',         value: 48418 },
    { label: 'Demo Supermarkt Holding',   value: 34300 },
    { label: 'Demo Van den Berg',         value: 22500 },
    { label: 'Demo Aannemer Willems',     value: 18600 },
    { label: 'Demo Klant Jansen',         value: 14800 },
  ],
};

// ── Hoofd export ──────────────────────────────────────────────────────────────
// Functie zodat datums altijd relatief aan vandaag zijn.

export function getDemoDashboardData() {
  const thisMonth = thisMonthISO();
  return {
    deals:      buildDeals(thisMonth),
    activities: buildActivities(),
    customers:  DEMO_CUSTOMERS,
    offertes:   buildOffertes(),
    werkbonnen: buildWerkbonnen(),
    loading:    false,
    charts:     DEMO_CHARTS,
  };
}
