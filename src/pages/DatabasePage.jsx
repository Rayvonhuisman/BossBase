import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { supabase } from '../lib/supabase.js';
import { I, fmt, Av } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { listCustomers, deleteCustomer } from '../services/customerService.js';
import { getFacturen, getFactuurRegels } from '../services/factuurService.js';
import { getOffertes, getOfferteItems } from '../services/offerteService.js';
import { getOffertePdfBase64, getFactuurPdfBase64 } from '../utils/generatePdf.js';
import { getProjects, PROJECT_STATUS } from '../services/projectsService.js';
import { listDeals, listPipelineStages } from '../services/dealService.js';
import { listActivities } from '../services/activityService.js';
import { getEmailTemplates } from '../services/instellingenService.js';
import { sendEmail, logSentEmail, substituteVars } from '../services/emailService.js';
import { MailBodyEditor, plainToEditorHtml } from '../components/MailBodyEditor.jsx';
import { logTijdlijnSafe } from '../services/klantTijdlijnService.js';
import { getCompanyId } from '../lib/currentCompany.js';

const TODAY = new Date().toISOString().slice(0, 10);
const PAD = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${PAD(d.getMonth()+1)}-${PAD(d.getDate())}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); };

const EMPTY_FILTERS = {
  stad: '', aanmaakVan: '', aanmaakTot: '',
  heeftKvk: 'alles', heeftMoneybird: 'alles',
  geenProject: false, laatsteContactDagen: '',
  projectStatussen: [], projectStartVan: '', projectStartTot: '',
  projectDeadlineVan: '', projectDeadlineTot: '',
  heeftOverrun: false, heeftLopendProject: false, projectMedewerker: '',
  offerteStatussen: [], offerteVerlopen: false,
  offerteOndertekend: 'alles',
  offerteBedragMin: '', offerteBedragMax: '',
  offerteMargeMin: '', offerteMargeMax: '',
  factuurStatussen: [], factuurVervallen: false,
  herinnering1: 'alles', herinnering2: 'alles',
  isCreditnota: false, betaaldVan: '', betaaldTot: '',
  dealFasen: [], dealWaardeMin: '', dealWaardeMax: '',
  heeftOpenActiviteiten: false, activiteitTypen: [],
  heeftMail: 'alles', mailOuderDanDagen: '', mailTemplateType: '',
  heeftFactureerbareUren: false, urenVan: '', urenTot: '',
  heeftOffertes: false, heeftFacturen: false,
  heeftGetekendOfferte: false, heeftOnbetaaldeFacturen: false, heeftVerlopenOffertes: false,
  documentenPeriodeVan: '', documentenPeriodeTot: '',
};

const hasActiveFilters = f => {
  const e = EMPTY_FILTERS;
  return Object.keys(e).some(k => {
    const v = f[k], ev = e[k];
    if (Array.isArray(ev)) return v.length > 0;
    if (typeof ev === 'boolean') return v !== ev;
    return v !== ev;
  });
};

// ── DESIGN TOKENS ────────────────────────────────────────────
const T = {
  pageBg:  '#F9FAFB',
  borderXL: '#F3F4F6',
  rowSel:  'var(--pll)',
  shadow:  '0 1px 3px rgba(0,0,0,.05)',
};

const COLS = '20px 1fr 180px 160px 48px 120px 88px';

// ── ICONS ────────────────────────────────────────────────────
const IconMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconExcel = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeLinecap="round"/>
  </svg>
);
const IconCsv = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round"/>
  </svg>
);
const IconBookmark = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/>
    <path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
  </svg>
);
const IconChevDown = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconMailSm = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconDots = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>
  </svg>
);
const IconPdf = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <path d="M14 2v6h6" strokeLinecap="round"/>
    <path d="M9 15h1.5a1.5 1.5 0 000-3H9v6M15 12v6M15 15h2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconZip = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round"/>
  </svg>
);

// ── CUSTOM CHECKBOX ──────────────────────────────────────────
function Checkbox({ checked, onChange, indeterminate = false }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--p)', borderRadius: 3 }}
    />
  );
}

// ── STATUS BADGE ─────────────────────────────────────────────
const STATUS_COLORS = {
  'in_uitvoering': { bg: '#FFF7ED', color: '#C2410C' },
  'afgerond':      { bg: '#F0FDF4', color: '#16A34A' },
  'concept':       { bg: '#F9FAFB', color: '#6B7280' },
  'gepauzeerd':    { bg: '#FEFCE8', color: '#854D0E' },
  'geannuleerd':   { bg: '#FFF1F2', color: '#BE123C' },
};
function StatusBadge({ status }) {
  const label = PROJECT_STATUS[status]?.label || status || '';
  const s = STATUS_COLORS[status] || { bg: '#F3F4F6', color: '#6B7280' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      background: s.bg, color: s.color,
      borderRadius: 999, fontSize: 10, fontWeight: 600,
      letterSpacing: '.02em',
    }}>
      {label}
    </span>
  );
}

// ── FILTER INPUT ─────────────────────────────────────────────
const FIN = {
  height: 32, background: T.pageBg, border: '1px solid var(--br)',
  borderRadius: 7, fontSize: 12, padding: '0 9px',
  color: 'var(--dk)', width: '100%', boxSizing: 'border-box',
};
const FLBL = {
  fontSize: 10, fontWeight: 600, color: 'var(--dl)',
  textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3,
};

// ── QUICK DROPDOWN ───────────────────────────────────────────
function QuickDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const active = value && value !== 'alles' && value !== '' && (!Array.isArray(value) || value.length > 0);
  const activeLabel = active
    ? (options.find(o => o.value === value || (Array.isArray(value) && value.includes(o.value)))?.label || label)
    : label;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 30, padding: '0 10px', borderRadius: 7,
          border: `1px solid ${active ? 'var(--p)' : 'var(--br)'}`,
          background: active ? 'var(--pll)' : T.pageBg,
          fontSize: 12, fontWeight: active ? 600 : 400,
          color: active ? 'var(--pd)' : 'var(--dmu)', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {activeLabel} <IconChevDown />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          background: 'white', border: '1px solid var(--br)', borderRadius: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,.10)', minWidth: 164, zIndex: 200, overflow: 'hidden',
        }}>
          {options.map(o => {
            const sel = Array.isArray(value) ? value.includes(o.value) : value === o.value;
            return (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  width: '100%', padding: '8px 13px', background: sel ? 'var(--pll)' : 'none',
                  border: 'none', borderBottom: `1px solid ${T.borderXL}`,
                  textAlign: 'left', fontSize: 13, cursor: 'pointer',
                  color: sel ? 'var(--pd)' : 'var(--dk)',
                  fontWeight: sel ? 600 : 400,
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── FILTER BAR ───────────────────────────────────────────────
function FilterBar({ quickTab, setQuickTab, searchQuery, setSearchQuery, filters, setFilter, stadsUniek, active, onClearAll, connectedIntegrations }) {
  const tabs = [
    { id: 'alle', label: 'Alle' },
    { id: 'lopend_project', label: 'Lopend project' },
  ];
  const stadOptions = [{ value: '', label: 'Alle steden' }, ...stadsUniek.map(s => ({ value: s, label: s }))];
  const projectStatusOptions = [
    { value: '', label: 'Alle statussen' },
    { value: 'in_uitvoering', label: 'In uitvoering' },
    { value: 'afgerond', label: 'Afgerond' },
    { value: 'concept', label: 'Concept' },
    { value: 'gepauzeerd', label: 'Gepauzeerd' },
    { value: 'geannuleerd', label: 'Geannuleerd' },
  ];
  const contactOptions = [
    { value: '', label: 'Alle periodes' },
    { value: '7', label: 'Ouder dan 7 dagen' },
    { value: '30', label: 'Ouder dan 30 dagen' },
    { value: '90', label: 'Ouder dan 90 dagen' },
    { value: '180', label: 'Ouder dan 180 dagen' },
  ];
  const moneybirdOptions = [
    { value: 'alles', label: 'Alles' },
    { value: 'ja', label: 'Gesynchroniseerd' },
    { value: 'nee', label: 'Niet gesynchroniseerd' },
  ];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', rowGap: 8,
      background: 'white', borderRadius: 'var(--r14)',
      border: '1px solid var(--border)', boxShadow: T.shadow,
      padding: '9px 14px',
    }}>
      {/* Status tabs */}
      <div style={{ display: 'flex', alignItems: 'center', background: T.pageBg, borderRadius: 8, padding: 2, gap: 1 }}>
        {tabs.map(t => {
          const on = quickTab === t.id;
          return (
            <button key={t.id} onClick={() => setQuickTab(t.id)} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none',
              background: on ? 'white' : 'transparent',
              boxShadow: on ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
              color: on ? 'var(--dk)' : 'var(--dl)',
              fontSize: 12, fontWeight: on ? 600 : 400, cursor: 'pointer',
              transition: 'all .12s',
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--br)', flexShrink: 0, margin: '0 2px' }} />

      {/* Quick filters */}
      <QuickDropdown label="Stad" options={stadOptions} value={filters.stad} onChange={v => setFilter('stad', v)} />
      <QuickDropdown label="Project status" options={projectStatusOptions} value={filters.projectStatussen[0] || ''} onChange={v => setFilter('projectStatussen', v ? [v] : [])} />
      <QuickDropdown label="Laatste contact" options={contactOptions} value={filters.laatsteContactDagen} onChange={v => setFilter('laatsteContactDagen', v)} />
      {connectedIntegrations?.has('moneybird') && <QuickDropdown label="Moneybird sync" options={moneybirdOptions} value={filters.heeftMoneybird} onChange={v => setFilter('heeftMoneybird', v)} />}
      {connectedIntegrations?.has('snelstart') && <QuickDropdown label="SnelStart sync" options={moneybirdOptions} value={filters.heeftMoneybird} onChange={v => setFilter('heeftMoneybird', v)} />}
      {connectedIntegrations?.has('afas') && <QuickDropdown label="AFAS sync" options={moneybirdOptions} value={filters.heeftMoneybird} onChange={v => setFilter('heeftMoneybird', v)} />}

      <div style={{ flex: 1 }} />

      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: T.pageBg, border: '1px solid var(--br)', borderRadius: 7,
        padding: '0 10px', width: 200, height: 30,
      }}>
        <span style={{ color: 'var(--dl)', flexShrink: 0, display: 'flex' }}><IconSearch /></span>
        <input
          type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Zoek klant…"
          style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: 'var(--dk)', width: '100%' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dl)', display: 'flex', padding: 0 }}>
            {I.x}
          </button>
        )}
      </div>

      {active && (
        <button onClick={onClearAll} style={{
          fontSize: 12, fontWeight: 500, color: 'var(--pd)',
          background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', padding: '0 2px',
        }}>
          Wis filters
        </button>
      )}
    </div>
  );
}

