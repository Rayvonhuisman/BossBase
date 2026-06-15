import React, { useState } from 'react';
import {
  I, CAL_EVENTS, HOURS_DATA, COSTS_DATA, TEAM_DATA, CUSTOMERS_DATA, QUOTES_DATA,
  fmt, custById, Av, StatusBadge, ModalX, Logo,
} from '../bb-shared.jsx';
import { createCalendarEvent, listCalendarEvents, updateCalendarEvent } from '../services/calendarService.js';
import { createJobCost, deleteJobCost, listJobCosts, updateJobCost } from '../services/jobCostService.js';
import { getFacturen, getAllFactuurRegels } from '../services/factuurService.js';
import { getConnection } from '../services/accountingService.js';
import { getBtwPeriodes, syncBtwData } from '../services/btwService.js';
import { getOffertes } from '../services/offerteService.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { listCustomers } from '../services/customerService.js';
import { listDeals } from '../services/dealService.js';
import { listActivities } from '../services/activityService.js';
import { getConnectionStatus, startGoogleCalendarConnect, disconnectGoogleCalendar } from '../services/googleCalendarService.js';
import { getWerkbonnen } from '../services/werkbonService.js';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { ActivityEditModal, NewCalendarEventModal, NewJobCostModal } from '../components/SharedModals.jsx';

