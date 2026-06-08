import { useEffect, useRef, useState } from 'react';
import { Bold, Calendar, Check, Edit2, Euro, FileText, Folder, Italic, List, ListOrdered, Maximize2, Minimize2, PenLine, Plus, RotateCcw, ShoppingCart, Underline, User, Wrench, X } from 'lucide-react';
import {
  I, CUSTOMERS_DATA, DEALS, ACTIVITIES_DATA, QUOTES_DATA, COSTS_DATA,
  fmt, custById, stageLabel, stageCol, Av, StatusBadge, ModalX,
} from '../bb-shared.jsx';
import { createCustomer, deleteCustomer, getCustomer, listCustomers, updateCustomer } from '../services/customerService.js';
import { getKlantNotities, addKlantNotitie, getTijdlijnByCustomer, logTijdlijnSafe } from '../services/klantTijdlijnService.js';
import { updateContactInMoneybird } from '../services/accountingService.js';
import { buildDueAt, createActivity, listActivities, updateActivity } from '../services/activityService.js';
import { createNote, listNotes } from '../services/noteService.js';
import { listJobCosts } from '../services/jobCostService.js';
import { listDeals } from '../services/dealService.js';
import { getOffertesByCustomer } from '../services/offerteService.js';
import { getFacturenByCustomer } from '../services/factuurService.js';
import { getProjectsByCustomer } from '../services/projectsService.js';
import { NewOfferteModal, OfferteBadge } from './OffertesPage.jsx';
import { NewFactuurModal, FactuurBadge } from './FacturenPage.jsx';
import { NewProjectModal, ProjectBadge } from './ProjectsPage.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { ActivityEditModal, NewActivityModal, NewCustomerModal, NewJobCostModal } from '../components/SharedModals.jsx';
import { ChevronDown, Mail, Send } from 'lucide-react';
import { getMailTemplate, sendEmail, substituteVars, logSentEmail, getSentEmailsByCustomer } from '../services/emailService.js';
import { MailBodyEditor, plainToEditorHtml } from '../components/MailBodyEditor.jsx';
import { getEmailTemplates } from '../services/instellingenService.js';

const EMPTY_FORMATS = { bold: false, italic: false, underline: false, insertUnorderedList: false, insertOrderedList: false };

