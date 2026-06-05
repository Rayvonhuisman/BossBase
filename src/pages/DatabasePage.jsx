import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase.js';
import { I, fmt, Av } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { listCustomers } from '../services/customerService.js';
import { getFacturen } from '../services/factuurService.js';
import { getOffertes } from '../services/offerteService.js';
import { getProjects, PROJECT_STATUS } from '../services/projectsService.js';
import { listDeals, listPipelineStages } from '../services/dealService.js';
import { listActivities } from '../services/activityService.js';
import { getEmailTemplates } from '../services/instellingenService.js';
import { sendEmail, logSentEmail, substituteVars } from '../services/emailService.js';
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
  heeftOverrun: false, projectMedewerker: '',
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

const CB = { width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--p)' };
const COLS = '32px 1fr 160px 150px 56px 110px';

// ── STATUS BADGE ─────────────────────────────────────────────
const STATUS_BADGE = {
  'in_uitvoering': { bg: '#FFEDD5', color: '#C2410C' },
  'afgerond':      { bg: 'transparent', color: '#16A34A', border: '1px solid #16A34A' },
  'concept':       { bg: '#F3F4F6', color: '#6B7280' },
  'gepauzeerd':    { bg: '#FEF9C3', color: '#854D0E' },
  'geannuleerd':   { bg: '#FEE2E2', color: '#991B1B' },
};
function StatusBadge({ status }) {
  const label = PROJECT_STATUS[status]?.label || status || '';
  const s = STATUS_BADGE[status] || { bg: '#F3F4F6', color: '#6B7280' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px',
      background: s.bg, color: s.color,
      borderRadius: 999, fontSize: '.68rem', fontWeight: 600,
      border: s.border || 'none',
    }}>
      {label}
    </span>
  );
}

// ── FILTER INPUT STYLE ───────────────────────────────────────
const FIN = {
  height: 30, background: '#F9FAFB', border: '1px solid var(--br)',
  borderRadius: 7, fontSize: '.78rem', padding: '0 8px',
  color: 'var(--dk)', width: '100%', boxSizing: 'border-box',
};
const FLBL = {
  fontSize: '.68rem', fontWeight: 600, color: 'var(--dl)',
  textTransform: 'uppercase', letterSpacing: '.08em',
};

// ── FILTER SECTION ───────────────────────────────────────────
function FilterSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--br)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '9px 0',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '.72rem', fontWeight: 700, color: 'var(--dk)',
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}
      >
        {title}
        <span style={{ color: 'var(--dl)', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none', display: 'flex', flexShrink: 0 }}>
          {I.chev_d}
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingBottom: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {label && <label style={FLBL}>{label}</label>}
      {children}
    </div>
  );
}

