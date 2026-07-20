import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { useUrlTab } from '../hooks/useUrlTab.js';
import {
  getUrenregistratie, createUrenregel, updateUrenregel, deleteUrenregel,
} from '../services/urenService.js';
import { listCustomers } from '../services/customerService.js';
import { getWerkbonnen } from '../services/werkbonService.js';
import { getProjects } from '../services/projectsService.js';
import { getTeamMembers } from '../services/notificatieService.js';
import { I } from '../bb-shared.jsx';

// ── Date / time helpers ─────────────────────────────────────────────────────
const todayIso = () => new Date().toISOString().slice(0, 10);
const fmtNL = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };
const MONTHS_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const DAYS_NL = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];

const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const toIso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const dayLabel = iso => {
  const t = todayIso();
  if (iso === t) return 'Vandaag';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === toIso(y)) return 'Gisteren';
  return DAYS_NL[parseIso(iso).getDay()];
};

const trimTime = t => (t ? String(t).slice(0, 5) : t);
const fmtTimeRange = (s, e) => {
  if (!s && !e) return '—';
  return `${trimTime(s) || '—'} – ${trimTime(e) || '—'}`;
};

const computeUren = (start, end) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(v => Number.isNaN(v))) return null;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return null;
  return Math.round((diff / 60) * 100) / 100;
};

const fmtUren = n => (n == null || Number.isNaN(n)) ? '—' : Number(n).toFixed(2);

// ── Period navigation (zelfde patroon/stijl als de Agenda) ──────────────────
// Datumhelpers gelijk aan CalendarPage: maandag-start, ISO-weeknummer.
const addDays = (date, days) => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() + days); return d; };
const getStartOfWeek = date => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d; };
const getISOWeek = date => { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const dayNum = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - dayNum); const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil((((d - yearStart) / 86400000) + 1) / 7); };
const MONTHS_NL_FULL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Datumrange voor de gekozen periode rond een anker-datum.
const periodRange = (type, anchor) => {
  if (type === 'dag') return { van: toIso(anchor), tot: toIso(anchor) };
  if (type === 'week') { const mon = getStartOfWeek(anchor); return { van: toIso(mon), tot: toIso(addDays(mon, 6)) }; }
  if (type === 'maand') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { van: toIso(first), tot: toIso(last) };
  }
  return {}; // alles → geen begrenzing
};

// Eén periode vooruit/terug schuiven, afhankelijk van het periode-type.
const shiftAnchor = (anchor, type, dir) => {
  if (type === 'dag') return addDays(anchor, dir);
  if (type === 'week') return addDays(anchor, dir * 7);
  if (type === 'maand') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return anchor;
};

// Zichtbaar label voor de huidige periode (mirror van de Agenda-header).
const periodHeaderLabel = (type, anchor) => {
  if (type === 'dag') { const iso = toIso(anchor); return `${dayLabel(iso)} · ${fmtNL(iso)}`; }
  if (type === 'week') {
    const mon = getStartOfWeek(anchor), sun = addDays(mon, 6);
    const dm = d => `${d.getDate()} ${MONTHS_NL[d.getMonth()]}`;
    return `Week ${getISOWeek(mon)} · ${dm(mon)} – ${dm(sun)}`;
  }
  if (type === 'maand') return `${cap(MONTHS_NL_FULL[anchor.getMonth()])} ${anchor.getFullYear()}`;
  return 'Alle tijd';
};

// Zelfstandig naamwoord voor KPI-hints (klopt ongeacht welke week/maand).
const periodNoun = type => ({ alles: 'alle tijd', dag: 'de dag', week: 'de week', maand: 'de maand' }[type] || 'de periode');

