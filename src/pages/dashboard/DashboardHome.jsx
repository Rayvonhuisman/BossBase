import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDemoDashboardData } from '../../data/demoDashboardData.js';
import { I } from '../../bb-shared.jsx';
import { useProfile, displayName } from '../../lib/profileContext.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useToast } from '../../lib/toast.jsx';
import { useData } from '../../lib/dataContext.jsx';
import { getUrenregistratie } from '../../services/urenService.js';
import { loadUserWidgets, saveUserWidgets } from '../../services/dashboardWidgetService.js';
import { getDefaultWidgets, DEFAULT_LAYOUTS, DEFAULT_LAYOUT_KEY, DEFAULT_MEDEWERKER_LAYOUT_KEY, normalizeWidgetSize } from '../../data/widgetRegistry.js';
import { DashboardCustomizeBar } from './DashboardCustomizeBar.jsx';
import { DashboardWidgetGrid } from './DashboardWidgetGrid.jsx';
import { statusInfo } from '../../utils/statusColors.js';
import { buildStageIndex, stageCategory } from '../../utils/pipeline.js';
import { AddWidgetModal } from './AddWidgetModal.jsx';
import { LayoutPickerModal } from './LayoutPickerModal.jsx';

const IS_DEV = import.meta.env.DEV;

// Timing-debug, zelfde vlag als in App.jsx (localStorage 'bb_debug_auth').
const authLog = (...args) => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('bb_debug_auth')) {
      // eslint-disable-next-line no-console
      console.log(`[bb:auth +${Math.round(performance.now())}ms] DashboardHome`, ...args);
    }
  } catch { /* ignore */ }
};

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

