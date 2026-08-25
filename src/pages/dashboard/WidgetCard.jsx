import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { I } from '../../bb-shared.jsx';
import { getSupportedSizes } from '../../data/widgetRegistry.js';
import { activiteitTypeLabel } from '../../services/activityService.js';
import { statusInfo } from '../../utils/statusColors.js';
import { buildStageIndex, firstStageId } from '../../utils/pipeline.js';
import { sumOmzetExclBtw } from '../../services/customerTotalsService.js';

// ── Design tokens (BossBase widget redesign v2) ───────────────
// CSS classes (.bb-widget, .bb-kpi, .feed-row, .chip, .pill-tabs, …)
// live in src/bb-dashboard.css scoped under .dw-grid.
const C = {
  p: '#1DDB62', pd: '#15A34A', pll: '#f0fdf4', pl: '#d1fae5',
  dk: '#0D0D0D', dm: '#374151', dmu: '#6b7280', dl: '#9ca3af',
  border: '#f0ede9', track: '#f1f3f5',
  success: '#15A34A', successBg: '#ecfdf5',
  info:    '#2563eb', infoBg:    '#eff6ff',
  warn:    '#dc2626', warnBg:    '#fef2f2',
  neutral: '#6b7280', neutralBg: '#f3f4f6',
  purple:  '#7c3aed', purpleBg:  '#f5f3ff',
  orange:  '#c2410c', orangeBg:  '#fff4ec',
  teal:    '#0d9488', tealBg:    '#f0fdfa',
  amber:   '#b45309', amberBg:   '#fffbeb',
  green: '#1DDB62', greenDark: '#15A34A', greenSoft: '#d1fae5', greenSofter: '#f0fdf4', greenInk: '#15A34A',
};

// Dashboard-widgets tonen hele euro's (geen centen) in NL-notatie: € 1.250.000.
// Centen elders (offertes, facturen, kostenregels, PDF's) blijven ongemoeid.
const eur  = n => '€ ' + Math.round(Number(n) || 0).toLocaleString('nl-NL', { maximumFractionDigits: 0 });
const kEur = n => {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1000) return '€ ' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '€ ' + Math.round(n).toLocaleString('nl-NL', { maximumFractionDigits: 0 });
};