// ── Local date helpers ───────────────────────────────────────
// All comparisons use LOCAL date parts (never toISOString) so a day can't
// shift across the UTC boundary. Weeks are Monday→Sunday (Dutch/EU).
const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const NL_DAYS_FULL = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
const pad2 = n => String(n).padStart(2, '0');
// YYYY-MM-DD from a Date, using local parts.
function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// Normalise an event/activity date (date-only string OR ISO timestamp) to a
// local day key for safe equality checks.
function toDayKey(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && value.length <= 10) return value.slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? (typeof value === 'string' ? value.slice(0, 10) : null) : dateKey(d);
}
function addDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}
// Monday of the week containing `date` (00:00 local).
function getStartOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return d;
}
// ISO-8601 week number (week with the year's first Thursday is week 1).
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ── CALENDAR ─────────────────────────────────────────────────
export function CalendarPage({ openCustomer, openCalendarEvent, preOpenActivityId, onNavConsumed }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const [view, setView] = useState('week');
  // Monday of the visible week. Lazy initializer → on every fresh mount the
  // Agenda opens on the *current* week (no stale week is carried over).
  const [weekStart, setWeekStart] = useState(() => getStartOfWeek(new Date()));
  // First-of-month anchor for the Month tab. Lazy init → opens on the real
  // current month; stays independent of the Week tab's weekStart.
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [showEvent, setShowEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showGoogle, setShowGoogle] = useState(false);
  const [gcal, setGcal] = useState({ loading: true, connected: false, email: '', busy: false });
  const [editEvent, setEditEvent] = useState(null);
  const [editActivity, setEditActivity] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    setLoading(true);
    Promise.all([listCalendarEvents(), listCustomers(), listActivities(), getWerkbonnen().catch(() => [])])
      .then(([data, custData, actData, wbs]) => {
        // Merge ingeplande werkbonnen als synthetische agenda-events (alleen voor huidige gebruiker)
        const wbEvents = wbs
          .filter(w => w.geplandOp && w.status !== 'afgerond')
          .map(w => ({
            id: `wb-${w.id}`,
            title: w.titel,
            date: w.geplandOp,
            time: w.starttijd || '08:00',
            end: w.eindtijd || '',
            color: '#fff7ed',
            textColor: '#d97706',
            type: 'werkbon',
            werkbonId: w.id,
            customerName: w.customerName,
            locatie: w.locatie,
          }));
        setEvents([...data, ...wbEvents]);
        setCustomers(custData);
        setActivities(actData);
        setError('');
      })
      .catch(err => setError(err.message || 'Agenda laden is mislukt.'))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Deep-open a specific activity requested from the dashboard agenda widget
  React.useEffect(() => {
    if (!preOpenActivityId || loading) return;
    const a = activities.find(x => x.id === preOpenActivityId);
    if (a) {
      setEditActivity(a);
      onNavConsumed && onNavConsumed();
    } else if (import.meta.env.DEV) {
      console.warn('[bb:dashboard] agenda-activiteit niet gevonden voor deep-open:', preOpenActivityId);
    }
  }, [preOpenActivityId, loading, activities]);

  // Google Calendar connection status + handle the OAuth redirect result.
  const loadGcalStatus = React.useCallback(() => {
    getConnectionStatus()
      .then(s => setGcal(g => ({ ...g, loading: false, connected: s.connected, email: s.email })))
      .catch(() => setGcal(g => ({ ...g, loading: false })));
  }, []);
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get('google');
    if (g === 'connected') toast.success('Google Agenda gekoppeld');
    else if (g === 'error') toast.error('Google-koppeling mislukt: ' + (q.get('google_msg') || 'onbekende fout'));
    if (g) {
      // Clean the query so a refresh doesn't re-toast.
      window.history.replaceState({}, '', window.location.pathname);
    }
    loadGcalStatus();
  }, [loadGcalStatus]);

  const handleGcalConnect = async () => {
    setGcal(g => ({ ...g, busy: true }));
    try { await startGoogleCalendarConnect(); }
    catch (e) { toast.error(e.message || 'Koppelen mislukt'); setGcal(g => ({ ...g, busy: false })); }
  };
  const handleGcalDisconnect = async () => {
    if (!window.confirm('Google Agenda-koppeling verbreken?')) return;
    setGcal(g => ({ ...g, busy: true }));
    try {
      await disconnectGoogleCalendar();
      setGcal({ loading: false, connected: false, email: '', busy: false });
      toast.success('Google Agenda ontkoppeld');
    } catch (e) {
      toast.error(e.message || 'Ontkoppelen mislukt');
      setGcal(g => ({ ...g, busy: false }));
    }
  };

  const DAYS = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  const HOURS_LIST = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];

  // Derived from weekStart — the seven Mon→Sun dates of the visible week.
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = dateKey(new Date());
  const isoWeek = getISOWeek(weekStart);
  const cap = s => s.replace(/^./, c => c.toUpperCase());

  // Month grid derived from monthAnchor: Monday-start, padded with
  // leading/trailing days, sized to the exact number of weeks needed.
  const mYear = monthAnchor.getFullYear();
  const mMonth = monthAnchor.getMonth();
  const monthGridStart = getStartOfWeek(new Date(mYear, mMonth, 1));
  const daysInMonth = new Date(mYear, mMonth + 1, 0).getDate();
  const leadDays = (new Date(mYear, mMonth, 1).getDay() + 6) % 7; // Mon=0
  const monthCellCount = Math.ceil((leadDays + daysInMonth) / 7) * 7;
  const monthCells = Array.from({ length: monthCellCount }, (_, i) => addDays(monthGridStart, i));

  const headerLabel = view === 'month'
    ? `${cap(NL_MONTHS[mMonth])} ${mYear}`
    : `${cap(NL_MONTHS[weekStart.getMonth()])} ${weekStart.getFullYear()} · Week ${isoWeek}`;

  // Nav buttons are shared across views → act on the active view.
  const goPrev = () => view === 'month'
    ? setMonthAnchor(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
    : setWeekStart(ws => addDays(ws, -7));
  const goNext = () => view === 'month'
    ? setMonthAnchor(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
    : setWeekStart(ws => addDays(ws, 7));
  const goToday = () => {
    const n = new Date();
    setWeekStart(getStartOfWeek(n));
    setMonthAnchor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  const typeLabel = t => ({ job: 'Klus', activity: 'Activiteit', visit: 'Opname' }[t] || t);

  // Gekoppeld aan een activiteit → ActivityEditModal. Los agenda-event met een
  // id → globale CalendarEventDetailDrawer. Anders de inline event-modal.
  const handleEventClick = e => {
    if (e.activityId) {
      const act = activities.find(a => a.id === e.activityId);
      if (act) { setEditActivity(act); return; }
    }
    if (openCalendarEvent && e.id) { openCalendarEvent(e.id); return; }
    setShowEvent(e);
  };
  const saveEvent = async input => {
    try {
      const payload = { title: input.title, type: input.type, date: input.date, time: input.time, end: input.end, custId: input.custId || null, notes: input.notes || '' };
      const saved = input.id ? await updateCalendarEvent(input.id, payload) : await createCalendarEvent(payload);
      setEvents(es => input.id ? es.map(e => e.id === saved.id ? saved : e) : [saved, ...es]);
      setEditEvent(null);
      setShowEvent(null);
      toast.success(input.id ? 'Agenda-item bijgewerkt' : 'Agenda-item toegevoegd');
      bumpRefresh?.();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    }
  };

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Agenda</h1><p>{headerLabel}</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm" onClick={goPrev} aria-label={view === 'month' ? 'Vorige maand' : 'Vorige week'}>{I.chev_l}</button>
          <button className="btn btn-s btn-sm" onClick={goToday}>Vandaag</button>
          <button className="btn btn-s btn-sm" onClick={goNext} aria-label={view === 'month' ? 'Volgende maand' : 'Volgende week'}>{I.chev_r}</button>
          <div className="tabs">
            {['day','week','month'].map(v => (
              <button key={v} className={`tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
                {v === 'day' ? 'Dag' : v === 'week' ? 'Week' : 'Maand'}
              </button>
            ))}
          </div>
          <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>{I.plus} Toevoegen</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--r10)', marginBottom: 14, width: 'fit-content' }} className="afu2">
        {I.google}
        <span style={{ fontSize: '.8rem', color: 'var(--dmu)', fontWeight: 500 }}>Google Agenda</span>
        {gcal.loading ? (
          <span className="badge b-gray">Laden…</span>
        ) : gcal.connected ? (
          <>
            <span className="badge b-green">Verbonden{gcal.email ? ` · ${gcal.email}` : ''}</span>
            <button className="btn btn-s btn-xs" disabled={gcal.busy} onClick={handleGcalDisconnect}>Koppeling verbreken</button>
          </>
        ) : (
          <>
            <span className="badge b-gray">Niet verbonden</span>
            <button className="btn btn-p btn-xs" disabled={gcal.busy} onClick={handleGcalConnect}>Google Agenda koppelen</button>
          </>
        )}
      </div>
      {loading && <div className="card card-p">Agenda laden...</div>}
      {error && <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>}

      {!loading && !error && view === 'month' && (
        <div className="afu3">
          <div className="cal-grid-month">
            {DAYS.map(d => <div key={d} className="cal-day-hdr">{d}</div>)}
            {monthCells.map(cell => {
              const ck = dateKey(cell);
              const otherMonth = cell.getMonth() !== mMonth;
              const isToday = ck === todayKey;
              const dayEvts = events.filter(e => toDayKey(e.date) === ck);
              return (
                <div key={ck} className={`cal-cell${otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`}>
                  <div className="cal-day-num">{cell.getDate()}</div>
                  {dayEvts.slice(0, 2).map(e => (
                    <div key={e.id} className={`cal-event cal-ev-${e.type}`} style={{ background: e.color, color: e.textColor }} onClick={() => handleEventClick(e)}>
                      {e.time} {e.title}
                    </div>
                  ))}
                  {dayEvts.length > 2 && <div style={{ fontSize: '.62rem', color: 'var(--dl)', paddingLeft: 2 }}>+{dayEvts.length - 2} meer</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !error && view === 'week' && (
        <div className="afu3" style={{ overflowX: 'auto' }}>
          <div className="cal-week-grid" style={{ minWidth: 700 }}>
            <div className="cal-week-hdr" style={{ borderRight: '1px solid var(--border)' }}></div>
            {DAYS.map((d, i) => {
              const dt = weekDates[i];
              const isToday = dateKey(dt) === todayKey;
              return (
                <div key={d} className={`cal-week-hdr${isToday ? ' today-hdr' : ''}`}>
                  <div>{d}</div>
                  <div style={{ fontSize: '.9rem', fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--p)' : 'var(--dk)' }}>{dt.getDate()}</div>
                </div>
              );
            })}
            {HOURS_LIST.map(hour => (
              <React.Fragment key={hour}>
                <div className="cal-time-slot">{hour}</div>
                {weekDates.map(dt => {
                  const dk = dateKey(dt);
                  const slotEvts = events.filter(e =>
                    toDayKey(e.date) === dk && e.time && e.time.startsWith(hour.split(':')[0]),
                  );
                  return (
                    <div key={`s-${dk}-${hour}`} className="cal-slot">
                      {slotEvts.map(e => (
                        <div key={e.id} className="cal-block" style={{ background: e.color, color: e.textColor }} onClick={() => handleEventClick(e)}>
                          {e.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && view === 'day' && (() => {
        const dayKey = todayKey;
        const today = new Date();
        const dayLabel = `${NL_DAYS_FULL[today.getDay()].replace(/^./, c => c.toUpperCase())} ${today.getDate()} ${NL_MONTHS[today.getMonth()]} ${today.getFullYear()}`;
        const dayEvts = events.filter(e => toDayKey(e.date) === dayKey);
        return (
        <div className="afu3">
          <div style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: 12, color: 'var(--dk)' }}>{dayLabel}</div>
          <div className="card card-p">
            {dayEvts.length === 0
              ? <div className="empty"><div className="empty-emoji">📅</div><div className="empty-title">Geen items vandaag</div></div>
              : dayEvts.map(e => {
                  return (
                    <div key={e.id} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => handleEventClick(e)}>
                      <div style={{ width: 60, flexShrink: 0, textAlign: 'right', fontSize: '.8rem', color: 'var(--dl)', paddingTop: 3 }}>{e.time}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ width: 4, height: 32, borderRadius: 2, background: e.textColor, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{e.title}</div>
                            <div style={{ fontSize: '.76rem', color: 'var(--dmu)', marginTop: 1 }}>{typeLabel(e.type)}</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '.76rem', color: 'var(--dl)', flexShrink: 0, paddingTop: 3 }}>{e.time}–{e.end}</div>
                    </div>
                  );
                })
            }
          </div>
        </div>
        );
      })()}

      {showEvent && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowEvent(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-hd">
              <div>
                <span className={`badge ${showEvent.type === 'job' ? 'b-orange' : showEvent.type === 'visit' ? 'b-new' : 'b-blue'}`} style={{ marginBottom: 6 }}>{typeLabel(showEvent.type)}</span>
                <div className="modal-title">{showEvent.title}</div>
                <div className="modal-sub">{showEvent.date} · {showEvent.time}–{showEvent.end}</div>
              </div>
              <ModalX onClose={() => setShowEvent(null)} />
            </div>
            {(() => {
              const c = null;
              return c ? (
                <div style={{ padding: '12px 14px', background: 'var(--bgs)', borderRadius: 'var(--r8)', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: '.88rem', marginBottom: 4 }}>{c.name}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--dmu)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>{I.map} {c.city}</span>
                    <span>{I.call} {c.phone}</span>
                  </div>
                </div>
              ) : null;
            })()}
            <div className="fa">
              <button className="btn btn-s" onClick={() => setShowEvent(null)}>Sluiten</button>
              {showEvent.activityId && activities.find(a => a.id === showEvent.activityId)
                ? <button className="btn btn-s" onClick={() => { setEditActivity(activities.find(a => a.id === showEvent.activityId)); setShowEvent(null); }}>Bewerken</button>
                : <button className="btn btn-s" onClick={() => setEditEvent(showEvent)}>Bewerken</button>
              }
              <button className="btn btn-p" onClick={() => { openCustomer(showEvent.custId); setShowEvent(null); }}>Open klant</button>
            </div>
          </div>
        </div>
      )}
      {editEvent && <CalendarEventModal event={editEvent} onClose={() => setEditEvent(null)} onSave={saveEvent} customers={customers} />}
      {editActivity && (
        <ActivityEditModal
          activity={editActivity}
          customers={customers}
          onClose={() => setEditActivity(null)}
          onSaved={updated => {
            setActivities(acts => acts.map(a => a.id === updated.id ? updated : a));
            setEditActivity(null);
          }}
          onDeleted={id => {
            setActivities(acts => acts.filter(a => a.id !== id));
            setEditActivity(null);
          }}
        />
      )}
      {showNew && (
        <NewCalendarEventModal
          onClose={() => setShowNew(false)}
          customers={customers}
          onSaved={created => { setEvents(es => [created, ...es]); bumpRefresh?.(); }}
        />
      )}
      {showGoogle && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowGoogle(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-hd">
              <div><div className="modal-title">Google Agenda koppelen</div><div className="modal-sub">OAuth en een backend endpoint zijn hiervoor nodig.</div></div>
              <ModalX onClose={() => setShowGoogle(false)} />
            </div>
            <p style={{ fontSize: '.86rem', color: 'var(--dmu)', lineHeight: 1.55 }}>Deze knop is voorbereid als placeholder. Voor een echte Google Calendar-koppeling moet BossBase later een OAuth-flow, tokenopslag en server-side synchronisatie krijgen.</p>
            <div className="fa"><button className="btn btn-p" onClick={() => setShowGoogle(false)}>Begrepen</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarEventModal({ event, onClose, onSave, customers = [] }) {
  const [form, setForm] = useState(event);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div><div className="modal-title">Agenda item</div><div className="modal-sub">Maak of bewerk een kalenderitem.</div></div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2"><label>Titel</label><input value={form.title || ''} onChange={e => set('title', e.target.value)} /></div>
          <div className="f"><label>Type</label><select value={form.type || 'event'} onChange={e => set('type', e.target.value)}><option value="event">Afspraak</option><option value="job">Klus</option><option value="activity">Activiteit</option><option value="visit">Opname</option></select></div>
          <div className="f"><label>Klant</label>
            <select value={form.custId || ''} onChange={e => set('custId', e.target.value)}>
              <option value="">Geen klant</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f"><label>Datum</label><input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
          <div className="f"><label>Start</label><input type="time" value={form.time || ''} onChange={e => set('time', e.target.value)} /></div>
          <div className="f"><label>Einde</label><input type="time" value={form.end || ''} onChange={e => set('end', e.target.value)} /></div>
          <div className="f s2"><label>Notities</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
        </div>
        <div className="fa">
          <button className="btn btn-s" disabled={saving} onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" disabled={saving || !form.title?.trim()} onClick={submit}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── WORK ORDERS ──────────────────────────────────────────────
export function WorkOrdersPage() {
  const [tasks, setTasks] = useState([
    { id: 1, label: 'Ondergrond reinigen en schuren', done: true },
    { id: 2, label: 'Primer aanbrengen gevel', done: true },
    { id: 3, label: 'Eerste laag verf aanbrengen', done: false },
    { id: 4, label: 'Tweede laag verf aanbrengen', done: false },
    { id: 5, label: 'Kozijnen schilderen', done: false },
    { id: 6, label: 'Opruimen en oplevering', done: false },
  ]);
  const toggle = id => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const done = tasks.filter(t => t.done).length;

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Werkbonnen</h1><p>Mobiele weergave voor je team op locatie</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm">{I.plus} Nieuwe werkbon</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }} className="afu2">
        <div className="tw">
          <div className="tw-hd"><div className="card-title">Actieve werkbonnen</div></div>
          <table className="dt">
            <thead><tr><th>Klant</th><th>Omschrijving</th><th>Datum</th><th>Medewerker</th><th>Status</th></tr></thead>
            <tbody>
              {[
                { id: 'WB-001', cust: 'Pieter Jansen',   job: 'Schilderwerk gevel',  date: '3 mei', emp: 'Marco', status: 'in_progress' },
                { id: 'WB-002', cust: 'Frank van Dijk',  job: 'Schutting plaatsen',  date: '4 mei', emp: 'Marco', status: 'planned' },
                { id: 'WB-003', cust: 'Marieke Meijer',  job: 'Badkamer renovatie',  date: '6 mei', emp: 'Remco', status: 'planned' },
                { id: 'WB-004', cust: 'VvE Parkzicht',   job: 'Tuinonderhoud Q2',    date: '7 mei', emp: 'Remco', status: 'planned' },
              ].map(w => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.cust}</td>
                  <td>{w.job}</td>
                  <td style={{ color: 'var(--dl)' }}>{w.date}</td>
                  <td>{w.emp}</td>
                  <td><StatusBadge status={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--dl)', marginBottom: 8, fontWeight: 600 }}>📱 Medewerkerweergave — telefoon</div>
          <div className="wo-mobile afu3">
            <div className="wo-hd">
              <div className="wo-hd-top">
                <Logo dark />
                <span className="badge b-progress">In uitvoering</span>
              </div>
              <h2>Schilderwerk gevel + kozijnen</h2>
              <div className="wo-meta">{I.map} Keizersgracht 12, Zwolle · Pieter Jansen</div>
              <div className="wo-meta">{I.clock} Vandaag · 07:30–16:00</div>
            </div>
            <div className="wo-actions">
              {[
                { icon: '📞', label: 'Bel klant' },
                { icon: '🗺️', label: 'Route' },
                { icon: '📸', label: 'Foto toevoegen' },
                { icon: '⏱️', label: 'Uren registreren' },
                { icon: '🔩', label: 'Materiaal toevoegen' },
                { icon: '✅', label: 'Afronden' },
              ].map(a => (
                <button key={a.label} className="wo-action-btn">
                  <div className="icon">{a.icon}</div>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
            <div className="wo-section">
              <div className="wo-section-title">Taken ({done}/{tasks.length})</div>
              <div style={{ height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${(done / tasks.length) * 100}%`, background: 'linear-gradient(90deg,#1DDB62,#15A34A)', borderRadius: 99, transition: 'width .3s ease' }} />
              </div>
              {tasks.map(t => (
                <div key={t.id} className="wo-task" onClick={() => toggle(t.id)}>
                  <div className={`wo-check${t.done ? ' done' : ''}`}>{t.done && I.check}</div>
                  <span style={{ fontSize: '.82rem', color: t.done ? 'var(--dl)' : 'var(--dk)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
                </div>
              ))}
            </div>
            <div className="wo-section" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="wo-section-title">Notities</div>
              <textarea style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: '8px 10px', fontSize: '.8rem', resize: 'none', height: 60, outline: 'none', color: 'var(--dm)' }} placeholder="Voeg notities toe over de klus…" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HOURS ────────────────────────────────────────────────────
export function HoursPage() {
  const totalHrs = HOURS_DATA.reduce((s, h) => s + h.hrs, 0);
  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Uren</h1><p>Registreer gewerkte uren per klant en medewerker</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm">{I.plus} Uren registreren</button>
        </div>
      </div>
      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 18 }}>
        {[
          { label: 'Totale uren (week)', val: totalHrs + ' uur' },
          { label: 'Uren Marco',         val: HOURS_DATA.filter(h => h.emp === 'Marco').reduce((s, h) => s + h.hrs, 0) + ' uur' },
          { label: 'Uren Remco',         val: HOURS_DATA.filter(h => h.emp === 'Remco').reduce((s, h) => s + h.hrs, 0) + ' uur' },
        ].map((s, i) => (
          <div key={i} className="sc" style={{ padding: '16px 18px' }}>
            <div className="sc-val">{s.val}</div>
            <div className="sc-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="tw afu3">
        <div className="tw-hd">
          <div className="card-title">Urenregistratie</div>
          <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }}>
            <option>Alle medewerkers</option><option>Marco</option><option>Remco</option>
          </select>
        </div>
        <table className="dt">
          <thead><tr><th>Medewerker</th><th>Klant</th><th>Datum</th><th>Start</th><th>Eind</th><th>Uren</th><th>Type</th><th>Notitie</th></tr></thead>
          <tbody>
            {HOURS_DATA.map(h => {
              const c = custById(h.custId);
              return (
                <tr key={h.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Av name={h.emp} size="sm" idx={h.emp === 'Marco' ? 0 : 1} />
                      <span style={{ fontWeight: 600 }}>{h.emp}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{c?.name}</td>
                  <td style={{ color: 'var(--dl)' }}>{h.date}</td>
                  <td>{h.start}</td>
                  <td>{h.end}</td>
                  <td style={{ fontWeight: 700 }}>{h.hrs}u</td>
                  <td><span className="badge b-gray" style={{ textTransform: 'capitalize' }}>{h.type}</span></td>
                  <td style={{ color: 'var(--dmu)', fontSize: '.8rem' }}>{h.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KOSTEN DETAIL MODAL ───────────────────────────────────────
const CAT_OPTIONS = [
  { value: 'materiaal',       label: 'Materiaal' },
  { value: 'arbeid',          label: 'Arbeid' },
  { value: 'reiskosten',      label: 'Reiskosten' },
  { value: 'Inkoopfactuur',   label: 'Inkoopfactuur' },
  { value: 'Algemene kosten', label: 'Algemene kosten' },
  { value: 'overig',          label: 'Overig' },
];

function KostenDetailModal({ cost, mbAdminId, customers, onUpdate, onDelete, onClose }) {
  const [cat, setCat] = useState(cost.cat);
  const [custId, setCustId] = useState(cost.customerId || '');
  const [savedField, setSavedField] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isMoneybird = !!cost.externeRef;
  const mbUrl = (isMoneybird && mbAdminId && cost.moneybirdDocumentId)
    ? `https://moneybird.com/${mbAdminId}/documents/${cost.moneybirdDocumentId}`
    : null;

  const save = async (field, value) => {
    try {
      const updated = await updateJobCost(cost.id, { [field]: value || null });
      onUpdate?.(updated);
      setSavedField(field);
      setTimeout(() => setSavedField(null), 2000);
    } catch { /* silent */ }
  };

  const handleCatChange = e => {
    setCat(e.target.value);
    save('category', e.target.value);
  };

  const handleCustChange = e => {
    const val = e.target.value;
    setCustId(val);
    save('customer_id', val || null);
  };

  const handleDelete = async () => {
    const msg = cost.externeRef
      ? 'Weet je zeker dat je deze kostenregel wilt verwijderen? Dit verwijdert alleen de regel in BossBase, niet in Moneybird.'
      : 'Weet je zeker dat je deze kostenregel wilt verwijderen?';
    if (!window.confirm(msg)) return;
    setDeleting(true);
    try {
      await deleteJobCost(cost.id);
      onDelete?.(cost.id);
      onClose();
    } catch { setDeleting(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Kostendetail</span>
            {isMoneybird
              ? <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#fff', background: '#2563EB', borderRadius: 5, padding: '2px 7px' }}>Moneybird</span>
              : <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px' }}>Handmatig</span>
            }
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg" style={{ gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--dl)', fontWeight: 600, marginBottom: 2 }}>Bedrag</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                {fmt(cost.amt)}
                {cost.btwInclusief === true && <span style={{ fontSize: '.68rem', color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontWeight: 400 }}>incl. BTW</span>}
                {cost.btwInclusief === false && <span style={{ fontSize: '.68rem', color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontWeight: 400 }}>excl. BTW</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--dl)', fontWeight: 600, marginBottom: 2 }}>Datum</div>
              <div style={{ fontWeight: 600 }}>{cost.date || '—'}</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'var(--dl)', fontWeight: 600, marginBottom: 2 }}>Leverancier / omschrijving</div>
            <div>{cost.desc || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'var(--dl)', fontWeight: 600, marginBottom: 4 }}>
              Categorie
              {savedField === 'category' && <span style={{ marginLeft: 8, color: '#15A34A', fontSize: '.7rem', fontWeight: 700 }}>{I.check} Opgeslagen</span>}
            </div>
            <select
              className="btn btn-s btn-sm"
              style={{ padding: '5px 10px', width: '100%' }}
              value={cat}
              onChange={handleCatChange}
            >
              {CAT_OPTIONS.some(o => o.value === cat) ? null : <option value={cat}>{cat}</option>}
              {CAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'var(--dl)', fontWeight: 600, marginBottom: 4 }}>
              Klant / project
              {savedField === 'customer_id' && <span style={{ marginLeft: 8, color: '#15A34A', fontSize: '.7rem', fontWeight: 700 }}>{I.check} Opgeslagen</span>}
            </div>
            <select
              className="btn btn-s btn-sm"
              style={{ padding: '5px 10px', width: '100%' }}
              value={custId}
              onChange={handleCustChange}
            >
              <option value="">Algemeen</option>
              {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
            {cost.bijlageUrl && (
              <a href={cost.bijlageUrl} target="_blank" rel="noreferrer" className="btn btn-s btn-sm">
                {I.paperclip} Bijlage bekijken
              </a>
            )}
            {mbUrl && (
              <a href={mbUrl} target="_blank" rel="noreferrer" className="btn btn-s btn-sm">
                🐦 Bekijk in Moneybird
              </a>
            )}
          </div>
          <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <button
              className="btn btn-s btn-sm"
              style={{ color: '#dc2626', borderColor: '#fca5a5', background: 'transparent', width: '100%' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Verwijderen...' : 'Verwijderen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── COSTS ────────────────────────────────────────────────────
export function CostsPage() {
  const { refreshKey, bumpRefresh } = useProfile();
  const [costs, setCosts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [filterCust, setFilterCust] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCost, setSelectedCost] = useState(null);
  const [mbAdminId, setMbAdminId] = useState('');
  React.useEffect(() => {
    setLoading(true);
    Promise.all([listJobCosts(), listCustomers(), listDeals(), getConnection()])
      .then(([costData, customerData, dealData, conn]) => {
        setCosts(costData);
        setCustomers(customerData);
        setDeals(dealData);
        if (conn?.administrationId) setMbAdminId(conn.administrationId);
        setError('');
      })
      .catch(err => setError(err.message || 'Kosten laden is mislukt.'))
      .finally(() => setLoading(false));
  }, [refreshKey]);
  const filtered = costs.filter(r => {
    if (filterCust && String(r.custId) !== filterCust) return false;
    if (filterCat && r.cat !== filterCat) return false;
    return true;
  });
  const total = filtered.reduce((s, c) => s + c.amt, 0);
  const cats = [...new Set(costs.map(c => c.cat))];
  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Kosten</h1><p>Kosten bijhouden per klant en opdracht</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>{I.plus} Kosten toevoegen</button>
        </div>
      </div>
      {loading && <div className="card card-p">Kosten laden...</div>}
      {error && <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>}
      {loading && <div className="card card-p">Kosten laden...</div>}
      {error && <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>}
      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: 'Totale kosten',    val: fmt(total),                                                                             icon: I.costs  },
          { label: 'Materiaalkosten',  val: fmt(filtered.filter(c => c.cat === 'materiaal').reduce((s, c) => s + c.amt, 0)),        icon: I.brief  },
          { label: 'Arbeidskosten',    val: fmt(filtered.filter(c => c.cat === 'arbeid').reduce((s, c) => s + c.amt, 0)),           icon: I.hours  },
          { label: 'Reiskosten',       val: fmt(filtered.filter(c => c.cat === 'reiskosten').reduce((s, c) => s + c.amt, 0)),       icon: I.map    },
        ].map((s, i) => (
          <div key={i} className="sc">
            <div className="sc-top"><div className="sc-icon">{s.icon}</div></div>
            <div className="sc-val">{s.val}</div>
            <div className="sc-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="tw afu3">
        <div className="tw-hd">
          <div className="card-title">Kostenregels</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }} value={filterCust} onChange={e => setFilterCust(e.target.value)}>
              <option value="">Alle klanten</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">Alle categorieën</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <table className="dt">
          <thead><tr><th>Klant</th><th>Categorie</th><th>Omschrijving</th><th>Bedrag</th><th>Datum</th><th>Bron</th><th></th></tr></thead>
          <tbody>
            {filtered.map(r => {
              const c = customers.find(x => x.id === r.custId);
              return (
                <tr key={r.id} onClick={() => setSelectedCost(r)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{r.customerId ? (customers.find(x => x.id === r.customerId)?.name || '—') : r.klantType === 'algemeen' ? 'Algemeen' : (c?.name || '—')}</td>
                  <td><span className="badge b-gray" style={{ textTransform: 'capitalize' }}>{r.cat}</span></td>
                  <td>{r.desc}</td>
                  <td style={{ fontWeight: 700 }}>
                    {fmt(r.amt)}
                    {r.btwInclusief === true && <span style={{ marginLeft: 5, fontSize: '.68rem', color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontWeight: 400 }}>incl. BTW</span>}
                    {r.btwInclusief === false && <span style={{ marginLeft: 5, fontSize: '.68rem', color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontWeight: 400 }}>excl. BTW</span>}
                  </td>
                  <td style={{ color: 'var(--dl)', fontSize: '.8rem' }}>{r.date}</td>
                  <td>
                    {r.externeRef
                      ? <span style={{ fontSize: '.7rem', fontWeight: 700, color: '#fff', background: '#2563EB', borderRadius: 4, padding: '2px 6px' }}>MB</span>
                      : <span style={{ fontSize: '.7rem', color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>—</span>
                    }
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    {r.bijlageUrl && (
                      <a href={r.bijlageUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--dl)', fontSize: '1rem' }} title="Bijlage bekijken">
                        {I.paperclip}
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--dl)', padding: 24 }}>Geen kosten gevonden{(filterCust || filterCat) ? ' bij dit filter.' : '. Voeg de eerste kost toe.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {showNew && (
        <NewJobCostModal
          onClose={() => setShowNew(false)}
          customers={customers}
          deals={deals}
          onSaved={created => { setCosts(cs => [created, ...cs]); bumpRefresh?.(); }}
        />
      )}
      {selectedCost && (
        <KostenDetailModal
          cost={selectedCost}
          mbAdminId={mbAdminId}
          customers={customers}
          onUpdate={updated => {
            setCosts(cs => cs.map(c => c.id === updated.id ? updated : c));
            setSelectedCost(updated);
          }}
          onDelete={id => setCosts(cs => cs.filter(c => c.id !== id))}
          onClose={() => setSelectedCost(null)}
        />
      )}
    </div>
  );
}

// ── BTW HELPERS ───────────────────────────────────────────────
const BTW_NL_MONTHS = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];

function generatePeriodeOpties(type) {
  const now = new Date();
  const opties = [];
  if (type === 'kwartaal') {
    let q = Math.floor(now.getMonth() / 3);
    let year = now.getFullYear();
    for (let i = 0; i < 4; i++) {
      opties.push(`Q${q + 1} ${year}`);
      q--; if (q < 0) { q = 3; year--; }
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opties.push(`${BTW_NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`);
    }
  }
  return opties;
}

// ── FINANCIËN ─────────────────────────────────────────────────
export function RevenuePage() {
  const toast = useToast();
  const { refreshKey } = useProfile();
  const [customers, setCustomers] = useState([]);
  const [costsData, setCostsData] = useState([]);
  const [facturen, setFacturen] = useState([]);
  const [offertes, setOffertes] = useState([]);
  const [allRegels, setAllRegels] = useState([]);
  const [chartMode, setChartMode] = useState('gefactureerd');
  const [chartPeriod, setChartPeriod] = useState('maand');
  const [loading, setLoading] = useState(true);
  const [mbConnection, setMbConnection] = useState(null);
  const [btwPerioden, setBtwPerioden] = useState([]);
  const [btwPeriodeType, setBtwPeriodeType] = useState('kwartaal');
  const [btwLoading, setBtwLoading] = useState(false);
  const [btwSyncing, setBtwSyncing] = useState(false);
  const [btwSelectedLabel, setBtwSelectedLabel] = useState(() => generatePeriodeOpties('kwartaal')[0] || '');
  const [kpiPeriode, setKpiPeriode] = useState('deze-maand');
  const [kpiVan, setKpiVan] = useState('');
  const [kpiTot, setKpiTot] = useState('');

  const TODAY = new Date().toISOString().slice(0, 10);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([listCustomers(), listJobCosts(), getFacturen(), getOffertes(), getAllFactuurRegels(), getConnection()])
      .then(([custData, costData, facturenData, offertesData, regelsData, mbConn]) => {
        setCustomers(custData);
        setCostsData(costData);
        setFacturen(facturenData);
        setOffertes(offertesData);
        setAllRegels(regelsData);
        setMbConnection(mbConn);
      }).catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);

  React.useEffect(() => {
    setBtwSelectedLabel(generatePeriodeOpties(btwPeriodeType)[0] || '');
  }, [btwPeriodeType]);

  React.useEffect(() => {
    if (!mbConnection?.apiToken) return;
    setBtwLoading(true);
    getBtwPeriodes(btwPeriodeType)
      .then(setBtwPerioden)
      .catch(() => {})
      .finally(() => setBtwLoading(false));
  }, [mbConnection, btwPeriodeType]);

  // ── KPI ──────────────────────────────────────────────────────
  const isRealFactuur = f => !f.isCredit && !f.gecrediteerd;

  const kpiRange = React.useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    if (kpiPeriode === 'deze-maand')  return { start: `${y}-${m}`, end: `${y}-${m}`, mode: 'month' };
    if (kpiPeriode === 'vorige-maand') {
      const p = new Date(y, now.getMonth() - 1, 1);
      const pm = String(p.getMonth() + 1).padStart(2, '0');
      return { start: `${p.getFullYear()}-${pm}`, end: `${p.getFullYear()}-${pm}`, mode: 'month' };
    }
    if (kpiPeriode === 'dit-jaar')   return { start: `${y}-01-01`, end: `${y}-12-31`, mode: 'range' };
    if (kpiPeriode === 'vorig-jaar') return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, mode: 'range' };
    if (kpiPeriode === 'aangepast')  return { start: kpiVan, end: kpiTot, mode: 'range' };
    return { start: `${y}-${m}`, end: `${y}-${m}`, mode: 'month' };
  }, [kpiPeriode, kpiVan, kpiTot]);

  const inPeriode = d => {
    if (!d) return false;
    if (kpiRange.mode === 'month') return d.startsWith(kpiRange.start);
    return kpiRange.start && kpiRange.end && d >= kpiRange.start && d <= kpiRange.end;
  };

  const PERIODE_LABEL = { 'deze-maand': 'deze maand', 'vorige-maand': 'vorige maand', 'dit-jaar': 'dit jaar', 'vorig-jaar': 'vorig jaar', 'aangepast': 'geselecteerde periode' };
  const periodeLabel = PERIODE_LABEL[kpiPeriode] || 'deze periode';

  const omzetPeriode     = facturen.filter(f => isRealFactuur(f) && f.status !== 'concept' && inPeriode(f.factuurdatum)).reduce((s, f) => s + f.totaalIncl, 0);
  const ontvangenPeriode = facturen.filter(f => isRealFactuur(f) && f.status === 'betaald'  && inPeriode(f.betaaldOp)).reduce((s, f) => s + f.totaalIncl, 0);
  const openstaand       = facturen.filter(f => isRealFactuur(f) && f.status === 'verzonden').reduce((s, f) => s + f.totaalIncl, 0);
  const teVerwachten     = offertes.filter(o => o.status === 'geaccepteerd').reduce((s, o) => s + o.totaalIncl, 0);
  const kostenPeriode    = costsData.filter(c => inPeriode(c.date)).reduce((s, c) => s + c.amt, 0);
  const netto            = ontvangenPeriode - kostenPeriode;
  const marge            = ontvangenPeriode > 0 ? Math.round((netto / ontvangenPeriode) * 100) : 0;

  // ── CHART DATA ────────────────────────────────────────────────
  const chartData = React.useMemo(() => {
    const now = new Date();
    const toIso = d => d.toISOString().slice(0, 10);
    const DAY_NL = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

    if (chartPeriod === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - 6 + i);
        const key = toIso(d);
        return {
          label: DAY_NL[d.getDay()],
          gefactureerd: facturen.filter(f => isRealFactuur(f) && f.status !== 'concept' && f.factuurdatum === key).reduce((s, f) => s + f.totaalIncl, 0),
          ontvangen:    facturen.filter(f => isRealFactuur(f) && f.status === 'betaald' && f.betaaldOp === key).reduce((s, f) => s + f.totaalIncl, 0),
          kosten:       costsData.filter(c => c.date === key).reduce((s, c) => s + c.amt, 0),
        };
      });
    }

    if (chartPeriod === 'maand') {
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - 29 + i);
        const key = toIso(d);
        return {
          label: String(d.getDate()),
          gefactureerd: facturen.filter(f => isRealFactuur(f) && f.status !== 'concept' && f.factuurdatum === key).reduce((s, f) => s + f.totaalIncl, 0),
          ontvangen:    facturen.filter(f => isRealFactuur(f) && f.status === 'betaald' && f.betaaldOp === key).reduce((s, f) => s + f.totaalIncl, 0),
          kosten:       costsData.filter(c => c.date === key).reduce((s, c) => s + c.amt, 0),
        };
      });
    }

    if (chartPeriod === 'kwartaal') {
      return Array.from({ length: 13 }, (_, i) => {
        const wEnd = new Date(now); wEnd.setDate(wEnd.getDate() - (12 - i) * 7);
        const wStart = new Date(wEnd); wStart.setDate(wEnd.getDate() - 6);
        const start = toIso(wStart), end = toIso(wEnd);
        const label = `${wStart.getDate()} ${wStart.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')}`;
        return {
          label,
          gefactureerd: facturen.filter(f => isRealFactuur(f) && f.status !== 'concept' && f.factuurdatum >= start && f.factuurdatum <= end).reduce((s, f) => s + f.totaalIncl, 0),
          ontvangen:    facturen.filter(f => isRealFactuur(f) && f.status === 'betaald' && f.betaaldOp >= start && f.betaaldOp <= end).reduce((s, f) => s + f.totaalIncl, 0),
          kosten:       costsData.filter(c => c.date >= start && c.date <= end).reduce((s, c) => s + c.amt, 0),
        };
      });
    }

    // jaar (default) — afgelopen 12 maanden
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        label: d.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', ''),
        gefactureerd: facturen.filter(f => isRealFactuur(f) && f.status !== 'concept' && f.factuurdatum?.startsWith(key)).reduce((s, f) => s + f.totaalIncl, 0),
        ontvangen:    facturen.filter(f => isRealFactuur(f) && f.status === 'betaald' && f.betaaldOp?.startsWith(key)).reduce((s, f) => s + f.totaalIncl, 0),
        kosten:       costsData.filter(c => c.date?.startsWith(key)).reduce((s, c) => s + c.amt, 0),
      };
    });
  }, [facturen, costsData, chartPeriod]);

  // ── PER KLANT ─────────────────────────────────────────────────
  const rows = customers.map(c => {
    const costs  = costsData.filter(x => x.custId === c.id).reduce((s, x) => s + x.amt, 0);
    const profit = c.paid - costs;
    const margin = c.paid > 0 ? Math.round((profit / c.paid) * 100) : 0;
    return { ...c, costs, profit, margin };
  });

  const handleSyncBtw = async () => {
    setBtwSyncing(true);
    try {
      await syncBtwData(btwPeriodeType);
      const data = await getBtwPeriodes(btwPeriodeType);
      setBtwPerioden(data);
      toast.success('BTW data gesynchroniseerd');
    } catch (err) { toast.error(err.message || 'Synchronisatie mislukt'); }
    finally { setBtwSyncing(false); }
  };

  const handleExport = () => {
    if (rows.length === 0) { toast.info('Geen financiële data om te exporteren'); return; }
    const headers = ['Klant', 'Stad', 'Geoffreerd (€)', 'Kosten (€)', 'Betaald (€)', 'Openstaand (€)', 'Nettoresultaat (€)', 'Marge (%)', 'Status'];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = [
      headers.map(escape).join(','),
      ...rows.map(r => [r.name, r.city || '', r.total.toFixed(2), r.costs.toFixed(2), r.paid.toFixed(2), (r.total - r.paid).toFixed(2), r.profit.toFixed(2), r.margin, r.stage === 'completed' || r.stage === 'paid' ? 'Afgerond' : 'In uitvoering'].map(escape).join(',')),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `bossbase-financien-export-${TODAY}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Export gedownload');
  };

  const CHART_MODES = [
    { id: 'gefactureerd', label: 'Gefactureerd' },
    { id: 'ontvangen',    label: 'Ontvangen' },
    { id: 'kosten',       label: 'Kosten' },
  ];

  const CHART_PERIODS = [
    { id: 'week',     label: 'Week' },
    { id: 'maand',    label: 'Maand' },
    { id: 'kwartaal', label: 'Kwartaal' },
    { id: 'jaar',     label: 'Jaar' },
  ];

  const CHART_PERIOD_LABELS = { week: 'afgelopen 7 dagen', maand: 'afgelopen 30 dagen', kwartaal: 'afgelopen kwartaal', jaar: 'afgelopen 12 maanden' };

  const KPI = [
    { label: `Omzet ${periodeLabel}`,  val: fmt(omzetPeriode),     sub: 'Verzonden + betaald (incl. BTW)',    icon: I.chart   },
    { label: 'Ontvangen',              val: fmt(ontvangenPeriode), sub: `Betaalde facturen ${periodeLabel}`,  icon: I.check   },
    { label: 'Openstaand',             val: fmt(openstaand),       sub: 'Verzonden, nog te ontvangen',        icon: I.clock,  color: '#e8784a' },
    { label: 'Te verwachten',          val: fmt(teVerwachten),     sub: 'Geaccepteerde offertes',             icon: I.quotes  },
    { label: `Kosten ${periodeLabel}`, val: fmt(kostenPeriode),    sub: `Alle kostenregels ${periodeLabel}`,  icon: I.costs   },
    { label: 'Nettoresultaat',         val: fmt(netto),            sub: `${marge}% marge ${periodeLabel}`,    icon: I.revenue, color: netto >= 0 ? '#15A34A' : '#dc2626' },
  ];

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Financiën</h1><p>Financieel overzicht</p></div>
        <div className="page-hd-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          <select value={kpiPeriode} onChange={e => setKpiPeriode(e.target.value)} style={{ fontSize: '.82rem' }}>
            <option value="deze-maand">Deze maand</option>
            <option value="vorige-maand">Vorige maand</option>
            <option value="dit-jaar">Dit jaar</option>
            <option value="vorig-jaar">Vorig jaar</option>
            <option value="aangepast">Aangepast…</option>
          </select>
          {kpiPeriode === 'aangepast' && (<>
            <input type="date" value={kpiVan} onChange={e => setKpiVan(e.target.value)} style={{ fontSize: '.82rem' }} />
            <input type="date" value={kpiTot} onChange={e => setKpiTot(e.target.value)} style={{ fontSize: '.82rem' }} />
          </>)}
          <button className="btn btn-s btn-sm" onClick={handleExport}>Exporteren</button>
        </div>
      </div>

      {loading && <div className="card card-p">Financiën laden...</div>}

      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {KPI.map((k, i) => (
          <div key={i} className="sc">
            <div className="sc-top"><div className="sc-icon">{k.icon}</div></div>
            <div className="sc-val" style={k.color ? { color: k.color } : {}}>{k.val}</div>
            <div className="sc-label">{k.label}</div>
            <div className="sc-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="tw afu3" style={{ marginBottom: 20 }}>
        <div className="tw-hd" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title" style={{ flex: '1 1 auto' }}>Omzetgrafiek — {CHART_PERIOD_LABELS[chartPeriod]}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="tabs">
              {CHART_PERIODS.map(p => (
                <button key={p.id} className={`tab${chartPeriod === p.id ? ' active' : ''}`} onClick={() => setChartPeriod(p.id)}>{p.label}</button>
              ))}
            </div>
            <div className="tabs">
              {CHART_MODES.map(m => (
                <button key={m.id} className={`tab${chartMode === m.id ? ' active' : ''}`} onClick={() => setChartMode(m.id)}>{m.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 480 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--dl)' }} axisLine={false} tickLine={false} interval={chartPeriod === 'maand' ? 4 : 0} />
                <YAxis
                  tickFormatter={v => v === 0 ? '€0' : `€${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: 'var(--dl)' }}
                  axisLine={false} tickLine={false} width={44}
                />
                <Tooltip
                  formatter={(v, name) => [fmt(v), CHART_MODES.find(m => m.id === chartMode)?.label || name]}
                  contentStyle={{ border: '1px solid var(--border)', borderRadius: 8, fontSize: '.8rem', boxShadow: 'none' }}
                  cursor={{ fill: 'rgba(0,0,0,.03)' }}
                />
                <Bar dataKey={chartMode} fill={chartMode === 'kosten' ? '#dc2626' : '#1DDB62'} radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── BTW-overzicht ── */}
      <div className="tw afu3" style={{ marginBottom: 20 }}>
        <div className="tw-hd" style={{ flexWrap: 'wrap', gap: 10, marginBottom: mbConnection?.apiToken ? 16 : 0 }}>
          <div>
            <div className="card-title">BTW-overzicht</div>
            {btwPerioden.find(p => p.periode_label === btwSelectedLabel)?.last_synced_at && (
              <div style={{ fontSize: '.75rem', color: 'var(--dmu)', marginTop: 2 }}>
                Laatste sync: {new Date(btwPerioden.find(p => p.periode_label === btwSelectedLabel).last_synced_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          {mbConnection?.apiToken && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="tabs">
                <button className={`tab${btwPeriodeType === 'kwartaal' ? ' active' : ''}`} onClick={() => setBtwPeriodeType('kwartaal')}>Kwartaal</button>
                <button className={`tab${btwPeriodeType === 'maand' ? ' active' : ''}`} onClick={() => setBtwPeriodeType('maand')}>Maand</button>
              </div>
              <select value={btwSelectedLabel} onChange={e => setBtwSelectedLabel(e.target.value)}>
                {generatePeriodeOpties(btwPeriodeType).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button className="btn btn-s btn-sm" onClick={handleSyncBtw} disabled={btwSyncing}>
                {btwSyncing ? 'Synchroniseren...' : 'Synchroniseer BTW'}
              </button>
            </div>
          )}
        </div>

        {!mbConnection?.apiToken ? (
          <div style={{ fontSize: '.84rem', color: 'var(--dl)', paddingTop: 4 }}>
            Verbind Moneybird om BTW-overzicht te zien.
          </div>
        ) : btwLoading ? (
          <div style={{ fontSize: '.84rem', color: 'var(--dl)', padding: '8px 0' }}>Laden...</div>
        ) : (() => {
          const p = btwPerioden.find(x => x.periode_label === btwSelectedLabel);
          if (!p) return (
            <div style={{ fontSize: '.84rem', color: 'var(--dl)', padding: '8px 16px 16px' }}>
              Geen data voor {btwSelectedLabel}. Klik "Synchroniseer BTW" om op te halen.
            </div>
          );
          const totOntvangen = (p.btw_ontvangen_21 || 0) + (p.btw_ontvangen_9 || 0);
          const totBetaald   = (p.btw_betaald_21  || 0) + (p.btw_betaald_9  || 0);
          const saldo = totOntvangen - totBetaald;
          const positief = saldo >= 0;

          const BtwKaart = ({ titel, rijen, subtotaal }) => (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--br)', borderRadius: 'var(--r8)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>{titel}</div>
              {rijen.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.85rem', padding: '4px 0' }}>
                  <span style={{ color: 'var(--dmu)' }}>{r.label}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.val)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--br)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.85rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--tx)' }}>Subtotaal</span>
                <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotaal)}</span>
              </div>
            </div>
          );

          const rijenOntvangen = [
            { label: '21% tarief', val: p.btw_ontvangen_21 || 0 },
            { label: '9% tarief',  val: p.btw_ontvangen_9  || 0 },
            ...(p.omzet_0_tarief > 0 ? [{ label: 'Omzet 0% tarief', val: p.omzet_0_tarief }] : []),
          ];
          const rijenBetaald = [
            { label: '21% tarief', val: p.btw_betaald_21 || 0 },
            { label: '9% tarief',  val: p.btw_betaald_9  || 0 },
          ];

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <BtwKaart titel="BTW Ontvangen (Verkoop)" rijen={rijenOntvangen} subtotaal={totOntvangen} />
                <BtwKaart titel="BTW Betaald (Inkoop)"    rijen={rijenBetaald}   subtotaal={totBetaald}   />
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--br)', borderRadius: 'var(--r8)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '.9rem', color: positief ? 'var(--tx)' : '#15A34A' }}>
                  {positief ? 'Te betalen aan Belastingdienst' : 'Terug te krijgen'}
                </span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums', color: positief ? 'var(--tx)' : '#15A34A' }}>
                  {fmt(Math.abs(saldo))}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="tw afu3">
        <div className="tw-hd"><div className="card-title">Per klant / opdracht</div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>Klant</th><th>Geoffreerd</th><th>Kosten</th><th>Betaald</th><th>Openstaand</th><th>Nettoresultaat</th><th>Marge</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Av name={r.name} size="sm" idx={r.av} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.84rem' }}>{r.name}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--dl)' }}>{r.city}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmt(r.total)}</td>
                  <td style={{ color: '#dc2626', fontWeight: 600 }}>{fmt(r.costs)}</td>
                  <td style={{ color: '#15A34A', fontWeight: 700 }}>{fmt(r.paid)}</td>
                  <td style={{ fontWeight: 600, color: r.total - r.paid > 0 ? '#e8784a' : 'var(--dl)' }}>{fmt(r.total - r.paid)}</td>
                  <td style={{ fontWeight: 800, color: r.profit >= 0 ? '#15A34A' : '#dc2626' }}>{fmt(r.profit)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 40, height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(0, r.margin)}%`, background: r.margin >= 30 ? '#15A34A' : r.margin >= 15 ? '#e8784a' : '#dc2626', borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: '.78rem', fontWeight: 700 }}>{r.margin}%</span>
                    </div>
                  </td>
                  <td><StatusBadge status={r.stage === 'completed' || r.stage === 'paid' ? 'completed' : 'in_progress'} /></td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--dl)', padding: 24 }}>Nog geen klantdata beschikbaar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ── TEAM ─────────────────────────────────────────────────────
export function TeamPage() {
  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Team</h1><p>Medewerkers, rollen en werklast</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm">{I.plus} Medewerker uitnodigen</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="afu2">
        {TEAM_DATA.map(m => (
          <div key={m.id} className="card card-p">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <Av name={m.name} size="xl" idx={m.id - 1} />
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-.015em' }}>{m.name}</div>
                <span className={`badge ${m.role === 'Admin' ? 'b-orange' : 'b-blue'}`}>{m.role}</span>
              </div>
            </div>
            {[
              { label: 'E-mail',            val: m.email },
              { label: 'Telefoon',          val: m.phone },
              { label: 'Uren (week)',        val: m.hoursWeek + ' uur' },
              { label: 'Toegewezen jobs',   val: m.assignedJobs },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: '.84rem' }}>
                <span style={{ color: 'var(--dl)' }}>{r.label}</span>
                <span style={{ fontWeight: 600 }}>{r.val}</span>
              </div>
            ))}
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button className="btn btn-s btn-sm" style={{ flex: 1, justifyContent: 'center' }}>{I.edit} Bewerken</button>
              {m.role !== 'Admin' && <button className="btn btn-ghost btn-sm">{I.trash}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SETTINGS ─────────────────────────────────────────────────
export function SettingsPage() {
  const [section, setSection] = useState('company');
  const sections = [
    { id: 'company',      label: 'Bedrijfsprofiel' },
    { id: 'defaults',     label: 'Standaardwaarden' },
    { id: 'templates',    label: 'E-mailtemplates' },
    { id: 'integrations', label: 'Integraties' },
    { id: 'pipeline',     label: 'Pipeline instellen' },
  ];

  return (
    <div>
      <div className="page-hd afu"><div><h1>Instellingen</h1><p>Bedrijf, templates en integraties</p></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }} className="afu2">
        <div className="card" style={{ padding: '8px 6px', height: 'fit-content' }}>
          {sections.map(s => (
            <button key={s.id} className={`sbi${section === s.id ? ' active' : ''}`} onClick={() => setSection(s.id)}>{s.label}</button>
          ))}
        </div>
        <div className="card card-p">
          {section === 'company' && (
            <>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 20 }}>Bedrijfsprofiel</div>
              <div className="fg">
                <div className="f"><label>Bedrijfsnaam</label><input defaultValue="Veldhuis Schilderwerken" /></div>
                <div className="f"><label>Branche</label><select><option>Schilder</option><option>Hovenier</option><option>Aannemer</option></select></div>
                <div className="f"><label>E-mail</label><input type="email" defaultValue="marco@veldhuis.nl" /></div>
                <div className="f"><label>Telefoon</label><input defaultValue="06-98765432" /></div>
                <div className="f s2"><label>Adres</label><input defaultValue="Keizersgracht 182, 8011 XA Zwolle" /></div>
                <div className="f"><label>KvK-nummer</label><input defaultValue="87654321" /></div>
                <div className="f"><label>BTW-nummer</label><input defaultValue="NL123456789B01" /></div>
                <div className="f"><label>IBAN</label><input defaultValue="NL91ABNA0417164300" /></div>
              </div>
              <div className="fa"><button className="btn btn-s">Annuleren</button><button className="btn btn-p">{I.check} Opslaan</button></div>
            </>
          )}
          {section === 'defaults' && (
            <>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 20 }}>Standaardwaarden</div>
              <div className="fg">
                <div className="f"><label>Uurtarief arbeid (€)</label><input type="number" defaultValue="55" /></div>
                <div className="f"><label>Reiskosten per km (€)</label><input type="number" defaultValue="0.23" /></div>
                <div className="f"><label>Standaard marge (%)</label><input type="number" defaultValue="25" /></div>
                <div className="f"><label>BTW-percentage (%)</label><select><option>21</option><option>9</option><option>0</option></select></div>
                <div className="f"><label>Geldigheidsduur offerte (dagen)</label><input type="number" defaultValue="14" /></div>
              </div>
              <div className="fa"><button className="btn btn-s">Annuleren</button><button className="btn btn-p">{I.check} Opslaan</button></div>
            </>
          )}
          {section === 'templates' && (
            <>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 20 }}>E-mailtemplates</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['Lead ontvangen','Offerte verstuurd','Offerte herinnering','Klus gepland','Betaalherinnering'].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r8)' }}>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{t}</div>
                    <button className="btn btn-s btn-xs">{I.edit} Bewerken</button>
                  </div>
                ))}
              </div>
            </>
          )}
          {section === 'integrations' && (
            <>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 20 }}>Integraties</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '16px', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r10)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    {I.google}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Google Agenda</div>
                      <div style={{ fontSize: '.76rem', color: 'var(--dmu)' }}>Synchroniseer geplande jobs en activiteiten</div>
                    </div>
                  </div>
                  <button className="btn btn-p btn-sm">Verbinden</button>
                </div>
              </div>
            </>
          )}
          {section === 'pipeline' && (
            <>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 20 }}>Pipeline stadia</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['Nieuwe lead','Contact nodig','Info compleet','Offerte maken','Offerte verstuurd','Wacht op akkoord','Akkoord','Gepland','In uitvoering','Afgerond','Betaald / Gesloten'].map((s, i) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r8)' }}>
                    <span style={{ color: 'var(--dl)', fontSize: '.72rem', fontWeight: 700, width: 20 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: '.88rem', fontWeight: 600 }}>{s}</span>
                    <button className="btn-icon">{I.edit}</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
