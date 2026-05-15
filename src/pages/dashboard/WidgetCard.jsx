import { useState, useRef } from 'react';
import { I } from '../../bb-shared.jsx';
import { getSupportedSizes } from '../../data/widgetRegistry.js';

// ── Design tokens (BossBase Desktop handoff) ──────────────────
const C = {
  green: '#22c55e', greenDark: '#16a34a', greenSoft: '#dcfce7',
  greenSofter: '#f0fdf4', greenInk: '#15803d',
  ink: '#0a0a0a', text: '#0a0a0a', textSub: '#6b7280', textMute: '#9ca3af',
  border: '#e7e9ec', borderSoft: '#eef0f2', track: '#f1f3f5',
  blue: '#2563eb', blueBg: '#dbeafe', red: '#dc2626', redBg: '#fee2e2',
  amber: '#d97706', amberBg: '#fef3c7', purple: '#7c3aed', purpleBg: '#ede9fe',
};

const TONES = {
  green:  { bg: C.greenSoft, fg: C.greenInk, sign: '↗' },
  blue:   { bg: C.blueBg,    fg: C.blue,     sign: '·' },
  red:    { bg: C.redBg,     fg: C.red,      sign: '↘' },
  amber:  { bg: C.amberBg,   fg: C.amber,    sign: '!' },
  purple: { bg: C.purpleBg,  fg: C.purple,   sign: '·' },
  neutral:{ bg: '#f3f4f6',   fg: '#4b5563',  sign: '·' },
};

const eur  = n => '€ ' + (Number(n) || 0).toLocaleString('nl-NL');
const kEur = n => {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1000) return '€ ' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '€ ' + n.toLocaleString('nl-NL');
};
const initialsOf = s => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
// Local (not UTC) YYYY-MM-DD key — prevents day-column shift in the agenda week.
function toLocalDateKey(dateLike) {
  if (!dateLike) return null;
  // Date-only strings ("2026-05-12") are already a local day key; keep as-is
  // so a midnight-UTC parse can't roll them back a day.
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike.slice(0, 10)) && dateLike.length <= 10) {
    return dateLike.slice(0, 10);
  }
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
  if (h < 24) return `${h} uur`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 dag' : `${d} dagen`;
};

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
  return (
    <div className="dw-controls" onClick={e => e.stopPropagation()}>
      <button className="dw-ctrl-btn" onClick={onMoveUp}   disabled={isFirst} title="Omhoog">▲</button>
      <button className="dw-ctrl-btn" onClick={onMoveDown} disabled={isLast}  title="Omlaag">▼</button>
      <div style={{ position: 'relative' }}>
        <button className="dw-ctrl-btn dw-ctrl-menu" onClick={() => setMenuOpen(v => !v)} title="Opties">•••</button>
        {menuOpen && (
          <div className="dw-ctrl-dropdown" onClick={() => setMenuOpen(false)}>
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

// ── Design primitives ─────────────────────────────────────────
function DHead({ title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: -0.2 }}>{title}</div>
        {subtitle != null && <div style={{ fontSize: 12.5, color: C.textSub, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function DMore() {
  return (
    <span style={{
      width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff',
      color: C.textMute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>
    </span>
  );
}

function DLink({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12.5, color: C.greenInk, fontWeight: 700, background: 'none', border: 'none',
      cursor: 'pointer', padding: 0, whiteSpace: 'nowrap',
    }}>{children}</button>
  );
}

function DSeg({ options, active, onPick }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, background: C.borderSoft, borderRadius: 9 }}>
      {options.map(o => (
        <button key={o} onClick={() => onPick && onPick(o)} style={{
          padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: o === active ? '#fff' : 'transparent',
          color: o === active ? C.text : C.textSub, fontWeight: 700, fontSize: 11.5,
          boxShadow: o === active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}>{o}</button>
      ))}
    </div>
  );
}

function DBadge({ tone = 'neutral', children, style }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999,
      background: t.bg, color: t.fg, fontSize: 10.5, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
}

function DAvatar({ name, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, background: C.greenSoft, color: C.greenInk,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.36, flexShrink: 0, letterSpacing: 0.2,
    }}>{initialsOf(name)}</div>
  );
}

function DEmpty({ msg }) {
  return <div style={{ padding: '28px 20px', textAlign: 'center', color: C.textMute, fontSize: 13 }}>{msg}</div>;
}

// Tooltip content card (used inside the WidgetCard hover overlay)
function TipBox({ title, rows }) {
  const r = (rows || []).filter(Boolean);
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.text, marginBottom: r.length ? 5 : 0 }}>{title}</div>
      {r.map((x, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.5 }}>
          <span style={{ color: C.textSub }}>{x.k}</span>
          <span style={{ fontWeight: 700, color: x.c || C.text }}>{x.v}</span>
        </div>
      ))}
    </div>
  );
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function rowStyle(first) {
  return { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: first ? 'none' : `1px solid ${C.borderSoft}` };
}

