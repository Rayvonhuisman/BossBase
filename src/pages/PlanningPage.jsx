import { useState, useEffect, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { I, ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { getWerkbonnen, createWerkbon, updateWerkbon } from '../services/werkbonService.js';
import { getVoertuigen } from '../services/voertuigService.js';
import { getTeamMembers, createAssignmentNotification } from '../services/notificatieService.js';
import { listCustomers } from '../services/customerService.js';
import { getProjects } from '../services/projectsService.js';
import { MentionEditor } from '../components/MentionEditor.jsx';

// ── WEEK HELPERS ─────────────────────────────────────────────────────────────

const NL_DAYS_SHORT = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const NL_DAYS_FULL  = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
const NL_MONTHS     = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function fmtDay(date) {
  return `${NL_DAYS_FULL[(date.getDay() + 6) % 7].slice(0, 2)} ${date.getDate()} ${NL_MONTHS[date.getMonth()]}`;
}

function fmtWeekRange(monday) {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}–${sunday.getDate()} ${NL_MONTHS[monday.getMonth()]} ${monday.getFullYear()}`;
  }
  return `${monday.getDate()} ${NL_MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${NL_MONTHS[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

function calcHours(starttijd, eindtijd) {
  if (!starttijd || !eindtijd) return 0;
  const [sh, sm] = starttijd.split(':').map(Number);
  const [eh, em] = eindtijd.split(':').map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

function fmtTime(t) {
  return t ? t.slice(0, 5) : '';
}

function fmtHours(h) {
  return h % 1 === 0 ? `${h}u` : `${h.toFixed(1)}u`;
}

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────

const STATUS = {
  gepland:       { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', label: 'Gepland' },
  in_uitvoering: { bg: '#fff7ed', text: '#d97706', border: '#fed7aa', label: 'Bezig' },
  afgerond:      { bg: '#f0fdf4', text: '#15a34a', border: '#bbf7d0', label: 'Klaar' },
};

const labelStyle = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--dl)', marginBottom: 3 };

// ── WERKBON KAARTJE ───────────────────────────────────────────────────────────

function WerkbonCard({ werkbon, compact = false, onClick }) {
  const st = STATUS[werkbon.status] || STATUS.gepland;
  return (
    <div
      onClick={onClick}
      style={{
        background: st.bg, border: `1px solid ${st.border}`, borderRadius: 8,
        padding: compact ? '5px 7px' : '7px 9px', cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 11, color: st.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {werkbon.titel}
      </div>
      {(werkbon.starttijd || werkbon.eindtijd) && (
        <div style={{ fontSize: 10, color: 'var(--dl)', marginBottom: 1 }}>
          {fmtTime(werkbon.starttijd)}{werkbon.eindtijd ? `–${fmtTime(werkbon.eindtijd)}` : ''}
        </div>
      )}
      {!compact && werkbon.customerName && (
        <div style={{ fontSize: 10, color: 'var(--dmu)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {werkbon.customerName}
        </div>
      )}
      {!compact && werkbon.locatie && (
        <div style={{ fontSize: 10, color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {I.map} {werkbon.locatie}
        </div>
      )}
    </div>
  );
}

// ── DRAGGABLE WERKBON ─────────────────────────────────────────────────────────

function DraggableWerkbon({ werkbon, compact, onDetailClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: werkbon.id,
    data: { werkbon },
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    touchAction: 'none',
    marginBottom: 4,
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <WerkbonCard werkbon={werkbon} compact={compact} onClick={e => { e.stopPropagation(); onDetailClick?.(werkbon); }} />
    </div>
  );
}

// ── DROPPABLE CEL ─────────────────────────────────────────────────────────────

function DroppableCell({ cellId, children, isToday }) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 64,
        padding: '4px 5px',
        background: isOver ? 'var(--pll)' : isToday ? '#f8fff9' : '#fff',
        border: `1px solid ${isOver ? 'var(--p)' : 'var(--border)'}`,
        borderRadius: 0,
        transition: 'background .12s, border-color .12s',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
}

// ── UNPLANNED DROP ZONE ───────────────────────────────────────────────────────

function UnplannedZone({ werkbonnen, isOpen, onToggle, onDetailClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unplanned' });
  if (werkbonnen.length === 0 && !isOpen) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 6 }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dk)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Niet ingepland ({werkbonnen.length})
        </span>
        <span style={{ fontSize: 12, color: 'var(--dl)' }}>{isOpen ? I.chev_d : I.chev_r}</span>
      </button>
      {isOpen && (
        <div
          ref={setNodeRef}
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px',
            background: isOver ? 'var(--pll)' : 'var(--bgs)',
            border: `2px dashed ${isOver ? 'var(--p)' : 'var(--border)'}`,
            borderRadius: 10, minHeight: 56, transition: 'background .12s, border-color .12s',
          }}
        >
          {werkbonnen.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--dl)', alignSelf: 'center' }}>Sleep werkbonnen hiernaartoe om ze te ontplannen.</div>
            : werkbonnen.map(w => (
                <div key={w.id} style={{ width: 170 }}>
                  <DraggableWerkbon werkbon={w} compact onDetailClick={onDetailClick} />
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── QUICK PLAN MODAL ──────────────────────────────────────────────────────────

function PlanModal({ teamMembers, voertuigen, customers, projects, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titel: '', customer_id: '', project_id: '', gepland_op: toISO(new Date()),
    starttijd: '', eindtijd: '', assigned_to: '', voertuig_id: '', locatie: '', omschrijving: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filteredProjects = form.customer_id
    ? projects.filter(p => p.customerId === form.customer_id)
    : projects;

  const submit = async () => {
    if (!form.titel.trim()) { toast.error('Titel is verplicht'); return; }
    setSaving(true);
    try {
      const wb = await createWerkbon({
        titel: form.titel.trim(),
        customer_id: form.customer_id || null,
        project_id: form.project_id || null,
        gepland_op: form.gepland_op || null,
        starttijd: form.starttijd || null,
        eindtijd: form.eindtijd || null,
        assigned_to: form.assigned_to || null,
        voertuig_id: form.voertuig_id || null,
        locatie: form.locatie || null,
        omschrijving: form.omschrijving || null,
        status: 'gepland',
      });
      toast.success('Werkbon ingepland');
      onSaved(wb);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540, width: '90vw' }}>
        <div className="modal-hd">
          <div className="modal-title">Werkbon inplannen</div>
          <ModalX onClose={onClose} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 8px' }}>
          <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="f" style={{ gridColumn: '1 / -1' }}>
              <label>Titel *</label>
              <input autoFocus value={form.titel} onChange={e => set('titel', e.target.value)} placeholder="Bijv. Dakgoot reinigen" onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
            <div className="f">
              <label>Klant</label>
              <select value={form.customer_id} onChange={e => { set('customer_id', e.target.value); set('project_id', ''); }}>
                <option value="">— Geen klant —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="f">
              <label>Project</label>
              <select value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Geen project —</option>
                {filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="f">
              <label>Datum</label>
              <input type="date" value={form.gepland_op} onChange={e => set('gepland_op', e.target.value)} />
            </div>
            <div className="f" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div className="f">
                <label>Starttijd</label>
                <input type="time" value={form.starttijd} onChange={e => set('starttijd', e.target.value)} />
              </div>
              <div className="f">
                <label>Eindtijd</label>
                <input type="time" value={form.eindtijd} onChange={e => set('eindtijd', e.target.value)} />
              </div>
            </div>
            <div className="f">
              <label>Medewerker</label>
              <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                <option value="">— Niet toegewezen —</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
              </select>
            </div>
            <div className="f">
              <label>Voertuig</label>
              <select value={form.voertuig_id} onChange={e => set('voertuig_id', e.target.value)}>
                <option value="">— Geen voertuig —</option>
                {voertuigen.map(v => <option key={v.id} value={v.id}>{v.naam}{v.kenteken ? ` (${v.kenteken})` : ''}</option>)}
              </select>
            </div>
            <div className="f" style={{ gridColumn: '1 / -1' }}>
              <label>Locatie</label>
              <input value={form.locatie} onChange={e => set('locatie', e.target.value)} placeholder="Adres of omschrijving" />
            </div>
            <div className="f" style={{ gridColumn: '1 / -1' }}>
              <label>Omschrijving</label>
              <MentionEditor
                value={form.omschrijving}
                onChange={v => set('omschrijving', v)}
                rows={3}
                placeholder="Instructies voor de medewerker…"
                teamMembers={teamMembers}
              />
            </div>
          </div>
        </div>
        <div className="fa" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Inplannen…' : 'Inplannen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── WERKBON DETAIL MODAL (lichtgewicht) ───────────────────────────────────────

function WerkbonDetailModal({ werkbon, teamMembers, voertuigen, customers, onClose, onUpdated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titel: werkbon.titel || '',
    gepland_op: werkbon.geplandOp || '',
    starttijd: werkbon.starttijd || '',
    eindtijd: werkbon.eindtijd || '',
    assigned_to: werkbon.assignedTo || '',
    voertuig_id: werkbon.voertuigId || '',
    locatie: werkbon.locatie || '',
    status: werkbon.status || 'gepland',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const updated = await updateWerkbon(werkbon.id, {
        titel: form.titel.trim() || werkbon.titel,
        gepland_op: form.gepland_op || null,
        starttijd: form.starttijd || null,
        eindtijd: form.eindtijd || null,
        assigned_to: form.assigned_to || null,
        voertuig_id: form.voertuig_id || null,
        locatie: form.locatie || null,
        status: form.status,
      });
      onUpdated(updated);
      toast.success('Werkbon bijgewerkt');
      onClose();
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const st = STATUS[werkbon.status] || STATUS.gepland;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, width: '90vw' }}>
        <div className="modal-hd">
          <div>
            <span className="badge" style={{ background: st.bg, color: st.text, marginBottom: 4 }}>{st.label}</span>
            <div className="modal-title">{werkbon.titel}</div>
            {werkbon.customerName && <div className="modal-sub">{werkbon.customerName}</div>}
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="f" style={{ gridColumn: '1 / -1' }}>
            <label>Titel</label>
            <input value={form.titel} onChange={e => set('titel', e.target.value)} />
          </div>
          <div className="f">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="gepland">Gepland</option>
              <option value="in_uitvoering">In uitvoering</option>
              <option value="afgerond">Afgerond</option>
            </select>
          </div>
          <div className="f">
            <label>Datum</label>
            <input type="date" value={form.gepland_op} onChange={e => set('gepland_op', e.target.value)} />
          </div>
          <div className="f">
            <label>Starttijd</label>
            <input type="time" value={form.starttijd} onChange={e => set('starttijd', e.target.value)} />
          </div>
          <div className="f">
            <label>Eindtijd</label>
            <input type="time" value={form.eindtijd} onChange={e => set('eindtijd', e.target.value)} />
          </div>
          <div className="f">
            <label>Medewerker</label>
            <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">— Geen —</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Voertuig</label>
            <select value={form.voertuig_id} onChange={e => set('voertuig_id', e.target.value)}>
              <option value="">— Geen —</option>
              {voertuigen.map(v => <option key={v.id} value={v.id}>{v.naam}</option>)}
            </select>
          </div>
          <div className="f" style={{ gridColumn: '1 / -1' }}>
            <label>Locatie</label>
            <input value={form.locatie} onChange={e => set('locatie', e.target.value)} />
          </div>
        </div>
        <div className="fa" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── PLANNING GRID ─────────────────────────────────────────────────────────────

function PlanningGrid({ rows, weekDays, today, werkbonnen, viewMode, onDetailClick }) {
  const COL_W = 140;
  const ROW_LABEL_W = 150;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: ROW_LABEL_W + COL_W * 7 }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: `${ROW_LABEL_W}px repeat(7, ${COL_W}px)`, position: 'sticky', top: 0, zIndex: 3, background: '#fff' }}>
          <div style={{ borderRight: '2px solid var(--border)', borderBottom: '2px solid var(--border)', padding: '8px 10px' }} />
          {weekDays.map(date => {
            const isToday = date === today;
            return (
              <div key={date} style={{
                padding: '8px 6px', textAlign: 'center',
                borderRight: '1px solid var(--border)', borderBottom: '2px solid var(--border)',
                background: isToday ? 'var(--pll)' : '#fafaf8',
                fontWeight: isToday ? 800 : 600, fontSize: 11,
                color: isToday ? 'var(--pd)' : 'var(--dk)',
              }}>
                {fmtDay(new Date(date))}
                {isToday && <div style={{ fontSize: 9, color: 'var(--pd)', fontWeight: 700, marginTop: 1 }}>VANDAAG</div>}
              </div>
            );
          })}
        </div>

        {/* Data rows */}
        {rows.map((row, ri) => {
          const totalPerDay = weekDays.map(date => {
            const dayWbs = werkbonnen.filter(w => {
              const matchDate = w.geplandOp === date;
              const matchRow = viewMode === 'medewerker' ? w.assignedTo === row.id : w.voertuigId === row.id;
              return matchDate && matchRow;
            });
            return dayWbs.reduce((sum, w) => sum + calcHours(w.starttijd, w.eindtijd), 0);
          });

          return (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: `${ROW_LABEL_W}px repeat(7, ${COL_W}px)`, borderBottom: ri < rows.length - 1 ? '2px solid var(--border)' : '1px solid var(--border)' }}>
              {/* Row label */}
              <div style={{
                padding: '10px 10px', borderRight: '2px solid var(--border)',
                background: '#fafaf8', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                position: 'sticky', left: 0, zIndex: 1,
              }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--dk)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.label}
                </div>
                {row.sublabel && (
                  <div style={{ fontSize: 10, color: 'var(--dl)', marginTop: 2 }}>{row.sublabel}</div>
                )}
              </div>

              {/* Day cells */}
              {weekDays.map((date, di) => {
                const isToday = date === today;
                const cellId = `cell:${row.id}:${date}`;
                const cellWbs = werkbonnen.filter(w => {
                  const matchDate = w.geplandOp === date;
                  const matchRow = viewMode === 'medewerker' ? w.assignedTo === row.id : w.voertuigId === row.id;
                  return matchDate && matchRow;
                });
                const hours = totalPerDay[di];
                const overCapacity = hours > 8;

                return (
                  <DroppableCell key={date} cellId={cellId} isToday={isToday}>
                    {cellWbs.map(w => (
                      <DraggableWerkbon key={w.id} werkbon={w} onDetailClick={onDetailClick} />
                    ))}
                    {hours > 0 && (
                      <div style={{
                        fontSize: 9, fontWeight: 700, textAlign: 'right', marginTop: 2,
                        color: overCapacity ? '#dc2626' : 'var(--dl)',
                      }}>
                        {fmtHours(hours)}
                      </div>
                    )}
                  </DroppableCell>
                );
              })}
            </div>
          );
        })}

        {rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--dl)', fontSize: 13 }}>
            {viewMode === 'medewerker' ? 'Geen medewerkers gevonden.' : 'Geen actieve voertuigen gevonden.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PLANNING PAGE ─────────────────────────────────────────────────────────────

export function PlanningPage() {
  const toast = useToast();
  const { profile } = useProfile();

  const [weekStart, setWeekStart] = useState(() => getMonday());
  const [viewMode, setViewMode] = useState('medewerker');
  const [loading, setLoading] = useState(true);
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [voertuigen, setVoertuigen] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [detailWerkbon, setDetailWerkbon] = useState(null);
  const [showUnplanned, setShowUnplanned] = useState(true);
  const [activeId, setActiveId] = useState(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
  const today = toISO(new Date());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wbs, members, voerts, custs, projs] = await Promise.all([
        getWerkbonnen(),
        getTeamMembers().catch(() => []),
        getVoertuigen().catch(() => []),
        listCustomers().catch(() => []),
        getProjects().catch(() => []),
      ]);
      setWerkbonnen(wbs);
      setTeamMembers(members);
      setVoertuigen(voerts);
      setCustomers(custs);
      setProjects(projs);
    } catch (e) {
      toast.error(e.message || 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DND ────────────────────────────────────────────────────────────────────

  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null);
    if (!over) return;

    const wb = werkbonnen.find(w => w.id === active.id);
    if (!wb) return;

    const overId = String(over.id);

    if (overId === 'unplanned') {
      // Terug naar niet-ingepland
      const updated = { ...wb, geplandOp: null, assignedTo: null, voertuigId: null };
      setWerkbonnen(prev => prev.map(w => w.id === wb.id ? updated : w));
      try {
        await updateWerkbon(wb.id, { gepland_op: null, assigned_to: null, voertuig_id: null });
      } catch (e) {
        toast.error(e.message || 'Update mislukt');
        loadData();
      }
      return;
    }

    if (!overId.startsWith('cell:')) return;
    const parts = overId.split(':');
    const rowId = parts[1];
    const date = parts[2];

    const updates = { gepland_op: date };
    let prevAssigned = wb.assignedTo;

    if (viewMode === 'medewerker') {
      updates.assigned_to = rowId;
    } else {
      updates.voertuig_id = rowId;
    }

    // Optimistic update
    const optimistic = {
      ...wb,
      geplandOp: date,
      ...(viewMode === 'medewerker'
        ? { assignedTo: rowId, assignedName: teamMembers.find(m => m.id === rowId)?.fullName || '' }
        : { voertuigId: rowId }),
    };
    setWerkbonnen(prev => prev.map(w => w.id === wb.id ? optimistic : w));

    try {
      const saved = await updateWerkbon(wb.id, updates);
      setWerkbonnen(prev => prev.map(w => w.id === wb.id ? saved : w));

      // Notificatie naar nieuwe medewerker
      if (viewMode === 'medewerker' && rowId !== prevAssigned && profile?.id) {
        const m = teamMembers.find(x => x.id === rowId);
        createAssignmentNotification({
          assignedToUserId: rowId,
          assignedToName: m?.fullName,
          type: 'toewijzing_werkbon',
          title: `Je bent ingepland voor: ${wb.titel}`,
          link: 'werkbonnen',
          relatedType: 'werkbon',
          relatedId: wb.id,
          creatorId: profile.id,
          creatorName: profile.fullName,
        }).catch(() => {});
      }
    } catch (e) {
      toast.error(e.message || 'Update mislukt');
      loadData();
    }
  };

  // ── ROWS ───────────────────────────────────────────────────────────────────

  const rows = viewMode === 'medewerker'
    ? teamMembers.map(m => ({ id: m.id, label: m.fullName, sublabel: m.role || '' }))
    : voertuigen.map(v => ({ id: v.id, label: v.naam, sublabel: v.kenteken || '' }));

  // Unplanned: geen datum OF (medewerker view: geen assignedTo) OF (voertuig view: geen voertuigId)
  const unplanned = werkbonnen.filter(w => {
    if (viewMode === 'medewerker') return !w.geplandOp || !w.assignedTo;
    return !w.geplandOp || !w.voertuigId;
  });

  // Active drag werkbon for overlay
  const activeDragWb = activeId ? werkbonnen.find(w => w.id === activeId) : null;

  if (!profile || profile.role !== 'admin') {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--dl)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Geen toegang</div>
        <div>De Planning pagina is alleen zichtbaar voor admins.</div>
      </div>
    );
  }

  return (
    <div>
      {/* ── HEADER ── */}
      <div className="page-hd afu">
        <div>
          <h1>Planning</h1>
          <p>{fmtWeekRange(weekStart)}</p>
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm" onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Vorige week">{I.chev_l}</button>
          <button className="btn btn-s btn-sm" onClick={() => setWeekStart(getMonday())}>Deze week</button>
          <button className="btn btn-s btn-sm" onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Volgende week">{I.chev_r}</button>
          <div className="tabs" style={{ marginLeft: 8 }}>
            <button className={`tab${viewMode === 'medewerker' ? ' active' : ''}`} onClick={() => setViewMode('medewerker')}>Per medewerker</button>
            <button className={`tab${viewMode === 'voertuig' ? ' active' : ''}`} onClick={() => setViewMode('voertuig')}>Per voertuig</button>
          </div>
          <button className="btn btn-p btn-sm" onClick={() => setShowPlanModal(true)}>
            {I.plus} Werkbon inplannen
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Planning laden…</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* ── NIET-INGEPLAND PANEL ── */}
          <UnplannedZone
            werkbonnen={unplanned}
            isOpen={showUnplanned}
            onToggle={() => setShowUnplanned(v => !v)}
            onDetailClick={setDetailWerkbon}
          />

          {/* ── PLANNING GRID ── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <PlanningGrid
              rows={rows}
              weekDays={weekDays}
              today={today}
              werkbonnen={werkbonnen}
              viewMode={viewMode}
              onDetailClick={setDetailWerkbon}
            />
          </div>

          {/* ── DRAG OVERLAY ── */}
          <DragOverlay>
            {activeDragWb && (
              <div style={{ width: 130, pointerEvents: 'none', opacity: 0.9 }}>
                <WerkbonCard werkbon={activeDragWb} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── MODALS ── */}
      {showPlanModal && (
        <PlanModal
          teamMembers={teamMembers}
          voertuigen={voertuigen}
          customers={customers}
          projects={projects}
          onClose={() => setShowPlanModal(false)}
          onSaved={wb => setWerkbonnen(prev => [wb, ...prev])}
        />
      )}

      {detailWerkbon && (
        <WerkbonDetailModal
          werkbon={detailWerkbon}
          teamMembers={teamMembers}
          voertuigen={voertuigen}
          customers={customers}
          onClose={() => setDetailWerkbon(null)}
          onUpdated={updated => {
            setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
            setDetailWerkbon(null);
          }}
        />
      )}
    </div>
  );
}

export default PlanningPage;
