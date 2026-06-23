import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { getActiveTeamMembers, createAssignmentNotification } from '../services/notificatieService.js';
import { listCustomers } from '../services/customerService.js';
import { getProjects } from '../services/projectsService.js';
import { upsertWerkbonEvent, upsertActivityEvent, deleteWerkbonEvent, deleteActivityEvent } from '../services/calendarService.js';
import { listActivities, createActivity, buildDueAt } from '../services/activityService.js';
import { ActivityEditModal } from '../components/SharedModals.jsx';
import { supabase } from '../lib/supabase.js';
import { NoteEditor } from '../components/NoteEditor.jsx';

// ── TIJDLIJN CONSTANTEN ───────────────────────────────────────────────────────

const HOUR_START  = 7;
const HOUR_END    = 20;
const TOTAL_HOURS = HOUR_END - HOUR_START; // 13
const PX_PER_HOUR = 64;
const TIMELINE_H  = TOTAL_HOURS * PX_PER_HOUR; // 832px
const TIME_COL_W  = 52;
const DAY_COL_W   = 'minmax(110px, 1fr)';
const LEGEND_W    = 170;

// ── WEEK HELPERS ──────────────────────────────────────────────────────────────

const NL_DAYS  = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
const NL_MONTHS = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toISO(d) { return d.toISOString().slice(0, 10); }