// ── Avatar derivation (existing data has only medewerkerNaam string) ────────
const initialsOf = name => (name || '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const AVATAR_TINTS = ['#fde68a', '#bfdbfe', '#fecaca', '#c7d2fe', '#bbf7d0', '#fbcfe8', '#fef08a', '#a7f3d0'];
const tintOf = name => {
  if (!name) return '#e5e7eb';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
};

// ── Sort: newest datum first, then newest created_at first ──────────────────
const sortRows = rows => [...rows].sort((a, b) => {
  if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
  const ac = a.createdAt || '', bc = b.createdAt || '';
  return ac < bc ? 1 : -1;
});

// ── Inline icons (match design's stroke 1.75) ───────────────────────────────
const Ic = {
  Clock:   <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  Users:   <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87"/><path d="M15 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Trend:   <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>,
  Plus:    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  Edit:    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash:   <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>,
  Close:   <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Chev:    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  Check:   <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
  Alert:   <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>,
};

// ── Small reusable bits ─────────────────────────────────────────────────────

function Avatar({ name, size = 26 }) {
  if (!name) {
    return <span className="uren2-avatar uren2-avatar-empty" style={{ width: size, height: size, fontSize: size * 0.36 }}>—</span>;
  }
  return (
    <span className="uren2-avatar" style={{ width: size, height: size, background: tintOf(name), fontSize: size * 0.36 }}>
      {initialsOf(name)}
    </span>
  );
}

function IconBtn({ icon, title, danger, onClick }) {
  return (
    <button
      type="button"
      className={`uren2-iconbtn${danger ? ' uren2-iconbtn-danger' : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
    >{icon}</button>
  );
}

function PeriodTabs({ value, onChange }) {
  const tabs = [
    { id: 'alles', label: 'Alles' },
    { id: 'dag', label: 'Dag' },
    { id: 'week', label: 'Week' },
    { id: 'maand', label: 'Maand' },
  ];
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={`tab${value === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >{t.label}</button>
      ))}
    </div>
  );
}

