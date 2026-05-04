import { useState } from 'react';
import {
  I, CUSTOMERS_DATA, DEALS, ACTIVITIES_DATA, QUOTES_DATA, COSTS_DATA,
  fmt, custById, stageLabel, stageCol, Av, StatusBadge, ModalX,
} from '../bb-shared.jsx';

// ── CUSTOMER DETAIL DRAWER ───────────────────────────────────
export function CustomerPage({ custId, onClose, setPage }) {
  const [tab, setTab] = useState('overview');
  const c = CUSTOMERS_DATA.find(x => x.id === custId);
  if (!c) return null;

  const cDeals  = DEALS.filter(d => d.custId === custId);
  const cQuotes = QUOTES_DATA.filter(q => q.custId === custId);
  const cActs   = ACTIVITIES_DATA.filter(a => a.custId === custId);
  const cCosts  = COSTS_DATA.filter(x => x.custId === custId);
  const totalCosts = cCosts.reduce((s, x) => s + x.amt, 0);
  const profit = c.paid - totalCosts;
  const margin = c.paid > 0 ? Math.round((profit / c.paid) * 100) : 0;

  const TABS = ['overview','timeline','activities','quotes','costs','notes'];
  const TAB_LABELS = { overview: 'Overzicht', timeline: 'Tijdlijn', activities: 'Activiteiten', quotes: 'Offertes', costs: 'Kosten', notes: 'Notities' };

  const TIMELINE = [
    { label: 'Lead aangemaakt',     date: '8 apr 2026',  note: 'Via website formulier',                     filled: true },
    { label: 'Eerste contact',      date: '9 apr 2026',  note: 'Gebeld — interesse bevestigd',              filled: true },
    { label: 'Opname gedaan',       date: '14 apr 2026', note: 'Locatie bekeken, maatwerk besproken',       filled: true },
    { label: 'Offerte aangemaakt',  date: '18 apr 2026', note: `${cQuotes[0]?.id || 'BB-001'} — ${fmt(cQuotes[0]?.amount || 0)}`, filled: true },
    { label: 'Offerte verstuurd',   date: '20 apr 2026', note: 'Per e-mail naar klant',                     filled: true },
    { label: 'Offerte bekeken',     date: '21 apr 2026', note: 'Klant heeft de offerte geopend',            filled: cQuotes[0]?.status !== 'draft' },
    { label: 'Offerte geaccepteerd',date: cQuotes[0]?.status === 'accepted' ? '23 apr 2026' : '—', note: 'Online akkoord gegeven', filled: cQuotes[0]?.status === 'accepted' },
    { label: 'Job gepland',         date: ['planned','in_progress','completed'].includes(c.stage) ? '28 apr 2026' : '—', note: 'Ingepland via agenda', filled: ['planned','in_progress','completed'].includes(c.stage) },
    { label: 'Uitvoering gestart',  date: ['in_progress','completed'].includes(c.stage) ? '30 apr 2026' : '—', note: 'Werkbon geopend door medewerker', filled: ['in_progress','completed'].includes(c.stage) },
    { label: 'Job afgerond',        date: c.stage === 'completed' ? '3 mei 2026' : '—', note: 'Werkbon gesloten, uren geregistreerd', filled: c.stage === 'completed' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <Av name={c.name} size="xl" idx={c.av} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h2 style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-.025em' }}>{c.name}</h2>
            <span className={`badge ${stageCol(c.stage)}`}>{stageLabel(c.stage)}</span>
            <span className={`badge ${c.type === 'Zakelijk' ? 'b-blue' : 'b-gray'}`}>{c.type}</span>
          </div>
          <div style={{ fontSize: '.82rem', color: 'var(--dmu)', marginBottom: 10 }}>{c.company} · {c.city}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a href={`tel:${c.phone}`} className="btn btn-s btn-sm">{I.call} {c.phone}</a>
            <a href={`mailto:${c.email}`} className="btn btn-s btn-sm">{I.mail} E-mail</a>
            <button className="btn btn-s btn-sm">{I.act} Activiteit</button>
            <button className="btn btn-p btn-sm">{I.quotes} Offerte</button>
          </div>
        </div>
        {onClose && <button className="drawer-x" onClick={onClose}>{I.x}</button>}
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Totaal geoffreerd', val: fmt(c.total) },
          { label: 'Betaald',           val: fmt(c.paid),    green: c.paid > 0 },
          { label: 'Totale kosten',     val: fmt(totalCosts) },
          { label: 'Winst',             val: fmt(profit),    green: profit > 0, red: profit < 0 },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r10)', padding: '12px 14px' }}>
            <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginBottom: 4, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-.02em', color: s.green ? '#059669' : s.red ? '#dc2626' : 'var(--dk)' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{TAB_LABELS[t]}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card card-p">
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 14 }}>Klantgegevens</div>
            {[
              { label: 'Telefoon', val: c.phone },
              { label: 'E-mail',   val: c.email },
              { label: 'Stad',     val: c.city },
              { label: 'Type',     val: c.type },
              { label: 'Bron',     val: c.source },
              { label: 'Pipeline', val: stageLabel(c.stage) },
            ].map((r, i) => (
              <div key={i} className="cust-info-row">
                <span className="cust-info-label">{r.label}</span>
                <span className="cust-info-val">{r.val}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="card card-p">
              <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 10 }}>Openstaande activiteit</div>
              {cActs.filter(a => a.status !== 'done').slice(0, 2).map(a => (
                <div key={a.id} className="act-item" style={{ paddingTop: 0 }}>
                  <div className="act-icon visit" style={{ fontSize: '.85rem' }}>
                    {({ call: '📞', email: '✉️', visit: '🏠', task: '✅', follow: '📋' })[a.type]}
                  </div>
                  <div>
                    <div className="act-title">{a.title}</div>
                    <div className="act-meta">{a.date} · {a.time}</div>
                  </div>
                </div>
              ))}
              {cActs.filter(a => a.status !== 'done').length === 0 && (
                <div style={{ fontSize: '.8rem', color: 'var(--dl)' }}>Geen openstaande activiteiten</div>
              )}
            </div>
            <div className="card card-p">
              <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 10 }}>Laatste offerte</div>
              {cQuotes.slice(0, 1).map(q => (
                <div key={q.id}>
                  <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 4 }}>{q.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusBadge status={q.status} />
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--dk)' }}>{fmt(q.amount)}</span>
                  </div>
                </div>
              ))}
              {cQuotes.length === 0 && <div style={{ fontSize: '.8rem', color: 'var(--dl)' }}>Nog geen offertes</div>}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {tab === 'timeline' && (
        <div className="card card-p">
          <div className="tl">
            {TIMELINE.map((item, i) => (
              <div key={i} className="tl-item">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 18 }}>
                  <div className={`tl-dot${item.filled ? ' filled' : ''}`} />
                  {i < TIMELINE.length - 1 && <div className="tl-line" />}
                </div>
                <div className="tl-content">
                  <div className="tl-label" style={{ color: item.filled ? 'var(--dk)' : 'var(--dl)' }}>{item.label}</div>
                  <div className="tl-date">{item.date}</div>
                  {item.note && <div className="tl-note">{item.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activities */}
      {tab === 'activities' && (
        <div className="card card-p">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Activiteiten</div>
            <button className="btn btn-p btn-xs">{I.plus} Toevoegen</button>
          </div>
          {cActs.length > 0 ? cActs.map(a => (
            <div key={a.id} className="act-item">
              <div className="act-icon visit" style={{ fontSize: '.85rem' }}>
                {({ call: '📞', email: '✉️', visit: '🏠', task: '✅', follow: '📋' })[a.type]}
              </div>
              <div style={{ flex: 1 }}>
                <div className="act-title">{a.title}</div>
                <div className="act-meta"><span>{a.date}</span><span>·</span><span>{a.time}</span><StatusBadge status={a.status} /></div>
              </div>
              <button className="btn btn-s btn-xs">Gereed</button>
            </div>
          )) : <div className="empty"><div className="empty-emoji">📋</div><div className="empty-title">Geen activiteiten</div></div>}
        </div>
      )}

      {/* Quotes */}
      {tab === 'quotes' && (
        <div className="tw">
          <div className="tw-hd">
            <div className="card-title">Offertes</div>
            <button className="btn btn-p btn-xs">{I.plus} Nieuwe offerte</button>
          </div>
          <table className="dt">
            <thead><tr><th>#</th><th>Omschrijving</th><th>Bedrag</th><th>Datum</th><th>Status</th></tr></thead>
            <tbody>
              {cQuotes.map(q => (
                <tr key={q.id}>
                  <td style={{ color: 'var(--dl)', fontWeight: 600 }}>{q.id}</td>
                  <td>{q.title}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(q.amount)}</td>
                  <td style={{ color: 'var(--dl)' }}>{q.date}</td>
                  <td><StatusBadge status={q.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {cQuotes.length === 0 && <div className="empty"><div className="empty-emoji">📄</div><div className="empty-title">Geen offertes</div></div>}
        </div>
      )}

      {/* Costs */}
      {tab === 'costs' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Totale kosten',    val: fmt(totalCosts) },
              { label: 'Omzet (betaald)',  val: fmt(c.paid) },
              { label: 'Winst / marge',    val: `${fmt(profit)} (${margin}%)`, green: profit > 0 },
            ].map((s, i) => (
              <div key={i} className="sc" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: s.green ? '#059669' : 'var(--dk)' }}>{s.val}</div>
              </div>
            ))}
          </div>
          <div className="tw">
            <div className="tw-hd">
              <div className="card-title">Kostenregels</div>
              <button className="btn btn-p btn-xs">{I.plus} Kosten toevoegen</button>
            </div>
            <table className="dt">
              <thead><tr><th>Categorie</th><th>Omschrijving</th><th>Bedrag</th><th>Datum</th></tr></thead>
              <tbody>
                {cCosts.map(r => (
                  <tr key={r.id}>
                    <td><span className="badge b-gray" style={{ textTransform: 'capitalize' }}>{r.cat}</span></td>
                    <td>{r.desc}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(r.amt)}</td>
                    <td style={{ color: 'var(--dl)' }}>{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {tab === 'notes' && (
        <div className="card card-p">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Interne notities</div>
            <button className="btn btn-p btn-xs">{I.plus} Notitie</button>
          </div>
          {[
            { date: '1 mei 2026',   author: 'Marco', note: 'Klant wil graag vóór 20 mei alles afgerond hebben vanwege verblijf buitenland.' },
            { date: '28 apr 2026', author: 'Marco', note: 'Offerte met extra korting verstuurd na verzoek. Klant vergelijkt nog met een andere offerte.' },
          ].map((n, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: '.82rem' }}>{n.author}</span>
                <span style={{ fontSize: '.73rem', color: 'var(--dl)' }}>{n.date}</span>
              </div>
              <div style={{ fontSize: '.85rem', color: 'var(--dm)', lineHeight: 1.55 }}>{n.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CUSTOMERS LIST ───────────────────────────────────────────
export function CustomersPage({ openCustomer }) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');
  const filtered = CUSTOMERS_DATA.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Klanten</h1><p>{CUSTOMERS_DATA.length} klanten in je CRM</p></div>
        <div className="page-hd-actions">
          <div className="tabs">
            <button className={`tab${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>Kaarten</button>
            <button className={`tab${view === 'table' ? ' active' : ''}`} onClick={() => setView('table')}>Tabel</button>
          </div>
          <button className="btn btn-p btn-sm">{I.plus} Nieuwe klant</button>
        </div>
      </div>
      <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
        <div className="search" style={{ minWidth: 0, maxWidth: 360 }}>
          {I.search}
          <input placeholder="Zoek op naam of bedrijf…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }} className="afu2">
          {filtered.map(c => {
            const costs = COSTS_DATA.filter(x => x.custId === c.id).reduce((s, x) => s + x.amt, 0);
            return (
              <div key={c.id} className="card card-p" style={{ cursor: 'pointer', transition: 'all .18s ease' }}
                onClick={() => openCustomer(c.id)}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(255,151,100,.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = ''; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Av name={c.name} size="lg" idx={c.av} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{c.name}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--dmu)' }}>{c.company}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '.78rem', color: 'var(--dmu)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{I.mail} {c.email}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{I.map} {c.city}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div>
                    <div style={{ fontSize: '.68rem', color: 'var(--dl)' }}>Geoffreerd</div>
                    <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{fmt(c.total)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '.68rem', color: 'var(--dl)' }}>Betaald</div>
                    <div style={{ fontWeight: 700, fontSize: '.88rem', color: c.paid > 0 ? '#059669' : 'var(--dk)' }}>{fmt(c.paid)}</div>
                  </div>
                  <span className={`badge ${stageCol(c.stage)}`} style={{ fontSize: '.65rem' }}>{stageLabel(c.stage)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tw afu2">
          <table className="dt">
            <thead><tr><th>Klant</th><th>Bedrijf</th><th>Stad</th><th>Pipeline</th><th>Totaal</th><th>Betaald</th><th></th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openCustomer(c.id)}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Av name={c.name} size="sm" idx={c.av} /><span style={{ fontWeight: 600 }}>{c.name}</span></div></td>
                  <td style={{ color: 'var(--dmu)' }}>{c.company}</td>
                  <td>{c.city}</td>
                  <td><span className={`badge ${stageCol(c.stage)}`}>{stageLabel(c.stage)}</span></td>
                  <td style={{ fontWeight: 700 }}>{fmt(c.total)}</td>
                  <td style={{ fontWeight: 700, color: '#059669' }}>{fmt(c.paid)}</td>
                  <td><button className="btn-icon" onClick={e => { e.stopPropagation(); openCustomer(c.id); }}>{I.arrow_r}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ACTIVITIES ───────────────────────────────────────────────
export function ActivitiesPage({ openCustomer }) {
  const [filter, setFilter] = useState('all');
  const [acts, setActs] = useState(ACTIVITIES_DATA);

  const filters = [
    { id: 'all',     label: 'Alle' },
    { id: 'today',   label: 'Vandaag' },
    { id: 'overdue', label: 'Te laat' },
    { id: 'open',    label: 'Open' },
  ];

  const filtered = filter === 'all' ? acts : acts.filter(a => a.status === filter);
  const actIcon = t => ({ call: '📞', email: '✉️', visit: '🏠', task: '✅', follow: '📋' }[t] || '📌');
  const markDone = id => setActs(as => as.map(a => a.id === id ? { ...a, status: 'done' } : a));

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Activiteiten</h1><p>{acts.filter(a => a.status !== 'done').length} openstaande acties</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm">{I.plus} Nieuwe activiteit</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }} className="afu2">
        <div className="tabs">
          {filters.map(f => (
            <button key={f.id} className={`tab${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.id !== 'all' && (
                <span style={{ marginLeft: 5, background: f.id === 'overdue' ? '#fef2f2' : '#f3f4f6', color: f.id === 'overdue' ? '#dc2626' : 'var(--dl)', fontSize: '.65rem', padding: '1px 5px', borderRadius: 'var(--r999)', fontWeight: 700 }}>
                  {acts.filter(a => a.status === f.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="tw afu3">
        <div className="tw-hd">
          <div className="card-title">Activiteiten</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }}>
              <option>Alle medewerkers</option>
              <option>Marco</option>
              <option>Remco</option>
            </select>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty"><div className="empty-emoji">✅</div><div className="empty-title">Geen activiteiten</div><div className="empty-sub">Alles bijgewerkt!</div></div>
        ) : (
          <div style={{ padding: '0 4px' }}>
            {filtered.map(a => {
              const c = custById(a.custId);
              const isDone = a.status === 'done';
              return (
                <div key={a.id} className="act-item" style={{ opacity: isDone ? .5 : 1, padding: '12px 14px' }}>
                  <div className="act-icon visit" style={{ background: { call: '#eff6ff', email: '#ecfdf5', visit: 'var(--pll)', task: '#f5f3ff', follow: '#fff4ec' }[a.type] || '#f3f4f6', fontSize: '.9rem', flexShrink: 0 }}>
                    {actIcon(a.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="act-title" style={{ textDecoration: isDone ? 'line-through' : 'none' }}>{a.title}</div>
                    <div className="act-meta">
                      <span className="act-cust" style={{ cursor: 'pointer' }} onClick={() => openCustomer(a.custId)}>{c?.name}</span>
                      <span>·</span><span>{a.date}</span><span>·</span><span>{a.time}</span>
                      <span>·</span><span style={{ fontSize: '.72rem' }}>{a.assignee}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span className={`badge ${a.status === 'overdue' ? 'b-overdue' : a.status === 'today' ? 'b-today' : a.status === 'done' ? 'b-done' : 'b-gray'}`}>
                      {a.status === 'overdue' ? 'Te laat' : a.status === 'today' ? 'Vandaag' : a.status === 'done' ? 'Gereed' : 'Open'}
                    </span>
                    {!isDone && <button className="btn btn-s btn-xs" onClick={() => markDone(a.id)}>{I.check} Gereed</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── QUOTES ───────────────────────────────────────────────────
export function QuotesPage({ openCustomer }) {
  const [quotes, setQuotes] = useState(QUOTES_DATA);
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);

  const tabs = [
    { id: 'all', label: 'Alle' }, { id: 'draft', label: 'Concept' },
    { id: 'sent', label: 'Verzonden' }, { id: 'accepted', label: 'Geaccepteerd' }, { id: 'declined', label: 'Afgewezen' },
  ];
  const filtered = filter === 'all' ? quotes : quotes.filter(q => q.status === filter);

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Offertes</h1><p>{quotes.length} offertes · {fmt(quotes.reduce((s, q) => s + q.amount, 0))} totaal</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>{I.plus} Nieuwe offerte</button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }} className="afu2">
        <div className="tabs">
          {tabs.map(t => (
            <button key={t.id} className={`tab${filter === t.id ? ' active' : ''}`} onClick={() => setFilter(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="tw afu3">
        <table className="dt">
          <thead><tr><th>#</th><th>Klant</th><th>Omschrijving</th><th>Bedrag</th><th>Gemaakt</th><th>Geldig t/m</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map(q => {
              const c = custById(q.custId);
              return (
                <tr key={q.id}>
                  <td style={{ color: 'var(--dl)', fontWeight: 700 }}>{q.id}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }} onClick={() => openCustomer(q.custId)}>
                      <Av name={c?.name || '?'} size="sm" idx={c?.av || 0} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.84rem', color: 'var(--dk)' }}>{c?.name}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--dl)' }}>{c?.company}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ maxWidth: 200 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{q.title}</div></td>
                  <td style={{ fontWeight: 700 }}>{fmt(q.amount)}</td>
                  <td style={{ color: 'var(--dl)', fontSize: '.8rem' }}>{q.date}</td>
                  <td style={{ color: 'var(--dl)', fontSize: '.8rem' }}>{q.valid}</td>
                  <td><StatusBadge status={q.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button className="btn-icon" title="Bekijk">{I.eye}</button>
                      <button className="btn-icon" title="Bewerk">{I.edit}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal modal-wide">
            <div className="modal-hd">
              <div><div className="modal-title">Nieuwe offerte</div><div className="modal-sub">BossBase maakt een concept — controleer altijd vóór verzenden.</div></div>
              <ModalX onClose={() => setShowNew(false)} />
            </div>
            <div className="fg">
              <div className="f s2"><label>Klant</label>
                <select><option>— Selecteer klant —</option>{CUSTOMERS_DATA.map(c => <option key={c.id}>{c.name}</option>)}</select>
              </div>
              <div className="f s2"><label>Omschrijving opdracht</label><textarea placeholder="Beschrijf de werkzaamheden..." /></div>
              <div className="f"><label>Arbeidsuren (× €55)</label><input type="number" placeholder="0" /></div>
              <div className="f"><label>Materiaalkosten</label><input type="number" placeholder="€0" /></div>
              <div className="f"><label>Reiskosten</label><input type="number" placeholder="€0" /></div>
              <div className="f"><label>Marge (%)</label><input type="number" defaultValue="25" /></div>
              <div className="f"><label>BTW (%)</label><select><option>21%</option><option>9%</option><option>0%</option></select></div>
              <div className="f"><label>Geldig t/m</label><input type="date" /></div>
            </div>
            <div style={{ background: 'var(--pll)', border: '1px solid rgba(255,151,100,.2)', borderRadius: 'var(--r8)', padding: '10px 14px', marginTop: 14, fontSize: '.8rem', color: 'var(--pd)', fontWeight: 600 }}>
              ✦ BossBase stelt automatisch een concepttotaal voor. Controleer alle regels voordat je verstuurt.
            </div>
            <div className="fa">
              <button className="btn btn-s" onClick={() => setShowNew(false)}>Annuleren</button>
              <button className="btn btn-p">Concept aanmaken →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
