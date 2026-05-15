import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDemoDashboardData } from '../../data/demoDashboardData.js';
import { I } from '../../bb-shared.jsx';
import { useProfile, displayName } from '../../lib/profileContext.jsx';
import { useToast } from '../../lib/toast.jsx';
import { listDeals } from '../../services/dealService.js';
import { listActivities } from '../../services/activityService.js';
import { listCustomers } from '../../services/customerService.js';
import { getOffertes } from '../../services/offerteService.js';
import { getWerkbonnen } from '../../services/werkbonService.js';
import { getUrenregistratie } from '../../services/urenService.js';
import { listCalendarEvents } from '../../services/calendarService.js';
import { loadUserWidgets, saveUserWidgets } from '../../services/dashboardWidgetService.js';
import { getDefaultWidgets, DEFAULT_LAYOUTS, DEFAULT_LAYOUT_KEY, normalizeWidgetSize } from '../../data/widgetRegistry.js';
import { DashboardCustomizeBar } from './DashboardCustomizeBar.jsx';
import { DashboardWidgetGrid } from './DashboardWidgetGrid.jsx';
import { AddWidgetModal } from './AddWidgetModal.jsx';
import { LayoutPickerModal } from './LayoutPickerModal.jsx';

const IS_DEV = import.meta.env.DEV;

let localIdCounter = 0;
const nextLocalId = () => `local-${++localIdCounter}`;

function mapDbWidget(row) {
  // Safe, non-destructive: clamp any saved-but-invalid size to a supported
  // one in frontend state only. Persisted to Supabase only when the user saves.
  return {
    id: row.id,
    widget_type: row.widget_type,
    title: row.title || null,
    size: normalizeWidgetSize(row.widget_type, row.size || 'medium'),
    settings: row.settings || {},
    position: row.position,
  };
}

// Stable fingerprint for dirty-check (ignores id/position, checks type+size+settings)
function widgetFingerprint(ws) {
  return JSON.stringify(ws.map(w => ({ t: w.widget_type, s: w.size, g: w.settings })));
}

// Returns the matching preset key if widgets exactly match a known layout, else 'custom'
function matchLayoutKey(widgets) {
  const sig = widgets.map(w => `${w.widget_type}:${w.size}`).join(',');
  for (const [key, layout] of Object.entries(DEFAULT_LAYOUTS)) {
    if (layout.widgets.map(w => `${w.widget_type}:${w.size}`).join(',') === sig) return key;
  }
  return 'custom';
}

