import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { I, ModalX, fmt, fmt0 } from '../../bb-shared.jsx';
import { useToast } from '../../lib/toast.jsx';
import { useProfile } from '../../lib/profileContext.jsx';
import {
  getProjectById,
  updateProject,
  deleteProject,
  getTimeEntries,
  addTimeEntry,
  deleteTimeEntry,
  getProjectNotes,
  addProjectNote,
  deleteProjectNote,
  getProjectInvoices,
  enrichProject,
  PROJECT_STATUS,
  PROJECT_STATUS_OPTIONS,
} from '../../services/projectsService.js';
import { getWerkbonnenByProject, createWerkbon } from '../../services/werkbonService.js';
import { NewFactuurModal } from '../FacturenPage.jsx';
import { MentionEditor, renderMentions } from '../../components/MentionEditor.jsx';
import { getTeamMembers, createAssignmentNotification } from '../../services/notificatieService.js';

const TABS = [
  { id: 'overview',   label: 'Overzicht' },
  { id: 'offerte',    label: 'Offerte' },
  { id: 'uren',       label: 'Uren' },
  { id: 'facturen',   label: 'Facturen' },
  { id: 'werkbonnen', label: 'Werkbonnen' },
  { id: 'notes',      label: 'Notities' },
];

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = String(d).split('-');
  if (!day) return d;
  return `${day}-${m}-${y}`;
};
const fmtHours = h => `${Number(h || 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}u`;

const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 };

function StatusBadge({ status }) {
  const cfg = PROJECT_STATUS[status] || { label: status || '—', col: 'b-gray' };
  return <span className={`badge ${cfg.col}`}>{cfg.label}</span>;
}

function HealthChip({ health }) {
  if (!health) return null;
  return <span className={`badge ${health.col}`}>{health.label}</span>;
}

// ── HEADER ───────────────────────────────────────────────────────────────────

function DrawerHeader({ project, onClose, fullscreen, onToggleFullscreen }) {
  return (
    <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--br)', display: 'flex', alignItems: 'flex-start', gap: 12, position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
      <button
        className="btn-icon"
        style={{ flexShrink: 0, marginTop: 2, color: 'var(--dl)' }}
        onClick={onToggleFullscreen}
        title={fullscreen ? 'Kleiner weergeven' : 'Volledig scherm'}
      >
        {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dk)', letterSpacing: '-.01em', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{project.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <StatusBadge status={project.status} />
          <HealthChip health={project.health} />
          {project.customerName && (
            <span style={{ fontSize: 12, color: 'var(--dl)' }}>· {project.customerName}</span>
          )}
        </div>
      </div>
      <ModalX onClose={onClose} />
    </div>
  );
}

function Tabs({ tab, setTab }) {
  return (
    <div className="tabs kk-tabs" style={{ padding: '8px 16px', borderBottom: '1px solid var(--br)' }}>
      {TABS.map(t => (
        <button
          key={t.id}
          className={`tab${tab === t.id ? ' active' : ''}`}
          onClick={() => setTab(t.id)}
        >{t.label}</button>
      ))}
    </div>
  );
}

// ── OVERVIEW TAB ─────────────────────────────────────────────────────────────