// ── KPI card ──────────────────────────────────────────────────
function DKpiCard({ icon, value, label, sub, trend, tone = 'green', onClick }) {
  const tm = TONES[tone] || TONES.green;
  return (
    <div
      onClick={onClick}
      className={onClick ? 'dw-kpi-click' : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{ padding: 22, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.green, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        {trend != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: tm.bg, color: tm.fg, fontSize: 11.5, fontWeight: 700 }}>
            <span style={{ fontSize: 10 }}>{tm.sign}</span>{trend}
          </span>
        )}
      </div>
      <div style={{ marginTop: 24, fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1, color: C.text }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: C.textSub }}>{label}</div>
      {sub && <div style={{ marginTop: 10, fontSize: 11.5, color: C.textMute, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

// ── Monthly revenue chart (area + grid, period seg) ───────────
const REV_PERIODS = [6, 12, 24];
function MonthlyRevenueChart({ charts, ux, onNav }) {
  const all = charts.monthlyRevenue || [];
  const [period, setPeriod] = useState(all.length > 6 ? 12 : 6);
  const tip = (e, n) => ux && ux.tip && ux.tip(e, n);
  const off = () => ux && ux.off && ux.off();
  if (!all.length) {
    return (
      <>
        <DHead title="Omzet per maand" subtitle="Nog geen omzetgegevens" right={<DMore />} />
        <DEmpty msg="Geen grafiekdata" />
      </>
    );
  }
  const d = all.slice(-period);
  const total = all.reduce((s, x) => s + (x.value || 0), 0);
  const last = d[d.length - 1]?.value || 0;
  const prev = d.length > 1 ? (d[d.length - 2]?.value || 0) : 0;
  const change = prev ? Math.round(((last - prev) / prev) * 100) : 0;
  const W = 720, H = 260, pad = { l: 44, r: 16, t: 18, b: 28 };
  const max = Math.max(...d.map(x => x.value), 1);
  const xStep = d.length > 1 ? (W - pad.l - pad.r) / (d.length - 1) : 0;
  const pts = d.map((x, i) => [
    d.length > 1 ? pad.l + i * xStep : (W - pad.r + pad.l) / 2,
    H - pad.b - (x.value / max) * (H - pad.t - pad.b),
  ]);
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${path} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`;
  return (
    <>
      <DHead
        title="Omzet per maand"
        subtitle={<><span style={{ color: C.greenInk, fontWeight: 700 }}>{change >= 0 ? '+' : ''}{change}%</span> vs. vorige periode · totaal {kEur(total)}</>}
        right={<div style={{ display: 'flex', gap: 6 }}><DSeg options={['6M', '12M', '24M']} active={`${period}M`} onPick={o => setPeriod(parseInt(o))} /><DMore /></div>}
      />
      <div className="dw-chart-body" style={{ padding: '8px 10px 14px', overflow: 'hidden' }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="bbOmzetGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.green} stopOpacity="0.32" />
              <stop offset="100%" stopColor={C.green} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map(i => {
            const y = pad.t + i * ((H - pad.t - pad.b) / 4);
            const v = max - i * (max / 4);
            return (
              <g key={i}>
                <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={C.borderSoft} strokeWidth="1" />
                <text x={pad.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill={C.textMute} fontWeight="600">{kEur(v)}</text>
              </g>
            );
          })}
          <path d={area} fill="url(#bbOmzetGrad)" />
          <path d={path} fill="none" stroke={C.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => {
            const lst = i === pts.length - 1;
            return (
              <g key={i}>
                {lst && <circle cx={p[0]} cy={p[1]} r={11} fill={C.green} opacity="0.18" />}
                <circle cx={p[0]} cy={p[1]} r={lst ? 5.5 : 3.5} fill="#fff" stroke={C.green} strokeWidth={lst ? 2.6 : 2} />
              </g>
            );
          })}
          {d.map((x, i) => (
            <text key={i} x={d.length > 1 ? pad.l + i * xStep : (W - pad.r + pad.l) / 2} y={H - 8} textAnchor="middle"
              fontSize="10.5" fill={i === d.length - 1 ? C.text : C.textMute} fontWeight={i === d.length - 1 ? 700 : 500}>{x.label}</text>
          ))}
          {d.map((x, i) => {
            const cx = d.length > 1 ? pad.l + i * xStep : (W - pad.r + pad.l) / 2;
            const bw = d.length > 1 ? xStep : (W - pad.l - pad.r);
            return (
              <rect key={'h' + i} x={cx - bw / 2} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseMove={e => tip(e, <TipBox title={x.label} rows={[{ k: 'Omzet', v: eur(x.value) }]} />)}
                onMouseLeave={off} onClick={() => onNav && onNav()} />
            );
          })}
        </svg>
      </div>
    </>
  );
}

function EmptyList({ msg }) { return <DEmpty msg={msg} />; }

// ── Widget content renderer ───────────────────────────────────
function renderContent(type, data, widget, setPage, openCustomer, onSettingsChange, ux, openDeal, openInvoice, openCalendarEvent) {
  const { deals = [], activities = [], customers = [], offertes = [], werkbonnen = [], calendarEvents = [], loading } = data;
  const charts = data.charts || {};
  if (loading) return <div style={{ padding: '20px 20px', color: C.textMute, fontSize: 13 }}>Laden…</div>;

  const customerById = id => customers.find(c => c.id === id);
  const today = new Date().toISOString().slice(0, 10);
  const isOpenAct = a => a.status !== 'completed' && a.status !== 'done';

  // Hover tooltip helpers
  const tip = (e, node) => ux && ux.tip && ux.tip(e, node);
  const off = () => ux && ux.off && ux.off();
  const hov = node => ({ onMouseMove: e => tip(e, node), onMouseLeave: off });
  // Navigation helper: open the linked customer, else fall back to a page
  const goCustOr = (custId, page) => () => { if (custId) openCustomer(custId); else setPage(page); };
  // Deal: open the Deal Detail Drawer when an id exists, else customer drawer, else pipeline
  const goDeal = d => () => {
    if (d && d.id && openDeal) openDeal(d.id);
    else if (d && d.custId) openCustomer(d.custId);
    else setPage('pipeline');
  };
  // Invoice = accepted offerte (no separate invoices table). Open the
  // invoice detail drawer when an id exists, else fall back to the Omzet page.
  const goInvoice = o => () => {
    if (o && o.id && openInvoice) openInvoice(o.id);
    else setPage('revenue');
  };
  // Open a specific record via its page's existing modal (id intent),
  // with a safe fallback to the overview page when no id is available.
  const open = {
    offerte:  o => o && o.id ? setPage('offertes', { id: o.id }) : setPage('offertes'),
    werkbon:  w => w && w.id ? setPage('werkbonnen', { id: w.id }) : setPage('werkbonnen'),
    activity: a => a && a.id ? setPage('activities', { id: a.id }) : (a && a.custId ? openCustomer(a.custId) : setPage('activities')),
    agenda:   a => a && a.id ? setPage('activities', { id: a.id }) : (a && a.custId ? openCustomer(a.custId) : setPage('calendar')),
  };
  // Unified agenda item: activity → ActivityEditModal (via deep-open),
  // loose calendar_event → CalendarEventDetailDrawer, else fallback.
  const openAgendaItem = it => () => {
    if (it.kind === 'event') {
      if (it.id && openCalendarEvent) openCalendarEvent(it.id);
      else setPage('calendar');
    } else if (it.activityId || it.id) {
      setPage('activities', { id: it.activityId || it.id });
    } else if (it.custId) {
      openCustomer(it.custId);
    } else {
      setPage('calendar');
    }
  };
  // Accessible clickable wrapper: pointer + keyboard (Enter/Space) + role.
  const clk = fn => ({
    onClick: fn,
    role: 'button',
    tabIndex: 0,
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
  });

  switch (type) {

    // ───────── KPI cards ─────────
    case 'open_pipeline_value': {
      const open = deals.filter(d => !['lost', 'completed', 'paid'].includes(d.stage));
      const val = open.reduce((s, d) => s + (d.value || 0), 0);
      return <DKpiCard icon={I.brief} value={kEur(val)} label="Open pipeline" trend="Live" tone="green" sub={`${open.length} deals open`} onClick={() => setPage('pipeline')} />;
    }
    case 'accepted_value': {
      const acc = deals.filter(d => ['approved', 'planned', 'in_progress', 'completed', 'paid'].includes(d.stage));
      const val = acc.reduce((s, d) => s + (d.value || 0), 0);
      return <DKpiCard icon={I.euro} value={kEur(val)} label="Geaccepteerd" trend="Live" tone="green" sub={`${acc.length} deals`} onClick={() => setPage('pipeline')} />;
    }
    case 'customers':
      return <DKpiCard icon={I.cust} value={customers.length} label="Klanten" trend="Live" tone="green" sub={`${customers.length} actief`} onClick={() => setPage('customers')} />;

    case 'costs_per_job': {
      const done = deals.filter(d => ['completed', 'paid'].includes(d.stage));
      const avg = done.length ? done.reduce((s, d) => s + (d.value || 0) * 0.35, 0) / done.length : 0;
      return <DKpiCard icon={I.costs} value={avg > 0 ? kEur(avg) : '—'} label="Kosten per klus" trend={done.length ? `${done.length} klussen` : null} tone="neutral" sub="gemiddeld per afgeronde klus" onClick={() => setPage('costs')} />;
    }
    case 'costs_month': {
      const now = new Date();
      const md = deals.filter(d => ['paid', 'completed'].includes(d.stage) && d.createdAt && new Date(d.createdAt).getMonth() === now.getMonth());
      const val = md.reduce((s, d) => s + (d.value || 0) * 0.35, 0);
      return <DKpiCard icon={I.costs} value={val > 0 ? kEur(val) : '—'} label="Kosten deze maand" trend="~35%" tone="neutral" sub="vs. vorige maand" onClick={() => setPage('costs')} />;
    }
    case 'billable': {
      const b = deals.filter(d => ['approved', 'planned', 'in_progress'].includes(d.stage));
      const val = b.reduce((s, d) => s + (d.value || 0), 0);
      return <DKpiCard icon={I.euro} value={val > 0 ? kEur(val) : '—'} label="Te factureren" trend={b.length ? `${b.length} klussen` : null} tone="amber" onClick={() => setPage('revenue')} />;
    }

    case 'revenue_month': {
      const now = new Date();
      const md = deals.filter(d => ['paid', 'completed'].includes(d.stage) && d.createdAt && new Date(d.createdAt).getMonth() === now.getMonth());
      const val = md.reduce((s, d) => s + (d.value || 0), 0);
      const series = (charts.monthlyRevenue || []);
      const spark = series.slice(-5);
      const prevVal = series.length > 1 ? series[series.length - 2].value : 0;
      const cur = series.length ? series[series.length - 1].value : val;
      const change = prevVal ? Math.round(((cur - prevVal) / prevVal) * 100) : 0;
      const sMax = Math.max(...spark.map(s => s.value), 1);
      return (
        <div className="dw-kpi-click" {...clk(() => setPage('revenue'))} style={{ padding: 22, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.green, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.revenue}</div>
            <DBadge tone={change >= 0 ? 'green' : 'red'} style={{ fontSize: 11.5, padding: '4px 10px' }}>{change >= 0 ? '+' : ''}{change}%</DBadge>
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{eur(val)}</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 6 }}>Omzet deze maand</div>
          </div>
          {spark.length >= 2 && (
            <svg width="100%" height="36" viewBox="0 0 100 36" preserveAspectRatio="none" style={{ marginTop: 14 }}>
              {(() => {
                const p = spark.map((s, i) => [i * (100 / (spark.length - 1)), 30 - (s.value / sMax) * 24]);
                const ln = p.map((q, i) => (i === 0 ? `M${q[0]},${q[1]}` : `L${q[0]},${q[1]}`)).join(' ');
                return (<><path d={`${ln} L100,36 L0,36 Z`} fill={C.greenSoft} /><path d={ln} fill="none" stroke={C.green} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></>);
              })()}
            </svg>
          )}
          <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: `1px solid ${C.borderSoft}`, display: 'flex', justifyContent: 'space-between' }}>
            <div><div style={{ fontSize: 10.5, color: C.textMute, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vorige</div><div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{prevVal ? eur(prevVal) : '—'}</div></div>
          </div>
        </div>
      );
    }

    case 'profit_month': {
      const now = new Date();
      const md = deals.filter(d => ['paid', 'completed'].includes(d.stage) && d.createdAt && new Date(d.createdAt).getMonth() === now.getMonth());
      const val = md.reduce((s, d) => s + (d.value || 0) * 0.28, 0);
      const target = 9700;
      const pct = Math.min(100, Math.round((val / target) * 100));
      return (
        <div className="dw-kpi-click" {...clk(() => setPage('revenue'))} style={{ padding: 22, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.green, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.trend}</div>
            <DBadge tone="green" style={{ fontSize: 11.5, padding: '4px 10px' }}>marge ~28%</DBadge>
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{eur(val)}</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 6 }}>Winst deze maand</div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 999, background: C.track, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: C.green }} />
            </div>
            <span style={{ fontSize: 11.5, color: C.textSub, fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: C.textSub }}>van doel {eur(target)}</div>
        </div>
      );
    }

    // ───────── Acties vandaag ─────────
    case 'actions_today': {
      const items = activities.filter(a => isOpenAct(a) && (a.dueAt?.slice(0, 10) === today || a.status === 'today' || a.status === 'overdue')).slice(0, 8);
      const overdue = activities.filter(a => isOpenAct(a) && a.dueAt && a.dueAt.slice(0, 10) < today).length;
      if (widget.size === 'small') {
        return <DKpiCard icon={I.act} value={items.length} label="Acties vandaag" trend={overdue > 0 ? `${overdue} laat` : 'op tijd'} tone={overdue > 0 ? 'amber' : 'green'} sub={`${items.length} vandaag · ${overdue} te laat`} onClick={() => setPage('activities')} />;
      }
      return (
        <>
          <DHead title="Acties vandaag" subtitle={`${items.length} openstaand · ${overdue} te laat`}
            right={<DLink onClick={() => setPage('activities')}>Alle activiteiten →</DLink>} />
          <div>
            {items.map((a, i) => {
              const c = customerById(a.custId);
              const od = a.status === 'overdue' || (a.dueAt && a.dueAt.slice(0, 10) < today);
              const tn = od ? 'red' : (a.dueAt?.slice(0, 10) === today ? 'blue' : 'neutral');
              const lbl = od ? 'Te laat' : (a.dueAt?.slice(0, 10) === today ? 'Vandaag' : (a.time || a.dueAt?.slice(0, 10) || '—'));
              return (
                <div key={a.id} className="dw-row" {...clk(() => open.activity(a))} style={{ ...rowStyle(i === 0), gap: 14 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, border: `1.6px solid ${C.border}`, background: '#fff', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    <div style={{ fontSize: 11.5, color: C.textSub, marginTop: 2 }}>
                      {c && <span style={{ color: C.greenInk, fontWeight: 600 }}>{c.name}</span>}{c && ' · '}{a.time || a.dueAt?.slice(0, 10) || '—'}
                    </div>
                  </div>
                  <DBadge tone={tn}>{lbl}</DBadge>
                </div>
              );
            })}
            {items.length === 0 && <DEmpty msg="Geen acties vandaag" />}
          </div>
        </>
      );
    }

    // ───────── Taken te laat ─────────
    case 'overdue_tasks': {
      const items = activities.filter(a => isOpenAct(a) && a.dueAt && a.dueAt.slice(0, 10) < today).slice(0, 6);
      if (widget.size === 'small') {
        return <DKpiCard icon={I.clock} value={items.length} label="Taken te laat" trend={items.length ? 'actie nodig' : 'op tijd'} tone={items.length ? 'red' : 'green'} sub={items.length ? `${items.length} over datum` : 'alles op tijd'} onClick={() => setPage('activities')} />;
      }
      return (
        <>
          <DHead title="Taken te laat" subtitle={<><span style={{ color: C.red, fontWeight: 700 }}>{items.length} activiteiten</span> over datum</>} right={<DMore />} />
          <div>
            {items.map((a, i) => {
              const c = customerById(a.custId);
              const od = Math.max(1, Math.floor((new Date(today) - new Date(a.dueAt.slice(0, 10))) / 864e5));
              return (
                <div key={a.id} className="dw-row" onClick={() => open.activity(a)} style={{ ...rowStyle(i === 0), gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: C.redBg, color: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 12 }}>{od}d</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    <div style={{ fontSize: 11.5, color: C.textSub, marginTop: 2 }}>{c?.name || '—'} · gepland {a.dueAt?.slice(0, 10)}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); open.activity(a); }} style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 700, color: C.text, cursor: 'pointer' }}>Plan</button>
                </div>
              );
            })}
            {items.length === 0 && <DEmpty msg="Geen te late taken" />}
          </div>
        </>
      );
    }

    // ───────── Nieuwe leads ─────────
    case 'new_leads': {
      const allLeads = deals.filter(d => d.stage === 'new_lead');
      const count = allLeads.length;
      const totalVal = allLeads.reduce((s, d) => s + (d.value || 0), 0);
      const items = allLeads.slice(0, 6);
      if (widget.size === 'small') {
        return <DKpiCard icon={I.pipe} value={count} label="Nieuwe leads" trend={count ? kEur(totalVal) : null} tone="green" sub="deze week" onClick={() => setPage('pipeline')} />;
      }
      const WK = 7 * 864e5, nm = Date.now();
      const dated = allLeads.filter(d => d.createdAt);
      const thisWk = dated.length ? dated.filter(d => nm - new Date(d.createdAt).getTime() < WK).length : count;
      const lastWk = dated.filter(d => { const a = nm - new Date(d.createdAt).getTime(); return a >= WK && a < 2 * WK; }).length;
      const delta = thisWk - lastWk;
      return (
        <>
          <DHead title="Nieuwe leads" subtitle={`${thisWk} deze week · ${delta >= 0 ? '+' : ''}${delta} vs. vorige`}
            right={<DLink onClick={() => setPage('pipeline')}>Alle leads →</DLink>} />
          <div>
            {items.map((d, i) => {
              const c = customerById(d.custId);
              const name = c?.name || d.customerName || 'Onbekende klant';
              const ago = relAgo(d.createdAt);
              return (
                <div key={d.id} className="dw-row" {...clk(goDeal(d))} style={rowStyle(i === 0)}>
                  <DAvatar name={name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: 11.5, color: C.textSub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}{d.city ? ` · ${d.city}` : ''}</div>
                  </div>
                  {d.source && <DBadge tone="blue">{d.source}</DBadge>}
                  {ago && <div style={{ fontSize: 11, color: C.textMute, fontWeight: 600, width: 70, textAlign: 'right', flexShrink: 0 }}>{ago} geleden</div>}
                </div>
              );
            })}
            {items.length === 0 && <DEmpty msg="Geen nieuwe leads" />}
          </div>
        </>
      );
    }

    // ───────── Actieve deals ─────────
    case 'active_deals': {
      const all = deals.filter(d => !['lost', 'completed', 'paid', 'new_lead'].includes(d.stage));
      const count = all.length;
      const totalVal = all.reduce((s, d) => s + (d.value || 0), 0);
      const items = all.slice(0, 6);
      const stageMeta = {
        contact:     { label: 'Contact nodig',  tone: 'amber' },
        quote_sent:  { label: 'Offerte verst.', tone: 'neutral' },
        approved:    { label: 'Akkoord',        tone: 'green' },
        planned:     { label: 'Gepland',        tone: 'blue' },
        in_progress: { label: 'In uitvoering',  tone: 'blue' },
      };
      const nextAct = custId => {
        const na = activities.filter(a => a.custId === custId && isOpenAct(a) && a.dueAt).sort((x, y) => new Date(x.dueAt) - new Date(y.dueAt))[0];
        if (!na) return null;
        const diff = Math.round((new Date(na.dueAt.slice(0, 10)) - new Date(today)) / 864e5);
        return diff < 0 ? `${Math.abs(diff)}d te laat` : diff === 0 ? 'vandaag' : diff === 1 ? 'morgen' : `over ${diff}d`;
      };
      const cols = '1fr 1.4fr 0.9fr 1fr 0.9fr';
      return (
        <>
          <DHead title="Actieve deals" subtitle={`${count} deals · ${eur(totalVal)} totaal`}
            right={<div style={{ display: 'flex', gap: 6 }}><DSeg options={['Alle', 'Mijn', 'Team']} active="Alle" /><DMore /></div>} />
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '8px 20px', background: '#f7f8f7', fontSize: 10.5, color: C.textMute, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', borderTop: `1px solid ${C.borderSoft}` }}>
            <div>Klant</div><div>Project</div><div>Fase</div><div>Volgende actie</div><div style={{ textAlign: 'right' }}>Waarde</div>
          </div>
          {items.map(d => {
            const c = customerById(d.custId);
            const name = c?.name || d.customerName || '?';
            const sm = stageMeta[d.stage] || { label: d.stage, tone: 'neutral' };
            const nx = nextAct(d.custId);
            return (
              <div key={d.id} className="dw-row" {...clk(goDeal(d))} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '12px 20px', borderTop: `1px solid ${C.borderSoft}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <DAvatar name={name} size={30} />
                  <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                <div><DBadge tone={sm.tone}>{sm.label}</DBadge></div>
                <div style={{ fontSize: 11.5, color: C.textSub }}>
                  {nx ? <span style={{ color: C.amber, fontWeight: 600 }}>{nx}</span> : <span style={{ color: C.textMute }}>—</span>}
                </div>
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: C.greenInk, letterSpacing: -0.2 }}>{eur(d.value)}</div>
              </div>
            );
          })}
          {items.length === 0 && <DEmpty msg="Geen actieve deals" />}
        </>
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
        <>
          <DHead title="Open offertes" subtitle={`${count} offertes · ${eur(totalValue)}`}
            right={<DLink onClick={() => setPage('offertes')}>Alle →</DLink>} />
          <div>
            {items.map((o, i) => {
              const age = ageDays(o);
              return (
                <div key={o.id} className="dw-row" {...clk(() => open.offerte(o))} style={rowStyle(i === 0)}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: C.greenSofter, color: C.greenInk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{I.quotes || I.euro}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {o.nummer && <span style={{ fontSize: 11, fontWeight: 700, color: C.textMute, fontFamily: 'ui-monospace,Menlo,monospace' }}>{o.nummer}</span>}
                      <DBadge tone={o.status === 'verzonden' ? 'blue' : 'neutral'}>{o.status}</DBadge>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customerName || o.omschrijving || 'Geen klant'}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: C.greenInk, letterSpacing: -0.2 }}>{eur(o.totaalIncl || 0)}</div>
                    {age != null && <div style={{ fontSize: 10.5, color: C.textMute, marginTop: 2, fontWeight: 600 }}>{age}d oud</div>}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <DEmpty msg="Geen open offertes" />}
          </div>
        </>
      );
    }

    // ───────── Openstaande facturen ─────────
    case 'open_facturen': {
      const items = offertes.filter(o => o.status === 'geaccepteerd').slice(0, 6);
      const totalOpen = items.reduce((s, o) => s + (o.totaalIncl || 0), 0);
      const late = items.filter((_, idx) => idx % 2 === 1).length; // unknown real due-dates → no fabrication of "te laat"
      return (
        <>
          <DHead title="Openstaande facturen" subtitle={`${items.length} facturen · ${eur(totalOpen)}`} right={<DMore />} />
          <div>
            {items.map((o, idx) => {
              const ref = o.nummer || `F-${String(idx + 1).padStart(3, '0')}`;
              return (
                <div key={o.id} className="dw-row" {...clk(goInvoice(o))} style={rowStyle(idx === 0)}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: C.greenSofter, color: C.greenInk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 800, fontSize: 11 }}>{String(ref).slice(0, 2)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customerName || 'Geen klant'}</span>
                      <DBadge tone="amber">Open</DBadge>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textSub, marginTop: 2, fontFamily: 'ui-monospace,Menlo,monospace' }}>{ref}</div>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: C.greenInk, letterSpacing: -0.2, flexShrink: 0 }}>{eur(o.totaalIncl || 0)}</div>
                </div>
              );
            })}
            {items.length === 0 && <DEmpty msg="Geen openstaande facturen" />}
          </div>
        </>
      );
    }

    // ───────── Werkbonnen vandaag ─────────
    case 'werkbonnen_today': {
      const items = werkbonnen.filter(w => w.geplandOp === today || w.datum === today).slice(0, 6);
      const tone = s => ({ afgerond: 'green', in_uitvoering: 'amber', gepland: 'blue' }[s] || 'neutral');
      const label = s => ({ afgerond: 'Afgerond', in_uitvoering: 'Onderweg', gepland: 'Gepland' }[s] || s);
      if (widget.size === 'small') {
        return <DKpiCard icon={I.wo} value={items.length} label="Werkbonnen" trend="vandaag" tone="green" sub={`${items.length} gepland`} onClick={() => setPage('werkbonnen')} />;
      }
      return (
        <>
          <DHead title="Werkbonnen vandaag" subtitle={`${items.length} bonnen gepland`} right={<DMore />} />
          <div>
            {items.map((w, idx) => {
              const ref = `WB-${String(idx + 1).padStart(3, '0')}`;
              return (
                <div key={w.id} className="dw-row" {...clk(() => open.werkbon(w))} style={{ padding: '12px 20px', borderTop: idx === 0 ? 'none' : `1px solid ${C.borderSoft}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.textMute, fontFamily: 'ui-monospace,Menlo,monospace' }}>{ref}</span>
                    <DBadge tone={tone(w.status)}>{label(w.status)}</DBadge>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{w.customerName || w.titel || w.title || '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.textSub, marginTop: 2 }}>
                    {I.map}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.locatie || '—'}</span>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <DEmpty msg="Geen werkbonnen vandaag" />}
          </div>
        </>
      );
    }

    // ───────── Uren deze week ─────────
    case 'uren_registratie': {
      const daily = charts.dailyHours || [];
      const total = daily.reduce((s, d) => s + (d.value || 0), 0);
      const target = 40;
      const pctDoel = Math.round((total / target) * 100);
      if (widget.size === 'small') {
        return <DKpiCard icon={I.hours} value={`${total}u`} label="Uren deze week" trend={`${pctDoel}% doel`} tone="green" sub={`van ${target}u doel`} onClick={() => setPage('uren')} />;
      }
      const max = Math.max(...daily.map(d => d.value), 8);
      const todIdx = (new Date().getDay() + 6) % 7;
      return (
        <>
          <DHead title="Uren deze week" subtitle={`Doel ${target}u · ${daily.length ? (total / daily.length).toFixed(1) : 0}u/dag gem.`} right={<DMore />} />
          <div style={{ padding: '0 20px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>{total}u</div>
              <div style={{ fontSize: 13, color: C.textSub }}>van {target}u · <span style={{ color: C.greenInk, fontWeight: 700 }}>{pctDoel}%</span></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 16, height: 110 }}>
              {(daily.length ? daily : Array.from({ length: 7 }, (_, i) => ({ label: ['ma','di','wo','do','vr','za','zo'][i], value: 0 }))).map((d, i) => {
                const h = Math.max(4, (d.value / max) * 90);
                const isT = i === todIdx;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10.5, color: isT ? C.text : C.textMute, fontWeight: 700 }}>{d.value > 0 ? `${d.value}u` : ''}</div>
                    <div style={{ width: '100%', height: h, borderRadius: 8, background: isT ? C.green : (d.value > 0 ? C.greenSoft : C.track) }} />
                    <div style={{ fontSize: 11, color: isT ? C.text : C.textMute, fontWeight: isT ? 700 : 500 }}>{d.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      );
    }

    // ───────── Agenda deze week ─────────
    case 'agenda_week': {
      const DN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
      const todayKey = toLocalDateKey(new Date());
      const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const cols = Array.from({ length: 7 }, (_, i) => {
        const dt = new Date(monday); dt.setDate(monday.getDate() + i);
        const iso = toLocalDateKey(dt);
        return { iso, day: DN[i], num: dt.getDate(), isToday: iso === todayKey };
      });
      const tcol = { call: C.blue, email: C.green, visit: C.purple, task: C.amber, follow: C.red };
      const inWeek = iso => iso && iso >= cols[0].iso && iso <= cols[6].iso;
      // Activities in deze week
      const actItems = activities
        .map(a => ({ a, iso: a.dueAt ? toLocalDateKey(a.dueAt) : null }))
        .filter(({ a, iso }) => isOpenAct(a) && inWeek(iso))
        .map(({ a, iso }) => ({ kind: 'activity', id: a.id, activityId: a.id, title: a.title, time: a.time || '', iso, atype: a.type, custId: a.custId, dealId: a.dealId }));
      // Losse calendar_events zonder activity-koppeling (voorkomt dubbele items)
      const evItems = (calendarEvents || [])
        .map(e => ({ e, iso: toLocalDateKey(e.startAt || e.date) }))
        .filter(({ e, iso }) => !e.activityId && e.id && inWeek(iso))
        .map(({ e, iso }) => ({ kind: 'event', id: e.id, title: e.title || 'Afspraak', time: e.time || '', iso, custId: e.custId, dealId: e.dealId }));
      const weekItems = [...actItems, ...evItems];
      const itemsOn = iso => weekItems
        .filter(it => it.iso === iso)
        .sort((x, y) => (x.time || '99:99').localeCompare(y.time || '99:99'))
        .slice(0, 4);
      return (
        <>
          <DHead title="Agenda deze week" subtitle={`${weekItems.length} agenda-items deze week`}
            right={<div style={{ display: 'flex', gap: 6 }}><DSeg options={['Week', 'Maand']} active="Week" /><DMore /></div>} />
          <div style={{ padding: '0 14px 18px' }}>
            {weekItems.length === 0 ? (
              <DEmpty msg="Geen agenda-items deze week" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                {cols.map((col, i) => {
                  const dayItems = itemsOn(col.iso);
                  return (
                    <div key={i} style={{ background: col.isToday ? C.greenSofter : '#f7f8f7', border: `1px solid ${col.isToday ? C.green : C.borderSoft}`, borderRadius: 10, padding: '10px 8px', minHeight: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 10.5, color: C.textMute, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 }}>{col.day}</span>
                        <span style={{ width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: col.isToday ? C.green : 'transparent', color: col.isToday ? C.ink : C.text, fontWeight: 800, fontSize: 12 }}>{col.num}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {dayItems.map((it, k) => {
                          const accent = it.kind === 'event' ? C.textMute : (tcol[it.atype] || C.border);
                          return (
                            <div key={k} {...clk(openAgendaItem(it))} title={it.kind === 'event' ? 'Los agenda-item' : 'Activiteit'} style={{ padding: '5px 6px', borderRadius: 6, background: '#fff', borderLeft: `3px solid ${accent}`, fontSize: 10.5, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                              {it.time && <span style={{ color: C.textSub, fontSize: 10, marginRight: 4 }}>{it.time}</span>}{it.title}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      );
    }

    // ───────── Laatste klantactiviteit ─────────
    case 'last_customer_activity': {
      const sorted = [...activities].sort((a, b) => new Date(b.dueAt || 0) - new Date(a.dueAt || 0)).slice(0, 6);
      const dot = t => ({ call: C.blue, email: C.green, visit: C.purple, task: C.amber, follow: C.red }[t] || C.green);
      return (
        <>
          <DHead title="Laatste klantactiviteit" subtitle="Realtime" right={<DMore />} />
          <div style={{ padding: '4px 20px 18px' }}>
            {sorted.map((a, i) => {
              const c = customerById(a.custId);
              const ago = relAgo(a.dueAt);
              return (
                <div key={a.id} className="dw-row" {...clk(() => open.activity(a))} style={{ display: 'flex', gap: 12, padding: '9px 6px', borderRadius: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: dot(a.type), marginTop: 5, boxShadow: '0 0 0 3px #f7f8f7' }} />
                    {i < sorted.length - 1 && <span style={{ flex: 1, width: 2, background: C.borderSoft, marginTop: 2, minHeight: 14 }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.text }}>
                      <span style={{ fontWeight: 700 }}>{c?.name || 'Onbekende klant'}</span>
                      <span style={{ color: C.textSub }}> — {a.title}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.textMute, marginTop: 2, fontWeight: 600 }}>{ago ? `${ago} geleden` : '—'}</div>
                  </div>
                </div>
              );
            })}
            {sorted.length === 0 && <DEmpty msg="Geen klantactiviteiten" />}
          </div>
        </>
      );
    }

    // ───────── Lead opvolging ─────────
    case 'lead_followup': {
      const leadDeals = deals.filter(d => ['new_lead', 'contact'].includes(d.stage)).slice(0, 6);
      const when = iso => {
        if (!iso) return { txt: 'plan actie', tone: 'neutral' };
        const diff = Math.round((new Date(iso.slice(0, 10)) - new Date(today)) / 864e5);
        if (diff < 0) return { txt: `${Math.abs(diff)}d te laat`, tone: 'red' };
        if (diff === 0) return { txt: 'vandaag', tone: 'amber' };
        if (diff === 1) return { txt: 'morgen', tone: 'amber' };
        if (diff <= 3) return { txt: `over ${diff}d`, tone: 'blue' };
        return { txt: `over ${diff}d`, tone: 'neutral' };
      };
      return (
        <>
          <DHead title="Lead opvolging" subtitle={`${leadDeals.length} leads te bellen`} right={<DMore />} />
          <div>
            {leadDeals.map((d, i) => {
              const c = customerById(d.custId);
              const name = c?.name || d.customerName || '?';
              const na = activities.filter(a => a.custId === d.custId && isOpenAct(a) && a.type === 'call').sort((x, y) => new Date(x.dueAt) - new Date(y.dueAt))[0];
              const w = when(na?.dueAt);
              const wc = TONES[w.tone].fg;
              return (
                <div key={d.id} className="dw-row" onClick={goDeal(d)} style={rowStyle(i === 0)}>
                  <DAvatar name={name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: 11.5, color: C.textSub }}>{d.title ? `${d.title} · ` : ''}bel <span style={{ color: wc, fontWeight: 700 }}>{w.txt}</span></div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); if (c) openCustomer(d.custId); else setPage('pipeline'); }} aria-label={`${name} bellen`} title={`${name} bellen`} style={{ width: 38, height: 38, borderRadius: 10, border: 'none', background: C.green, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(34,197,94,0.25)', flexShrink: 0 }}>{I.call}</button>
                </div>
              );
            })}
            {leadDeals.length === 0 && <DEmpty msg="Geen leads te bellen" />}
          </div>
        </>
      );
    }

    // ───────── Conversie overzicht ─────────
    case 'conversion_overview': {
      const stages = [
        { key: 'new_lead',    label: 'Nieuwe lead',      c: C.green },
        { key: 'contact',     label: 'Contact',          c: C.greenDark },
        { key: 'quote_sent',  label: 'Offerte gestuurd', c: C.blue },
        { key: 'approved',    label: 'Akkoord',          c: C.purple },
        { key: 'completed',   label: 'Gewonnen',         c: C.amber },
      ];
      const counts = stages.map(s => deals.filter(d => d.stage === s.key).length);
      const max = Math.max(...counts, 1);
      const totalLeads = counts[0] || 0;
      const won = counts[counts.length - 1] || 0;
      const conv = totalLeads ? Math.round((won / totalLeads) * 100) : 0;
      return (
        <>
          <DHead title="Conversie overzicht" subtitle={`${deals.length} deals · ${conv}% conversie`} right={<DMore />} />
          <div style={{ padding: '4px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stages.map((s, i) => (
              <div key={s.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 800 }}>{counts[i]}</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: C.track, overflow: 'hidden' }}>
                  <div style={{ width: `${(counts[i] / max) * 100}%`, height: '100%', background: s.c, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </>
      );
    }

    // ───────── Snelle acties ─────────
    case 'quick_actions': {
      const acts = [
        { icon: I.pipe,   l: 'Nieuwe lead',  t: C.green,     go: 'pipeline' },
        { icon: I.act,    l: 'Activiteit',   t: C.blue,      go: 'activities' },
        { icon: I.quotes, l: 'Offerte maken',t: C.purple,    go: 'offertes' },
        { icon: I.wo,     l: 'Werkbon',      t: C.amber,     go: 'werkbonnen' },
        { icon: I.cust,   l: 'Nieuwe klant', t: C.green,     go: 'customers' },
        { icon: I.hours,  l: 'Uren boeken',  t: C.greenDark, go: 'activities' },
      ];
      return (
        <>
          <DHead title="Snelle acties" subtitle="Veelgebruikt" right={<DMore />} />
          <div style={{ padding: '0 16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {acts.map((a, i) => (
              <button key={i} onClick={() => setPage(a.go)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px', borderRadius: 12, border: `1px solid ${C.borderSoft}`, background: '#f7f8f7', color: C.text, cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', color: a.t, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.borderSoft}` }}>{a.icon}</div>
                {a.l}
              </button>
            ))}
          </div>
        </>
      );
    }

    // ───────── Notities ─────────
    case 'notes': {
      const content = widget.settings?.content || '';
      return (
        <>
          <DHead title="Notities" subtitle="Persoonlijk notitieblok" right={<DMore />} />
          <div style={{ padding: '0 20px 18px', height: 'calc(100% - 64px)', boxSizing: 'border-box' }}>
            <textarea
              defaultValue={content}
              placeholder="Schrijf hier je notities…"
              onBlur={e => onSettingsChange({ ...widget.settings, content: e.target.value })}
              style={{ width: '100%', height: '100%', minHeight: 120, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: C.text, resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
            />
          </div>
        </>
      );
    }

    // ───────── Charts ─────────
    case 'monthly_revenue_chart':
      return <MonthlyRevenueChart charts={charts} ux={ux} onNav={() => setPage('revenue')} />;

    case 'monthly_profit_chart': {
      const rev = charts.monthlyRevenue || [];
      const prof = charts.monthlyProfit || [];
      const n = Math.min(6, Math.max(rev.length, prof.length));
      const rv = rev.slice(-n), pf = prof.slice(-n);
      if (!rv.length && !pf.length) return (<><DHead title="Winst per maand" right={<DMore />} /><DEmpty msg="Geen grafiekdata" /></>);
      const rows = (rv.length ? rv : pf).map((_, i) => ({
        label: (rv[i] || pf[i]).label,
        omzet: rv[i]?.value ?? (pf[i]?.value || 0),
        winst: pf[i]?.value ?? Math.round((rv[i]?.value || 0) * 0.28),
      }));
      const max = Math.max(...rows.map(r => r.omzet), 1);
      const totalP = rows.reduce((s, r) => s + r.winst, 0);
      return (
        <>
          <DHead title="Winst per maand" subtitle={`Totaal ${kEur(totalP)} · stabiele groei`}
            right={<div style={{ display: 'flex', gap: 6 }}><DSeg options={['6M', '12M']} active="6M" /><DMore /></div>} />
          <div className="dw-chart-body" style={{ padding: '14px 20px 6px', display: 'flex', alignItems: 'flex-end', gap: 16, height: 200, overflow: 'hidden' }}>
            {rows.map((d, i) => {
              const totalH = (d.omzet / max) * 150;
              const profitH = (Math.max(0, d.winst) / max) * 150;
              const last = i === rows.length - 1;
              const kosten = Math.max(0, d.omzet - d.winst);
              return (
                <div key={i} {...hov(<TipBox title={d.label} rows={[
                  { k: 'Omzet', v: eur(d.omzet) },
                  { k: 'Winst', v: eur(d.winst), c: C.greenInk },
                  { k: 'Kosten', v: eur(kosten) },
                  { k: 'Marge', v: `${pct(d.winst, d.omzet)}%` },
                ]} />)} onClick={() => setPage('revenue')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <span style={{ fontSize: 10.5, color: last ? C.greenInk : C.textMute, fontWeight: 700 }}>{kEur(d.winst)}</span>
                  <div style={{ width: '100%', height: Math.max(6, totalH), borderRadius: 8, background: C.greenSoft, display: 'flex', flexDirection: 'column-reverse', overflow: 'hidden' }}>
                    <div style={{ width: '100%', height: profitH, background: C.green }} />
                  </div>
                  <span style={{ fontSize: 11, color: last ? C.text : C.textMute, fontWeight: last ? 700 : 500 }}>{d.label}</span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '8px 20px 18px', display: 'flex', gap: 16, fontSize: 11.5, color: C.textSub }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.green }} />Winst</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.greenSoft }} />Omzet</span>
          </div>
        </>
      );
    }

    case 'pipeline_stage_chart': {
      const d = charts.pipelineByStage || [];
      const max = Math.max(...d.map(x => x.value), 1);
      const total = d.reduce((s, x) => s + x.value, 0);
      return (
        <>
          <DHead title="Pipeline per fase" subtitle={`Totaal ${eur(total)}`} right={<DMore />} />
          <div className="dw-chart-body" style={{ padding: '8px 20px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
            {d.length ? d.map((s, i) => (
              <div key={i} {...hov(<TipBox title={s.label} rows={[{ k: 'Waarde', v: eur(s.value) }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} onClick={() => setPage('pipeline')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: s.color || C.green, transform: 'translateY(-1px)' }} />
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 600, flex: 1 }}>{s.label}</span>
                  <span style={{ fontSize: 13.5, color: C.text, fontWeight: 800, letterSpacing: -0.2 }}>{eur(s.value)}</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: C.track, overflow: 'hidden' }}>
                  <div style={{ width: `${(s.value / max) * 100}%`, height: '100%', background: s.color || C.green, opacity: 0.9 }} />
                </div>
              </div>
            )) : <DEmpty msg="Geen grafiekdata" />}
          </div>
        </>
      );
    }

    case 'conversion_funnel': {
      const d = charts.conversionFunnel || [];
      return (
        <>
          <DHead title="Conversie funnel" subtitle={d.length ? `${d[0].value} leads · ${d[d.length - 1].pct}% win rate` : null} right={<DMore />} />
          <div className="dw-chart-body" style={{ padding: '8px 20px 18px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
            {d.length ? d.map((s, i) => {
              const w = 30 + (s.pct || 0) * 0.7;
              const drop = i > 0 && d[i - 1].value ? Math.round((1 - s.value / d[i - 1].value) * 100) : 0;
              return (
                <div key={i} {...hov(<TipBox title={s.label} rows={[
                  { k: 'Aantal', v: `${s.value} leads` },
                  { k: 'Conversie', v: `${s.pct}%` },
                  i > 0 ? { k: 'Drop-off', v: `−${drop}%`, c: C.red } : null,
                ]} />)} onClick={() => setPage('pipeline')} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <div style={{ fontSize: 12.5, color: C.text, width: 90, fontWeight: 700 }}>{s.label}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ width: `${w}%`, height: 32, borderRadius: 8, background: `linear-gradient(90deg, ${C.green}, ${C.greenDark})`, opacity: 0.35 + (i / d.length) * 0.65, display: 'flex', alignItems: 'center', paddingLeft: 14, color: '#fff', fontSize: 14, fontWeight: 800 }}>{s.value}</div>
                  </div>
                  <div style={{ width: 80, textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 800 }}>{s.pct}%</div>
                    {i > 0 && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600 }}>−{drop}% drop</div>}
                  </div>
                </div>
              );
            }) : <DEmpty msg="Geen grafiekdata" />}
          </div>
        </>
      );
    }

    case 'invoice_status_chart': {
      const segs = charts.invoiceStatus || [];
      const total = segs.reduce((s, x) => s + x.value, 0);
      const R = 56, CC = 2 * Math.PI * R;
      let acc = 0;
      return (
        <>
          <DHead title="Facturen status" subtitle={`${total} facturen`} right={<DMore />} />
          <div className="dw-chart-body" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '8px 20px 22px', overflow: 'hidden' }}>
            {segs.length ? (
              <>
                <svg width="150" height="150" viewBox="0 0 150 150" style={{ flexShrink: 0 }}>
                  <circle cx="75" cy="75" r={R} fill="none" stroke={C.track} strokeWidth="18" />
                  {segs.map((s, i) => {
                    const len = total ? (s.value / total) * CC : 0;
                    const el = (
                      <circle key={i} cx="75" cy="75" r={R} fill="none" stroke={s.color || C.green} strokeWidth="18"
                        strokeDasharray={`${len} ${CC - len}`} strokeDashoffset={-acc} transform="rotate(-90 75 75)"
                        style={{ cursor: 'pointer' }} onClick={() => setPage('revenue')}
                        {...hov(<TipBox title={s.label} rows={[{ k: 'Facturen', v: s.value }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} />
                    );
                    acc += len; return el;
                  })}
                  <text x="75" y="72" textAnchor="middle" fontSize="26" fontWeight="800" fill={C.text}>{total}</text>
                  <text x="75" y="90" textAnchor="middle" fontSize="10" fill={C.textSub} fontWeight="700" letterSpacing="0.5">FACTUREN</text>
                </svg>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {segs.map((s, i) => (
                    <div key={i} {...hov(<TipBox title={s.label} rows={[{ k: 'Facturen', v: s.value }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} onClick={() => setPage('revenue')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color || C.green }} />
                      <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{s.label}</span>
                      <span style={{ fontSize: 11.5, color: C.textSub }}>{total ? Math.round((s.value / total) * 100) : 0}%</span>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 800, width: 24, textAlign: 'right' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <DEmpty msg="Geen grafiekdata" />}
          </div>
        </>
      );
    }

    case 'job_costs_bar_chart': {
      const cats = charts.jobCostsByCustomer || [];
      const max = Math.max(...cats.map(c => c.value), 1);
      const total = cats.reduce((s, c) => s + c.value, 0);
      const tight = widget.size === 'medium';
      return (
        <>
          <DHead title="Kosten per klant" subtitle={`${eur(total)} totaal`} right={<DMore />} />
          <div className="dw-chart-body" style={{ padding: '14px 20px 18px', display: 'flex', alignItems: 'flex-end', gap: 14, height: 220, overflow: 'hidden' }}>
            {cats.length ? cats.map((c, i) => {
              const h = Math.max(8, (c.value / max) * 150);
              return (
                <div key={i} {...hov(<TipBox title={c.label} rows={[{ k: 'Kosten', v: eur(c.value) }, { k: 'Aandeel', v: `${pct(c.value, total)}%` }]} />)} onClick={() => setPage('costs')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  {!tight && <div style={{ fontSize: 10.5, color: C.text, fontWeight: 700 }}>{kEur(c.value)}</div>}
                  <div style={{ width: '100%', height: h, borderRadius: 8, background: i === 0 ? C.green : C.text }} />
                  <div style={{ fontSize: 11, color: C.textSub, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{c.label}</div>
                </div>
              );
            }) : <DEmpty msg="Geen grafiekdata" />}
          </div>
        </>
      );
    }

    case 'weekly_hours_histogram': {
      const wk = charts.weeklyHours || [];
      const target = 40, max = Math.max(...wk.map(d => d.value), 48);
      const avg = wk.length ? Math.round(wk.reduce((s, d) => s + d.value, 0) / wk.length) : 0;
      const tight = widget.size === 'medium';
      return (
        <>
          <DHead title="Uren per week" subtitle={`${wk.length} weken · gem. ${avg}u/week`} right={<DMore />} />
          <div className="dw-chart-body" style={{ padding: '16px 20px 6px', display: 'flex', alignItems: 'flex-end', gap: 16, height: 200, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 20, right: 20, top: `${(1 - target / max) * 150 + 16}px`, borderTop: `1.5px dashed ${C.red}`, opacity: 0.6 }} />
            {wk.length ? wk.map((d, i) => {
              const h = (d.value / max) * 150;
              const last = i === wk.length - 1;
              return (
                <div key={i} {...hov(<TipBox title={d.label} rows={[{ k: 'Uren', v: `${d.value} uur` }, { k: 'Doel', v: `${target} uur` }]} />)} onClick={() => setPage('uren')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  {!tight && <span style={{ fontSize: 11, color: C.text, fontWeight: 700 }}>{d.value}u</span>}
                  <div style={{ width: '100%', height: Math.max(4, h), borderRadius: 8, background: d.value >= target ? C.green : (last ? C.amber : C.greenSoft) }} />
                  <span style={{ fontSize: 11, color: last ? C.text : C.textSub, fontWeight: last ? 700 : 500 }}>{d.label}</span>
                </div>
              );
            }) : <DEmpty msg="Geen urendata" />}
          </div>
          <div style={{ padding: '6px 20px 16px', fontSize: 11, color: C.red, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, borderTop: `1.5px dashed ${C.red}` }} /> Doel {target}u/week
          </div>
        </>
      );
    }

    case 'activities_per_day_chart': {
      const d = charts.activitiesPerDay || [];
      const max = Math.max(...d.map(x => x.value), 1);
      const total = d.reduce((s, x) => s + x.value, 0);
      const peak = d.reduce((m, x, i) => x.value > d[m].value ? i : m, 0);
      const tight = widget.size === 'medium';
      return (
        <>
          <DHead title="Activiteiten per dag" subtitle={`${total} activiteiten deze week`} right={<DMore />} />
          <div className="dw-chart-body" style={{ padding: '14px 20px 18px', display: 'flex', alignItems: 'flex-end', gap: 14, height: 200, overflow: 'hidden' }}>
            {d.length ? d.map((x, i) => {
              const h = Math.max(6, (x.value / max) * 150);
              const hot = i === peak;
              const dayFull = { ma: 'Maandag', di: 'Dinsdag', wo: 'Woensdag', do: 'Donderdag', vr: 'Vrijdag', za: 'Zaterdag', zo: 'Zondag' }[x.label] || x.label;
              return (
                <div key={i} {...hov(<TipBox title={dayFull} rows={[{ k: 'Activiteiten', v: x.value }]} />)} onClick={() => setPage('activities')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  {!tight && <div style={{ fontSize: 10.5, color: hot ? C.greenInk : C.textMute, fontWeight: 700 }}>{x.value}</div>}
                  <div style={{ width: '100%', height: h, borderRadius: 8, background: hot ? C.green : C.greenSoft }} />
                  <div style={{ fontSize: 11.5, color: hot ? C.text : C.textMute, fontWeight: hot ? 700 : 500 }}>{x.label}</div>
                </div>
              );
            }) : <DEmpty msg="Geen grafiekdata" />}
          </div>
        </>
      );
    }

    case 'lead_source_chart': {
      const src = charts.leadSource || [];
      const total = src.reduce((s, x) => s + x.value, 0) || 1;
      return (
        <>
          <DHead title="Lead bronnen" subtitle={`${total} leads · 30 dagen`} right={<DMore />} />
          <div className="dw-chart-body" style={{ padding: '8px 20px 18px', overflow: 'hidden' }}>
            {src.length ? (
              <>
                <div style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden' }}>
                  {src.map((s, i) => (
                    <div key={i} {...hov(<TipBox title={s.label} rows={[{ k: 'Leads', v: s.value }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} onClick={() => setPage('pipeline')} style={{ flex: s.value, background: s.color || C.green, cursor: 'pointer' }} />
                  ))}
                </div>
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {src.map((s, i) => (
                    <div key={i} {...hov(<TipBox title={s.label} rows={[{ k: 'Leads', v: s.value }, { k: 'Aandeel', v: `${pct(s.value, total)}%` }]} />)} onClick={() => setPage('pipeline')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: s.color || C.green }} />
                      <span style={{ fontSize: 12.5, color: C.text, flex: 1 }}>{s.label}</span>
                      <span style={{ fontSize: 11.5, color: C.textMute }}>{Math.round((s.value / total) * 100)}%</span>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 700, width: 28, textAlign: 'right' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <DEmpty msg="Geen grafiekdata" />}
          </div>
        </>
      );
    }

    case 'top_customers_chart': {
      const items = charts.topCustomers || [];
      const max = items.length ? items[0].value : 1;
      return (
        <>
          <DHead title="Top klanten op omzet" subtitle="Jaar tot nu" right={<DMore />} />
          <div className="dw-chart-body" style={{ padding: '8px 20px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
            {items.length ? items.map((it, i) => {
              const cid = it.customerId || customers.find(c => c.name === it.label)?.id;
              return (
              <div key={i} className="dw-row" {...clk(() => cid ? openCustomer(cid) : setPage('customers'))}
                {...hov(<TipBox title={it.label} rows={[{ k: 'Omzet', v: eur(it.value) }]} />)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '2px 0', borderRadius: 8 }}>
                <DAvatar name={it.label} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.greenInk, letterSpacing: -0.2, flexShrink: 0 }}>{eur(it.value)}</span>
                  </div>
                  <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: C.track, overflow: 'hidden' }}>
                    <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: C.green }} />
                  </div>
                </div>
              </div>
              );
            }) : <DEmpty msg="Geen klantdata" />}
          </div>
        </>
      );
    }

    default:
      return <div style={{ padding: '20px', color: C.textMute, fontSize: 13, textAlign: 'center' }}>Widget "{type}" is nog niet beschikbaar.</div>;
  }
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

// ── WidgetCard ────────────────────────────────────────────────
export function WidgetCard({ widget, editMode, isFirst, isLast, onMoveUp, onMoveDown, onResize, onRemove, onSettingsChange, data, setPage, openCustomer, openDeal, openInvoice, openCalendarEvent }) {
  const supportedSizes = getSupportedSizes(widget.widget_type);
  const hostRef = useRef(null);
  const [tipState, setTipState] = useState(null);
  const showTip = (e, node) => {
    const host = hostRef.current;
    if (!host || !node) return;
    const r = host.getBoundingClientRect();
    const w = r.width || 240;
    const x = Math.max(72, Math.min(w - 72, e.clientX - r.left));
    setTipState({ x, y: e.clientY - r.top, node });
  };
  const hideTip = () => setTipState(null);
  const ux = { tip: showTip, off: hideTip };
  return (
    <div ref={hostRef} className={`dw-widget${editMode ? ' edit' : ''}`} data-size={widget.size} style={{ position: 'relative' }}>
      {editMode && (
        <>
          <div className="dw-edit-overlay" />
          <div className="dw-drag-handle" title="Verplaatsen"><DragDots /></div>
          <WidgetControls size={widget.size} supportedSizes={supportedSizes} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onResize={onResize} onRemove={onRemove} isFirst={isFirst} isLast={isLast} />
        </>
      )}
      <div className="card" style={{ height: '100%', overflow: 'hidden' }}>
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