function MultiSelect({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(o => {
        const active = value.includes(o.id);
        return (
          <button
            key={o.id}
            onClick={() => onChange(active ? value.filter(v => v !== o.id) : [...value, o.id])}
            style={{
              padding: '2px 8px', borderRadius: 999,
              fontSize: '.68rem', fontWeight: 600,
              border: active ? 'none' : '1px solid var(--br)',
              background: active ? 'var(--p)' : '#F3F4F6',
              color: active ? 'var(--dk)' : 'var(--dmu)',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────
export function DatabasePage({ openCustomer }) {
  const toast = useToast();
  const { profile } = useProfile();

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
  const [loading, setLoading]         = useState(true);

  const [filters, setFilters]         = useState(EMPTY_FILTERS);
  const [segments, setSegments]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('bb_db_segments') || '[]'); } catch { return []; }
  });
  const [segmentName, setSegmentName]     = useState('');
  const [showSaveSegment, setShowSaveSegment] = useState(false);

  const [selected, setSelected]       = useState(new Set());
  const [hoveredRow, setHoveredRow]   = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 50;

  const [showMailModal, setShowMailModal]     = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [sending, setSending]                 = useState(false);

  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const bulkMenuRef = useRef(null);

  const setFilter = useCallback((k, v) => {
    setFilters(f => ({ ...f, [k]: v }));
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    if (!showBulkMenu) return;
    const handler = e => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target)) {
        setShowBulkMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBulkMenu]);

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
        const { data } = await supabase.from('time_entries').select('id,project_id,user_id,hours,entry_date,billable').eq('company_id', companyId);
        return data || [];
      })(),
      (async () => {
        const companyId = await getCompanyId();
        if (!companyId) return [];
        const { data } = await supabase.from('profiles').select('id,full_name').eq('company_id', companyId);
        return data || [];
      })(),
    ]).then(([c, p, f, o, d, a, tpl, st, se, ur, tm]) => {
      setCustomers(c); setProjects(p); setFacturen(f); setOffertes(o);
      setDeals(d); setActivities(a); setTemplates(tpl); setStages(st);
      setSentEmails(se); setUrenData(ur); setTeamMembers(tm);
    }).catch(err => toast.error(err.message || 'Laden mislukt'))
    .finally(() => setLoading(false));
  }, []);

  // ── Index related data by customer ───────────────────────────
  const byCustomer = useMemo(() => {
    const m = {};
    const init = id => {
      if (!m[id]) m[id] = { projects: [], facturen: [], offertes: [], deals: [], activities: [], emails: [], uren: [] };
    };
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

      if (filters.stad && !(c.city || '').toLowerCase().includes(filters.stad.toLowerCase())) return false;
      if (filters.aanmaakVan && c.createdAt?.slice(0,10) < filters.aanmaakVan) return false;
      if (filters.aanmaakTot && c.createdAt?.slice(0,10) > filters.aanmaakTot) return false;
      if (filters.heeftKvk !== 'alles') {
        const heeft = Boolean(c.kvk_number);
        if (filters.heeftKvk === 'ja' && !heeft) return false;
        if (filters.heeftKvk === 'nee' && heeft) return false;
      }
      if (filters.heeftMoneybird !== 'alles') {
        const heeft = Boolean(c.moneybird_id);
        if (filters.heeftMoneybird === 'ja' && !heeft) return false;
        if (filters.heeftMoneybird === 'nee' && heeft) return false;
      }
      if (filters.geenProject && rel.projects.length > 0) return false;
      if (filters.laatsteContactDagen) {
        const cutoff = daysAgo(Number(filters.laatsteContactDagen));
        const lastContact = [...rel.emails, ...rel.activities]
          .map(x => x.sent_at || x.due_at || '')
          .filter(Boolean).sort().reverse()[0];
        if (lastContact && lastContact.slice(0,10) >= cutoff) return false;
      }

      if (filters.projectStatussen.length > 0) {
        if (!rel.projects.some(p => filters.projectStatussen.includes(p.status))) return false;
      }
      if (filters.projectStartVan && !rel.projects.some(p => p.startDate >= filters.projectStartVan)) return false;
      if (filters.projectStartTot && !rel.projects.some(p => p.startDate <= filters.projectStartTot)) return false;
      if (filters.projectDeadlineVan && !rel.projects.some(p => p.deadline >= filters.projectDeadlineVan)) return false;
      if (filters.projectDeadlineTot && !rel.projects.some(p => p.deadline <= filters.projectDeadlineTot)) return false;
      if (filters.heeftOverrun && !rel.projects.some(p => (p.usedHours || 0) > (p.quotedHours || 0))) return false;
      if (filters.projectMedewerker && !rel.projects.some(p => p.ownerId === filters.projectMedewerker)) return false;

      if (filters.offerteStatussen.length > 0) {
        if (!rel.offertes.some(o => filters.offerteStatussen.includes(o.status))) return false;
      }
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

      if (filters.factuurStatussen.length > 0) {
        if (!rel.facturen.some(f => filters.factuurStatussen.includes(f.status))) return false;
      }
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

      if (filters.dealFasen.length > 0) {
        if (!rel.deals.some(d => filters.dealFasen.includes(d.stageId))) return false;
      }
      if (filters.dealWaardeMin && !rel.deals.some(d => (d.value || 0) >= Number(filters.dealWaardeMin))) return false;
      if (filters.dealWaardeMax && !rel.deals.some(d => (d.value || 0) <= Number(filters.dealWaardeMax))) return false;
      if (filters.heeftOpenActiviteiten && !rel.activities.some(a => !a.completed)) return false;
      if (filters.activiteitTypen.length > 0) {
        if (!rel.activities.some(a => filters.activiteitTypen.includes(a.type))) return false;
      }

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
        const custProjects = rel.projects.map(p => p.id);
        const billableUren = urenData.filter(u => custProjects.includes(u.project_id) && u.billable);
        if (billableUren.length === 0) return false;
      }

      return true;
    });
  }, [customers, byCustomer, filters, urenData]);

  // ── Pagination ───────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PER_PAGE));
  const pageSlice = filteredCustomers.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  // ── Selection ────────────────────────────────────────────────
  const allPageSelected = pageSlice.length > 0 && pageSlice.every(c => selected.has(c.id));
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

  // ── Bulk mail ────────────────────────────────────────────────
  const handleSendMail = async () => {
    if (!selectedTemplate) { toast.error('Kies een e-mailtemplate'); return; }
    const tpl = templates.find(t => t.id === selectedTemplate);
    if (!tpl) return;
    setSending(true);
    let ok = 0, skipped = 0;
    try {
      for (const c of selectedCustomers) {
        if (!c.email) { skipped++; continue; }
        const vars = { klant_naam: c.name, bedrijfsnaam: c.name };
        const subject = substituteVars(tpl.onderwerp || '', vars);
        const body = substituteVars(tpl.body || '', vars);
        const html = body.split('\n').map(l => l.trim() === '' ? '<br>' : `<p style="margin:0 0 6px">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('');
        try {
          await sendEmail({ to: c.email, subject, html });
          await logSentEmail({ toEmail: c.email, subject, relatedType: tpl.type || 'algemeen', customerId: c.id });
          ok++;
        } catch { skipped++; }
      }
      toast.success(`Mail verstuurd naar ${ok} klant${ok !== 1 ? 'en' : ''}${skipped > 0 ? `, ${skipped} overgeslagen` : ''}`);
      setShowMailModal(false);
      setSelected(new Set());
    } finally { setSending(false); }
  };

  // ── Export helpers ───────────────────────────────────────────
  const buildExportRows = () => selectedCustomers.map(c => {
    const rel = byCustomer[c.id] || { projects: [], facturen: [] };
    const lastProject = [...rel.projects].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))[0];
    const omzet = rel.facturen.filter(f => f.status === 'betaald' && !f.isCredit).reduce((s,f) => s + (f.totaalIncl||0), 0);
    return {
      Naam: c.name,
      Email: c.email || '',
      Telefoon: c.phone || '',
      Stad: c.city || '',
      KvK: c.kvkNumber || '',
      'Laatste project': lastProject?.name || '',
      'Totale omzet': omzet,
      Aanmaakdatum: c.createdAt ? c.createdAt.slice(0, 10) : '',
    };
  });

  const exportExcel = () => {
    const rows = buildExportRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Klanten');
    XLSX.writeFile(wb, `BossBase-export-${TODAY}.xlsx`);
    setShowBulkMenu(false);
    toast.success(`${rows.length} klanten geëxporteerd als Excel`);
  };

  const exportCsv = () => {
    const rows = buildExportRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BossBase-export-${TODAY}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowBulkMenu(false);
    toast.success(`${rows.length} klanten geëxporteerd als CSV`);
  };

  // ── Display meta per customer ────────────────────────────────
  const custMeta = useMemo(() => {
    const m = {};
    customers.forEach(c => {
      const rel = byCustomer[c.id] || { projects: [], facturen: [], emails: [] };
      const lastProject = [...rel.projects].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))[0];
      const lastEmail = [...rel.emails].sort((a,b) => (b.sent_at||'').localeCompare(a.sent_at||''))[0];
      const omzet = rel.facturen.filter(f => f.status === 'betaald' && !f.isCredit).reduce((s,f) => s + (f.totaalIncl||0), 0);
      m[c.id] = { lastProject, lastEmail, omzet, projectCount: rel.projects.length };
    });
    return m;
  }, [customers, byCustomer]);

  const active = hasActiveFilters(filters);
  const stadsUniek = useMemo(() => [...new Set(customers.map(c => c.city).filter(Boolean))].sort(), [customers]);
  const templateTypes = [...new Set(templates.map(t => t.type))];
  const OFFERTE_STATUSSEN = [
    { id: 'concept', label: 'Concept' }, { id: 'verzonden', label: 'Verzonden' },
    { id: 'geaccepteerd', label: 'Geaccepteerd' }, { id: 'afgewezen', label: 'Afgewezen' },
  ];
  const FACTUUR_STATUSSEN = [
    { id: 'aangemaakt', label: 'Aangemaakt' }, { id: 'verzonden', label: 'Verzonden' }, { id: 'betaald', label: 'Betaald' },
  ];
  const ACTIVITEIT_TYPEN = [
    { id: 'call', label: 'Bellen' }, { id: 'email', label: 'E-mail' },
    { id: 'visit', label: 'Bezoek' }, { id: 'task', label: 'Taak' }, { id: 'follow', label: 'Follow-up' },
  ];
  const PROJECT_STATUSSEN = Object.entries(PROJECT_STATUS).map(([id, v]) => ({ id, label: v.label }));
  const teamOpties = teamMembers.map(m => ({ id: m.id, label: m.full_name }));
  const noEmail = selectedCustomers.filter(c => !c.email);

  if (loading) return (
    <div className="card card-p afu2" style={{ textAlign: 'center', color: 'var(--dl)', padding: 48 }}>
      Database laden…
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header ── */}
      <div className="page-hd afu">
        <div>
          <h1>Database</h1>
          <p style={{ color: 'var(--dl)', fontSize: '.82rem', marginTop: 2 }}>
            {active ? `${filteredCustomers.length} van ${customers.length} klanten` : `${customers.length} klanten`}
          </p>
        </div>
        <div className="page-hd-actions">
          {active && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilters(EMPTY_FILTERS); setCurrentPage(1); }}>
              {I.x} Filters wissen
            </button>
          )}
          <button className="btn btn-s btn-sm" onClick={() => setShowSaveSegment(s => !s)}>
            Segment opslaan
          </button>
        </div>
      </div>

      {/* ── Saved segments ── */}
      {segments.length > 0 && (
        <div className="afu2" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {segments.map(seg => (
            <div
              key={seg.name}
              style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'white', border: '1px solid var(--br)',
                borderRadius: 999, overflow: 'hidden', boxShadow: 'var(--shadow-xs)',
              }}
            >
              <button
                onClick={() => { setFilters(seg.filters); setCurrentPage(1); }}
                style={{
                  padding: '4px 11px 4px 13px', fontSize: '.75rem', fontWeight: 600,
                  color: 'var(--dk)', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                {seg.name}
              </button>
              <button
                onClick={() => deleteSegment(seg.name)}
                style={{
                  padding: '4px 8px', color: 'var(--dl)', background: 'none', border: 'none',
                  borderLeft: '1px solid var(--br)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
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
            style={{ flex: 1, maxWidth: 280 }}
            autoFocus
          />
          <button className="btn btn-p btn-sm" onClick={saveSegment}>Opslaan</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSaveSegment(false)}>Annuleren</button>
        </div>
      )}

      {/* ── Body: filter sidebar + results ── */}
      <div className="afu2" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Filter sidebar ── */}
        <div style={{
          background: 'white', borderRadius: 'var(--r12)', border: '1px solid var(--br)',
          padding: '0 14px 10px', boxShadow: 'var(--shadow-xs)',
        }}>
          <div style={{
            fontSize: '.68rem', fontWeight: 700, color: 'var(--dl)',
            textTransform: 'uppercase', letterSpacing: '.06em',
            padding: '12px 0 9px', borderBottom: '1px solid var(--br)', marginBottom: 2,
          }}>
            Geavanceerde filters
          </div>

          <FilterSection title="Klant" defaultOpen>
            <FilterRow label="Stad / regio">
              <input list="steden" type="text" value={filters.stad}
                onChange={e => setFilter('stad', e.target.value)}
                placeholder="Alle steden" style={FIN} />
              <datalist id="steden">{stadsUniek.map(s => <option key={s} value={s} />)}</datalist>
            </FilterRow>
            <FilterRow label="Aangemaakt van">
              <input type="date" value={filters.aanmaakVan} onChange={e => setFilter('aanmaakVan', e.target.value)} style={FIN} />
            </FilterRow>
            <FilterRow label="Aangemaakt tot">
              <input type="date" value={filters.aanmaakTot} onChange={e => setFilter('aanmaakTot', e.target.value)} style={FIN} />
            </FilterRow>
            <FilterRow label="KvK-nummer">
              <select value={filters.heeftKvk} onChange={e => setFilter('heeftKvk', e.target.value)} style={FIN}>
                <option value="alles">Alles</option>
                <option value="ja">Heeft KvK</option>
                <option value="nee">Geen KvK</option>
              </select>
            </FilterRow>
            <FilterRow label="Moneybird sync">
              <select value={filters.heeftMoneybird} onChange={e => setFilter('heeftMoneybird', e.target.value)} style={FIN}>
                <option value="alles">Alles</option>
                <option value="ja">Gesynchroniseerd</option>
                <option value="nee">Niet gesynchroniseerd</option>
              </select>
            </FilterRow>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.78rem', color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.geenProject} onChange={e => setFilter('geenProject', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Nog nooit een project gehad
            </label>
            <FilterRow label="Laatste contact ouder dan (dagen)">
              <input type="number" min="0" value={filters.laatsteContactDagen}
                onChange={e => setFilter('laatsteContactDagen', e.target.value)}
                placeholder="Bijv. 90" style={FIN} />
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
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.78rem', color: 'var(--dm)', cursor: 'pointer' }}>
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
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.78rem', color: 'var(--dm)', cursor: 'pointer' }}>
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
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.78rem', color: 'var(--dm)', cursor: 'pointer' }}>
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
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.78rem', color: 'var(--dm)', cursor: 'pointer' }}>
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
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.78rem', color: 'var(--dm)', cursor: 'pointer' }}>
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
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.78rem', color: 'var(--dm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.heeftFactureerbareUren} onChange={e => setFilter('heeftFactureerbareUren', e.target.checked)} style={{ accentColor: 'var(--p)' }} />
              Heeft factureerbare uren
            </label>
          </FilterSection>
        </div>

        {/* ── Results table ── */}
        <div style={{ background: 'white', borderRadius: 'var(--r12)', border: '1px solid var(--br)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
            padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid var(--br)',
          }}>
            <input type="checkbox" style={CB} checked={allPageSelected} onChange={toggleAll} />
            <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Klant</div>
            <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Laatste project</div>
            <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Laatste mail</div>
            <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'center' }}>Projecten</div>
            <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'right' }}>Omzet</div>
          </div>

          {/* Rows */}
          {pageSlice.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--dl)', fontSize: '.84rem' }}>
              {active ? 'Geen klanten gevonden met deze filters.' : 'Geen klanten.'}
            </div>
          ) : pageSlice.map((c, i) => {
            const meta = custMeta[c.id] || {};
            const isSelected = selected.has(c.id);
            const isHovered = hoveredRow === c.id;
            return (
              <div
                key={c.id}
                onMouseEnter={() => setHoveredRow(c.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
                  padding: '11px 13px 11px 16px',
                  borderLeft: isSelected ? '3px solid var(--p)' : '3px solid transparent',
                  borderBottom: i < pageSlice.length - 1 ? '1px solid #F3F4F6' : 'none',
                  background: isSelected ? 'var(--pll)' : isHovered ? '#F9FAFB' : 'white',
                  transition: 'background .1s ease',
                }}
              >
                <input type="checkbox" style={CB} checked={isSelected} onChange={() => toggleOne(c.id)} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <Av name={c.name} size="sm" idx={c.av} />
                  <div style={{ minWidth: 0 }}>
                    <button
                      onClick={() => openCustomer?.(c.id)}
                      style={{
                        fontWeight: 600, fontSize: '.84rem', background: 'none', border: 'none',
                        padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--dk)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
                        display: 'block',
                      }}
                    >
                      {c.name}
                    </button>
                    {c.city && <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginTop: 1 }}>{c.city}</div>}
                  </div>
                </div>
                <div style={{ fontSize: '.78rem', minWidth: 0 }}>
                  {meta.lastProject ? (
                    <>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dk)', marginBottom: 3 }}>
                        {meta.lastProject.name}
                      </div>
                      {meta.lastProject.status && <StatusBadge status={meta.lastProject.status} />}
                    </>
                  ) : <span style={{ color: 'var(--dl)' }}>—</span>}
                </div>
                <div style={{ fontSize: '.78rem', color: meta.lastEmail ? 'var(--dk)' : 'var(--dl)' }}>
                  {meta.lastEmail ? (
                    <>
                      <div>{new Date(meta.lastEmail.sent_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>
                      <div style={{ fontSize: '.7rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {meta.lastEmail.subject}
                      </div>
                    </>
                  ) : '—'}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '.84rem', color: 'var(--dk)' }}>{meta.projectCount}</span>
                </div>
                <div style={{ fontSize: '.82rem', fontWeight: 700, color: meta.omzet > 0 ? 'var(--pd)' : 'var(--dl)', textAlign: 'right' }}>
                  {meta.omzet > 0 ? fmt(meta.omzet) : '—'}
                </div>
              </div>
            );
          })}

          {/* Pagination inside card */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderTop: '1px solid var(--br)', background: '#FAFAFA',
            }}>
              <span style={{ fontSize: '.78rem', color: 'var(--dl)' }}>{filteredCustomers.length} klanten</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 1}
                  style={{
                    width: 30, height: 30, borderRadius: 'var(--r8)',
                    border: '1px solid var(--br)', background: 'white',
                    cursor: currentPage === 1 ? 'default' : 'pointer',
                    color: currentPage === 1 ? 'var(--dl)' : 'var(--dk)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  {I.chev_l}
                </button>
                <span style={{ fontSize: '.8rem', color: 'var(--dmu)', minWidth: 80, textAlign: 'center' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    width: 30, height: 30, borderRadius: 'var(--r8)',
                    border: '1px solid var(--br)', background: 'white',
                    cursor: currentPage === totalPages ? 'default' : 'pointer',
                    color: currentPage === totalPages ? 'var(--dl)' : 'var(--dk)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  {I.chev_r}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bulk action bar with 3-dots menu ── */}
      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, background: 'var(--dk)', color: '#fff',
          borderRadius: 'var(--r14)', padding: '11px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.28)', minWidth: 300,
        }}>
          <span style={{ fontWeight: 600, fontSize: '.84rem', color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap', flex: 1 }}>
            {selected.size} klant{selected.size !== 1 ? 'en' : ''} geselecteerd
          </span>
          <button
            onClick={() => { setSelected(new Set()); setShowBulkMenu(false); }}
            style={{
              background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)',
              color: 'rgba(255,255,255,.7)', borderRadius: 'var(--r8)',
              padding: '5px 11px', fontSize: '.78rem', cursor: 'pointer',
            }}
          >
            Wis
          </button>
          <div ref={bulkMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowBulkMenu(o => !o)}
              style={{
                background: 'var(--p)', border: 'none', color: 'var(--dk)',
                borderRadius: 'var(--r8)', padding: '7px 14px',
                fontSize: '.84rem', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              Acties <span style={{ letterSpacing: 2, fontSize: '.78rem' }}>•••</span>
            </button>
            {showBulkMenu && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                background: 'white', borderRadius: 'var(--r12)',
                border: '1px solid var(--br)', boxShadow: '0 8px 24px rgba(0,0,0,.14)',
                minWidth: 234, overflow: 'hidden', zIndex: 60,
              }}>
                {[
                  { icon: '✉', label: 'E-mail versturen', action: () => { setShowBulkMenu(false); setShowMailModal(true); } },
                  { icon: '📊', label: 'Exporteren als Excel', action: exportExcel },
                  { icon: '📋', label: 'Exporteren als CSV', action: exportCsv },
                  { icon: '🏷', label: 'Label toevoegen', action: null, disabled: true, sub: 'Binnenkort beschikbaar' },
                  { icon: '🗂', label: 'Segment opslaan van selectie', action: () => { setShowBulkMenu(false); setShowSaveSegment(true); } },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={item.disabled ? undefined : item.action}
                    disabled={item.disabled}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', background: 'none', border: 'none',
                      textAlign: 'left', cursor: item.disabled ? 'default' : 'pointer',
                      fontSize: '.84rem', color: item.disabled ? 'var(--dl)' : 'var(--dk)',
                      borderBottom: idx < 4 ? '1px solid #F3F4F6' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '1rem', width: 22, flexShrink: 0 }}>{item.icon}</span>
                    <div>
                      <div>{item.label}</div>
                      {item.sub && <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 1 }}>{item.sub}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mail modal ── */}
      {showMailModal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && !sending && setShowMailModal(false)}>
          <div className="modal">
            <div className="modal-hd">
              <div>
                <div className="modal-title">Mail versturen</div>
                <div className="modal-sub">Aan: {selectedCustomers.length} klant{selectedCustomers.length !== 1 ? 'en' : ''}</div>
              </div>
              <button className="modal-x" onClick={() => !sending && setShowMailModal(false)}>{I.x}</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--dl)' }}>Template</label>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  style={{ height: 36, borderRadius: 'var(--r8)', border: '1px solid var(--br)', padding: '0 10px', fontSize: '.84rem' }}
                >
                  <option value="">— Kies template —</option>
                  {templates.filter(t => t.actief).map(t => (
                    <option key={t.id} value={t.id}>{t.name || t.type}</option>
                  ))}
                </select>
              </div>
              {selectedTemplate && (
                <div style={{ background: 'var(--pll)', borderRadius: 'var(--r8)', padding: '12px 14px', fontSize: '.84rem' }}>
                  Je verstuurt <strong>{templates.find(t => t.id === selectedTemplate)?.name || 'deze mail'}</strong> naar{' '}
                  <strong>{selectedCustomers.length} klant{selectedCustomers.length !== 1 ? 'en' : ''}</strong>.
                </div>
              )}
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {selectedCustomers.slice(0, 10).map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.82rem', padding: '4px 0', borderBottom: '1px solid var(--br)' }}>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    {c.email
                      ? <span style={{ color: 'var(--dmu)' }}>{c.email}</span>
                      : <span style={{ color: '#dc2626', fontSize: '.75rem' }}>geen emailadres</span>}
                  </div>
                ))}
                {selectedCustomers.length > 10 && (
                  <div style={{ fontSize: '.78rem', color: 'var(--dl)', padding: '4px 0' }}>
                    + {selectedCustomers.length - 10} meer
                  </div>
                )}
              </div>
              {noEmail.length > 0 && (
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 'var(--r8)', padding: '10px 14px', fontSize: '.82rem', color: '#92400e' }}>
                  ⚠️ {noEmail.length} klant{noEmail.length !== 1 ? 'en hebben' : ' heeft'} geen emailadres en {noEmail.length !== 1 ? 'worden' : 'wordt'} overgeslagen.
                </div>
              )}
            </div>
            <div className="fa">
              <button className="btn btn-ghost" onClick={() => setShowMailModal(false)} disabled={sending}>Annuleren</button>
              <button className="btn btn-p" onClick={handleSendMail} disabled={sending || !selectedTemplate}>
                {sending ? 'Versturen...' : 'Bevestigen en versturen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