function OverviewTab({ project, customers, openCustomer, onSave, canManage }) {
  const toast = useToast();
  const { profile } = useProfile();
  const [teamMembers, setTeamMembers] = useState([]);
  const [form, setForm] = useState({
    name: project.name || '',
    status: project.status || 'concept',
    project_value: project.projectValue || 0,
    quoted_hours: project.quotedHours || 0,
    start_date: project.startDate || '',
    deadline: project.deadline || '',
    description: project.description || '',
    customer_id: project.customerId || '',
    assigned_to: project.assignedTo || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);

  useEffect(() => {
    setForm({
      name: project.name || '',
      status: project.status || 'concept',
      project_value: project.projectValue || 0,
      quoted_hours: project.quotedHours || 0,
      start_date: project.startDate || '',
      deadline: project.deadline || '',
      description: project.description || '',
      customer_id: project.customerId || '',
      assigned_to: project.assignedTo || '',
    });
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const prevAssigned = project.assignedTo || '';
      await onSave({
        name: form.name.trim() || project.name,
        status: form.status,
        project_value: Number(form.project_value || 0),
        quoted_hours: Number(form.quoted_hours || 0),
        start_date: form.start_date || null,
        deadline: form.deadline || null,
        description: form.description,
        customer_id: form.customer_id || null,
        assigned_to: form.assigned_to || null,
      });
      if (form.assigned_to && form.assigned_to !== prevAssigned && profile?.id) {
        const m = teamMembers.find(x => x.id === form.assigned_to);
        createAssignmentNotification({ assignedToUserId: form.assigned_to, assignedToName: m?.fullName, type: 'toewijzing_project', title: `Je bent toegewezen aan ${form.name.trim() || project.name}`, link: 'projecten', relatedType: 'project', relatedId: project.id, creatorId: profile.id, creatorName: profile.fullName }).catch(() => {});
      }
      toast.success('Project opgeslagen');
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const isOverdue = project.deadline && project.deadline < new Date().toISOString().slice(0, 10) && project.status !== 'afgerond';

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18, overflow: 'hidden' }}>
      {/* Projectcontrole card */}
      <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)', marginBottom: 10 }}>
          Projectcontrole
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div>
            <div style={labelStyle}>Urenstatus</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {fmtHours(project.usedHours)} van {fmtHours(project.quotedHours)}
              {project.quotedHours > 0 && (
                <span style={{ color: project.health?.tone === 'risk' ? '#dc2626' : project.health?.tone === 'warning' ? '#f59e0b' : 'var(--dl)', marginLeft: 6, fontSize: 12 }}>
                  ({Math.round((project.hoursPercentage || 0) * 100)}%)
                </span>
              )}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Budget</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{fmt0(project.projectValue)}</div>
          </div>
          <div>
            <div style={labelStyle}>Gefactureerd</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {fmt0(project.invoicedAmount)}
              {project.remainingToInvoice > 0 && (
                <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 6 }}>nog {fmt0(project.remainingToInvoice)}</span>
              )}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Deadline</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: isOverdue ? '#dc2626' : 'inherit' }}>
              {fmtDate(project.deadline)}
              {isOverdue && <span style={{ fontSize: 11, marginLeft: 6 }}>verlopen</span>}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <HealthChip health={project.health} />
        </div>
      </div>

      {/* Edit form */}
      <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="f" style={{ gridColumn: '1 / -1' }}>
          <label>Projectnaam</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} disabled={!canManage}>
            {PROJECT_STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="f">
          <label>Klant</label>
          <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)} disabled={!canManage}>
            <option value="">— Geen —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="f">
          <label>Projectwaarde</label>
          <input type="number" min="0" step="0.01" value={form.project_value} onChange={e => set('project_value', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Begrote uren</label>
          <input type="number" min="0" step="0.5" value={form.quoted_hours} onChange={e => set('quoted_hours', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Startdatum</label>
          <input type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Deadline</label>
          <input type="date" value={form.deadline || ''} onChange={e => set('deadline', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Toegewezen aan</label>
          <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} disabled={!canManage}>
            <option value="">— Geen medewerker —</option>
            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
          </select>
        </div>
        <div className="f" style={{ gridColumn: '1 / -1' }}>
          <label>Omschrijving</label>
          <textarea rows={4} value={form.description} onChange={e => set('description', e.target.value)} disabled={!canManage} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        {project.customerId && (
          <button className="btn btn-ghost btn-sm" onClick={() => openCustomer?.(project.customerId)}>
            Open klant {I.arrow_r}
          </button>
        )}
        {canManage && (
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── OFFERTE TAB ──────────────────────────────────────────────────────────────

function OfferteTab({ project, offertes, setPage, onLink, canManage }) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [pickId, setPickId] = useState('');
  const linkedOfferte = project.offerteId ? offertes.find(o => o.id === project.offerteId) : null;

  const submitLink = async () => {
    if (!pickId) return;
    try {
      await onLink(pickId);
      toast.success('Offerte gekoppeld');
      setPicking(false);
    } catch (e) {
      toast.error(e.message || 'Koppelen mislukt');
    }
  };

  if (!linkedOfferte) {
    const eligible = project.customerId
      ? offertes.filter(o => o.customerId === project.customerId)
      : offertes;
    return (
      <div style={{ padding: '24px 20px' }}>
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dk)', marginBottom: 6 }}>Nog geen offerte gekoppeld</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Koppel een bestaande offerte zodat waarde, uren en facturatie automatisch worden gesynchroniseerd.</div>
          {!picking ? (
            canManage && <button className="btn btn-p btn-sm" onClick={() => setPicking(true)}>{I.plus} Koppel offerte</button>
          ) : (
            <div style={{ maxWidth: 360, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={pickId} onChange={e => setPickId(e.target.value)}>
                <option value="">— Kies een offerte —</option>
                {eligible.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.nummer || 'Offerte'}{o.omschrijving ? ` · ${o.omschrijving.slice(0, 40)}` : ''} · {fmt(o.totaalIncl)}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPicking(false)}>Annuleren</button>
                <button className="btn btn-p btn-sm" onClick={submitLink} disabled={!pickId}>Koppel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-p" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--dl)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{linkedOfferte.nummer}</div>
            <div style={{ fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{linkedOfferte.omschrijving || project.name}</div>
          </div>
          <span className={`badge b-${linkedOfferte.status || 'gray'}`}>{linkedOfferte.status}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div>
            <div style={labelStyle}>Offertebedrag (incl.)</div>
            <div style={{ fontWeight: 600 }}>{fmt(linkedOfferte.totaalIncl)}</div>
          </div>
          <div>
            <div style={labelStyle}>Begrote uren</div>
            <div style={{ fontWeight: 600 }}>{fmtHours(linkedOfferte.arbeidsuren)}</div>
          </div>
          <div>
            <div style={labelStyle}>Geldig tot</div>
            <div style={{ fontWeight: 600 }}>{fmtDate(linkedOfferte.geldigTot)}</div>
          </div>
          <div>
            <div style={labelStyle}>Geaccepteerd</div>
            <div style={{ fontWeight: 600 }}>{linkedOfferte.geaccepteerdOp ? fmtDate(linkedOfferte.geaccepteerdOp.slice(0, 10)) : '—'}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-s btn-sm" onClick={() => setPage?.('offertes', { id: linkedOfferte.id, from: 'project', projectId: project.id, projectNaam: project.name })}>
          Open offerte {I.arrow_r}
        </button>
        <button className="btn btn-s btn-sm" onClick={() => setPage?.('facturen')}>
          Factuur maken {I.arrow_r}
        </button>
      </div>
    </div>
  );
}

// ── UREN TAB ─────────────────────────────────────────────────────────────────

function UrenTab({ project, entries, onAdd, onDelete, canManage }) {
  const toast = useToast();
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    description: '',
    hours: '',
    billable: true,
    hourly_rate: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    const h = Number(form.hours);
    if (!h || h <= 0) { toast.error('Uren moet groter zijn dan 0'); return; }
    setSaving(true);
    try {
      await onAdd({
        entry_date: form.entry_date,
        description: form.description || null,
        hours: h,
        billable: form.billable,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
      });
      setForm(f => ({ ...f, description: '', hours: '' }));
      toast.success('Uren toegevoegd');
    } catch (e) {
      toast.error(e.message || 'Toevoegen mislukt');
    } finally {
      setSaving(false);
    }
  };

  const pct = project.hoursPercentage || 0;
  const warningTone = pct > 1 ? 'risk' : pct >= 0.8 ? 'warning' : null;

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div>
            <div style={labelStyle}>Begroot</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtHours(project.quotedHours)}</div>
          </div>
          <div>
            <div style={labelStyle}>Geregistreerd</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: warningTone === 'risk' ? '#dc2626' : warningTone === 'warning' ? '#f59e0b' : 'inherit' }}>
              {fmtHours(project.usedHours)}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Resterend</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtHours(project.remainingHours)}</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ width: '100%', height: 8, background: '#e7e9ec', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(1, pct) * 100}%`,
              height: '100%',
              background: warningTone === 'risk' ? '#dc2626' : warningTone === 'warning' ? '#f59e0b' : '#1DDB62',
              borderRadius: 999,
            }} />
          </div>
          {warningTone === 'warning' && (
            <div style={{ color: '#b45309', fontSize: 12, marginTop: 6 }}>
              ⚠️ Boven 80% van het urenbudget. Houd uren goed in de gaten.
            </div>
          )}
          {warningTone === 'risk' && (
            <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6, fontWeight: 600 }}>
              🚨 Urenbudget overschreden ({Math.round(pct * 100)}%).
            </div>
          )}
        </div>
      </div>

      {/* Add time entry */}
      {canManage && (
        <div className="card card-p" style={{ padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)', marginBottom: 8 }}>Uren toevoegen</div>
          <div className="fg" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <div className="f">
              <label>Datum</label>
              <input type="date" value={form.entry_date} onChange={e => set('entry_date', e.target.value)} />
            </div>
            <div className="f">
              <label>Uren</label>
              <input type="number" min="0" step="0.25" placeholder="0,0" value={form.hours} onChange={e => set('hours', e.target.value)} />
            </div>
            <div className="f">
              <label>Tarief (optioneel)</label>
              <input type="number" min="0" step="0.01" placeholder="€/uur" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} />
            </div>
            <div className="f" style={{ justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={form.billable} onChange={e => set('billable', e.target.checked)} />
                Factureerbaar
              </label>
            </div>
            <div className="f" style={{ gridColumn: '1 / -1' }}>
              <label>Omschrijving</label>
              <input type="text" placeholder="Wat heb je gedaan?" value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-p btn-sm" onClick={submit} disabled={saving}>
              {saving ? 'Toevoegen…' : 'Uren toevoegen'}
            </button>
          </div>
        </div>
      )}

      {/* Time entries list */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)', marginBottom: 8 }}>
          Geregistreerde uren ({entries.length})
        </div>
        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)', fontSize: 13 }}>
            Nog geen uren geregistreerd op dit project.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entries.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--br)', borderRadius: 8, background: '#fff' }}>
                <div style={{ minWidth: 60, fontSize: 11, color: 'var(--dl)' }}>{fmtDate(e.entryDate)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || <span style={{ color: 'var(--dl)' }}>(geen omschrijving)</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--dl)' }}>
                    {e.userName || 'Onbekende medewerker'}
                    {e.billable === false && ' · niet factureerbaar'}
                    {e.hourlyRate ? ` · €${e.hourlyRate.toLocaleString('nl-NL')}/u` : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtHours(e.hours)}</div>
                {canManage && (
                  <button
                    className="btn btn-xs btn-ghost btn-icon"
                    title="Verwijderen"
                    onClick={() => onDelete(e.id)}
                  >{I.trash}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── FACTUREN TAB ─────────────────────────────────────────────────────────────

function FacturenTab({ project, invoices, openInvoice, setPage, customers, onNew }) {
  const [showNewFactuur, setShowNewFactuur] = useState(false);
  const openFactuur = f => {
    if (setPage) setPage('facturen', { id: f.id, from: 'project', projectId: project.id, projectNaam: project.name });
    else openInvoice?.(f.id);
  };
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div>
            <div style={labelStyle}>Projectwaarde</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt0(project.projectValue)}</div>
          </div>
          <div>
            <div style={labelStyle}>Gefactureerd</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt0(project.invoicedAmount)}</div>
          </div>
          <div>
            <div style={labelStyle}>Te factureren</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: project.remainingToInvoice > 0 ? '#f59e0b' : 'inherit' }}>
              {fmt0(project.remainingToInvoice)}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)' }}>
            Facturen ({invoices.length})
          </div>
          <button className="btn btn-s btn-sm" onClick={() => setShowNewFactuur(true)}>
            {I.plus} Nieuwe factuur
          </button>
        </div>
        {invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)', fontSize: 13 }}>
            Nog geen facturen aangemaakt voor dit project.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {invoices.map(f => (
              <div key={f.id} role="button" tabIndex={0} title="Open factuur"
                onClick={() => openFactuur(f)}
                onKeyDown={e => { if (e.key === 'Enter') openFactuur(f); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--br)', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{f.nummer || '—'}</div>
                <div style={{ flex: 1, fontSize: 12, color: 'var(--dl)' }}>
                  {fmtDate(f.factuurdatum)}
                  {f.vervaldatum && ` · vervalt ${fmtDate(f.vervaldatum)}`}
                </div>
                <span className={`badge b-${f.status === 'betaald' ? 'accepted' : f.status === 'verzonden' ? 'sent' : 'gray'}`}>
                  {f.status}
                </span>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(f.totaalIncl)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewFactuur && (
        <NewFactuurModal
          customers={customers}
          projects={[{ id: project.id, name: project.name, customerId: project.customerId }]}
          prefill={{ customer_id: project.customerId || '', project_id: project.id }}
          onClose={() => setShowNewFactuur(false)}
          onSaved={saved => { setShowNewFactuur(false); onNew?.(saved); }}
        />
      )}
    </div>
  );
}

// ── NOTES TAB ────────────────────────────────────────────────────────────────

function NotesTab({ notes, onAdd, onDelete }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setText('');
    } catch (e) {
      toast.error(e.message || 'Notitie opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      <div className="card card-p" style={{ padding: 10 }}>
        <MentionEditor
          value={text}
          onChange={setText}
          rows={3}
          placeholder="Schrijf een notitie over dit project… Typ @ om iemand te taggen"
          teamMembers={teamMembers}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-p btn-sm" onClick={submit} disabled={saving || !text.trim()}>
            {saving ? 'Opslaan…' : 'Notitie toevoegen'}
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)', fontSize: 13 }}>
          Nog geen notities. Voeg de eerste notitie toe.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(n => (
            <div key={n.id} style={{ padding: 10, border: '1px solid var(--br)', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
              <div style={{ fontSize: 13, color: 'var(--dk)', lineHeight: 1.5, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{renderMentions(n.note)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--dl)' }}>
                  {n.authorName || 'Onbekend'} · {fmtDate(String(n.createdAt || '').slice(0, 10))}
                </div>
                <button className="btn btn-xs btn-ghost btn-icon" title="Verwijderen" onClick={() => onDelete(n.id)}>{I.trash}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── WERKBONNEN TAB ───────────────────────────────────────────────────────────

const WB_STATUS_LABEL = { gepland: 'Gepland', in_uitvoering: 'In uitvoering', afgerond: 'Afgerond' };
const WB_STATUS_COL   = { gepland: '#2563EB', in_uitvoering: '#D97706', afgerond: '#0F7A3F' };
const WB_STATUS_BG    = { gepland: '#EFF4FF', in_uitvoering: '#FFF7E6', afgerond: '#E8FBEF' };

const WB_DAY   = ['zo','ma','di','wo','do','vr','za'];
const WB_MONTH = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const wbShortDate = d => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (Number.isNaN(dt.valueOf())) return d;
  return `${WB_DAY[dt.getDay()]} ${dt.getDate()} ${WB_MONTH[dt.getMonth()]}`;
};

function WerkbonnenTab({ project, werkbonnen, onCreated, canManage, setPage }) {
  const openWerkbon = w => setPage?.('werkbonnen', { id: w.id, from: 'project', projectId: project.id, projectNaam: project.name });
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titel: '', gepland_op: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.titel.trim()) { toast.error('Titel is verplicht'); return; }
    setSaving(true);
    try {
      const created = await createWerkbon({
        titel: form.titel.trim(),
        gepland_op: form.gepland_op || null,
        project_id: project.id,
        customer_id: project.customerId || null,
      });
      toast.success('Werkbon aangemaakt');
      setForm({ titel: '', gepland_op: '' });
      setShowForm(false);
      onCreated?.(created);
    } catch (e) {
      toast.error(e.message || 'Aanmaken mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)' }}>
          Werkbonnen ({werkbonnen.length})
        </div>
        {canManage && !showForm && (
          <button className="btn btn-s btn-sm" onClick={() => setShowForm(true)}>
            {I.plus} Nieuwe werkbon
          </button>
        )}
      </div>

      {showForm && (
        <div className="card card-p" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <div className="f">
              <label>Titel</label>
              <input
                type="text" autoFocus
                placeholder="Bv. Installatie dakraam"
                value={form.titel}
                onChange={e => set('titel', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
              />
            </div>
            <div className="f">
              <label>Datum</label>
              <input type="date" value={form.gepland_op} onChange={e => set('gepland_op', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)} disabled={saving}>Annuleren</button>
            <button className="btn btn-p btn-sm" onClick={submit} disabled={saving || !form.titel.trim()}>
              {saving ? 'Aanmaken…' : 'Werkbon aanmaken'}
            </button>
          </div>
        </div>
      )}

      {werkbonnen.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)', fontSize: 13 }}>
          Nog geen werkbonnen gekoppeld aan dit project.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {werkbonnen.map(w => {
            const pct = w.taakTotal ? Math.round((w.taakDone / w.taakTotal) * 100) : 0;
            return (
              <div key={w.id} role="button" tabIndex={0} title="Open werkbon"
                onClick={() => openWerkbon(w)}
                onKeyDown={e => { if (e.key === 'Enter') openWerkbon(w); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--br)', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.titel}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dl)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {wbShortDate(w.geplandOp)}
                    {w.taakTotal > 0 && (
                      <>
                        <span>·</span>
                        <span>{w.taakDone}/{w.taakTotal} taken</span>
                        <span style={{ display: 'inline-block', width: 36, height: 3, borderRadius: 3, background: 'var(--br)', overflow: 'hidden', verticalAlign: 'middle' }}>
                          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#1DDB62' }} />
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                  background: WB_STATUS_BG[w.status] || '#f3f4f6',
                  color: WB_STATUS_COL[w.status] || 'var(--dl)',
                }}>
                  {WB_STATUS_LABEL[w.status] || w.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DRAWER WRAPPER ───────────────────────────────────────────────────────────

export function ProjectDetailDrawer({
  projectId,
  customers = [],
  deals = [],
  offertes = [],
  onClose,
  onChanged,
  openCustomer,
  openInvoice,
  setPage,
}) {
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [notes, setNotes] = useState([]);
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);

  // Full-screen toggle — exact dezelfde aanpak als de klantkaart: voeg de
  // klasse klant-fullscreen toe aan de .drawer zodat hij het hele scherm vult.
  useEffect(() => {
    const drawer = document.querySelector('.drawer');
    if (!drawer) return;
    if (fullscreen) {
      const sb = document.querySelector('.sb');
      drawer.style.setProperty('--fs-left', `${sb ? sb.offsetWidth : 232}px`);
      drawer.classList.add('klant-fullscreen');
    } else {
      drawer.classList.remove('klant-fullscreen');
      drawer.style.removeProperty('--fs-left');
    }
    return () => {
      const d = document.querySelector('.drawer');
      if (d) { d.classList.remove('klant-fullscreen'); d.style.removeProperty('--fs-left'); }
    };
  }, [fullscreen]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [p, te, inv, nts, wbs] = await Promise.all([
        getProjectById(projectId),
        getTimeEntries(projectId).catch(() => []),
        getProjectInvoices(projectId).catch(() => []),
        getProjectNotes(projectId).catch(() => []),
        getWerkbonnenByProject(projectId).catch(() => []),
      ]);
      setEntries(te);
      setInvoices(inv);
      setNotes(nts);
      setWerkbonnen(wbs);
      setProject(enrichProject(p, { timeEntries: te, invoices: inv }));
    } catch (e) {
      toast.error(e.message || 'Project laden mislukt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (projectId) loadAll(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // canManage: leiden af uit de profile context indirect via parent. De
  // ProjectsPage wikkelt de drawer in een eigen check; hier laten we acties
  // altijd toe en vangt RLS eventuele blokkades op. Voor UX schakelen we
  // de form-velden in OverviewTab uit als er geen profile-info beschikbaar is
  // — die check zit in de page, niet hier (props.canManage).
  const canManage = true;

  const recompute = (nextEntries = entries, nextInvoices = invoices, nextProject = project) => {
    if (!nextProject) return;
    setProject(enrichProject(nextProject, { timeEntries: nextEntries, invoices: nextInvoices }));
  };

  // ── ACTIONS ───────────────────────────────────────────────────────────────

  const handleSave = async patch => {
    const updated = await updateProject(projectId, patch);
    const enriched = enrichProject(updated, { timeEntries: entries, invoices });
    setProject(enriched);
    onChanged?.();
  };

  const handleLinkOfferte = async offerteId => {
    const updated = await updateProject(projectId, { offerte_id: offerteId });
    setProject(enrichProject(updated, { timeEntries: entries, invoices }));
    onChanged?.();
  };

  const handleAddEntry = async data => {
    const created = await addTimeEntry(projectId, data);
    const next = [created, ...entries];
    setEntries(next);
    recompute(next, invoices);
    onChanged?.();
  };

  const handleDeleteEntry = async id => {
    if (!confirm('Deze uren-regel verwijderen?')) return;
    try {
      await deleteTimeEntry(id);
      const next = entries.filter(e => e.id !== id);
      setEntries(next);
      recompute(next, invoices);
      onChanged?.();
      toast.success('Uren-regel verwijderd');
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleAddNote = async text => {
    const n = await addProjectNote(projectId, text);
    setNotes(prev => [n, ...prev]);
  };

  const handleDeleteNote = async id => {
    if (!confirm('Notitie verwijderen?')) return;
    try {
      await deleteProjectNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm(`Project "${project?.name}" definitief verwijderen?`)) return;
    try {
      await deleteProject(projectId);
      toast.success('Project verwijderd');
      onChanged?.();
      onClose?.();
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body" style={{ padding: 0 }}>
          {loading || !project ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--dl)' }}>Project laden…</div>
          ) : (
            <>
              <DrawerHeader project={project} onClose={onClose} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)} />
              <Tabs tab={tab} setTab={setTab} />

              {tab === 'overview' && (
                <OverviewTab
                  project={project}
                  customers={customers}
                  openCustomer={openCustomer}
                  onSave={handleSave}
                  canManage={canManage}
                />
              )}
              {tab === 'offerte' && (
                <OfferteTab
                  project={project}
                  offertes={offertes}
                  setPage={setPage}
                  onLink={handleLinkOfferte}
                  canManage={canManage}
                />
              )}
              {tab === 'uren' && (
                <UrenTab
                  project={project}
                  entries={entries}
                  onAdd={handleAddEntry}
                  onDelete={handleDeleteEntry}
                  canManage={canManage}
                />
              )}
              {tab === 'facturen' && (
                <FacturenTab
                  project={project}
                  invoices={invoices}
                  openInvoice={openInvoice}
                  setPage={setPage}
                  customers={customers}
                  onNew={saved => {
                    const next = [{ id: saved.id, nummer: saved.nummer, status: saved.status, factuurdatum: saved.factuurdatum, vervaldatum: saved.vervaldatum, totaalIncl: saved.totaalIncl, totaalExcl: saved.totaalExcl }, ...invoices];
                    setInvoices(next);
                    recompute(entries, next);
                    onChanged?.();
                  }}
                />
              )}
              {tab === 'werkbonnen' && (
                <WerkbonnenTab
                  project={project}
                  werkbonnen={werkbonnen}
                  setPage={setPage}
                  onCreated={wb => setWerkbonnen(prev => [...prev, wb])}
                  canManage={canManage}
                />
              )}
              {tab === 'notes' && (
                <NotesTab notes={notes} onAdd={handleAddNote} onDelete={handleDeleteNote} />
              )}

              {/* Footer actions */}
              {canManage && (
                <div style={{ padding: '12px 20px 20px', borderTop: '1px solid var(--br)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={handleDeleteProject}>
                    {I.trash} Verwijder project
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default ProjectDetailDrawer;