function NotitieEditor({ editorRef, minHeight = 200, maxHeight, placeholder, onHasContent }) {
  const [focused, setFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [activeFormats, setActiveFormats] = useState(EMPTY_FORMATS);
  const isFocused = useRef(false);

  const updateActiveState = () => {
    setActiveFormats({
      bold:                document.queryCommandState('bold'),
      italic:              document.queryCommandState('italic'),
      underline:           document.queryCommandState('underline'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList:   document.queryCommandState('insertOrderedList'),
    });
  };

  useEffect(() => {
    const onSelectionChange = () => { if (isFocused.current) updateActiveState(); };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const exec = cmd => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
    updateActiveState();
  };

  const handleInput = () => {
    const hasText = Boolean(editorRef.current?.textContent?.trim());
    setIsEmpty(!hasText);
    onHasContent?.(hasText);
    updateActiveState();
  };

  const TOOLBAR = [
    { cmd: 'bold',               icon: <Bold size={13} />,        title: 'Vet (Ctrl+B)' },
    { cmd: 'italic',             icon: <Italic size={13} />,      title: 'Cursief (Ctrl+I)' },
    { cmd: 'underline',          icon: <Underline size={13} />,   title: 'Onderstrepen (Ctrl+U)' },
    null,
    { cmd: 'insertUnorderedList', icon: <List size={13} />,        title: 'Bullet lijst' },
    { cmd: 'insertOrderedList',  icon: <ListOrdered size={13} />, title: 'Genummerde lijst' },
  ];

  return (
    <div style={{
      border: `1px solid ${focused ? '#1DDB62' : 'var(--border)'}`,
      borderRadius: 'var(--r8)', overflow: 'hidden', background: 'var(--bg)',
      transition: 'border-color .15s',
    }}>
      <div style={{
        display: 'flex', gap: 1, padding: '4px 6px',
        borderBottom: '1px solid var(--border)', background: 'var(--bgs)',
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        {TOOLBAR.map((item, i) =>
          !item ? (
            <div key={i} style={{ width: 1, background: 'var(--border)', height: 14, margin: '0 3px', alignSelf: 'center', flexShrink: 0 }} />
          ) : (
            <button
              key={i}
              type="button"
              title={item.title}
              className={`bb-tb-btn${activeFormats[item.cmd] ? ' active' : ''}`}
              onMouseDown={e => { e.preventDefault(); exec(item.cmd); }}
            >
              {item.icon}
            </button>
          )
        )}
      </div>
      <div style={{ position: 'relative' }}>
        {isEmpty && placeholder && (
          <div style={{
            position: 'absolute', top: 10, left: 12,
            color: '#9ca3af', fontSize: '.85rem',
            pointerEvents: 'none', userSelect: 'none', lineHeight: 1.6,
          }}>
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="bb-notitie-editor"
          onInput={handleInput}
          onKeyUp={updateActiveState}
          onMouseUp={updateActiveState}
          onFocus={() => { isFocused.current = true; setFocused(true); updateActiveState(); }}
          onBlur={() => { isFocused.current = false; setFocused(false); setActiveFormats(EMPTY_FORMATS); }}
          style={{
            minHeight, maxHeight, padding: '10px 12px',
            outline: 'none', fontSize: '.85rem', lineHeight: 1.6,
            color: 'var(--dk)', fontFamily: 'inherit',
            overflowY: maxHeight ? 'auto' : undefined,
          }}
        />
      </div>
    </div>
  );
}

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
  const [cOffertes, setOffertes] = useState([]);
  const [cFacturen, setFacturen] = useState([]);
  const [cProjecten, setProjecten] = useState([]);
  const [showNewOfferte, setShowNewOfferte] = useState(false);
  const [showNewFactuur, setShowNewFactuur] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [klantNotities, setKlantNotities] = useState([]);
  const [tijdlijn, setTijdlijn] = useState([]);
  const notitiesEditorRef = useRef(null);
  const overzichtEditorRef = useRef(null);
  const [notitiesHasContent, setNotitiesHasContent] = useState(false);
  const [overzichtHasContent, setOverzichtHasContent] = useState(false);
  const [savingNotitie, setSavingNotitie] = useState(false);
  const [savingOverzicht, setSavingOverzicht] = useState(false);
  const [showNotitiesInput, setShowNotitiesInput] = useState(false);
  const [showOverzichtInput, setShowOverzichtInput] = useState(false);
  const [notitiesVisible, setNotitiesVisible] = useState(10);
  const [fullscreen, setFullscreen] = useState(() => localStorage.getItem('customer_fullscreen') === 'true');
  const [sbWidth, setSbWidth] = useState(232);
  const [sentEmails, setSentEmails] = useState([]);
  const [sentEmailsLoading, setSentEmailsLoading] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailForm, setEmailForm] = useState({ to: '', templateId: '', subject: '', body: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState(null);
  const { company } = useProfile();

  useEffect(() => {
    const el = document.querySelector('.sb');
    if (el) setSbWidth(el.offsetWidth);
  }, []);

  useEffect(() => {
    const drawer = document.querySelector('.drawer') || document.querySelector('.cust-split-panel');
    if (!drawer) return;
    if (fullscreen) {
      drawer.style.setProperty('--fs-left', `${sbWidth}px`);
      drawer.classList.add('klant-fullscreen');
    } else {
      drawer.classList.remove('klant-fullscreen');
      drawer.style.removeProperty('--fs-left');
    }
    return () => {
      const d = document.querySelector('.drawer') || document.querySelector('.cust-split-panel');
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
    if (tab !== 'emails' || !custId) return;
    setSentEmailsLoading(true);
    getSentEmailsByCustomer(custId).then(setSentEmails).catch(() => {}).finally(() => setSentEmailsLoading(false));
    getEmailTemplates().then(tpls => setEmailTemplates(tpls.filter(t => t.actief))).catch(() => {});
    setExpandedEmailId(null);
  }, [tab, custId]);

  useEffect(() => {
    if (tab === 'emails' && c) {
      setEmailForm(f => ({ ...f, to: c.email || '' }));
    }
  }, [tab, c]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getCustomer(custId), listActivities(), listNotes(custId), listJobCosts(),
      getOffertesByCustomer(custId).catch(() => []),
      getFacturenByCustomer(custId).catch(() => []),
      getProjectsByCustomer(custId).catch(() => []),
      getKlantNotities(custId).catch(() => []),
      getTijdlijnByCustomer(custId).catch(() => []),
    ])
    .then(([customer, activities, notes, costs, offertes, facturen, projecten, notities, tl]) => {
      if (!alive) return;
      setCustomer(customer);
      setKlantNotities(notities);
      setTijdlijn(tl);
      setActs(activities.filter(a => a.custId === custId));
      setNotes(notes);
      setCosts(costs.filter(x => x.custId === custId || x.customerId === custId));
      setOffertes(offertes);
      setFacturen(facturen);
      setProjecten(projecten);
      setNotitiesVisible(10);
      setShowNotitiesInput(false);
      setShowOverzichtInput(false);
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
  const totalGeoffreerd = cOffertes
    .filter(o => ['concept', 'verzonden', 'geaccepteerd'].includes(o.status))
    .reduce((s, o) => s + o.totaalIncl, 0);
  const totalBetaald = cFacturen
    .filter(f => !f.isCredit && !f.gecrediteerd && f.status === 'betaald')
    .reduce((s, f) => s + f.totaalIncl, 0);
  const totalCosts = cCosts.reduce((s, x) => s + x.amt, 0);
  const profit = totalBetaald - totalCosts;
  const margin = totalBetaald > 0 ? Math.round((profit / totalBetaald) * 100) : 0;
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
      setCosts(costs.filter(x => x.custId === custId || x.customerId === custId));
    } catch { /* ignore */ }
  };

  const TABS = ['overview', 'notities', 'quotes', 'costs', 'projecten', 'timeline', 'emails', 'klantgegevens'];
  const TAB_LABELS = { overview: 'Overzicht', notities: 'Notities', quotes: 'Offertes', costs: 'Kosten', projecten: 'Projecten', timeline: 'Tijdlijn', emails: 'E-mails', klantgegevens: 'Klantgegevens' };

  const fmtNotitieDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };

  const clearEditor = ref => { if (ref.current) ref.current.innerHTML = ''; };

  const addNotitie = async (editorRef, setHasContent, setSaving, onDone) => {
    const html = editorRef.current?.innerHTML || '';
    if (!editorRef.current?.textContent?.trim()) return;
    setSaving(true);
    try {
      const created = await addKlantNotitie(c.id, html);
      setKlantNotities(list => [created, ...list]);
      setTijdlijn(list => [created, ...list]);
      clearEditor(editorRef);
      setHasContent(false);
      onDone?.();
      toast.success('Notitie opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const cancelNotitie = (editorRef, setHasContent, closeFn) => {
    clearEditor(editorRef);
    setHasContent(false);
    closeFn();
  };

  const fmtTijdlijnDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    const dag = ['zo','ma','di','wo','do','vr','za'][d.getDay()];
    const mnd = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()];
    return `${dag} ${d.getDate()} ${mnd} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const handleTemplateSelect = templateId => {
    if (!templateId) {
      setEmailForm(f => ({ ...f, templateId: '', subject: '', body: '' }));
      return;
    }
    const tpl = emailTemplates.find(t => t.id === templateId);
    if (!tpl) return;
    const vars = { klant_naam: c?.name || 'klant', bedrijfsnaam: company?.name || 'BossBase' };
    setEmailForm(f => ({
      ...f,
      templateId,
      subject: substituteVars(tpl.onderwerp || '', vars),
      body: plainToEditorHtml(substituteVars(tpl.body || '', vars)),
    }));
  };

  const handleSendEmail = async () => {
    if (!emailForm.to) { toast.error('E-mailadres is verplicht'); return; }
    if (!emailForm.subject) { toast.error('Onderwerp is verplicht'); return; }
    setEmailSending(true);
    try {
      const html = emailForm.body || `<p>${emailForm.subject}</p>`;
      const tpl = emailTemplates.find(t => t.id === emailForm.templateId);
      await sendEmail({ to: emailForm.to, subject: emailForm.subject, html });
      await logSentEmail({
        toEmail: emailForm.to,
        subject: emailForm.subject,
        bodyHtml: html,
        relatedType: tpl?.type || null,
        customerId: c?.id,
      });
      toast.success('E-mail verstuurd');
      logTijdlijnSafe(c?.id, 'email_verstuurd', `E-mail verstuurd: ${emailForm.subject}`, { to: emailForm.to, subject: emailForm.subject });
      getSentEmailsByCustomer(custId).then(setSentEmails).catch(() => {});
      setEmailForm(f => ({ ...f, templateId: '', subject: '', body: '' }));
    } catch (err) {
      toast.error(err.message || 'Versturen mislukt');
    } finally {
      setEmailSending(false);
    }
  };

  const TIJDLIJN_ICON = {
    klant_aangemaakt:         <User size={14} />,
    offerte_aangemaakt:       <FileText size={14} />,
    offerte_verzonden:        <FileText size={14} />,
    offerte_geaccepteerd:     <FileText size={14} />,
    offerte_afgewezen:        <FileText size={14} />,
    factuur_aangemaakt:       <Euro size={14} />,
    factuur_verzonden:        <Euro size={14} />,
    factuur_betaald:          <Euro size={14} />,
    creditfactuur_aangemaakt: <RotateCcw size={14} />,
    project_aangemaakt:       <Folder size={14} />,
    project_status_gewijzigd: <Folder size={14} />,
    notitie_toegevoegd:       <PenLine size={14} />,
    email_verstuurd:          <Mail size={14} />,
    herinnering_verstuurd:    <Mail size={14} />,
    afspraak_ingepland:       <Calendar size={14} />,
    deal_aangemaakt:          <ShoppingCart size={14} />,
    deal_fase_gewijzigd:      <ShoppingCart size={14} />,
  };

  const TIJDLIJN_KLEUR = type => {
    if (type.startsWith('klant'))       return '#3b82f6';
    if (type.startsWith('offerte'))     return '#f97316';
    if (type.startsWith('factuur'))     return '#10b981';
    if (type.startsWith('credit'))      return '#ef4444';
    if (type.startsWith('project'))     return '#6366f1';
    if (type.startsWith('notitie'))     return '#10b981';
    if (type.startsWith('email'))       return '#0ea5e9';
    if (type.startsWith('herinnering')) return '#f59e0b';
    if (type.startsWith('afspraak'))    return '#14b8a6';
    if (type.startsWith('deal'))        return '#8b5cf6';
    return 'var(--dl)';
  };

  return (
    <div>

      {/* Sticky sluit-knop — altijd rechtsboven zichtbaar */}
      {onClose && (
        <button
          className="drawer-x"
          onClick={onClose}
          title="Sluiten"
          style={{ position: 'sticky', top: 16, float: 'right', zIndex: 20, marginBottom: -36, marginLeft: 8 }}
        >
          {I.x}
        </button>
      )}

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
            <span className={`badge ${c.type === 'Zakelijk' ? 'b-blue' : 'b-gray'}`}>{c.type}</span>
          </div>
          <div style={{ fontSize: '.82rem', color: 'var(--dmu)', marginBottom: 10 }}>{c.company} · {c.city}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-start', marginLeft: 0, paddingLeft: 0 }}>
            {c.phone && <a href={`tel:${c.phone}`} className="btn btn-s btn-sm">{I.call} {c.phone}</a>}
            {c.email && <button className="btn btn-s btn-sm" onClick={() => setTab('emails')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Send size={13} /> E-mail sturen</button>}
            {(c.moneybirdId || c.afasId || c.snelstartId) && (
              <span
                className="sync-indicator"
                data-tooltip={c.moneybirdId ? 'Gesynchroniseerd met Moneybird' : c.afasId ? 'Gesynchroniseerd met AFAS' : 'Gesynchroniseerd met SnelStart'}
              >
                <Check size={15} style={{ color: '#15A34A' }} />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Totaal geoffreerd', val: fmt(totalGeoffreerd) },
          { label: 'Betaald',           val: fmt(totalBetaald),    green: totalBetaald > 0 },
          { label: 'Totale kosten',     val: fmt(totalCosts) },
          { label: 'Winst',             val: fmt(profit),    green: profit > 0, red: profit < 0 },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r10)', padding: '12px 14px' }}>
            <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginBottom: 4, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-.02em', color: s.green ? '#15A34A' : s.red ? '#dc2626' : 'var(--dk)' }}>{s.val}</div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Notities blok */}
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: klantNotities.length > 0 || showOverzichtInput ? 10 : 0 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Notities</div>
              {!showOverzichtInput && (
                <button
                  onClick={() => setShowOverzichtInput(true)}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: '#1DDB62', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}
                >
                  {I.plus}
                </button>
              )}
            </div>
            <div className={`notitie-input-wrap${showOverzichtInput ? ' open' : ''}`}>
              <div>
                <NotitieEditor
                  editorRef={overzichtEditorRef}
                  minHeight={80}
                  maxHeight={120}
                  placeholder="Schrijf een notitie..."
                  onHasContent={setOverzichtHasContent}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6, paddingBottom: 2 }}>
                  <button
                    className="btn btn-s btn-xs"
                    onClick={() => cancelNotitie(overzichtEditorRef, setOverzichtHasContent, () => setShowOverzichtInput(false))}
                  >
                    Annuleren
                  </button>
                  <button
                    className="btn btn-p btn-xs"
                    disabled={savingOverzicht || !overzichtHasContent}
                    onClick={() => addNotitie(overzichtEditorRef, setOverzichtHasContent, setSavingOverzicht, () => setShowOverzichtInput(false))}
                  >
                    {savingOverzicht ? 'Toevoegen...' : 'Toevoegen'}
                  </button>
                </div>
              </div>
            </div>
            {klantNotities.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {klantNotities.slice(0, 2).map(n => (
                  <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bgs)', borderRadius: 'var(--r8)', border: '1px solid var(--border)' }}>
                    <div dangerouslySetInnerHTML={{ __html: n.omschrijving }} className="bb-notitie-content" style={{ fontSize: '.83rem', color: 'var(--dk)', lineHeight: 1.5 }} />
                    <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginTop: 4 }}>{fmtNotitieDate(n.aangemaaktop)}</div>
                  </div>
                ))}
                <button
                  onClick={() => setTab('notities')}
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem', color: 'var(--p)', fontWeight: 600, padding: '2px 0' }}
                >
                  Alle notities →{klantNotities.length > 2 ? ` (${klantNotities.length})` : ''}
                </button>
              </div>
            )}
          </div>

          {/* Activiteiten */}
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Activiteiten</div>
              <button onClick={() => setShowActivityModal(true)} style={{ width: 28, height: 28, borderRadius: '50%', background: '#1DDB62', border: 'none', color: '#fff', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>{I.plus}</button>
            </div>
            {cActs.length === 0 && <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Geen activiteiten</div>}
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
              <button onClick={() => setShowNewOfferte(true)} style={{ width: 28, height: 28, borderRadius: '50%', background: '#1DDB62', border: 'none', color: '#fff', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>{I.plus}</button>
            </div>
            {cOffertes.length === 0 && <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Geen offertes</div>}
            {cOffertes.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--dl)', fontSize: '.75rem' }}>{o.nummer}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.omschrijving || '—'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontWeight: 700 }}>{fmt(o.totaalIncl)}</span>
                  <OfferteBadge status={o.status} />
                </div>
              </div>
            ))}
          </div>

          {/* Facturen */}
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Facturen</div>
              <button onClick={() => setShowNewFactuur(true)} style={{ width: 28, height: 28, borderRadius: '50%', background: '#1DDB62', border: 'none', color: '#fff', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>{I.plus}</button>
            </div>
            {cFacturen.length === 0 && <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Geen facturen</div>}
            {cFacturen.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--dl)', fontSize: '.75rem' }}>{f.nummer}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.notities || '—'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontWeight: 700 }}>{fmt(f.totaalIncl)}</span>
                  <FactuurBadge f={f} />
                </div>
              </div>
            ))}
          </div>

          {/* Projecten */}
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Projecten</div>
              <button onClick={() => setShowNewProject(true)} style={{ width: 28, height: 28, borderRadius: '50%', background: '#1DDB62', border: 'none', color: '#fff', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>{I.plus}</button>
            </div>
            {cProjecten.length === 0 && <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Geen projecten</div>}
            {cProjecten.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {p.projectValue > 0 && <span style={{ fontWeight: 700 }}>{fmt(p.projectValue)}</span>}
                  <ProjectBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notities tab */}
      {tab === 'notities' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card card-p">
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: showNotitiesInput ? 12 : 0 }}>Notities</div>
            {!showNotitiesInput && (
              <div
                onClick={() => setShowNotitiesInput(true)}
                style={{ cursor: 'pointer', padding: '10px 2px', color: '#9ca3af', fontSize: '.84rem', fontStyle: 'italic' }}
              >
                Klik om een notitie toe te voegen...
              </div>
            )}
            <div className={`notitie-input-wrap${showNotitiesInput ? ' open' : ''}`}>
              <div>
                <NotitieEditor
                  editorRef={notitiesEditorRef}
                  minHeight={150}
                  placeholder="Schrijf hier je notitie over deze klant..."
                  onHasContent={setNotitiesHasContent}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10, paddingBottom: 2 }}>
                  <button
                    className="btn btn-s btn-sm"
                    onClick={() => cancelNotitie(notitiesEditorRef, setNotitiesHasContent, () => setShowNotitiesInput(false))}
                  >
                    Annuleren
                  </button>
                  <button
                    className="btn btn-p btn-sm"
                    disabled={savingNotitie || !notitiesHasContent}
                    onClick={() => addNotitie(notitiesEditorRef, setNotitiesHasContent, setSavingNotitie, () => setShowNotitiesInput(false))}
                  >
                    {savingNotitie ? 'Opslaan...' : 'Opslaan'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {klantNotities.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {klantNotities.slice(0, notitiesVisible).map(n => (
                <div key={n.id} className="card card-p" style={{ padding: '12px 16px' }}>
                  <div dangerouslySetInnerHTML={{ __html: n.omschrijving }} className="bb-notitie-content" style={{ fontSize: '.85rem', color: 'var(--dk)', lineHeight: 1.6 }} />
                  <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 6, fontWeight: 600 }}>
                    {fmtNotitieDate(n.aangemaaktop)}
                  </div>
                </div>
              ))}
              {klantNotities.length > notitiesVisible && (
                <button
                  className="btn btn-s btn-sm"
                  style={{ alignSelf: 'center' }}
                  onClick={() => setNotitiesVisible(v => v + 10)}
                >
                  Laad {Math.min(10, klantNotities.length - notitiesVisible)} meer
                </button>
              )}
            </div>
          )}

          {klantNotities.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: '.84rem' }}>
              Nog geen notities
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      {tab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {tijdlijn.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '.84rem' }}>
              Nog geen activiteit gelogd
            </div>
          )}
          {tijdlijn.map((item, i) => {
            const kleur = TIJDLIJN_KLEUR(item.type);
            const icon = TIJDLIJN_ICON[item.type] || <PenLine size={14} />;
            const isLast = i === tijdlijn.length - 1;
            return (
              <div key={item.id} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: isLast ? 0 : 4 }}>
                {/* Lijn + icoon */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 32 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: kleur + '18', border: `1.5px solid ${kleur}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: kleur, flexShrink: 0, zIndex: 1,
                  }}>
                    {icon}
                  </div>
                  {!isLast && (
                    <div style={{ width: 1, flex: 1, minHeight: 16, background: 'var(--border)', marginTop: 2, marginBottom: 0 }} />
                  )}
                </div>
                {/* Content */}
                <div style={{
                  flex: 1, background: 'var(--bgs)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r8)', padding: '8px 12px',
                  marginBottom: isLast ? 0 : 6, minWidth: 0,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
                    <div style={{ fontSize: '.83rem', fontWeight: 600, color: 'var(--dk)', lineHeight: 1.4 }}>
                      {item.omschrijving}
                    </div>
                    <div style={{ fontSize: '.7rem', color: 'var(--dl)', flexShrink: 0, paddingTop: 1 }}>
                      {fmtTijdlijnDate(item.aangemaaktop)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quotes */}
      {tab === 'quotes' && (
        <div className="tw" style={{ overflowX: 'auto' }}>
          <div className="tw-hd">
            <div className="card-title">Offertes</div>
            <button className="btn btn-p btn-xs" onClick={() => setShowNewOfferte(true)}>{I.plus} Nieuwe offerte</button>
          </div>
          {cOffertes.length > 0 && (
            <table className="dt">
              <thead><tr><th>#</th><th>Omschrijving</th><th>Bedrag</th><th>Status</th></tr></thead>
              <tbody>
                {cOffertes.map(o => (
                  <tr key={o.id}>
                    <td style={{ color: 'var(--dl)', fontWeight: 600, whiteSpace: 'nowrap' }}>{o.nummer}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.omschrijving || '—'}</td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(o.totaalIncl)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><OfferteBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cOffertes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>Geen offertes</div>
          )}
        </div>
      )}

      {/* Costs */}
      {tab === 'costs' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Totale kosten',    val: fmt(totalCosts) },
              { label: 'Omzet (betaald)',  val: fmt(totalBetaald) },
              { label: 'Winst / marge',    val: `${fmt(profit)} (${margin}%)`, green: profit > 0 },
            ].map((s, i) => (
              <div key={i} className="sc" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: s.green ? '#15A34A' : 'var(--dk)' }}>{s.val}</div>
              </div>
            ))}
          </div>
          <div className="tw" style={{ overflowX: 'auto' }}>
            <div className="tw-hd">
              <div className="card-title">Kostenregels</div>
              <button className="btn btn-p btn-xs" onClick={() => setShowCostModal(true)}>{I.plus} Kosten toevoegen</button>
            </div>
            {cCosts.length > 0 && (
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
            )}
            {cCosts.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>Nog geen kosten geboekt</div>
            )}
          </div>
        </div>
      )}

      {/* Projecten tab */}
      {tab === 'projecten' && (
        <div className="tw" style={{ overflowX: 'auto' }}>
          <div className="tw-hd">
            <div className="card-title">Projecten</div>
            <button className="btn btn-p btn-xs" onClick={() => setShowNewProject(true)}>{I.plus} Nieuw project</button>
          </div>
          {cProjecten.length > 0 && (
            <table className="dt">
              <thead><tr><th>Naam</th><th>Waarde</th><th>Status</th></tr></thead>
              <tbody>
                {cProjecten.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{p.projectValue > 0 ? fmt(p.projectValue) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><ProjectBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cProjecten.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>Geen projecten</div>
          )}
        </div>
      )}

      {/* E-mails tab */}
      {tab === 'emails' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Schrijfvak ── */}
          <div className="card card-p">
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 12 }}>Nieuw bericht</div>

            {/* Template kiezer */}
            <select
              value={emailForm.templateId}
              onChange={e => handleTemplateSelect(e.target.value)}
              style={{
                width: '100%', marginBottom: 10, height: 34,
                background: 'var(--bgs)', border: '1px solid var(--border)',
                borderRadius: 'var(--r8)', fontSize: '.84rem', padding: '0 10px', color: 'var(--dk)',
              }}
            >
              <option value="">Schrijf zelf een bericht</option>
              {emailTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name || t.type}</option>
              ))}
            </select>

            {/* Onderwerp */}
            <input
              value={emailForm.subject}
              onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Onderwerp..."
              style={{
                width: '100%', marginBottom: 10, height: 34,
                background: 'var(--bgs)', border: '1px solid var(--border)',
                borderRadius: 'var(--r8)', fontSize: '.84rem', padding: '0 10px',
              }}
            />

            {/* Bericht body */}
            <div style={{ marginBottom: 12 }}>
              <MailBodyEditor
                value={emailForm.body}
                onChange={html => setEmailForm(f => ({ ...f, body: html }))}
                placeholder="Schrijf uw bericht hier..."
                minHeight={140}
              />
            </div>

            {/* Footer: Aan + Versturen */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              borderTop: '1px solid var(--border)', paddingTop: 10,
            }}>
              <span style={{ fontSize: '.78rem', color: 'var(--dl)', flexShrink: 0, fontWeight: 600 }}>Aan:</span>
              <input
                value={emailForm.to}
                onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))}
                placeholder="emailadres@klant.nl"
                style={{
                  flex: 1, height: 30, fontSize: '.82rem',
                  background: 'var(--bgs)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r8)', padding: '0 8px',
                }}
              />
              <button
                className="btn btn-p btn-sm"
                onClick={handleSendEmail}
                disabled={emailSending || !emailForm.to || !emailForm.subject}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
              >
                <Send size={13} />{emailSending ? 'Versturen...' : 'Versturen'}
              </button>
            </div>
          </div>

          {/* ── Verstuurde mails ── */}
          {sentEmailsLoading && <div style={{ color: 'var(--dl)', fontSize: '.84rem' }}>Laden…</div>}
          {!sentEmailsLoading && sentEmails.length === 0 && (
            <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: '.84rem' }}>
              Nog geen e-mails verstuurd aan deze klant
            </div>
          )}
          {sentEmails.map(m => {
            const isExpanded = expandedEmailId === m.id;
            const isTemplate = Boolean(m.related_type);
            const fmtDate = m.sent_at
              ? new Date(m.sent_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '';
            return (
              <div key={m.id}>
                <div
                  onClick={() => setExpandedEmailId(id => id === m.id ? null : m.id)}
                  style={{
                    padding: '10px 14px',
                    background: isExpanded ? 'white' : 'var(--bgs)',
                    border: '1px solid var(--border)',
                    borderRadius: isExpanded ? 'var(--r8) var(--r8) 0 0' : 'var(--r8)',
                    cursor: 'pointer',
                    transition: 'background .1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ color: isTemplate ? 'var(--pd)' : 'var(--dl)', display: 'flex', flexShrink: 0 }}>
                      {isTemplate ? <FileText size={14} /> : <Mail size={14} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.subject}
                      </div>
                      <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 2 }}>
                        {fmtDate}{isTemplate && m.related_type ? ` · ${m.related_type}` : ''}
                      </div>
                    </div>
                    <span style={{
                      color: 'var(--dl)', display: 'flex', flexShrink: 0,
                      transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
                    }}>
                      <ChevronDown size={14} />
                    </span>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{
                    border: '1px solid var(--border)', borderTop: 'none',
                    borderRadius: '0 0 var(--r8) var(--r8)',
                    padding: '14px 16px', background: 'white',
                  }}>
                    {m.body_html
                      ? <div dangerouslySetInnerHTML={{ __html: m.body_html }} className="bb-notitie-content" style={{ fontSize: '.85rem', lineHeight: 1.7, color: 'var(--dk)' }} />
                      : <div style={{ color: 'var(--dl)', fontSize: '.82rem', fontStyle: 'italic' }}>Inhoud niet beschikbaar voor oudere e-mails</div>
                    }
                    <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      Aan: {m.to_email}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Klantgegevens tab */}
      {tab === 'klantgegevens' && (
        <div className="card card-p">
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
                    <button onClick={() => saveField(field.key)} disabled={savingField} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15A34A', display: 'flex', alignItems: 'center', padding: 2 }}>
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

      {showActivityModal && (
        <NewActivityModal
          onClose={() => setShowActivityModal(false)}
          customers={[c]}
          defaultCustId={c.id}
          onSaved={() => { reloadActivities(); }}
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
          onSaved={() => { reloadCosts(); }}
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
      {showNewProject && (
        <NewProjectModal
          customers={[c]}
          deals={[]}
          offertes={cOffertes}
          prefillCustomerId={c.id}
          onClose={() => setShowNewProject(false)}
          onSaved={saved => { setProjecten(ps => [saved, ...ps]); setShowNewProject(false); }}
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
  const [view, setView] = useState(() => localStorage.getItem('customers_view') || 'grid');
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
            <button className={`tab${view === 'grid' ? ' active' : ''}`} onClick={() => { setView('grid'); localStorage.setItem('customers_view', 'grid'); }}>Kaarten</button>
            <button className={`tab${view === 'table' ? ' active' : ''}`} onClick={() => { setView('table'); localStorage.setItem('customers_view', 'table'); }}>Tabel</button>
          </div>
          <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>{I.plus} Nieuwe klant</button>
        </div>
      </div>
      {error && <div className="card card-p" style={{ color: '#dc2626', marginBottom: 14 }}>{error}</div>}
      <div className="search afu2" style={{ maxWidth: 360, marginBottom: 14 }}>
        {I.search}
        <input placeholder="Zoek op naam of bedrijf…" value={search} onChange={e => setSearch(e.target.value)} />
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
                    <div style={{ fontWeight: 700, fontSize: '.88rem', color: c.paid > 0 ? '#15A34A' : 'var(--dk)' }}>{fmt(c.paid)}</div>
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
            <thead><tr><th>Klant</th><th>Telefoonnummer</th><th>Stad</th><th>Totaal</th><th>Betaald</th><th></th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openCustomer(c.id)}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Av name={c.name} size="sm" idx={c.av} /><span style={{ fontWeight: 600 }}>{c.name}</span></div></td>
                  <td style={{ color: 'var(--dmu)' }}>{c.phone || '—'}</td>
                  <td>{c.city}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(c.total)}</td>
                  <td style={{ fontWeight: 700, color: '#15A34A' }}>{fmt(c.paid)}</td>
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
        <div className="bb-filter-tabs">
          {filters.map(f => (
            <button key={f.id} className={`bb-filter-tab${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.id !== 'all' && (
                <span className="bb-filter-tab-count">
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
        <div className="bb-filter-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`bb-filter-tab${filter === t.id ? ' on' : ''}`} onClick={() => setFilter(t.id)}>{t.label}</button>
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