function fmtWeekRange(monday) {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth())
    return `${monday.getDate()}–${sunday.getDate()} ${NL_MONTHS[monday.getMonth()]} ${monday.getFullYear()}`;
  return `${monday.getDate()} ${NL_MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${NL_MONTHS[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

function fmtDayShort(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return `${NL_DAYS[(d.getDay() + 6) % 7].slice(0, 2)} ${d.getDate()}`;
}

// ── TIJD HELPERS ──────────────────────────────────────────────────────────────

function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToTopPx(t) {
  const mins = timeToMins(t || `${HOUR_START}:00`);
  return Math.max(0, (mins - HOUR_START * 60) * PX_PER_HOUR / 60);
}

function durationToPx(start, end) {
  if (!start || !end) return PX_PER_HOUR;
  const dur = timeToMins(end) - timeToMins(start);
  return Math.max(22, dur * PX_PER_HOUR / 60);
}

function fmtTime(t) { return t ? String(t).slice(0, 5) : ''; }

// ── HSL KLEURPALETTE ─────────────────────────────────────────────────────────

const HSL_HUES = [120, 200, 30, 280, 350, 60, 160, 240, 310, 170];

function entityColor(index) {
  const h = HSL_HUES[index % HSL_HUES.length];
  return {
    bg:     `hsl(${h}, 55%, 93%)`,
    text:   `hsl(${h}, 60%, 32%)`,
    border: `hsl(${h}, 50%, 80%)`,
    bar:    `hsl(${h}, 65%, 50%)`,
    dot:    `hsl(${h}, 65%, 50%)`,
  };
}

// Bouw een map: entityId → kleur (stabiel op volgorde in de array)
function buildColorMap(ids) {
  const map = {};
  [...new Set(ids)].forEach((id, i) => { map[id] = entityColor(i); });
  return map;
}

// ── OVERLAPCALCULATOR (voor blokken in dezelfde kolom) ────────────────────────

function assignLanes(blocks) {
  const sorted = [...blocks].sort(
    (a, b) => timeToMins(a.starttijd || '07:00') - timeToMins(b.starttijd || '07:00')
  );
  const laneEnds = [];
  const withLane = sorted.map(b => {
    const start = timeToMins(b.starttijd || '07:00');
    const end   = timeToMins(b.eindtijd  || minsToTime(timeToMins(b.starttijd || '07:00') + 60));
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > start) lane++;
    laneEnds[lane] = end;
    return { ...b, _lane: lane };
  });
  const totalLanes = laneEnds.length || 1;
  return withLane.map(b => ({ ...b, _totalLanes: totalLanes }));
}

// ── WERKBON BLOK (in tijdlijn) ────────────────────────────────────────────────

function WerkbonBlock({ werkbon, color, onClick }) {
  const top    = timeToTopPx(werkbon.starttijd);
  const height = durationToPx(werkbon.starttijd, werkbon.eindtijd);
  const lane   = werkbon._lane || 0;
  const total  = werkbon._totalLanes || 1;
  const w      = `${100 / total}%`;
  const left   = `${(lane / total) * 100}%`;

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(werkbon); }}
      title={`${werkbon.titel}\n${fmtTime(werkbon.starttijd)}–${fmtTime(werkbon.eindtijd)}\n${werkbon.customerName || ''}`}
      style={{
        position: 'absolute', top, left, width: w, height,
        background: color.bg,
        borderLeft: `3px solid ${color.bar}`,
        border: `1px solid ${color.border}`,
        borderRadius: 4,
        padding: '3px 5px 2px',
        overflow: 'hidden',
        cursor: 'pointer',
        boxSizing: 'border-box',
        zIndex: 3,
        transition: 'filter .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(.96)')}
      onMouseLeave={e => (e.currentTarget.style.filter = '')}
    >
      <div style={{ fontWeight: 700, fontSize: 10, color: color.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
        {werkbon.titel}
      </div>
      {height > 30 && (
        <div style={{ fontSize: 9, color: color.text, opacity: .75, lineHeight: 1.2 }}>
          {fmtTime(werkbon.starttijd)}–{fmtTime(werkbon.eindtijd)}
        </div>
      )}
      {height > 50 && werkbon.customerName && (
        <div style={{ fontSize: 9, color: color.text, opacity: .6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {werkbon.customerName}
        </div>
      )}
    </div>
  );
}

// ── ACTIVITEIT BLOK (in tijdlijn) ────────────────────────────────────────────

function ActivityBlock({ activity, onClick }) {
  const top    = timeToTopPx(activity.starttijd);
  const height = durationToPx(activity.starttijd, activity.eindtijd);
  const lane   = activity._lane || 0;
  const total  = activity._totalLanes || 1;

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick && onClick(activity._orig); }}
      title={`${activity.titel}\n${fmtTime(activity.starttijd)}–${fmtTime(activity.eindtijd)}\n${activity.customerName || ''}`}
      style={{
        position: 'absolute',
        top, left: `${(lane / total) * 100}%`,
        width: `${100 / total}%`, height,
        background: 'rgba(29,219,98,.14)',
        borderLeft: '3px solid #1DDB62',
        border: '1px solid rgba(29,219,98,.35)',
        borderRadius: 4, padding: '3px 5px 2px',
        overflow: 'hidden', cursor: 'pointer',
        boxSizing: 'border-box', zIndex: 3,
        transition: 'filter .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(.95)')}
      onMouseLeave={e => (e.currentTarget.style.filter = '')}
    >
      <div style={{ fontWeight: 700, fontSize: 10, color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
        {activity.titel}
      </div>
      {height > 30 && (
        <div style={{ fontSize: 9, color: '#15803d', opacity: .75, lineHeight: 1.2 }}>
          {fmtTime(activity.starttijd)}–{fmtTime(activity.eindtijd)}
        </div>
      )}
      {height > 50 && activity.customerName && (
        <div style={{ fontSize: 9, color: '#15803d', opacity: .6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {activity.customerName}
        </div>
      )}
    </div>
  );
}

// ── DRAGGABLE (niet-ingepland) ────────────────────────────────────────────────

function DraggableUnplanned({ werkbon, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag:${werkbon.id}`,
    data: { werkbon },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners} {...attributes}
      onClick={e => { e.stopPropagation(); onClick(werkbon); }}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? .3 : 1,
        background: '#fff7ed', border: '1px solid #fed7aa',
        borderRadius: 8, padding: '6px 9px', cursor: 'grab',
        userSelect: 'none', touchAction: 'none',
        minWidth: 120, maxWidth: 160,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 11, color: '#b45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {werkbon.titel}
      </div>
      {werkbon.customerName && (
        <div style={{ fontSize: 10, color: '#d97706', marginTop: 1 }}>{werkbon.customerName}</div>
      )}
    </div>
  );
}

// ── DROPPABLE TIJDSLOT ────────────────────────────────────────────────────────