// ── FILTER SIDEBAR SECTION ───────────────────────────────────
function FilterSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '8px 0',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 700, color: 'var(--dk)',
          textTransform: 'uppercase', letterSpacing: '.06em',
          borderBottom: open ? 'none' : '1px solid var(--border)',
        }}
      >
        {title}
        <span style={{
          color: 'var(--dl)', transition: 'transform .15s',
          transform: open ? 'rotate(180deg)' : 'none',
          display: 'flex', flexShrink: 0,
        }}>
          <IconChevDown />
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {label && <div style={FLBL}>{label}</div>}
      {children}
    </div>
  );
}

function MultiSelect({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(o => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            onClick={() => onChange(on ? value.filter(v => v !== o.id) : [...value, o.id])}
            style={{
              padding: '3px 9px', borderRadius: 999,
              fontSize: 11, fontWeight: 600,
              border: on ? 'none' : '1px solid var(--br)',
              background: on ? 'var(--p)' : T.pageBg,
              color: on ? 'white' : 'var(--dmu)',
              cursor: 'pointer', transition: 'all .1s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── PAGINATION ───────────────────────────────────────────────
function Pagination({ currentPage, totalPages, onPage }) {
  const range = [];
  const WING = 2;
  let lo = Math.max(1, currentPage - WING);
  let hi = Math.min(totalPages, currentPage + WING);
  if (hi - lo < WING * 2) {
    if (lo === 1) hi = Math.min(totalPages, lo + WING * 2);
    else lo = Math.max(1, hi - WING * 2);
  }
  for (let i = lo; i <= hi; i++) range.push(i);

  const btn = (content, page, disabled, active) => (
    <button
      key={content}
      onClick={() => !disabled && onPage(page)}
      disabled={disabled}
      style={{
        minWidth: 30, height: 30, padding: '0 6px', borderRadius: 6,
        border: '1px solid ' + (active ? 'var(--dk)' : 'var(--br)'),
        background: active ? 'var(--dk)' : 'white',
        color: disabled ? 'var(--dl)' : active ? 'white' : 'var(--dk)',
        fontSize: 12, fontWeight: active ? 700 : 400,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {content}
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {btn(I.chev_l, currentPage - 1, currentPage === 1, false)}
      {lo > 1 && <>{btn(1, 1, false, false)}{lo > 2 && <span style={{ fontSize: 12, color: 'var(--dl)', padding: '0 2px' }}>…</span>}</>}
      {range.map(p => btn(p, p, false, p === currentPage))}
      {hi < totalPages && <>{hi < totalPages - 1 && <span style={{ fontSize: 12, color: 'var(--dl)', padding: '0 2px' }}>…</span>}{btn(totalPages, totalPages, false, false)}</>}
      {btn(I.chev_r, currentPage + 1, currentPage === totalPages, false)}
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────
export function DatabasePage({ openCustomer }) {
  const toast = useToast();
  const { profile, company } = useProfile();

  const [customers, setCustomers]     = useState([]);
  const [projects, setProjects]       = useState([]);
  const [facturen, setFacturen]       = useState([]);
  const [offertes, setOffertes]       = useState([]);
  const [deals, setDeals]             = useState([]);
  const [activities, setActivities]   = useState([]);
  const [sentEmails, setSentEmails]   = useState([]);
  const [urenData, setUrenData]       = useState([]);
  const [stages, setStages]           = useState([]);
  const [templates, setTemplates]     = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [connectedIntegrations, setConnectedIntegrations] = useState(new Set());
  const [loading, setLoading]         = useState(true);

  const [filters, setFilters]             = useState(EMPTY_FILTERS);
  const [quickTab, setQuickTab]           = useState('alle');
  const [searchQuery, setSearchQuery]     = useState('');
  const [segments, setSegments]           = useState(() => {
    try { return JSON.parse(localStorage.getItem('bb_db_segments') || '[]'); } catch { return []; }
  });
  const [segmentName, setSegmentName]         = useState('');
  const [showSaveSegment, setShowSaveSegment] = useState(false);

  const [selected, setSelected]     = useState(new Set());
  const [hoveredRow, setHoveredRow] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 50;

  const [showMailModal, setShowMailModal] = useState(false);
  const [mailForm, setMailForm]           = useState({ templateId: '', subject: '', body: '' });
  const [showRecipients, setShowRecipients] = useState(false);
  const [sending, setSending]             = useState(false);

  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const bulkMenuRef = useRef(null);

  const [rowMenuOpen, setRowMenuOpen]     = useState(null); // customer id
  const rowMenuRef                        = useRef(null);
  const [deleteTarget, setDeleteTarget]   = useState(null); // { id, name }
  const [deleting, setDeleting]           = useState(false);

  const [bulkDownloadProgress, setBulkDownloadProgress] = useState(null); // { current, total, label }

  const setFilter = useCallback((k, v) => {
    setFilters(f => ({ ...f, [k]: v }));
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    if (!showBulkMenu) return;
    const h = e => { if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target)) setShowBulkMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showBulkMenu]);

  useEffect(() => {
    if (!rowMenuOpen) return;
    const h = () => setRowMenuOpen(null);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [rowMenuOpen]);

  // ── Load data ────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      listCustomers(),
      getProjects(),
      getFacturen(),
      getOffertes(),
      listDeals(),
      listActivities(),
      getEmailTemplates(),
      listPipelineStages(),
      (async () => {
        const companyId = await getCompanyId();
        if (!companyId) return [];
        const { data } = await supabase.from('sent_emails').select('id,customer_id,to_email,subject,sent_at,related_type').eq('company_id', companyId);
        return data || [];
      })(),
      (async () => {
        const companyId = await getCompanyId();
        if (!companyId) return [];
        const { data } = await supabase.from('urenregistratie').select('id,project_id,werkbon_id,customer_id,profile_id,uren,datum').eq('company_id', companyId);
        return data || [];
      })(),
      (async () => {
        const companyId = await getCompanyId();
        if (!companyId) return [];
        const { data } = await supabase.from('profiles').select('id,full_name').eq('company_id', companyId);
        return data || [];
      })(),
      (async () => {
        const companyId = await getCompanyId();
        if (!companyId) return [];
        const { data } = await supabase.from('accounting_connections').select('provider,api_token,subscription_key,is_connected').eq('company_id', companyId);
        return data || [];
      })(),
    ]).then(([c, p, f, o, d, a, tpl, st, se, ur, tm, ac]) => {
      setCustomers(c); setProjects(p); setFacturen(f); setOffertes(o);
      setDeals(d); setActivities(a); setTemplates(tpl); setStages(st);
      setSentEmails(se); setUrenData(ur); setTeamMembers(tm);
      const connected = new Set();
      (ac || []).forEach(row => {
        if (row.provider === 'moneybird' && row.api_token) connected.add('moneybird');
        if (row.provider === 'snelstart' && row.subscription_key) connected.add('snelstart');
        if (row.provider === 'afas' && row.is_connected) connected.add('afas');
      });
      setConnectedIntegrations(connected);
    }).catch(err => toast.error(err.message || 'Laden mislukt'))
    .finally(() => setLoading(false));
  }, []);

  // ── Index by customer ────────────────────────────────────────
  const byCustomer = useMemo(() => {
    const m = {};
    const init = id => { if (!m[id]) m[id] = { projects: [], facturen: [], offertes: [], deals: [], activities: [], emails: [], uren: [] }; };
    customers.forEach(c => init(c.id));
    projects.forEach(p => { if (p.customerId) { init(p.customerId); m[p.customerId].projects.push(p); } });
    facturen.forEach(f => { if (f.customerId) { init(f.customerId); m[f.customerId].facturen.push(f); } });
    offertes.forEach(o => { if (o.customerId) { init(o.customerId); m[o.customerId].offertes.push(o); } });
    deals.forEach(d => { if (d.custId) { init(d.custId); m[d.custId].deals.push(d); } });
    activities.forEach(a => { if (a.customerId) { init(a.customerId); m[a.customerId].activities.push(a); } });
    sentEmails.forEach(e => { if (e.customer_id) { init(e.customer_id); m[e.customer_id].emails.push(e); } });
    return m;
  }, [customers, projects, facturen, offertes, deals, activities, sentEmails]);

  // ── Filtering ────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const rel = byCustomer[c.id] || { projects: [], facturen: [], offertes: [], deals: [], activities: [], emails: [], uren: [] };

      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (quickTab === 'lopend_project' && !rel.projects.some(p => p.status === 'in_uitvoering' || p.status === 'gepland')) return false;

      if (filters.stad && !(c.city || '').toLowerCase().includes(filters.stad.toLowerCase())) return false;
      if (filters.aanmaakVan && c.createdAt?.slice(0,10) < filters.aanmaakVan) return false;
      if (filters.aanmaakTot && c.createdAt?.slice(0,10) > filters.aanmaakTot) return false;
      if (filters.heeftKvk !== 'alles') {
        const heeft = Boolean(c.kvkNumber);
        if (filters.heeftKvk === 'ja' && !heeft) return false;
        if (filters.heeftKvk === 'nee' && heeft) return false;
      }
      if (filters.heeftMoneybird !== 'alles') {
        const heeft = Boolean(c.moneybirdId);
        if (filters.heeftMoneybird === 'ja' && !heeft) return false;
        if (filters.heeftMoneybird === 'nee' && heeft) return false;
      }
      if (filters.geenProject && rel.projects.length > 0) return false;
      if (filters.laatsteContactDagen) {
        const cutoff = daysAgo(Number(filters.laatsteContactDagen));
        const lastContact = [...rel.emails, ...rel.activities].map(x => x.sent_at || x.dueAt || '').filter(Boolean).sort().reverse()[0];
        if (lastContact && lastContact.slice(0,10) >= cutoff) return false;
      }
      if (filters.projectStatussen.length > 0 && !rel.projects.some(p => filters.projectStatussen.includes(p.status))) return false;
      if (filters.projectStartVan && !rel.projects.some(p => p.startDate >= filters.projectStartVan)) return false;
      if (filters.projectStartTot && !rel.projects.some(p => p.startDate <= filters.projectStartTot)) return false;
      if (filters.projectDeadlineVan && !rel.projects.some(p => p.deadline >= filters.projectDeadlineVan)) return false;
      if (filters.projectDeadlineTot && !rel.projects.some(p => p.deadline <= filters.projectDeadlineTot)) return false;
      if (filters.heeftOverrun && !rel.projects.some(p => (p.usedHours || 0) > (p.quotedHours || 0))) return false;
      if (filters.heeftLopendProject && !rel.projects.some(p => p.status === 'in_uitvoering' || p.status === 'gepland')) return false;
      if (filters.projectMedewerker && !rel.projects.some(p => p.ownerId === filters.projectMedewerker)) return false;

      if (filters.offerteStatussen.length > 0 && !rel.offertes.some(o => filters.offerteStatussen.includes(o.status))) return false;
      if (filters.offerteVerlopen && !rel.offertes.some(o => o.status === 'verzonden' && o.geldigTot && o.geldigTot < TODAY)) return false;
      if (filters.offerteOndertekend !== 'alles') {
        const isSigned = rel.offertes.some(o => Boolean(o.signedAt));
        if (filters.offerteOndertekend === 'ja' && !isSigned) return false;
        if (filters.offerteOndertekend === 'nee' && isSigned) return false;
      }
      if (filters.offerteBedragMin && !rel.offertes.some(o => o.totaalIncl >= Number(filters.offerteBedragMin))) return false;
      if (filters.offerteBedragMax && !rel.offertes.some(o => o.totaalIncl <= Number(filters.offerteBedragMax))) return false;
      if (filters.offerteMargeMin && !rel.offertes.some(o => (o.margePct || 0) >= Number(filters.offerteMargeMin))) return false;
      if (filters.offerteMargeMax && !rel.offertes.some(o => (o.margePct || 0) <= Number(filters.offerteMargeMax))) return false;

      if (filters.factuurStatussen.length > 0 && !rel.facturen.some(f => filters.factuurStatussen.includes(f.status))) return false;
      if (filters.factuurVervallen && !rel.facturen.some(f => f.status === 'verzonden' && f.vervaldatum && f.vervaldatum < TODAY)) return false;
      if (filters.herinnering1 !== 'alles') {
        const h1 = rel.facturen.some(f => Boolean(f.herinnering1VerstuurdAt));
        if (filters.herinnering1 === 'ja' && !h1) return false;
        if (filters.herinnering1 === 'nee' && h1) return false;
      }
      if (filters.herinnering2 !== 'alles') {
        const h2 = rel.facturen.some(f => Boolean(f.herinnering2VerstuurdAt));
        if (filters.herinnering2 === 'ja' && !h2) return false;
        if (filters.herinnering2 === 'nee' && h2) return false;
      }
      if (filters.isCreditnota && !rel.facturen.some(f => f.isCredit)) return false;
      if (filters.betaaldVan && !rel.facturen.some(f => f.betaaldOp >= filters.betaaldVan)) return false;
      if (filters.betaaldTot && !rel.facturen.some(f => f.betaaldOp <= filters.betaaldTot)) return false;

      if (filters.dealFasen.length > 0 && !rel.deals.some(d => filters.dealFasen.includes(d.stage))) return false;
      if (filters.dealWaardeMin && !rel.deals.some(d => (d.value || 0) >= Number(filters.dealWaardeMin))) return false;
      if (filters.dealWaardeMax && !rel.deals.some(d => (d.value || 0) <= Number(filters.dealWaardeMax))) return false;
      if (filters.heeftOpenActiviteiten && !rel.activities.some(a => !a.completed)) return false;
      if (filters.activiteitTypen.length > 0 && !rel.activities.some(a => filters.activiteitTypen.includes(a.type))) return false;

      if (filters.heeftMail !== 'alles') {
        const heeft = rel.emails.length > 0;
        if (filters.heeftMail === 'ja' && !heeft) return false;
        if (filters.heeftMail === 'nee' && heeft) return false;
      }
      if (filters.mailOuderDanDagen) {
        const cutoff = daysAgo(Number(filters.mailOuderDanDagen));
        const lastMail = rel.emails.map(e => e.sent_at || '').filter(Boolean).sort().reverse()[0];
        if (lastMail && lastMail.slice(0,10) >= cutoff) return false;
      }
      if (filters.mailTemplateType && !rel.emails.some(e => e.related_type === filters.mailTemplateType)) return false;

      if (filters.heeftFactureerbareUren) {
        // Uren leven in urenregistratie: gekoppeld aan de klant direct (customer_id)
        // of aan een project van deze klant (project_id).
        const custProjects = rel.projects.map(p => p.id);
        const heeftUren = urenData.some(u =>
          (u.customer_id && u.customer_id === c.id) || custProjects.includes(u.project_id)
        );
        if (!heeftUren) return false;
      }

      if (filters.heeftOffertes && rel.offertes.length === 0) return false;
      if (filters.heeftFacturen && rel.facturen.length === 0) return false;
      if (filters.heeftGetekendOfferte && !rel.offertes.some(o => Boolean(o.signedAt))) return false;
      if (filters.heeftOnbetaaldeFacturen && !rel.facturen.some(f => f.status !== 'betaald' && !f.isCredit)) return false;
      if (filters.heeftVerlopenOffertes && !rel.offertes.some(o => o.status === 'verzonden' && o.geldigTot && o.geldigTot < TODAY)) return false;
      if (filters.documentenPeriodeVan) {
        const hasDoc = rel.offertes.some(o => (o.createdAt||'').slice(0,10) >= filters.documentenPeriodeVan) ||
                       rel.facturen.some(f => (f.factuurdatum||'') >= filters.documentenPeriodeVan);
        if (!hasDoc) return false;
      }
      if (filters.documentenPeriodeTot) {
        const hasDoc = rel.offertes.some(o => (o.createdAt||'').slice(0,10) <= filters.documentenPeriodeTot) ||
                       rel.facturen.some(f => (f.factuurdatum||'') <= filters.documentenPeriodeTot);
        if (!hasDoc) return false;
      }

      return true;
    });
  }, [customers, byCustomer, filters, urenData, quickTab, searchQuery]);

  // ── Pagination ───────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PER_PAGE));
  const pageSlice  = filteredCustomers.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  // ── Selection ────────────────────────────────────────────────
  const allPageSelected  = pageSlice.length > 0 && pageSlice.every(c => selected.has(c.id));
  const somePageSelected = pageSlice.some(c => selected.has(c.id)) && !allPageSelected;
  const toggleAll = () => {
    if (allPageSelected) {
      setSelected(s => { const n = new Set(s); pageSlice.forEach(c => n.delete(c.id)); return n; });
    } else {
      setSelected(s => { const n = new Set(s); pageSlice.forEach(c => n.add(c.id)); return n; });
    }
  };
  const toggleOne = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedCustomers = customers.filter(c => selected.has(c.id));

  // ── Segments ─────────────────────────────────────────────────
  const saveSegment = () => {
    if (!segmentName.trim()) return;
    const newSegs = [...segments, { name: segmentName.trim(), filters }];
    setSegments(newSegs);
    localStorage.setItem('bb_db_segments', JSON.stringify(newSegs));
    setSegmentName('');
    setShowSaveSegment(false);
    toast.success('Segment opgeslagen');
  };
  const deleteSegment = name => {
    const newSegs = segments.filter(s => s.name !== name);
    setSegments(newSegs);
    localStorage.setItem('bb_db_segments', JSON.stringify(newSegs));
  };

  // ── Row-level acties ─────────────────────────────────────────
  const openSingleMail = (cust) => {
    setSelected(new Set([cust.id]));
    setMailForm({ templateId: '', subject: '', body: '' });
    setShowRecipients(false);
    setShowMailModal(true);
  };

  const doDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(deleteTarget.id);
      setCustomers(cs => cs.filter(c => c.id !== deleteTarget.id));
      setSelected(s => { const n = new Set(s); n.delete(deleteTarget.id); return n; });
      toast.success(`${deleteTarget.name} verwijderd`);
      setDeleteTarget(null);
    } catch { toast.error('Verwijderen mislukt'); }
    finally { setDeleting(false); }
  };

  // ── Bulk mail ────────────────────────────────────────────────
  const mailBodyRef = useRef(null);

  const openMailModal = () => {
    setMailForm({ templateId: '', subject: '', body: '' });
    setShowRecipients(false);
    setShowMailModal(true);
  };

  const handleMailTemplateChange = (tplId) => {
    if (!tplId) {
      setMailForm({ templateId: '', subject: '', body: '' });
      return;
    }
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) return;
    const newBody = tpl.body || '';
    setMailForm({ templateId: tplId, subject: tpl.onderwerp || '', body: newBody });
    if (mailBodyRef.current) mailBodyRef.current.setHtml(plainToEditorHtml(newBody));
  };

  const handleSendMail = async () => {
    if (!mailForm.subject.trim()) { toast.error('Vul een onderwerp in'); return; }
    if (!mailForm.body.trim())    { toast.error('Schrijf een bericht'); return; }
    setSending(true);
    let ok = 0, skipped = 0;
    try {
      for (const c of selectedCustomers) {
        if (!c.email) { skipped++; continue; }
        const vars = { klant_naam: c.name, bedrijfsnaam: c.name };
        const subject = substituteVars(mailForm.subject, vars);
        const body    = substituteVars(mailForm.body, vars);
        const html    = body.split('\n').map(l => l.trim() === '' ? '<br>' : `<p style="margin:0 0 6px">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('');
        const tpl     = templates.find(t => t.id === mailForm.templateId);
        try {
          await sendEmail({ to: c.email, subject, html });
          await logSentEmail({ toEmail: c.email, subject, bodyHtml: html, relatedType: tpl?.type || 'algemeen', customerId: c.id });
          logTijdlijnSafe(c.id, 'email_verstuurd', `E-mail verstuurd: ${subject}`, { to: c.email, subject });
          ok++;
        } catch { skipped++; }
      }
      toast.success(`Mail verstuurd naar ${ok} klant${ok !== 1 ? 'en' : ''}${skipped > 0 ? `, ${skipped} overgeslagen` : ''}`);
      setShowMailModal(false);
      setSelected(new Set());
    } finally { setSending(false); }
  };

  // ── Export ───────────────────────────────────────────────────
  const EXPORT_COLS = [
    { key: 'Naam',                      width: 28 },
    { key: 'Email',                     width: 32 },
    { key: 'Telefoon',                  width: 18 },
    { key: 'Adres',                     width: 28 },
    { key: 'Postcode',                  width: 12 },
    { key: 'Stad',                      width: 18 },
    { key: 'KvK-nummer',               width: 16 },
    { key: 'BTW-nummer',               width: 16 },
    { key: 'IBAN',                      width: 22 },
    { key: 'Type',                      width: 14 },
    { key: 'Bron',                      width: 16 },
    { key: 'Aantal projecten',          width: 16 },
    { key: 'Aantal offertes',           width: 16 },
    { key: 'Aantal facturen',           width: 16 },
    { key: 'Totaal geoffreerd',         width: 18 },
    { key: 'Totaal betaald',            width: 16 },
    { key: 'Openstaand bedrag',         width: 18 },
    { key: 'Laatste project naam',      width: 26 },
    { key: 'Laatste project datum',     width: 20 },
    { key: 'Laatste project status',    width: 20 },
    { key: 'Laatste mail datum',        width: 18 },
    { key: 'Laatste mail onderwerp',    width: 36 },
    { key: 'Aanmaakdatum',             width: 14 },
    { key: 'Moneybird gesynchroniseerd', width: 22 },
  ];

  const buildExportRows = () => selectedCustomers.map(c => {
    const rel = byCustomer[c.id] || { projects: [], facturen: [], offertes: [], emails: [] };
    const lastProject = [...rel.projects].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))[0];
    const lastEmail   = [...rel.emails].sort((a,b) => (b.sent_at||'').localeCompare(a.sent_at||''))[0];

    const totaalGeoffreerd = rel.offertes.reduce((s,o) => s + (o.totaalIncl||0), 0);
    const totaalBetaald    = rel.facturen.filter(f => f.status === 'betaald' && !f.isCredit).reduce((s,f) => s + (f.totaalIncl||0), 0);
    const openstaand       = rel.facturen.filter(f => f.status !== 'betaald' && !f.isCredit).reduce((s,f) => s + (f.totaalIncl||0), 0);

    const fmtEuro = n => n > 0 ? Number(n).toFixed(2).replace('.', ',') : '0,00';

    return {
      'Naam':                       c.name || '',
      'Email':                      c.email || '',
      'Telefoon':                   c.phone || '',
      'Adres':                      c.address || '',
      'Postcode':                   c.postcode || '',
      'Stad':                       c.city || '',
      'KvK-nummer':                c.kvkNumber || '',
      'BTW-nummer':                c.btwNumber || '',
      'IBAN':                       c.iban || '',
      'Type':                       c.type || '',
      'Bron':                       c.source || '',
      'Aantal projecten':           rel.projects.length,
      'Aantal offertes':            rel.offertes.length,
      'Aantal facturen':            rel.facturen.filter(f => !f.isCredit).length,
      'Totaal geoffreerd':          fmtEuro(totaalGeoffreerd),
      'Totaal betaald':             fmtEuro(totaalBetaald),
      'Openstaand bedrag':          fmtEuro(openstaand),
      'Laatste project naam':       lastProject?.name || '',
      'Laatste project datum':      lastProject?.createdAt ? lastProject.createdAt.slice(0,10) : '',
      'Laatste project status':     lastProject?.status || '',
      'Laatste mail datum':         lastEmail?.sent_at ? lastEmail.sent_at.slice(0,10) : '',
      'Laatste mail onderwerp':     lastEmail?.subject || '',
      'Aanmaakdatum':              c.createdAt ? c.createdAt.slice(0,10) : '',
      'Moneybird gesynchroniseerd': c.moneybirdId ? 'Ja' : 'Nee',
    };
  });

  const exportExcel = async () => {
    try {
      const rows = buildExportRows();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Klanten');
      ws.columns = EXPORT_COLS.map(c => ({ header: c.key, key: c.key, width: c.width }));
      ws.getRow(1).font = { bold: true };
      rows.forEach(r => ws.addRow(r));
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `BossBase-export-${TODAY}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      rows.forEach((_, i) => { const c = selectedCustomers[i]; if (c?.id) logTijdlijnSafe(c.id, 'export_uitgevoerd', 'Klantgegevens geëxporteerd als Excel'); });
      setShowBulkMenu(false);
      toast.success(`${rows.length} klanten geëxporteerd als Excel`);
    } catch (err) { toast.error('Excel export mislukt: ' + (err.message || '')); }
  };

  const exportCsv = () => {
    const rows = buildExportRows();
    const headers = EXPORT_COLS.map(c => c.key);
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape), ...rows.map(r => headers.map(h => escape(r[h])))].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `BossBase-export-${TODAY}.csv`; a.click();
    URL.revokeObjectURL(url);
    rows.forEach((_, i) => { const c = selectedCustomers[i]; if (c?.id) logTijdlijnSafe(c.id, 'export_uitgevoerd', 'Klantgegevens geëxporteerd als CSV'); });
    setShowBulkMenu(false);
    toast.success(`${rows.length} klanten geëxporteerd als CSV`);
  };

  // ── Bulk PDF downloads ───────────────────────────────────────
  const slugify = s => (s || '').replace(/[^a-zA-Z0-9À-ɏ]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const triggerZipDownload = async (zip, filename) => {
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const bulkDownloadOffertes = async () => {
    setShowBulkMenu(false);
    const pairs = selectedCustomers.flatMap(c =>
      (byCustomer[c.id]?.offertes || []).map(o => ({ offerte: o, customer: c }))
    );
    if (pairs.length === 0) { toast.error('Geen offertes gevonden voor de selectie'); return; }
    const zip = new JSZip();
    setBulkDownloadProgress({ current: 0, total: pairs.length, label: 'offertes' });
    try {
      for (let i = 0; i < pairs.length; i++) {
        const { offerte, customer } = pairs[i];
        setBulkDownloadProgress({ current: i + 1, total: pairs.length, label: 'offertes' });
        const items = await getOfferteItems(offerte.id);
        const b64 = await getOffertePdfBase64(offerte, items, customer, company);
        const filename = `Offerte-${slugify(offerte.nummer)}-${slugify(customer.name)}.pdf`;
        zip.file(filename, b64, { base64: true });
      }
      await triggerZipDownload(zip, `BossBase-offertes-${TODAY}.zip`);
      toast.success(`${pairs.length} offerte${pairs.length !== 1 ? 's' : ''} gedownload`);
    } catch (err) { toast.error('Download mislukt: ' + (err.message || '')); }
    finally { setBulkDownloadProgress(null); }
  };

  const bulkDownloadFacturen = async () => {
    setShowBulkMenu(false);
    const pairs = selectedCustomers.flatMap(c =>
      (byCustomer[c.id]?.facturen || []).map(f => ({ factuur: f, customer: c }))
    );
    if (pairs.length === 0) { toast.error('Geen facturen gevonden voor de selectie'); return; }
    const zip = new JSZip();
    setBulkDownloadProgress({ current: 0, total: pairs.length, label: 'facturen' });
    try {
      for (let i = 0; i < pairs.length; i++) {
        const { factuur, customer } = pairs[i];
        setBulkDownloadProgress({ current: i + 1, total: pairs.length, label: 'facturen' });
        const regels = await getFactuurRegels(factuur.id);
        const b64 = await getFactuurPdfBase64(factuur, regels, customer, company);
        const filename = `Factuur-${slugify(factuur.nummer)}-${slugify(customer.name)}.pdf`;
        zip.file(filename, b64, { base64: true });
      }
      await triggerZipDownload(zip, `BossBase-facturen-${TODAY}.zip`);
      toast.success(`${pairs.length} factuur${pairs.length !== 1 ? 'en' : ''} gedownload`);
    } catch (err) { toast.error('Download mislukt: ' + (err.message || '')); }
    finally { setBulkDownloadProgress(null); }
  };

  const bulkDownloadGetekend = async () => {
    setShowBulkMenu(false);
    const pairs = selectedCustomers.flatMap(c =>
      (byCustomer[c.id]?.offertes || [])
        .filter(o => Boolean(o.signedAt))
        .map(o => ({ offerte: o, customer: c }))
    );
    if (pairs.length === 0) { toast.error('Geen getekende offertes gevonden voor de selectie'); return; }
    const zip = new JSZip();
    setBulkDownloadProgress({ current: 0, total: pairs.length, label: 'getekende offertes' });
    try {
      for (let i = 0; i < pairs.length; i++) {
        const { offerte, customer } = pairs[i];
        setBulkDownloadProgress({ current: i + 1, total: pairs.length, label: 'getekende offertes' });
        const filename = `GetekendOfferte-${slugify(offerte.nummer)}-${slugify(customer.name)}.pdf`;
        // Probeer eerst de opgeslagen getekende PDF op te halen; val terug op gegenereerde PDF
        let added = false;
        if (offerte.signedPdfUrl) {
          try {
            const resp = await fetch(offerte.signedPdfUrl);
            if (resp.ok) {
              const buf = await resp.arrayBuffer();
              zip.file(filename, buf);
              added = true;
            }
          } catch { /* val terug op gegenereerde PDF */ }
        }
        if (!added) {
          const items = await getOfferteItems(offerte.id);
          const b64 = await getOffertePdfBase64(offerte, items, customer, company);
          zip.file(filename, b64, { base64: true });
        }
      }
      await triggerZipDownload(zip, `BossBase-getekende-offertes-${TODAY}.zip`);
      toast.success(`${pairs.length} getekende offerte${pairs.length !== 1 ? 's' : ''} gedownload`);
    } catch (err) { toast.error('Download mislukt: ' + (err.message || '')); }
    finally { setBulkDownloadProgress(null); }
  };

  const bulkDownloadCreditfacturen = async () => {
    setShowBulkMenu(false);
    const pairs = selectedCustomers.flatMap(c =>
      (byCustomer[c.id]?.facturen || [])
        .filter(f => f.isCredit)
        .map(f => ({ factuur: f, customer: c }))
    );
    if (pairs.length === 0) { toast.error('Geen creditfacturen gevonden voor de selectie'); return; }
    const zip = new JSZip();
    setBulkDownloadProgress({ current: 0, total: pairs.length, label: 'creditfacturen' });
    try {
      for (let i = 0; i < pairs.length; i++) {
        const { factuur, customer } = pairs[i];
        setBulkDownloadProgress({ current: i + 1, total: pairs.length, label: 'creditfacturen' });
        const regels = await getFactuurRegels(factuur.id);
        const b64 = await getFactuurPdfBase64(factuur, regels, customer, company);
        const filename = `Creditfactuur-${slugify(factuur.nummer)}-${slugify(customer.name)}.pdf`;
        zip.file(filename, b64, { base64: true });
      }
      await triggerZipDownload(zip, `BossBase-creditfacturen-${TODAY}.zip`);
      toast.success(`${pairs.length} creditfactuur${pairs.length !== 1 ? 'en' : ''} gedownload`);
    } catch (err) { toast.error('Download mislukt: ' + (err.message || '')); }
    finally { setBulkDownloadProgress(null); }
  };

  const bulkDownloadAlles = async () => {
    setShowBulkMenu(false);
    const offertePairs = selectedCustomers.flatMap(c =>
      (byCustomer[c.id]?.offertes || []).map(o => ({ offerte: o, customer: c }))
    );
    const factuurPairs = selectedCustomers.flatMap(c =>
      (byCustomer[c.id]?.facturen || []).map(f => ({ factuur: f, customer: c }))
    );
    const total = offertePairs.length + factuurPairs.length;
    if (total === 0) { toast.error('Geen documenten gevonden voor de selectie'); return; }
    const zip = new JSZip();
    const offerteFolder = zip.folder('Offertes');
    const factuurFolder = zip.folder('Facturen');
    setBulkDownloadProgress({ current: 0, total, label: 'documenten' });
    try {
      let done = 0;
      for (const { offerte, customer } of offertePairs) {
        setBulkDownloadProgress({ current: ++done, total, label: 'documenten' });
        const items = await getOfferteItems(offerte.id);
        const b64 = await getOffertePdfBase64(offerte, items, customer, company);
        offerteFolder.file(`Offerte-${slugify(offerte.nummer)}-${slugify(customer.name)}.pdf`, b64, { base64: true });
      }
      for (const { factuur, customer } of factuurPairs) {
        setBulkDownloadProgress({ current: ++done, total, label: 'documenten' });
        const regels = await getFactuurRegels(factuur.id);
        const b64 = await getFactuurPdfBase64(factuur, regels, customer, company);
        factuurFolder.file(`Factuur-${slugify(factuur.nummer)}-${slugify(customer.name)}.pdf`, b64, { base64: true });
      }
      await triggerZipDownload(zip, `BossBase-export-${TODAY}.zip`);
      toast.success(`${total} document${total !== 1 ? 'en' : ''} gedownload`);
    } catch (err) { toast.error('Download mislukt: ' + (err.message || '')); }
    finally { setBulkDownloadProgress(null); }
  };

  // ── Display meta ─────────────────────────────────────────────
  const custMeta = useMemo(() => {
    const m = {};
    customers.forEach(c => {
      const rel = byCustomer[c.id] || { projects: [], facturen: [], emails: [] };
      const lastProject = [...rel.projects].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))[0];
      const lastEmail   = [...rel.emails].sort((a,b) => (b.sent_at||'').localeCompare(a.sent_at||''))[0];
      const omzet = rel.facturen.filter(f => f.status === 'betaald' && !f.isCredit).reduce((s,f) => s + (f.totaalIncl||0), 0);
      m[c.id] = { lastProject, lastEmail, omzet, projectCount: rel.projects.length };
    });
    return m;
  }, [customers, byCustomer]);

  const active       = hasActiveFilters(filters) || quickTab !== 'alle' || Boolean(searchQuery);
  const stadsUniek   = useMemo(() => [...new Set(customers.map(c => c.city).filter(Boolean))].sort(), [customers]);
  const templateTypes = [...new Set(templates.map(t => t.type))];
  const OFFERTE_STATUSSEN  = [{ id: 'concept', label: 'Concept' }, { id: 'verzonden', label: 'Verzonden' }, { id: 'geaccepteerd', label: 'Geaccepteerd' }, { id: 'afgewezen', label: 'Afgewezen' }];
  const FACTUUR_STATUSSEN  = [{ id: 'aangemaakt', label: 'Aangemaakt' }, { id: 'verzonden', label: 'Verzonden' }, { id: 'betaald', label: 'Betaald' }];
  const ACTIVITEIT_TYPEN   = [{ id: 'call', label: 'Bellen' }, { id: 'email', label: 'E-mail' }, { id: 'visit', label: 'Bezoek' }, { id: 'task', label: 'Taak' }, { id: 'follow', label: 'Follow-up' }];
  const PROJECT_STATUSSEN  = Object.entries(PROJECT_STATUS).map(([id, v]) => ({ id, label: v.label }));
  const teamOpties         = teamMembers.map(m => ({ id: m.id, label: m.full_name }));
  const clearAll = () => { setFilters(EMPTY_FILTERS); setQuickTab('alle'); setSearchQuery(''); setCurrentPage(1); };

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--dl)', fontSize: 14 }}>Database laden…</div>
  );

  // ── TH style ─────────────────────────────────────────────────
  const TH = { fontSize: 10, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.07em' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* ── Page header ── */}
      <div className="page-hd afu">
        <div>
          <h1>Database</h1>
          <p style={{ color: 'var(--dl)', fontSize: 12, marginTop: 2 }}>
            {active ? `${filteredCustomers.length} van ${customers.length} klanten` : `${customers.length} klanten`}
          </p>
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm" onClick={() => setShowSaveSegment(s => !s)}>
            Segment opslaan
          </button>
        </div>
      </div>

      {/* ── Saved segments ── */}
      {segments.length > 0 && (
        <div className="afu2" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
          {segments.map(seg => (
            <div key={seg.name} style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'white', border: '1px solid var(--border)',
              borderRadius: 999, overflow: 'hidden', boxShadow: T.shadow,
            }}>
              <button
                onClick={() => { setFilters(seg.filters); setCurrentPage(1); }}
                style={{ padding: '4px 11px 4px 13px', fontSize: 12, fontWeight: 600, color: 'var(--dk)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {seg.name}
              </button>
              <button
                onClick={() => deleteSegment(seg.name)}
                style={{ padding: '4px 8px', color: 'var(--dl)', background: 'none', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {I.x}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Save segment input ── */}
      {showSaveSegment && (
        <div className="afu2" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            type="text" placeholder="Naam voor dit segment…" value={segmentName}
            onChange={e => setSegmentName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveSegment()}
            style={{ flex: 1, maxWidth: 280 }} autoFocus
          />
          <button className="btn btn-p btn-sm" onClick={saveSegment}>Opslaan</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSaveSegment(false)}>Annuleren</button>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="afu2" style={{ marginBottom: 14, position: 'relative', zIndex: 20 }}>
        <FilterBar
          quickTab={quickTab}
          setQuickTab={t => { setQuickTab(t); setCurrentPage(1); }}
          searchQuery={searchQuery}
          setSearchQuery={q => { setSearchQuery(q); setCurrentPage(1); }}
          filters={filters} setFilter={setFilter}
          stadsUniek={stadsUniek} active={active} onClearAll={clearAll}
          connectedIntegrations={connectedIntegrations}
        />
      </div>

      {/* ── Body ── */}
      <div className="afu2" style={{ display: 'grid', gridTemplateColumns: '216px 1fr', gap: 14, alignItems: 'start', position: 'relative', zIndex: 1 }}>

        {/* ── Sidebar ── */}
        <div style={{
          background: 'white', borderRadius: 'var(--r14)',
          border: '1px solid var(--border)', boxShadow: T.shadow,
          padding: '4px 14px 14px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--dl)',
            textTransform: 'uppercase', letterSpacing: '.07em',
            padding: '12px 0 10px', borderBottom: '1px solid var(--border)', marginBottom: 2,
          }}>
            Geavanceerde filters
          </div>

          <FilterSection title="Klant" defaultOpen>
            <FilterRow label="Stad / regio">
              <input list="steden" type="text" value={filters.stad} onChange={e => setFilter('stad', e.target.value)} placeholder="Alle steden" style={FIN} />
              <datalist id="steden">{stadsUniek.map(s => <option key={s} value={s} />)}</datalist>
            </FilterRow>
            <FilterRow label="Aangemaakt van"><input type="date" value={filters.aanmaakVan} onChange={e => setFilter('aanmaakVan', e.target.value)} style={FIN} /></FilterRow>
            <FilterRow label="Aangemaakt tot"><input type="date" value={filters.aanmaakTot} onChange={e => setFilter('aanmaakTot', e.target.value)} style={FIN} /></FilterRow>
            <FilterRow label="KvK-nummer">
              <select value={filters.heeftKvk} onChange={e => setFilter('heeftKvk', e.target.value)} style={FIN}>
                <option value="alles">Alles</option>
                <option value="ja">Heeft KvK</option>
                <option value="nee">Geen KvK</option>
              </select>
            </FilterRow>
            {connectedIntegrations.has('moneybird') && (
              <FilterRow label="Moneybird sync">
                <select value={filters.heeftMoneybird} onChange={e => setFilter('heeftMoneybird', e.target.value)} style={FIN}>
                  <option value="alles">Alles</option>
                  <option value="ja">Gesynchroniseerd</option>
                  <option value="nee">Niet gesynchroniseerd</option>
                </select>
              </FilterRow>
            )}
            {connectedIntegrations.has('snelstart') && (
              <FilterRow label="SnelStart sync">
                <select value={filters.heeftMoneybird} onChange={e => setFilter('heeftMoneybird', e.target.value)} style={FIN}>
                  <option value="alles">Alles</option>
                  <option value="ja">Gesynchroniseerd</option>
                  <option value="nee">Niet gesynchroniseerd</option>
                </select>
              </FilterRow>
            )}
            {connectedIntegrations.has('afas') && (
              <FilterRow label="AFAS sync">
                <select value={filters.heeftMoneybird} onChange={e => setFilter('heeftMoneybird', e.target.value)} style={FIN}>
                  <option value="alles">Alles</option>
                  <option value="ja">Gesynchroniseerd</option>
                  <option value="nee">Niet gesynchroniseerd</option>
                </select>
              </FilterRow>
            )}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.geenProject} onChange={e => setFilter('geenProject', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Nog nooit een project
            </label>
            <FilterRow label="Laatste contact ouder dan (dagen)">
              <input type="number" min="0" value={filters.laatsteContactDagen} onChange={e => setFilter('laatsteContactDagen', e.target.value)} placeholder="Bijv. 90" style={FIN} />
            </FilterRow>
          </FilterSection>

          <FilterSection title="Projecten">
            <FilterRow label="Status">
              <MultiSelect options={PROJECT_STATUSSEN} value={filters.projectStatussen} onChange={v => setFilter('projectStatussen', v)} />
            </FilterRow>
            <FilterRow label="Startdatum van"><input type="date" value={filters.projectStartVan} onChange={e => setFilter('projectStartVan', e.target.value)} style={FIN} /></FilterRow>
            <FilterRow label="Startdatum tot"><input type="date" value={filters.projectStartTot} onChange={e => setFilter('projectStartTot', e.target.value)} style={FIN} /></FilterRow>
            <FilterRow label="Deadline van"><input type="date" value={filters.projectDeadlineVan} onChange={e => setFilter('projectDeadlineVan', e.target.value)} style={FIN} /></FilterRow>
            <FilterRow label="Deadline tot"><input type="date" value={filters.projectDeadlineTot} onChange={e => setFilter('projectDeadlineTot', e.target.value)} style={FIN} /></FilterRow>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftLopendProject} onChange={e => setFilter('heeftLopendProject', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft lopend project
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftOverrun} onChange={e => setFilter('heeftOverrun', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft overrun
            </label>
            {teamOpties.length > 0 && (
              <FilterRow label="Medewerker">
                <select value={filters.projectMedewerker} onChange={e => setFilter('projectMedewerker', e.target.value)} style={FIN}>
                  <option value="">Alle medewerkers</option>
                  {teamOpties.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </FilterRow>
            )}
          </FilterSection>

          <FilterSection title="Offertes">
            <FilterRow label="Status">
              <MultiSelect options={OFFERTE_STATUSSEN} value={filters.offerteStatussen} onChange={v => setFilter('offerteStatussen', v)} />
            </FilterRow>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.offerteVerlopen} onChange={e => setFilter('offerteVerlopen', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft verlopen offerte
            </label>
            <FilterRow label="Digitaal ondertekend">
              <select value={filters.offerteOndertekend} onChange={e => setFilter('offerteOndertekend', e.target.value)} style={FIN}>
                <option value="alles">Alles</option>
                <option value="ja">Ondertekend</option>
                <option value="nee">Niet ondertekend</option>
              </select>
            </FilterRow>
            <FilterRow label="Bedrag min (€)"><input type="number" min="0" value={filters.offerteBedragMin} onChange={e => setFilter('offerteBedragMin', e.target.value)} placeholder="0" style={FIN} /></FilterRow>
            <FilterRow label="Bedrag max (€)"><input type="number" min="0" value={filters.offerteBedragMax} onChange={e => setFilter('offerteBedragMax', e.target.value)} placeholder="∞" style={FIN} /></FilterRow>
            <FilterRow label="Marge min (%)"><input type="number" min="0" max="100" value={filters.offerteMargeMin} onChange={e => setFilter('offerteMargeMin', e.target.value)} placeholder="0" style={FIN} /></FilterRow>
            <FilterRow label="Marge max (%)"><input type="number" min="0" max="100" value={filters.offerteMargeMax} onChange={e => setFilter('offerteMargeMax', e.target.value)} placeholder="100" style={FIN} /></FilterRow>
          </FilterSection>

          <FilterSection title="Facturen">
            <FilterRow label="Status">
              <MultiSelect options={FACTUUR_STATUSSEN} value={filters.factuurStatussen} onChange={v => setFilter('factuurStatussen', v)} />
            </FilterRow>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.factuurVervallen} onChange={e => setFilter('factuurVervallen', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft vervallen factuur
            </label>
            <FilterRow label="Herinnering 1">
              <select value={filters.herinnering1} onChange={e => setFilter('herinnering1', e.target.value)} style={FIN}>
                <option value="alles">Alles</option><option value="ja">Verstuurd</option><option value="nee">Niet verstuurd</option>
              </select>
            </FilterRow>
            <FilterRow label="Herinnering 2">
              <select value={filters.herinnering2} onChange={e => setFilter('herinnering2', e.target.value)} style={FIN}>
                <option value="alles">Alles</option><option value="ja">Verstuurd</option><option value="nee">Niet verstuurd</option>
              </select>
            </FilterRow>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.isCreditnota} onChange={e => setFilter('isCreditnota', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft creditnota
            </label>
            <FilterRow label="Betaald van"><input type="date" value={filters.betaaldVan} onChange={e => setFilter('betaaldVan', e.target.value)} style={FIN} /></FilterRow>
            <FilterRow label="Betaald tot"><input type="date" value={filters.betaaldTot} onChange={e => setFilter('betaaldTot', e.target.value)} style={FIN} /></FilterRow>
          </FilterSection>

          <FilterSection title="CRM Pipeline">
            {stages.length > 0 && (
              <FilterRow label="Fase">
                <MultiSelect options={stages.map(s => ({ id: s.id, label: s.name }))} value={filters.dealFasen} onChange={v => setFilter('dealFasen', v)} />
              </FilterRow>
            )}
            <FilterRow label="Dealwaarde min (€)"><input type="number" min="0" value={filters.dealWaardeMin} onChange={e => setFilter('dealWaardeMin', e.target.value)} placeholder="0" style={FIN} /></FilterRow>
            <FilterRow label="Dealwaarde max (€)"><input type="number" min="0" value={filters.dealWaardeMax} onChange={e => setFilter('dealWaardeMax', e.target.value)} placeholder="∞" style={FIN} /></FilterRow>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftOpenActiviteiten} onChange={e => setFilter('heeftOpenActiviteiten', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft open activiteiten
            </label>
            <FilterRow label="Activiteitstype">
              <MultiSelect options={ACTIVITEIT_TYPEN} value={filters.activiteitTypen} onChange={v => setFilter('activiteitTypen', v)} />
            </FilterRow>
          </FilterSection>

          <FilterSection title="Communicatie">
            <FilterRow label="Heeft mail ontvangen">
              <select value={filters.heeftMail} onChange={e => setFilter('heeftMail', e.target.value)} style={FIN}>
                <option value="alles">Alles</option><option value="ja">Ja</option><option value="nee">Nee</option>
              </select>
            </FilterRow>
            <FilterRow label="Laatste mail ouder dan (dagen)">
              <input type="number" min="0" value={filters.mailOuderDanDagen} onChange={e => setFilter('mailOuderDanDagen', e.target.value)} placeholder="Bijv. 30" style={FIN} />
            </FilterRow>
            {templateTypes.length > 0 && (
              <FilterRow label="Mail type ontvangen">
                <select value={filters.mailTemplateType} onChange={e => setFilter('mailTemplateType', e.target.value)} style={FIN}>
                  <option value="">Alle types</option>
                  {templateTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FilterRow>
            )}
          </FilterSection>

          <FilterSection title="Uren">
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftFactureerbareUren} onChange={e => setFilter('heeftFactureerbareUren', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft factureerbare uren
            </label>
          </FilterSection>

          <FilterSection title="Documenten">
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftOffertes} onChange={e => setFilter('heeftOffertes', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft offertes
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftFacturen} onChange={e => setFilter('heeftFacturen', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft facturen
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftGetekendOfferte} onChange={e => setFilter('heeftGetekendOfferte', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft getekende offerte
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftOnbetaaldeFacturen} onChange={e => setFilter('heeftOnbetaaldeFacturen', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft onbetaalde facturen
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftVerlopenOffertes} onChange={e => setFilter('heeftVerlopenOffertes', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft verlopen offertes
            </label>
            <FilterRow label="Periode van">
              <input type="date" value={filters.documentenPeriodeVan} onChange={e => setFilter('documentenPeriodeVan', e.target.value)} style={FIN} />
            </FilterRow>
            <FilterRow label="Periode tot">
              <input type="date" value={filters.documentenPeriodeTot} onChange={e => setFilter('documentenPeriodeTot', e.target.value)} style={FIN} />
            </FilterRow>
          </FilterSection>
        </div>

        {/* ── Table card ── */}
        <div style={{
          background: 'white', borderRadius: 'var(--r14)',
          border: '1px solid var(--border)', boxShadow: T.shadow,
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
            padding: '8px 16px', borderBottom: `1px solid ${T.borderXL}`,
          }}>
            <Checkbox checked={allPageSelected} indeterminate={somePageSelected} onChange={toggleAll} />
            <div style={TH}>Klant</div>
            <div style={TH}>Laatste project</div>
            <div style={TH}>Laatste mail</div>
            <div style={{ ...TH, textAlign: 'center' }}>Projecten</div>
            <div style={{ ...TH, textAlign: 'right' }}>Omzet</div>
            <div style={{ ...TH, textAlign: 'right' }}>Acties</div>
          </div>

          {/* Rows */}
          {pageSlice.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--dl)', fontSize: 13 }}>
              {active ? 'Geen klanten gevonden met deze filters.' : 'Geen klanten.'}
            </div>
          ) : pageSlice.map((c, i) => {
            const meta       = custMeta[c.id] || {};
            const isSelected = selected.has(c.id);
            const isHovered  = hoveredRow === c.id;
            return (
              <div
                key={c.id}
                onMouseEnter={() => setHoveredRow(c.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
                  padding: '10px 16px',
                  borderLeft: `3px solid ${isSelected ? 'var(--p)' : 'transparent'}`,
                  borderBottom: i < pageSlice.length - 1 ? `1px solid ${T.borderXL}` : 'none',
                  background: isSelected ? T.rowSel : isHovered ? T.pageBg : 'white',
                  transition: 'background .1s',
                }}
              >
                <Checkbox checked={isSelected} onChange={() => toggleOne(c.id)} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <Av name={c.name} size="sm" idx={c.av} />
                  <div style={{ minWidth: 0 }}>
                    <button
                      onClick={() => openCustomer?.(c.id)}
                      style={{
                        fontWeight: 600, fontSize: 13, background: 'none', border: 'none',
                        padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--dk)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: '100%', display: 'block',
                      }}
                    >
                      {c.name}
                    </button>
                    {c.city && <div style={{ fontSize: 11, color: 'var(--dl)', marginTop: 1 }}>{c.city}</div>}
                  </div>
                </div>
                <div style={{ fontSize: 12, minWidth: 0 }}>
                  {meta.lastProject ? (
                    <>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dk)', marginBottom: 3 }}>
                        {meta.lastProject.name}
                      </div>
                      {meta.lastProject.status && <StatusBadge status={meta.lastProject.status} />}
                    </>
                  ) : <span style={{ color: 'var(--dl)' }}>—</span>}
                </div>
                <div style={{ fontSize: 12, color: meta.lastEmail ? 'var(--dk)' : 'var(--dl)' }}>
                  {meta.lastEmail ? (
                    <>
                      <div style={{ fontWeight: 500 }}>
                        {new Date(meta.lastEmail.sent_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {meta.lastEmail.subject}
                      </div>
                    </>
                  ) : '—'}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: meta.projectCount > 0 ? 'var(--dk)' : 'var(--dl)' }}>
                    {meta.projectCount}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: meta.omzet > 0 ? 'var(--pd)' : 'var(--dl)', textAlign: 'right' }}>
                  {meta.omzet > 0 ? fmt(meta.omzet) : '—'}
                </div>

                {/* ── Acties kolom ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                  {/* Potlood */}
                  <button
                    title="Klantgegevens bewerken"
                    onClick={e => { e.stopPropagation(); openCustomer?.(c.id, 'klantgegevens'); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'var(--dl)', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.borderXL}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <IconPencil />
                  </button>
                  {/* Mail */}
                  <button
                    title="E-mail versturen"
                    onClick={e => { e.stopPropagation(); openSingleMail(c); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'var(--dl)', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.borderXL}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <IconMailSm />
                  </button>
                  {/* 3-puntjes */}
                  <div style={{ position: 'relative' }}>
                    <button
                      title="Meer opties"
                      onClick={e => { e.stopPropagation(); setRowMenuOpen(rowMenuOpen === c.id ? null : c.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'var(--dl)', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = T.borderXL}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <IconDots />
                    </button>
                    {rowMenuOpen === c.id && (
                      <div
                        style={{
                          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
                          background: 'white', border: '1px solid var(--border)', borderRadius: 10,
                          boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 160,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          onClick={() => { setRowMenuOpen(null); setDeleteTarget({ id: c.id, name: c.name }); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 14px', background: 'none', border: 'none',
                            textAlign: 'left', cursor: 'pointer', fontSize: 13,
                            color: '#dc2626', borderRadius: 10,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fff1f2'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          Klant verwijderen
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderTop: `1px solid ${T.borderXL}`, background: T.pageBg,
            }}>
              <span style={{ fontSize: 12, color: 'var(--dl)' }}>
                {filteredCustomers.length} klanten · pagina {currentPage} van {totalPages}
              </span>
              <Pagination currentPage={currentPage} totalPages={totalPages} onPage={p => { setCurrentPage(p); }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, background: 'var(--dk)', color: '#fff',
          borderRadius: 'var(--r14)', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,.28)', minWidth: 320,
        }}>
          <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: 'rgba(255,255,255,.85)', whiteSpace: 'nowrap' }}>
            {selected.size} klant{selected.size !== 1 ? 'en' : ''} geselecteerd
          </span>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,.15)', flexShrink: 0 }} />
          <button
            onClick={() => { setSelected(new Set()); setShowBulkMenu(false); }}
            style={{
              background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.18)',
              color: 'rgba(255,255,255,.75)', borderRadius: 7,
              padding: '5px 11px', fontSize: 12, cursor: 'pointer',
            }}
          >
            Deselecteren
          </button>
          <div ref={bulkMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowBulkMenu(o => !o)}
              style={{
                background: 'var(--p)', border: 'none', color: 'white',
                borderRadius: 7, padding: '6px 14px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              Acties {I.meer}
            </button>
            {showBulkMenu && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                background: 'white', borderRadius: 'var(--r14)',
                border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.14)',
                minWidth: 220, overflow: 'hidden', zIndex: 60,
              }}>
                {[
                  { icon: <IconMail />, label: 'E-mail versturen', action: () => { setShowBulkMenu(false); openMailModal(); } },
                  { icon: <IconExcel />, label: 'Exporteren als Excel', action: exportExcel },
                  { icon: <IconCsv />, label: 'Exporteren als CSV', action: exportCsv },
                  { icon: <IconBookmark />, label: 'Segment opslaan', action: () => { setShowBulkMenu(false); setShowSaveSegment(true); } },
                  null,
                  { icon: <IconPdf />, label: 'Download offertes (PDF)', action: bulkDownloadOffertes },
                  { icon: <IconPdf />, label: 'Download facturen (PDF)', action: bulkDownloadFacturen },
                  { icon: <IconPdf />, label: 'Download creditfacturen (PDF)', action: bulkDownloadCreditfacturen },
                  { icon: <IconPdf />, label: 'Download getekende offertes', action: bulkDownloadGetekend },
                  { icon: <IconZip />, label: 'Download alles (ZIP)', action: bulkDownloadAlles },
                ].map((item, idx) => item === null ? (
                  <div key={`sep-${idx}`} style={{ height: 1, background: T.borderXL, margin: '4px 0' }} />
                ) : (
                  <button key={idx} onClick={item.action} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: 'none', border: 'none',
                    textAlign: 'left', cursor: 'pointer',
                    fontSize: 13, color: 'var(--dk)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = T.pageBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ color: 'var(--dl)', display: 'flex', flexShrink: 0 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mail modal ── */}
      {showMailModal && (() => {
        const withEmail    = selectedCustomers.filter(c => c.email);
        const withoutEmail = selectedCustomers.filter(c => !c.email);
        const canSend      = !sending && mailForm.subject.trim() && mailForm.body.trim() && withEmail.length > 0;
        return (
          <div className="overlay" onClick={e => e.target === e.currentTarget && !sending && setShowMailModal(false)}>
            <div className="modal" style={{ maxWidth: 560, width: '100%' }}>
              <div className="modal-hd">
                <div>
                  <div className="modal-title">Mail versturen</div>
                  <div className="modal-sub">{selectedCustomers.length} klant{selectedCustomers.length !== 1 ? 'en' : ''} geselecteerd</div>
                </div>
                <button className="modal-x" onClick={() => !sending && setShowMailModal(false)}>{I.x}</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>

                {/* Template dropdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Template</label>
                  <select
                    value={mailForm.templateId}
                    onChange={e => handleMailTemplateChange(e.target.value)}
                    style={{ height: 36, borderRadius: 'var(--r8)', border: '1px solid var(--br)', padding: '0 10px', fontSize: 13, background: '#fff' }}
                  >
                    <option value="">— Schrijf zelf een bericht —</option>
                    {templates.filter(t => t.actief).map(t => (
                      <option key={t.id} value={t.id}>{t.name || t.type}</option>
                    ))}
                  </select>
                </div>

                {/* Onderwerp */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Onderwerp</label>
                  <input
                    type="text"
                    placeholder="Onderwerp van de e-mail"
                    value={mailForm.subject}
                    onChange={e => setMailForm(f => ({ ...f, subject: e.target.value }))}
                    style={{ height: 36, borderRadius: 'var(--r8)', border: '1px solid var(--br)', padding: '0 10px', fontSize: 13 }}
                  />
                </div>

                {/* Bericht */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Bericht</label>
                  <MailBodyEditor
                    ref={mailBodyRef}
                    value={mailForm.body}
                    onChange={v => setMailForm(f => ({ ...f, body: v }))}
                    placeholder="Schrijf je bericht hier… Variabelen zoals {{klant_naam}} worden per klant ingevuld."
                    minHeight={160}
                  />
                </div>

                {/* Ontvangers */}
                <div style={{ border: '1px solid var(--br)', borderRadius: 'var(--r8)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setShowRecipients(v => !v)}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', background: 'var(--bg)', border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 500, color: 'var(--dk)',
                    }}
                  >
                    <span>Versturen naar <strong>{withEmail.length}</strong> klant{withEmail.length !== 1 ? 'en' : ''}{withoutEmail.length > 0 && <span style={{ color: '#dc2626', marginLeft: 6 }}>({withoutEmail.length} zonder e-mail)</span>}</span>
                    <span style={{ color: 'var(--dl)', fontSize: 11 }}>{showRecipients ? '▲' : '▼'}</span>
                  </button>
                  {showRecipients && (
                    <div style={{ maxHeight: 180, overflowY: 'auto', borderTop: '1px solid var(--br)' }}>
                      {selectedCustomers.map(c => (
                        <div key={c.id} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '7px 14px', fontSize: 12, borderBottom: '1px solid var(--border)',
                        }}>
                          <span style={{ fontWeight: 500 }}>{c.name}</span>
                          {c.email
                            ? <span style={{ color: 'var(--dmu)' }}>{c.email}</span>
                            : <span style={{ color: '#dc2626', fontStyle: 'italic' }}>geen e-mailadres — wordt overgeslagen</span>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Waarschuwing */}
                {withoutEmail.length > 0 && (
                  <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 'var(--r8)', padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                    ⚠️ {withoutEmail.length} klant{withoutEmail.length !== 1 ? 'en hebben' : ' heeft'} geen e-mailadres en {withoutEmail.length !== 1 ? 'worden' : 'wordt'} overgeslagen.
                  </div>
                )}
              </div>

              <div className="fa">
                <button className="btn btn-ghost" onClick={() => setShowMailModal(false)} disabled={sending}>Annuleren</button>
                <button className="btn btn-p" onClick={handleSendMail} disabled={!canSend}>
                  {sending ? 'Versturen...' : `Versturen naar ${withEmail.length} klant${withEmail.length !== 1 ? 'en' : ''}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Bulk download voortgang ── */}
      {bulkDownloadProgress && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 'var(--r14)', padding: '28px 32px',
            boxShadow: '0 12px 40px rgba(0,0,0,.2)', minWidth: 320, textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--dk)', marginBottom: 14 }}>
              PDF's downloaden…
            </div>
            <div style={{ fontSize: 12, color: 'var(--dl)', marginBottom: 16 }}>
              {bulkDownloadProgress.current} van {bulkDownloadProgress.total} {bulkDownloadProgress.label}
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: 'var(--p)', borderRadius: 999,
                width: `${Math.round((bulkDownloadProgress.current / bulkDownloadProgress.total) * 100)}%`,
                transition: 'width .2s',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Delete bevestiging ── */}
      {deleteTarget && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && !deleting && setDeleteTarget(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-hd">
              <div className="modal-title">Klant verwijderen</div>
              <button className="modal-x" onClick={() => !deleting && setDeleteTarget(null)}>{I.x}</button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--dk)', margin: '16px 0 24px', lineHeight: 1.5 }}>
              Weet je zeker dat je <strong>{deleteTarget.name}</strong> wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </p>
            <div className="fa">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>Annuleren</button>
              <button
                className="btn"
                onClick={doDeleteCustomer}
                disabled={deleting}
                style={{ background: '#dc2626', color: 'white', border: 'none' }}
              >
                {deleting ? 'Verwijderen...' : 'Verwijderen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
