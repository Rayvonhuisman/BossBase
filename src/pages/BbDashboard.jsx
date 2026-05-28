import { useEffect, useMemo, useRef, useState } from 'react';
import { I, PIPELINE_STAGES, fmt, Av, ModalX } from '../bb-shared.jsx';
import { listDeals, listPipelineStages, updateDealStage } from '../services/dealService.js';
import { listActivities } from '../services/activityService.js';
import { listCustomers } from '../services/customerService.js';
import { createProject } from '../services/projectsService.js';
import { listNotes, createNote } from '../services/noteService.js';
import { useProfile, displayName } from '../lib/profileContext.jsx';
import { useToast } from '../lib/toast.jsx';
import { ActivityEditModal, NewLeadModal } from '../components/SharedModals.jsx';

// DashboardHome is now at src/pages/dashboard/DashboardHome.jsx
function _LegacyDashboardHome({ setPage, openCustomer }) {
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

  const actIcon = t => ({ call: I.call, email: I.mail, visit: I.map, task: I.check, follow: I.note }[t] || I.act);
  const actCls  = t => ({ call: 'call', email: 'email', visit: 'visit', task: 'task', follow: 'follow' }[t] || 'task');

  const greetName = displayName(profile, user);
  const greeting = greetName
    ? `Goedemorgen, ${greetName}`
    : profileLoading ? 'Profiel laden…' : 'Welkom bij BossBase';
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14 }} className="afu3 dash-two-col">
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