function TimeSlotDrop({ date, hour }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${date}:${String(hour).padStart(2,'0')}` });
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        top: (hour - HOUR_START) * PX_PER_HOUR,
        left: 0, right: 0, height: PX_PER_HOUR,
        background: isOver ? 'rgba(29,219,98,.12)' : 'transparent',
        zIndex: 1,
        transition: 'background .1s',
        pointerEvents: 'all',
      }}
    />
  );
}

// ── TIJDLIJN KOLOM ────────────────────────────────────────────────────────────

function DayColumn({ date, werkbonnen, activities = [], colorMap, isToday, allowDrop, onBlockClick, onActivityClick }) {
  const allBlocks = useMemo(() => {
    const wbs = werkbonnen.map(w => ({ ...w, _blockType: 'werkbon' }));
    const acts = activities.map(a => ({
      _blockType: 'activity',
      id: `act:${a.id}`,
      starttijd: a.time || '09:00',
      eindtijd: a.endTime || minsToTime(timeToMins(a.time || '09:00') + 15),
      titel: a.title,
      customerName: a.customerName,
      _orig: a,
    }));
    return [...wbs, ...acts];
  }, [werkbonnen, activities]);

  const withLanes = useMemo(() => assignLanes(allBlocks), [allBlocks]);
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  return (
    <div style={{ position: 'relative', height: TIMELINE_H, borderLeft: '1px solid var(--border)', background: isToday ? 'rgba(29,219,98,.03)' : '#fff' }}>
      {/* Uurlijnen */}
      {hours.map(h => (
        <div key={h} style={{
          position: 'absolute', top: (h - HOUR_START) * PX_PER_HOUR,
          left: 0, right: 0, borderTop: '1px solid var(--border)',
          zIndex: 0,
        }} />
      ))}
      {/* Half-uur lijnen */}
      {hours.map(h => (
        <div key={`h-${h}`} style={{
          position: 'absolute', top: (h - HOUR_START) * PX_PER_HOUR + PX_PER_HOUR / 2,
          left: 0, right: 0, borderTop: '1px dashed #f0ede9',
          zIndex: 0,
        }} />
      ))}
      {/* Droppable zones */}
      {allowDrop && hours.map(h => <TimeSlotDrop key={h} date={date} hour={h} />)}
      {/* Werkbon + Activiteit blokken */}
      {withLanes.map(b => b._blockType === 'activity' ? (
        <ActivityBlock key={b.id} activity={b} onClick={onActivityClick} />
      ) : (
        <WerkbonBlock
          key={b.id}
          werkbon={b}
          color={colorMap[b._colorKey] || entityColor(0)}
          onClick={onBlockClick}
        />
      ))}
    </div>
  );
}

// ── SNEL INPLANNEN MODAL (na drop op tijdslot) ───────────────────────────────

function QuickPlanModal({ werkbon, date, hour, teamMembers, onClose, onSaved }) {
  const toast = useToast();
  const [starttijd, setStarttijd] = useState(minsToTime(hour * 60));
  const [eindtijd,  setEindtijd]  = useState(minsToTime(hour * 60 + 60));
  const [assignedTo, setAssignedTo] = useState(werkbon.assignedTo || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const updated = await updateWerkbon(werkbon.id, {
        gepland_op: date,
        starttijd: starttijd || null,
        eindtijd:  eindtijd  || null,
        assigned_to: assignedTo || null,
      });
      // Werk hét calendar_event van deze werkbon bij (upsert op werkbon_id) —
      // geen nieuw event bij herhaald inplannen.
      if (date && starttijd) {
        upsertWerkbonEvent({
          werkbonId: werkbon.id,
          title: werkbon.titel,
          date,
          time: starttijd,
          end: eindtijd || '',
          customerId: werkbon.customerId || null,
          description: werkbon.omschrijving || '',
        }).catch(() => {});
      }
      toast.success('Werkbon ingepland');
      onSaved(updated);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Inplannen mislukt');
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Inplannen op {dayLabel}</div>
            <div className="modal-sub" style={{ fontWeight: 600 }}>{werkbon.titel}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="f">
              <label>Starttijd</label>
              <input type="time" value={starttijd} onChange={e => setStarttijd(e.target.value)} />
            </div>
            <div className="f">
              <label>Eindtijd</label>
              <input type="time" value={eindtijd} onChange={e => setEindtijd(e.target.value)} />
            </div>
          </div>
          <div className="f">
            <label>Medewerker</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">— Niet toegewezen —</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          </div>
        </div>
        <div className="fa" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Inplannen…' : 'Inplannen'}</button>
        </div>
      </div>
    </div>
  );
}

// ── ACTIVITEIT INPLANNEN MODAL ────────────────────────────────────────────────

const ACT_TYPES = [
  { value: 'call',  label: 'Bellen'      },
  { value: 'visit', label: 'Bezoek'      },
  { value: 'task',  label: 'Vergadering' },
  { value: 'task',  label: 'Klus'        },
  { value: 'follow',label: 'Overig'      },
];

function PlanActivityModal({ teamMembers, voertuigen, customers, werkbonnen, profile, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titel: '', type: 'task', customer_id: '',
    datum: toISO(new Date()), starttijd: '09:00', eindtijd: '09:15',
    assigned_to: '', voertuig_id: '', locatie: '', omschrijving: '',
    werkbon_id: '',
  });
  const [eindtijdManual, setEindtijdManual] = useState(false);
  const [maakWerkbon, setMaakWerkbon] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const werkbonnenVoorKlant = form.customer_id
    ? (werkbonnen || []).filter(w => w.customerId === form.customer_id && !w.activity_id)
    : [];

  const submit = async () => {
    if (!form.titel.trim()) { toast.error('Titel is verplicht'); return; }
    if (!form.datum)        { toast.error('Datum is verplicht'); return; }
    if (!form.starttijd)    { toast.error('Starttijd is verplicht'); return; }
    setSaving(true);
    try {
      const created = await createActivity({
        title: form.titel.trim(),
        type: form.type,
        customer_id: form.customer_id || null,
        due_at: buildDueAt(form.datum, form.starttijd),
        end_time: form.eindtijd || null,
        assigned_to: form.assigned_to || null,
        location: form.locatie || null,
        voertuig_id: form.voertuig_id || null,
        notes: form.omschrijving || null,
      });

      // Eén calendar_event per activiteit (upsert op activiteit_id)
      if (form.datum && form.starttijd) {
        upsertActivityEvent({
          activiteitId: created.id,
          title: form.titel.trim(),
          date: form.datum,
          time: form.starttijd,
          end: form.eindtijd || minsToTime(timeToMins(form.starttijd) + 15),
          customerId: form.customer_id || null,
          location: form.locatie || null,
          description: form.omschrijving || '',
        }).catch(() => {});
      }

      // Notificatie naar toegewezen medewerker
      if (form.assigned_to) {
        const member = teamMembers.find(m => m.id === form.assigned_to);
        createAssignmentNotification({
          assignedToUserId: form.assigned_to,
          assignedToName: member?.fullName,
          type: 'toewijzing_activiteit',
          title: `Je bent toegewezen aan ${form.titel.trim()}`,
          body: `Datum: ${form.datum}${form.starttijd ? ` om ${form.starttijd}` : ''}`,
          link: 'planning',
          relatedType: 'activiteit',
          relatedId: created.id,
          creatorId: profile?.id,
          creatorName: profile?.fullName,
        }).catch(() => {});
      }

      // Bestaande werkbon koppelen
      if (form.werkbon_id) {
        supabase.from('werkbonnen').update({ activity_id: created.id }).eq('id', form.werkbon_id).then(() => {}).catch(() => {});
      }
      // Nieuwe werkbon aanmaken en koppelen
      if (maakWerkbon && !form.werkbon_id) {
        createWerkbon({
          titel: form.titel.trim(),
          customer_id: form.customer_id || null,
          gepland_op: form.datum,
          starttijd: form.starttijd || null,
          eindtijd: form.eindtijd || null,
          assigned_to: form.assigned_to || null,
          voertuig_id: form.voertuig_id || null,
          locatie: form.locatie || null,
          omschrijving: form.omschrijving || null,
          status: 'gepland',
        }).then(wb => {
          if (wb?.id) supabase.from('werkbonnen').update({ activity_id: created.id }).eq('id', wb.id).catch(() => {});
        }).catch(() => {});
      }

      toast.success('Activiteit ingepland');
      onSaved(created);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, width: '90vw' }}>
        <div className="modal-hd">
          <div className="modal-title">Activiteit inplannen</div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="f" style={{ gridColumn: '1 / -1' }}>
            <label>Titel *</label>
            <input autoFocus value={form.titel} onChange={e => set('titel', e.target.value)} placeholder="Bijv. Klantbezoek of vergadering" />
          </div>
          <div className="f">
            <label>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="call">Bellen</option>
              <option value="visit">Bezoek</option>
              <option value="task">Vergadering / Klus</option>
              <option value="follow">Overig</option>
            </select>
          </div>
          <div className="f">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => { set('customer_id', e.target.value); set('werkbon_id', ''); }}>
              <option value="">— Geen klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f" style={{ gridColumn: '1 / -1' }}>
            <label>Datum *</label>
            <input type="date" value={form.datum} onChange={e => set('datum', e.target.value)} />
          </div>
          <div className="f">
            <label>Starttijd *</label>
            <input type="time" value={form.starttijd} onChange={e => {
              set('starttijd', e.target.value);
              if (!eindtijdManual) set('eindtijd', minsToTime(timeToMins(e.target.value) + 15));
            }} />
          </div>
          <div className="f">
            <label>Eindtijd <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(optioneel)</span></label>
            <input type="time" value={form.eindtijd} onChange={e => { setEindtijdManual(true); set('eindtijd', e.target.value); }} />
          </div>
          <div className="f">
            <label>Medewerker</label>
            <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">— Niet toegewezen —</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Voertuig <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(optioneel)</span></label>
            <select value={form.voertuig_id} onChange={e => set('voertuig_id', e.target.value)}>
              <option value="">— Geen voertuig —</option>
              {voertuigen.map(v => <option key={v.id} value={v.id}>{v.naam}{v.kenteken ? ` (${v.kenteken})` : ''}</option>)}
            </select>
          </div>
          <div className="f" style={{ gridColumn: '1 / -1' }}>
            <label>Locatie <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(optioneel)</span></label>
            <input value={form.locatie} onChange={e => set('locatie', e.target.value)} placeholder="Adres of omschrijving" />
          </div>
          <div className="f" style={{ gridColumn: '1 / -1' }}>
            <label>Notities</label>
            <NoteEditor mentions={true} value={form.omschrijving} onChange={v => set('omschrijving', v)} rows={3}
              placeholder="Instructies, agenda punten…" teamMembers={teamMembers} />
          </div>

          {/* Werkbon koppelen */}
          <div className="f" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <label style={{ marginBottom: 6 }}>Werkbon koppelen <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(optioneel)</span></label>
            {werkbonnenVoorKlant.length > 0 ? (
              <select value={form.werkbon_id} onChange={e => { set('werkbon_id', e.target.value); if (e.target.value) setMaakWerkbon(false); }}>
                <option value="">— Geen werkbon —</option>
                {werkbonnenVoorKlant.map(w => <option key={w.id} value={w.id}>{w.titel}</option>)}
              </select>
            ) : form.customer_id ? (
              <div style={{ fontSize: 12, color: 'var(--dl)', marginBottom: 6 }}>Geen openstaande werkbonnen voor deze klant.</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--dl)', marginBottom: 6 }}>Selecteer eerst een klant om werkbonnen te tonen.</div>
            )}
            {!form.werkbon_id && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={maakWerkbon} onChange={e => setMaakWerkbon(e.target.checked)} />
                Nieuwe werkbon aanmaken en koppelen
              </label>
            )}
          </div>
        </div>
        <div className="fa" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Inplannen…' : 'Inplannen'}</button>
        </div>
      </div>
    </div>
  );
}

// ── WERKBON INPLANNEN MODAL ───────────────────────────────────────────────────

function PlanModal({ teamMembers, voertuigen, customers, projects, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titel: '', customer_id: '', project_id: '', gepland_op: toISO(new Date()),
    starttijd: '09:00', eindtijd: '11:00', assigned_to: '', voertuig_id: '', locatie: '', omschrijving: '',
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
      // Eén calendar_event per werkbon (upsert op werkbon_id)
      if (form.gepland_op && form.starttijd) {
        upsertWerkbonEvent({
          werkbonId: wb.id,
          title: form.titel.trim(),
          date: form.gepland_op,
          time: form.starttijd,
          end: form.eindtijd || '',
          customerId: form.customer_id || null,
          description: form.omschrijving || '',
        }).catch(() => {});
      }
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
        <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="f" style={{ gridColumn: '1 / -1' }}>
            <label>Titel *</label>
            <input autoFocus value={form.titel} onChange={e => set('titel', e.target.value)} placeholder="Bijv. Dakgoot reinigen" />
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
          <div className="f" style={{ gridColumn: '1 / -1' }}>
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
            <NoteEditor mentions={true} value={form.omschrijving} onChange={v => set('omschrijving', v)} rows={3}
              placeholder="Instructies voor de medewerker…" teamMembers={teamMembers} />
          </div>
        </div>
        <div className="fa" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Inplannen…' : 'Inplannen'}</button>
        </div>
      </div>
    </div>
  );
}

// ── WERKBON DETAIL MODAL ──────────────────────────────────────────────────────

function DetailModal({ werkbon, teamMembers, voertuigen, onClose, onUpdated, openCustomer }) {
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
      // Sync agenda: ingepland → upsert event, uit-gepland → event verwijderen.
      if (form.gepland_op && form.starttijd) {
        upsertWerkbonEvent({
          werkbonId: werkbon.id,
          title: form.titel.trim() || werkbon.titel,
          date: form.gepland_op,
          time: form.starttijd,
          end: form.eindtijd || '',
          customerId: werkbon.customerId || null,
          description: werkbon.omschrijving || '',
        }).catch(() => {});
      } else {
        deleteWerkbonEvent(werkbon.id).catch(() => {});
      }
      onUpdated(updated);
      toast.success('Opgeslagen');
      onClose();
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const STATUS_OPTS = [
    { v: 'gepland', l: 'Gepland' },
    { v: 'in_uitvoering', l: 'In uitvoering' },
    { v: 'afgerond', l: 'Afgerond' },
  ];

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460, width: '90vw' }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">{werkbon.titel}</div>
            {werkbon.customerName && (
              werkbon.customerId && openCustomer
                ? <button type="button" className="modal-sub" onClick={() => { onClose(); openCustomer(werkbon.customerId); }} title="Open klantkaart" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--p)', fontWeight: 600, textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{werkbon.customerName}</button>
                : <div className="modal-sub">{werkbon.customerName}</div>
            )}
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
              {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
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

// ── LEGENDA ───────────────────────────────────────────────────────────────────

function Legend({ items }) {
  if (!items.length) return null;
  return (
    <div style={{ width: LEGEND_W, flexShrink: 0, paddingLeft: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Legenda</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map(it => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: it.color.dot, flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: 'var(--dk)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PLANNING PAGE ─────────────────────────────────────────────────────────────

export function PlanningPage({ openCustomer } = {}) {
  const toast = useToast();
  const { profile } = useProfile();

  const timelineScrollRef = useRef(null);
  const [weekStart,      setWeekStart]      = useState(() => getMonday());
  const [viewMode,       setViewMode]       = useState('totaal'); // totaal | medewerker | voertuig
  const [selectedMember, setSelectedMember] = useState('');
  const [selectedVehicle,setSelectedVehicle]= useState('');
  const [loading,        setLoading]        = useState(true);
  const [werkbonnen,     setWerkbonnen]     = useState([]);
  const [teamMembers,    setTeamMembers]    = useState([]);
  const [voertuigen,     setVoertuigen]     = useState([]);
  const [customers,      setCustomers]      = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [activities,          setActivities]          = useState([]);
  const [selectedActivity,    setSelectedActivity]    = useState(null);
  const [showPlanModal,       setShowPlanModal]       = useState(false);
  const [showPlanActivityModal, setShowPlanActivityModal] = useState(false);
  const [detailWb,            setDetailWb]            = useState(null);
  const [quickDrop,           setQuickDrop]           = useState(null); // { werkbon, date, hour }
  const [showUnplanned,       setShowUnplanned]       = useState(true);
  const [activeId,            setActiveId]            = useState(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
  const today = toISO(new Date());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wbs, members, voerts, custs, projs, acts] = await Promise.all([
        getWerkbonnen(),
        getActiveTeamMembers({ includeSelf: true }).catch(() => []),
        getVoertuigen().catch(() => []),
        listCustomers().catch(() => []),
        getProjects().catch(() => []),
        listActivities().catch(() => []),
      ]);
      setWerkbonnen(wbs);
      setTeamMembers(members);
      setVoertuigen(voerts);
      setCustomers(custs);
      setProjects(projs);
      setActivities(acts);
    } catch (e) {
      toast.error(e.message || 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Zet selector op eerste optie als data binnenkomt
  useEffect(() => {
    if (teamMembers.length && !selectedMember) setSelectedMember(teamMembers[0]?.id || '');
  }, [teamMembers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (voertuigen.length && !selectedVehicle) setSelectedVehicle(voertuigen[0]?.id || '');
  }, [voertuigen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── KLEUR MAPS ─────────────────────────────────────────────────────────────

  const colorMap = useMemo(() => {
    if (viewMode === 'totaal') {
      return buildColorMap(teamMembers.map(m => m.id));
    }
    // Per medewerker / voertuig: kleur per project
    const projectIds = [...new Set(werkbonnen.map(w => w.projectId || '__none__'))];
    return buildColorMap(projectIds);
  }, [viewMode, teamMembers, werkbonnen]);

  const legendItems = useMemo(() => {
    if (viewMode === 'totaal') {
      return teamMembers.map(m => ({ id: m.id, label: m.fullName, color: colorMap[m.id] || entityColor(0) }));
    }
    const seen = new Set();
    const items = [];
    werkbonnen.forEach(w => {
      const key = w.projectId || '__none__';
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ id: key, label: w.projectName || '(geen project)', color: colorMap[key] || entityColor(0) });
      }
    });
    return items;
  }, [viewMode, teamMembers, werkbonnen, colorMap]);

  // ── FILTER & COLOR KEY ─────────────────────────────────────────────────────

  const filteredWb = useMemo(() => {
    if (viewMode === 'medewerker') return werkbonnen.filter(w => w.assignedTo === selectedMember);
    if (viewMode === 'voertuig')   return werkbonnen.filter(w => w.voertuigId === selectedVehicle);
    return werkbonnen;
  }, [werkbonnen, viewMode, selectedMember, selectedVehicle]);

  // Voeg _colorKey toe per werkbon
  const colorKeyedWb = useMemo(() => filteredWb.map(w => ({
    ...w,
    _colorKey: viewMode === 'totaal' ? (w.assignedTo || '__none__') : (w.projectId || '__none__'),
  })), [filteredWb, viewMode]);

  // Activiteiten gefilterd per viewMode
  const filteredActivities = useMemo(() => {
    if (viewMode === 'medewerker') return activities.filter(a => a.assignee === selectedMember);
    if (viewMode === 'voertuig')   return []; // activiteiten niet per voertuig tonen
    // totaal: toon alle activiteiten met assigned_to, of eigen activiteiten bij solo ZZP
    return activities.filter(a => a.assignee || !teamMembers.length);
  }, [activities, viewMode, selectedMember, teamMembers]);

  // Niet-ingepland: geen geplandOp OF (totaal: geen assignedTo) OF geen starttijd
  // Een werkbon is "ingepland" zodra hij een datum + starttijd heeft — ook
  // zonder toegewezen medewerker (die verschijnt dan in de Totaal-tijdlijn).
  const unplanned = useMemo(() => werkbonnen.filter(w =>
    !w.geplandOp || !w.starttijd
  ), [werkbonnen]);

  // Active drag werkbon
  const activeDragWb = activeId
    ? werkbonnen.find(w => `drag:${w.id}` === activeId)
    : null;

  // ── DND HANDLERS ───────────────────────────────────────────────────────────

  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const wb = werkbonnen.find(w => `drag:${w.id}` === active.id);
    if (!wb) return;
    const overId = String(over.id);
    if (!overId.startsWith('slot:')) return;
    const [, date, hourStr] = overId.split(':');
    const hour = parseInt(hourStr, 10);
    setQuickDrop({ werkbon: wb, date, hour });
  };

  // Scroll de tijdlijn bij laden naar 07:00 (= bovenkant).
  useEffect(() => {
    if (!loading && timelineScrollRef.current) timelineScrollRef.current.scrollTop = 0;
  }, [loading]);

  // ── ADMIN GUARD ─────────────────────────────────────────────────────────────

  if (!profile || profile.role !== 'admin') {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--dl)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--dk)', marginBottom: 6 }}>Geen toegang</div>
        <div>De Planning pagina is alleen voor admins.</div>
      </div>
    );
  }

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  return (
    <div>
      {/* ── HEADER ── */}
      <div className="page-hd afu">
        <div>
          <h1>Planning</h1>
          <p>{fmtWeekRange(weekStart)}</p>
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm" onClick={() => setWeekStart(w => addDays(w, -7))}>{I.chev_l}</button>
          <button className="btn btn-s btn-sm" onClick={() => setWeekStart(getMonday())}>Deze week</button>
          <button className="btn btn-s btn-sm" onClick={() => setWeekStart(w => addDays(w, 7))}>{I.chev_r}</button>
          <div className="tabs" style={{ marginLeft: 8 }}>
            {[['totaal','Totaal'],['medewerker','Medewerker'],['voertuig','Voertuig']].map(([v, l]) => (
              <button key={v} className={`tab${viewMode === v ? ' active' : ''}`} onClick={() => setViewMode(v)}>{l}</button>
            ))}
          </div>
          {/* Selector */}
          {viewMode === 'medewerker' && teamMembers.length > 0 && (
            <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}
              style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          )}
          {viewMode === 'voertuig' && voertuigen.length > 0 && (
            <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}
              style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              {voertuigen.map(v => <option key={v.id} value={v.id}>{v.naam}</option>)}
            </select>
          )}
          <button className="btn btn-s btn-sm" onClick={() => setShowPlanModal(true)}>
            {I.plus} Werkbon inplannen
          </button>
          <button className="btn btn-p btn-sm" onClick={() => setShowPlanActivityModal(true)}>
            {I.plus} Activiteit inplannen
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Planning laden…</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>

          {/* ── NIET-INGEPLAND PANEEL ── */}
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => setShowUnplanned(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dk)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Niet ingepland ({unplanned.length})
              </span>
              <span style={{ fontSize: 11, color: 'var(--dl)' }}>{showUnplanned ? I.chev_d : I.chev_r}</span>
            </button>
            {showUnplanned && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px',
                background: 'var(--bgs)', border: '2px dashed var(--border)', borderRadius: 10, minHeight: 52,
              }}>
                {unplanned.length === 0
                  ? <div style={{ fontSize: 12, color: 'var(--dl)', alignSelf: 'center' }}>Alle werkbonnen zijn ingepland.</div>
                  : unplanned.map(w => (
                      <DraggableUnplanned key={w.id} werkbon={w} onClick={setDetailWb} />
                    ))
                }
              </div>
            )}
          </div>

          {/* ── TIJDLIJN GRID ── */}
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
            {/* Tijdlijn + kolommen */}
            <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', minWidth: 0 }}>
              {/* Dag-header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `${TIME_COL_W}px repeat(7, ${DAY_COL_W})`,
                position: 'sticky', top: 0, zIndex: 10, background: '#fff',
                borderBottom: '2px solid var(--border)',
              }}>
                <div style={{ borderRight: '1px solid var(--border)', padding: '8px 6px' }} />
                {weekDays.map(date => {
                  const isToday = date === today;
                  return (
                    <div key={date} style={{
                      padding: '8px 6px', textAlign: 'center',
                      background: isToday ? 'var(--pll)' : '#fafaf8',
                      borderRight: '1px solid var(--border)',
                      fontWeight: isToday ? 800 : 600, fontSize: 11,
                      color: isToday ? 'var(--pd)' : 'var(--dk)',
                    }}>
                      {fmtDayShort(date)}
                      {isToday && <div style={{ fontSize: 9, color: 'var(--pd)', fontWeight: 700, marginTop: 1 }}>VANDAAG</div>}
                    </div>
                  );
                })}
              </div>

              {/* Tijdlijn body — paddingTop zodat het 07:00-label niet wordt afgesneden */}
              <div ref={timelineScrollRef} style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', paddingTop: 10 }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `${TIME_COL_W}px repeat(7, ${DAY_COL_W})`,
                }}>
                  {/* Tijdlabels */}
                  <div style={{ position: 'relative', height: TIMELINE_H, borderRight: '1px solid var(--border)' }}>
                    {hours.map(h => (
                      <div key={h} style={{
                        position: 'absolute', top: (h - HOUR_START) * PX_PER_HOUR - 7,
                        right: 8, fontSize: 9, fontWeight: 600,
                        color: 'var(--dl)', letterSpacing: '.02em',
                      }}>
                        {String(h).padStart(2,'0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Dag-kolommen */}
                  {weekDays.map(date => {
                    const dayWbs = colorKeyedWb.filter(w => w.geplandOp === date && w.starttijd);
                    const dayActs = filteredActivities.filter(a => a.date === date);
                    return (
                      <DayColumn
                        key={date}
                        date={date}
                        werkbonnen={dayWbs}
                        activities={dayActs}
                        colorMap={colorMap}
                        isToday={date === today}
                        allowDrop
                        onBlockClick={setDetailWb}
                        onActivityClick={setSelectedActivity}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Legenda */}
            {legendItems.length > 0 && (
              <Legend items={legendItems} />
            )}
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeDragWb && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 700, color: '#b45309', pointerEvents: 'none', opacity: .9, maxWidth: 160 }}>
                {activeDragWb.titel}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── MODALS ── */}
      {showPlanModal && (
        <PlanModal
          teamMembers={teamMembers} voertuigen={voertuigen}
          customers={customers} projects={projects}
          onClose={() => setShowPlanModal(false)}
          onSaved={wb => setWerkbonnen(prev => [wb, ...prev])}
        />
      )}

      {showPlanActivityModal && (
        <PlanActivityModal
          teamMembers={teamMembers}
          voertuigen={voertuigen}
          customers={customers}
          werkbonnen={werkbonnen}
          profile={profile}
          onClose={() => setShowPlanActivityModal(false)}
          onSaved={act => setActivities(prev => [act, ...prev])}
        />
      )}

      {selectedActivity && (
        <ActivityEditModal
          activity={selectedActivity}
          teamMembers={teamMembers}
          onClose={() => setSelectedActivity(null)}
          onSaved={updated => {
            setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
            // Sync agenda: ingepland → upsert event, anders event verwijderen.
            if (updated.date && updated.time) {
              upsertActivityEvent({
                activiteitId: updated.id,
                title: updated.title,
                date: updated.date,
                time: updated.time,
                end: updated.endTime || '',
                customerId: updated.custId || null,
                location: updated.location || null,
              }).catch(() => {});
            } else {
              deleteActivityEvent(updated.id).catch(() => {});
            }
            setSelectedActivity(null);
          }}
          onDeleted={id => {
            setActivities(prev => prev.filter(a => a.id !== id));
            setSelectedActivity(null);
          }}
        />
      )}

      {quickDrop && (
        <QuickPlanModal
          werkbon={quickDrop.werkbon}
          date={quickDrop.date}
          hour={quickDrop.hour}
          teamMembers={teamMembers}
          onClose={() => setQuickDrop(null)}
          onSaved={updated => {
            setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
            setQuickDrop(null);
          }}
        />
      )}

      {detailWb && (
        <DetailModal
          werkbon={detailWb}
          teamMembers={teamMembers}
          voertuigen={voertuigen}
          onClose={() => setDetailWb(null)}
          onUpdated={updated => {
            setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
            setDetailWb(null);
          }}
          openCustomer={openCustomer}
        />
      )}
    </div>
  );
}

export default PlanningPage;
