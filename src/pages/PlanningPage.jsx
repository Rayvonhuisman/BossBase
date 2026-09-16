import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, Lock, X } from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { I, ModalX, NotifyMailToggle } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { getWerkbonnen, getWerkbonById, createWerkbon, updateWerkbon, zetWerkbonDagen } from '../services/werkbonService.js';
import { WerkbonDagenVelden, WerkbonLocatieVeld, useKlantAdres } from '../components/WerkbonPlanning.jsx';
import {
  werkbonDagen, tijdenOpDag, tijdenVoorPersoon, ploegOpDag, isIngepland, planningUitWerkbon,
  dagenUitPlanning, controleerPlanning, legePlanning, planningLabel, dubbeleBoekingen, verzetTijd,
} from '../utils/werkbonDagen.js';
import { useBlokSlepen } from '../hooks/useBlokSlepen.js';
import { useUrlTab } from '../hooks/useUrlTab.js';
import { usePlanGuard } from '../components/PlanUpgradeModal.jsx';
import { getVoertuigen } from '../services/voertuigService.js';
import { useWerkbonVoertuigen } from '../components/WerkbonVoertuigen.jsx';
import {
  bezettingVanVoertuig, ctxVoorWerkbon, koppelingVanDag, voertuigDubbel, voertuigenOpDag, voertuigenVanDag,
  voertuigPlanningUitWerkbon, voertuigTijd, voertuigWaarschuwingen,
} from '../utils/voertuigDagen.js';
import { getActiveTeamMembers, notifyNewAssignees } from '../services/notificatieService.js';
import { listCustomers } from '../services/customerService.js';
import { getProjects } from '../services/projectsService.js';
import { syncWerkbonEvents, upsertActivityEvent, deleteActivityEvent } from '../services/calendarService.js';
import { listActivities, createActivity, updateActivity, buildDueAt } from '../services/activityService.js';
import { ActivityEditModal } from '../components/SharedModals.jsx';
import { MemberMultiSelect } from '../components/MemberMultiSelect.jsx';
import { AssigneeResponsibleSelect } from '../components/AssigneeResponsibleSelect.jsx';
import { supabase } from '../lib/supabase.js';
import { NoteEditor } from '../components/NoteEditor.jsx';
import { lokaleDatum } from '../lib/datumTijd.js';

// ── TIJDLIJN CONSTANTEN ───────────────────────────────────────────────────────

const HOUR_START  = 7;
const HOUR_END    = 20;
const TOTAL_HOURS = HOUR_END - HOUR_START; // 13
const PX_PER_HOUR = 64;
const TIMELINE_H  = TOTAL_HOURS * PX_PER_HOUR; // 832px
const TIME_COL_W  = 52;
const DAY_COL_W   = 'minmax(110px, 1fr)';
// Smalste dagkolom die nog leesbaar is; bepaalt vanaf wanneer de tijdlijn
// horizontaal schuift in plaats van de kolommen plat te drukken.
const MIN_DAY_COL_PX = 110;
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
// Was `d.toISOString().slice(0,10)`: dat gaf de UTC-dag, en omdat getMonday op
// lokale middernacht staat (22:00 UTC de dag ervoor) schoof het weekbereik een
// dag terug. lokaleDatum rekent wel naar de Nederlandse dag.
function toISO(d) { return lokaleDatum(d); }