// ── MOVE STAGE SHEET (mobile bottom sheet) ───────────────────
function MoveStageSheet({ deal, stages, moveDeal, onClose, setActiveIdx }) {
  return (
    <div className="meer-overlay open" onClick={onClose}>
      <div className="meer-sheet" onClick={e => e.stopPropagation()}>
        <div className="meer-grabber"><div className="meer-grabber-bar" /></div>
        <div style={{ padding: '0 16px 4px', fontWeight: 700, fontSize: 15, color: 'var(--dk)' }}>Verplaats naar fase</div>
        <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--dl)' }}>{deal.customerName} — {deal.title}</div>
        <div className="meer-section-card" style={{ margin: '0 12px 24px' }}>
          {stages.map((s, i) => (
            <button key={s.id} className="meer-row"
              style={deal.stage === s.id ? { background: '#f0fdf4' } : {}}
              onClick={() => {
                if (deal.stage !== s.id) moveDeal(deal, s.id);
                setActiveIdx(i);
                onClose();
              }}>
              <span className={`badge ${s.col}`} style={{ fontSize: 12 }}>{s.label}</span>
              {deal.stage === s.id
                ? <span style={{ marginLeft: 'auto', fontSize: 12, color: '#15A34A', fontWeight: 700, marginRight: 4 }}>✓ Huidig</span>
                : <span className="meer-row-chev">{I.chev_r}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MOBILE PIPELINE (swipeable carousel) ─────────────────────
function MobilePipeline({ stages, dealsInStage, openCustomer, moveDeal, markLost, setNewStage, setShowNew, customers }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const tabsRef = useRef(null);

  const idx = Math.min(activeIdx, stages.length - 1);

  useEffect(() => {
    const el = tabsRef.current?.children[idx];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [idx]);

  const handleTouchStart = e => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = e => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > dy && Math.abs(dx) > 40) {
      if (dx < 0 && idx < stages.length - 1) setActiveIdx(i => i + 1);
      if (dx > 0 && idx > 0) setActiveIdx(i => i - 1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const stage = stages[idx];
  if (!stage) return null;
  const stageDeals = dealsInStage(stage.id);
  const stageTotal = stageDeals.reduce((s, d) => s + d.value, 0);

  return (
    <div className="pipe-mob afu2">
      {/* ── Stage tab pills ── */}
      <div className="pipe-mob-tabs" ref={tabsRef}>
        {stages.map((s, i) => {
          const cnt = dealsInStage(s.id).length;
          return (
            <button key={s.id} className={`pipe-mob-tab${i === idx ? ' active' : ''}`} onClick={() => setActiveIdx(i)}>
              {s.label}
              {cnt > 0 && <span className="pipe-mob-tab-cnt">{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Swipeable stage panel ── */}
      <div className="pipe-mob-panel" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Header */}
        <div className="pipe-mob-stage-hd">
          <div>
            <span className={`badge ${stage.col}`}>{stage.label}</span>
            <div className="pipe-mob-stage-meta">
              {stageDeals.length} {stageDeals.length === 1 ? 'lead' : 'leads'}
              {stageTotal > 0 && ` · ${fmt(stageTotal)}`}
            </div>
          </div>
          <div className="pipe-mob-nav">
            <button className="pipe-mob-arrow" disabled={idx === 0} onClick={() => setActiveIdx(i => i - 1)}>‹</button>
            <span className="pipe-mob-pos">{idx + 1} / {stages.length}</span>
            <button className="pipe-mob-arrow" disabled={idx === stages.length - 1} onClick={() => setActiveIdx(i => i + 1)}>›</button>
          </div>
        </div>

        {/* Dots indicator */}
        <div className="pipe-mob-dots">
          {stages.map((_, i) => (
            <span key={i} className={`pipe-mob-dot${i === idx ? ' active' : ''}`} onClick={() => setActiveIdx(i)} />
          ))}
        </div>

        {/* Deal cards */}
        <div className="pipe-mob-cards">
          {stageDeals.length === 0 && (
            <div className="pipe-mob-empty">
              <div>Geen leads in deze fase</div>
              <button className="btn btn-p btn-sm" style={{ marginTop: 14 }}
                onClick={() => { setNewStage(stage.id); setShowNew(true); }}>
                {I.plus} Lead toevoegen
              </button>
            </div>
          )}
          {stageDeals.map(deal => {
            const cust = customers?.find(c => c.id === deal.custId);
            return (
              <div key={deal.id} className="pipe-mob-card" style={{ cursor: 'pointer' }} onClick={() => openCustomer(deal.custId)}>
                <div style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--dk)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {deal.customerName || 'Klant'}
                </div>
                {deal.title && (
                  <div style={{ fontSize: '.78rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {deal.title}
                  </div>
                )}
                {cust?.email && (
                  <div style={{ fontSize: '.73rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cust.email}
                  </div>
                )}
                {cust?.phone && (
                  <div style={{ fontSize: '.73rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cust.phone}
                  </div>
                )}
                {deal.value > 0 && (
                  <div style={{ marginTop: 6, fontSize: '.82rem', fontWeight: 700, color: '#0F7A3F' }}>
                    {fmt(deal.value)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add lead to this stage */}
        <button className="pipe-mob-add" onClick={() => { setNewStage(stage.id); setShowNew(true); }}>
          {I.plus} Lead toevoegen aan {stage.label}
        </button>
      </div>

    </div>
  );
}

// ── DEAL DETAIL MODAL ────────────────────────────────────────
function DealDetailModal({ deal, stages, customers, onClose, setPage }) {
  const toast = useToast();
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMaakProject, setShowMaakProject] = useState(false);

  const customer = customers.find(c => c.id === deal.custId);
  const stage = stages.find(s => s.id === deal.stage);
  const stageOrder = stage?.order || 0;

  const orderOf = label => stages.find(s => new RegExp(`^${label}$`, 'i').test((s.label || '').trim()))?.order ?? 999;
  const offerteOrder  = orderOf('offerte maken');
  const akkoordOrder  = orderOf('akkoord');
  const geplandOrder  = orderOf('gepland');
  const afgerondOrder = orderOf('afgerond');

  const showMaakOfferte  = stageOrder >= offerteOrder  && stageOrder < orderOf('verloren');
  const showMaakProjBtn  = stageOrder >= akkoordOrder  && stageOrder < orderOf('verloren');
  const showWerkbon      = stageOrder >= geplandOrder  && stageOrder < orderOf('verloren');
  const showMaakFactuur  = stageOrder >= afgerondOrder && stageOrder < orderOf('verloren');
  const hasActions = showMaakOfferte || showMaakProjBtn || showWerkbon || showMaakFactuur;

  useEffect(() => {
    listNotes().then(all => setNotes(all.filter(n => n.dealId === deal.id))).catch(() => {});
  }, [deal.id]);

  const saveNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    setSaving(true);
    try {
      const n = await createNote({ customer_id: deal.custId || null, deal_id: deal.id, body });
      setNotes(prev => [n, ...prev]);
      setNoteText('');
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  if (showMaakProject) {
    return (
      <MaakProjectModal
        deal={deal}
        customers={customers}
        onClose={() => setShowMaakProject(false)}
        setPage={setPage}
      />
    );
  }

  const DL = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)', marginBottom: 6 };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-hd">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="modal-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deal.customerName || 'Klant'}
            </div>
            {deal.title && <div className="modal-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.title}</div>}
          </div>
          <ModalX onClose={onClose} />
        </div>

        <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stage + waarde */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {stage && <span className={`badge ${stage.col}`}>{stage.label}</span>}
            {deal.value > 0 && (
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0F7A3F' }}>{fmt(deal.value)}</span>
            )}
          </div>

          {/* Klantgegevens */}
          {customer && (customer.email || customer.phone) && (
            <div>
              <div style={DL}>Klantgegevens</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {customer.email && (
                  <a href={`mailto:${customer.email}`} style={{ fontSize: 13, color: 'var(--tx)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {I.mail} {customer.email}
                  </a>
                )}
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} style={{ fontSize: 13, color: 'var(--tx)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {I.call} {customer.phone}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Notities */}
          <div>
            <div style={DL}>Notities</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                style={{ flex: 1 }}
                value={noteText}
                placeholder="Notitie toevoegen…"
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !saving && saveNote()}
              />
              <button className="btn btn-s btn-sm" onClick={saveNote} disabled={saving || !noteText.trim()}>
                Opslaan
              </button>
            </div>
            {notes.length === 0 ? (
              <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Nog geen notities</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {notes.map(n => (
                  <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bgs)', borderRadius: 8, fontSize: 13, border: '1px solid var(--br)' }}>
                    <div style={{ color: 'var(--dk)', whiteSpace: 'pre-wrap' }}>{n.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--dl)', marginTop: 3 }}>
                      {String(n.createdAt || '').slice(0, 10)}{n.author ? ` · ${n.author}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acties */}
          {hasActions && (
            <div>
              <div style={DL}>Acties</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {showMaakOfferte && (
                  <button className="btn btn-s" onClick={() => { onClose(); setPage?.('offertes', { dealId: deal.id }); }}>
                    {I.brief} Maak offerte
                  </button>
                )}
                {showMaakProjBtn && (
                  <button className="btn btn-s" onClick={() => setShowMaakProject(true)}>
                    {I.brief} Maak project aan
                  </button>
                )}
                {showWerkbon && (
                  <button className="btn btn-s" onClick={() => { onClose(); setPage?.('werkbonnen'); }}>
                    {I.check} Nieuwe werkbon
                  </button>
                )}
                {showMaakFactuur && (
                  <button className="btn btn-s" onClick={() => { onClose(); setPage?.('facturen'); }}>
                    {I.euro} Maak factuur
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAAK PROJECT MODAL ───────────────────────────────────────
function MaakProjectModal({ deal, customers, onClose, setPage }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: deal.title || '',
    customer_id: deal.custId || '',
    project_value: deal.value || 0,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Projectnaam is verplicht'); return; }
    setSaving(true);
    try {
      const created = await createProject({
        name: form.name.trim(),
        customer_id: form.customer_id || null,
        deal_id: deal.id,
        project_value: Number(form.project_value || 0),
      });
      toast.success('Project aangemaakt');
      onClose();
      setPage?.('projecten', { id: created.id });
    } catch (e) {
      toast.error(e.message || 'Aanmaken mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Project aanmaken</div>
            <div className="modal-sub">{deal.customerName} — {deal.title}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Projectnaam *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          </div>
          <div className="f s2">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Geen —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Projectwaarde (€)</label>
            <input type="number" min="0" step="0.01" value={form.project_value} onChange={e => set('project_value', e.target.value)} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving || !form.name.trim()}>
            {saving ? 'Aanmaken...' : 'Project aanmaken'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PIPELINE ─────────────────────────────────────────────────
export function Pipeline({ openCustomer, openDeal, setPage }) {
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
  const [maakProjectDeal, setMaakProjectDeal] = useState(null);
  const [hideLost, setHideLost] = useState(() => localStorage.getItem('pipeline_hide_lost') === 'true');

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 767);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 767);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // "03 — Ghost" scroll control (from the Scrollbar Designs handoff): a thin
  // rail + proportional thumb that is dormant (track hidden, thumb ~35%) and
  // fades to full presence on hover. Native scrollbar hidden; pointer-drag the
  // thumb/track to scrub. Trackpad/mouse/touch scroll still works everywhere.
  const pipeWrapRef = useRef(null);
  const trackRef = useRef(null);
  const rafRef = useRef(0);
  const [pipeScrollable, setPipeScrollable] = useState(false);
  const [scrollPct, setScrollPct] = useState(0); // 0..1
  const [thumbPct, setThumbPct] = useState(0.2); // visible/total ratio
  const [ghostHover, setGhostHover] = useState(false);

  const syncPipeScroll = () => {
    if (rafRef.current) return; // coalesce — no setState spam per pixel
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = pipeWrapRef.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      setPipeScrollable(max > 4);
      setScrollPct(max > 0 ? el.scrollLeft / max : 0);
      setThumbPct(el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1);
    });
  };
  const scrubToPct = (pct, smooth) => {
    const el = pipeWrapRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: Math.max(0, Math.min(1, pct)) * max, behavior: smooth ? 'smooth' : 'auto' });
  };
  // Pointer maps to the thumb CENTRE so the rail tracks the cursor naturally.
  const onTrackPointerDown = e => {
    const r = trackRef.current.getBoundingClientRect();
    const tw = Math.max(thumbPct, 0.08);
    const pctFromX = cx => {
      const raw = (cx - r.left) / r.width; // 0..1 across the rail
      return (raw - tw / 2) / (1 - tw);     // account for thumb width
    };
    scrubToPct(pctFromX(e.clientX), false);
    const move = ev => scrubToPct(pctFromX(ev.clientX), false);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const nudgePipe = dx => pipeWrapRef.current?.scrollBy({ left: dx, behavior: 'smooth' });

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

  // Show every stage as a column — the board scrolls horizontally so all
  // fases stay reachable (previously capped at 8, hiding later stages).
  const SHOWN_STAGE_IDS = stages.map(s => s.id);
  const lostStageId = (stages.find(s => /verlor/i.test(s.label || '')) || stages.find(s => /\blost\b/i.test(s.label || '')))?.id;
  const toggleHideLost = () => setHideLost(v => {
    const next = !v;
    localStorage.setItem('pipeline_hide_lost', String(next));
    return next;
  });
  const visibleStages = (filter.stage === 'all'
    ? SHOWN_STAGE_IDS
    : SHOWN_STAGE_IDS.filter(id => id === filter.stage)
  );

  // Deals whose stage_id is NULL or points to a stage that no longer exists
  // must not silently disappear — funnel them into the first column so they
  // stay visible and can be dragged to a real stage.
  const stageIdSet = new Set(stages.map(s => s.id));
  const firstStageId = SHOWN_STAGE_IDS[0];
  const dealsInStage = stageId => filteredDeals.filter(d => {
    if (d.stage === stageId) return true;
    if (stageId === firstStageId && (!d.stage || !stageIdSet.has(d.stage))) return true;
    return false;
  });

  const totalShown = filteredDeals.length;
  const totalValue = filteredDeals.filter(d => d.stage !== 'lost').reduce((s, d) => s + d.value, 0);

  // deals.stage_id is a UUID column — resolve the real "Verloren" stage object
  // for use in confirmLost (lostStageId is already derived above for filtering).
  const lostStage = stages.find(s => s.id === lostStageId);

  const markLost = deal => { setLostDeal(deal); setShowLostModal(true); };
  const confirmLost = async () => {
    if (!lostStage) {
      toast.error('Geen "Verloren"-fase gevonden in de pipeline');
      setShowLostModal(false); setLostDeal(null); setLostReason('');
      return;
    }
    try {
      const updated = await updateDealStage(lostDeal.id, lostStage.id);
      setDeals(ds => ds.map(d => d.id === lostDeal.id ? updated : d));
      toast.success('Project gemarkeerd als verloren');
    } catch (err) {
      console.error('[bb:pipeline] markeer verloren mislukt', err);
      toast.error(err.message || 'Status bijwerken mislukt');
    }
    setShowLostModal(false); setLostDeal(null); setLostReason('');
  };
  const moveDeal = async (deal, stageId) => {
    try {
      const updated = await updateDealStage(deal.id, stageId);
      setDeals(ds => ds.map(d => d.id === deal.id ? updated : d));
    } catch (err) {
      console.error('[bb:pipeline] deal verplaatsen mislukt', err);
      toast.error(err.message || 'Verplaatsen mislukt');
    }
  };

  // ── Drag & drop (native HTML5, no library) ───────────────────────────────
  // The browser suppresses the click that follows a real drag, so plain
  // clicks on a card (open deal/customer) keep working while a drag moves it.
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const dragDealRef = useRef(null);

  const onCardDragStart = (e, deal) => {
    // Don't hijack drags that start on the inline controls (stage select,
    // open/lost icon buttons) — those must stay clickable.
    if (e.target.closest('button, select, input, a, .btn-icon')) {
      e.preventDefault();
      return;
    }
    dragDealRef.current = deal;
    setDraggingId(deal.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', deal.id); } catch { /* Safari */ }
  };
  const onCardDragEnd = () => {
    dragDealRef.current = null;
    setDraggingId(null);
    setDragOverStage(null);
  };
  const onColDragOver = (e, stageId) => {
    if (!dragDealRef.current) return;
    e.preventDefault(); // required so onDrop can fire
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) setDragOverStage(stageId);
  };
  const onColDragLeave = (e, stageId) => {
    // Ignore leave events caused by moving onto a child element.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverStage(s => (s === stageId ? null : s));
  };
  const onColDrop = async (e, targetStageId) => {
    e.preventDefault();
    const deal = dragDealRef.current;
    dragDealRef.current = null;
    setDraggingId(null);
    setDragOverStage(null);
    if (!deal || !targetStageId) return;
    if (deal.stage === targetStageId) return; // dropped in same stage → no-op
    const prevStage = deal.stage;
    // Optimistic: move the card immediately, reconcile/rollback after the API.
    setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: targetStageId } : d));
    try {
      const updated = await updateDealStage(deal.id, targetStageId);
      setDeals(ds => ds.map(d => d.id === deal.id ? updated : d));
    } catch (err) {
      console.error('[bb:pipeline] drag-verplaatsen mislukt', err);
      toast.error(err.message || 'Verplaatsen mislukt');
      setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: prevStage } : d));
    }
  };

  const resetFilter = () => setFilter({ stage: 'all', status: 'open', priority: 'all', text: '' });
  const filterActive = filter.stage !== 'all' || filter.status !== 'open' || filter.priority !== 'all' || filter.text;

  const onSaved = () => {
    bumpRefresh?.();
    reload();
  };

  // Re-measure the scroll range whenever the rendered board can change.
  useEffect(() => {
    const id = requestAnimationFrame(syncPipeScroll);
    window.addEventListener('resize', syncPipeScroll);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', syncPipeScroll); };
  }, [deals, stages, filter, isMobile, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {!loading && !error && totalShown > 0 && isMobile && (
        <MobilePipeline
          stages={filter.stage === 'all' ? stages : stages.filter(s => s.id === filter.stage)}
          dealsInStage={dealsInStage}
          openCustomer={openCustomer}
          moveDeal={moveDeal}
          markLost={markLost}
          setNewStage={setNewStage}
          setShowNew={setShowNew}
          customers={customers}
        />
      )}

      {!loading && !error && totalShown > 0 && !isMobile && (
        <div
          className={`pipe-ghost-zone${ghostHover ? ' is-hover' : ''}`}
          onMouseEnter={() => setGhostHover(true)}
          onMouseLeave={() => setGhostHover(false)}
        >
        {pipeScrollable && (
          <div className="pipe-ghost afu2">
            <div
              ref={trackRef}
              className="pipe-ghost-track"
              onPointerDown={onTrackPointerDown}
              role="scrollbar"
              aria-orientation="horizontal"
              aria-label="Pipeline horizontaal scrollen"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(scrollPct * 100)}
              tabIndex={0}
              onFocus={() => setGhostHover(true)}
              onBlur={() => setGhostHover(false)}
              onKeyDown={e => {
                if (e.key === 'ArrowRight') { e.preventDefault(); nudgePipe(320); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); nudgePipe(-320); }
                else if (e.key === 'Home') { e.preventDefault(); scrubToPct(0, true); }
                else if (e.key === 'End') { e.preventDefault(); scrubToPct(1, true); }
              }}
            >
              <div
                className="pipe-ghost-thumb"
                style={{
                  width: `${Math.max(thumbPct * 100, 8)}%`,
                  left: `${scrollPct * (100 - Math.max(thumbPct * 100, 8))}%`,
                }}
              />
            </div>
          </div>
        )}
        <div className="pipe-wrap afu2" ref={pipeWrapRef} onScroll={syncPipeScroll}>
        <div className="pipe-board">
        {visibleStages.map(stageId => {
          const stage = stages.find(s => s.id === stageId) || PIPELINE_STAGES.find(s => s.id === stageId) || { id: stageId, label: stageId, col: 'b-gray' };
          const stageDeals = dealsInStage(stageId);
          if (hideLost && stageId === lostStageId) {
            return (
              <div key={stageId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', width: 36, minWidth: 36, flexShrink: 0, paddingTop: 10, cursor: 'pointer', opacity: 0.5 }}
                title="Verloren tonen"
                onClick={toggleHideLost}>
                {I.eye_off}
                <span style={{ writingMode: 'vertical-rl', fontSize: '.7rem', color: 'var(--dl)', marginTop: 8, letterSpacing: 1 }}>Verloren</span>
              </div>
            );
          }
          return (
            <div key={stageId}
              className={`pipe-col${dragOverStage === stageId ? ' pipe-col-drop' : ''}`}
              onDragOver={e => onColDragOver(e, stageId)}
              onDragLeave={e => onColDragLeave(e, stageId)}
              onDrop={e => onColDrop(e, stageId)}>
              <div className="pipe-col-hd">
                <div>
                  <span className={`badge ${stage.col}`} style={{ marginBottom: 2 }}>{stage.label}</span>
                  <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginTop: 3 }}>
                    {fmt(stageDeals.reduce((s, d) => s + d.value, 0))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pipe-col-cnt">{stageDeals.length}</span>
                  {stageId === lostStageId && (
                    <button
                      className="btn-icon"
                      style={{ opacity: 0.5, lineHeight: 1 }}
                      title="Verloren kolom verbergen"
                      onClick={e => { e.stopPropagation(); toggleHideLost(); }}
                    >{I.eye}</button>
                  )}
                </div>
              </div>
              <div className="pipe-cards">
                {stageDeals.map(deal => {
                  const cust = customers.find(c => c.id === deal.custId);
                  return (
                    <div key={deal.id}
                      className={`pc${draggingId === deal.id ? ' pc-dragging' : ''}`}
                      style={{ cursor: 'pointer' }}
                      draggable
                      onDragStart={e => onCardDragStart(e, deal)}
                      onDragEnd={onCardDragEnd}
                      onClick={() => openCustomer(deal.custId)}>
                      <div style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--dk)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {deal.customerName || 'Klant'}
                      </div>
                      {deal.title && (
                        <div style={{ fontSize: '.78rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                          {deal.title}
                        </div>
                      )}
                      {cust?.email && (
                        <div style={{ fontSize: '.73rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cust.email}
                        </div>
                      )}
                      {cust?.phone && (
                        <div style={{ fontSize: '.73rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cust.phone}
                        </div>
                      )}
                      {deal.value > 0 && (
                        <div style={{ marginTop: 6, fontSize: '.82rem', fontWeight: 700, color: '#0F7A3F' }}>
                          {fmt(deal.value)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {stageDeals.length === 0 && (
                  <div style={{ fontSize: '.74rem', color: 'var(--dl)', textAlign: 'center', padding: '12px 6px' }}>Geen items</div>
                )}
              </div>
              <button className="pipe-add" onClick={() => { setNewStage(stageId); setShowNew(true); }}>{I.plus} Lead toevoegen</button>
            </div>
          );
        })}
        </div>
        </div>
        </div>
      )}

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
      {maakProjectDeal && (
        <MaakProjectModal
          deal={maakProjectDeal}
          customers={customers}
          onClose={() => setMaakProjectDeal(null)}
          setPage={setPage}
        />
      )}
    </div>
  );
}