// Schaalt de hoofdwaarde automatisch terug zodat grote bedragen (tonnen,
// € 1.250.000) altijd binnen de vaste widgetbreedte passen — zonder de widget
// te laten groeien, afkappen of overflowen. Tussen min en max font-size.
function FitValue({ children, className = 'bb-kpi-value', style, max = 26, min = 14 }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let s = max;
      el.style.fontSize = s + 'px';
      let guard = 60;
      // Krimp tot de inhoud binnen de eigen breedte past (of de min bereikt is).
      while (s > min && el.scrollWidth > el.clientWidth && guard-- > 0) {
        s -= 1;
        el.style.fontSize = s + 'px';
      }
    };
    fit();
    const parent = el.parentElement;
    const ro = parent ? new ResizeObserver(fit) : null;
    if (ro && parent) ro.observe(parent);
    return () => ro?.disconnect();
  }, [children, max, min]);
  return (
    <div ref={ref} className={className} style={{ ...style, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {children}
    </div>
  );
}
const initialsOf = s => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
function toLocalDateKey(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike.slice(0, 10)) && dateLike.length <= 10) return dateLike.slice(0, 10);
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return typeof dateLike === 'string' ? dateLike.slice(0, 10) : null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const relAgo = iso => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return null;
  const h = Math.floor(ms / 36e5);
  if (h < 1) return 'zojuist';
  if (h < 24) return `${h}u`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 dag' : `${d}d`;
};
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// avatar color tone derived from a string (stable hash)
function avatarTone(name) {
  const palette = [
    { bg: '#ecfdf5', fg: '#15A34A' },
    { bg: '#eff6ff', fg: '#2563eb' },
    { bg: '#f5f3ff', fg: '#7c3aed' },
    { bg: '#fff4ec', fg: '#c2410c' },
    { bg: '#f0fdfa', fg: '#0d9488' },
    { bg: '#fffbeb', fg: '#b45309' },
  ];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ── Size toggle labels (edit mode) ────────────────────────────
const SIZE_OPTIONS = [
  { value: 'small',  label: 'Klein · ¼' },
  { value: 'medium', label: 'Middel · ⅓' },
  { value: 'large',  label: 'Groot · ½' },
  { value: 'full',   label: 'Breed · ↔' },
];

function WidgetControls({ size, supportedSizes, onMoveUp, onMoveDown, onResize, onRemove, isFirst, isLast }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sizeOptions = SIZE_OPTIONS.filter(o => supportedSizes.includes(o.value));
  // Prevent the controls subtree from initiating an HTML5 drag on the
  // parent .dw-widget. draggable={false} suppresses drag-from-this-element;
  // onMouseDown+stopPropagation prevents the parent from receiving the
  // mousedown that would later turn into a dragstart.
  const stopMouse = e => e.stopPropagation();
  return (
    <div
      className="dw-controls"
      draggable={false}
      onClick={e => e.stopPropagation()}
      onMouseDown={stopMouse}
      onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      <button className="dw-ctrl-btn" onClick={onMoveUp}   disabled={isFirst} title="Omhoog">▲</button>
      <button className="dw-ctrl-btn" onClick={onMoveDown} disabled={isLast}  title="Omlaag">▼</button>
      <div style={{ position: 'relative' }}>
        <button className="dw-ctrl-btn dw-ctrl-menu" onClick={() => setMenuOpen(v => !v)} title="Opties">•••</button>
        {menuOpen && (
          <div className="dw-ctrl-dropdown" onClick={() => setMenuOpen(false)} onMouseDown={stopMouse}>
            <div className="dw-ctrl-section">Grootte</div>
            <div className="dw-size-row">
              {sizeOptions.map(o => (
                <button key={o.value} className={`dw-size-btn${size === o.value ? ' active' : ''}`} onClick={() => onResize(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="dw-ctrl-divider" />
            <button className="dw-ctrl-item danger" onClick={onRemove}>{I.trash} Verwijderen</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Class-based primitives ────────────────────────────────────
function WHead({ eyebrow, title, sub, right, bordered = true }) {
  return (
    <div className={`bb-widget-head${bordered ? ' bordered' : ''}`}>
      <div className="text">
        {eyebrow && <span className="bb-widget-eyebrow">{eyebrow}</span>}
        {title && <h3 className="bb-widget-title">{title}</h3>}
        {sub != null && <p className="bb-widget-sub">{sub}</p>}
      </div>
      {right && <div className="actions">{right}</div>}
    </div>
  );
}

function WFoot({ meta, linkText, onLink }) {
  return (
    <div className="bb-widget-foot">
      <span className="foot-meta">{meta}</span>
      {linkText && (
        <button className="foot-link" onClick={onLink}>
          {linkText}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      )}
    </div>
  );
}

function Chip({ tone = 'neutral', noDot = false, children, style }) {
  return <span className={`chip chip-${tone}${noDot ? ' no-dot' : ''}`} style={style}>{children}</span>;
}

function Delta({ dir = 'up', children }) {
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·';
  return <span className={`delta ${dir}`}>{arrow} {children}</span>;
}

function Avatar({ name, size = 34 }) {
  return (
    <div className="bbw-avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initialsOf(name)}
    </div>
  );
}

function AvatarSq({ name }) {
  const t = avatarTone(name);
  return (
    <span className="avatar-sq" style={{ '--avBg': t.bg, '--avFg': t.fg }}>
      {initialsOf(name)}
    </span>
  );
}


function Seg({ options, active, onPick }) {
  return (
    <div className="pill-tabs">
      {options.map(o => (
        <button key={o} className={`pill-tab sm${o === active ? ' active' : ''}`} onClick={() => onPick && onPick(o)}>{o}</button>
      ))}
    </div>
  );
}

// KPI card (full bb-kpi)
function KpiCard({ icon, label, value, sub, tone = 'green', onClick }) {
  return (
    <div className={`bb-kpi kpi-${tone}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}>
      <div className="bb-kpi-label">
        {icon && <span className="tile">{icon}</span>}
        {label}
      </div>
      <FitValue>{value}</FitValue>
      {sub && <div className="bb-kpi-sub">{sub}</div>}
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty">
      <div className="empty-art">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
      </div>
      {title && <h4 className="empty-title">{title}</h4>}
      {text && <p className="empty-text">{text}</p>}
    </div>
  );
}

function Tt({ title, rows }) {
  const r = (rows || []).filter(Boolean);
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.dk, marginBottom: r.length ? 5 : 0 }}>{title}</div>
      {r.map((x, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.5 }}>
          <span style={{ color: C.dmu }}>{x.k}</span>
          <span style={{ fontWeight: 700, color: x.c || C.dk }}>{x.v}</span>
        </div>
      ))}
    </div>
  );
}

// Measure container width (for responsive charts)
function useMeasuredWidth(initial = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function smoothLinePath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function niceTop(max) {
  if (max <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const norm = max / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// ── Activity-type → row icon class ────────────────────────────
const actIcoClass = t => ({
  call: 'ic-call', email: 'ic-email', visit: 'ic-visit',
  task: 'ic-task', follow: 'ic-follow', followup: 'ic-follow',
  note: 'ic-note', deal: 'ic-deal',
}[t] || 'ic-task');

const actIcoSvg = t => {
  const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  switch (t) {
    case 'call':   return <svg {...base}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'email':  return <svg {...base}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>;
    case 'visit':  return <svg {...base}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case 'follow': return <svg {...base}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>;
    default:       return <svg {...base}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
  }
};

// ── Widget content renderer ───────────────────────────────────
function renderContent(type, data, widget, setPage, openCustomer, onSettingsChange, ux, openDeal, openInvoice, openCalendarEvent) {
  const { deals = [], stages = [], activities = [], customers = [], offertes = [], werkbonnen = [], calendarEvents = [], facturen = [], jobCosts = [], loading, currentUserId = null } = data;
  // Fase-categorie per deal (stage_id = uuid → semantische groep) zodat de
  // pipeline-/financiële widgets op echte data werken.
  const stageIndex = buildStageIndex(stages);
  const dealCat = d => stageIndex.get(d.stage)?.category || 'open';
  const orderedStages = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const dealOrd = d => stageIndex.get(d.stage)?.order ?? -1;
  // "Akkoord"-mijlpaal (geaccepteerd) afgeleid uit de echte fasenamen.
  const akkoordOrder = (() => {
    const s = orderedStages.find(st => { const n = (st.label || '').toLowerCase(); return /akkoord/.test(n) && !/wacht/.test(n); });
    return s ? (stageIndex.get(s.id)?.order ?? Infinity) : Infinity;
  })();
  const thisMonthKey = (() => { const n = new Date(); return n.getFullYear() * 12 + n.getMonth(); })();
  const inThisMonth = v => { const d = new Date(v); return !isNaN(d.getTime()) && d.getFullYear() * 12 + d.getMonth() === thisMonthKey; };
  // Persoonlijke widgets (eigen activiteiten/werkbonnen/agenda) tonen alleen de
  // items van de ingelogde gebruiker — ook voor admin, want het dashboard is
  // persoonlijk (de Planning-pagina blijft het volledige team-overzicht). Voor
  // een medewerker is dit al via RLS afgedwongen; dit dekt admin/planner af.
  const myActivities = currentUserId ? activities.filter(a => (a.assignedToIds && a.assignedToIds.includes(currentUserId)) || a.assignee === currentUserId) : activities;
  const myWerkbonnen = currentUserId ? werkbonnen.filter(w => (w.assignedToIds && w.assignedToIds.includes(currentUserId)) || w.assignedTo === currentUserId) : werkbonnen;
  const myCalendarEvents = currentUserId ? calendarEvents.filter(e => e.assignedTo === currentUserId) : calendarEvents;
  const charts = data.charts || {};
  if (loading) return (
    <div className="bb-widget">
      <WHead bordered={false} title="Laden…" right={<div className="spinner" />} />
      <div style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="skel" style={{ width: 36, height: 36, borderRadius: 10 }} />
            <div style={{ flex: 1 }}>
              <div className="skel" style={{ height: 10, width: '72%', marginBottom: 8 }} />
              <div className="skel" style={{ height: 8, width: '48%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const customerById = id => customers.find(c => c.id === id);
  const today = new Date().toISOString().slice(0, 10);
  const isOpenAct = a => a.status !== 'completed' && a.status !== 'done';
  const tip = (e, node) => ux && ux.tip && ux.tip(e, node);
  const off = () => ux && ux.off && ux.off();
  const hov = node => ({ onMouseMove: e => tip(e, node), onMouseLeave: off });
  const goCustOr = (custId, page) => () => { if (custId) openCustomer(custId); else setPage(page); };
  const goDeal = d => () => {
    if (d && d.id && openDeal) openDeal(d.id);
    else if (d && d.custId) openCustomer(d.custId);
    else setPage('pipeline');
  };
  const goInvoice = o => () => { if (o && o.id && openInvoice) openInvoice(o.id); else setPage('revenue'); };
  const open = {
    offerte:  o => o && o.id ? setPage('offertes', { id: o.id }) : setPage('offertes'),
    werkbon:  w => w && w.id ? setPage('werkbonnen', { id: w.id }) : setPage('werkbonnen'),
    activity: a => a && a.id ? setPage('activities', { id: a.id }) : (a && a.custId ? openCustomer(a.custId) : setPage('activities')),
  };
  const openAgendaItem = it => () => {
    if (it.kind === 'event') { if (it.id && openCalendarEvent) openCalendarEvent(it.id); else setPage('calendar'); }
    else if (it.activityId || it.id) setPage('activities', { id: it.activityId || it.id });
    else if (it.custId) openCustomer(it.custId);
    else setPage('calendar');
  };

  switch (type) {

    // ───────── KPI cards ─────────
    case 'open_pipeline_value': {
      const open = deals.filter(d => dealCat(d) === 'open');
      const val = open.reduce((s, d) => s + (d.value || 0), 0);
      return <KpiCard tone="green" icon={I.brief} label="Open pipeline" value={eur(val)} sub={<><span>{open.length} deals</span><span>·</span><Delta dir="up">Live</Delta></>} onClick={() => setPage('pipeline')} />;
    }
    case 'accepted_value': {
      // Geaccepteerd = deals die de Akkoord-fase of verder hebben bereikt.
      const acc = deals.filter(d => dealCat(d) !== 'lost' && dealOrd(d) >= akkoordOrder);
      const val = acc.reduce((s, d) => s + (d.value || 0), 0);
      return <KpiCard tone="success" icon={I.euro} label="Geaccepteerd" value={eur(val)} sub={<><span>{acc.length} deals</span><span>·</span><Delta dir="up">Akkoord+</Delta></>} onClick={() => setPage('pipeline')} />;
    }
    case 'customers':
      return <KpiCard tone="info" icon={I.cust} label="Klanten" value={customers.length} sub={`${customers.length} actief in CRM`} onClick={() => setPage('customers')} />;

    case 'costs_per_job': {
      // Echte job_costs, gegroepeerd per klus (deal/project/werkbon).
      const byJob = new Map();
      jobCosts.forEach(c => { const k = c.dealId || c.projectId || c.werkbonId || c.id; byJob.set(k, (byJob.get(k) || 0) + (Number(c.amt) || 0)); });
      const jobs = [...byJob.values()];
      const avg = jobs.length ? jobs.reduce((s, v) => s + v, 0) / jobs.length : 0;
      return <KpiCard tone="neutral" icon={I.costs} label="Kosten per klus" value={avg > 0 ? eur(avg) : '—'} sub={jobs.length ? `gemiddeld · ${jobs.length} klussen` : 'geen kosten geregistreerd'} onClick={() => setPage('costs')} />;
    }
    case 'costs_month': {
      const md = jobCosts.filter(c => inThisMonth(c.date));
      const val = md.reduce((s, c) => s + (Number(c.amt) || 0), 0);
      return <KpiCard tone="amber" icon={I.costs} label="Kosten deze maand" value={val > 0 ? eur(val) : '—'} sub={`${md.length} kostenposten`} onClick={() => setPage('costs')} />;
    }
    case 'billable': {
      // Te factureren = afgeronde klussen (deals in een 'afgerond'-fase).
      const b = deals.filter(d => dealCat(d) === 'won');
      const val = b.reduce((s, d) => s + (d.value || 0), 0);
      return <KpiCard tone="warn" icon={I.euro} label="Te factureren" value={val > 0 ? eur(val) : '—'} sub={b.length ? `${b.length} afgeronde klussen` : 'niets in de wacht'} onClick={() => setPage('facturen')} />;
    }

    case 'revenue_month': {
      // Omzet = gefactureerd deze maand excl. BTW. Dezelfde factuurselectie als
      // Financiën (geen concepten), alleen zonder BTW — vandaar een ander
      // bedrag dan de tegel "Gefactureerd" daar.
      const val = sumOmzetExclBtw(facturen.filter(f => inThisMonth(f.factuurdatum)));
      const series = (charts.monthlyRevenue || []);
      const spark = series.slice(-6);
      const prevVal = series.length > 1 ? series[series.length - 2].value : 0;
      const cur = series.length ? series[series.length - 1].value : val;
      const change = prevVal ? Math.round(((cur - prevVal) / prevVal) * 100) : 0;
      const sMax = Math.max(...spark.map(s => s.value), 1);
      return (
        <div className="bb-kpi kpi-success" onClick={() => setPage('revenue')} role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPage('revenue'); } }}>
          <div className="bb-kpi-label">
            <span className="tile">{I.revenue}</span>
            Omzet deze maand
          </div>
          <FitValue>{eur(val)}</FitValue>
          <div className="bb-kpi-sub">
            <span>vs. vorige maand</span>
            <span>·</span>
            <Delta dir={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '+' : ''}{change}%</Delta>
          </div>
          {spark.length >= 2 && (
            <svg className="bb-kpi-spark" viewBox="0 0 100 36" preserveAspectRatio="none">
              {(() => {
                const p = spark.map((s, i) => [i * (100 / (spark.length - 1)), 30 - (s.value / sMax) * 24]);
                const ln = p.map((q, i) => (i === 0 ? `M${q[0]},${q[1]}` : `L${q[0]},${q[1]}`)).join(' ');
                return (<><path d={`${ln} L100,36 L0,36 Z`} fill={C.greenSoft} /><path d={ln} fill="none" stroke={C.green} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></>);
              })()}
            </svg>
          )}
        </div>
      );
    }

    case 'profit_month': {
      // Winst = omzet (facturen excl. BTW) − kosten (job_costs), deze maand.
      const rev = sumOmzetExclBtw(facturen.filter(f => inThisMonth(f.factuurdatum)));
      const cost = jobCosts.filter(c => inThisMonth(c.date)).reduce((s, c) => s + (Number(c.amt) || 0), 0);
      const val = rev - cost;
      const target = Math.max(1, Math.round(rev));
      const p = rev > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0;
      return (
        <div className="bb-kpi kpi-green" onClick={() => setPage('revenue')} role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPage('revenue'); } }}>
          <div className="bb-kpi-label">
            <span className="tile">{I.trend}</span>
            Winst deze maand
          </div>
          <FitValue>{eur(val)}</FitValue>
          <div className="bb-kpi-sub">
            <span>omzet {eur(rev)}</span>
            <span>·</span>
            <span>kosten {eur(cost)}</span>
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: C.track, overflow: 'hidden' }}>
                <div style={{ width: `${p}%`, height: '100%', background: C.green, borderRadius: 999, transition: 'width .6s cubic-bezier(.22,1,.36,1)' }} />
              </div>
              <span style={{ fontSize: 11.5, color: C.dmu, fontWeight: 700 }}>{p}%</span>
            </div>
          </div>
        </div>
      );
    }

    // ───────── Acties vandaag ─────────
    case 'actions_today': {
      const items = myActivities.filter(a => isOpenAct(a) && (a.dueAt?.slice(0, 10) === today || a.status === 'today' || a.status === 'overdue')).slice(0, 8);
      const overdue = myActivities.filter(a => isOpenAct(a) && a.dueAt && a.dueAt.slice(0, 10) < today).length;
      if (widget.size === 'small') {
        return <KpiCard tone={overdue > 0 ? 'warn' : 'info'} icon={I.act} label="Activiteiten vandaag" value={items.length} sub={overdue > 0 ? <>{overdue} <Delta dir="down">te laat</Delta></> : 'alles op tijd'} onClick={() => setPage('activities')} />;
      }
      return (
        <div className="bb-widget">
          <WHead title="Activiteiten vandaag" sub={`${items.length} openstaand · ${overdue} te laat`}
            right={<Chip tone={overdue > 0 ? 'warn' : 'success'} noDot={overdue === 0}>{overdue > 0 ? `${overdue} te laat` : 'Op schema'}</Chip>} />
          {items.length === 0 ? (
            <EmptyState title="Geen activiteiten vandaag" text="Tijd om vooruit te plannen of even adem te halen." />
          ) : (
            <div className="feed">
              {items.map(a => {
                const c = customerById(a.custId);
                const od = a.status === 'overdue' || (a.dueAt && a.dueAt.slice(0, 10) < today);
                return (
                  <button key={a.id} className={`feed-row ${actIcoClass(a.type)}`} onClick={() => open.activity(a)}>
                    <span className="feed-icon">{actIcoSvg(a.type)}</span>
                    <div className="feed-main">
                      <div className="feed-title">{a.title}{c && <> · <strong>{c.name}</strong></>}</div>
                      <div className="feed-meta">
                        <span>{a.time || a.dueAt?.slice(0, 10) || '—'}</span>
                        {a.type && (<><span className="sep">·</span><span>{activiteitTypeLabel(a.type)}</span></>)}
                      </div>
                    </div>
                    <div className="feed-aside">
                      <Chip tone={od ? 'warn' : (a.dueAt?.slice(0, 10) === today ? 'info' : 'neutral')}>{od ? 'Te laat' : (a.dueAt?.slice(0, 10) === today ? 'Vandaag' : (a.time || '—'))}</Chip>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <WFoot meta={`${items.length} open · ${overdue} te laat`} linkText="Alle activiteiten" onLink={() => setPage('activities')} />
        </div>
      );
    }

    // ───────── Taken te laat ─────────
    case 'overdue_tasks': {
      const items = myActivities.filter(a => isOpenAct(a) && a.dueAt && a.dueAt.slice(0, 10) < today).slice(0, 6);
      if (widget.size === 'small') {
        return <KpiCard tone={items.length ? 'warn' : 'success'} icon={I.clock} label="Taken te laat" value={items.length} sub={items.length ? `${items.length} over datum` : 'alles op tijd'} onClick={() => setPage('activities')} />;
      }
      return (
        <div className="bb-widget">
          <WHead title="Taken te laat" sub={<><strong style={{ color: C.warn }}>{items.length}</strong> activiteiten over datum</>} right={<Chip tone="warn">Actie nodig</Chip>} />
          {items.length === 0 ? (
            <EmptyState title="Niets te laat" text="Mooi werk — geen openstaande achterstand." />
          ) : (
            <div className="feed">
              {items.map(a => {
                const c = customerById(a.custId);
                const od = Math.max(1, Math.floor((new Date(today) - new Date(a.dueAt.slice(0, 10))) / 864e5));
                const openIt = () => open.activity(a);
                return (
                  <div key={a.id} className="feed-row ic-overdue" role="button" tabIndex={0}
                    onClick={openIt}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); } }}>
                    <span className="feed-icon" style={{ fontWeight: 800, fontSize: 12 }}>{od}d</span>
                    <div className="feed-main">
                      <div className="feed-title">{a.title}</div>
                      <div className="feed-meta">
                        {c && <><strong>{c.name}</strong><span className="sep">·</span></>}
                        <span>gepland {a.dueAt?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div className="feed-aside">
                      <button className="bbw-btn sm ghost" onClick={e => { e.stopPropagation(); openIt(); }}>Plan</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <WFoot meta={`${items.length} achterstallig`} linkText="Alle activiteiten" onLink={() => setPage('activities')} />
        </div>
      );
    }

    // ───────── Nieuwe aanvragen ─────────
    case 'new_leads': {
      // Eerste pipeline-fase ("Nieuwe aanvragen") bepalen uit de echte stages
      // (deals dragen een stage_id/uuid; de oude 'new_lead'-string blijft als
      // fallback voor demo-data).
      const firstId = firstStageId(stages);
      const allLeads = deals.filter(d => d.stage === firstId || d.stage === 'new_lead');
      const count = allLeads.length;
      const totalVal = allLeads.reduce((s, d) => s + (d.value || 0), 0);
      const items = allLeads.slice(0, 6);
      if (widget.size === 'small') {
        return <KpiCard tone="info" icon={I.pipe} label="Nieuwe aanvragen" value={count} sub={count ? `${kEur(totalVal)} potentieel` : 'geen aanvragen deze week'} onClick={() => setPage('pipeline')} />;
      }
      const WK = 7 * 864e5, nm = Date.now();
      const dated = allLeads.filter(d => d.createdAt);
      const thisWk = dated.length ? dated.filter(d => nm - new Date(d.createdAt).getTime() < WK).length : count;
      const lastWk = dated.filter(d => { const a = nm - new Date(d.createdAt).getTime(); return a >= WK && a < 2 * WK; }).length;
      const delta = thisWk - lastWk;
      return (
        <div className="bb-widget">
          <WHead title="Nieuwe aanvragen" sub={`${thisWk} deze week · ${delta >= 0 ? '+' : ''}${delta} t.o.v. vorige`}
            right={<Chip tone="info" noDot>{count} totaal</Chip>} />
          {items.length === 0 ? (
            <EmptyState title="Geen nieuwe aanvragen" text="Tijd om je netwerk aan te spreken." />
          ) : (
            <div className="feed">
              {items.map(d => {
                const c = customerById(d.custId);
                const name = c?.name || d.customerName || 'Onbekende klant';
                const ago = relAgo(d.createdAt);
                return (
                  <button key={d.id} className="feed-row ic-lead" onClick={goDeal(d)}>
                    <span className="feed-icon"><AvatarSq name={name} /></span>
                    <div className="feed-main">
                      <div className="feed-title">{name}</div>
                      <div className="feed-meta">
                        <span>{d.title}</span>
                        {d.city && (<><span className="sep">·</span><span>{d.city}</span></>)}
                      </div>
                    </div>
                    <div className="feed-aside">
                      {d.source && <Chip tone="info" noDot>{d.source}</Chip>}
                      {ago && <span>{ago}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <WFoot meta={`${kEur(totalVal)} potentieel`} linkText="Alle aanvragen" onLink={() => setPage('pipeline')} />
        </div>
      );
    }

    // ───────── Actieve deals ─────────
    case 'active_deals': {
      // Echte deals in de pipeline: niet verloren/afgerond/betaald, en niet de
      // eerste (nieuwe aanvragen) fase. Valt terug op demo-strings.
      const all = deals.filter(d => stageIndex.size
        ? (dealCat(d) === 'open' && !stageIndex.get(d.stage)?.isFirst)
        : !['lost', 'completed', 'paid', 'new_lead'].includes(d.stage));
      const count = all.length;
      const totalVal = all.reduce((s, d) => s + (d.value || 0), 0);
      const items = all.slice(0, 6);
      // Mock/demo-fallback (string-stage-ids). Echte deals dragen een stage_id
      // (uuid) → die zoeken we op in `stages` voor naam + kleur.
      const stageMeta = {
        contact:     { label: 'Contact',       tone: 'amber' },
        quote_sent:  { label: 'Offerte verz.', tone: 'neutral' },
        approved:    { label: 'Akkoord',       tone: 'success' },
        planned:     { label: 'Gepland',       tone: 'info' },
        in_progress: { label: 'In uitvoering', tone: 'purple' },
      };
      const toneBadge = { amber: 'b-orange', neutral: 'b-gray', success: 'b-green', info: 'b-blue', purple: 'b-purple' };
      const nextAct = custId => {
        const na = activities.filter(a => a.custId === custId && isOpenAct(a) && a.dueAt).sort((x, y) => new Date(x.dueAt) - new Date(y.dueAt))[0];
        if (!na) return null;
        const diff = Math.round((new Date(na.dueAt.slice(0, 10)) - new Date(today)) / 864e5);
        return diff < 0 ? `${Math.abs(diff)}d te laat` : diff === 0 ? 'vandaag' : diff === 1 ? 'morgen' : `over ${diff}d`;
      };
      return (
        <div className="bb-widget">
          <WHead title="Actieve deals" sub={`${count} deals · ${eur(totalVal)}`}
            right={<Seg options={['Alle', 'Mijn', 'Team']} active="Alle" />} />
          {items.length === 0 ? (
            <EmptyState title="Geen actieve deals" text="Push een lead verder of voeg een nieuwe deal toe." />
          ) : (
            <div className="feed">
              {items.map(d => {
                const c = customerById(d.custId);
                const name = c?.name || d.customerName || '?';
                const stage = stages.find(s => s.id === d.stage);
                const sm = stageMeta[d.stage];
                const stageLabel = stage?.label || sm?.label || 'Onbekend';
                const stageCol = stage?.col || (sm ? toneBadge[sm.tone] : null) || 'b-gray';
                const nx = nextAct(d.custId);
                return (
                  <button key={d.id} className="feed-row ic-deal" onClick={goDeal(d)}>
                    <span className="feed-icon"><AvatarSq name={name} /></span>
                    <div className="feed-main">
                      <div className="feed-title">{name}</div>
                      <div className="feed-meta">
                        <span>{d.title}</span>
                        {nx && (<><span className="sep">·</span><span style={{ color: C.amber }}>{nx}</span></>)}
                      </div>
                    </div>
                    <div className="feed-aside">
                      <span className={`badge ${stageCol}`}>{stageLabel}</span>
                      <span style={{ fontWeight: 800, color: C.dk, fontVariantNumeric: 'tabular-nums' }}>{eur(d.value)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <WFoot meta={`${count} totaal · ${eur(totalVal)}`} linkText="Alle deals" onLink={() => setPage('pipeline')} />
        </div>
      );
    }

    // ───────── Open offertes ─────────
    case 'open_offertes': {
      const allOpen = offertes.filter(o => ['concept', 'verzonden'].includes(o.status));
      const count = allOpen.length;
      const totalValue = allOpen.reduce((s, o) => s + (o.totaalIncl || 0), 0);
      const items = allOpen.slice(0, 6);
      const ageDays = o => {
        const raw = o.datum || o.createdAt || o.aangemaakt_op || o.created_at;
        if (!raw) return null;
        return Math.max(0, Math.round((new Date(today) - new Date(String(raw).slice(0, 10))) / 864e5));
      };
      return (
        <div className="bb-widget">
          <WHead title="Open offertes" sub={`${count} offertes · ${eur(totalValue)}`} />
          {items.length === 0 ? (
            <EmptyState title="Geen open offertes" text="Alles is verstuurd of geaccepteerd." />
          ) : (
            <div className="feed">
              {items.map(o => {
                const age = ageDays(o);
                return (
                  <button key={o.id} className="feed-row ic-deal" onClick={() => open.offerte(o)}>
                    <span className="feed-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                    </span>
                    <div className="feed-main">
                      <div className="feed-title">{o.customerName || o.omschrijving || 'Geen klant'}</div>
                      <div className="feed-meta">
                        {o.nummer && <span style={{ fontFamily: 'ui-monospace,Menlo,monospace' }}>{o.nummer}</span>}
                        <span className="sep">·</span>
                        <Chip tone={statusInfo(o.status, 'offerte').chip}>{statusInfo(o.status, 'offerte').label}</Chip>
                      </div>
                    </div>
                    <div className="feed-aside">
                      <span style={{ fontWeight: 800, color: C.dk, fontVariantNumeric: 'tabular-nums' }}>{eur(o.totaalIncl || 0)}</span>
                      {age != null && <span>{age}d oud</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <WFoot meta={`${count} · ${eur(totalValue)}`} linkText="Alle offertes" onLink={() => setPage('offertes')} />
        </div>
      );
    }

    // ───────── Openstaande facturen (echte facturen, niet betaald) ─────────
    case 'open_facturen': {
      const openF = facturen.filter(f => f.status && f.status !== 'betaald' && f.status !== 'concept' && f.status !== 'aangemaakt');
      const items = openF.slice(0, 6);
      const totalOpen = openF.reduce((s, f) => s + (f.totaalIncl || 0), 0);
      return (
        <div className="bb-widget">
          <WHead title="Openstaande facturen" sub={`${openF.length} facturen · ${eur(totalOpen)}`} />
          {openF.length === 0 ? (
            <EmptyState title="Niets openstaand" text="Alle facturen zijn betaald." />
          ) : (
            <div className="feed">
              {items.map((f, idx) => {
                const ref = f.nummer || `F-${String(idx + 1).padStart(3, '0')}`;
                const overdue = f.vervaldatum && f.vervaldatum < today;
                return (
                  <button key={f.id} className="feed-row ic-invoice" onClick={goInvoice(f)}>
                    <span className="feed-icon" style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 800, fontSize: 10.5 }}>{String(ref).slice(0, 2)}</span>
                    <div className="feed-main">
                      <div className="feed-title">{f.customerName || 'Geen klant'}</div>
                      <div className="feed-meta">
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace' }}>{ref}</span>
                        <span className="sep">·</span>
                        <Chip tone={overdue ? 'warn' : 'info'}>{overdue ? 'Te laat' : 'Openstaand'}</Chip>
                      </div>
                    </div>
                    <div className="feed-aside">
                      <span style={{ fontWeight: 800, color: C.dk, fontVariantNumeric: 'tabular-nums' }}>{eur(f.totaalIncl || 0)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <WFoot meta={`Totaal ${eur(totalOpen)}`} linkText="Alle facturen" onLink={() => setPage('facturen')} />
        </div>
      );
    }

    // ───────── Werkbonnen vandaag ─────────
    case 'werkbonnen_today': {
      const items = myWerkbonnen.filter(w => w.geplandOp === today || w.datum === today).slice(0, 6);
      const tone = s => statusInfo(s, 'werkbon').chip;
      const label = s => statusInfo(s, 'werkbon').label;
      if (widget.size === 'small') {
        return <KpiCard tone="info" icon={I.wo} label="Werkbonnen" value={items.length} sub={items.length ? `${items.length} vandaag gepland` : 'geen vandaag'} onClick={() => setPage('werkbonnen')} />;
      }
      return (
        <div className="bb-widget">
          <WHead title="Werkbonnen vandaag" sub={`${items.length} bonnen gepland`} />
          {items.length === 0 ? (
            <EmptyState title="Geen werkbonnen vandaag" text="Niets ingepland. Voeg er een toe vanaf de werkbonnenpagina." />
          ) : (
            <div className="feed">
              {items.map((w, idx) => {
                const ref = w.nummer || `WB-${String(idx + 1).padStart(3, '0')}`;
                return (
                  <button key={w.id} className="feed-row ic-werkbon" onClick={() => open.werkbon(w)}>
                    <span className="feed-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 17l9 4 9-4M3 12l9 4 9-4"/></svg>
                    </span>
                    <div className="feed-main">
                      <div className="feed-title">{w.customerName || w.titel || w.title || '—'}</div>
                      <div className="feed-meta">
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace' }}>{ref}</span>
                        {w.locatie && (<><span className="sep">·</span><span>{w.locatie}</span></>)}
                      </div>
                    </div>
                    <div className="feed-aside">
                      <Chip tone={tone(w.status)}>{label(w.status)}</Chip>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <WFoot meta={`${items.length} vandaag`} linkText="Alle werkbonnen" onLink={() => setPage('werkbonnen')} />
        </div>
      );
    }

    // ───────── Uren registratie (deze week) ─────────
    case 'uren_registratie': {
      const daily = charts.dailyHours || [];
      const total = daily.reduce((s, d) => s + (d.value || 0), 0);
      const target = 40;
      const pctDoel = Math.round((total / target) * 100);
      if (widget.size === 'small') {
        return <KpiCard tone="green" icon={I.hours} label="Uren deze week" value={`${total}u`} sub={<><span>van {target}u</span><span>·</span><Delta dir={pctDoel >= 100 ? 'up' : 'flat'}>{pctDoel}%</Delta></>} onClick={() => setPage('uren')} />;
      }
      const max = Math.max(...daily.map(d => d.value), 8);
      const todIdx = (new Date().getDay() + 6) % 7;
      const dayLabels = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
      const showDays = daily.length ? daily : dayLabels.map(l => ({ label: l, value: 0 }));
      return (
        <div className="bb-widget">
          <WHead title="Uren deze week" sub={`Doel ${target}u · ${daily.length ? (total / daily.length).toFixed(1) : 0}u/dag gem.`} right={<Chip tone={pctDoel >= 100 ? 'success' : 'neutral'} noDot>{pctDoel}%</Chip>} />
          <div style={{ padding: '6px 16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <FitValue style={{ marginTop: 0 }}>{total}u</FitValue>
              <div style={{ fontSize: 12.5, color: C.dmu }}>van {target}u</div>
            </div>
            {/* minHeight i.p.v. vaste height: bij hoge balkjes groeit het blok mee
                zodat de waarde-labels niet omhoog over het grote cijfer heen lopen. */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 18, minHeight: 100 }}>
              {showDays.map((d, i) => {
                const h = Math.max(4, (d.value / max) * 80);
                const isT = i === todIdx;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10.5, color: isT ? C.dk : C.dmu, fontWeight: 700 }}>{d.value > 0 ? `${d.value}u` : ''}</div>
                    <div style={{ width: '100%', height: h, borderRadius: 6, background: isT ? C.green : (d.value > 0 ? C.greenSoft : C.track) }} />
                    <div style={{ fontSize: 11, color: isT ? C.dk : C.dmu, fontWeight: isT ? 700 : 500 }}>{d.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // ───────── Agenda deze week ─────────
    case 'agenda_week': {
      const DN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
      const todayKey = toLocalDateKey(new Date());
      // Standaard "Vandaag" (past netjes in het blok); via de toggle naar "Week".
      const agendaView = widget.settings?.agendaView === 'week' ? 'week' : 'today';
      const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const cols = Array.from({ length: 7 }, (_, i) => {
        const dt = new Date(monday); dt.setDate(monday.getDate() + i);
        const iso = toLocalDateKey(dt);
        return { iso, day: DN[i], num: dt.getDate(), isToday: iso === todayKey };
      });
      const evClass = { call: 'ev-info', email: 'ev-green', visit: 'ev-purple', task: 'ev-orange', follow: 'ev-warn' };
      const inWeek = iso => iso && iso >= cols[0].iso && iso <= cols[6].iso;
      const inRange = agendaView === 'today' ? (iso => iso === todayKey) : inWeek;
      const actItems = myActivities
        .map(a => ({ a, iso: a.dueAt ? toLocalDateKey(a.dueAt) : null }))
        .filter(({ a, iso }) => isOpenAct(a) && inRange(iso))
        .map(({ a, iso }) => ({ kind: 'activity', id: a.id, activityId: a.id, title: a.title, time: a.time || '', iso, atype: a.type, custId: a.custId, dealId: a.dealId }));
      const evItems = (myCalendarEvents || [])
        .map(e => ({ e, iso: toLocalDateKey(e.startAt || e.date) }))
        .filter(({ e, iso }) => !e.activityId && e.id && inRange(iso))
        .map(({ e, iso }) => ({ kind: 'event', id: e.id, title: e.title || 'Afspraak', time: e.time || '', iso, custId: e.custId, dealId: e.dealId }));
      const allItems = [...actItems, ...evItems];
      const seg = (
        <Seg
          options={['Vandaag', 'Week']}
          active={agendaView === 'week' ? 'Week' : 'Vandaag'}
          onPick={o => onSettingsChange && onSettingsChange({ ...widget.settings, agendaView: o === 'Week' ? 'week' : 'today' })}
        />
      );

      // ── Vandaag: zelfde lijststijl als de Activiteiten-widget ──
      if (agendaView === 'today') {
        const todayItems = [...allItems].sort((x, y) => (x.time || '99:99').localeCompare(y.time || '99:99'));
        return (
          <div className="bb-widget">
            <WHead title="Agenda vandaag" sub={`${todayItems.length} agenda-items`} right={seg} />
            {todayItems.length === 0 ? (
              <EmptyState title="Geen agenda-items voor vandaag" text="Plan een afspraak vanuit een klant of activiteit." />
            ) : (
              <div className="feed">
                {todayItems.map((it, k) => {
                  const c = customerById(it.custId);
                  const icoT = it.kind === 'event' ? 'visit' : it.atype;
                  return (
                    <button key={k} className={`feed-row ${actIcoClass(icoT)}`} onClick={openAgendaItem(it)}>
                      <span className="feed-icon">{actIcoSvg(icoT)}</span>
                      <div className="feed-main">
                        <div className="feed-title">{it.title}{c && <> · <strong>{c.name}</strong></>}</div>
                        <div className="feed-meta">
                          <span>{it.kind === 'event' ? 'Afspraak' : activiteitTypeLabel(it.atype)}</span>
                        </div>
                      </div>
                      <div className="feed-aside">
                        <Chip tone="info">{it.time || 'Vandaag'}</Chip>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <WFoot meta={`${todayItems.length} vandaag`} linkText="Naar agenda" onLink={() => setPage('calendar')} />
          </div>
        );
      }

      // ── Week: 7-koloms rooster ──
      const itemsOn = iso => allItems
        .filter(it => it.iso === iso)
        .sort((x, y) => (x.time || '99:99').localeCompare(y.time || '99:99'))
        .slice(0, 4);
      return (
        <div className="bb-widget">
          <WHead title="Agenda deze week" sub={`${allItems.length} agenda-items`} right={seg} />
          {allItems.length === 0 ? (
            <EmptyState title="Geen agenda-items deze week" text="Plan een afspraak vanuit een klant of activiteit." />
          ) : (
            <div className="agenda-week">
              {cols.map((col, i) => {
                const dayItems = itemsOn(col.iso);
                return (
                  <div key={i} className={`agenda-day-col${col.isToday ? ' today' : ''}`}>
                    <div className="agenda-day-head">
                      <span className="agenda-dow">{col.day}</span>
                      <span className="agenda-dom">{col.num}</span>
                    </div>
                    <div className="agenda-events">
                      {dayItems.map((it, k) => (
                        <button key={k} className={`event-pill ${it.kind === 'event' ? 'ev-teal' : (evClass[it.atype] || 'ev-info')}`} onClick={openAgendaItem(it)}>
                          {it.time && <span className="event-time">{it.time}</span>}
                          <span className="event-title">{it.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // ───────── Laatste klantactiviteit ─────────
    case 'last_customer_activity': {
      const sorted = [...activities].sort((a, b) => new Date(b.dueAt || 0) - new Date(a.dueAt || 0)).slice(0, 6);
      return (
        <div className="bb-widget">
          <WHead title="Laatste klantactiviteit" sub="Realtime feed" right={<Chip tone="green" noDot>● Live</Chip>} />
          {sorted.length === 0 ? (
            <EmptyState title="Geen klantactiviteiten" text="Activiteiten op klanten verschijnen hier." />
          ) : (
            <div className="feed">
              {sorted.map(a => {
                const c = customerById(a.custId);
                const ago = relAgo(a.dueAt);
                return (
                  <button key={a.id} className={`feed-row compact ${actIcoClass(a.type)}`} onClick={() => open.activity(a)}>
                    <span className="feed-icon">{actIcoSvg(a.type)}</span>
                    <div className="feed-main">
                      <div className="feed-title"><strong>{c?.name || 'Onbekende klant'}</strong> — {a.title}</div>
                      <div className="feed-meta">
                        {a.type && <span>{activiteitTypeLabel(a.type)}</span>}
                        {ago && (<><span className="sep">·</span><span>{ago} geleden</span></>)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // ───────── Lead opvolging ─────────
    case 'lead_followup': {
      // Vroege pipeline: de eerste twee echte fases (val terug op demo-strings).
      const earlyIds = orderedStages.slice(0, 2).map(s => s.id);
      const leadDeals = (earlyIds.length ? deals.filter(d => earlyIds.includes(d.stage)) : deals.filter(d => ['new_lead', 'contact'].includes(d.stage))).slice(0, 6);
      const when = iso => {
        if (!iso) return { txt: 'plan actie', tone: 'neutral' };
        const diff = Math.round((new Date(iso.slice(0, 10)) - new Date(today)) / 864e5);
        if (diff < 0) return { txt: `${Math.abs(diff)}d te laat`, tone: 'warn' };
        if (diff === 0) return { txt: 'vandaag', tone: 'amber' };
        if (diff === 1) return { txt: 'morgen', tone: 'amber' };
        if (diff <= 3) return { txt: `over ${diff}d`, tone: 'info' };
        return { txt: `over ${diff}d`, tone: 'neutral' };
      };
      return (
        <div className="bb-widget">
          <WHead title="Lead opvolging" sub={`${leadDeals.length} leads te bellen`} />
          {leadDeals.length === 0 ? (
            <EmptyState title="Geen leads te bellen" text="Alle opvolging is bij." />
          ) : (
            <div className="feed">
              {leadDeals.map(d => {
                const c = customerById(d.custId);
                const name = c?.name || d.customerName || '?';
                const na = activities.filter(a => a.custId === d.custId && isOpenAct(a) && a.type === 'call').sort((x, y) => new Date(x.dueAt) - new Date(y.dueAt))[0];
                const w = when(na?.dueAt);
                const openIt = goDeal(d);
                return (
                  <div key={d.id} className="feed-row ic-follow" role="button" tabIndex={0}
                    onClick={openIt}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); } }}>
                    <span className="feed-icon"><AvatarSq name={name} /></span>
                    <div className="feed-main">
                      <div className="feed-title">{name}</div>
                      <div className="feed-meta">
                        {d.title && <span>{d.title}</span>}
                        <span className="sep">·</span>
                        <span>bel </span>
                        <Chip tone={w.tone}>{w.txt}</Chip>
                      </div>
                    </div>
                    <div className="feed-aside">
                      <button className="bbw-btn call sm" onClick={e => { e.stopPropagation(); if (c) openCustomer(d.custId); else setPage('pipeline'); }} aria-label={`${name} bellen`} title={`${name} bellen`}>
                        {I.call}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // ───────── Conversie overzicht ─────────
    case 'conversion_overview': {
      // Echte pipeline_stages, deals geteld per stage_id (val terug op demo-strings).
      const palette = ['#9ca3af', '#60a5fa', '#a78bfa', '#fb923c', '#34d399', '#2dd4bf', '#f472b6', '#fb7185', C.green];
      const rows = (orderedStages.length
        ? orderedStages.filter(s => stageIndex.get(s.id)?.category !== 'lost')
            .map((s, i) => ({ key: s.id, label: s.label, c: palette[i % palette.length], count: deals.filter(d => d.stage === s.id).length }))
        : [
            { key: 'new_lead', label: 'Nieuwe aanvragen', c: '#9ca3af', count: deals.filter(d => d.stage === 'new_lead').length },
            { key: 'contact', label: 'Contact', c: '#60a5fa', count: deals.filter(d => d.stage === 'contact').length },
            { key: 'quote_sent', label: 'Offerte gestuurd', c: '#a78bfa', count: deals.filter(d => d.stage === 'quote_sent').length },
            { key: 'approved', label: 'Akkoord', c: '#fb923c', count: deals.filter(d => d.stage === 'approved').length },
            { key: 'completed', label: 'Gewonnen', c: C.green, count: deals.filter(d => d.stage === 'completed').length },
          ]);
      const max = Math.max(...rows.map(r => r.count), 1);
      const totalLeads = deals.length;
      const won = deals.filter(d => ['won', 'paid'].includes(dealCat(d))).length;
      const conv = totalLeads ? Math.round((won / totalLeads) * 100) : 0;
      const totalVal = deals.reduce((s, d) => s + (d.value || 0), 0);
      return (
        <div className="bb-widget">
          <WHead eyebrow="Pipeline" title="Deals per fase" right={<Chip tone="neutral" noDot>{eur(totalVal)} totaal</Chip>} />
          <div style={{ padding: '8px 0 14px' }}>
            {rows.map(s => (
              <div key={s.key} className="pipe-row" onClick={() => setPage('pipeline')}>
                <div>
                  <div className="pipe-label">{s.label}</div>
                  <div className="pipe-meta">{s.count} deals</div>
                </div>
                <div className="pipe-bar">
                  <div className="pipe-fill" style={{
                    width: `${(s.count / max) * 100}%`,
                    background: s.c,
                    boxShadow: s.c === C.green ? 'var(--shadow-green)' : 'none',
                  }} />
                </div>
                <div className="pipe-val">{s.count}</div>
              </div>
            ))}
          </div>
          <WFoot meta={`Win rate ${conv}%`} linkText="Open pipeline" onLink={() => setPage('pipeline')} />
        </div>
      );
    }

    // ───────── Snelle acties ─────────
    case 'quick_actions': {
      const acts = [
        { icon: I.pipe,   l: 'Nieuwe aanvraag', d: 'voeg toe aan pipeline', tone: { qaBg: '#ecfdf5', qaFg: '#15A34A' }, go: 'pipeline', primary: true },
        { icon: I.act,    l: 'Activiteit',     d: 'plan een belactie',     tone: { qaBg: '#eff6ff', qaFg: '#2563eb' }, go: 'activities' },
        { icon: I.quotes, l: 'Offerte',        d: 'nieuwe offerte maken',  tone: { qaBg: '#f5f3ff', qaFg: '#7c3aed' }, go: 'offertes' },
        { icon: I.wo,     l: 'Werkbon',        d: 'nieuwe werkbon',        tone: { qaBg: '#fffbeb', qaFg: '#b45309' }, go: 'werkbonnen' },
        { icon: I.cust,   l: 'Klant',          d: 'klantbestand uitbreiden', tone: { qaBg: '#f0fdfa', qaFg: '#0d9488' }, go: 'customers' },
        { icon: I.hours,  l: 'Uren boeken',    d: 'urenregistratie',       tone: { qaBg: '#f0fdf4', qaFg: '#15A34A' }, go: 'activities' },
      ];
      return (
        <div className="bb-widget">
          <WHead title="Snelle acties" sub="Veelgebruikt" />
          <div className="qa-grid">
            {acts.map((a, i) => (
              <button key={i} className={`qa-btn${a.primary ? ' primary' : ''}`} onClick={() => setPage(a.go)}
                style={{ '--qaBg': a.tone.qaBg, '--qaFg': a.tone.qaFg }}>
                <span className="qa-tile">{a.icon}</span>
                <div>
                  <div className="qa-label">{a.l}</div>
                  <div className="qa-desc">{a.d}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // ───────── Notities ─────────
    case 'notes': {
      const content = widget.settings?.content || '';
      return (
        <div className="bb-widget">
          <WHead title="Notities" sub="Persoonlijk notitieblok" />
          <div style={{ padding: '6px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <textarea
              className="notes-field"
              defaultValue={content}
              placeholder="Schrijf hier je notities…"
              onBlur={e => onSettingsChange({ ...widget.settings, content: e.target.value })}
            />
          </div>
        </div>
      );
    }

    // ───────── Charts ─────────
    case 'monthly_revenue_chart':
      return <MonthlyRevenueChart charts={charts} widget={widget} ux={ux} onNav={() => setPage('revenue')} />;

    case 'monthly_profit_chart': {
      const rev = charts.monthlyRevenue || [];
      const prof = charts.monthlyProfit || [];
      const n = Math.min(6, Math.max(rev.length, prof.length));
      const rv = rev.slice(-n), pf = prof.slice(-n);
      if (!rv.length && !pf.length) return <div className="bb-widget"><WHead title="Winst per maand" /><EmptyState title="Geen grafiekdata" text="Markeer deals als betaald om data te zien." /></div>;
      const rows = (rv.length ? rv : pf).map((_, i) => ({
        label: (rv[i] || pf[i]).label,
        omzet: rv[i]?.value ?? (pf[i]?.value || 0),
        winst: pf[i]?.value ?? Math.round((rv[i]?.value || 0) * 0.28),
      }));
      const max = Math.max(...rows.map(r => r.omzet), 1);
      const totalP = rows.reduce((s, r) => s + r.winst, 0);
      return (
        <div className="bb-widget">
          <WHead eyebrow="Winst" title="Winst per maand" sub={`Totaal ${kEur(totalP)} · stabiele groei`}
            right={<Seg options={['6M', '12M']} active="6M" />} />
          <div style={{ padding: '14px 16px 6px', display: 'flex', alignItems: 'flex-end', gap: 16, height: 220 }}>
            {rows.map((d, i) => {
              const totalH = (d.omzet / max) * 150;
              const profitH = (Math.max(0, d.winst) / max) * 150;
              const last = i === rows.length - 1;
              const kosten = Math.max(0, d.omzet - d.winst);
              return (
                <div key={i} {...hov(<Tt title={d.label} rows={[
                  { k: 'Omzet', v: eur(d.omzet) },
                  { k: 'Winst', v: eur(d.winst), c: C.greenInk },
                  { k: 'Kosten', v: eur(kosten) },
                  { k: 'Marge', v: `${pct(d.winst, d.omzet)}%` },
                ]} />)} onClick={() => setPage('revenue')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <span style={{ fontSize: 10.5, color: last ? C.greenInk : C.dmu, fontWeight: 700 }}>{kEur(d.winst)}</span>
                  <div style={{ width: '100%', height: Math.max(6, totalH), borderRadius: 8, background: C.greenSoft, display: 'flex', flexDirection: 'column-reverse', overflow: 'hidden' }}>
                    <div style={{ width: '100%', height: profitH, background: C.green }} />
                  </div>
                  <span style={{ fontSize: 11, color: last ? C.dk : C.dmu, fontWeight: last ? 700 : 500 }}>{d.label}</span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '6px 16px 14px', display: 'flex', gap: 16, fontSize: 11.5, color: C.dmu }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.green }} />Winst</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.greenSoft }} />Omzet</span>
          </div>
        </div>
      );
    }

    case 'pipeline_stage_chart': {
      const d = charts.pipelineByStage || [];
      const max = Math.max(...d.map(x => x.value), 1);
      const total = d.reduce((s, x) => s + x.value, 0);
      return (
        <div className="bb-widget">
          <WHead eyebrow="Pipeline" title="Waarde per fase" sub={`Totaal ${eur(total)}`} />
          <div style={{ padding: '8px 0 14px' }}>
            {d.length ? d.map((s, i) => (
              <div key={i} className="pipe-row" {...hov(<Tt title={s.label} rows={[{ k: 'Waarde', v: eur(s.value) }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} onClick={() => setPage('pipeline')}>
                <div>
                  <div className="pipe-label">{s.label}</div>
                  <div className="pipe-meta">{pct(s.value, total)}% van totaal</div>
                </div>
                <div className="pipe-bar">
                  <div className="pipe-fill" style={{ width: `${(s.value / max) * 100}%`, background: s.color || C.green }} />
                </div>
                <div className="pipe-val">{eur(s.value)}</div>
              </div>
            )) : <EmptyState title="Geen grafiekdata" text="Voeg deals toe om verdeling te zien." />}
          </div>
        </div>
      );
    }

    case 'conversion_funnel': {
      const d = charts.conversionFunnel || [];
      return (
        <div className="bb-widget">
          <WHead eyebrow="Trechter" title="Conversie funnel" sub={d.length ? `${d[0].value} leads · ${d[d.length - 1].pct}% win rate` : null} />
          {d.length ? (
            <div className="funnel">
              {d.map((s, i) => {
                const w = Math.max(30, s.pct || 0);
                const drop = i > 0 && d[i - 1].value ? Math.round((1 - s.value / d[i - 1].value) * 100) : 0;
                return (
                  <div key={i} className="funnel-step" {...hov(<Tt title={s.label} rows={[
                    { k: 'Aantal', v: `${s.value} leads` },
                    { k: 'Conversie', v: `${s.pct}%` },
                    i > 0 ? { k: 'Drop-off', v: `−${drop}%`, c: C.warn } : null,
                  ]} />)} onClick={() => setPage('pipeline')}
                    style={{ '--funW': `${w}%`, '--funFill': i === d.length - 1 ? C.greenSoft : '#dbeafe' }}>
                    <div className="funnel-main">
                      <span className="funnel-label">{s.label}</span>
                      <span className="funnel-count">· {s.value} leads</span>
                    </div>
                    <div>
                      <div className="funnel-pct">{s.pct}%</div>
                      {i > 0 && <div className="funnel-drop">−{drop}% drop</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState title="Geen funnel data" text="Funnel verschijnt zodra er leads zijn." />}
        </div>
      );
    }

    case 'invoice_status_chart': {
      const segs = charts.invoiceStatus || [];
      const total = segs.reduce((s, x) => s + x.value, 0);
      const R = 56, CC = 2 * Math.PI * R;
      let acc = 0;
      return (
        <div className="bb-widget">
          <WHead eyebrow="Facturen" title="Status overzicht" sub={`${total} facturen`} />
          {segs.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '8px 16px 18px' }}>
              <svg width="150" height="150" viewBox="0 0 150 150" style={{ flexShrink: 0 }}>
                <circle cx="75" cy="75" r={R} fill="none" stroke={C.track} strokeWidth="18" />
                {segs.map((s, i) => {
                  const len = total ? (s.value / total) * CC : 0;
                  const el = (
                    <circle key={i} cx="75" cy="75" r={R} fill="none" stroke={s.color || C.green} strokeWidth="18"
                      strokeDasharray={`${len} ${CC - len}`} strokeDashoffset={-acc} transform="rotate(-90 75 75)"
                      style={{ cursor: 'pointer' }} onClick={() => setPage('revenue')}
                      {...hov(<Tt title={s.label} rows={[{ k: 'Facturen', v: s.value }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} />
                  );
                  acc += len; return el;
                })}
                <text x="75" y="72" textAnchor="middle" fontSize="26" fontWeight="800" fill={C.dk}>{total}</text>
                <text x="75" y="90" textAnchor="middle" fontSize="10" fill={C.dmu} fontWeight="700" letterSpacing="0.5">FACTUREN</text>
              </svg>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {segs.map((s, i) => (
                  <div key={i} {...hov(<Tt title={s.label} rows={[{ k: 'Facturen', v: s.value }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} onClick={() => setPage('revenue')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color || C.green }} />
                    <span style={{ fontSize: 13, color: C.dk, flex: 1 }}>{s.label}</span>
                    <span style={{ fontSize: 11.5, color: C.dmu }}>{pct(s.value, total)}%</span>
                    <span style={{ fontSize: 13, color: C.dk, fontWeight: 800, width: 24, textAlign: 'right' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState title="Geen factuurdata" text="Maak een factuur om verdeling te zien." />}
        </div>
      );
    }

    case 'job_costs_bar_chart': {
      const cats = charts.jobCostsByCustomer || [];
      const max = Math.max(...cats.map(c => c.value), 1);
      const total = cats.reduce((s, c) => s + c.value, 0);
      const tight = widget.size === 'medium';
      return (
        <div className="bb-widget">
          <WHead eyebrow="Kosten" title="Per klant" sub={`${eur(total)} totaal`} />
          <div style={{ padding: '14px 16px 18px', display: 'flex', alignItems: 'flex-end', gap: 14, height: 220 }}>
            {cats.length ? cats.map((c, i) => {
              const h = Math.max(8, (c.value / max) * 150);
              return (
                <div key={i} {...hov(<Tt title={c.label} rows={[{ k: 'Kosten', v: eur(c.value) }, { k: 'Aandeel', v: `${pct(c.value, total)}%` }]} />)} onClick={() => setPage('costs')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  {!tight && <div style={{ fontSize: 10.5, color: C.dk, fontWeight: 700 }}>{kEur(c.value)}</div>}
                  <div style={{ width: '100%', height: h, borderRadius: 8, background: i === 0 ? C.green : '#374151' }} />
                  <div style={{ fontSize: 11, color: C.dmu, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{c.label}</div>
                </div>
              );
            }) : <EmptyState title="Geen kostendata" text="Voeg kosten toe per klus." />}
          </div>
        </div>
      );
    }

    case 'weekly_hours_histogram': {
      const wk = charts.weeklyHours || [];
      const target = 40, max = Math.max(...wk.map(d => d.value), 48);
      const avg = wk.length ? Math.round(wk.reduce((s, d) => s + d.value, 0) / wk.length) : 0;
      const tight = widget.size === 'medium';
      return (
        <div className="bb-widget">
          <WHead eyebrow="Uren" title="Per week" sub={`${wk.length} weken · gem. ${avg}u/week`} right={<Chip tone={avg >= target ? 'success' : 'neutral'} noDot>{avg}u/wk</Chip>} />
          {wk.length ? (
            <>
              <div style={{ padding: '14px 16px 6px', display: 'flex', alignItems: 'flex-end', gap: 16, height: 200, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 16, right: 16, top: `${(1 - target / max) * 150 + 14}px`, borderTop: `1.5px dashed ${C.warn}`, opacity: 0.6 }} />
                {wk.map((d, i) => {
                  const h = (d.value / max) * 150;
                  const last = i === wk.length - 1;
                  return (
                    <div key={i} {...hov(<Tt title={d.label} rows={[{ k: 'Uren', v: `${d.value} uur` }, { k: 'Doel', v: `${target} uur` }]} />)} onClick={() => setPage('uren')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      {!tight && <span style={{ fontSize: 11, color: C.dk, fontWeight: 700 }}>{d.value}u</span>}
                      <div style={{ width: '100%', height: Math.max(4, h), borderRadius: 8, background: d.value >= target ? C.green : (last ? C.amber : C.greenSoft) }} />
                      <span style={{ fontSize: 11, color: last ? C.dk : C.dmu, fontWeight: last ? 700 : 500 }}>{d.label}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '6px 16px 14px', fontSize: 11, color: C.warn, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, borderTop: `1.5px dashed ${C.warn}` }} /> Doel {target}u/week
              </div>
            </>
          ) : <EmptyState title="Geen urendata" text="Boek uren om hier de week-trend te zien." />}
        </div>
      );
    }

    case 'activities_per_day_chart': {
      const d = charts.activitiesPerDay || [];
      const max = Math.max(...d.map(x => x.value), 1);
      const total = d.reduce((s, x) => s + x.value, 0);
      const peak = d.length ? d.reduce((m, x, i) => x.value > d[m].value ? i : m, 0) : 0;
      const tight = widget.size === 'medium';
      return (
        <div className="bb-widget">
          <WHead eyebrow="Activiteiten" title="Per dag" sub={`${total} deze week`} />
          {d.length ? (
            <div style={{ padding: '14px 16px 18px', display: 'flex', alignItems: 'flex-end', gap: 14, height: 200 }}>
              {d.map((x, i) => {
                const h = Math.max(6, (x.value / max) * 150);
                const hot = i === peak;
                const dayFull = { ma: 'Maandag', di: 'Dinsdag', wo: 'Woensdag', do: 'Donderdag', vr: 'Vrijdag', za: 'Zaterdag', zo: 'Zondag' }[x.label] || x.label;
                return (
                  <div key={i} {...hov(<Tt title={dayFull} rows={[{ k: 'Activiteiten', v: x.value }]} />)} onClick={() => setPage('activities')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    {!tight && <div style={{ fontSize: 10.5, color: hot ? C.greenInk : C.dmu, fontWeight: 700 }}>{x.value}</div>}
                    <div style={{ width: '100%', height: h, borderRadius: 8, background: hot ? C.green : C.greenSoft }} />
                    <div style={{ fontSize: 11.5, color: hot ? C.dk : C.dmu, fontWeight: hot ? 700 : 500 }}>{x.label}</div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState title="Geen activiteitsdata" text="Plan activiteiten om patronen te zien." />}
        </div>
      );
    }

    case 'lead_source_chart': {
      const src = charts.leadSource || [];
      const total = src.reduce((s, x) => s + x.value, 0) || 1;
      return (
        <div className="bb-widget">
          <WHead eyebrow="Leads" title="Bronnen" sub={`${total} leads · 30 dagen`} />
          {src.length ? (
            <div style={{ padding: '8px 16px 18px' }}>
              <div style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden' }}>
                {src.map((s, i) => (
                  <div key={i} {...hov(<Tt title={s.label} rows={[{ k: 'Leads', v: s.value }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} onClick={() => setPage('pipeline')} style={{ flex: s.value, background: s.color || C.green, cursor: 'pointer' }} />
                ))}
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {src.map((s, i) => (
                  <div key={i} {...hov(<Tt title={s.label} rows={[{ k: 'Leads', v: s.value }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} onClick={() => setPage('pipeline')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: s.color || C.green }} />
                    <span style={{ fontSize: 12.5, color: C.dk, flex: 1 }}>{s.label}</span>
                    <span style={{ fontSize: 11.5, color: C.dmu }}>{pct(s.value, total)}%</span>
                    <span style={{ fontSize: 13, color: C.dk, fontWeight: 700, width: 28, textAlign: 'right' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState title="Geen bron-data" text="Vul lead-bron in op nieuwe aanvragen." />}
        </div>
      );
    }

    case 'top_customers_chart': {
      const items = charts.topCustomers || [];
      const max = items.length ? items[0].value : 1;
      return (
        <div className="bb-widget">
          <WHead eyebrow="Top 5" title="Beste klanten" sub="Jaar tot nu" />
          {items.length ? (
            <div>
              {items.map((it, i) => {
                const cid = it.customerId || customers.find(c => c.name === it.label)?.id;
                return (
                  <button key={i} className={`rank-row${i === 0 ? ' gold' : ''}`}
                    onClick={() => cid ? openCustomer(cid) : setPage('customers')}
                    {...hov(<Tt title={it.label} rows={[{ k: 'Dealwaarde', v: eur(it.value) }]} />)}>
                    <span className="rank-num">{String(i + 1).padStart(2, '0')}</span>
                    <AvatarSq name={it.label} />
                    <div>
                      <div className="rank-name">{it.label}</div>
                      <div className="rank-bar"><div className="rank-bar-fill" style={{ width: `${(it.value / max) * 100}%` }} /></div>
                    </div>
                    <div className="rank-val">{eur(it.value)}</div>
                  </button>
                );
              })}
            </div>
          ) : <EmptyState title="Geen klantdata" text="Sluit deals om je top klanten hier te zien." />}
          <WFoot meta={`Top ${items.length} van ${customers.length}`} linkText="Alle klanten" onLink={() => setPage('customers')} />
        </div>
      );
    }

    default:
      return <div className="bb-widget"><div style={{ padding: 20, color: C.dmu, fontSize: 13, textAlign: 'center' }}>Widget "{type}" is nog niet beschikbaar.</div></div>;
  }
}

// ── Monthly Revenue Chart — responsive, brand neon ────────────
function MonthlyRevenueChart({ charts, widget, ux, onNav }) {
  const all = charts.monthlyRevenue || [];
  const size = widget?.size || 'large';
  const isFull = size === 'full';
  const [bodyRef, cw] = useMeasuredWidth(isFull ? 1100 : 560);
  const tip = (e, n) => ux && ux.tip && ux.tip(e, n);
  const off = () => ux && ux.off && ux.off();

  const hasData = all.length && all.some(m => (m.value || 0) > 0);
  if (!hasData) {
    return (
      <div className="bb-widget">
        <WHead eyebrow="Omzet" title="Per maand" sub="Maandelijkse omzetontwikkeling" />
        <EmptyState title="Nog geen omzetdata" text="Verstuur facturen om je omzet hier te zien." />
      </div>
    );
  }

  const data = all;
  const total = data.reduce((s, x) => s + (x.value || 0), 0);
  const last = data[data.length - 1]?.value || 0;
  const prev = data.length > 1 ? (data[data.length - 2]?.value || 0) : 0;
  const change = prev ? Math.round(((last - prev) / prev) * 100) : 0;
  const best = data.reduce((b, m) => (m.value > b.value ? m : b), data[0]);
  const avg = Math.round(total / data.length);
  const H = isFull ? 280 : 220;
  const W = cw;
  const pad = isFull ? { l: 56, r: 22, t: 22, b: 32 } : { l: 48, r: 18, t: 18, b: 30 };
  const ticks = isFull ? 4 : 3;
  const yMax = niceTop(Math.max(...data.map(x => x.value), 1));
  const xStep = data.length > 1 ? (W - pad.l - pad.r) / (data.length - 1) : 0;
  const pts = data.map((x, i) => [
    data.length > 1 ? pad.l + i * xStep : (W - pad.r + pad.l) / 2,
    H - pad.b - (x.value / yMax) * (H - pad.t - pad.b),
  ]);
  const linePath = smoothLinePath(pts);
  const areaPath = pts.length ? `${linePath} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z` : '';
  const labelEvery = isFull ? 1 : (data.length > 8 ? 2 : 1);
  const gradId = `bbOmzetGrad-${size}`;
  return (
    <div className="bb-widget">
      <WHead eyebrow="Omzet" title="Per maand" sub="Maandelijkse omzetontwikkeling"
        right={<Seg options={['6M', '12M']} active="6M" />} />
      <div style={{ padding: '6px 16px 4px', display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div className="bb-widget-eyebrow" style={{ fontSize: 10.5 }}>Deze maand</div>
          <FitValue style={{ marginTop: 4 }}>{eur(last)}</FitValue>
        </div>
        {prev > 0 && <Delta dir={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '+' : ''}{change}% vs vorige</Delta>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 12, color: C.dmu }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: C.green }} /> Deze periode</span>
        </div>
      </div>
      <div ref={bodyRef} style={{ padding: isFull ? '4px 16px 14px' : '2px 12px 12px' }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: '100%' }}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.green} stopOpacity="0.22" />
              <stop offset="100%" stopColor={C.green} stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const y = pad.t + i * ((H - pad.t - pad.b) / ticks);
            const v = yMax - (yMax / ticks) * i;
            return (
              <g key={'g' + i}>
                <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y} y2={y} />
                <text className="axis-text" x={pad.l - 10} y={y + 4} textAnchor="end">{kEur(v)}</text>
              </g>
            );
          })}
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
          {linePath && <path d={linePath} fill="none" stroke={C.green} strokeWidth={isFull ? 2.6 : 2.4} strokeLinecap="round" strokeLinejoin="round" />}
          {pts.map((p, i) => {
            const lst = i === pts.length - 1;
            return (
              <g key={'p' + i}>
                {lst && <circle cx={p[0]} cy={p[1]} r={10} fill={C.green} opacity="0.18" />}
                <circle cx={p[0]} cy={p[1]} r={lst ? 4.6 : 3} fill="#fff" stroke={C.green} strokeWidth={lst ? 2.4 : 2} />
              </g>
            );
          })}
          {data.map((x, i) => {
            const show = (i % labelEvery === 0) || i === data.length - 1;
            if (!show) return null;
            return (
              <text key={'t' + i} className="axis-text" x={data.length > 1 ? pad.l + i * xStep : (W - pad.r + pad.l) / 2} y={H - 10} textAnchor="middle">{x.label}</text>
            );
          })}
          {data.map((x, i) => {
            const cx = data.length > 1 ? pad.l + i * xStep : (W - pad.r + pad.l) / 2;
            const bw = data.length > 1 ? xStep : (W - pad.l - pad.r);
            return (
              <rect key={'h' + i} x={cx - bw / 2} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseMove={e => tip(e, <Tt title={x.label} rows={[{ k: 'Omzet', v: eur(x.value) }]} />)}
                onMouseLeave={off} onClick={() => onNav && onNav()} />
            );
          })}
        </svg>
      </div>
      {isFull && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: `1px solid ${C.border}`, padding: '14px 22px 18px', gap: 16 }}>
          <RevStat label="Beste maand" value={eur(best.value)} sub={best.label} />
          <RevStat label="Gemiddeld / maand" value={eur(avg)} sub={`${data.length} maanden`} />
          <RevStat label="Totaal" value={eur(total)} sub="Hele periode" />
        </div>
      )}
    </div>
  );
}
function RevStat({ label, value, sub }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="bb-widget-eyebrow" style={{ fontSize: 10.5 }}>{label}</div>
      <FitValue className="" max={16} min={10} style={{ fontWeight: 800, color: C.dk, letterSpacing: -0.3, marginTop: 4 }}>{value}</FitValue>
      {sub && <div style={{ fontSize: 11.5, color: C.dmu, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Six-dot drag handle ───────────────────────────────────────
function DragDots() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3" cy="3" r="1.2" fill="#6b7280" /><circle cx="9" cy="3" r="1.2" fill="#6b7280" />
      <circle cx="3" cy="6" r="1.2" fill="#6b7280" /><circle cx="9" cy="6" r="1.2" fill="#6b7280" />
      <circle cx="3" cy="9" r="1.2" fill="#6b7280" /><circle cx="9" cy="9" r="1.2" fill="#6b7280" />
    </svg>
  );
}

// ── WidgetCard wrapper ────────────────────────────────────────
export function WidgetCard({
  widget, editMode, isFirst, isLast,
  onMoveUp, onMoveDown, onResize, onRemove, onSettingsChange,
  data, setPage, openCustomer, openDeal, openInvoice, openCalendarEvent,
  // Drag-and-drop wiring from DashboardWidgetGrid (edit mode only):
  index, dragIdx, overIdx, onDragStart, onDragOver, onDragEnd, onDrop,
}) {
  const supportedSizes = getSupportedSizes(widget.widget_type);
  const hostRef = useRef(null);
  const [tipState, setTipState] = useState(null);
  const showTip = (e, node) => {
    if (editMode) return; // no chart tooltips while reordering
    const host = hostRef.current;
    if (!host || !node) return;
    const r = host.getBoundingClientRect();
    const w = r.width || 240;
    const x = Math.max(72, Math.min(w - 72, e.clientX - r.left));
    setTipState({ x, y: e.clientY - r.top, node });
  };
  const hideTip = () => setTipState(null);
  const ux = { tip: showTip, off: hideTip };

  const isDragging = editMode && dragIdx === index;
  const isDropTarget = editMode && dragIdx != null && dragIdx !== index && overIdx === index;

  // Centralized edit-mode click guard. Any click that bubbles up to the
  // wrapper while in edit mode is killed — pages do not navigate, drawers
  // do not open, row click handlers don't fire. We whitelist clicks
  // originating inside .dw-controls or .dw-drag-handle so the up/down/menu
  // buttons (and the size/remove dropdown) stay fully interactive.
  const editClickGuard = editMode
    ? {
        onClickCapture: e => {
          if (e.target.closest('.dw-controls, .dw-drag-handle')) return;
          e.preventDefault();
          e.stopPropagation();
        },
      }
    : null;

  // HTML5 drag handlers (desktop). On touch, native draggable does not
  // fire — that is an accepted limitation; the up/down buttons in
  // WidgetControls remain the touch-friendly reorder path.
  const dragHandlers = editMode ? {
    draggable: true,
    onDragStart: e => {
      // Required to enable the drop targets in some browsers
      try { e.dataTransfer.setData('text/plain', String(index)); } catch {}
      e.dataTransfer.effectAllowed = 'move';
      onDragStart && onDragStart(index);
    },
    onDragOver: e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDragOver && onDragOver(index);
    },
    onDragEnd: () => { onDragEnd && onDragEnd(); },
    onDrop: e => {
      e.preventDefault();
      e.stopPropagation();
      onDrop && onDrop();
    },
  } : null;

  const cls = [
    'dw-widget',
    editMode ? 'edit' : '',
    isDragging ? 'dw-widget--dragging' : '',
    isDropTarget ? 'dw-widget--drop-target' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={hostRef} className={cls} data-size={widget.size} {...editClickGuard} {...dragHandlers}>
      {editMode && (
        <>
          <div className="dw-drag-handle" title="Sleep om te verplaatsen"><DragDots /></div>
          <WidgetControls size={widget.size} supportedSizes={supportedSizes} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onResize={onResize} onRemove={onRemove} isFirst={isFirst} isLast={isLast} />
        </>
      )}
      <div className="card" style={{ height: '100%' }}>
        {renderContent(widget.widget_type, data, widget, setPage, openCustomer, onSettingsChange, ux, openDeal, openInvoice, openCalendarEvent)}
      </div>
      {!editMode && tipState && (
        <div style={{
          position: 'absolute', left: tipState.x, top: tipState.y - 14,
          transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: 60,
          background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,0.14)', padding: '8px 11px',
        }}>
          {tipState.node}
        </div>
      )}
    </div>
  );
}
