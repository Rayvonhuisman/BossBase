import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Edit2, Maximize2, Minimize2, X } from 'lucide-react';
import {
  I, CUSTOMERS_DATA, DEALS, ACTIVITIES_DATA, QUOTES_DATA, COSTS_DATA,
  fmt, custById, stageLabel, stageCol, Av, StatusBadge, ModalX,
} from '../bb-shared.jsx';
import { createCustomer, deleteCustomer, getCustomer, listCustomers, updateCustomer } from '../services/customerService.js';
import { updateContactInMoneybird } from '../services/accountingService.js';
import { buildDueAt, createActivity, listActivities, updateActivity } from '../services/activityService.js';
import { createNote, listNotes } from '../services/noteService.js';
import { listJobCosts } from '../services/jobCostService.js';
import { listDeals } from '../services/dealService.js';
import { getOffertes } from '../services/offerteService.js';
import { getFacturen } from '../services/factuurService.js';
import { createProject, getProjects } from '../services/projectsService.js';
import { NewOfferteModal } from './OffertesPage.jsx';
import { NewFactuurModal } from './FacturenPage.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { ActivityEditModal, NewActivityModal, NewCustomerModal, NewJobCostModal } from '../components/SharedModals.jsx';

// Customer form keeps friendly UI fields; service-layer maps to real DB columns.
// `type` and `source` are local-only display state for now (no DB columns yet).
const emptyCustomerForm = { name: '', company: '', email: '', phone: '', city: '', address: '', postcode: '', kvkNumber: '', btwNumber: '', iban: '', type: 'Zakelijk', source: 'Handmatig', notes: '' };