// Derive chart datasets from already-loaded, company-scoped real data.
// No extra Supabase queries. Empty arrays → widgets show their empty state.
const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function isoWeekNr(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  const firstThursday = dt.getTime();
  dt.setUTCMonth(0, 1);
  if (dt.getUTCDay() !== 4) dt.setUTCMonth(0, 1 + ((4 - dt.getUTCDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - dt.getTime()) / (7 * 864e5));
}

function deriveCharts({ deals = [], activities = [], offertes = [], customers = [], uren = [] }) {
  const now = new Date();
  const monthlyRevenue = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = d.getFullYear() * 12 + d.getMonth();
    const val = deals.reduce((s, dl) => {
      if (!['paid', 'completed'].includes(dl.stage) || !dl.createdAt) return s;
      const dt = new Date(dl.createdAt);
      if (isNaN(dt.getTime())) return s;
      return dt.getFullYear() * 12 + dt.getMonth() === key ? s + (dl.value || 0) : s;
    }, 0);
    monthlyRevenue.push({ label: MONTHS_NL[d.getMonth()], value: Math.round(val) });
  }
  const hasRev = monthlyRevenue.some(m => m.value > 0);
  const monthlyProfit = hasRev ? monthlyRevenue.map(m => ({ label: m.label, value: Math.round(m.value * 0.28) })) : [];

  const stageDefs = [
    { keys: ['new_lead'], label: 'Nieuwe lead', color: '#22c55e' },
    { keys: ['contact'], label: 'Contact', color: '#d97706' },
    { keys: ['quote_sent'], label: 'Offerte verz.', color: '#2563eb' },
    { keys: ['approved'], label: 'Akkoord', color: '#7c3aed' },
    { keys: ['planned', 'in_progress'], label: 'In uitvoering', color: '#16a34a' },
  ];
  const pipelineByStage = stageDefs
    .map(sd => ({ label: sd.label, color: sd.color, value: deals.filter(d => sd.keys.includes(d.stage)).reduce((s, d) => s + (d.value || 0), 0) }))
    .filter(x => x.value > 0);

  const leads = deals.length;
  const cnt = pred => deals.filter(pred).length;
  const fSteps = [
    { label: 'Leads', value: leads },
    { label: 'Contact', value: cnt(d => !['new_lead', 'lost'].includes(d.stage)) },
    { label: 'Offerte', value: cnt(d => ['quote_sent', 'approved', 'planned', 'in_progress', 'completed', 'paid'].includes(d.stage)) },
    { label: 'Akkoord', value: cnt(d => ['approved', 'planned', 'in_progress', 'completed', 'paid'].includes(d.stage)) },
    { label: 'Gewonnen', value: cnt(d => ['completed', 'paid'].includes(d.stage)) },
  ];
  const conversionFunnel = leads ? fSteps.map(s => ({ ...s, pct: Math.round((s.value / leads) * 100) })) : [];

  const sc = st => offertes.filter(o => o.status === st).length;
  const invAll = [
    { label: 'Geaccepteerd', value: sc('geaccepteerd'), color: '#22c55e' },
    { label: 'Verzonden', value: sc('verzonden'), color: '#d97706' },
    { label: 'Concept', value: sc('concept'), color: '#9ca3af' },
  ];
  const invoiceStatus = invAll.some(s => s.value > 0) ? invAll.filter(s => s.value > 0) : [];

  const nameOf = d => d.customerName || customers.find(c => c.id === d.custId)?.name || null;
  const costMap = new Map();
  deals.filter(d => ['completed', 'paid'].includes(d.stage)).forEach(d => {
    const nm = nameOf(d) || 'Onbekend';
    costMap.set(nm, (costMap.get(nm) || 0) + (d.value || 0) * 0.35);
  });
  const jobCostsByCustomer = [...costMap.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value).slice(0, 6);

  const DN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const monday = new Date(); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const apd = DN.map((label, i) => {
    const day = new Date(monday); day.setDate(monday.getDate() + i);
    const iso = day.toISOString().slice(0, 10);
    return { label, value: activities.filter(a => a.dueAt && a.dueAt.slice(0, 10) === iso).length };
  });
  const activitiesPerDay = apd.some(x => x.value > 0) ? apd : [];

  // Hours from real urenregistratie (datum = 'YYYY-MM-DD', uren = number)
  const isoOf = dt => { const x = new Date(dt); x.setHours(0, 0, 0, 0); return x.toISOString().slice(0, 10); };
  const urenOnDay = iso => uren.reduce((s, r) => (r.datum && String(r.datum).slice(0, 10) === iso ? s + (Number(r.uren) || 0) : s), 0);
  const dh = DN.map((label, i) => {
    const day = new Date(monday); day.setDate(monday.getDate() + i);
    return { label, value: Math.round(urenOnDay(isoOf(day)) * 10) / 10 };
  });
  const dailyHours = dh.some(x => x.value > 0) ? dh : [];

  const wkRows = [];
  for (let k = 5; k >= 0; k--) {
    const start = new Date(monday); start.setDate(monday.getDate() - k * 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const lo = isoOf(start), hi = isoOf(end);
    const value = uren.reduce((s, r) => {
      const d = r.datum && String(r.datum).slice(0, 10);
      return d && d >= lo && d <= hi ? s + (Number(r.uren) || 0) : s;
    }, 0);
    wkRows.push({ label: `wk ${isoWeekNr(start)}`, value: Math.round(value * 10) / 10 });
  }
  const weeklyHours = wkRows.some(x => x.value > 0) ? wkRows : [];

  const srcColors = ['#22c55e', '#16a34a', '#2563eb', '#d97706', '#7c3aed', '#9ca3af'];
  const srcMap = new Map();
  deals.forEach(d => { if (d.source) srcMap.set(d.source, (srcMap.get(d.source) || 0) + 1); });
  const leadSource = [...srcMap.entries()].sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: srcColors[i % srcColors.length] }));

  const tcMap = new Map();
  deals.forEach(d => {
    const nm = nameOf(d);
    if (!nm) return;
    const cid = d.custId || customers.find(c => c.name === nm)?.id || null;
    const key = cid || nm;
    const e = tcMap.get(key) || { label: nm, value: 0, customerId: cid };
    e.value += (d.value || 0);
    tcMap.set(key, e);
  });
  const topCustomers = [...tcMap.values()]
    .map(e => ({ label: e.label, value: Math.round(e.value), customerId: e.customerId }))
    .filter(x => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);

  return {
    monthlyRevenue: hasRev ? monthlyRevenue : [],
    monthlyProfit,
    pipelineByStage,
    conversionFunnel,
    invoiceStatus,
    jobCostsByCustomer,
    weeklyHours,
    dailyHours,
    activitiesPerDay,
    leadSource,
    topCustomers,
  };
}

