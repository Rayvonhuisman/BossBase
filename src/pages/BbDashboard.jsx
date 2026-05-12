import { useEffect, useMemo, useState } from 'react';
import { I, PIPELINE_STAGES, fmt, Av, ModalX } from '../bb-shared.jsx';
import { listDeals, listPipelineStages, updateDealStage } from '../services/dealService.js';
import { listActivities } from '../services/activityService.js';
import { listCustomers } from '../services/customerService.js';
import { useProfile, displayName } from '../lib/profileContext.jsx';
import { useToast } from '../lib/toast.jsx';
import { NewLeadModal, ActivityEditModal } from '../components/SharedModals.jsx';

// ── DASHBOARD HOME ───────────────────────────────────────────
export function DashboardHome({ setPage, openCustomer }) {
  const { profile, user, company, loading: profileLoading, requestNewLead, requestNewActivity, refreshKey } = useProfile();
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editAct, setEditAct] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([listDeals(), listActivities(), listCustomers()])
      .then(([dealData, activityData, customerData]) => {
        if (!alive) return;
        setDeals(dealData);
        setActivities(activityData);
        setCustomers(customerData);
        setError('');
      })
      .catch(err => alive && setError(err.message || 'Dashboard laden is mislukt.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshKey]);

  const today = new Date().toISOString().slice(0, 10);
  const todayActs = activities.filter(a =>
    a.status !== 'completed' && a.status !== 'done' &&
    (a.dueAt?.slice(0, 10) === today || a.status === 'today' || a.status === 'overdue')
  ).slice(0, 6);
  const newLeads = deals.filter(d => d.stage === 'new_lead').slice(0, 6);
  const openValue = deals.filter(d => !['lost', 'completed', 'paid'].includes(d.stage)).reduce((s, d) => s + d.value, 0);
  const acceptedValue = deals.filter(d => ['approved', 'planned', 'in_progress', 'completed', 'paid'].includes(d.stage)).reduce((s, d) => s + d.value, 0);
  const customerById = id => customers.find(c => c.id === id);

  const actIcon = t => ({ call: '📞', email: '✉️', visit: '🏠', task: '✅', follow: '📋' }[t] || '📌');
  const actCls  = t => ({ call: 'call', email: 'email', visit: 'visit', task: 'task', follow: 'follow' }[t] || 'task');

  const greetName = displayName(profile, user);
  const greeting = greetName
    ? `Goedemorgen, ${greetName} 👋`
    : profileLoading ? 'Profiel laden…' : 'Welkom bij BossBase 👋';
  const todayStr = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const subline = company?.name
    ? `${todayStr} · ${company.name}`
    : (profile?.email || user?.email)
      ? `${todayStr} · ${profile?.email || user?.email}`
      : todayStr;

  return (
    <>
    <div>
      <div className="page-hd afu">
        <div>
          <h1>{greeting}</h1>
          <p>{subline}</p>
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm" onClick={() => requestNewActivity?.()}>{I.act} Nieuwe activiteit</button>
          <button className="btn btn-p btn-sm" onClick={() => requestNewLead?.()}>{I.plus} Nieuwe lead</button>
        </div>
      </div>

      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { icon: I.brief, val: fmt(openValue), label: 'Open pipelinewaarde',  trend: 'Live', up: true },
          { icon: I.euro,  val: fmt(acceptedValue), label: 'Geaccepteerde waarde', trend: 'Live',  up: true },
          { icon: I.clock, val: todayActs.length, label: 'Acties vandaag', trend: '—',    up: null },
          { icon: I.trend, val: customers.length, label: 'Klanten',    trend: 'Live',  up: true },
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
        {loading && <div className="card card-p">Dashboard laden...</div>}
        {error && <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>}
        {!loading && !error && <div className="card">
          <div className="card-hd">
            <div>
              <div className="card-title">Acties voor vandaag</div>
              <div className="card-sub">{todayActs.length} items vragen je aandacht</div>
            </div>
            <button className="btn btn-s btn-sm" onClick={() => setPage('activities')}>Alle activiteiten</button>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {todayActs.map(a => {
              const c = customerById(a.custId);
              return (
                <div key={a.id} className="act-item" style={{ cursor: 'pointer' }} onClick={() => setEditAct(a)}>
                  <div className={`act-icon ${actCls(a.type)}`}>{actIcon(a.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="act-title">{a.title}</div>
                    <div className="act-meta">
                      <span className="act-cust" style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); openCustomer(a.custId); }}>
                        {c?.name}
                      </span>
                      <span>·</span>
                      <span>{a.time}</span>
                      {a.status === 'overdue' && <span className="badge b-overdue" style={{ fontSize: '.65rem' }}>Te laat</span>}
                    </div>
                  </div>
                  <div className="act-actions">
                    <button className="btn btn-s btn-xs" onClick={e => { e.stopPropagation(); setEditAct(a); }}>Open</button>
                  </div>
                </div>
              );
            })}
            {todayActs.length === 0 && <div className="empty"><div className="empty-title">Geen acties vandaag</div></div>}
          </div>
        </div>}

        {!loading && !error && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">Nieuwe leads</div>
              <button className="btn btn-ghost btn-xs" onClick={() => setPage('pipeline')}>{I.arrow_r}</button>
            </div>
            <div style={{ padding: '4px 14px 10px' }}>
              {newLeads.map(d => {
                const c = customerById(d.custId);
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => openCustomer(d.custId)}>
                    <Av name={c?.name || '?'} size="sm" idx={c?.av || 0} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--dk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.name || 'Onbekende klant'}</div>
                      <div style={{ fontSize: '.73rem', color: 'var(--dl)' }}>{d.title}{d.city ? ` · ${d.city}` : ''}</div>
                    </div>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--pd)', flexShrink: 0 }}>{fmt(d.value)}</div>
                  </div>
                );
              })}
              {newLeads.length === 0 && <div className="empty"><div className="empty-title">Geen nieuwe leads</div></div>}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">Actieve deals</div>
              <button className="btn btn-ghost btn-xs" onClick={() => setPage('pipeline')}>{I.arrow_r}</button>
            </div>
            <div style={{ padding: '4px 14px 10px' }}>
              {deals.filter(d => !['lost', 'completed', 'paid'].includes(d.stage)).slice(0, 5).map(d => {
                const c = customerById(d.custId);
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.82rem', color: 'var(--dk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.name || d.customerName}</div>
                      <div style={{ fontSize: '.73rem', color: 'var(--dl)' }}>{d.title}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '.82rem', fontWeight: 700 }}>{fmt(d.value)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>}
      </div>
    </div>
    {editAct && (
      <ActivityEditModal
        activity={editAct}
        customers={customers}
        deals={deals}
        onClose={() => setEditAct(null)}
        onSaved={updated => setActivities(acts => acts.map(a => a.id === updated.id ? updated : a))}
        onDeleted={id => setActivities(acts => acts.filter(a => a.id !== id))}
      />
    )}
    </>
  );
}

