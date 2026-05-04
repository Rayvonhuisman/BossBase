import { useState } from 'react';
import { I, DEALS, ACTIVITIES_DATA, QUOTES_DATA, PIPELINE_STAGES, fmt, custById, Av, StatusBadge, ModalX } from '../bb-shared.jsx';

// ── DASHBOARD HOME ───────────────────────────────────────────
export function DashboardHome({ setPage, openCustomer }) {
  const todayActs = ACTIVITIES_DATA.filter(a => a.status === 'today' || a.status === 'overdue');
  const openQuotes = QUOTES_DATA.filter(q => q.status === 'sent');
  const newLeads = DEALS.filter(d => d.stage === 'new_lead');

  const actIcon = t => ({ call: '📞', email: '✉️', visit: '🏠', task: '✅', follow: '📋' }[t] || '📌');
  const actCls  = t => ({ call: 'call', email: 'email', visit: 'visit', task: 'task', follow: 'follow' }[t] || 'task');

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1>Goedemorgen, Marco 👋</h1>
          <p>Zondag 3 mei 2026 · Veldhuis Schilderwerken</p>
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm">{I.cal} Week 18</button>
          <button className="btn btn-p btn-sm" onClick={() => setPage('pipeline')}>{I.plus} Nieuwe lead</button>
        </div>
      </div>

      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { icon: I.brief, val: '€21.400', label: 'Open offertewaarde',  trend: '+12%', up: true },
          { icon: I.euro,  val: '€34.500', label: 'Geaccepteerde omzet', trend: '+8%',  up: true },
          { icon: I.clock, val: '€12.600', label: 'Openstaand betaling', trend: '—',    up: null },
          { icon: I.trend, val: '62%',     label: 'Gemiddelde marge',    trend: '+4%',  up: true },
        ].map((s, i) => (
          <div key={i} className="sc">
            <div className="sc-top">
              <div className="sc-icon">{s.icon}</div>
              {s.up !== null
                ? <span className={`trend ${s.up ? 'trend-up' : 'trend-dn'}`}>{I.trend} {s.trend}</span>
                : <span className="trend trend-neu">—</span>}
            </div>
            <div className="sc-val">{s.val}</div>
            <div className="sc-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14 }} className="afu3">
        {/* Today's actions */}
        <div className="card">
          <div className="card-hd">
            <div>
              <div className="card-title">Acties voor vandaag</div>
              <div className="card-sub">{todayActs.length} items vragen je aandacht</div>
            </div>
            <button className="btn btn-s btn-sm" onClick={() => setPage('activities')}>Alle activiteiten</button>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {todayActs.map(a => {
              const c = custById(a.custId);
              return (
                <div key={a.id} className="act-item">
                  <div className={`act-icon ${actCls(a.type)}`}>{actIcon(a.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="act-title">{a.title}</div>
                    <div className="act-meta">
                      <span className="act-cust" style={{ cursor: 'pointer' }} onClick={() => openCustomer(a.custId)}>
                        {c?.name}
                      </span>
                      <span>·</span>
                      <span>{a.time}</span>
                      {a.status === 'overdue' && <span className="badge b-overdue" style={{ fontSize: '.65rem' }}>Te laat</span>}
                    </div>
                  </div>
                  <div className="act-actions">
                    <button className="btn btn-s btn-xs">Gereed</button>
                    <button className="btn btn-ghost btn-xs">Verzet</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* New leads */}
          <div className="card">
            <div className="card-hd">
              <div className="card-title">Nieuwe leads</div>
              <button className="btn btn-ghost btn-xs" onClick={() => setPage('pipeline')}>{I.arrow_r}</button>
            </div>
            <div style={{ padding: '4px 14px 10px' }}>
              {newLeads.map(d => {
                const c = custById(d.custId);
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => openCustomer(d.custId)}>
                    <Av name={c?.name || '?'} size="sm" idx={c?.av || 0} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--dk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.name}</div>
                      <div style={{ fontSize: '.73rem', color: 'var(--dl)' }}>{d.title} · {d.city}</div>
                    </div>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--pd)', flexShrink: 0 }}>{fmt(d.value)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Open quotes */}
          <div className="card">
            <div className="card-hd">
              <div className="card-title">Offertes opvolgen</div>
              <button className="btn btn-ghost btn-xs" onClick={() => setPage('quotes')}>{I.arrow_r}</button>
            </div>
            <div style={{ padding: '4px 14px 10px' }}>
              {openQuotes.map(q => {
                const c = custById(q.custId);
                return (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.82rem', color: 'var(--dk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.name}</div>
                      <div style={{ fontSize: '.73rem', color: 'var(--dl)' }}>Geldig t/m {q.valid}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '.82rem', fontWeight: 700 }}>{fmt(q.amount)}</span>
                      <StatusBadge status={q.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PIPELINE ─────────────────────────────────────────────────
export function Pipeline({ openCustomer }) {
  const [deals, setDeals] = useState(DEALS);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostDeal, setLostDeal] = useState(null);
  const [lostReason, setLostReason] = useState('');

  const LOST_REASONS = [
    'Te duur','Geen reactie','Ander bedrijf gekozen','Datum niet mogelijk',
    'Buiten werkgebied','Klus te klein','Klus te groot','Klant geannuleerd',
    'Informatie ontbreekt','Anders',
  ];

  const SHOWN_STAGES = ['new_lead','contact','quote_make','quote_sent','approved','planned','in_progress','completed'];

  const dealsInStage = stageId => deals.filter(d => d.stage === stageId);

  const markLost = deal => { setLostDeal(deal); setShowLostModal(true); };
  const confirmLost = () => {
    setDeals(ds => ds.map(d => d.id === lostDeal.id ? { ...d, stage: 'lost' } : d));
    setShowLostModal(false); setLostDeal(null); setLostReason('');
  };

  const prioColor = p => ({ high: '#dc2626', med: '#e8784a', low: '#9ca3af' }[p] || '#9ca3af');

  return (
    <div style={{ height: '100%' }}>
      <div className="page-hd afu">
        <div>
          <h1>Pipeline</h1>
          <p>{deals.filter(d => d.stage !== 'lost').length} actieve trajecten · {fmt(deals.filter(d => d.stage !== 'lost').reduce((s, d) => s + d.value, 0))} totaal</p>
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm">{I.flag} Filter</button>
          <button className="btn btn-p btn-sm">{I.plus} Nieuwe lead</button>
        </div>
      </div>

      <div className="pipe-wrap afu2">
        {SHOWN_STAGES.map(stageId => {
          const stage = PIPELINE_STAGES.find(s => s.id === stageId);
          const stageDeals = dealsInStage(stageId);
          return (
            <div key={stageId} className="pipe-col">
              <div className="pipe-col-hd">
                <div>
                  <span className={`badge ${stage.col}`} style={{ marginBottom: 2 }}>{stage.label}</span>
                  <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginTop: 3 }}>
                    {fmt(stageDeals.reduce((s, d) => s + d.value, 0))}
                  </div>
                </div>
                <span className="pipe-col-cnt">{stageDeals.length}</span>
              </div>
              <div className="pipe-cards">
                {stageDeals.map(deal => {
                  const cust = custById(deal.custId);
                  return (
                    <div key={deal.id} className={`pc${deal.priority === 'high' ? ' highlight' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                          <Av name={cust?.name || '?'} size="sm" idx={cust?.av || 0} />
                          <div style={{ minWidth: 0 }}>
                            <div className="pc-name" style={{ cursor: 'pointer' }} onClick={() => openCustomer(deal.custId)}>{cust?.name}</div>
                          </div>
                        </div>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: prioColor(deal.priority), flexShrink: 0, marginTop: 4 }} title={`Prioriteit: ${deal.priority}`} />
                      </div>
                      <div className="pc-job">{I.map} <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.title}</span></div>
                      <div style={{ fontSize: '.73rem', color: 'var(--dl)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        {I.map} {deal.city}
                      </div>
                      <div className="pc-meta">
                        <span className="pc-amount">{fmt(deal.value)}</span>
                        <span className="pc-date">{deal.nextDate}</span>
                      </div>
                      {deal.nextAct && (
                        <div style={{ marginTop: 8, padding: '5px 8px', background: 'var(--bgs)', borderRadius: 'var(--r6)', fontSize: '.72rem', color: 'var(--dmu)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: 'var(--p)' }}>→</span> {deal.nextAct}
                        </div>
                      )}
                      <div className="pc-foot">
                        <div className="pc-icons">
                          {deal.notes > 0 && <span title={`${deal.notes} notities`} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '.68rem' }}>{I.note} {deal.notes}</span>}
                          {deal.files > 0 && <span title={`${deal.files} bestanden`} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '.68rem' }}>{I.paperclip} {deal.files}</span>}
                          {deal.acts > 0 && <span title={`${deal.acts} activiteiten`} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '.68rem' }}>{I.act} {deal.acts}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" style={{ width: 22, height: 22 }} title="Open klant" onClick={() => openCustomer(deal.custId)}>{I.eye}</button>
                          <button className="btn-icon" style={{ width: 22, height: 22, color: '#dc2626' }} title="Markeer verloren" onClick={() => markLost(deal)}>{I.x}</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="pipe-add">{I.plus} Lead toevoegen</button>
            </div>
          );
        })}
      </div>

      {showLostModal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowLostModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-hd">
              <div>
                <div className="modal-title">Markeer als verloren</div>
                <div className="modal-sub">{custById(lostDeal?.custId)?.name} — {lostDeal?.title}</div>
              </div>
              <ModalX onClose={() => setShowLostModal(false)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="f" style={{ marginBottom: 10 }}><label>Reden van verlies</label></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {LOST_REASONS.map(r => (
                  <button key={r}
                    className={`trade-option${lostReason === r ? ' selected' : ''}`}
                    style={{ fontSize: '.78rem', padding: '8px 10px' }}
                    onClick={() => setLostReason(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div className="f">
              <label>Toelichting (optioneel)</label>
              <textarea placeholder="Eventuele extra informatie..." style={{ height: 60 }} />
            </div>
            <div className="fa">
              <button className="btn btn-s" onClick={() => setShowLostModal(false)}>Annuleren</button>
              <button className="btn btn-danger" onClick={confirmLost}>Markeer verloren</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