export function DashboardHome({ setPage, openCustomer, openDeal, openInvoice, openCalendarEvent }) {
  const { profile, user, company, loading: profileLoading, requestNewLead, requestNewActivity, refreshKey } = useProfile();
  const toast = useToast();

  // Demo mode: IS_DEV-only toggle that substitutes real data with static demo data
  const [demoMode, setDemoMode] = useState(IS_DEV);
  const demoData = useMemo(() => getDemoDashboardData(), []);

  // Widget layout state
  const [widgets, setWidgets] = useState([]);
  const [widgetsLoaded, setWidgetsLoaded] = useState(false);
  const [currentLayout, setCurrentLayout] = useState(null); // preset key | 'custom' | null (loading)
  const [editMode, setEditMode] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);

  // Snapshots used for cancel
  const preEditRef = useRef([]);
  const preEditLayoutRef = useRef(null);

  // Dashboard data
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [offertes, setOffertes] = useState([]);
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [uren, setUren] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Load widget layout from Supabase on mount
  useEffect(() => {
    loadUserWidgets()
      .then(rows => {
        const loaded = rows && rows.length > 0 ? rows.map(mapDbWidget) : getDefaultWidgets();
        setWidgets(loaded);
        setCurrentLayout(matchLayoutKey(loaded));
        setSavedFingerprint(widgetFingerprint(loaded));
      })
      .catch(err => {
        console.warn('[bb:dashboard] falling back to default layout:', err?.message);
        const defaults = getDefaultWidgets();
        setWidgets(defaults);
        setCurrentLayout(matchLayoutKey(defaults));
        setSavedFingerprint(widgetFingerprint(defaults));
      })
      .finally(() => setWidgetsLoaded(true));
  }, []);

  // Load dashboard data
  useEffect(() => {
    let alive = true;
    setDataLoading(true);
    // Limit urenregistratie to the last ~6 weeks (covers both hour widgets)
    const wkMonday = new Date(); wkMonday.setHours(0, 0, 0, 0);
    wkMonday.setDate(wkMonday.getDate() - ((wkMonday.getDay() + 6) % 7) - 5 * 7);
    const urenVanaf = wkMonday.toISOString().slice(0, 10);
    Promise.all([
      listDeals(),
      listActivities(),
      listCustomers(),
      getOffertes().catch(() => []),
      getWerkbonnen().catch(() => []),
      getUrenregistratie({ vanDatum: urenVanaf }).catch(() => []),
      listCalendarEvents().catch(() => []),
    ]).then(([d, a, c, o, w, u, ce]) => {
      if (!alive) return;
      setDeals(d); setActivities(a); setCustomers(c); setOffertes(o); setWerkbonnen(w); setUren(u); setCalendarEvents(ce);
    }).catch(() => {}).finally(() => alive && setDataLoading(false));
    return () => { alive = false; };
  }, [refreshKey]);

  const realCharts = useMemo(
    () => deriveCharts({ deals, activities, offertes, customers, uren }),
    [deals, activities, offertes, customers, uren]
  );
  const sharedData = demoMode
    ? demoData
    : { deals, activities, customers, offertes, werkbonnen, calendarEvents, loading: dataLoading, charts: realCharts };

  // Dirty check: anything changed since entering edit mode?
  const isDirty = useMemo(
    () => editMode && widgetFingerprint(widgets) !== widgetFingerprint(preEditRef.current),
    [editMode, widgets]
  );

  // Edit mode lifecycle
  const enterEdit = () => {
    preEditRef.current = widgets;
    preEditLayoutRef.current = currentLayout;
    setSaveError('');
    setEditMode(true);
  };

  const cancelEdit = () => {
    setWidgets(preEditRef.current);
    setCurrentLayout(preEditLayoutRef.current);
    setSaveError('');
    setEditMode(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await saveUserWidgets(widgets);
      setSavedFingerprint(widgetFingerprint(widgets));
      setEditMode(false);
      toast.success('Dashboard opgeslagen');
    } catch (e) {
      const msg = e.message || 'Opslaan mislukt — probeer opnieuw.';
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Reset: updates local state only — stays dirty until saved or cancelled
  const handleReset = () => {
    setWidgets(getDefaultWidgets());
    setCurrentLayout(DEFAULT_LAYOUT_KEY);
    setSaveError('');
  };

  // Widget operations
  const moveUp = useCallback(idx => {
    if (idx === 0) return;
    setWidgets(ws => {
      const next = [...ws];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setCurrentLayout('custom');
  }, []);

  const moveDown = useCallback(idx => {
    setWidgets(ws => {
      if (idx >= ws.length - 1) return ws;
      const next = [...ws];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setCurrentLayout('custom');
  }, []);

  const resize = useCallback((idx, size) => {
    setWidgets(ws => ws.map((w, i) => i === idx ? { ...w, size } : w));
    setCurrentLayout('custom');
  }, []);

  const remove = useCallback(idx => {
    setWidgets(ws => ws.filter((_, i) => i !== idx));
    setCurrentLayout('custom');
  }, []);

  const addWidget = useCallback(widgetMeta => {
    setWidgets(ws => [...ws, {
      id: nextLocalId(),
      widget_type: widgetMeta.type,
      title: null,
      size: normalizeWidgetSize(widgetMeta.type, widgetMeta.defaultSize),
      settings: {},
      position: ws.length,
    }]);
    setCurrentLayout('custom');
  }, []);

  const applyLayout = useCallback(layoutKey => {
    const layout = DEFAULT_LAYOUTS[layoutKey];
    if (!layout) return;
    setWidgets(layout.widgets.map((w, i) => ({
      id: nextLocalId(),
      widget_type: w.widget_type,
      title: null,
      size: normalizeWidgetSize(w.widget_type, w.size),
      settings: {},
      position: i,
    })));
    setCurrentLayout(layoutKey);
    setSaveError('');
  }, []);

  const updateSettings = useCallback((idx, settings) => {
    setWidgets(ws => ws.map((w, i) => i === idx ? { ...w, settings } : w));
  }, []);

  // Header greeting
  const greetName = displayName(profile, user);
  const hour = new Date().getHours();
  const greetWord = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
  const greeting = greetName
    ? `${greetWord}, ${greetName}`
    : profileLoading ? 'Profiel laden…' : 'Welkom bij BossBase';
  const todayStr = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const subline = company?.name ? `${todayStr} · ${company.name}` : todayStr;

  return (
    <>
      <div>
        {/* Page header */}
        <div className="page-hd afu">
          <div>
            <h1>{greeting}</h1>
            <p>{subline}</p>
          </div>
          <div className="page-hd-actions">
            {IS_DEV && !editMode && (
              <button
                className="btn btn-sm"
                style={demoMode
                  ? { background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047' }
                  : { background: 'var(--bgs)', color: 'var(--dl)', border: '1px solid var(--border)' }
                }
                onClick={() => setDemoMode(v => !v)}
                title="Alleen zichtbaar in development"
              >
                {demoMode ? '🟡 Demo aan' : '⚪ Demo uit'}
              </button>
            )}
            {!editMode && (
              <>
                <button className="btn btn-s btn-sm" onClick={() => requestNewActivity?.()}>{I.act} Nieuwe activiteit</button>
                <button className="btn btn-s btn-sm" onClick={() => requestNewLead?.()}>{I.plus} Nieuwe lead</button>
                <button className="btn btn-p btn-sm" onClick={enterEdit}>{I.edit} Dashboard aanpassen</button>
              </>
            )}
          </div>
        </div>

        {/* Customize bar in edit mode */}
        {editMode && (
          <DashboardCustomizeBar
            onAdd={() => setShowAddModal(true)}
            onLayoutPicker={() => setShowLayoutModal(true)}
            onReset={handleReset}
            onSave={handleSave}
            onCancel={cancelEdit}
            saving={saving}
            isDirty={isDirty}
            saveError={saveError}
          />
        )}

        {/* Widget grid */}
        {widgetsLoaded ? (
          <DashboardWidgetGrid
            widgets={widgets}
            editMode={editMode}
            data={sharedData}
            setPage={setPage}
            openCustomer={openCustomer}
            openDeal={openDeal}
            openInvoice={openInvoice}
            openCalendarEvent={openCalendarEvent}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            onResize={resize}
            onRemove={remove}
            onSettingsChange={updateSettings}
          />
        ) : (
          <div className="dw-grid">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="dw-widget" data-size="small">
                <div className="card dw-skel-card" />
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddWidgetModal
          existingTypes={widgets.map(w => w.widget_type)}
          onAdd={addWidget}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showLayoutModal && (
        <LayoutPickerModal
          currentLayout={currentLayout}
          onApply={applyLayout}
          onClose={() => setShowLayoutModal(false)}
        />
      )}
    </>
  );
}