function fmtWeekRange(monday) {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth())
    return `${monday.getDate()}–${sunday.getDate()} ${NL_MONTHS[monday.getMonth()]} ${monday.getFullYear()}`;
  return `${monday.getDate()} ${NL_MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${NL_MONTHS[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

// "maandag 22 juni 2026" — de kop boven de dagweergave.
function fmtDagLang(d) {
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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

// Grijs voor werkbonnen die (nog) aan niemand zijn toegewezen.
const UNASSIGNED_COLOR = {
  bg:     '#f3f4f6',
  text:   '#6b7280',
  border: '#e5e7eb',
  bar:    '#9ca3af',
  dot:    '#9ca3af',
};

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
// `sleep` = { mag, label, slotReden, onVerzet }. Met mag: verslepen verschuift
// de tijd, de boven- en onderrand verzetten begin of eind (useBlokSlepen).

const SLEEP_MIN = HOUR_START * 60;
const SLEEP_MAX = HOUR_END * 60;

function SleepRanden({ kleur }) {
  // Alleen voor de muiscursor en als zichtbaar handvat; welke rand je pakt,
  // rekent useBlokSlepen uit de positie van de klik.
  const rand = { position: 'absolute', left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 2 };
  return (
    <>
      <div aria-hidden style={{ ...rand, top: 0 }} />
      <div aria-hidden style={{ ...rand, bottom: 0 }}>
        <div style={{ width: 16, height: 2, borderRadius: 1, background: kleur, opacity: .45, margin: '2px auto 0' }} />
      </div>
    </>
  );
}

function SleepTijd({ voorlopig, label, kleur }) {
  return (
    <div style={{
      position: 'absolute', left: 3, right: 3, top: 2, zIndex: 4, pointerEvents: 'none',
      background: '#fff', border: `1px solid ${kleur}`, borderRadius: 4, padding: '1px 4px',
      fontSize: 10, fontWeight: 800, color: 'var(--dk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      boxShadow: '0 1px 3px rgba(0,0,0,.12)',
    }}>
      {minsToTime(voorlopig.start)}–{minsToTime(voorlopig.eind)}
      {label && <span style={{ fontWeight: 600, color: 'var(--dl)' }}> · {label}</span>}
    </div>
  );
}

// `doel` is wat er bij het opslaan wordt doorgegeven. Voor een werkbon is dat
// het blok zelf (dat weet welke dag en welke medewerker het toont); voor een
// activiteit de activiteit eronder — het blok heeft een eigen id (act:<id>),
// en daarmee kon de activiteit niet bijgewerkt worden.
function useSleepVoorBlok(blok, sleep, doel = blok) {
  const start = timeToMins(blok.starttijd);
  const eind = blok.eindtijd ? timeToMins(blok.eindtijd) : start + 60;
  return useBlokSlepen({
    start, eind,
    pxPerMin: PX_PER_HOUR / 60,
    // Een blok dat buiten de zichtbare uren begint of eindigt, springt niet naar binnen.
    min: Math.min(SLEEP_MIN, start),
    max: Math.max(SLEEP_MAX, eind),
    uit: !sleep?.mag,
    onKlaar: t => sleep.onVerzet(doel, t),
  });
}

function WerkbonBlock({ werkbon: blok, color, onClick, onDubbel, sleep }) {
  const { elRef, voorlopig, bezig, handlers } = useSleepVoorBlok(blok, sleep);
  const werkbon = voorlopig
    ? { ...blok, starttijd: minsToTime(voorlopig.start), eindtijd: minsToTime(voorlopig.eind) }
    : blok;
  const top    = timeToTopPx(werkbon.starttijd);
  const height = durationToPx(werkbon.starttijd, werkbon.eindtijd);
  const lane   = werkbon._lane || 0;
  const total  = werkbon._totalLanes || 1;
  const w      = `${100 / total}%`;
  const left   = `${(lane / total) * 100}%`;
  const mag    = !!sleep?.mag;
  const waarschuwing = werkbon._dubbel?.length > 0 || werkbon._meldingen?.length > 0;

  return (
    <div
      ref={elRef}
      {...handlers}
      onClick={e => { e.stopPropagation(); onClick(blok); }}
      title={`${werkbon.titel}${werkbon._dagLabel ? ` (${werkbon._dagLabel})` : ''}\n${fmtTime(werkbon.starttijd)}–${fmtTime(werkbon.eindtijd)}\n${[werkbon._persoon, werkbon._voertuig, werkbon.customerName].filter(Boolean).join(' · ')}${sleep?.slotReden ? `\n${sleep.slotReden}` : mag ? '\nSlepen verschuift de tijd, de rand verzet begin of eind' : ''}`}
      style={{
        position: 'absolute', top, left, width: w, height,
        background: color.bg,
        borderLeft: `3px solid ${color.bar}`,
        border: `1px solid ${voorlopig ? color.bar : color.border}`,
        borderRadius: 4,
        padding: '3px 5px 2px',
        overflow: 'hidden',
        cursor: mag ? (voorlopig ? 'grabbing' : 'grab') : 'pointer',
        boxSizing: 'border-box',
        zIndex: voorlopig ? 6 : 3,
        boxShadow: voorlopig ? '0 4px 12px rgba(0,0,0,.18)' : 'none',
        opacity: bezig ? .75 : 1,
        userSelect: mag ? 'none' : undefined,
        WebkitUserSelect: mag ? 'none' : undefined,
        WebkitTouchCallout: mag ? 'none' : undefined,
        transition: voorlopig ? 'none' : 'filter .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(.96)')}
      onMouseLeave={e => (e.currentTarget.style.filter = '')}
    >
      {mag && !voorlopig && <SleepRanden kleur={color.bar} />}
      {voorlopig && <SleepTijd voorlopig={voorlopig} label={sleep.label} kleur={color.bar} />}
      {sleep?.slotReden && (
        <Lock size={9} strokeWidth={2.4} aria-label={sleep.slotReden}
          style={{ position: 'absolute', bottom: 3, right: 3, color: color.text, opacity: .6 }} />
      )}
      {/* Dubbel ingepland, of een voertuig klopt niet: klik = uitleg, zonder
          het blok zelf te openen. */}
      {waarschuwing && (
        <button
          type="button"
          className="pl-dubbel"
          style={{ right: werkbon.assignedToIds && werkbon.assignedToIds.length > 1 ? 24 : 3 }}
          aria-label={`${werkbon._dubbel?.length ? 'Dubbel ingepland' : 'Klopt niet'} — uitleg`}
          title={werkbon._dubbel?.length ? 'Dubbel ingepland' : 'Klopt niet'}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDubbel?.(werkbon, e); }}
        >
          <AlertTriangle size={10} strokeWidth={2.4} />
        </button>
      )}
      {werkbon.assignedToIds && werkbon.assignedToIds.length > 1 && (
        <div title={`${werkbon.assignedToIds.length} medewerkers toegewezen`} style={{ position: 'absolute', top: 2, right: 3, fontSize: 8, fontWeight: 800, color: color.text, background: color.border, borderRadius: 6, padding: '0 4px', lineHeight: 1.6 }}>
          +{werkbon.assignedToIds.length - 1}
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 10, color: color.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, paddingRight: (werkbon.assignedToIds && werkbon.assignedToIds.length > 1 ? 18 : 0) + (waarschuwing ? 16 : 0) }}>
        {werkbon.titel}
      </div>
      {height > 30 && (
        <div style={{ fontSize: 9, color: color.text, opacity: .75, lineHeight: 1.2 }}>
          {fmtTime(werkbon.starttijd)}–{fmtTime(werkbon.eindtijd)}{werkbon._dagLabel ? ` · ${werkbon._dagLabel}` : ''}
        </div>
      )}
      {height > 50 && (werkbon._persoon || werkbon._voertuig || werkbon.customerName) && (
        <div style={{ fontSize: 9, color: color.text, opacity: .6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {[werkbon._persoon, werkbon._voertuig, werkbon.customerName].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}

// ── ACTIVITEIT BLOK (in tijdlijn) ────────────────────────────────────────────

const ACTIVITEIT_KLEUR = '#1DDB62';

function ActivityBlock({ activity: blok, onClick, onDubbel, sleep }) {
  const { elRef, voorlopig, bezig, handlers } = useSleepVoorBlok(blok, sleep, blok._orig || blok);
  const activity = voorlopig
    ? { ...blok, starttijd: minsToTime(voorlopig.start), eindtijd: minsToTime(voorlopig.eind) }
    : blok;
  const top    = timeToTopPx(activity.starttijd);
  const height = durationToPx(activity.starttijd, activity.eindtijd);
  const lane   = activity._lane || 0;
  const total  = activity._totalLanes || 1;
  const mag    = !!sleep?.mag;

  return (
    <div
      ref={elRef}
      {...handlers}
      onClick={e => { e.stopPropagation(); onClick && onClick(blok._orig); }}
      title={`${activity.titel}\n${fmtTime(activity.starttijd)}–${fmtTime(activity.eindtijd)}\n${activity.customerName || ''}${mag ? '\nSlepen verschuift de tijd, de rand verzet begin of eind' : ''}`}
      style={{
        position: 'absolute',
        top, left: `${(lane / total) * 100}%`,
        width: `${100 / total}%`, height,
        background: 'rgba(29,219,98,.14)',
        borderLeft: `3px solid ${ACTIVITEIT_KLEUR}`,
        border: `1px solid ${voorlopig ? ACTIVITEIT_KLEUR : 'rgba(29,219,98,.35)'}`,
        borderRadius: 4, padding: '3px 5px 2px',
        overflow: 'hidden', cursor: mag ? (voorlopig ? 'grabbing' : 'grab') : 'pointer',
        boxSizing: 'border-box', zIndex: voorlopig ? 6 : 3,
        boxShadow: voorlopig ? '0 4px 12px rgba(0,0,0,.18)' : 'none',
        opacity: bezig ? .75 : 1,
        userSelect: mag ? 'none' : undefined,
        WebkitUserSelect: mag ? 'none' : undefined,
        WebkitTouchCallout: mag ? 'none' : undefined,
        transition: voorlopig ? 'none' : 'filter .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(.95)')}
      onMouseLeave={e => (e.currentTarget.style.filter = '')}
    >
      {mag && !voorlopig && <SleepRanden kleur={ACTIVITEIT_KLEUR} />}
      {voorlopig && <SleepTijd voorlopig={voorlopig} label={sleep.label} kleur={ACTIVITEIT_KLEUR} />}
      {activity._dubbel?.length > 0 && (
        <button
          type="button"
          className="pl-dubbel"
          style={{ right: 3 }}
          aria-label="Dubbel ingepland — uitleg"
          title="Dubbel ingepland"
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDubbel?.(activity, e); }}
        >
          <AlertTriangle size={10} strokeWidth={2.4} />
        </button>
      )}
      <div style={{ fontWeight: 700, fontSize: 10, color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, paddingRight: activity._dubbel?.length ? 16 : 0 }}>
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

function DayColumn({
  date, werkbonnen, activities = [], colorMap, isToday, allowDrop, onBlockClick, onActivityClick, onDubbel,
  sleepVoorWerkbon, onWerkbonVerzet, magActiviteitSlepen, onActiviteitVerzet,
}) {
  const allBlocks = useMemo(() => {
    const wbs = werkbonnen.map(w => ({ ...w, _blockType: 'werkbon' }));
    const acts = activities.map(a => ({
      _blockType: 'activity',
      id: `act:${a.id}`,
      starttijd: a.time || '09:00',
      // Zonder eindtijd duurt een activiteit een uur — dat is ook wat het
      // agenda-item krijgt (buildEventTimes). Stond hier een kwartier, dan gaf
      // het blok een kortere klus weer dan er in de agenda staat.
      eindtijd: a.endTime || minsToTime(timeToMins(a.time || '09:00') + 60),
      titel: a.title,
      customerName: a.customerName,
      _datum: a._datum,
      _persoon: a._persoon,
      _dubbel: a._dubbel,
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
        <ActivityBlock
          key={b.id} activity={b} onClick={onActivityClick} onDubbel={onDubbel}
          sleep={{ mag: !!magActiviteitSlepen, label: 'hele activiteit', onVerzet: onActiviteitVerzet }}
        />
      ) : (
        <WerkbonBlock
          key={b._blokKey || b.id}
          werkbon={b}
          // Onbekende sleutel → grijs, niet de kleur van de eerste medewerker:
          // anders ziet een fout eruit als "alles is van hem".
          color={colorMap[b._colorKey] || UNASSIGNED_COLOR}
          onClick={onBlockClick}
          onDubbel={onDubbel}
          sleep={{ ...(sleepVoorWerkbon?.(b) || { mag: false }), onVerzet: onWerkbonVerzet }}
        />
      ))}
    </div>
  );
}

// ── SNEL INPLANNEN MODAL (na drop op tijdslot) ───────────────────────────────

function QuickPlanModal({ werkbon, date, hour, teamMembers, profile, onClose, onSaved }) {
  const toast = useToast();
  const prevIds = werkbon.assignedToIds || (werkbon.assignedTo ? [werkbon.assignedTo] : []);
  const [starttijd, setStarttijd] = useState(minsToTime(hour * 60));
  const [eindtijd,  setEindtijd]  = useState(minsToTime(hour * 60 + 60));
  const [assignedToIds, setAssignedToIds] = useState(prevIds);
  const [verantwoordelijkeIds, setVerantwoordelijkeIds] = useState(
    (werkbon.verantwoordelijkeIds && werkbon.verantwoordelijkeIds.length)
      ? werkbon.verantwoordelijkeIds
      : (prevIds[0] ? [prevIds[0]] : [])
  );
  const [notifyMail, setNotifyMail] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const updated = await updateWerkbon(werkbon.id, {
        gepland_op: date,
        starttijd: starttijd || null,
        eindtijd:  eindtijd  || null,
        assigned_to_ids: assignedToIds,
        verantwoordelijke_ids: verantwoordelijkeIds,
      });
      // Notificeer nieuw toegewezen medewerkers (in-app + optioneel e-mail).
      notifyNewAssignees({
        userIds: assignedToIds, prevUserIds: prevIds, members: teamMembers, sendMail: notifyMail,
        type: 'toewijzing_werkbon', title: `Je bent toegewezen aan ${werkbon.titel}`,
        body: `Datum: ${date}${starttijd ? ` om ${starttijd}` : ''}`,
        link: 'planning', relatedType: 'werkbon', relatedId: werkbon.id,
        creatorId: profile?.id, creatorName: profile?.fullName,
      }).catch(() => {});
      // Agenda bijwerken: één item per geplande dag. Heeft de werkbon meerdere
      // dagen, dan is hij door de nieuwe startdatum in zijn geheel verschoven.
      syncWerkbonEvents(werkbon.id).catch(() => {});
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
          <AssigneeResponsibleSelect
            members={teamMembers}
            assignedIds={assignedToIds}
            verantwoordelijkeIds={verantwoordelijkeIds}
            assignedLabel="Medewerkers"
            onChange={({ assignedIds, verantwoordelijkeIds: v }) => { setAssignedToIds(assignedIds); setVerantwoordelijkeIds(v); }}
          >
            <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
          </AssigneeResponsibleSelect>
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

function PlanActivityModal({ teamMembers, customers, werkbonnen, profile, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titel: '', type: 'task', customer_id: '',
    datum: toISO(new Date()), starttijd: '09:00', eindtijd: '09:15',
    assigned_to_ids: [], locatie: '', omschrijving: '',
    werkbon_id: '',
  });
  const [eindtijdManual, setEindtijdManual] = useState(false);
  const [maakWerkbon, setMaakWerkbon] = useState(false);
  const [notifyMail, setNotifyMail] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const klantAdres = useKlantAdres({ customers, locatie: form.locatie, setLocatie: v => set('locatie', v) });

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
        assigned_to_ids: form.assigned_to_ids,
        location: form.locatie || null,
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

      // Notificatie naar elke nieuw toegewezen medewerker (behalve jezelf).
      notifyNewAssignees({
        userIds: form.assigned_to_ids, members: teamMembers, sendMail: notifyMail,
        type: 'toewijzing_activiteit',
        title: `Je bent toegewezen aan ${form.titel.trim()}`,
        body: `Datum: ${form.datum}${form.starttijd ? ` om ${form.starttijd}` : ''}`,
        link: 'planning', relatedType: 'activiteit', relatedId: created.id,
        creatorId: profile?.id, creatorName: profile?.fullName,
      }).catch(() => {});

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
          assigned_to_ids: form.assigned_to_ids,
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
            <select value={form.customer_id} onChange={e => { set('customer_id', e.target.value); set('werkbon_id', ''); klantAdres.klantGekozen(e.target.value); }}>
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
          {/* Geen voertuig bij een activiteit: voertuigen worden ingepland op de
              dagen van een werkbon (migratie 20260916120000). */}
          <div className="f" style={{ gridColumn: '1 / -1' }}>
            <label>Medewerkers <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(meerdere mogelijk)</span></label>
            <MemberMultiSelect members={teamMembers} value={form.assigned_to_ids} onChange={ids => set('assigned_to_ids', ids)} />
            <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
          </div>
          <WerkbonLocatieVeld
            style={{ gridColumn: '1 / -1' }}
            value={form.locatie}
            onChange={v => set('locatie', v)}
            voorstel={klantAdres.voorstel}
            onNeemOver={klantAdres.neemOver}
            onHoudHuidige={klantAdres.houdHuidige}
            disabled={saving}
          />
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

function PlanModal({ teamMembers, customers, projects, profile, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titel: '', customer_id: '', project_id: '',
    starttijd: '09:00', eindtijd: '11:00', assigned_to_ids: [], verantwoordelijke_ids: [], locatie: '', omschrijving: '',
  });
  const voertuig = useWerkbonVoertuigen({ meerdaags: true });
  const [planning, setPlanning] = useState(() => legePlanning(toISO(new Date())));
  const [notifyMail, setNotifyMail] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const klantAdres = useKlantAdres({ customers, locatie: form.locatie, setLocatie: v => set('locatie', v) });

  const filteredProjects = form.customer_id
    ? projects.filter(p => p.customerId === form.customer_id)
    : projects;

  const submit = async () => {
    if (!form.titel.trim()) { toast.error('Titel is verplicht'); return; }
    const planFout = controleerPlanning(planning, { starttijd: form.starttijd, eindtijd: form.eindtijd });
    if (planFout) { toast.error(planFout); return; }
    const standaard = { starttijd: form.starttijd, eindtijd: form.eindtijd };
    const naamVan = id => teamMembers.find(m => m.id === id)?.fullName;
    const voertuigFout = voertuig.controleer(planning, form.assigned_to_ids, naamVan, standaard);
    if (voertuigFout) { toast.error(voertuigFout); return; }
    const dagen = voertuig.dagen(dagenUitPlanning(planning, form.assigned_to_ids, standaard), planning, form.assigned_to_ids, naamVan, standaard);
    setSaving(true);
    try {
      let wb = await createWerkbon({
        titel: form.titel.trim(),
        customer_id: form.customer_id || null,
        project_id: form.project_id || null,
        gepland_op: dagen[0]?.datum || null,
        starttijd: form.starttijd || null,
        eindtijd: form.eindtijd || null,
        assigned_to_ids: form.assigned_to_ids,
        verantwoordelijke_ids: form.verantwoordelijke_ids,
        ...voertuig.payload,
        locatie: form.locatie || null,
        omschrijving: form.omschrijving || null,
        status: 'gepland',
      });
      // Dagen pas ná het aanmaken (dan is er een id). Mislukt het, dan staat de
      // werkbon er al op de startdatum: melden en sluiten, anders levert nog
      // eens klikken een dubbele op.
      try {
        wb = await zetWerkbonDagen(wb.id, dagen);
      } catch (e) {
        toast.error(`Werkbon aangemaakt, maar de dagen niet: ${e.message || 'onbekende fout'}`);
      }
      // Notificeer toegewezen medewerkers (in-app + optioneel e-mail).
      notifyNewAssignees({
        userIds: form.assigned_to_ids, members: teamMembers, sendMail: notifyMail,
        type: 'toewijzing_werkbon', title: `Je bent toegewezen aan ${form.titel.trim()}`,
        body: `Datum: ${planningLabel(wb)}${form.starttijd ? ` om ${form.starttijd}` : ''}`,
        link: 'planning', relatedType: 'werkbon', relatedId: wb.id,
        creatorId: profile?.id, creatorName: profile?.fullName,
      }).catch(() => {});
      // Agenda: één item per geplande dag.
      syncWerkbonEvents(wb.id).catch(() => {});
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
            <select value={form.customer_id} onChange={e => { set('customer_id', e.target.value); set('project_id', ''); klantAdres.klantGekozen(e.target.value); }}>
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
          <WerkbonDagenVelden
            style={{ gridColumn: '1 / -1' }}
            planning={planning}
            onChange={setPlanning}
            starttijd={form.starttijd}
            eindtijd={form.eindtijd}
            onTijden={t => setForm(f => ({ ...f, ...t }))}
            ploeg={form.assigned_to_ids.map(id => {
              const m = teamMembers.find(x => x.id === id);
              return { id, naam: m?.fullName || 'Medewerker', avatarUrl: m?.avatarUrl || '' };
            })}
            disabled={saving}
            {...voertuig.veldProps}
          />
          <AssigneeResponsibleSelect
            members={teamMembers}
            assignedIds={form.assigned_to_ids}
            verantwoordelijkeIds={form.verantwoordelijke_ids}
            assignedLabel="Medewerkers"
            fieldStyle={{ gridColumn: '1 / -1' }}
            onChange={({ assignedIds, verantwoordelijkeIds }) => setForm(f => ({ ...f, assigned_to_ids: assignedIds, verantwoordelijke_ids: verantwoordelijkeIds }))}
          >
            <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
          </AssigneeResponsibleSelect>
          {voertuig.kiezer(saving, { gridColumn: '1 / -1' })}
          <WerkbonLocatieVeld
            style={{ gridColumn: '1 / -1' }}
            value={form.locatie}
            onChange={v => set('locatie', v)}
            voorstel={klantAdres.voorstel}
            onNeemOver={klantAdres.neemOver}
            onHoudHuidige={klantAdres.houdHuidige}
            disabled={saving}
          />
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

function DetailModal({ werkbon, teamMembers, profile, onClose, onUpdated, openCustomer }) {
  const toast = useToast();
  const prevIds = werkbon.assignedToIds || (werkbon.assignedTo ? [werkbon.assignedTo] : []);
  const [planning, setPlanning] = useState(() => ({ ...planningUitWerkbon(werkbon), ...voertuigPlanningUitWerkbon(werkbon) }));
  const voertuig = useWerkbonVoertuigen({ werkbon, meerdaags: true });
  const [form, setForm] = useState({
    titel: werkbon.titel || '',
    starttijd: werkbon.starttijd || '',
    eindtijd: werkbon.eindtijd || '',
    assigned_to_ids: prevIds,
    verantwoordelijke_ids: (werkbon.verantwoordelijkeIds && werkbon.verantwoordelijkeIds.length)
      ? werkbon.verantwoordelijkeIds
      : (prevIds[0] ? [prevIds[0]] : []),
    locatie: werkbon.locatie || '',
    status: werkbon.status || 'gepland',
  });
  const [notifyMail, setNotifyMail] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    const planFout = controleerPlanning(planning, { starttijd: form.starttijd, eindtijd: form.eindtijd });
    if (planFout) { toast.error(planFout); return; }
    const standaard = { starttijd: form.starttijd, eindtijd: form.eindtijd };
    const naamVan = id => teamMembers.find(m => m.id === id)?.fullName;
    const voertuigFout = voertuig.controleer(planning, form.assigned_to_ids, naamVan, standaard);
    if (voertuigFout) { toast.error(voertuigFout); return; }
    const dagen = voertuig.dagen(dagenUitPlanning(planning, form.assigned_to_ids, standaard), planning, form.assigned_to_ids, naamVan, standaard);
    setSaving(true);
    try {
      const updated = await updateWerkbon(werkbon.id, {
        titel: form.titel.trim() || werkbon.titel,
        gepland_op: dagen[0]?.datum || null,
        starttijd: form.starttijd || null,
        eindtijd: form.eindtijd || null,
        assigned_to_ids: form.assigned_to_ids,
        verantwoordelijke_ids: form.verantwoordelijke_ids,
        ...voertuig.payload,
        locatie: form.locatie || null,
        status: form.status,
      });
      // Notificeer nieuw toegewezen medewerkers (in-app + optioneel e-mail).
      notifyNewAssignees({
        userIds: form.assigned_to_ids, prevUserIds: prevIds, members: teamMembers, sendMail: notifyMail,
        type: 'toewijzing_werkbon', title: `Je bent toegewezen aan ${form.titel.trim() || werkbon.titel}`,
        body: dagen.length ? `Datum: ${planningLabel({ dagen })}${form.starttijd ? ` om ${String(form.starttijd).slice(0, 5)}` : ''}` : undefined,
        link: 'planning', relatedType: 'werkbon', relatedId: werkbon.id,
        creatorId: profile?.id, creatorName: profile?.fullName,
      }).catch(() => {});
      let vers = updated;
      try {
        vers = await zetWerkbonDagen(werkbon.id, dagen);
      } catch (e) {
        toast.error(`Opgeslagen, maar de dagen niet: ${e.message || 'onbekende fout'}`);
      }
      // Agenda bijwerken: één item per geplande dag; niet meer ingepland = weg.
      syncWerkbonEvents(werkbon.id).catch(() => {});
      onUpdated(vers);
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
          <WerkbonDagenVelden
            style={{ gridColumn: '1 / -1' }}
            planning={planning}
            onChange={setPlanning}
            starttijd={form.starttijd}
            eindtijd={form.eindtijd}
            onTijden={t => setForm(f => ({ ...f, ...t }))}
            ploeg={form.assigned_to_ids.map(id => {
              const m = teamMembers.find(x => x.id === id);
              return { id, naam: m?.fullName || 'Medewerker', avatarUrl: m?.avatarUrl || '' };
            })}
            disabled={saving}
            werkbonId={werkbon.id}
            {...voertuig.veldProps}
          />
          <AssigneeResponsibleSelect
            members={teamMembers}
            assignedIds={form.assigned_to_ids}
            verantwoordelijkeIds={form.verantwoordelijke_ids}
            assignedLabel="Medewerkers"
            fieldStyle={{ gridColumn: '1 / -1' }}
            onChange={({ assignedIds, verantwoordelijkeIds }) => setForm(f => ({ ...f, assigned_to_ids: assignedIds, verantwoordelijke_ids: verantwoordelijkeIds }))}
          >
            <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
          </AssigneeResponsibleSelect>
          {voertuig.kiezer(saving, { gridColumn: '1 / -1' })}
          <WerkbonLocatieVeld
            style={{ gridColumn: '1 / -1' }}
            value={form.locatie}
            onChange={v => set('locatie', v)}
            disabled={saving}
          />
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

// Dicht geeft de legenda zijn breedte terug aan de planning — op een telefoon
// scheelt dat een halve kolom. De keuze blijft per browser bewaard.
function Legend({ items, open, onToggle }) {
  if (!items.length) return null;
  if (!open) {
    return (
      <div style={{ flexShrink: 0, paddingLeft: 8 }}>
        <button type="button" className="btn btn-s btn-sm" onClick={onToggle}
          aria-expanded={false} title="Legenda tonen"
          style={{ whiteSpace: 'nowrap' }}>
          {I.chev_l} Legenda
        </button>
      </div>
    );
  }
  return (
    <div style={{ width: LEGEND_W, flexShrink: 0, paddingLeft: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Legenda</span>
        <button type="button" onClick={onToggle} aria-expanded aria-label="Legenda verbergen" title="Legenda verbergen"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dl)', display: 'inline-flex', padding: 2 }}>
          <X size={13} />
        </button>
      </div>
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

const LEGENDA_SLEUTEL = 'bb.planning.legenda';

// ── PLANNING PAGE ─────────────────────────────────────────────────────────────

export function PlanningPage({ openCustomer } = {}) {
  const toast = useToast();
  const { profile } = useProfile();
  const { can } = usePermissions();
  const { plan } = usePlanGuard();

  const timelineScrollRef = useRef(null);
  // Dag of week, net als de agenda: in de URL (?zicht=), zodat verversen je
  // weergave niet omgooit. `anker` is de dag waar je staat; de weekweergave
  // toont de week waarin die dag valt.
  const [zicht, setZicht] = useUrlTab('week', { param: 'zicht', validIds: ['dag', 'week'] });
  const [anker, setAnker] = useState(() => new Date());
  const weekStart = getMonday(anker);
  // Legenda open of dicht — per browser onthouden.
  const [legendaOpen, setLegendaOpen] = useState(() => {
    try { return window.localStorage.getItem(LEGENDA_SLEUTEL) !== 'dicht'; } catch { return true; }
  });
  const wisselLegenda = () => setLegendaOpen(v => {
    try { window.localStorage.setItem(LEGENDA_SLEUTEL, v ? 'dicht' : 'open'); } catch { /* geen opslag beschikbaar */ }
    return !v;
  });
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
  // Uitleg bij een dubbel ingepland blok: { b, x, y } of null. Sluit op een klik ernaast.
  const [dubbelInfo,          setDubbelInfo]          = useState(null);
  useEffect(() => {
    if (!dubbelInfo) return undefined;
    const sluit = () => setDubbelInfo(null);
    document.addEventListener('mousedown', sluit);
    return () => document.removeEventListener('mousedown', sluit);
  }, [dubbelInfo]);

  // Welke dagen er in beeld staan: één dag, of de hele week.
  const zichtbareDagen = zicht === 'dag'
    ? [toISO(anker)]
    : Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
  const today = toISO(new Date());
  const stap = n => setAnker(a => addDays(a, zicht === 'dag' ? n : n * 7));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wbs, members, custs, projs, acts] = await Promise.all([
        getWerkbonnen(),
        getActiveTeamMembers({ includeSelf: true }).catch(() => []),
        listCustomers().catch(() => []),
        getProjects().catch(() => []),
        listActivities().catch(() => []),
      ]);
      setWerkbonnen(wbs);
      setTeamMembers(members);
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
  // Voertuigen alleen met het abonnement. Los van loadData, want de stand van
  // het abonnement kan nét na het laden van de pagina binnenkomen. Inactieve
  // voertuigen doen mee: ze kunnen nog op een werkbon staan.
  const metVoertuigen = plan.has('voertuigen');
  useEffect(() => {
    if (!metVoertuigen) { setVoertuigen([]); return undefined; }
    let bezig = true;
    getVoertuigen({ inclusiefInactief: true }).then(l => { if (bezig) setVoertuigen(l); }).catch(() => {});
    return () => { bezig = false; };
  }, [metVoertuigen]);
  const actieveVoertuigen = useMemo(() => voertuigen.filter(v => v.actief), [voertuigen]);
  useEffect(() => {
    if (actieveVoertuigen.length && !selectedVehicle) setSelectedVehicle(actieveVoertuigen[0]?.id || '');
  }, [actieveVoertuigen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!metVoertuigen && viewMode === 'voertuig') setViewMode('totaal');
  }, [metVoertuigen, viewMode]);

  // Per werkbon met voertuigen: de regels uit utils/voertuigDagen.js op de
  // opgeslagen stand, voor het voertuig op een blok en de waarschuwingen.
  const voertuigCtx = useMemo(() => {
    const kaart = new Map();
    if (!metVoertuigen || !voertuigen.length) return kaart;
    const naamVan = id => teamMembers.find(m => m.id === id)?.fullName;
    for (const w of werkbonnen) {
      if (w.voertuigIds?.length) kaart.set(w.id, ctxVoorWerkbon(w, voertuigen, naamVan));
    }
    return kaart;
  }, [metVoertuigen, voertuigen, werkbonnen, teamMembers]);

  // ── KLEUR MAPS ─────────────────────────────────────────────────────────────

  const colorMap = useMemo(() => {
    if (viewMode === 'totaal') {
      const map = buildColorMap(teamMembers.map(m => m.id));
      // Niet-toegewezen werkbonnen krijgen grijs i.p.v. de kleur van het 1e lid.
      map['__none__'] = UNASSIGNED_COLOR;
      return map;
    }
    // Per medewerker / voertuig: kleur per project
    const projectIds = [...new Set(werkbonnen.map(w => w.projectId || '__none__'))];
    return buildColorMap(projectIds);
  }, [viewMode, teamMembers, werkbonnen]);

  const legendItems = useMemo(() => {
    if (viewMode === 'totaal') {
      const items = teamMembers.map(m => ({ id: m.id, label: m.fullName, color: colorMap[m.id] || entityColor(0) }));
      if (werkbonnen.some(w => !(w.assignedToIds && w.assignedToIds.length) && !w.assignedTo)) {
        items.push({ id: '__none__', label: 'Niet toegewezen', color: UNASSIGNED_COLOR });
      }
      return items;
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
    if (viewMode === 'medewerker') return werkbonnen.filter(w => (w.assignedToIds && w.assignedToIds.includes(selectedMember)) || w.assignedTo === selectedMember);
    if (viewMode === 'voertuig')   return werkbonnen.filter(w => werkbonDagen(w).some(d => voertuigenOpDag(w, d).includes(selectedVehicle)));
    return werkbonnen;
  }, [werkbonnen, viewMode, selectedMember, selectedVehicle]);

  // Voeg _colorKey toe per werkbon
  const colorKeyedWb = useMemo(() => filteredWb.map(w => ({
    ...w,
    // Kleur volgt de toewijzing: eerste toegewezen medewerker (assignedToIds is
    // de bron van waarheid), val terug op de enkele assignedTo, anders grijs.
    _colorKey: viewMode === 'totaal' ? ((w.assignedToIds && w.assignedToIds[0]) || w.assignedTo || '__none__') : (w.projectId || '__none__'),
  })), [filteredWb, viewMode]);

  // Activiteiten gefilterd per viewMode
  const filteredActivities = useMemo(() => {
    if (viewMode === 'medewerker') return activities.filter(a => (a.assignedToIds && a.assignedToIds.includes(selectedMember)) || a.assignee === selectedMember);
    if (viewMode === 'voertuig')   return []; // activiteiten niet per voertuig tonen
    // totaal: toon alle activiteiten met een toewijzing, of eigen activiteiten bij solo ZZP
    return activities.filter(a => (a.assignedToIds && a.assignedToIds.length) || a.assignee || !teamMembers.length);
  }, [activities, viewMode, selectedMember, teamMembers]);

  // Een werkbon is "ingepland" zodra minstens één dag een datum + starttijd heeft
  // — ook zonder toegewezen medewerker (die verschijnt dan in de Totaal-tijdlijn).
  const unplanned = useMemo(() => werkbonnen.filter(w => !isIngepland(w)), [werkbonnen]);

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

  // ── BLOKKEN VERSLEPEN ──────────────────────────────────────────────────────
  // Achter dezelfde planning-gate als de rest van deze pagina. Een werkbonblok
  // mag verslepen wie de werkbon mag bewerken — dezelfde rechten als de
  // database (werkbonnen_update/werkbon_dagen_update). Een ondertekende werkbon
  // staat op slot; dat dwingt de database ook af (migratie 20260915150000).
  // Verzetten hoort bij het planning-recht. Wie alleen op de werkbon staat —
  // ook de verantwoordelijke — mag zijn eigen planning niet verschuiven.
  // Dezelfde regel staat in de database (migratie 20260916091000), dus de UI
  // verbergt niets wat de server wél zou toestaan.
  const magSlepen = plan.has('planning') && can('planning');

  const sleepVoorWerkbon = b => {
    const w = werkbonnen.find(x => x.id === b.id);
    if (!w) return { mag: false };
    if (w.ondertekendOp) return { mag: false, slotReden: 'Ondertekend — de tijden staan op slot' };
    // In de voertuigweergave niet slepen: de tijd van een voertuig pas je aan
    // in de werkbon, waar je ook ziet wie erin zit.
    if (!magSlepen || b._voertuigBlok) return { mag: false };
    // Een blok met een persoon verzet alleen díé persoon op díé dag; de rest van
    // de ploeg blijft staan (zie verzetTijd). Dat staat er tijdens het slepen bij.
    return { mag: true, label: b._pid ? `alleen ${b._persoon || 'deze medewerker'}` : 'deze dag' };
  };

  const magActiviteitSlepen = magSlepen;

  const verzetWerkbon = async (b, { start, eind }) => {
    const w = werkbonnen.find(x => x.id === b.id);
    try {
      if (!w) throw new Error('Werkbon niet gevonden. Ververs de planning.');
      const { dagen, standaard } = verzetTijd(w, b._datum, b._pid || null, {
        starttijd: minsToTime(start), eindtijd: minsToTime(eind),
      });
      // Eerst de dagen, dan pas de standaardtijd. Die laatste verandert alleen
      // als de dagtijd van dag 1 verschuift; de andere dagen hebben dan al hun
      // eigen tijd. Mislukt de tweede stap, dan staat alles nog op de oude tijd
      // in plaats van half verschoven.
      let vers = await zetWerkbonDagen(w.id, dagen);
      if (standaard.starttijd !== fmtTime(w.starttijd) || standaard.eindtijd !== fmtTime(w.eindtijd)) {
        await updateWerkbon(w.id, { starttijd: standaard.starttijd || null, eindtijd: standaard.eindtijd || null });
        vers = await getWerkbonById(w.id);
      }
      setWerkbonnen(prev => prev.map(x => (x.id === w.id ? vers : x)));
      // Agenda-items per dag en per persoon volgen de werkbon.
      try {
        await syncWerkbonEvents(w.id);
      } catch (e) {
        toast.error(`Tijd opgeslagen, maar de agenda is niet bijgewerkt: ${e.message || 'onbekende fout'}`);
      }
    } catch (e) {
      toast.error(e.message || 'Tijd aanpassen mislukt');
      throw e;
    }
  };

  const verzetActiviteit = async (a, { start, eind, modus }) => {
    try {
      // Verplaatsen laat de duur met rust. Een activiteit zonder eindtijd duurt
      // in de agenda een uur; die kreeg bij het verschuiven een eindtijd van een
      // kwartier, en dan kromp het agenda-item mee. Alleen rekken zet een eindtijd.
      const eindtijd = modus === 'verplaats' && !a.endTime ? undefined : minsToTime(eind);
      const updated = await updateActivity(a.id, {
        date: a.date, time: minsToTime(start),
        ...(eindtijd === undefined ? {} : { endTime: eindtijd }),
      });
      setActivities(prev => prev.map(x => (x.id === updated.id ? updated : x)));
      // Zelfde als na het activiteitenvenster: het agenda-item bestaat of komt er.
      try {
        await upsertActivityEvent({
          activiteitId: updated.id, title: updated.title, date: updated.date, time: updated.time,
          end: updated.endTime || '', customerId: updated.custId || null, location: updated.location || null,
        });
      } catch (e) {
        toast.error(`Tijd opgeslagen, maar de agenda is niet bijgewerkt: ${e.message || 'onbekende fout'}`);
      }
    } catch (e) {
      toast.error(e.message || 'Tijd aanpassen mislukt');
      throw e;
    }
  };

  // Scroll de tijdlijn bij laden naar 07:00 (= bovenkant).
  useEffect(() => {
    if (!loading && timelineScrollRef.current) timelineScrollRef.current.scrollTop = 0;
  }, [loading]);

  // ── TOEGANG: planning-recht (admin/planner-rol óf granted 'planning') ────────

  if (!profile || !can('planning')) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--dl)' }}>
        <div style={{ marginBottom: 12, color: 'var(--dl)' }}><Lock size={36} strokeWidth={1.75} /></div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--dk)', marginBottom: 6 }}>Geen toegang</div>
        <div>De Planning-pagina vereist het planning-recht.</div>
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
          <p>{zicht === 'dag' ? fmtDagLang(anker) : fmtWeekRange(weekStart)}</p>
        </div>
        <div className="page-hd-actions">
          {/* Zelfde bediening als de agenda: vorige, vandaag, volgende, dan de weergave. */}
          <button className="btn btn-s btn-sm" onClick={() => stap(-1)} aria-label={zicht === 'dag' ? 'Vorige dag' : 'Vorige week'}>{I.chev_l}</button>
          <button className="btn btn-s btn-sm" onClick={() => setAnker(new Date())}>Vandaag</button>
          <button className="btn btn-s btn-sm" onClick={() => stap(1)} aria-label={zicht === 'dag' ? 'Volgende dag' : 'Volgende week'}>{I.chev_r}</button>
          <div className="tabs">
            {[['dag', 'Dag'], ['week', 'Week']].map(([v, l]) => (
              <button key={v} className={`tab${zicht === v ? ' active' : ''}`} onClick={() => setZicht(v)}>{l}</button>
            ))}
          </div>
          <div className="tabs" style={{ marginLeft: 8 }}>
            {[['totaal','Totaal'],['medewerker','Medewerker'], ...(metVoertuigen ? [['voertuig','Voertuig']] : [])].map(([v, l]) => (
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
          {viewMode === 'voertuig' && actieveVoertuigen.length > 0 && (
            <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}
              style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              {actieveVoertuigen.map(v => <option key={v.id} value={v.id}>{v.naam}{v.kenteken ? ` (${v.kenteken})` : ''}</option>)}
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
              {/* Dagkoppen en tijdlijn schuiven samen horizontaal: op een
                  telefoon past een hele week niet, en dan moet elke dagkop
                  boven zijn eigen kolom blijven staan. In de dagweergave is er
                  één kolom en valt er niets te schuiven. */}
              <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: TIME_COL_W + zichtbareDagen.length * MIN_DAY_COL_PX }}>
              {/* Dag-header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `${TIME_COL_W}px repeat(${zichtbareDagen.length}, ${DAY_COL_W})`,
                background: '#fff',
                borderBottom: '2px solid var(--border)',
              }}>
                <div style={{ borderRight: '1px solid var(--border)', padding: '8px 6px' }} />
                {zichtbareDagen.map(date => {
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
                  gridTemplateColumns: `${TIME_COL_W}px repeat(${zichtbareDagen.length}, ${DAY_COL_W})`,
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
                  {zichtbareDagen.map(date => {
                    // Een meerdaagse werkbon staat in elke kolom waar hij een dag
                    // heeft, met de tijden die op díé dag gelden.
                    // De dagploeg bepaalt wie er die dag op staat: in de
                    // medewerkerweergave valt de dag weg voor wie is weggetikt,
                    // en in Totaal kleurt het blok naar de eerste van díé dag.
                    const dayWbs = colorKeyedWb.flatMap(w => {
                      const dagen = werkbonDagen(w);
                      const i = dagen.findIndex(d => d.datum === date);
                      if (i < 0) return [];
                      const t = tijdenOpDag(w, dagen[i]);
                      if (!t.starttijd) return [];
                      const eigenPloeg = Array.isArray(dagen[i].medewerkerIds);
                      const ploeg = ploegOpDag(w, dagen[i]);
                      if (viewMode === 'medewerker' && eigenPloeg && !ploeg.includes(selectedMember)) return [];
                      const basis = {
                        ...w, starttijd: t.starttijd, eindtijd: t.eindtijd,
                        assignedToIds: ploeg,
                        _datum: date,
                        _dagLabel: dagen.length > 1 ? `dag ${i + 1}/${dagen.length}` : '',
                      };
                      // Staat deze medewerker op dat moment ook op iets anders?
                      const dubbelVoor = (pid, van, tot) => dubbeleBoekingen({
                        werkbonnen, activiteiten: activities, werkbonId: w.id,
                        negeerActiviteitId: w.raw?.activity_id || null,
                        datum: date, pid, starttijd: van, eindtijd: tot,
                      });
                      // Voertuigen van deze werkbon op deze dag (alleen met het abonnement).
                      const vctx = voertuigCtx.get(w.id);
                      const koppeling = vctx ? koppelingVanDag(vctx, date) : {};
                      const meldingen = vctx ? voertuigWaarschuwingen(vctx, date) : { perPersoon: {}, perVoertuig: {} };
                      const voertuigVan = pid => vctx?.voertuigen.find(v => v.id === koppeling[pid])?.naam || '';
                      if (viewMode === 'voertuig') {
                        // Het blok van het gekozen voertuig, met zíjn tijd en wie erin zit.
                        if (!vctx || !voertuigenVanDag(vctx, date).includes(selectedVehicle)) return [];
                        const v = vctx.voertuigen.find(x => x.id === selectedVehicle);
                        const vt = voertuigTijd(vctx, date, selectedVehicle);
                        const inVoertuig = Object.keys(koppeling).filter(pid => koppeling[pid] === selectedVehicle);
                        const namen = inVoertuig.map(pid => teamMembers.find(m => m.id === pid)?.fullName || 'Medewerker').join(', ');
                        const bezetting = v.zitplaatsen ? `${bezettingVanVoertuig(vctx, date, selectedVehicle)}/${v.zitplaatsen}` : '';
                        return [{
                          ...basis, starttijd: vt.starttijd, eindtijd: vt.eindtijd,
                          _blokKey: `${w.id}-${selectedVehicle}`, _pid: null, _voertuigBlok: true,
                          _persoon: [namen, bezetting].filter(Boolean).join(' · '),
                          _onderwerp: v.naam,
                          _dubbel: voertuigDubbel({ werkbonnen, werkbonId: w.id, datum: date, vid: selectedVehicle, starttijd: vt.starttijd, eindtijd: vt.eindtijd }),
                          _meldingen: [...(meldingen.perVoertuig[selectedVehicle] || []), ...inVoertuig.flatMap(pid => meldingen.perPersoon[pid] || [])],
                        }];
                      }
                      if (viewMode === 'medewerker') {
                        // Het blok van de gekozen medewerker, met zíjn tijd.
                        const eigen = tijdenVoorPersoon(w, dagen[i], selectedMember);
                        return [{
                          ...basis, starttijd: eigen.starttijd, eindtijd: eigen.eindtijd, _blokKey: w.id, _pid: selectedMember,
                          _persoon: teamMembers.find(m => m.id === selectedMember)?.fullName || '',
                          _voertuig: voertuigVan(selectedMember),
                          _dubbel: dubbelVoor(selectedMember, eigen.starttijd, eigen.eindtijd),
                          _meldingen: meldingen.perPersoon[selectedMember] || [],
                        }];
                      }
                      if (viewMode !== 'totaal') return [{ ...basis, _blokKey: w.id, _pid: null }];
                      // Totaal: één blok per medewerker, in zijn eigen kleur.
                      // Eén blok per werkbon kreeg alleen de kleur van de
                      // eerste medewerker — wie nooit eerste stond, was nergens
                      // te zien, en een ploeg met één vaste eerste werd één kleur.
                      if (!ploeg.length) return [{ ...basis, _colorKey: '__none__', _blokKey: `${w.id}-niemand`, _pid: null }];
                      // Elk blok met de tijd van díé medewerker: zijn eigen tijd
                      // op die dag → de tijd van de dag → de standaardtijd.
                      return ploeg.map(pid => {
                        const eigen = tijdenVoorPersoon(w, dagen[i], pid);
                        return {
                          ...basis,
                          starttijd: eigen.starttijd,
                          eindtijd: eigen.eindtijd,
                          assignedToIds: [pid],
                          _colorKey: pid,
                          _persoon: teamMembers.find(m => m.id === pid)?.fullName || '',
                          _voertuig: voertuigVan(pid),
                          _blokKey: `${w.id}-${pid}`,
                          _pid: pid,
                          _dubbel: dubbelVoor(pid, eigen.starttijd, eigen.eindtijd),
                          _meldingen: meldingen.perPersoon[pid] || [],
                        };
                      });
                    });
                    // Activiteiten krijgen hetzelfde driehoekje: wie erop staat en
                    // op dat moment ook op een werkbon of andere activiteit.
                    const dayActs = filteredActivities.filter(a => a.date === date).map(a => {
                      const ids = a.assignedToIds?.length ? a.assignedToIds : (a.assignee ? [a.assignee] : []);
                      const eigenWb = werkbonnen.find(w => w.raw?.activity_id === a.id)?.id || null;
                      const perPersoon = ids.map(pid => ({
                        pid,
                        botsingen: dubbeleBoekingen({
                          werkbonnen, activiteiten: activities, werkbonId: eigenWb, negeerActiviteitId: a.id,
                          datum: date, pid, starttijd: a.time, eindtijd: a.endTime,
                        }),
                      })).filter(x => x.botsingen.length);
                      if (!perPersoon.length) return a;
                      return {
                        ...a,
                        _datum: date,
                        _persoon: perPersoon.map(x => teamMembers.find(m => m.id === x.pid)?.fullName || 'Medewerker').join(' en '),
                        _dubbel: perPersoon.flatMap(x => x.botsingen),
                      };
                    });
                    return (
                      <DayColumn
                        key={date}
                        date={date}
                        werkbonnen={dayWbs}
                        activities={dayActs}
                        colorMap={colorMap}
                        isToday={date === today}
                        allowDrop
                        onBlockClick={b => setDetailWb(werkbonnen.find(w => w.id === b.id) || b)}
                        onDubbel={(b, e) => { const r = e.currentTarget.getBoundingClientRect(); setDubbelInfo({ b, x: r.left, y: r.bottom }); }}
                        onActivityClick={setSelectedActivity}
                        sleepVoorWerkbon={sleepVoorWerkbon}
                        onWerkbonVerzet={verzetWerkbon}
                        magActiviteitSlepen={magActiviteitSlepen}
                        onActiviteitVerzet={verzetActiviteit}
                      />
                    );
                  })}
                </div>
              </div>
              </div>
              </div>
            </div>

            {/* Uitleg bij een blok met een driehoekje: dubbel ingepland, of een
                voertuig klopt niet. Alleen de melding; aanpassen doe je in de werkbon. */}
            {dubbelInfo && (() => {
              const b = dubbelInfo.b;
              const wie = b._onderwerp || b._persoon;
              return (
                <div
                  className="pl-dubbel-uitleg"
                  role="dialog"
                  aria-label={b._dubbel?.length ? 'Dubbel ingepland' : 'Klopt niet'}
                  style={{ left: Math.max(8, Math.min(dubbelInfo.x - 20, window.innerWidth - 310)), top: dubbelInfo.y + 6 }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <div className="ab-uitleg-kop">
                    {b._dubbel?.length ? 'Dubbel ingepland' : 'Klopt niet'}
                    <button type="button" className="ab-uitleg-x" aria-label="Sluiten" onClick={() => setDubbelInfo(null)}><X size={13} /></button>
                  </div>
                  {b._dubbel?.length > 0 && (
                    <>
                      {wie || 'Deze medewerker'} staat op {fmtDayShort(b._datum)} ook ingepland:{' '}
                      {b._dubbel.map(c => `${c.titel} (${c.starttijd || '?'}–${c.eindtijd || '?'})`).join(', ')}.
                      {' '}Daardoor is {wie || 'deze medewerker'} op dat moment dubbel ingepland.
                    </>
                  )}
                  {(b._meldingen || []).map((t, j) => (
                    <div key={t} style={{ marginTop: j === 0 && !b._dubbel?.length ? 0 : 6 }}>{t}</div>
                  ))}
                </div>
              );
            })()}

            {/* Legenda */}
            {legendItems.length > 0 && (
              <Legend items={legendItems} open={legendaOpen} onToggle={wisselLegenda} />
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
          teamMembers={teamMembers}
          customers={customers} projects={projects} profile={profile}
          onClose={() => setShowPlanModal(false)}
          onSaved={wb => setWerkbonnen(prev => [wb, ...prev])}
        />
      )}

      {showPlanActivityModal && (
        <PlanActivityModal
          teamMembers={teamMembers}
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
          profile={profile}
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
          profile={profile}
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