// ── PIPELINE ─────────────────────────────────────────────────
export function Pipeline({ openCustomer }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const [deals, setDeals] = useState([]);
  const [stages, setStages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showLostModal, setShowLostModal] = useState(false);
  const [lostDeal, setLostDeal] = useState(null);
  const [lostReason, setLostReason] = useState('');

  const [showFilter, setShowFilter] = useState(false);
  const [filter, setFilter] = useState({ stage: 'all', status: 'open', priority: 'all', text: '' });

  const [showNew, setShowNew] = useState(false);
  const [newStage, setNewStage] = useState(null);

  const LOST_REASONS = [
    'Te duur','Geen reactie','Ander bedrijf gekozen','Datum niet mogelijk',
    'Buiten werkgebied','Klus te klein','Klus te groot','Klant geannuleerd',
    'Informatie ontbreekt','Anders',
  ];

  const reload = () => {
    setLoading(true);
    Promise.all([listDeals(), listPipelineStages(), listCustomers()])
      .then(([dealData, stageData, customerData]) => {
        setDeals(dealData);
        setStages(stageData.length ? stageData : PIPELINE_STAGES);
        setCustomers(customerData);
        setError('');
      })
      .catch(err => setError(err.message || 'Pipeline laden is mislukt.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [refreshKey]);

  const closedStages = ['lost', 'completed', 'paid'];

  const filteredDeals = useMemo(() => {
    const text = filter.text.trim().toLowerCase();
    return deals.filter(d => {
      if (filter.stage !== 'all' && d.stage !== filter.stage) return false;
      if (filter.priority !== 'all' && d.priority !== filter.priority) return false;
      if (filter.status === 'open'   && closedStages.includes(d.stage)) return false;
      if (filter.status === 'won'    && !['approved', 'planned', 'in_progress', 'completed', 'paid'].includes(d.stage)) return false;
      if (filter.status === 'lost'   && d.stage !== 'lost') return false;
      if (filter.status === 'done'   && !['completed', 'paid'].includes(d.stage)) return false;
      if (text) {
        const hay = `${d.title || ''} ${d.customerName || ''} ${d.city || ''}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
  }, [deals, filter]);

  const SHOWN_STAGE_IDS = stages.map(s => s.id).slice(0, 8);
  const visibleStages = filter.stage === 'all'
    ? SHOWN_STAGE_IDS
    : SHOWN_STAGE_IDS.filter(id => id === filter.stage);

  const dealsInStage = stageId => filteredDeals.filter(d => d.stage === stageId);

  const totalShown = filteredDeals.length;
  const totalValue = filteredDeals.filter(d => d.stage !== 'lost').reduce((s, d) => s + d.value, 0);

  const markLost = deal => { setLostDeal(deal); setShowLostModal(true); };
  const confirmLost = async () => {
    try {
      const updated = await updateDealStage(lostDeal.id, 'lost');
      setDeals(ds => ds.map(d => d.id === lostDeal.id ? updated : d));
      toast.success('Deal gemarkeerd als verloren');
    } catch (err) {
      toast.error(err.message || 'Status bijwerken mislukt');
    }
    setShowLostModal(false); setLostDeal(null); setLostReason('');
  };
  const moveDeal = async (deal, stageId) => {
    try {
      const updated = await updateDealStage(deal.id, stageId);
      setDeals(ds => ds.map(d => d.id === deal.id ? updated : d));
    } catch (err) {
      toast.error(err.message || 'Verplaatsen mislukt');
    }
  };

  const prioColor = p => ({ high: '#dc2626', med: '#e8784a', low: '#9ca3af' }[p] || '#9ca3af');
  const resetFilter = () => setFilter({ stage: 'all', status: 'open', priority: 'all', text: '' });
  const filterActive = filter.stage !== 'all' || filter.status !== 'open' || filter.priority !== 'all' || filter.text;

  const onSaved = () => {
    bumpRefresh?.();
    reload();
  };

  return (
    <div style={{ height: '100%' }}>
      <div className="page-hd afu">
        <div>
          <h1>Pipeline</h1>
          <p>{totalShown} {totalShown === 1 ? 'traject' : 'trajecten'} · {fmt(totalValue)} totaal</p>
        </div>
        <div className="page-hd-actions">
          <button className={`btn btn-s btn-sm${showFilter ? ' active' : ''}`} onClick={() => setShowFilter(s => !s)}>
            {I.flag} Filter{filterActive ? ' (actief)' : ''}
          </button>
          <button className="btn btn-p btn-sm" onClick={() => { setNewStage(null); setShowNew(true); }}>{I.plus} Nieuwe lead</button>
        </div>
      </div>

      {showFilter && (
        <div className="pipe-filter afu2">
          <div className="pf-group">
            <label>Pipeline fase</label>
            <select value={filter.stage} onChange={e => setFilter(f => ({ ...f, stage: e.target.value }))}>
              <option value="all">Alle fases</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="pf-group">
            <label>Status</label>
            <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
              <option value="open">Open trajecten</option>
              <option value="won">Gewonnen</option>
              <option value="done">Afgerond / betaald</option>
              <option value="lost">Verloren</option>
              <option value="any">Alles tonen</option>
            </select>
          </div>
          <div className="pf-group">
            <label>Prioriteit</label>
            <select value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}>
              <option value="all">Alle</option>
              <option value="high">Hoog</option>
              <option value="med">Normaal</option>
              <option value="low">Laag</option>
            </select>
          </div>
          <div className="pf-group" style={{ minWidth: 200, flex: 1 }}>
            <label>Zoeken (titel / klant / plaats)</label>
            <input value={filter.text} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} placeholder="bv. badkamer, Jansen..." />
          </div>
          <div className="pf-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={resetFilter}>Reset filters</button>
        </div>
      )}

      {loading && <div className="card card-p">Pipeline laden...</div>}
      {error && <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>}

      {!loading && !error && totalShown === 0 && (
        <div className="pipe-empty afu3">
          <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--dk)' }}>Geen trajecten gevonden</div>
          <div style={{ fontSize: '.86rem', marginBottom: 14 }}>
            {filterActive ? 'Pas je filter aan of voeg een nieuwe lead toe.' : 'Begin met je eerste lead.'}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {filterActive && <button className="btn btn-s btn-sm" onClick={resetFilter}>Reset filter</button>}
            <button className="btn btn-p btn-sm" onClick={() => { setNewStage(null); setShowNew(true); }}>{I.plus} Nieuwe lead</button>
          </div>
        </div>
      )}

      {!loading && !error && totalShown > 0 && <div className="pipe-wrap afu2">
        {visibleStages.map(stageId => {
          const stage = stages.find(s => s.id === stageId) || PIPELINE_STAGES.find(s => s.id === stageId) || { id: stageId, label: stageId, col: 'b-gray' };
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
                {stageDeals.map(deal => (
                  <div key={deal.id} className={`pc${deal.priority === 'high' ? ' highlight' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                        <Av name={deal.customerName || '?'} size="sm" idx={0} />
                        <div style={{ minWidth: 0 }}>
                          <div className="pc-name" style={{ cursor: 'pointer' }} onClick={() => openCustomer(deal.custId)}>{deal.customerName || 'Klant'}</div>
                        </div>
                      </div>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: prioColor(deal.priority), flexShrink: 0, marginTop: 4 }} title={`Prioriteit: ${deal.priority}`} />
                    </div>
                    <div className="pc-job">{I.map} <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.title}</span></div>
                    {deal.city && <div style={{ fontSize: '.73rem', color: 'var(--dl)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      {I.map} {deal.city}
                    </div>}
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
                        <select className="btn btn-s btn-xs" value={deal.stage} onChange={e => moveDeal(deal, e.target.value)}>
                          {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                        <button className="btn-icon" style={{ width: 22, height: 22 }} title="Open klant" onClick={() => openCustomer(deal.custId)}>{I.eye}</button>
                        <button className="btn-icon" style={{ width: 22, height: 22, color: '#dc2626' }} title="Markeer verloren" onClick={() => markLost(deal)}>{I.x}</button>
                      </div>
                    </div>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div style={{ fontSize: '.74rem', color: 'var(--dl)', textAlign: 'center', padding: '12px 6px' }}>Geen items</div>
                )}
              </div>
              <button className="pipe-add" onClick={() => { setNewStage(stageId); setShowNew(true); }}>{I.plus} Lead toevoegen</button>
            </div>
          );
        })}
      </div>}

      {showLostModal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowLostModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-hd">
              <div>
                <div className="modal-title">Markeer als verloren</div>
                <div className="modal-sub">{lostDeal?.customerName || 'Klant'} — {lostDeal?.title}</div>
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

      {showNew && (
        <NewLeadModal
          onClose={() => setShowNew(false)}
          customers={customers}
          stages={stages}
          defaultStage={newStage || ''}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