function Dropdown({ value, options, onChange, placeholder, width, size = 'md', ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const cur = options.find(o => o.value === value);
  return (
    <div ref={ref} className={`uren2-dropdown ${size === 'sm' ? 'is-sm' : ''}`} style={width ? { width } : null}>
      <button
        type="button"
        className="uren2-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        <span className="uren2-dropdown-value">{cur ? cur.label : (placeholder || 'Kies…')}</span>
        <span className={`uren2-dropdown-chev${open ? ' is-open' : ''}`}>{Ic.Chev}</span>
      </button>
      {open && (
        <div className="uren2-dropdown-menu" role="listbox">
          {options.map(o => {
            const active = o.value === value;
            return (
              <button
                key={String(o.value)}
                role="option"
                aria-selected={active}
                className={`uren2-dropdown-opt${active ? ' is-active' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className="uren2-dropdown-opt-label">{o.label}</span>
                {active && <span className="uren2-dropdown-opt-check">{Ic.Check}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, unit, hint }) {
  return (
    <div className="uren2-kpi">
      <div className="uren2-kpi-top">
        <div className="uren2-kpi-icon">{icon}</div>
        <span className="uren2-kpi-label">{label}</span>
      </div>
      <div className="uren2-kpi-val-row">
        <span className="uren2-kpi-val">{value}</span>
        {unit && <span className="uren2-kpi-unit">{unit}</span>}
      </div>
      {hint && <div className="uren2-kpi-hint">{hint}</div>}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="uren2-empty">
      <div className="uren2-empty-icon">{Ic.Clock}</div>
      <p className="uren2-empty-msg">{message || 'Geen urenregistraties gevonden'}</p>
    </div>
  );
}

// ── Desktop table ───────────────────────────────────────────────────────────
function UrenTable({ rows, onEdit, onDelete }) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className="uren2-table-wrap">
      <table className="uren2-table">
        <thead>
          <tr>
            <th className="uren2-th uren2-th-date">Datum</th>
            <th className="uren2-th">Medewerker</th>
            <th className="uren2-th uren2-th-time">Start–Eind</th>
            <th className="uren2-th uren2-th-hours">Uren</th>
            <th className="uren2-th">Klant</th>
            <th className="uren2-th">Notitie</th>
            <th className="uren2-th uren2-th-actions">Acties</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="uren2-tr">
              <td className="uren2-td uren2-td-date">{fmtNL(r.datum)}</td>
              <td className="uren2-td">
                {r.medewerkerNaam ? (
                  <span className="uren2-md">
                    <Avatar name={r.medewerkerNaam} size={26} />
                    <span>{r.medewerkerNaam}</span>
                  </span>
                ) : <span className="uren2-muted">—</span>}
              </td>
              <td className={`uren2-td uren2-td-time${r.startTijd ? '' : ' uren2-muted'}`}>
                {fmtTimeRange(r.startTijd, r.eindTijd)}
              </td>
              <td className="uren2-td uren2-td-hours">{fmtUren(r.uren)}</td>
              <td className={`uren2-td${r.customerName ? '' : ' uren2-muted'}`}>{r.customerName || '—'}</td>
              <td className="uren2-td uren2-td-note">
                <div className="uren2-note-ellipsis" title={r.notitie || ''}>{r.notitie || '—'}</div>
              </td>
              <td className="uren2-td uren2-td-actions">
                <span className="uren2-row-actions">
                  <IconBtn icon={Ic.Edit} title="Bewerken" onClick={() => onEdit(r)} />
                  <IconBtn icon={Ic.Trash} title="Verwijderen" danger onClick={() => onDelete(r)} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Mobile stacked cards (grouped by date) ──────────────────────────────────
function MobileList({ rows, onEdit, onDelete }) {
  if (!rows.length) return <EmptyState />;
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.datum)) map.set(r.datum, []);
      map.get(r.datum).push(r);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] < b[0] ? 1 : -1)
      .map(([datum, items]) => ({
        datum,
        items,
        totalUren: items.reduce((s, r) => s + (Number(r.uren) || 0), 0),
      }));
  }, [rows]);

  return (
    <div className="uren2-mlist">
      {groups.map(g => (
        <div key={g.datum} className="uren2-mgroup">
          <div className="uren2-mgroup-hd">
            <span className="uren2-mgroup-day">
              {dayLabel(g.datum)} <span className="uren2-mgroup-date">{fmtNL(g.datum)}</span>
            </span>
            <span className="uren2-mgroup-total">{g.totalUren.toFixed(2)} uur</span>
          </div>
          {g.items.map(r => (
            <div key={r.id} className="uren2-mcard">
              <div className="uren2-mcard-top">
                <div className="uren2-mcard-md">
                  <Avatar name={r.medewerkerNaam} size={32} />
                  <div className="uren2-mcard-md-text">
                    <div className={`uren2-mcard-name${r.medewerkerNaam ? '' : ' uren2-muted'}`}>
                      {r.medewerkerNaam || '—'}
                    </div>
                  </div>
                </div>
                <div className="uren2-mcard-hrs">
                  <div className="uren2-mcard-hrs-val">{fmtUren(r.uren)}</div>
                  <div className="uren2-mcard-hrs-unit">uur</div>
                </div>
              </div>
              <div className="uren2-mcard-meta">
                <span>{fmtTimeRange(r.startTijd, r.eindTijd)}</span>
                <span className={r.customerName ? '' : 'uren2-muted'}>{r.customerName || '—'}</span>
              </div>
              {r.notitie && <div className="uren2-mcard-note">{r.notitie}</div>}
              <div className="uren2-mcard-actions">
                <IconBtn icon={Ic.Edit} title="Bewerken" onClick={() => onEdit(r)} />
                <IconBtn icon={Ic.Trash} title="Verwijderen" danger onClick={() => onDelete(r)} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Modal shell ─────────────────────────────────────────────────────────────
function ModalShell({ open, onClose, busy, mobile, children, maxWidth = 640 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);
  if (!open) return null;
  return (
    <div
      className={`uren2-overlay${mobile ? ' is-mobile' : ''}`}
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        className={`uren2-modal${mobile ? ' is-mobile' : ''}`}
        style={{ maxWidth: mobile ? '100%' : maxWidth }}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

// ── Register / Edit modal ───────────────────────────────────────────────────
function UrenModal({ open, mode, initial, klanten, werkbonnen = [], projecten = [], profiles = [], canBookForOthers = false, currentProfileId, onClose, onSave, mobile }) {
  const empty = useMemo(() => ({
    datum: todayIso(),
    start_tijd: '',
    eind_tijd: '',
    customer_id: '',
    werkbon_id: '',
    project_id: '',
    notitie: '',
    profile_id: currentProfileId || '',
  }), [currentProfileId]);
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        datum: initial.datum || todayIso(),
        start_tijd: trimTime(initial.startTijd) || '',
        eind_tijd: trimTime(initial.eindTijd) || '',
        customer_id: initial.customerId || '',
        werkbon_id: initial.werkbonId || '',
        project_id: initial.projectId || '',
        notitie: initial.notitie || '',
        profile_id: initial.profileId || currentProfileId || '',
      });
    } else {
      setForm(empty);
    }
    setTouched({});
    setBusy(false);
  }, [open, initial, empty]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  // Werkbon kiezen → project en klant automatisch overnemen van de werkbon.
  const onWerkbonChange = (wid) => setForm(f => {
    const next = { ...f, werkbon_id: wid };
    const wb = werkbonnen.find(w => w.id === wid);
    if (wb) {
      if (wb.projectId) next.project_id = wb.projectId;
      if (wb.customerId) {
        next.customer_id = wb.customerId;
        // Project resetten als het niet bij de klant van de werkbon hoort.
        const pr = projecten.find(p => p.id === next.project_id);
        if (pr && pr.customerId !== wb.customerId) next.project_id = '';
      }
    }
    return next;
  });
  // Project kiezen → klant automatisch afleiden van het project.
  const onProjectChange = (pid) => setForm(f => {
    const next = { ...f, project_id: pid };
    const pr = projecten.find(p => p.id === pid);
    if (pr && pr.customerId) next.customer_id = pr.customerId;
    return next;
  });
  // Klant kiezen → werkbon/project resetten als ze niet bij deze klant horen.
  const onKlantChange = (cid) => setForm(f => {
    const next = { ...f, customer_id: cid };
    if (cid) {
      const wb = werkbonnen.find(w => w.id === f.werkbon_id);
      if (wb && wb.customerId !== cid) next.werkbon_id = '';
      const pr = projecten.find(p => p.id === f.project_id);
      if (pr && pr.customerId !== cid) next.project_id = '';
    }
    return next;
  });
  const hint = computeUren(form.start_tijd, form.eind_tijd);
  const datumInvalid = touched.datum && !form.datum;
  const timeInvalid = form.start_tijd && form.eind_tijd && hint === null;
  const canSave = !!form.datum && !busy && !timeInvalid;

  const submit = async () => {
    setTouched(t => ({ ...t, datum: true }));
    if (!form.datum || timeInvalid) return;
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && canSave) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const klantOptions = [{ value: '', label: 'Geen klant' }, ...klanten.map(k => ({ value: k.id, label: k.name }))];
  // Met een gekozen klant alleen de werkbonnen/projecten van die klant tonen;
  // zonder klant: alles.
  const werkbonOptions = [
    { value: '', label: 'Geen werkbon' },
    ...werkbonnen
      .filter(w => !form.customer_id || w.customerId === form.customer_id)
      .map(w => ({ value: w.id, label: w.titel || 'Werkbon' })),
  ];
  const projectOptions = [
    { value: '', label: 'Geen project' },
    ...projecten
      .filter(p => !form.customer_id || p.customerId === form.customer_id)
      .map(p => ({ value: p.id, label: p.name || 'Project' })),
  ];
  // Admin-vangnet: keuze voor wélke medewerker de uren zijn (default jezelf).
  const medewerkerOptions = profiles.map(m => ({
    value: m.profileId,
    label: `${m.fullName || m.email || 'Medewerker'}${m.profileId === currentProfileId ? ' (ikzelf)' : ''}`,
  }));
  if (currentProfileId && !medewerkerOptions.some(o => o.value === currentProfileId)) {
    medewerkerOptions.unshift({ value: currentProfileId, label: 'Ikzelf' });
  }

  const editMedewerker = initial?.medewerkerNaam || '—';

  return (
    <ModalShell open={open} onClose={onClose} busy={busy} mobile={mobile}>
      <div className="uren2-modal-hd">
        {mobile && <div className="uren2-modal-grabber" />}
        <div className="uren2-modal-title-wrap">
          <h2 className="uren2-modal-title">{mode === 'edit' ? 'Uren bewerken' : 'Uren registreren'}</h2>
          <p className="uren2-modal-sub">
            {mode === 'edit' ? `Medewerker: ${editMedewerker}` : 'Nieuwe urenregistratie toevoegen'}
          </p>
        </div>
        <IconBtn icon={Ic.Close} title="Sluiten" onClick={() => !busy && onClose()} />
      </div>

      <div className="uren2-modal-body">
        <div className="uren2-form">
          <div className="uren2-field">
            <label className="uren2-label" htmlFor="uren2-datum">Datum <span className="uren2-req">*</span></label>
            <input
              id="uren2-datum"
              type="date"
              className={`uren2-input${datumInvalid ? ' is-invalid' : ''}`}
              value={form.datum}
              onChange={e => set('datum', e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, datum: true }))}
            />
            {datumInvalid && <div className="uren2-error">Datum is verplicht</div>}
          </div>
          {canBookForOthers && (
            <div className="uren2-field uren2-field-full">
              <label className="uren2-label">Medewerker</label>
              <Dropdown
                value={form.profile_id}
                options={medewerkerOptions}
                onChange={v => set('profile_id', v)}
                ariaLabel="Medewerker"
              />
            </div>
          )}
          <div className="uren2-field">
            <label className="uren2-label" htmlFor="uren2-start">Starttijd</label>
            <input
              id="uren2-start"
              type="time"
              className="uren2-input"
              value={form.start_tijd}
              onChange={e => set('start_tijd', e.target.value)}
            />
          </div>
          <div className="uren2-field">
            <label className="uren2-label" htmlFor="uren2-eind">Eindtijd</label>
            <input
              id="uren2-eind"
              type="time"
              className={`uren2-input${timeInvalid ? ' is-invalid' : ''}`}
              value={form.eind_tijd}
              onChange={e => set('eind_tijd', e.target.value)}
            />
            {hint !== null && <div className="uren2-hint">≈ {hint.toFixed(2)} uur</div>}
            {timeInvalid && <div className="uren2-error">Eindtijd moet later zijn dan starttijd</div>}
          </div>

          <div className="uren2-field">
            <label className="uren2-label">Werkbon <span className="uren2-opt">(optioneel)</span></label>
            <Dropdown value={form.werkbon_id} options={werkbonOptions} onChange={onWerkbonChange} ariaLabel="Werkbon" />
          </div>
          <div className="uren2-field">
            <label className="uren2-label">Project <span className="uren2-opt">(optioneel)</span></label>
            <Dropdown value={form.project_id} options={projectOptions} onChange={onProjectChange} ariaLabel="Project" />
          </div>

          <div className="uren2-field uren2-field-full">
            <label className="uren2-label">Klant</label>
            <Dropdown value={form.customer_id} options={klantOptions} onChange={onKlantChange} ariaLabel="Klant" />
          </div>

          <div className="uren2-field uren2-field-full">
            <label className="uren2-label" htmlFor="uren2-notitie">Notitie</label>
            <textarea
              id="uren2-notitie"
              className="uren2-textarea"
              rows={2}
              value={form.notitie}
              onChange={e => set('notitie', e.target.value)}
              placeholder="Optionele notitie..."
            />
          </div>
        </div>
      </div>

      <div className={`uren2-modal-ft${mobile ? ' is-mobile' : ''}`}>
        <button
          type="button"
          className={`uren2-btn ${mobile ? 'uren2-btn-secondary' : 'uren2-btn-ghost'}`}
          onClick={onClose}
          disabled={busy}
        >Annuleren</button>
        <button
          type="button"
          className="uren2-btn uren2-btn-primary"
          onClick={submit}
          disabled={!canSave}
        >{busy ? 'Opslaan…' : 'Opslaan'}</button>
      </div>
    </ModalShell>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export function UrenPageV2() {
  const toast = useToast();
  const { profile, bumpRefresh } = useProfile();
  const canBookForOthers = ['admin', 'planner'].includes(profile?.role);
  const [allRows, setAllRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [projecten, setProjecten] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Periode-tab in de URL (?tab=…) — blijft behouden bij refresh/terugkeer.
  const [periodType, setPeriodType] = useUrlTab('alles', { validIds: ['alles', 'dag', 'week', 'maand'] });
  const [anchor, setAnchor] = useState(() => new Date());
  const [employee, setEmployee] = useState('all');

  const [modal, setModal] = useState(null);            // { mode: 'register'|'edit', initial }
  const [confirmRow, setConfirmRow] = useState(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 767);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Initial load: fetch all rows + customers
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getUrenregistratie(),
      listCustomers(),
      getWerkbonnen().catch(() => []),
      getProjects().catch(() => []),
    ])
      .then(([r, c, w, p]) => {
        if (!alive) return;
        setAllRows(r); setCustomers(c); setWerkbonnen(w); setProjecten(p); setError('');
      })
      .catch(err => { if (!alive) return; setError(err.message || 'Laden mislukt'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Admin-vangnet: ledenlijst zodat een admin uren namens een collega kan boeken.
  useEffect(() => {
    if (!canBookForOthers) { setTeamMembers([]); return; }
    let alive = true;
    getTeamMembers()
      .then(ms => { if (alive) setTeamMembers((ms || []).filter(m => m.profileId)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [canBookForOthers]);

  // Period-filtered rows (client-side, on already-loaded data). Alle rijen zijn
  // al geladen, dus het navigeren naar vorige/volgende periodes verschuift enkel
  // de datumrange — de getoonde uren bewegen mee met de gekozen periode.
  const rowsPeriod = useMemo(() => {
    if (periodType === 'alles') return allRows;
    const { van, tot } = periodRange(periodType, anchor);
    return allRows.filter(r => {
      const d = r.datum;
      return d && d >= van && d <= tot;
    });
  }, [allRows, periodType, anchor]);

  // KPI: counts over period (NOT employee)
  const kpis = useMemo(() => {
    const totaal = rowsPeriod.reduce((s, r) => s + (Number(r.uren) || 0), 0);
    const medewerkers = new Set(rowsPeriod.map(r => r.profileId).filter(Boolean)).size;
    const dagen = new Set(rowsPeriod.map(r => r.datum)).size;
    const gemPerDag = dagen ? totaal / dagen : 0;
    return {
      totaal: Math.round(totaal * 100) / 100,
      medewerkers,
      gemPerDag: Math.round(gemPerDag * 100) / 100,
      dagen,
    };
  }, [rowsPeriod]);

  // Visible rows: period + employee + sort
  const visible = useMemo(() => {
    let xs = rowsPeriod;
    if (employee !== 'all') xs = xs.filter(r => r.profileId === employee);
    return sortRows(xs);
  }, [rowsPeriod, employee]);

  // Employee options: unique medewerkers from current period, alphabetical
  const employeeOptions = useMemo(() => {
    const seen = new Map();
    for (const r of allRows) {
      if (r.profileId && r.medewerkerNaam && !seen.has(r.profileId)) seen.set(r.profileId, r.medewerkerNaam);
    }
    const opts = [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ value: id, label: name }));
    return [{ value: 'all', label: 'Alle medewerkers' }, ...opts];
  }, [allRows]);

  // Periode-navigatie (vorige / volgende / vandaag) — alleen zinvol bij een
  // begrensde periode (dag/week/maand), niet bij 'Alles'.
  const goPrev = () => setAnchor(a => shiftAnchor(a, periodType, -1));
  const goNext = () => setAnchor(a => shiftAnchor(a, periodType, +1));
  const periodLabelText = periodHeaderLabel(periodType, anchor);

  // Save handler (works for both register + edit)
  const handleSave = async (form) => {
    const payload = {
      datum: form.datum,
      start_tijd: form.start_tijd || null,
      eind_tijd: form.eind_tijd || null,
      customer_id: form.customer_id || null,
      werkbon_id: form.werkbon_id || null,
      project_id: form.project_id || null,
      notitie: form.notitie || null,
    };
    try {
      if (modal.mode === 'edit' && modal.initial) {
        // Admin mag de eigenaar corrigeren; een medewerker bewerkt alleen eigen
        // regels en laat het eigenaarschap ongemoeid (RLS dwingt dit hoe dan ook af).
        const editPayload = canBookForOthers && form.profile_id
          ? { ...payload, profile_id: form.profile_id }
          : payload;
        const saved = await updateUrenregel(modal.initial.id, editPayload);
        setAllRows(rs => rs.map(r => r.id === saved.id ? saved : r));
        toast.success('Uren opgeslagen');
      } else {
        // Admin kan namens een collega boeken; anders altijd op jezelf.
        const bookForId = (canBookForOthers && form.profile_id) ? form.profile_id : profile?.id;
        const saved = await createUrenregel({ ...payload, profile_id: bookForId });
        setAllRows(rs => [saved, ...rs]);
        toast.success('Uren geregistreerd');
      }
      setModal(null);
      // Laat o.a. de uren-herinnering-pop-up herrekenen (dag nu geboekt → weg).
      bumpRefresh?.();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    }
  };

  // Optimistic delete with rollback
  const handleDelete = async (row) => {
    const prev = allRows;
    setAllRows(rs => rs.filter(r => r.id !== row.id));
    setConfirmRow(null);
    try {
      await deleteUrenregel(row.id);
      toast.success('Uren verwijderd');
    } catch (err) {
      setAllRows(prev);
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  return (
    <div className="uren2-page">
      {/* Header */}
      <div className="uren2-hd">
        <div className="uren2-hd-text">
          <h1 className="uren2-h1">Urenregistratie</h1>
          <p className="uren2-sub">Bekijk, filter en beheer urenregistraties van je team</p>
        </div>
        <button
          type="button"
          className="uren2-btn uren2-btn-primary uren2-hd-cta"
          onClick={() => setModal({ mode: 'register', initial: null })}
        >
          <span className="uren2-btn-ic">{Ic.Plus}</span>
          Uren registreren
        </button>
      </div>

      {error && (
        <div className="uren2-error-strip">
          <span className="uren2-error-strip-ic">{Ic.Alert}</span>
          Kon urenregistraties niet laden — {error}
        </div>
      )}

      {/* KPIs */}
      <div className="uren2-kpis">
        <KpiCard
          icon={Ic.Clock}
          label="Totaal uren"
          value={kpis.totaal.toFixed(2)}
          unit="uur"
          hint={`Som over ${periodNoun(periodType)}`}
        />
        <KpiCard
          icon={Ic.Users}
          label="Medewerkers"
          value={String(kpis.medewerkers)}
          hint={`Uniek binnen ${periodNoun(periodType)}`}
        />
        <KpiCard
          icon={Ic.Trend}
          label="Gem. per dag"
          value={kpis.gemPerDag.toFixed(2)}
          unit="uur"
          hint={`Over ${kpis.dagen} ${kpis.dagen === 1 ? 'dag' : 'dagen'}`}
        />
      </div>

      {/* Filter + table/list */}
      <div className="uren2-card">
        <div className="uren2-filter-bar">
          <div className="uren2-period">
            <PeriodTabs value={periodType} onChange={setPeriodType} />
            {periodType !== 'alles' && (
              <div className="uren2-periodnav">
                <button type="button" className="btn btn-s btn-sm" onClick={goPrev} aria-label="Vorige periode">{I.chev_l}</button>
                <span className="uren2-periodnav-label">{periodLabelText}</span>
                <button type="button" className="btn btn-s btn-sm" onClick={goNext} aria-label="Volgende periode">{I.chev_r}</button>
              </div>
            )}
          </div>
          <div className="uren2-filter-right">
            {!loading && (
              <span className="uren2-count">
                {visible.length} {visible.length === 1 ? 'registratie' : 'registraties'}
              </span>
            )}
            <Dropdown
              value={employee}
              options={employeeOptions}
              onChange={setEmployee}
              width={isMobile ? '100%' : 210}
              ariaLabel="Filter op medewerker"
            />
          </div>
        </div>

        {loading ? (
          <div className="uren2-loading">Laden…</div>
        ) : isMobile ? (
          <MobileList rows={visible} onEdit={r => setModal({ mode: 'edit', initial: r })} onDelete={r => setConfirmRow(r)} />
        ) : (
          <UrenTable rows={visible} onEdit={r => setModal({ mode: 'edit', initial: r })} onDelete={r => setConfirmRow(r)} />
        )}
      </div>

      {/* FAB on mobile */}
      {isMobile && (
        <button
          type="button"
          className="uren2-fab"
          aria-label="Uren registreren"
          onClick={() => setModal({ mode: 'register', initial: null })}
        >{Ic.Plus}</button>
      )}

      {/* Modals */}
      <UrenModal
        open={!!modal}
        mode={modal?.mode || 'register'}
        initial={modal?.initial || null}
        klanten={customers}
        werkbonnen={werkbonnen}
        projecten={projecten}
        profiles={teamMembers}
        canBookForOthers={canBookForOthers}
        currentProfileId={profile?.id}
        onClose={() => setModal(null)}
        onSave={handleSave}
        mobile={isMobile}
      />

      {/* Delete confirm */}
      <ModalShell
        open={!!confirmRow}
        onClose={() => setConfirmRow(null)}
        mobile={isMobile}
        maxWidth={420}
      >
        <div className="uren2-confirm">
          <div className="uren2-confirm-ic">{Ic.Trash}</div>
          <h2 className="uren2-confirm-title">Deze urenregistratie verwijderen?</h2>
          {confirmRow && (
            <p className="uren2-confirm-sub">
              {fmtNL(confirmRow.datum)} · {confirmRow.medewerkerNaam || '—'} · {fmtUren(confirmRow.uren)} uur
              {confirmRow.customerName ? ` · ${confirmRow.customerName}` : ''}
            </p>
          )}
        </div>
        <div className="uren2-modal-ft">
          <button type="button" className="uren2-btn uren2-btn-ghost" onClick={() => setConfirmRow(null)}>Annuleren</button>
          <button type="button" className="uren2-btn uren2-btn-danger" onClick={() => handleDelete(confirmRow)}>Verwijderen</button>
        </div>
      </ModalShell>
    </div>
  );
}

export default UrenPageV2;
