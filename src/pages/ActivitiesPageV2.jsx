import { useEffect, useMemo, useState } from 'react';
import { listActivities, updateActivity } from '../services/activityService.js';
import { listCustomers } from '../services/customerService.js';
import { listDeals } from '../services/dealService.js';
import { ActivityEditModal, NewActivityModal } from '../components/SharedModals.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { getTeamMembers } from '../services/notificatieService.js';

// ─── Inline SVG icons (stroke-based, currentColor) ──────────────────────────
const ICO_PLUS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const ICO_CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12l5 5 11-12" />
  </svg>
);
const ICO_CAL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </svg>
);
const ICO_USER = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
  </svg>
);
const ICO_SEARCH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);
const ICO_VIEW_GROUP = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 5h18M3 12h18M3 19h18" />
  </svg>
);
const ICO_VIEW_FLAT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

const TYPE_ICONS = {
  call: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z" />
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  visit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0116 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  task: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3 8-8" />
      <path d="M21 12v6a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3h9" />
    </svg>
  ),
  follow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 109-9" />
      <path d="M3 5v5h5" />
    </svg>
  ),
};

const STATUS_BADGE = {
  overdue:   { cls: 'act2-b-overdue', label: 'Te laat',  dot: '#dc2626' },
  today:     { cls: 'act2-b-today',   label: 'Vandaag',  dot: '#2563eb' },
  open:      { cls: 'act2-b-gray',    label: 'Open',     dot: '#9ca3af' },
  completed: { cls: 'act2-b-done',    label: 'Gereed',   dot: '#15A34A' },
  done:      { cls: 'act2-b-done',    label: 'Gereed',   dot: '#15A34A' },
};

const isDone = a => a.status === 'completed' || a.status === 'done';
const safeType = t => (['call', 'email', 'visit', 'task', 'follow'].includes(t) ? t : 'task');

function dateGroup(a) {
  if (isDone(a)) return 'done';
  if (a.status === 'overdue') return 'overdue';
  if (!a.dueAt) return 'later';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(a.dueAt); due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}

const GROUPS = [
  { key: 'overdue',  title: 'Te laat'    },
  { key: 'today',    title: 'Vandaag'    },
  { key: 'tomorrow', title: 'Morgen'     },
  { key: 'week',     title: 'Deze week'  },
  { key: 'later',    title: 'Later'      },
  { key: 'done',     title: 'Afgerond'   },
];

const DAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatRowDate(a) {
  if (!a.dueAt) return a.date || '';
  const d = new Date(a.dueAt);
  if (Number.isNaN(d.getTime())) return a.date || '';
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

// ─── Page ───────────────────────────────────────────────────────────────────
export function ActivitiesPageV2({ openCustomer, preOpenActivityId, onNavConsumed }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const [acts, setActs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grouped');
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const getMemberName = (userId) => {
    if (!userId) return '';
    const m = teamMembers.find(t => t.id === userId);
    return m?.fullName || userId;
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([listActivities(), listCustomers(), listDeals(), getTeamMembers()])
      .then(([activityData, customerData, dealData, memberData]) => {
        setActs(activityData);
        setCustomers(customerData);
        setDeals(dealData);
        setTeamMembers(memberData);
        setError('');
      })
      .catch(err => setError(err.message || 'Activiteiten laden is mislukt.'))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    if (!preOpenActivityId || loading) return;
    const a = acts.find(x => x.id === preOpenActivityId);
    if (a) {
      setSelected(a);
      onNavConsumed && onNavConsumed();
    }
  }, [preOpenActivityId, loading, acts, onNavConsumed]);

  // Unieke toegewezen medewerkers als { id, name } objecten voor de filterdropdown
  const assignees = useMemo(() => {
    const map = new Map();
    acts.forEach(a => {
      if (a.assignee && !map.has(a.assignee)) {
        map.set(a.assignee, getMemberName(a.assignee));
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acts, teamMembers]);

  const counts = useMemo(() => {
    const c = { all: acts.length, open: 0, today: 0, overdue: 0, done: 0 };
    for (const a of acts) {
      if (isDone(a)) c.done++;
      else if (a.status === 'overdue') c.overdue++;
      else if (a.status === 'today') c.today++;
      else c.open++;
    }
    return c;
  }, [acts]);

  const filtered = useMemo(() => acts.filter(a => {
    if (filter === 'open' && a.status !== 'open') return false;
    if (filter === 'today' && a.status !== 'today') return false;
    if (filter === 'overdue' && a.status !== 'overdue') return false;
    if (filter === 'done' && !isDone(a)) return false;
    if (dateFilter && a.dueAt?.slice(0, 10) !== dateFilter) return false;
    if (memberFilter !== 'all' && a.assignee !== memberFilter) return false;
    if (search) {
      const t = search.toLowerCase();
      const hay = `${a.title || ''} ${a.customerName || ''}`.toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  }), [acts, filter, dateFilter, memberFilter, search]);

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(GROUPS.map(g => [g.key, []]));
    for (const a of filtered) {
      const k = dateGroup(a);
      (buckets[k] || buckets.later).push(a);
    }
    return buckets;
  }, [filtered]);

  const markDone = async a => {
    try {
      const updated = await updateActivity(a.id, { status: 'completed' });
      setActs(list => list.map(x => x.id === updated.id ? updated : x));
      toast.success('Activiteit afgerond');
    } catch (err) {
      toast.error(err.message || 'Bijwerken mislukt');
    }
  };

  const resetFilters = () => {
    setFilter('all'); setDateFilter(''); setSearch(''); setMemberFilter('all');
  };

  const TABS = [
    { id: 'all',     label: 'Alle',     count: counts.all     },
    { id: 'open',    label: 'Open',     count: counts.open    },
    { id: 'today',   label: 'Vandaag',  count: counts.today   },
    { id: 'overdue', label: 'Te laat',  count: counts.overdue },
    { id: 'done',    label: 'Afgerond', count: counts.done    },
  ];

  const SUMMARY = [
    { id: 'overdue', tone: 's-overdue', label: 'Te laat',           count: counts.overdue, sub: 'Pak deze het eerst aan' },
    { id: 'today',   tone: 's-today',   label: 'Vandaag',           count: counts.today,   sub: 'Geplande acties vandaag' },
    { id: 'open',    tone: 's-open',    label: 'Open',              count: counts.open,    sub: 'Verspreid over de week' },
    { id: 'done',    tone: 's-done',    label: 'Gereed deze week',  count: counts.done,    sub: 'Afgeronde acties' },
  ];

  const totalOpenLabel = counts.open + counts.today + counts.overdue;
  const hasResults = filtered.length > 0;
  const hasAnyActs = acts.length > 0;

  return (
    <div className="act2-shell">
      {/* HEADER */}
      <section className="act2-pgh">
        <div className="act2-pgh-left">
          <h1>Activiteiten</h1>
          <p>
            <span className="act2-accent">{totalOpenLabel}</span> openstaande acties
            {counts.overdue > 0 && <> · <span className="act2-accent-warn">{counts.overdue} te laat</span></>}
          </p>
        </div>
        <div className="act2-pgh-right">
          <div className="act2-context-chip" aria-label="Dagcontext">
            <span className="act2-chip-dot">Vandaag</span>
            <span className="act2-chip-sep" />
            <span className="act2-chip-stat"><b>{counts.today + counts.open}</b><span>open</span></span>
            <span className="act2-chip-sep" />
            <span className="act2-chip-stat"><b className="act2-chip-warn">{counts.overdue}</b><span>te laat</span></span>
          </div>
          <button className="act2-btn act2-btn-primary" onClick={() => setShowNew(true)}>
            {ICO_PLUS} Nieuwe activiteit
          </button>
        </div>
      </section>

      {/* SUMMARY */}
      <section className="act2-summary" aria-label="Samenvatting">
        {SUMMARY.map(c => (
          <button
            key={c.id}
            type="button"
            className={`act2-sum act2-${c.tone}${filter === c.id ? ' on' : ''}`}
            onClick={() => setFilter(c.id)}
          >
            <div className="act2-sum-row"><span>{c.label}</span></div>
            <div className="act2-sum-num">{c.count}</div>
            <div className="act2-sum-sub">{c.sub}</div>
          </button>
        ))}
      </section>

      {/* FILTERS */}
      <section className="act2-filterbar" aria-label="Filters">
        <div className="act2-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filter === t.id}
              className={`act2-tab${filter === t.id ? ' on' : ''}`}
              onClick={() => setFilter(t.id)}
            >
              {t.label}<span className="act2-tab-count">{t.count}</span>
            </button>
          ))}
        </div>

        <label className="act2-field" title="Datum">
          {ICO_CAL}
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </label>
        {dateFilter && (
          <button type="button" className="act2-btn act2-btn-ghost" onClick={() => setDateFilter('')}>
            Datum wissen
          </button>
        )}

        {assignees.length > 0 && (
          <label className="act2-field" title="Medewerker">
            {ICO_USER}
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}>
              <option value="all">Alle medewerkers</option>
              {assignees.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        )}

        <label className="act2-field act2-field-search">
          {ICO_SEARCH}
          <input
            type="text"
            placeholder="Zoek activiteit of klant…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>

        <div className="act2-spacer" />

        <div className="act2-view-toggle" role="group" aria-label="Weergave">
          <button type="button" className={view === 'grouped' ? 'on' : ''} onClick={() => setView('grouped')}>
            {ICO_VIEW_GROUP}<span>Datumgroepen</span>
          </button>
          <button type="button" className={view === 'flat' ? 'on' : ''} onClick={() => setView('flat')}>
            {ICO_VIEW_FLAT}<span>Lijst</span>
          </button>
        </div>
      </section>

      {/* STATES + LIST */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : !hasResults ? (
        <EmptyState
          filtered={hasAnyActs}
          onNew={() => setShowNew(true)}
          onReset={resetFilters}
        />
      ) : view === 'flat' ? (
        <section className="act2-listwrap">
          <div className="act2-list">
            {filtered.map(a => (
              <Row key={a.id} a={a} openCustomer={openCustomer} onSelect={setSelected} onMark={markDone} />
            ))}
          </div>
        </section>
      ) : (
        <section className="act2-listwrap">
          {GROUPS.map(g => {
            const items = grouped[g.key];
            if (!items || items.length === 0) return null;
            return (
              <div key={g.key} className={`act2-group act2-group-${g.key}`}>
                <div className="act2-group-head">
                  <span className="act2-group-ttl">{g.title}</span>
                  <span className="act2-group-cnt">{items.length}</span>
                  <span className="act2-group-line" />
                </div>
                <div className="act2-list">
                  {items.map(a => (
                    <Row key={a.id} a={a} openCustomer={openCustomer} onSelect={setSelected} onMark={markDone} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {selected && (
        <ActivityEditModal
          activity={selected}
          customers={customers}
          deals={deals}
          onClose={() => setSelected(null)}
          onSaved={updated => {
            setActs(as => as.map(a => a.id === updated.id ? updated : a));
            setSelected(null);
          }}
          onDeleted={id => {
            setActs(as => as.filter(a => a.id !== id));
            setSelected(null);
          }}
        />
      )}
      {showNew && (
        <NewActivityModal
          onClose={() => setShowNew(false)}
          customers={customers}
          deals={deals}
          onSaved={created => {
            setActs(list => [created, ...list]);
            setShowNew(false);
            bumpRefresh?.();
          }}
        />
      )}
    </div>
  );
}

function Row({ a, openCustomer, onSelect, onMark }) {
  const done = isDone(a);
  const badge = STATUS_BADGE[a.status] || STATUS_BADGE.open;
  const stateCls = done ? 'is-done' : `is-${a.status || 'open'}`;
  const t = safeType(a.type);
  const assigneeName = getMemberName(a.assignee);
  const initial = (assigneeName || '').trim().charAt(0).toUpperCase() || '·';
  return (
    <article className={`act2-row ${stateCls}`} onClick={() => onSelect(a)}>
      <span className="act2-accent-bar" aria-hidden="true" />
      <span className={`act2-icobox act2-ico-${t}`} aria-hidden="true">{TYPE_ICONS[t]}</span>
      <div className="act2-body">
        <h4 className="act2-ttl">{a.title}</h4>
        <div className="act2-meta">
          <span className={`act2-badge act2-badge-mobile ${badge.cls}`}>
            <span className="act2-badge-dot" style={{ background: badge.dot }} />{badge.label}
          </span>
          {(a.customerName || a.custId) && (
            <a
              className="act2-client"
              onClick={e => { e.stopPropagation(); openCustomer && a.custId && openCustomer(a.custId); }}
            >
              {a.customerName || 'Klant'}
            </a>
          )}
          {(a.customerName || a.custId) && <span className="act2-meta-sep">·</span>}
          <span className="act2-meta-date">{formatRowDate(a)}</span>
          {a.time && <>
            <span className="act2-meta-sep">·</span>
            <span className="act2-meta-time">{a.time}</span>
          </>}
          {a.assignee && <>
            <span className="act2-meta-sep">·</span>
            <span className="act2-meta-who"><span className="act2-av">{initial}</span>{assigneeName}</span>
          </>}
        </div>
      </div>
      <div className="act2-badge-cell">
        <span className={`act2-badge ${badge.cls}`}>
          <span className="act2-badge-dot" style={{ background: badge.dot }} />{badge.label}
        </span>
      </div>
      <div className="act2-row-actions">
        {done ? (
          <button type="button" className="act2-check on" title="Afgerond" disabled>{ICO_CHECK}</button>
        ) : (
          <button
            type="button"
            className="act2-check"
            title="Markeer als gereed"
            onClick={e => { e.stopPropagation(); onMark(a); }}
          >{ICO_CHECK}</button>
        )}
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <section className="act2-state act2-state-loading" aria-busy="true">
      <div className="act2-state-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="act2-spin" width="18" height="18">
          <path d="M21 12a9 9 0 11-3-6.7" />
        </svg>
        Activiteiten laden…
      </div>
      <div className="act2-skel">
        {[0, 1, 2].map(i => (
          <div key={i} className="act2-skel-row">
            <div className="act2-skel-circle" />
            <div className="act2-skel-text">
              <div className="act2-skel-bar act2-skel-line-1" />
              <div className="act2-skel-bar act2-skel-line-2" />
            </div>
            <div className="act2-skel-bar act2-skel-pill" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ErrorState({ message }) {
  return (
    <section className="act2-state act2-state-error" role="alert">
      <div className="act2-state-icon-err">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
          <path d="M12 9v4" /><path d="M12 17h.01" />
          <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h3>Activiteiten konden niet worden geladen</h3>
      <p>{message}</p>
    </section>
  );
}

function EmptyState({ filtered, onNew, onReset }) {
  return (
    <section className="act2-state act2-state-empty">
      <div className="act2-illo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12l5 5 11-12" />
        </svg>
      </div>
      <h3>Geen activiteiten</h3>
      <p>
        {filtered
          ? 'Geen activiteiten die aan deze filters voldoen.'
          : 'Alles bijgewerkt. Plan een nieuwe taak of geniet van de rust.'}
      </p>
      <div className="act2-state-ctas">
        <button type="button" className="act2-btn act2-btn-primary" onClick={onNew}>{ICO_PLUS} Nieuwe activiteit</button>
        {filtered && (
          <button type="button" className="act2-btn" onClick={onReset}>Filters wissen</button>
        )}
      </div>
    </section>
  );
}

export default ActivitiesPageV2;
