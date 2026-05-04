import React, { useState } from 'react';
import {
  I, CAL_EVENTS, HOURS_DATA, COSTS_DATA, TEAM_DATA, CUSTOMERS_DATA, QUOTES_DATA,
  fmt, custById, Av, StatusBadge, ModalX, Logo,
} from '../bb-shared.jsx';

// ── CALENDAR ─────────────────────────────────────────────────
export function CalendarPage({ openCustomer }) {
  const [view, setView] = useState('week');
  const [showEvent, setShowEvent] = useState(null);

  const DAYS = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  const DATES = [4, 5, 6, 7, 8, 9, 10];
  const HOURS_LIST = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];

  const MAY_2026 = [];
  const startOffset = 4;
  for (let i = 0; i < startOffset; i++) MAY_2026.push({ day: null, other: true });
  for (let d = 1; d <= 31; d++) MAY_2026.push({ day: d, other: false });
  while (MAY_2026.length % 7 !== 0) MAY_2026.push({ day: null, other: true });

  const typeLabel = t => ({ job: 'Klus', activity: 'Activiteit', visit: 'Opname' }[t] || t);

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Agenda</h1><p>Mei 2026 · Week 19</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm">{I.chev_l}</button>
          <button className="btn btn-s btn-sm">Vandaag</button>
          <button className="btn btn-s btn-sm">{I.chev_r}</button>
          <div className="tabs">
            {['day','week','month'].map(v => (
              <button key={v} className={`tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
                {v === 'day' ? 'Dag' : v === 'week' ? 'Week' : 'Maand'}
              </button>
            ))}
          </div>
          <button className="btn btn-p btn-sm">{I.plus} Toevoegen</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--r10)', marginBottom: 14, width: 'fit-content' }} className="afu2">
        {I.google}
        <span style={{ fontSize: '.8rem', color: 'var(--dmu)', fontWeight: 500 }}>Google Agenda</span>
        <span className="badge b-gray">Niet verbonden</span>
        <button className="btn btn-p btn-xs">Verbinden</button>
      </div>

      {view === 'month' && (
        <div className="afu3">
          <div className="cal-grid-month">
            {DAYS.map(d => <div key={d} className="cal-day-hdr">{d}</div>)}
            {MAY_2026.map((cell, i) => {
              const isToday = cell.day === 3;
              const dayEvts = cell.day ? CAL_EVENTS.filter(e => parseInt(e.date.split('-')[2]) === cell.day) : [];
              return (
                <div key={i} className={`cal-cell${cell.other ? ' other-month' : ''}${isToday ? ' today' : ''}`}>
                  <div className="cal-day-num">{cell.day}</div>
                  {dayEvts.slice(0, 2).map(e => (
                    <div key={e.id} className={`cal-event cal-ev-${e.type}`} style={{ background: e.color, color: e.textColor }} onClick={() => setShowEvent(e)}>
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

      {view === 'week' && (
        <div className="afu3" style={{ overflowX: 'auto' }}>
          <div className="cal-week-grid" style={{ minWidth: 700 }}>
            <div className="cal-week-hdr" style={{ borderRight: '1px solid var(--border)' }}></div>
            {DAYS.map((d, i) => (
              <div key={d} className={`cal-week-hdr${DATES[i] === 3 ? ' today-hdr' : ''}`}>
                <div>{d}</div>
                <div style={{ fontSize: '.9rem', fontWeight: DATES[i] === 3 ? 800 : 600, color: DATES[i] === 3 ? 'var(--p)' : 'var(--dk)' }}>{DATES[i]}</div>
              </div>
            ))}
            {HOURS_LIST.map(hour => (
              <React.Fragment key={hour}>
                <div className="cal-time-slot">{hour}</div>
                {DATES.map(date => {
                  const slotEvts = CAL_EVENTS.filter(e => {
                    const d = parseInt(e.date.split('-')[2]);
                    return d === date && e.time && e.time.startsWith(hour.split(':')[0]);
                  });
                  return (
                    <div key={`s-${date}-${hour}`} className="cal-slot">
                      {slotEvts.map(e => (
                        <div key={e.id} className="cal-block" style={{ background: e.color, color: e.textColor }} onClick={() => setShowEvent(e)}>
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

      {view === 'day' && (
        <div className="afu3">
          <div style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: 12, color: 'var(--dk)' }}>Zondag 3 mei 2026</div>
          <div className="card card-p">
            {CAL_EVENTS.filter(e => parseInt(e.date.split('-')[2]) === 3).length === 0
              ? <div className="empty"><div className="empty-emoji">📅</div><div className="empty-title">Geen items vandaag</div></div>
              : CAL_EVENTS.filter(e => parseInt(e.date.split('-')[2]) === 3).map(e => {
                  const c = custById(e.custId);
                  return (
                    <div key={e.id} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => setShowEvent(e)}>
                      <div style={{ width: 60, flexShrink: 0, textAlign: 'right', fontSize: '.8rem', color: 'var(--dl)', paddingTop: 3 }}>{e.time}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ width: 4, height: 32, borderRadius: 2, background: e.textColor, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{e.title}</div>
                            <div style={{ fontSize: '.76rem', color: 'var(--dmu)', marginTop: 1 }}>{typeLabel(e.type)} · {c?.name} · {c?.city}</div>
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
      )}

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
              const c = custById(showEvent.custId);
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
              <button className="btn btn-p" onClick={() => { openCustomer(showEvent.custId); setShowEvent(null); }}>Open klant</button>
            </div>
          </div>
        </div>
      )}
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
                <div style={{ height: '100%', width: `${(done / tasks.length) * 100}%`, background: 'linear-gradient(90deg,var(--p),#ffd9b3)', borderRadius: 99, transition: 'width .3s ease' }} />
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

// ── COSTS ────────────────────────────────────────────────────
export function CostsPage() {
  const total = COSTS_DATA.reduce((s, c) => s + c.amt, 0);
  const cats = [...new Set(COSTS_DATA.map(c => c.cat))];
  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Kosten</h1><p>Kosten bijhouden per klant en opdracht</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm">{I.plus} Kosten toevoegen</button>
        </div>
      </div>
      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: 'Totale kosten',    val: fmt(total) },
          { label: 'Materiaalkosten',  val: fmt(COSTS_DATA.filter(c => c.cat === 'materiaal').reduce((s, c) => s + c.amt, 0)) },
          { label: 'Arbeidskosten',    val: fmt(COSTS_DATA.filter(c => c.cat === 'arbeid').reduce((s, c) => s + c.amt, 0)) },
          { label: 'Reiskosten',       val: fmt(COSTS_DATA.filter(c => c.cat === 'reiskosten').reduce((s, c) => s + c.amt, 0)) },
        ].map((s, i) => (
          <div key={i} className="sc" style={{ padding: '16px 18px' }}>
            <div className="sc-val">{s.val}</div>
            <div className="sc-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="tw afu3">
        <div className="tw-hd">
          <div className="card-title">Kostenregels</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }}>
              <option>Alle klanten</option>{CUSTOMERS_DATA.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
            <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }}>
              <option>Alle categorieën</option>{cats.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <table className="dt">
          <thead><tr><th>Klant</th><th>Categorie</th><th>Omschrijving</th><th>Bedrag</th><th>Datum</th><th></th></tr></thead>
          <tbody>
            {COSTS_DATA.map(r => {
              const c = custById(r.custId);
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{c?.name}</td>
                  <td><span className="badge b-gray" style={{ textTransform: 'capitalize' }}>{r.cat}</span></td>
                  <td>{r.desc}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(r.amt)}</td>
                  <td style={{ color: 'var(--dl)', fontSize: '.8rem' }}>{r.date}</td>
                  <td><button className="btn-icon">{I.edit}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── REVENUE / PROFIT ─────────────────────────────────────────
export function RevenuePage() {
  const rows = CUSTOMERS_DATA.map(c => {
    const costs = COSTS_DATA.filter(x => x.custId === c.id).reduce((s, x) => s + x.amt, 0);
    const profit = c.paid - costs;
    const margin = c.paid > 0 ? Math.round((profit / c.paid) * 100) : 0;
    return { ...c, costs, profit, margin };
  });
  const totalRev    = rows.reduce((s, r) => s + r.paid, 0);
  const totalCosts  = rows.reduce((s, r) => s + r.costs, 0);
  const totalProfit = totalRev - totalCosts;
  const totalQuoted = rows.reduce((s, r) => s + r.total, 0);
  const avgMargin   = totalRev > 0 ? Math.round((totalProfit / totalRev) * 100) : 0;

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Omzet & winst</h1><p>Financieel overzicht — mei 2026</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm">Exporteren</button>
        </div>
      </div>

      <div className="profit-card afu2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.55)', marginBottom: 6 }}>NETTORESULTAAT (MEI 2026)</div>
            <div className="profit-card-val">{fmt(totalProfit)}</div>
            <div className="profit-card-label">Winst na alle kosten</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>Marge</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--p)' }}>{avgMargin}%</div>
          </div>
        </div>
        <div className="margin-bar"><div className="margin-fill" style={{ width: `${avgMargin}%` }} /></div>
        <div className="profit-row">
          {[
            { label: 'Omzet (betaald)',  val: fmt(totalRev) },
            { label: 'Totale kosten',    val: fmt(totalCosts) },
            { label: 'Open offertes',    val: fmt(totalQuoted - totalRev) },
          ].map((x, i) => (
            <div key={i} className="profit-item">
              <div className="profit-item-val">{x.val}</div>
              <div className="profit-item-label">{x.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="tw afu3">
        <div className="tw-hd"><div className="card-title">Per klant / opdracht</div></div>
        <table className="dt">
          <thead><tr><th>Klant</th><th>Geoffreerd</th><th>Kosten</th><th>Betaald</th><th>Openstaand</th><th>Winst</th><th>Marge</th><th>Status</th></tr></thead>
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
                <td style={{ color: '#059669', fontWeight: 700 }}>{fmt(r.paid)}</td>
                <td style={{ fontWeight: 600, color: r.total - r.paid > 0 ? '#e8784a' : 'var(--dl)' }}>{fmt(r.total - r.paid)}</td>
                <td style={{ fontWeight: 800, color: r.profit >= 0 ? '#059669' : '#dc2626' }}>{fmt(r.profit)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 40, height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, r.margin)}%`, background: r.margin >= 30 ? '#059669' : r.margin >= 15 ? '#e8784a' : '#dc2626', borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: '.78rem', fontWeight: 700 }}>{r.margin}%</span>
                  </div>
                </td>
                <td><StatusBadge status={r.stage === 'completed' || r.stage === 'paid' ? 'completed' : 'in_progress'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
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