// ── CUSTOMER DETAIL DRAWER ───────────────────────────────────
export function CustomerPage({ custId, onClose, setPage }) {
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [c, setCustomer] = useState(null);
  const [cActs, setActs] = useState([]);
  const [cNotes, setNotes] = useState([]);
  const [cCosts, setCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingField, setEditingField] = useState(null);
  const [fieldDraft, setFieldDraft] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [activityTitle, setActivityTitle] = useState('');
  const [savingActivity, setSavingActivity] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [selectedAct, setSelectedAct] = useState(null);
  const [mbSyncing, setMbSyncing] = useState(false);
  const [cOffertes, setOffertes] = useState([]);
  const [cFacturen, setFacturen] = useState([]);
  const [cProjecten, setProjecten] = useState([]);
  const [klantgegevensOpen, setKlantgegevensOpen] = useState(false);
  const [showNewOfferte, setShowNewOfferte] = useState(false);
  const [showNewFactuur, setShowNewFactuur] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => localStorage.getItem('customer_fullscreen') === 'true');
  const [sbWidth, setSbWidth] = useState(232);

  useEffect(() => {
    const el = document.querySelector('.sb');
    if (el) setSbWidth(el.offsetWidth);
  }, []);

  useEffect(() => {
    const drawer = document.querySelector('.drawer');
    if (!drawer) return;
    if (fullscreen) {
      drawer.style.setProperty('--fs-left', `${sbWidth}px`);
      drawer.classList.add('klant-fullscreen');
    } else {
      drawer.classList.remove('klant-fullscreen');
      drawer.style.removeProperty('--fs-left');
    }
    return () => {
      const d = document.querySelector('.drawer');
      if (d) {
        d.classList.remove('klant-fullscreen');
        d.style.removeProperty('--fs-left');
      }
    };
  }, [fullscreen, sbWidth]);

  const toggleFullscreen = () => {
    const next = !fullscreen;
    if (next) {
      const el = document.querySelector('.sb');
      if (el) setSbWidth(el.offsetWidth);
    }
    setFullscreen(next);
    localStorage.setItem('customer_fullscreen', String(next));
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getCustomer(custId), listActivities(), listNotes(custId), listJobCosts(),
      getOffertes().catch(() => []), getFacturen().catch(() => []), getProjects().catch(() => []),
    ])
    .then(([customer, activities, notes, costs, allOffertes, allFacturen, allProjecten]) => {
      if (!alive) return;
      setCustomer(customer);
      setActs(activities.filter(a => a.custId === custId));
      setNotes(notes);
      setCosts(costs.filter(x => x.custId === custId));
      setOffertes(allOffertes.filter(o => o.customerId === custId));
      setFacturen(allFacturen.filter(f => f.customerId === custId));
      setProjecten(allProjecten.filter(p => p.customerId === custId));
      setError('');
    })
    .catch(err => alive && setError(err.message || 'Klant laden is mislukt.'))
    .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [custId]);

  if (loading) return <div className="card card-p">Klant laden...</div>;
  if (error) return <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>;
  if (!c) return null;

  const cDeals  = [];
  const cQuotes = [];
  const totalCosts = cCosts.reduce((s, x) => s + x.amt, 0);
  const profit = c.paid - totalCosts;
  const margin = c.paid > 0 ? Math.round((profit / c.paid) * 100) : 0;
  const startEdit = (key) => { setEditingField(key); setFieldDraft(c[key] || ''); };
  const cancelEdit = () => { setEditingField(null); setFieldDraft(''); };
  const saveField = async (key) => {
    setSavingField(true);
    try {
      const saved = await updateCustomer(c.id, { ...c, [key]: fieldDraft });
      setCustomer(saved);
      setEditingField(null);
      setFieldDraft('');
      toast.success('Opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingField(false);
    }
  };
  const addActivity = async () => {
    if (!activityTitle.trim()) return;
    setSavingActivity(true);
    try {
      const created = await createActivity({ title: activityTitle, customer_id: c.id, type: 'task', completed: false, due_at: buildDueAt(new Date().toISOString().slice(0, 10)) });
      setActs(a => [created, ...a]);
      setActivityTitle('');
      toast.success('Activiteit toegevoegd');
    } catch (err) {
      toast.error(err.message || 'Activiteit opslaan mislukt');
    } finally {
      setSavingActivity(false);
    }
  };
  const addNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const created = await createNote({ customer_id: c.id, body: noteText });
      setNotes(n => [created, ...n]);
      setNoteText('');
      toast.success('Notitie toegevoegd');
    } catch (err) {
      toast.error(err.message || 'Notitie opslaan mislukt');
    } finally {
      setSavingNote(false);
    }
  };
  const reloadActivities = async () => {
    try {
      const activities = await listActivities();
      setActs(activities.filter(a => a.custId === custId));
    } catch { /* ignore */ }
  };
  const reloadCosts = async () => {
    try {
      const costs = await listJobCosts();
      setCosts(costs.filter(x => x.custId === custId));
    } catch { /* ignore */ }
  };

  const addProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setSavingProject(true);
    try {
      const created = await createProject({ name, customer_id: c.id });
      setProjecten(ps => [created, ...ps]);
      setNewProjectName('');
      setShowNewProject(false);
      toast.success('Project aangemaakt');
    } catch (err) {
      toast.error(err.message || 'Aanmaken mislukt');
    } finally {
      setSavingProject(false);
    }
  };

  const syncWithMoneybird = async () => {
    setMbSyncing(true);
    try {
      const result = await updateContactInMoneybird(c.id);
      if (result?.success) {
        setCustomer(prev => ({ ...prev, moneybirdId: result.moneybird_id }));
        toast.success('Klant gesynchroniseerd met Moneybird');
      } else {
        toast.error(result?.error || 'Sync mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Sync mislukt');
    } finally {
      setMbSyncing(false);
    }
  };

  const TABS = ['overview', 'timeline', 'quotes', 'costs', 'facturen'];
  const TAB_LABELS = { overview: 'Overzicht', timeline: 'Tijdlijn', quotes: 'Offertes', costs: 'Kosten', facturen: 'Facturen' };

  const TIMELINE = [
    { label: 'Lead aangemaakt',     date: '8 apr 2026',  note: 'Via website formulier',                     filled: true },
    { label: 'Eerste contact',      date: '9 apr 2026',  note: 'Gebeld — interesse bevestigd',              filled: true },
    { label: 'Opname gedaan',       date: '14 apr 2026', note: 'Locatie bekeken, maatwerk besproken',       filled: true },
    { label: 'Offerte aangemaakt',  date: '18 apr 2026', note: `${cOffertes[0]?.nummer || 'BB-001'} — ${fmt(cOffertes[0]?.totaalIncl || 0)}`, filled: true },
    { label: 'Offerte verstuurd',   date: '20 apr 2026', note: 'Per e-mail naar klant',                     filled: true },
    { label: 'Offerte bekeken',     date: '21 apr 2026', note: 'Klant heeft de offerte geopend',            filled: cOffertes[0]?.status !== 'concept' },
    { label: 'Offerte geaccepteerd',date: cOffertes[0]?.status === 'geaccepteerd' ? '23 apr 2026' : '—', note: 'Online akkoord gegeven', filled: cOffertes[0]?.status === 'geaccepteerd' },
    { label: 'Job gepland',         date: ['planned','in_progress','completed'].includes(c.stage) ? '28 apr 2026' : '—', note: 'Ingepland via agenda', filled: ['planned','in_progress','completed'].includes(c.stage) },
    { label: 'Uitvoering gestart',  date: ['in_progress','completed'].includes(c.stage) ? '30 apr 2026' : '—', note: 'Werkbon geopend door medewerker', filled: ['in_progress','completed'].includes(c.stage) },
    { label: 'Job afgerond',        date: c.stage === 'completed' ? '3 mei 2026' : '—', note: 'Werkbon gesloten, uren geregistreerd', filled: c.stage === 'completed' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <button
          className="btn-icon"
          style={{ flexShrink: 0, marginTop: 2, color: 'var(--dl)' }}
          onClick={toggleFullscreen}
          title={fullscreen ? 'Kleiner weergeven' : 'Volledig scherm'}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <Av name={c.name} size="xl" idx={c.av} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h2 style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-.025em' }}>{c.name}</h2>
            <span className={`badge ${stageCol(c.stage)}`}>{stageLabel(c.stage)}</span>
            <span className={`badge ${c.type === 'Zakelijk' ? 'b-blue' : 'b-gray'}`}>{c.type}</span>
          </div>
          <div style={{ fontSize: '.82rem', color: 'var(--dmu)', marginBottom: 10 }}>{c.company} · {c.city}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.phone && <a href={`tel:${c.phone}`} className="btn btn-s btn-sm">{I.call} {c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}`} className="btn btn-s btn-sm">{I.mail} E-mail</a>}
            <button className="btn btn-s btn-sm" onClick={() => setShowActivityModal(true)}>{I.act} Activiteit</button>
            <button className="btn btn-s btn-sm" onClick={() => setShowCostModal(true)}>{I.costs} Kosten</button>
            <button className="btn btn-s btn-sm" onClick={() => setPage('customers')}>{I.arrow_r} Overzicht</button>
            {c.moneybirdId ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.75rem', color: '#059669', fontWeight: 600, padding: '4px 8px', background: '#d1fae5', borderRadius: 6 }}>
                {I.check} Gesynchroniseerd met Moneybird
              </span>
            ) : (
              <button className="btn btn-s btn-sm" onClick={syncWithMoneybird} disabled={mbSyncing}>
                {mbSyncing ? 'Synchroniseren...' : 'Sync met Moneybird'}
              </button>
            )}
          </div>
        </div>
        {fullscreen && onClose && <button className="drawer-x" onClick={onClose}>{I.x}</button>}
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

      {/* Klantgegevens — collapsible, outside tabs */}
      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setKlantgegevensOpen(o => !o)}
        >
          <div style={{ fontWeight: 700, fontSize: '.9rem', flex: 1 }}>Klantgegevens</div>
          <Edit2 size={14} style={{ color: 'var(--dl)', flexShrink: 0 }} />
          {klantgegevensOpen ? <ChevronDown size={16} style={{ color: 'var(--dl)', flexShrink: 0 }} /> : <ChevronRight size={16} style={{ color: 'var(--dl)', flexShrink: 0 }} />}
        </div>
        {klantgegevensOpen && (
          <div style={{ marginTop: 12 }}>
            {[
              { key: 'name',      label: 'Naam',        type: 'input' },
              { key: 'email',     label: 'E-mail',      type: 'input' },
              { key: 'phone',     label: 'Telefoon',    type: 'input' },
              { key: 'address',   label: 'Adres',       type: 'input' },
              { key: 'postcode',  label: 'Postcode',    type: 'input' },
              { key: 'city',      label: 'Stad',        type: 'input' },
              { key: 'kvkNumber', label: 'KvK-nummer',  type: 'input' },
              { key: 'btwNumber', label: 'BTW-nummer',  type: 'input' },
              { key: 'iban',      label: 'IBAN',        type: 'input' },
              { key: 'type',      label: 'Type',        type: 'select', options: ['Particulier', 'Bedrijf', 'VvE', 'Aannemer'] },
              { key: 'source',    label: 'Bron',        type: 'input' },
            ].map(field => {
              const isActive = editingField === field.key;
              return (
                <div key={field.key} className="cust-info-row" style={{ alignItems: 'center' }}>
                  <span className="cust-info-label">{field.label}</span>
                  {isActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                      {field.type === 'select' ? (
                        <select value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} style={{ flex: 1, fontSize: '.82rem', padding: '2px 4px' }}>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          autoFocus
                          value={fieldDraft}
                          onChange={e => setFieldDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveField(field.key); if (e.key === 'Escape') cancelEdit(); }}
                          style={{ flex: 1, fontSize: '.82rem', padding: '2px 6px' }}
                        />
                      )}
                      <button onClick={() => saveField(field.key)} disabled={savingField} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#059669', display: 'flex', alignItems: 'center', padding: 2 }}>
                        <Check size={14} />
                      </button>
                      <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                      <span className="cust-info-val" style={{ flex: 1, color: c[field.key] ? undefined : 'var(--dl)' }}>
                        {c[field.key] || '—'}
                      </span>
                      <button onClick={() => startEdit(field.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2, flexShrink: 0 }}>
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{TAB_LABELS[t]}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Basisgegevens compact */}
          <div className="card card-p">
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 10 }}>Basisgegevens</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '.85rem' }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              {c.phone && (
                <a href={`tel:${c.phone}`} style={{ color: 'var(--tx)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {I.call} {c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} style={{ color: 'var(--tx)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {I.mail} {c.email}
                </a>
              )}
            </div>
          </div>

          {/* Activiteiten */}
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Activiteiten</div>
              <button className="btn-icon" title="Activiteit toevoegen" onClick={() => setShowActivityModal(true)} style={{ fontSize: 18, lineHeight: 1 }}>+</button>
            </div>
            {cActs.length === 0 && <div style={{ fontSize: '.8rem', color: 'var(--dl)' }}>Geen activiteiten</div>}
            {cActs.map(a => (
              <div key={a.id} className="act-item" style={{ cursor: 'pointer' }} onClick={() => setSelectedAct(a)}>
                <div className="act-icon visit" style={{ fontSize: '.85rem' }}>
                  {({ call: I.call, email: I.mail, visit: I.map, task: I.check, follow: I.note })[a.type] || I.act}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="act-title">{a.title}</div>
                  <div className="act-meta"><span>{a.date}</span><span>·</span><span>{a.time}</span><StatusBadge status={a.status} /></div>
                </div>
                <button className="btn btn-s btn-xs" onClick={e => { e.stopPropagation(); setSelectedAct(a); }}>Open</button>
              </div>
            ))}
          </div>

          {/* Offertes */}
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Offertes</div>
              <button className="btn-icon" title="Offerte toevoegen" onClick={() => setShowNewOfferte(true)} style={{ fontSize: 18, lineHeight: 1 }}>+</button>
            </div>
            {cOffertes.length === 0 && <div style={{ fontSize: '.8rem', color: 'var(--dl)' }}>Geen offertes</div>}
            {cOffertes.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--dl)', fontSize: '.75rem' }}>{o.nummer}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.omschrijving || '—'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontWeight: 700 }}>{fmt(o.totaalIncl)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </div>
            ))}
          </div>

          {/* Facturen */}
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Facturen</div>
              <button className="btn-icon" title="Factuur toevoegen" onClick={() => setShowNewFactuur(true)} style={{ fontSize: 18, lineHeight: 1 }}>+</button>
            </div>
            {cFacturen.length === 0 && <div style={{ fontSize: '.8rem', color: 'var(--dl)' }}>Geen facturen</div>}
            {cFacturen.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--dl)', fontSize: '.75rem' }}>{f.nummer}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.notities || '—'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontWeight: 700 }}>{fmt(f.totaalIncl)}</span>
                  <StatusBadge status={f.status} />
                </div>
              </div>
            ))}
          </div>

          {/* Projecten */}
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Projecten</div>
              <button className="btn-icon" title="Project toevoegen" onClick={() => setShowNewProject(true)} style={{ fontSize: 18, lineHeight: 1 }}>+</button>
            </div>
            {showNewProject && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  style={{ flex: 1 }}
                  placeholder="Projectnaam..."
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') addProject(); if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName(''); } }}
                />
                <button className="btn btn-p btn-xs" disabled={savingProject || !newProjectName.trim()} onClick={addProject}>Aanmaken</button>
                <button className="btn btn-ghost btn-xs" onClick={() => { setShowNewProject(false); setNewProjectName(''); }}>Annuleer</button>
              </div>
            )}
            {cProjecten.length === 0 && !showNewProject && <div style={{ fontSize: '.8rem', color: 'var(--dl)' }}>Geen projecten</div>}
            {cProjecten.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {p.projectValue > 0 && <span style={{ fontWeight: 700 }}>{fmt(p.projectValue)}</span>}
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
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

      {/* Quotes */}
      {tab === 'quotes' && (
        <div className="tw">
          <div className="tw-hd">
            <div className="card-title">Offertes</div>
            <button className="btn btn-p btn-xs" onClick={() => setShowNewOfferte(true)}>{I.plus} Nieuwe offerte</button>
          </div>
          <table className="dt">
            <thead><tr><th>#</th><th>Omschrijving</th><th>Bedrag</th><th>Status</th></tr></thead>
            <tbody>
              {cOffertes.map(o => (
                <tr key={o.id}>
                  <td style={{ color: 'var(--dl)', fontWeight: 600 }}>{o.nummer}</td>
                  <td>{o.omschrijving || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(o.totaalIncl)}</td>
                  <td><StatusBadge status={o.status} /></td>
                </tr>
              ))}
              {cOffertes.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--dl)', padding: 20 }}>Geen offertes</td></tr>
              )}
            </tbody>
          </table>
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
              <button className="btn btn-p btn-xs" onClick={() => setShowCostModal(true)}>{I.plus} Kosten toevoegen</button>
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
                {cCosts.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--dl)', padding: 20 }}>Nog geen kosten geboekt</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Facturen */}
      {tab === 'facturen' && (
        <div className="tw">
          <div className="tw-hd">
            <div className="card-title">Facturen</div>
            <button className="btn btn-p btn-xs" onClick={() => setShowNewFactuur(true)}>{I.plus} Nieuwe factuur</button>
          </div>
          <table className="dt">
            <thead><tr><th>#</th><th>Notities</th><th>Bedrag</th><th>Datum</th><th>Status</th></tr></thead>
            <tbody>
              {cFacturen.map(f => (
                <tr key={f.id}>
                  <td style={{ color: 'var(--dl)', fontWeight: 600 }}>{f.nummer}</td>
                  <td>{f.notities || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(f.totaalIncl)}</td>
                  <td style={{ color: 'var(--dl)' }}>{f.factuurdatum || '—'}</td>
                  <td><StatusBadge status={f.status} /></td>
                </tr>
              ))}
              {cFacturen.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--dl)', padding: 20 }}>Geen facturen</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showActivityModal && (
        <NewActivityModal
          onClose={() => setShowActivityModal(false)}
          customers={[c]}
          defaultCustId={c.id}
          onSaved={() => { reloadActivities(); setTab('activities'); }}
        />
      )}
      {selectedAct && (
        <ActivityEditModal
          activity={selectedAct}
          customers={[c]}
          onClose={() => setSelectedAct(null)}
          onSaved={updated => {
            setActs(list => list.map(a => a.id === updated.id ? updated : a));
            setSelectedAct(null);
          }}
          onDeleted={id => {
            setActs(list => list.filter(a => a.id !== id));
            setSelectedAct(null);
          }}
        />
      )}
      {showCostModal && (
        <NewJobCostModal
          onClose={() => setShowCostModal(false)}
          customers={[c]}
          defaultCustId={c.id}
          onSaved={() => { reloadCosts(); setTab('costs'); }}
        />
      )}
      {showNewOfferte && (
        <NewOfferteModal
          customers={[c]}
          prefillCustomerId={c.id}
          onClose={() => setShowNewOfferte(false)}
          onSaved={saved => { setOffertes(os => [saved, ...os]); setShowNewOfferte(false); }}
        />
      )}
      {showNewFactuur && (
        <NewFactuurModal
          customers={[c]}
          prefill={{ customer_id: c.id }}
          onClose={() => setShowNewFactuur(false)}
          onSaved={saved => { setFacturen(fs => [saved, ...fs]); setShowNewFactuur(false); }}
        />
      )}
    </div>
  );
}

// ── CUSTOMERS LIST ───────────────────────────────────────────
export function CustomersPage({ openCustomer }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);

  const reload = () => {
    setLoading(true);
    listCustomers()
      .then(data => { setCustomers(data); setError(''); })
      .catch(err => setError(err.message || 'Klanten laden is mislukt.'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [refreshKey]);
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(search.toLowerCase())
  );
  const remove = async id => {
    if (!confirm('Weet je zeker dat je deze klant wilt verwijderen?')) return;
    try {
      await deleteCustomer(id);
      setCustomers(cs => cs.filter(c => c.id !== id));
      toast.success('Klant verwijderd');
      bumpRefresh?.();
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Klanten</h1><p>{customers.length} klanten in je CRM</p></div>
        <div className="page-hd-actions">
          <div className="tabs">
            <button className={`tab${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>Kaarten</button>
            <button className={`tab${view === 'table' ? ' active' : ''}`} onClick={() => setView('table')}>Tabel</button>
          </div>
          <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>{I.plus} Nieuwe klant</button>
        </div>
      </div>
      {error && <div className="card card-p" style={{ color: '#dc2626', marginBottom: 14 }}>{error}</div>}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
        <div className="search" style={{ minWidth: 0, maxWidth: 360 }}>
          {I.search}
          <input placeholder="Zoek op naam of bedrijf…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      {loading && <div className="card card-p">Klanten laden...</div>}
      {!loading && filtered.length === 0 && <div className="empty"><div className="empty-title">Geen klanten gevonden</div><div className="empty-sub">Maak je eerste klant aan of pas je zoekopdracht aan.</div></div>}
      {!loading && filtered.length > 0 && (view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, alignItems: 'stretch' }} className="afu2 cust-card-grid">
          {filtered.map(c => {
            return (
              <div key={c.id} className="card card-p" style={{ cursor: 'pointer', transition: 'all .18s ease', display: 'flex', flexDirection: 'column' }}
                onClick={() => openCustomer(c.id)}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(29,219,98,.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = ''; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Av name={c.name} size="lg" idx={c.av} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{c.name}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--dmu)' }}>{c.company}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '.78rem', color: 'var(--dmu)', marginBottom: 12 }}>
                  {c.email && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{I.mail} {c.email}</div>}
                  {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{I.call} {c.phone}</div>}
                  {c.city && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{I.map} {c.city}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 'auto' }}>
                  <div>
                    <div style={{ fontSize: '.68rem', color: 'var(--dl)' }}>Geoffreerd</div>
                    <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{fmt(c.total)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '.68rem', color: 'var(--dl)' }}>Betaald</div>
                    <div style={{ fontWeight: 700, fontSize: '.88rem', color: c.paid > 0 ? '#059669' : 'var(--dk)' }}>{fmt(c.paid)}</div>
                  </div>
                  <button className="btn-icon" title="Verwijderen" onClick={e => { e.stopPropagation(); remove(c.id); }}>{I.trash}</button>
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
                  <td><button className="btn-icon" onClick={e => { e.stopPropagation(); openCustomer(c.id); }}>{I.arrow_r}</button><button className="btn-icon" onClick={e => { e.stopPropagation(); remove(c.id); }}>{I.trash}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {showNew && (
        <NewCustomerModal
          onClose={() => setShowNew(false)}
          onSaved={created => {
            setCustomers(cs => [created, ...cs]);
            bumpRefresh?.();
            openCustomer?.(created.id);
          }}
        />
      )}
    </div>
  );
}

// ── ACTIVITIES ───────────────────────────────────────────────
export function ActivitiesPage({ openCustomer, preOpenActivityId, onNavConsumed }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [acts, setActs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([listActivities(), listCustomers(), listDeals()])
      .then(([activityData, customerData, dealData]) => {
        setActs(activityData);
        setCustomers(customerData);
        setDeals(dealData);
        setError('');
      })
      .catch(err => setError(err.message || 'Activiteiten laden is mislukt.'))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Deep-open a specific activity requested from the dashboard
  useEffect(() => {
    if (!preOpenActivityId || loading) return;
    const a = acts.find(x => x.id === preOpenActivityId);
    if (a) {
      setSelected(a);
      onNavConsumed && onNavConsumed();
    } else if (import.meta.env.DEV) {
      console.warn('[bb:dashboard] activiteit niet gevonden voor deep-open:', preOpenActivityId);
    }
  }, [preOpenActivityId, loading, acts]);

  const filters = [
    { id: 'all',     label: 'Alle' },
    { id: 'open',    label: 'Open' },
    { id: 'completed', label: 'Afgerond' },
  ];

  const filtered = acts.filter(a => {
    const statusOk = filter === 'all' || (filter === 'completed' ? ['completed', 'done'].includes(a.status) : a.status === filter);
    const dateOk = !dateFilter || a.dueAt?.slice(0, 10) === dateFilter;
    return statusOk && dateOk;
  });
  const actIcon = t => ({ call: I.call, email: I.mail, visit: I.map, task: I.check, follow: I.note }[t] || I.act);
  const markDone = async a => {
    try {
      const updated = await updateActivity(a.id, { status: 'completed' });
      setActs(list => list.map(x => x.id === updated.id ? updated : x));
      toast.success('Activiteit afgerond');
    } catch (err) {
      toast.error(err.message || 'Bijwerken mislukt');
    }
  };

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Activiteiten</h1><p>{acts.filter(a => a.status !== 'done' && a.status !== 'completed').length} openstaande acties</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>{I.plus} Nieuwe activiteit</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }} className="afu2">
        <div className="tabs">
          {filters.map(f => (
            <button key={f.id} className={`tab${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.id !== 'all' && (
                <span style={{ marginLeft: 5, background: '#f3f4f6', color: 'var(--dl)', fontSize: '.65rem', padding: '1px 5px', borderRadius: 'var(--r999)', fontWeight: 700 }}>
                  {f.id === 'completed'
                    ? acts.filter(a => ['completed', 'done'].includes(a.status)).length
                    : acts.filter(a => !['completed', 'done'].includes(a.status)).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <input className="btn btn-s btn-sm" type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        {dateFilter && <button className="btn btn-ghost btn-sm" onClick={() => setDateFilter('')}>Datum wissen</button>}
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
        {loading ? (
          <div className="card card-p">Activiteiten laden...</div>
        ) : error ? (
          <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-title">Geen activiteiten</div><div className="empty-sub">Alles bijgewerkt!</div></div>
        ) : (
          <div style={{ padding: '0 4px' }}>
            {filtered.map(a => {
              const c = customers.find(customer => customer.id === a.custId);
              const isDone = a.status === 'done' || a.status === 'completed';
              return (
                <div key={a.id} className="act-item" style={{ opacity: isDone ? .5 : 1, padding: '12px 14px', cursor: 'pointer' }} onClick={() => setSelected(a)}>
                  <div className="act-icon visit" style={{ background: { call: '#eff6ff', email: '#ecfdf5', visit: 'var(--pll)', task: '#f5f3ff', follow: '#fff4ec' }[a.type] || '#f3f4f6', fontSize: '.9rem', flexShrink: 0 }}>
                    {actIcon(a.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="act-title" style={{ textDecoration: isDone ? 'line-through' : 'none' }}>{a.title}</div>
                    <div className="act-meta">
                      <span className="act-cust" style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); openCustomer(a.custId); }}>{a.customerName || c?.name}</span>
                      <span>·</span><span>{a.date}</span><span>·</span><span>{a.time}</span>
                      <span>·</span><span style={{ fontSize: '.72rem' }}>{a.assignee}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span className={`badge ${a.status === 'overdue' ? 'b-overdue' : a.status === 'today' ? 'b-today' : isDone ? 'b-done' : 'b-gray'}`}>
                      {a.status === 'overdue' ? 'Te laat' : a.status === 'today' ? 'Vandaag' : isDone ? 'Gereed' : 'Open'}
                    </span>
                    {!isDone && <button className="btn btn-s btn-xs" onClick={e => { e.stopPropagation(); markDone(a); }}>{I.check} Gereed</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
            bumpRefresh?.();
          }}
        />
      )}
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
            <div style={{ background: 'var(--pll)', border: '1px solid rgba(29,219,98,.2)', borderRadius: 'var(--r8)', padding: '10px 14px', marginTop: 14, fontSize: '.8rem', color: 'var(--pd)', fontWeight: 600 }}>
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