function deriveCharts({ deals = [], activities = [], offertes = [], customers = [], uren = [], facturen = [], jobCosts = [], stages = [] }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const stageIndex = buildStageIndex(stages);
  const dealCat = d => stageIndex.get(d.stage)?.category || 'open';
  const dealOrd = d => stageIndex.get(d.stage)?.order ?? -1;
  const monthKey = v => { const x = new Date(v); return isNaN(x.getTime()) ? null : x.getFullYear() * 12 + x.getMonth(); };

  // ── Omzet/winst uit ECHTE facturen + job_costs (excl. BTW) ──
  const months = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    months.push({ label: MONTHS_NL[d.getMonth()], key: d.getFullYear() * 12 + d.getMonth() });
  }
  const revInMonth = mk => facturen.reduce((s, f) => (monthKey(f.factuurdatum) === mk ? s + (Number(f.totaalExcl) || 0) : s), 0);
  const costInMonth = mk => jobCosts.reduce((s, c) => (monthKey(c.date) === mk ? s + (Number(c.amt) || 0) : s), 0);
  const monthlyRevenueAll = months.map(m => ({ label: m.label, value: Math.round(revInMonth(m.key)) }));
  const monthlyProfitAll = months.map(m => ({ label: m.label, value: Math.round(revInMonth(m.key) - costInMonth(m.key)) }));
  const hasRev = monthlyRevenueAll.some(m => m.value !== 0);
  const monthlyRevenue = hasRev ? monthlyRevenueAll : [];
  const monthlyProfit = monthlyProfitAll.some(m => m.value !== 0) ? monthlyProfitAll : [];

  // ── Pipeline per ECHTE fase (waarde per stage_id) ──
  const stageColors = ['#1DDB62', '#d97706', '#2563eb', '#7c3aed', '#15A34A', '#0d9488', '#db2777', '#e8784a', '#9ca3af'];
  const orderedStages = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const pipelineByStage = orderedStages
    .filter(s => stageCategory(s.label) !== 'lost')
    .map((s, i) => ({ label: s.label, color: stageColors[i % stageColors.length], value: deals.filter(d => d.stage === s.id).reduce((sum, d) => sum + (d.value || 0), 0) }))
    .filter(x => x.value > 0);

  // ── Conversiefunnel (mijlpalen afgeleid uit de echte fasenamen) ──
  const milestoneOrder = re => {
    const s = orderedStages.find(st => re.test((st.label || '').toLowerCase()));
    return s ? (stageIndex.get(s.id)?.order ?? Infinity) : Infinity;
  };
  const offerteOrder = milestoneOrder(/offerte/);
  const akkoordOrder = (() => {
    const s = orderedStages.find(st => { const n = (st.label || '').toLowerCase(); return /akkoord/.test(n) && !/wacht/.test(n); });
    return s ? (stageIndex.get(s.id)?.order ?? Infinity) : Infinity;
  })();
  const leads = deals.length;
  const nonLost = deals.filter(d => dealCat(d) !== 'lost');
  const fSteps = [
    { label: 'Leads', value: leads },
    { label: 'Offerte', value: nonLost.filter(d => dealOrd(d) >= offerteOrder).length },
    { label: 'Akkoord', value: nonLost.filter(d => dealOrd(d) >= akkoordOrder).length },
    { label: 'Gewonnen', value: deals.filter(d => ['won', 'paid'].includes(dealCat(d))).length },
  ];
  const conversionFunnel = leads ? fSteps.map(s => ({ ...s, pct: Math.round((s.value / leads) * 100) })) : [];

  // ── Factuurstatus uit ECHTE facturen ──
  const factuurBucket = f => {
    if (f.status === 'betaald') return 'Betaald';
    if (f.status === 'verzonden') return (f.vervaldatum && f.vervaldatum < today) ? 'Te laat' : 'Openstaand';
    return 'Concept';
  };
  const invColors = { Betaald: '#15A34A', Openstaand: '#2563eb', 'Te laat': '#dc2626', Concept: '#9ca3af' };
  const invMap = new Map();
  facturen.forEach(f => { const b = factuurBucket(f); invMap.set(b, (invMap.get(b) || 0) + 1); });
  const invoiceStatus = [...invMap.entries()].map(([label, value]) => ({ label, value, color: invColors[label] || '#9ca3af' }));

  // ── Kosten per klant uit ECHTE job_costs ──
  const nameOf = d => d.customerName || customers.find(c => c.id === d.custId)?.name || null;
  const custName = id => (id ? customers.find(c => c.id === id)?.name : null);
  const jcMap = new Map();
  jobCosts.forEach(c => {
    const nm = custName(c.customerId) || custName(c.custId) || 'Overig';
    jcMap.set(nm, (jcMap.get(nm) || 0) + (Number(c.amt) || 0));
  });
  const jobCostsByCustomer = [...jcMap.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value) }))
    .filter(x => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);

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

  const srcColors = ['#1DDB62', '#15A34A', '#2563eb', '#d97706', '#7c3aed', '#9ca3af'];
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
  const { profile, user, company, loading: profileLoading, permissionsLoaded, requestNewLead, requestNewActivity, refreshKey } = useProfile();
  const { can, isAdmin } = usePermissions();
  const toast = useToast();
  // Gedeelde data (één fetch voor de hele shell) — geen eigen queries meer.
  const { customers, deals, stages, activities, offertes, werkbonnen, calendarEvents, facturen, jobCosts, loading: sharedLoading } = useData();

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

  // Dashboard data — alleen `uren` is dashboard-specifiek (6-weken venster);
  // de rest komt uit de gedeelde DataContext.
  const [uren, setUren] = useState([]);
  const [urenLoading, setUrenLoading] = useState(true);
  const dataLoading = sharedLoading || urenLoading;

  // Load widget layout from Supabase. Pas laden zodra de rechten bekend zijn,
  // zodat we voor een medewerker (zonder opgeslagen layout) de medewerker-layout
  // kiezen i.p.v. de admin-standaard. Eén keer uitvoeren via een ref.
  const didLoadWidgetsRef = useRef(false);
  useEffect(() => {
    if (!permissionsLoaded || didLoadWidgetsRef.current) return;
    didLoadWidgetsRef.current = true;
    const defaultKey = isAdmin ? DEFAULT_LAYOUT_KEY : DEFAULT_MEDEWERKER_LAYOUT_KEY;
    loadUserWidgets()
      .then(rows => {
        const loaded = rows && rows.length > 0 ? rows.map(mapDbWidget) : getDefaultWidgets(defaultKey);
        setWidgets(loaded);
        setCurrentLayout(matchLayoutKey(loaded));
        setSavedFingerprint(widgetFingerprint(loaded));
      })
      .catch(err => {
        console.warn('[bb:dashboard] falling back to default layout:', err?.message);
        const defaults = getDefaultWidgets(defaultKey);
        setWidgets(defaults);
        setCurrentLayout(matchLayoutKey(defaults));
        setSavedFingerprint(widgetFingerprint(defaults));
      })
      .finally(() => setWidgetsLoaded(true));
  }, [permissionsLoaded, isAdmin]);

  // Load uren (dashboard-specifiek: laatste ~6 weken voor beide uren-widgets).
  // customers/deals/activities/offertes/werkbonnen/calendarEvents komen uit DataContext.
  useEffect(() => {
    let alive = true;
    setUrenLoading(true);
    const wkMonday = new Date(); wkMonday.setHours(0, 0, 0, 0);
    wkMonday.setDate(wkMonday.getDate() - ((wkMonday.getDay() + 6) % 7) - 5 * 7);
    const urenVanaf = wkMonday.toISOString().slice(0, 10);
    getUrenregistratie({ vanDatum: urenVanaf })
      .then(u => { if (alive) setUren(u); })
      .catch(() => {})
      .finally(() => { if (alive) setUrenLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const realCharts = useMemo(
    () => deriveCharts({ deals, activities, offertes, customers, uren, facturen, jobCosts, stages }),
    [deals, activities, offertes, customers, uren, facturen, jobCosts, stages]
  );
  const sharedData = demoMode
    ? demoData
    : { deals, stages, activities, customers, offertes, werkbonnen, calendarEvents, facturen, jobCosts, loading: dataLoading, charts: realCharts, currentUserId: profile?.id || null };

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
    const defaultKey = isAdmin ? DEFAULT_LAYOUT_KEY : DEFAULT_MEDEWERKER_LAYOUT_KEY;
    setWidgets(getDefaultWidgets(defaultKey));
    setCurrentLayout(defaultKey);
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

  // Reorder via drag-and-drop in edit mode. fromIdx → toIdx; the
  // dropped item is spliced into the new slot, others shift accordingly.
  // Persisted only when the user clicks "Opslaan" (same flow as moveUp/Down).
  const reorder = useCallback((fromIdx, toIdx) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    setWidgets(ws => {
      if (fromIdx >= ws.length || toIdx >= ws.length) return ws;
      const next = [...ws];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
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

  // Wacht tot de permissies bekend zijn. permissionsLoaded blijft `true` over
  // achtergrond-refreshes heen, terwijl profileLoading telkens toggelt — daarom
  // hier NIET op profileLoading gaten (dat veroorzaakte de flash van het
  // volledige dashboard bij elke token-refresh).
  authLog('render-beslissing', { permissionsLoaded, isAdmin, financieel: can('financieel'), profileLoading });
  // Iedereen (admin én medewerker) krijgt hetzelfde dashboard; widgets worden
  // per stuk gefilterd op rechten (zie DashboardWidgetGrid). De permissionsLoaded
  // gate voorkomt een flash van widgets die daarna verdwijnen.
  if (!permissionsLoaded) return null;

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
                {demoMode ? 'Demo aan' : 'Demo uit'}
              </button>
            )}
            {!editMode && (
              <>
                <button className="btn btn-s btn-sm" onClick={() => requestNewActivity?.()}>{I.act} Nieuwe activiteit</button>
                <button className="btn btn-s btn-sm" onClick={() => requestNewLead?.()}>{I.plus} Nieuwe aanvraag</button>
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
            can={can}
            setPage={setPage}
            openCustomer={openCustomer}
            openDeal={openDeal}
            openInvoice={openInvoice}
            openCalendarEvent={openCalendarEvent}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            onResize={resize}
            onRemove={remove}
            onReorder={reorder}
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
          can={can}
        />
      )}

      {showLayoutModal && (
        <LayoutPickerModal
          currentLayout={currentLayout}
          onApply={applyLayout}
          onClose={() => setShowLayoutModal(false)}
          can={can}
        />
      )}
    </>
  );
}
