import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
const FinancienGrafiek = lazy(() => import('./FinancienGrafiek.jsx'));
import { Smartphone, Phone, Navigation, Camera, Clock, Package, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react';
import {
  I, CAL_EVENTS, HOURS_DATA, COSTS_DATA, TEAM_DATA, CUSTOMERS_DATA, QUOTES_DATA,
  fmt, custById, Av, StatusBadge, ModalX, Logo, CostCategoryBadge,
} from '../bb-shared.jsx';
import { createCalendarEvent, listCalendarEvents, updateCalendarEvent } from '../services/calendarService.js';
import { createJobCost, deleteJobCost, listJobCosts, updateJobCost, getKostenBijlageUrl, kostenPerGroep, alleenGeboekt } from '../services/jobCostService.js'
import { listWerkbonInkopen } from '../services/projectKostenService.js'
import { PERIODE_TYPES, periodeRange } from '../lib/periode.js'
import { useData } from '../lib/dataContext.jsx'
import { listLeveranciers } from '../services/leverancierService.js'
import LeverancierSelect from '../components/LeverancierSelect.jsx'
import { categorieOptiesUit } from '../lib/kostenCategorieen.js';
import { useKostenCategorieen } from '../hooks/useKostenCategorieen.js';
import { getFacturen } from '../services/factuurService.js';
import { getFinancienKpi } from '../services/financienService.js';
import { getConnection } from '../services/accountingService.js';
import { getBtwPeriodes, syncBtwData } from '../services/btwService.js';
import { berekenBtwIndicatie } from '../services/btwIndicatieService.js';
import { InfoTip, InfoUitklap } from '../components/Uitleg.jsx';
import { listCustomers } from '../services/customerService.js';
import { sumGefactureerd, sumBetaald, sumOpenstaand, withCustomerTotals, sumOmzetExclBtw } from '../services/customerTotalsService.js';
import { getKostenOverzichtPerKlant, LEEG_OVERZICHT } from '../services/kostenOverzichtService.js';
import { listActivities } from '../services/activityService.js';
import { getConnectionStatus, startGoogleCalendarConnect, bevestigGoogleKoppeling, disconnectGoogleCalendar } from '../services/googleCalendarService.js';
import { getWerkbonnen } from '../services/werkbonService.js';
import { werkbonDagen, tijdenOpDag, tijdenVoorPersoon, ploegOpDag } from '../utils/werkbonDagen.js';
import { voertuigVanPersoon } from '../utils/voertuigDagen.js';
import { getVoertuigen } from '../services/voertuigService.js';
import { getProjects } from '../services/projectsService.js';
import { calcBtw, BTW_PCT_OPTIONS } from '../utils/btw.js';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { usePlanGuard } from '../components/PlanUpgradeModal.jsx';
import { getBedrijfsinstellingen } from '../services/instellingenService.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { LaadFout } from '../components/LaadFout.jsx';
import { vandaagIso } from '../lib/datumTijd.js';
import { useUrlTab } from '../hooks/useUrlTab.js';
import { ActivityEditModal, NewCalendarEventModal, NewJobCostModal } from '../components/SharedModals.jsx';
import { AgendaWerkbonPlanModal } from '../components/AgendaWerkbonPlanModal.jsx';
import { bevestig } from '../lib/bevestig.jsx';

// ── Local date helpers ───────────────────────────────────────
// All comparisons use LOCAL date parts (never toISOString) so a day can't
// shift across the UTC boundary. Weeks are Monday→Sunday (Dutch/EU).
const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const NL_DAYS_FULL = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
const pad2 = n => String(n).padStart(2, '0');
// YYYY-MM-DD from a Date, using local parts.
function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// Normalise an event/activity date (date-only string OR ISO timestamp) to a
// local day key for safe equality checks.
function toDayKey(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && value.length <= 10) return value.slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? (typeof value === 'string' ? value.slice(0, 10) : null) : dateKey(d);
}
function addDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}
// Monday of the week containing `date` (00:00 local).
function getStartOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return d;
}
// ISO-8601 week number (week with the year's first Thursday is week 1).
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ── AGENDA TIJDLIJN (zelfde look als de Planning-pagina) ─────────────────────
// De agenda beslaat altijd 24 uur; welk deel zichtbaar is komt uit de
// bedrijfsinstelling (bedrijfsinstellingen.agenda_start_uur / _eind_uur).
// Deze waarden zijn alleen de terugval als die instelling nog niet geladen is.
const AG_HOUR_START_DEFAULT = 7;
const AG_HOUR_END_DEFAULT   = 20;
const AG_PX_PER_HOUR = 64;

// Klemt het ingestelde venster op iets dat altijd tekenbaar is.
function agUurBereik(startUur, eindUur) {
  const start = Math.min(23, Math.max(0, Number.isFinite(startUur) ? startUur : AG_HOUR_START_DEFAULT));
  const eindRuw = Number.isFinite(eindUur) ? eindUur : AG_HOUR_END_DEFAULT;
  const eind = Math.min(24, Math.max(start + 1, eindRuw));
  return { start, eind, totaal: eind - start, hoogte: (eind - start) * AG_PX_PER_HOUR };
}
const AG_TIME_COL_W  = 52;
const AG_DAYS_SHORT  = ['Ma','Di','Wo','Do','Vr','Za','Zo'];

function agTimeToMins(t) { if (!t) return 0; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); }
function agMinsToTime(mins) { return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`; }
function agTopPx(t, startUur = AG_HOUR_START_DEFAULT) { const mins = agTimeToMins(t || `${startUur}:00`); return Math.max(0, (mins - startUur * 60) * AG_PX_PER_HOUR / 60); }
function agHeightPx(start, end) { if (!start || !end) return AG_PX_PER_HOUR; const dur = agTimeToMins(end) - agTimeToMins(start); return Math.max(22, dur * AG_PX_PER_HOUR / 60); }
function agFmtTime(t) { return t ? String(t).slice(0, 5) : ''; }

// Overlappende blokken in dezelfde dag naast elkaar leggen (lanes).
function agAssignLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => agTimeToMins(a.time || '07:00') - agTimeToMins(b.time || '07:00'));
  const laneEnds = [];
  const withLane = sorted.map(b => {
    const start = agTimeToMins(b.time || '07:00');
    const end = agTimeToMins(b.end || agMinsToTime(agTimeToMins(b.time || '07:00') + 60));
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > start) lane++;
    laneEnds[lane] = end;
    return { ...b, _lane: lane };
  });
  const total = laneEnds.length || 1;
  return withLane.map(b => ({ ...b, _totalLanes: total }));
}

function AgendaEventBlock({ ev, onClick, startUur = AG_HOUR_START_DEFAULT }) {
  const top = agTopPx(ev.time, startUur);
  const height = agHeightPx(ev.time, ev.end);
  const lane = ev._lane || 0;
  const total = ev._totalLanes || 1;
  const bg = ev.color || 'rgba(29,219,98,.14)';
  const txt = ev.textColor || '#15803d';
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(ev); }}
      data-herkomst={ev.herkomst || 'zelf'}
      title={`${ev.title}\n${agFmtTime(ev.time)}${ev.end ? `–${agFmtTime(ev.end)}` : ''}${ev.voertuig ? `\n${ev.voertuig}` : ''}\n${ev.customerName || ''}`}
      style={{
        position: 'absolute', top, left: `${(lane / total) * 100}%`, width: `${100 / total}%`, height,
        background: bg, borderLeft: `3px solid ${txt}`, border: `1px solid ${txt}33`,
        borderRadius: 4, padding: '3px 5px 2px', overflow: 'hidden', cursor: 'pointer',
        boxSizing: 'border-box', zIndex: 3, transition: 'filter .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(.96)')}
      onMouseLeave={e => (e.currentTarget.style.filter = '')}
    >
      <div style={{ fontWeight: 700, fontSize: 10, color: txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{ev.title}</div>
      {height > 30 && (
        <div style={{ fontSize: 9, color: txt, opacity: .75, lineHeight: 1.2 }}>
          {agFmtTime(ev.time)}{ev.end ? `–${agFmtTime(ev.end)}` : ''}{ev.voertuig ? ` · ${ev.voertuig}` : ''}
        </div>
      )}
      {height > 50 && ev.customerName && (
        <div style={{ fontSize: 9, color: txt, opacity: .6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{ev.customerName}</div>
      )}
    </div>
  );
}

function AgendaDayColumn({ dayEvents, isToday, onEventClick, bereik }) {
  const { start, totaal, hoogte } = bereik;
  const hours = Array.from({ length: totaal }, (_, i) => start + i);
  const withLanes = agAssignLanes(dayEvents);
  return (
    <div style={{ position: 'relative', height: hoogte, borderLeft: '1px solid var(--border)', background: isToday ? 'rgba(29,219,98,.03)' : '#fff' }}>
      {hours.map(h => (
        <div key={h} style={{ position: 'absolute', top: (h - start) * AG_PX_PER_HOUR, left: 0, right: 0, borderTop: '1px solid var(--border)', zIndex: 0 }} />
      ))}
      {hours.map(h => (
        <div key={`h-${h}`} style={{ position: 'absolute', top: (h - start) * AG_PX_PER_HOUR + AG_PX_PER_HOUR / 2, left: 0, right: 0, borderTop: '1px dashed #f0ede9', zIndex: 0 }} />
      ))}
      {withLanes.map(ev => <AgendaEventBlock key={ev.id} ev={ev} onClick={onEventClick} startUur={start} />)}
    </div>
  );
}

// Gedeelde tijdlijn voor de week- en dagweergave van de agenda.
function AgendaTimeline({ dates, events, todayKey, onEventClick, startUur, eindUur }) {
  const scrollRef = useRef(null);
  const bereik = agUurBereik(startUur, eindUur);
  // Scroll bij laden naar het eerste zichtbare uur (= bovenkant van de tijdlijn).
  useEffect(() => {
    const c = scrollRef.current;
    if (c) c.scrollTop = 0;
  }, []);
  const hours = Array.from({ length: bereik.totaal }, (_, i) => bereik.start + i);
  const cols = `${AG_TIME_COL_W}px repeat(${dates.length}, minmax(110px, 1fr))`;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
      {/* Dag-header */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '2px solid var(--border)' }}>
        <div style={{ borderRight: '1px solid var(--border)', padding: '8px 6px' }} />
        {dates.map(dt => {
          const dk = dateKey(dt);
          const isToday = dk === todayKey;
          return (
            <div key={dk} style={{
              padding: '8px 6px', textAlign: 'center',
              background: isToday ? 'var(--pll)' : '#fafaf8',
              borderRight: '1px solid var(--border)',
              fontWeight: isToday ? 800 : 600, fontSize: 11,
              color: isToday ? 'var(--pd)' : 'var(--dk)',
            }}>
              {AG_DAYS_SHORT[(dt.getDay() + 6) % 7]} {dt.getDate()}
              {isToday && <div style={{ fontSize: 9, color: 'var(--pd)', fontWeight: 700, marginTop: 1 }}>VANDAAG</div>}
            </div>
          );
        })}
      </div>
      {/* Tijdlijn body — paddingTop zodat het 07:00-label niet wordt afgesneden */}
      <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 300px)', paddingTop: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols }}>
          {/* Tijdlabels */}
          <div style={{ position: 'relative', height: bereik.hoogte, borderRight: '1px solid var(--border)' }}>
            {hours.map(h => (
              <div key={h} style={{ position: 'absolute', top: (h - bereik.start) * AG_PX_PER_HOUR - 7, right: 8, fontSize: 9, fontWeight: 600, color: 'var(--dl)', letterSpacing: '.02em' }}>
                {pad2(h)}:00
              </div>
            ))}
          </div>
          {/* Dag-kolommen */}
          {dates.map(dt => {
            const dk = dateKey(dt);
            const dayEvents = events.filter(e => toDayKey(e.date) === dk && e.time);
            return <AgendaDayColumn key={dk} dayEvents={dayEvents} isToday={dk === todayKey} onEventClick={onEventClick} bereik={bereik} />;
          })}
        </div>
      </div>
    </div>
  );
}

// ── CALENDAR ─────────────────────────────────────────────────
// "September 2026" of, voor een week over twee maanden, "September – Oktober 2026".
// Eerst stond hier alleen de maand van de maandag, waardoor op 1 oktober nog
// "September 2026 · Week 40" stond.
function weekMaandLabel(van, tot, cap) {
  const m1 = cap(NL_MONTHS[van.getMonth()]), m2 = cap(NL_MONTHS[tot.getMonth()]);
  if (van.getMonth() === tot.getMonth()) return `${m1} ${van.getFullYear()}`;
  if (van.getFullYear() === tot.getFullYear()) return `${m1} – ${m2} ${tot.getFullYear()}`;
  return `${m1} ${van.getFullYear()} – ${m2} ${tot.getFullYear()}`;
}

export function CalendarPage({ openCustomer, openCalendarEvent, setPage, preOpenActivityId, onNavConsumed }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh, profile } = useProfile();
  const { can } = usePermissions();
  const plan = usePlan();
  const { guardSchrijven, planModal } = usePlanGuard();
  // Gedeelde werkruimte: beide teamleden zien elkaars agenda-items. Solo en
  // rollen-en-rechten-bedrijven zien hun eigen items. Dezelfde matrix bepaalt
  // server-side de RLS (bb_gedeelde_werkruimte), dus UI en server lopen gelijk.
  const shareAll = plan.has('gedeelde_werkruimte');
  // Voertuigen: in je eigen agenda staat bij een klus in welk voertuig je zit.
  const metVoertuigen = plan.has('voertuigen');
  // Werkbon inplannen vanuit de agenda is bedoeld voor wie géén planningsmodule
  // heeft. Met de planningsmodule plan je daar in.
  const canPlanFromAgenda = !plan.has('planning');
  // Bewerkrecht op een agenda-item (spiegelt de RLS): admin/planner mag alles;
  // een 'planning'-item is voor gewone medewerkers alleen-lezen; een 'zelf'-item
  // mag alleen de eigenaar bewerken.
  const mayEditEvent = ev => can('planning') || (ev?.herkomst !== 'planning' && ev?.assignedTo === profile?.id);
  // Agenda-weergave (Dag/Week/Maand) in de URL (?tab=…) — blijft behouden bij refresh.
  // Dag/week/maand is een weergave: wisselen zet een stap, zodat terug in de
  // browser naar de vorige stand gaat.
  const [view, setView] = useUrlTab('week', { validIds: ['day', 'week', 'month'], stap: true });
  // Monday of the visible week. Lazy initializer → on every fresh mount the
  // Agenda opens on the *current* week (no stale week is carried over).
  const [weekStart, setWeekStart] = useState(() => getStartOfWeek(new Date()));
  // First-of-month anchor for the Month tab. Lazy init → opens on the real
  // current month; stays independent of the Week tab's weekStart.
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [showEvent, setShowEvent] = useState(null);
  // Zichtbaar uurvenster uit de bedrijfsinstelling; tot die geladen is tonen we
  // het oude standaardvenster, zodat er niets springt.
  const [agendaUren, setAgendaUren] = useState({ start: AG_HOUR_START_DEFAULT, eind: AG_HOUR_END_DEFAULT });
  useEffect(() => {
    let alive = true;
    getBedrijfsinstellingen()
      .then(b => { if (alive && b) setAgendaUren({ start: b.agendaStartUur, eind: b.agendaEindUur }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);
  const [events, setEvents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showGoogle, setShowGoogle] = useState(false);
  const [gcal, setGcal] = useState({ loading: true, connected: false, email: '', busy: false });
  const [editEvent, setEditEvent] = useState(null);
  const [editActivity, setEditActivity] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showPlanWerkbon, setShowPlanWerkbon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      listCalendarEvents(), listCustomers(), listActivities(), getWerkbonnen().catch(() => []),
      metVoertuigen ? getVoertuigen({ inclusiefInactief: true }).catch(() => []) : [],
    ])
      .then(([data, custData, actData, wbs, voertuigen]) => {
        // Persoonlijke agenda: IEDEREEN (medewerker én admin/planner) ziet hier
        // alleen ZIJN EIGEN toegewezen items, niet die van collega's. Voor een
        // medewerker filtert RLS al server-side; voor admin/planner (die via RLS
        // alles mag zien voor Planning) doen we het hier app-side.
        // Uitzondering: bij Groei is de agenda gedeeld → toon alles wat RLS teruggeeft.
        const uid = profile?.id;
        const mine = owner => shareAll || !uid || owner === uid;
        // Per dag en per persoon. In je eigen agenda staat de klus alleen op de
        // dagen dat jij in de (dag)ploeg staat, en met jóuw tijd — wie 's middags
        // werkt, ziet 13:00 en niet de 08:00 van zijn collega. In een gedeelde
        // agenda (Groei) staat hij één keer per verschillende tijd.
        const itemsVanDag = (w, dag) => {
          const ploeg = ploegOpDag(w, dag);
          const personen = shareAll || !uid
            ? (ploeg.length ? ploeg : [null])
            : (ploeg.includes(uid) || (!Array.isArray(dag.medewerkerIds) && w.assignedTo === uid) ? [uid] : []);
          const perTijd = new Map();
          for (const pid of personen) {
            const t = pid ? tijdenVoorPersoon(w, dag, pid) : tijdenOpDag(w, dag);
            const sleutel = `${t.starttijd}-${t.eindtijd}`;
            // Het voertuig alleen bij je eigen item: in een gedeelde agenda kan
            // één item voor meer mensen gelden, met elk een ander voertuig.
            const vid = pid && pid === uid ? voertuigVanPersoon(w, dag, pid) : null;
            const voertuig = vid ? voertuigen.find(v => v.id === vid)?.naam || null : null;
            if (!perTijd.has(sleutel)) perTijd.set(sleutel, { w, dag, t, voertuig });
          }
          return [...perTijd.values()];
        };
        const mineActivity = a => shareAll || !uid || (a.assignedToIds && a.assignedToIds.includes(uid)) || a.assignee === uid;
        // Werkbon-gekoppelde calendar_events verbergen: de werkbon zelf wordt
        // hieronder als (altijd actuele) synthetisch event getoond. Zo verschijnt
        // elk item exact één keer — gededupliceerd op werkbon_id.
        const manualEvents = data.filter(e => !e.werkbonId && mine(e.assignedTo));
        // Eén item per geplande dag: een klus van ma t/m vr staat op vijf dagen,
        // elk met de tijden die op die dag gelden.
        const wbEvents = wbs
          .filter(w => w.geplandOp && w.status !== 'afgerond')
          .flatMap(w => werkbonDagen(w).flatMap(dag => itemsVanDag(w, dag)))
          .map(({ w, dag, t, voertuig }) => ({
            id: `wb-${w.id}-${dag.datum}-${t.starttijd || ''}`,
            title: w.titel,
            date: dag.datum,
            time: t.starttijd || '07:00',
            end: t.eindtijd || '',
            color: '#fff7ed',
            textColor: '#d97706',
            type: 'werkbon',
            werkbonId: w.id,
            customerName: w.customerName,
            locatie: w.locatie,
            voertuig,
          }));
        setEvents([...manualEvents, ...wbEvents]);
        setCustomers(custData);
        setActivities(actData.filter(mineActivity));
        setError('');
      })
      .catch(err => setError(err.message || 'Agenda laden is mislukt.'))
      .finally(() => setLoading(false));
  }, [refreshKey, shareAll, metVoertuigen]);

  // Deep-open a specific activity requested from the dashboard agenda widget
  React.useEffect(() => {
    if (!preOpenActivityId || loading) return;
    const a = activities.find(x => x.id === preOpenActivityId);
    if (a) {
      setEditActivity(a);
      onNavConsumed && onNavConsumed();
    } else if (import.meta.env.DEV) {
      console.warn('[bb:dashboard] agenda-activiteit niet gevonden voor deep-open:', preOpenActivityId);
    }
  }, [preOpenActivityId, loading, activities]);

  // Google Calendar connection status + handle the OAuth redirect result.
  const loadGcalStatus = React.useCallback(() => {
    getConnectionStatus()
      .then(s => setGcal(g => ({ ...g, loading: false, connected: s.connected, email: s.email })))
      .catch(() => setGcal(g => ({ ...g, loading: false })));
  }, []);
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get('google');
    const koppel = q.get('koppel');
    // Alleen vaste teksten: google_msg komt uit de URL en mag nooit letterlijk
    // in beeld (een link kon zo een eigen melding in het dashboard zetten).
    const GOOGLE_FOUTEN = {
      geen_code: 'Google gaf geen toestemming terug.',
      ongeldige_state: 'De koppelaanvraag is verlopen of ongeldig. Probeer het opnieuw.',
      token_exchange_mislukt: 'Google weigerde de koppeling. Probeer het opnieuw.',
      opslaan_mislukt: 'De koppeling kon niet worden opgeslagen.',
      geweigerd: 'Je hebt geen toestemming gegeven in Google.',
    };
    if (g) {
      // Clean the query so a refresh doesn't re-toast.
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (g === 'bevestigen' && koppel) {
      bevestigGoogleKoppeling(koppel)
        .then(() => toast.success('Google Agenda gekoppeld'))
        .catch(e => toast.error('Google-koppeling mislukt: ' + e.message))
        .finally(loadGcalStatus);
      return;
    }
    if (g === 'connected') toast.success('Google Agenda gekoppeld');
    else if (g === 'error') toast.error('Google-koppeling mislukt. ' + (GOOGLE_FOUTEN[q.get('google_msg')] || 'Probeer het opnieuw.'));
    loadGcalStatus();
  }, [loadGcalStatus]);

  const handleGcalConnect = async () => {
    setGcal(g => ({ ...g, busy: true }));
    try { await startGoogleCalendarConnect(); }
    catch (e) { toast.error(e.message || 'Koppelen mislukt'); setGcal(g => ({ ...g, busy: false })); }
  };
  const handleGcalDisconnect = async () => {
    if (!(await bevestig('Google Agenda-koppeling verbreken?'))) return;
    setGcal(g => ({ ...g, busy: true }));
    try {
      await disconnectGoogleCalendar();
      setGcal({ loading: false, connected: false, email: '', busy: false });
      toast.success('Google Agenda ontkoppeld');
    } catch (e) {
      toast.error(e.message || 'Ontkoppelen mislukt');
      setGcal(g => ({ ...g, busy: false }));
    }
  };

  const DAYS = ['Ma','Di','Wo','Do','Vr','Za','Zo'];

  // Derived from weekStart — the seven Mon→Sun dates of the visible week.
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = dateKey(new Date());
  const isoWeek = getISOWeek(weekStart);
  const cap = s => s.replace(/^./, c => c.toUpperCase());

  // Month grid derived from monthAnchor: Monday-start, padded with
  // leading/trailing days, sized to the exact number of weeks needed.
  const mYear = monthAnchor.getFullYear();
  const mMonth = monthAnchor.getMonth();
  const monthGridStart = getStartOfWeek(new Date(mYear, mMonth, 1));
  const daysInMonth = new Date(mYear, mMonth + 1, 0).getDate();
  const leadDays = (new Date(mYear, mMonth, 1).getDay() + 6) % 7; // Mon=0
  const monthCellCount = Math.ceil((leadDays + daysInMonth) / 7) * 7;
  const monthCells = Array.from({ length: monthCellCount }, (_, i) => addDays(monthGridStart, i));

  const headerLabel = view === 'month'
    ? `${cap(NL_MONTHS[mMonth])} ${mYear}`
    : weekMaandLabel(weekStart, addDays(weekStart, 6), cap) + ` · Week ${isoWeek}`;

  // Nav buttons are shared across views → act on the active view.
  const goPrev = () => view === 'month'
    ? setMonthAnchor(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
    : setWeekStart(ws => addDays(ws, -7));
  const goNext = () => view === 'month'
    ? setMonthAnchor(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
    : setWeekStart(ws => addDays(ws, 7));
  const goToday = () => {
    const n = new Date();
    setWeekStart(getStartOfWeek(n));
    setMonthAnchor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  const typeLabel = t => ({ job: 'Klus', activity: 'Activiteit', visit: 'Opname' }[t] || t);

  // Gekoppeld aan een activiteit → ActivityEditModal. Los agenda-event met een
  // id → globale CalendarEventDetailDrawer. Anders de inline event-modal.
  const handleEventClick = e => {
    // Werkbon-item → open de werkbon zelf (bewerken/verwijderen gebeurt daar).
    // Synthetische werkbon-events hebben id 'wb-…' en zijn geen echt
    // calendar_event, dus mogen nooit naar de detail-drawer.
    if (e.werkbonId) {
      if (setPage) setPage('werkbonnen', { id: e.werkbonId });
      return;
    }
    // Activiteit → activiteit-modal.
    if (e.activityId) {
      const act = activities.find(a => a.id === e.activityId);
      if (act) { setEditActivity(act); return; }
    }
    // Echt calendar_event → detail-drawer.
    if (openCalendarEvent && e.id && !String(e.id).startsWith('wb-')) { openCalendarEvent(e.id); return; }
    setShowEvent(e);
  };
  const saveEvent = async input => {
    try {
      const payload = { title: input.title, type: input.type, date: input.date, time: input.time, end: input.end, custId: input.custId || null, notes: input.notes || '' };
      const saved = input.id ? await updateCalendarEvent(input.id, payload) : await createCalendarEvent(payload);
      setEvents(es => input.id ? es.map(e => e.id === saved.id ? saved : e) : [saved, ...es]);
      setEditEvent(null);
      setShowEvent(null);
      toast.success(input.id ? 'Agenda-item bijgewerkt' : 'Agenda-item toegevoegd');
      bumpRefresh?.();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    }
  };

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Agenda</h1><p>{headerLabel}</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-s btn-sm" onClick={goPrev} aria-label={view === 'month' ? 'Vorige maand' : 'Vorige week'}>{I.chev_l}</button>
          <button className="btn btn-s btn-sm" onClick={goToday}>Vandaag</button>
          <button className="btn btn-s btn-sm" onClick={goNext} aria-label={view === 'month' ? 'Volgende maand' : 'Volgende week'}>{I.chev_r}</button>
          <div className="tabs" data-rl="agenda-weergave">
            {['day','week','month'].map(v => (
              <button key={v} className={`tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
                {v === 'day' ? 'Dag' : v === 'week' ? 'Week' : 'Maand'}
              </button>
            ))}
          </div>
          {canPlanFromAgenda && (
            <button className="btn btn-s btn-sm" onClick={guardSchrijven('Een werkbon inplannen', () => setShowPlanWerkbon(true))}>{I.plus} Werkbon inplannen</button>
          )}
          <button className="btn btn-p btn-sm" data-rl="agenda-toevoegen" onClick={guardSchrijven('Een afspraak inplannen', () => setShowNew(true))}>{I.plus} Toevoegen</button>
        </div>
      </div>

      {/* Google Agenda-koppeling tijdelijk verborgen voor klanten. Zet {false} op {true} om terug te zetten. */}
      {false && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--r10)', marginBottom: 14, width: 'fit-content' }} className="afu2">
        {I.google}
        <span style={{ fontSize: '.8rem', color: 'var(--dmu)', fontWeight: 500 }}>Google Agenda</span>
        {gcal.loading ? (
          <span className="badge b-gray">Laden…</span>
        ) : gcal.connected ? (
          <>
            <span className="badge b-green">Verbonden{gcal.email ? ` · ${gcal.email}` : ''}</span>
            <button className="btn btn-s btn-xs" disabled={gcal.busy} onClick={handleGcalDisconnect}>Koppeling verbreken</button>
          </>
        ) : (
          <>
            <span className="badge b-gray">Niet verbonden</span>
            <button className="btn btn-p btn-xs" disabled={gcal.busy} onClick={handleGcalConnect}>Google Agenda koppelen</button>
          </>
        )}
      </div>
      )}
      {loading && <div className="card card-p">Agenda laden...</div>}
      {error && <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>}

      {!loading && !error && view === 'month' && (
        <div className="afu3">
          <div className="cal-grid-month">
            {DAYS.map(d => <div key={d} className="cal-day-hdr">{d}</div>)}
            {monthCells.map(cell => {
              const ck = dateKey(cell);
              const otherMonth = cell.getMonth() !== mMonth;
              const isToday = ck === todayKey;
              const dayEvts = events.filter(e => toDayKey(e.date) === ck);
              return (
                <div key={ck} className={`cal-cell${otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`}>
                  <div className="cal-day-num">{cell.getDate()}</div>
                  {dayEvts.slice(0, 2).map(e => (
                    <div key={e.id} className={`cal-event cal-ev-${e.type}`} style={{ background: e.color, color: e.textColor }} onClick={() => handleEventClick(e)}>
                      {e.time} {e.title}
                    </div>
                  ))}
                  {dayEvts.length > 2 && <div style={{ fontSize: '.62rem', color: 'var(--dl)', paddingLeft: 2 }}>+{dayEvts.length - 2} meer</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !error && view === 'week' && (
        <div className="afu3" data-rl="agenda-rooster" style={{ overflowX: 'auto' }}>
          <AgendaTimeline dates={weekDates} events={events} todayKey={todayKey} onEventClick={handleEventClick} startUur={agendaUren.start} eindUur={agendaUren.eind} />
        </div>
      )}

      {!loading && !error && view === 'day' && (() => {
        const today = new Date();
        const dayLabel = `${NL_DAYS_FULL[today.getDay()].replace(/^./, c => c.toUpperCase())} ${today.getDate()} ${NL_MONTHS[today.getMonth()]} ${today.getFullYear()}`;
        return (
          <div className="afu3">
            <div style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: 12, color: 'var(--dk)' }}>{dayLabel}</div>
            <AgendaTimeline dates={[today]} events={events} todayKey={todayKey} onEventClick={handleEventClick} startUur={agendaUren.start} eindUur={agendaUren.eind} />
          </div>
        );
      })()}

      {showEvent && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowEvent(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-hd">
              <div>
                <span className={`badge ${showEvent.type === 'job' ? 'b-orange' : showEvent.type === 'visit' ? 'b-new' : 'b-blue'}`} style={{ marginBottom: 6 }}>{typeLabel(showEvent.type)}</span>
                <div className="modal-title">{showEvent.title}</div>
                <div className="modal-sub">{showEvent.date} · {showEvent.time}–{showEvent.end}</div>
              </div>
              <ModalX onClose={() => setShowEvent(null)} />
            </div>
            {(() => {
              const c = null;
              return c ? (
                <div style={{ padding: '12px 14px', background: 'var(--bgs)', borderRadius: 'var(--r8)', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: '.88rem', marginBottom: 4 }}>{c.name}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--dmu)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>{I.map} {c.city}</span>
                    <span>{I.call} {c.phone}</span>
                  </div>
                </div>
              ) : null;
            })()}
            <div className="fa">
              <button className="btn btn-s" onClick={() => setShowEvent(null)}>Sluiten</button>
              {showEvent.activityId && activities.find(a => a.id === showEvent.activityId)
                ? <button className="btn btn-s" onClick={() => { setEditActivity(activities.find(a => a.id === showEvent.activityId)); setShowEvent(null); }}>Bewerken</button>
                : mayEditEvent(showEvent)
                  ? <button className="btn btn-s" onClick={() => setEditEvent(showEvent)}>Bewerken</button>
                  : null
              }
              <button className="btn btn-p" onClick={() => { openCustomer(showEvent.custId); setShowEvent(null); }}>Open klant</button>
            </div>
          </div>
        </div>
      )}
      {editEvent && <CalendarEventModal event={editEvent} onClose={() => setEditEvent(null)} onSave={saveEvent} customers={customers} />}
      {editActivity && (
        <ActivityEditModal
          activity={editActivity}
          customers={customers}
          onClose={() => setEditActivity(null)}
          onSaved={updated => {
            setActivities(acts => acts.map(a => a.id === updated.id ? updated : a));
            setEditActivity(null);
          }}
          onDeleted={id => {
            setActivities(acts => acts.filter(a => a.id !== id));
            setEditActivity(null);
          }}
        />
      )}
      {showNew && (
        <NewCalendarEventModal
          onClose={() => setShowNew(false)}
          customers={customers}
          onSaved={created => { setEvents(es => [created, ...es]); bumpRefresh?.(); }}
        />
      )}
      {showPlanWerkbon && (
        <AgendaWerkbonPlanModal
          currentUserId={profile?.id}
          currentUserName={profile?.fullName}
          onClose={() => setShowPlanWerkbon(false)}
          onScheduled={() => { setShowPlanWerkbon(false); bumpRefresh?.(); }}
        />
      )}
      {showGoogle && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowGoogle(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-hd">
              <div><div className="modal-title">Google Agenda koppelen</div><div className="modal-sub">OAuth en een backend endpoint zijn hiervoor nodig.</div></div>
              <ModalX onClose={() => setShowGoogle(false)} />
            </div>
            <p style={{ fontSize: '.86rem', color: 'var(--dmu)', lineHeight: 1.55 }}>Deze knop is voorbereid als placeholder. Voor een echte Google Calendar-koppeling moet BossBase later een OAuth-flow, tokenopslag en server-side synchronisatie krijgen.</p>
            <div className="fa"><button className="btn btn-p" onClick={() => setShowGoogle(false)}>Begrepen</button></div>
          </div>
        </div>
      )}

      {planModal}
    </div>
  );
}

function CalendarEventModal({ event, onClose, onSave, customers = [] }) {
  const [form, setForm] = useState(event);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div><div className="modal-title">Agenda item <InfoTip tekst="Maak of bewerk een kalenderitem." /></div></div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2"><label>Titel</label><input value={form.title || ''} onChange={e => set('title', e.target.value)} /></div>
          <div className="f"><label>Type</label><select value={form.type || 'event'} onChange={e => set('type', e.target.value)}><option value="event">Afspraak</option><option value="job">Klus</option><option value="activity">Activiteit</option><option value="visit">Opname</option></select></div>
          <div className="f"><label>Klant</label>
            <select value={form.custId || ''} onChange={e => set('custId', e.target.value)}>
              <option value="">Geen klant</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f"><label>Datum</label><input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
          <div className="f"><label>Start</label><input type="time" value={form.time || ''} onChange={e => set('time', e.target.value)} /></div>
          <div className="f"><label>Einde</label><input type="time" value={form.end || ''} onChange={e => set('end', e.target.value)} /></div>
          <div className="f s2"><label>Notities</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
        </div>
        <div className="fa">
          <button className="btn btn-s" disabled={saving} onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" disabled={saving || !form.title?.trim()} onClick={submit}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── WORK ORDERS ──────────────────────────────────────────────
export function WorkOrdersPage() {
  const [tasks, setTasks] = useState([
    { id: 1, label: 'Ondergrond reinigen en schuren', done: true },
    { id: 2, label: 'Primer aanbrengen gevel', done: true },
    { id: 3, label: 'Eerste laag verf aanbrengen', done: false },
    { id: 4, label: 'Tweede laag verf aanbrengen', done: false },
    { id: 5, label: 'Kozijnen schilderen', done: false },
    { id: 6, label: 'Opruimen en oplevering', done: false },
  ]);
  const toggle = id => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const done = tasks.filter(t => t.done).length;

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Werkbonnen</h1><p>Mobiele weergave voor je team op locatie</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm">{I.plus} Nieuwe werkbon</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }} className="afu2">
        <div className="tw">
          <div className="tw-hd"><div className="card-title">Actieve werkbonnen</div></div>
          <table className="dt">
            <thead><tr><th>Klant</th><th>Omschrijving</th><th>Datum</th><th>Medewerker</th><th>Status</th></tr></thead>
            <tbody>
              {[
                { id: 'WB-001', cust: 'Pieter Jansen',   job: 'Schilderwerk gevel',  date: '3 mei', emp: 'Marco', status: 'in_progress' },
                { id: 'WB-002', cust: 'Frank van Dijk',  job: 'Schutting plaatsen',  date: '4 mei', emp: 'Marco', status: 'planned' },
                { id: 'WB-003', cust: 'Marieke Meijer',  job: 'Badkamer renovatie',  date: '6 mei', emp: 'Remco', status: 'planned' },
                { id: 'WB-004', cust: 'VvE Parkzicht',   job: 'Tuinonderhoud Q2',    date: '7 mei', emp: 'Remco', status: 'planned' },
              ].map(w => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.cust}</td>
                  <td>{w.job}</td>
                  <td style={{ color: 'var(--dl)' }}>{w.date}</td>
                  <td>{w.emp}</td>
                  <td><StatusBadge status={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--dl)', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><Smartphone size={14} /> Medewerkerweergave — telefoon</div>
          <div className="wo-mobile afu3">
            <div className="wo-hd">
              <div className="wo-hd-top">
                <Logo dark />
                <span className="badge b-progress">In uitvoering</span>
              </div>
              <h2>Schilderwerk gevel + kozijnen</h2>
              <div className="wo-meta">{I.map} Keizersgracht 12, Zwolle · Pieter Jansen</div>
              <div className="wo-meta">{I.clock} Vandaag · 07:30–16:00</div>
            </div>
            <div className="wo-actions">
              {[
                { icon: <Phone size={22} />, label: 'Bel klant' },
                { icon: <Navigation size={22} />, label: 'Route' },
                { icon: <Camera size={22} />, label: 'Foto toevoegen' },
                { icon: <Clock size={22} />, label: 'Uren registreren' },
                { icon: <Package size={22} />, label: 'Materiaal toevoegen' },
                { icon: <CheckCircle2 size={22} />, label: 'Afronden' },
              ].map(a => (
                <button key={a.label} className="wo-action-btn">
                  <div className="icon">{a.icon}</div>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
            <div className="wo-section">
              <div className="wo-section-title">Taken ({done}/{tasks.length})</div>
              <div style={{ height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${(done / tasks.length) * 100}%`, background: 'linear-gradient(90deg,#1DDB62,#15A34A)', borderRadius: 99, transition: 'width .3s ease' }} />
              </div>
              {tasks.map(t => (
                <div key={t.id} className="wo-task" onClick={() => toggle(t.id)}>
                  <div className={`wo-check${t.done ? ' done' : ''}`}>{t.done && I.check}</div>
                  <span style={{ fontSize: '.82rem', color: t.done ? 'var(--dl)' : 'var(--dk)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
                </div>
              ))}
            </div>
            <div className="wo-section" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="wo-section-title">Notities</div>
              <textarea style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: '8px 10px', fontSize: '.8rem', resize: 'none', height: 60, outline: 'none', color: 'var(--dm)' }} placeholder="Voeg notities toe over de klus…" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HOURS ────────────────────────────────────────────────────
export function HoursPage() {
  const totalHrs = HOURS_DATA.reduce((s, h) => s + h.hrs, 0);
  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Uren</h1><p>Registreer gewerkte uren per klant en medewerker</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm">{I.plus} Uren registreren</button>
        </div>
      </div>
      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 18 }}>
        {[
          { label: 'Totale uren (week)', val: totalHrs + ' uur' },
          { label: 'Uren Marco',         val: HOURS_DATA.filter(h => h.emp === 'Marco').reduce((s, h) => s + h.hrs, 0) + ' uur' },
          { label: 'Uren Remco',         val: HOURS_DATA.filter(h => h.emp === 'Remco').reduce((s, h) => s + h.hrs, 0) + ' uur' },
        ].map((s, i) => (
          <div key={i} className="sc" style={{ padding: '16px 18px' }}>
            <div className="sc-val">{s.val}</div>
            <div className="sc-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="tw afu3">
        <div className="tw-hd">
          <div className="card-title">Urenregistratie</div>
          <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }}>
            <option>Alle medewerkers</option><option>Marco</option><option>Remco</option>
          </select>
        </div>
        <table className="dt">
          <thead><tr><th>Medewerker</th><th>Klant</th><th>Datum</th><th>Start</th><th>Eind</th><th>Uren</th><th>Type</th><th>Notitie</th></tr></thead>
          <tbody>
            {HOURS_DATA.map(h => {
              const c = custById(h.custId);
              return (
                <tr key={h.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Av name={h.emp} size="sm" idx={h.emp === 'Marco' ? 0 : 1} />
                      <span style={{ fontWeight: 600 }}>{h.emp}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{c?.name}</td>
                  <td style={{ color: 'var(--dl)' }}>{h.date}</td>
                  <td>{h.start}</td>
                  <td>{h.end}</td>
                  <td style={{ fontWeight: 700 }}>{h.hrs}u</td>
                  <td><span className="badge b-gray" style={{ textTransform: 'capitalize' }}>{h.type}</span></td>
                  <td style={{ color: 'var(--dmu)', fontSize: '.8rem' }}>{h.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KOSTEN DETAIL MODAL ───────────────────────────────────────
function KostenDetailModal({ cost, mbAdminId, customers, onUpdate, onDelete, onClose }) {
  const kostenCategorieen = useKostenCategorieen();
  const [cat, setCat] = useState(cost.cat);
  const [custId, setCustId] = useState(cost.customerId || '');
  const [projectId, setProjectId] = useState(cost.projectId || '');
  const [werkbonId, setWerkbonId] = useState(cost.werkbonId || '');
  const [btwPct, setBtwPct] = useState(cost.btwPercentage ?? 21);
  const [amt, setAmt] = useState(String(cost.amt ?? ''));
  const [date, setDate] = useState(cost.date || '');
  const [desc, setDesc] = useState(cost.desc || '');
  const [leverancierId, setLeverancierId] = useState(cost.leverancierId || '');
  // Leveranciers en werkbonnen komen uit de gedeelde dataset; deze modal haalde
  // ze op bij élke keer dat je een kostenregel opent. Projecten zitten niet in
  // de context, dus die blijft een eigen fetch.
  const { leveranciers: leverancierOpties = [], werkbonnen = [], refresh: verversGedeeld } = useData();
  const [savedField, setSavedField] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const [projecten, setProjecten] = useState([]);
  useEffect(() => { getProjects().then(setProjecten).catch(() => {}); }, []);

  // amount is exclusief BTW → btw-bedrag en incl. afgeleid (live).
  const btwCalc = calcBtw(amt, btwPct, 'excl');

  // Afhankelijke filtering: klant filtert project- en werkbonkeuze (zoals uren).
  const filteredProjecten = custId ? projecten.filter(p => p.customerId === custId) : projecten;
  const filteredWerkbonnen = custId ? werkbonnen.filter(w => w.customerId === custId) : werkbonnen;

  // Bron van een geïmporteerde kostenregel: SnelStart-refs zijn 'snelstart_…',
  // al het overige externe komt uit Moneybird ('moneybird_…', vroeger 'purchase_'/'receipt_').
  const kostenBron = cost.externeRef
    ? (cost.externeRef.startsWith('snelstart_') ? 'SnelStart' : 'Moneybird')
    : null;
  const mbUrl = (kostenBron === 'Moneybird' && mbAdminId && cost.moneybirdDocumentId)
    ? `https://moneybird.com/${mbAdminId}/documents/${cost.moneybirdDocumentId}`
    : null;

  const savePatch = async (patch, flagField) => {
    try {
      const updated = await updateJobCost(cost.id, patch);
      onUpdate?.(updated);
      if (flagField) { setSavedField(flagField); setTimeout(() => setSavedField(null), 2000); }
    } catch { /* silent */ }
  };
  const save = (field, value) => savePatch({ [field]: value === '' ? null : value }, field);
  const Saved = ({ field }) => savedField === field
    ? <span style={{ marginLeft: 8, color: '#15A34A', fontSize: '.7rem', fontWeight: 700 }}>{I.check} Opgeslagen</span>
    : null;

  const handleCatChange = e => { setCat(e.target.value); save('category', e.target.value); };
  const handleBtwChange = e => { const v = Number(e.target.value); setBtwPct(v); save('btw_percentage', v); };

  // Klant kiezen → project/werkbon die niet bij die klant horen loskoppelen.
  const handleCustChange = e => {
    const val = e.target.value;
    setCustId(val);
    const patch = { customer_id: val || null };
    if (val) {
      if (projectId && !projecten.some(p => p.id === projectId && p.customerId === val)) { setProjectId(''); patch.project_id = null; }
      if (werkbonId && !werkbonnen.some(w => w.id === werkbonId && w.customerId === val)) { setWerkbonId(''); patch.werkbon_id = null; }
    }
    savePatch(patch, 'customer_id');
  };
  // Project kiezen → klant automatisch afleiden.
  const handleProjectChange = e => {
    const val = e.target.value;
    setProjectId(val);
    const patch = { project_id: val || null };
    const p = projecten.find(x => x.id === val);
    if (p?.customerId) { setCustId(p.customerId); patch.customer_id = p.customerId; }
    savePatch(patch, 'project_id');
  };
  // Werkbon kiezen → project + klant automatisch afleiden.
  const handleWerkbonChange = e => {
    const val = e.target.value;
    setWerkbonId(val);
    const patch = { werkbon_id: val || null };
    const w = werkbonnen.find(x => x.id === val);
    if (w) {
      if (w.projectId) { setProjectId(w.projectId); patch.project_id = w.projectId; }
      if (w.customerId) { setCustId(w.customerId); patch.customer_id = w.customerId; }
    }
    savePatch(patch, 'werkbon_id');
  };

  const handleDelete = async () => {
    const msg = kostenBron
      ? `Weet je zeker dat je deze kostenregel wilt verwijderen? Dit verwijdert alleen de regel in BossBase, niet in ${kostenBron}.`
      : 'Weet je zeker dat je deze kostenregel wilt verwijderen?';
    if (!(await bevestig(msg))) return;
    setDeleting(true);
    try {
      // De kostenpost is weg zodra deleteJobCost klaar is; een waarschuwing gaat
      // alleen over de prullenbak. Het scherm sluit dus hoe dan ook.
      const waarschuwing = await deleteJobCost(cost.id);
      onDelete?.(cost.id);
      onClose();
      if (waarschuwing) toast.error(waarschuwing, { duration: 10000 });
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
      setDeleting(false);
    }
  };

  // Leverancier is verplicht omdat de kostenpost onder die relatie in de
  // boekhouding landt. Dit scherm bewaart per veld en heeft geen opslaan-knop,
  // dus dwingen we het af bij het sluiten: zolang er geen leverancier staat,
  // blijft het scherm open met een melding. Werkbon-materiaal is uitgezonderd —
  // die spiegelregels worden niet geëxporteerd.
  const isWerkbonMateriaal = Boolean(cost.werkbonMateriaalId);
  const levOntbreekt = !leverancierId && !isWerkbonMateriaal;
  const [levGemeld, setLevGemeld] = useState(false);
  const probeerSluiten = () => {
    if (levOntbreekt) { setLevGemeld(true); return; }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={probeerSluiten}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Kostendetail</span>
            {kostenBron
              ? <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#fff', background: kostenBron === 'SnelStart' ? '#0A5BC4' : '#2563EB', borderRadius: 5, padding: '2px 7px' }}>{kostenBron}</span>
              : <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px' }}>Handmatig</span>
            }
          </div>
          <ModalX onClose={probeerSluiten} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {/* Rij 1: Bedrag · Datum · BTW */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
            <div className="f" style={{ flex: '1 1 130px', minWidth: 0 }}>
              <label>Bedrag (excl. BTW) <Saved field="amount" /></label>
              {/* Bij werkbonmateriaal rekent de database het bedrag zelf uit
                  (aantal x inkoopprijs); een wijziging hier zou bij de
                  volgende aanpassing op de werkbon weer verdwijnen. */}
              <input type="number" min="0" step="0.01" value={amt} disabled={isWerkbonMateriaal}
                title={isWerkbonMateriaal ? 'Volgt het materiaal op de werkbon — wijzig het daar' : undefined}
                onChange={e => setAmt(e.target.value)} onBlur={() => save('amount', Number(amt) || 0)} />
            </div>
            <div className="f" style={{ flex: '1 1 130px', minWidth: 0 }}>
              <label>Datum <Saved field="cost_date" /></label>
              <input type="date" value={date}
                onChange={e => { setDate(e.target.value); save('cost_date', e.target.value); }} />
            </div>
            <div className="f" style={{ flex: '1 1 90px', minWidth: 0 }}>
              <label>BTW <Saved field="btw_percentage" /></label>
              <select value={btwPct} onChange={handleBtwChange} disabled={isWerkbonMateriaal}
                title={isWerkbonMateriaal ? 'Volgt het materiaal op de werkbon — wijzig het daar' : undefined}>
                {BTW_PCT_OPTIONS.map(p => <option key={p} value={p}>{p}%</option>)}
              </select>
            </div>
          </div>

          {/* BTW-samenvatting */}
          <div style={{ background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
              <span style={{ color: 'var(--dl)' }}>BTW {btwPct}%</span>
              <span style={{ fontWeight: 600 }}>{fmt(btwCalc.btw)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', fontSize: '.9rem' }}>
              <span style={{ fontWeight: 700 }}>Totaal incl. BTW</span>
              <span style={{ fontWeight: 800 }}>{fmt(btwCalc.incl)}</span>
            </div>
          </div>

          {/* Rij 2: Omschrijving · Categorie */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
            <div className="f" style={{ flex: '1 1 170px', minWidth: 0 }}>
              {/* Stond hier als één veld "Leverancier / omschrijving" dat naar
                  description schreef. Gesplitst, zodat de leverancier als echte
                  relatie naar de boekhouding kan i.p.v. losse tekst te zijn. */}
              <label>Leverancier {!isWerkbonMateriaal && '*'} <Saved field="leverancier_id" /></label>
              <LeverancierSelect
                value={leverancierId}
                onChange={v => { setLeverancierId(v); save('leverancier_id', v); if (v) setLevGemeld(false); }}
                leveranciers={leverancierOpties}
                onLijstGewijzigd={() => verversGedeeld?.()}
                verplicht={!isWerkbonMateriaal}
                fout={levGemeld && levOntbreekt}
              />
              {levGemeld && levOntbreekt && (
                <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>
                  Kies een leverancier — zonder leverancier kan deze kostenpost niet naar de boekhouding.
                </div>
              )}
            </div>
            <div className="f" style={{ flex: '2 1 200px', minWidth: 0 }}>
              <label>Omschrijving <Saved field="description" /></label>
              <input type="text" value={desc} placeholder="Omschrijving"
                onChange={e => setDesc(e.target.value)} onBlur={() => save('description', desc)} />
            </div>
            <div className="f" style={{ flex: '1 1 150px', minWidth: 0 }}>
              <label>Categorie <Saved field="category" /></label>
              <select value={cat} onChange={handleCatChange}>
                {categorieOptiesUit(kostenCategorieen, cat).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Rij 3: Klant · Project · Werkbon (afhankelijke filtering) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
            <div className="f" style={{ flex: '1 1 140px', minWidth: 0 }}>
              <label>Klant <Saved field="customer_id" /></label>
              <select value={custId} onChange={handleCustChange}>
                <option value="">Algemeen</option>
                {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="f" style={{ flex: '1 1 140px', minWidth: 0 }}>
              <label>Project <Saved field="project_id" /></label>
              <select value={projectId} onChange={handleProjectChange}>
                <option value="">Geen project</option>
                {filteredProjecten.map(p => <option key={p.id} value={p.id}>{p.name || 'Project'}</option>)}
              </select>
            </div>
            <div className="f" style={{ flex: '1 1 140px', minWidth: 0 }}>
              <label>Werkbon <Saved field="werkbon_id" /></label>
              <select value={werkbonId} onChange={handleWerkbonChange}>
                <option value="">Geen werkbon</option>
                {filteredWerkbonnen.map(w => <option key={w.id} value={w.id}>{w.titel || 'Werkbon'}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cost.bijlageUrl && (
              <button type="button" className="btn btn-s btn-sm"
                onClick={async () => { const u = await getKostenBijlageUrl(cost.bijlageUrl); if (u) window.open(u, '_blank', 'noopener'); }}>
                {I.paperclip} Bijlage bekijken
              </button>
            )}
            {mbUrl && (
              <a href={mbUrl} target="_blank" rel="noreferrer" className="btn btn-s btn-sm">
                <ExternalLink size={14} /> Bekijk in Moneybird
              </a>
            )}
          </div>
          <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <button
              className="btn btn-s btn-sm"
              style={{ color: '#dc2626', borderColor: '#fca5a5', background: 'transparent', width: '100%' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Verwijderen...' : 'Verwijderen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── COSTS ────────────────────────────────────────────────────
// Werkbonmateriaal is uitgezonderd van de leveranciersplicht: die spiegelregels
// worden niet naar de boekhouding geëxporteerd (exportKosten filtert ze eruit).
const isWerkbonMateriaalKost = c => Boolean(c?.werkbonMateriaalId ?? c?.werkbon_materiaal_id);

// Een inkoop die op een werkbon is gezet (tabel project_kosten) in de rijvorm
// van deze tabel, zodat hij naast het werkbonmateriaal kan staan.
//
// Twee dingen bewust anders dan bij een boeking: geen btw-percentage (dat is
// nergens vastgelegd, dus 21% tonen zou een getal verzinnen) en een vlag, want
// het bewerkvenster schrijft op job_costs en deze rij staat in een andere tabel.
const werkbonInkoopAlsRij = k => ({
  id: k.id,
  cat: 'Inkopen',
  desc: k.naam,
  leverancierId: k.leverancierId,
  amt: k.bedrag,
  btwPercentage: null,
  date: k.datum,
  custId: k.customerId,
  customerId: k.customerId,
  werkbonInkoop: true,
});

export function CostsPage() {
  const { refreshKey, bumpRefresh } = useProfile();
  const { guardSchrijven, planModal } = usePlanGuard();
  const [costs, setCosts] = useState([]);
  const [werkbonInkopen, setWerkbonInkopen] = useState([]);
  // Klanten, deals en leveranciers komen uit de gedeelde dataset die de app
  // toch al ophaalt (DataContext). Deze pagina haalde ze apart op: drie extra
  // verzoeken per bezoek voor gegevens die al in het geheugen stonden.
  const { customers = [], deals = [], leveranciers = [] } = useData();
  const [showNew, setShowNew] = useState(false);
  const [filterCust, setFilterCust] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCost, setSelectedCost] = useState(null);
  const [mbAdminId, setMbAdminId] = useState('');
  // Twee weergaven, nooit allebei tegelijk: "Kosten" (de boekingen, standaard)
  // en "Kosten op werkbonnen" (het materiaal dat op klussen verbruikt is). Dat zijn twee
  // verschillende dingen — boekingen gaan naar de boekhouding, materiaal niet —
  // en ze worden daarom nergens bij elkaar opgeteld. De pagina blijft verder
  // gelijk: dezelfde tegels, dezelfde tabel, hetzelfde periodefilter.
  const [weergave, setWeergave] = useState(() => {
    try { return localStorage.getItem('kosten_weergave') === 'materiaal' ? 'materiaal' : 'kosten'; } catch { return 'kosten'; }
  });
  const kiesWeergave = keuze => {
    setWeergave(keuze);
    // Privémodus of geblokkeerde opslag: dan onthouden we het gewoon niet.
    try { localStorage.setItem('kosten_weergave', keuze); } catch { /* niet blokkerend */ }
  };
  // Periodefilter, standaard deze maand. Het type onthouden we; de sprong niet —
  // kom je morgen terug, dan wil je de huidige periode zien en niet de week van
  // vorige maand waar je toevallig was blijven staan.
  const [periodeType, setPeriodeType] = useState(() => {
    try {
      const bewaard = localStorage.getItem('kosten_periode_type');
      return PERIODE_TYPES.some(p => p.id === bewaard) ? bewaard : 'maand';
    } catch { return 'maand'; }
  });
  const [periodeOffset, setPeriodeOffset] = useState(0);
  const kiesPeriodeType = id => {
    setPeriodeType(id);
    setPeriodeOffset(0);
    try { localStorage.setItem('kosten_periode_type', id); } catch { /* niet blokkerend */ }
  };
  const periode = periodeRange(periodeType, periodeOffset);
  // Alleen de kosten van de gekozen periode ophalen, server-side op cost_date.
  // Een bedrijf met jaren historie hoeft niet zijn hele kostenboek te
  // downloaden om één maand te tonen: bij het testbedrijf scheelt september al
  // 1215 -> 781 rijen, en in de kostenweergave blijven er 16 over.
  //
  // start en eind als dependency, niet het periode-object zelf: dat is bij elke
  // render een nieuw object en zou eindeloos opnieuw laden.
  const { start: periodeStart, eind: periodeEind } = periode;
  // `leeft`: wissel je snel van periode, dan kan een ouder antwoord later
  // binnenkomen dan het nieuwe. Zonder deze vlag won het laatst binnengekomen
  // antwoord en stond het jaartotaal onder de kop "Oktober" (audit M24).
  const [opnieuw, setOpnieuw] = useState(0);
  React.useEffect(() => {
    let leeft = true;
    setLoading(true);
    Promise.all([
      listJobCosts({ vanDatum: periodeStart, totDatum: periodeEind }),
      getConnection(),
      // Bewust geen .catch hier: gaat dit mis, dan hoort de foutmelding in beeld
      // te komen. Stil op nul uitkomen is precies de fout waar alleRijen voor is.
      listWerkbonInkopen({ vanDatum: periodeStart, totDatum: periodeEind }),
    ])
      .then(([costData, conn, inkoopData]) => {
        if (!leeft) return;
        setCosts(costData);
        setWerkbonInkopen(inkoopData.map(werkbonInkoopAlsRij));
        if (conn?.administrationId) setMbAdminId(conn.administrationId);
        setError(null);
      })
      .catch(err => { if (leeft) setError(err); })
      .finally(() => { if (leeft) setLoading(false); });
    return () => { leeft = false; };
  }, [refreshKey, periodeStart, periodeEind, opnieuw]);
  // De periode zit nu in de query zelf, dus hier blijven alleen de twee
  // dropdowns over.
  const filtered = costs.filter(r => {
    if (filterCust && String(r.custId) !== filterCust) return false;
    if (filterCat && r.cat !== filterCat) return false;
    return true;
  });
  // De twee weergaven, elk uit hun eigen bron. Ze worden nergens bij elkaar
  // opgeteld: tegels én tabel rekenen allebei met `actieveRegels`, dus wat je
  // ziet is altijd precies één van de twee.
  const boekingen = alleenGeboekt(filtered);
  // "Kosten op werkbonnen" is allebei: het materiaal (spiegelregels in
  // job_costs) én de inkopen die op een werkbon zijn gezet (project_kosten).
  // Los van elkaar dekte die naam de lading niet. De inkopen blijven buiten
  // `costs`, zodat de boekingen, het leverancier-signaal en de categorieënlijst
  // onaangeroerd blijven; daarom krijgen ze hier dezelfde filters.
  const materiaalRegels = [
    ...filtered.filter(isWerkbonMateriaalKost),
    ...werkbonInkopen.filter(r => {
      if (filterCust && String(r.custId) !== filterCust) return false;
      if (filterCat && r.cat !== filterCat) return false;
      return true;
    }),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const toontMateriaal = weergave === 'materiaal';
  const actieveRegels = toontMateriaal ? materiaalRegels : boekingen;
  const actiefTotaal = Math.round(actieveRegels.reduce((s, c) => s + (Number(c.amt) || 0), 0) * 100) / 100;
  // De categorietegels tellen op tot de eerste tegel, in beide weergaven.
  const groepTotalen = kostenPerGroep(actieveRegels);
  // Kosten zonder leverancier kunnen niet naar de boekhouding. Werkbonmateriaal
  // telt niet mee: die regels worden sowieso niet geëxporteerd.
  const zonderLeverancier = costs.filter(c => !c.leverancierId && !isWerkbonMateriaalKost(c));
  const cats = [...new Set(costs.map(c => c.cat))];
  // Hier stond "Kostprijs klus": alle kosten opgeteld, ook de algemene die aan
  // geen enkele klus hangen. Dat was geen kostprijs van iets. Wat een klus kost
  // staat nu op het project (werkbonmateriaal + projectkosten); deze pagina is
  // de boekhouding, dus de eerste tegel is wat er geboekt is, en de categorieën
  // tellen daartoe op. Werkbonmateriaal heeft hier bewust GEEN tegel meer: het
  // is geen boeking, dus het hoort niet tussen de bedragen die optellen tot het
  // kostentotaal. Het staat onder de tabel, achter de schakelaar, met een eigen
  // subtotaal.
  // Arbeid blijft staan zolang er oude data is; als categorie is hij niet meer
  // te kiezen.
  const tegels = [
    toontMateriaal
      ? { label: 'Kosten op werkbonnen', val: fmt(actiefTotaal), icon: I.costs,
          sub: 'Geen boeking · telt in de marge van een project' }
      : { label: 'Geboekte kosten', val: fmt(actiefTotaal), icon: I.brief,
          sub: 'Wat naar de boekhouding gaat' },
    { label: 'Materiaalkosten', val: fmt(groepTotalen.materiaal), icon: I.brief },
    ...(groepTotalen.arbeid > 0 ? [{ label: 'Arbeidskosten', val: fmt(groepTotalen.arbeid), icon: I.hours }] : []),
    { label: 'Reiskosten', val: fmt(groepTotalen.reiskosten), icon: I.map },
    { label: 'Overige kosten', val: fmt(groepTotalen.overig), icon: I.costs },
  ];
  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Kosten</h1><p>Kosten bijhouden per klant en opdracht</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm" data-rl="kosten-nieuw" onClick={guardSchrijven('Kosten toevoegen', () => setShowNew(true))}>{I.plus} Kosten toevoegen</button>
        </div>
      </div>
      {loading && <div className="card card-p">Kosten laden...</div>}
      {error && <LaadFout fout={error} titel="Kosten laden is niet gelukt" onOpnieuw={() => setOpnieuw(n => n + 1)} />}
      {/* Groepering via kostenPerGroep — hoofdletterongevoelig en met een
          vangnet-groep, zodat de tegels altijd optellen tot het totaal. */}
      <div className="stats-row afu2" style={{ gridTemplateColumns: `repeat(${tegels.length},1fr)` }}>
        {tegels.map((s, i) => (
          <div key={i} className="sc">
            <div className="sc-top"><div className="sc-icon">{s.icon}</div></div>
            <div className="sc-val">{s.val}</div>
            {/* De toelichting onder een tegel ("Wat naar de boekhouding gaat")
                stond permanent in beeld; nu achter het icoontje bij het label. */}
            <div className="sc-label">
              {s.label}{s.sub && <InfoTip tekst={s.sub} />}
            </div>
          </div>
        ))}
      </div>
      {/* In de materiaalweergave staat er meteen bij wat je ziet — anders lijkt
          het materiaal alsnog een kostenpost die in je boekhouding thuishoort. */}
      {toontMateriaal && (
        <div className="afu2" style={{
          fontSize: '.82rem', lineHeight: 1.5,
          background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#075985',
          borderRadius: 'var(--r8)', padding: '10px 12px', marginBottom: 14,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Dit zijn geen boekingen</div>
          Materiaal en inkopen die op werkbonnen staan.
          <ul style={{ margin: '4px 0 0', paddingLeft: 17 }}>
            <li>Ze tellen niet mee in je kosten en je btw. In je boekhouding is de factuur van je leverancier de kostenpost.</li>
            <li>Ze tellen wél mee in de brutowinst van een project.</li>
          </ul>
        </div>
      )}
      {/* Alleen bij de boekingen: materiaal hoeft geen leverancier te hebben,
          dat loopt via de werkbon. */}
      {!toontMateriaal && zonderLeverancier.length > 0 && (
        <div className="afu2" style={{
          fontSize: '.82rem', color: 'var(--dm)',
          background: 'var(--warn-bg, rgba(224,176,80,.10))', border: '1px solid var(--warn-bd, #e0b050)',
          borderRadius: 'var(--r8)', padding: '10px 12px', marginBottom: 14,
        }}>
          {/* De melding zelf blijft zichtbaar: dit is een signaal dat er iets
              te doen is. Alleen de toelichting eronder zit achter het icoon. */}
          <div className="f-label-rij">
            <strong>
              {zonderLeverancier.length} {zonderLeverancier.length === 1 ? 'kostenpost heeft' : 'kostenposten hebben'} nog geen leverancier
            </strong>
            <InfoUitklap
              id="uitleg-zonder-leverancier"
              tekst="Zonder leverancier kunnen ze niet naar de boekhouding. Ze staan hieronder gemarkeerd met “Ontbreekt” — open zo’n regel en kies alsnog een leverancier."
            />
          </div>
        </div>
      )}

      <div className="tw afu3">
        <div className="tw-hd" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title">{toontMateriaal ? 'Kosten op werkbonnen' : 'Kostenregels'}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Dezelfde bediening als de periodekeuze bij de btw-indicatie op
                Financiën: tabs voor de keuze, zodat het vertrouwd oogt. */}
            <div className="tabs" data-rl="kosten-weergave">
              <button className={`tab${!toontMateriaal ? ' active' : ''}`} onClick={() => kiesWeergave('kosten')}>Geboekte kosten</button>
              <button className={`tab${toontMateriaal ? ' active' : ''}`} onClick={() => kiesWeergave('materiaal')}>Kosten op werkbonnen</button>
            </div>
            <div className="tabs" data-rl="kosten-periode">
              {PERIODE_TYPES.map(p => (
                <button key={p.id} className={`tab${periodeType === p.id ? ' active' : ''}`} onClick={() => kiesPeriodeType(p.id)}>{p.label}</button>
              ))}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button className="btn btn-s btn-sm" style={{ padding: '5px 9px' }} onClick={() => setPeriodeOffset(o => o - 1)} aria-label="Vorige periode">‹</button>
              <span style={{ minWidth: 148, textAlign: 'center', fontSize: '.82rem', fontWeight: 600 }}>{periode.label}</span>
              <button className="btn btn-s btn-sm" style={{ padding: '5px 9px' }} onClick={() => setPeriodeOffset(o => o + 1)} aria-label="Volgende periode">›</button>
              {periodeOffset !== 0 && (
                <button className="btn btn-s btn-sm" style={{ padding: '5px 9px' }} onClick={() => setPeriodeOffset(0)} title="Terug naar nu">Nu</button>
              )}
            </div>
            <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }} value={filterCust} onChange={e => setFilterCust(e.target.value)}>
              <option value="">Alle klanten</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="btn btn-s btn-sm" style={{ padding: '5px 10px' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">Alle categorieën</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <table className="dt">
          <thead><tr><th>Klant</th><th>Categorie</th><th>Omschrijving</th><th>Leverancier</th><th>Bedrag</th><th>Datum</th><th>Bron</th><th></th></tr></thead>
          <tbody>
            {actieveRegels.map(r => {
              const c = customers.find(x => x.id === r.custId);
              return (
                <tr key={r.id}
                  onClick={r.werkbonInkoop ? undefined : () => setSelectedCost(r)}
                  style={{ cursor: r.werkbonInkoop ? 'default' : 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{r.customerId ? (customers.find(x => x.id === r.customerId)?.name || '') : r.klantType === 'algemeen' ? 'Algemeen' : (c?.name || '')}</td>
                  <td><CostCategoryBadge category={r.cat} /></td>
                  <td>{r.desc}</td>
                  <td>
                    {r.leverancierId
                      ? (leveranciers.find(l => l.id === r.leverancierId)?.naam || '')
                      : (isWerkbonMateriaalKost(r) || r.werkbonInkoop)
                        ? <span style={{ color: 'var(--dl)', fontSize: '.78rem' }}>via werkbon</span>
                        : <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.72rem', fontWeight: 600,
                            color: '#b45309', background: 'rgba(224,176,80,.14)', border: '1px solid #e0b050',
                            borderRadius: 4, padding: '1px 6px',
                          }} title="Zonder leverancier kan deze kostenpost niet naar de boekhouding">
                            Ontbreekt
                          </span>}
                  </td>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmt(r.amt)}
                    {/* Een inkoop op een werkbon is geen boeking en heeft geen
                        vastgelegd btw-percentage; 21% tonen zou een getal
                        verzinnen dat niemand heeft ingevuld. */}
                    {!r.werkbonInkoop && (
                      <>
                        <span style={{ marginLeft: 5, fontSize: '.68rem', color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontWeight: 400 }}>excl. · {r.btwPercentage ?? 21}% btw</span>
                        <div style={{ fontSize: '.7rem', color: 'var(--dl)', fontWeight: 400 }}>{fmt(calcBtw(r.amt, r.btwPercentage ?? 21, 'excl').incl)} incl.</div>
                      </>
                    )}
                  </td>
                  <td style={{ color: 'var(--dl)', fontSize: '.8rem' }}>{r.date}</td>
                  <td>
                    {r.externeRef
                      ? (r.externeRef.startsWith('snelstart_')
                        ? <span style={{ fontSize: '.7rem', fontWeight: 700, color: '#fff', background: '#0A5BC4', borderRadius: 4, padding: '2px 6px' }}>SS</span>
                        : <span style={{ fontSize: '.7rem', fontWeight: 700, color: '#fff', background: '#2563EB', borderRadius: 4, padding: '2px 6px' }}>MB</span>)
                      : <span style={{ fontSize: '.7rem', color: 'var(--dl)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>handmatig</span>
                    }
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    {r.bijlageUrl && (
                      <button type="button" title="Bijlage bekijken"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dl)', fontSize: '1rem', padding: 0 }}
                        onClick={async () => { const u = await getKostenBijlageUrl(r.bijlageUrl); if (u) window.open(u, '_blank', 'noopener'); }}>
                        {I.paperclip}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {actieveRegels.length === 0 && !loading && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--dl)', padding: 24 }}>
                {toontMateriaal ? 'Geen kosten op werkbonnen' : 'Geen kosten'} in {periode.label}
                {(filterCust || filterCat) ? ' bij dit filter' : ''}.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewJobCostModal
          onClose={() => setShowNew(false)}
          customers={customers}
          deals={deals}
          onSaved={created => { setCosts(cs => [created, ...cs]); }}
          onAttached={updated => setCosts(cs => cs.map(c => c.id === updated.id ? updated : c))}
        />
      )}
      {selectedCost && (
        <KostenDetailModal
          cost={selectedCost}
          mbAdminId={mbAdminId}
          customers={customers}
          onUpdate={updated => {
            setCosts(cs => cs.map(c => c.id === updated.id ? updated : c));
            setSelectedCost(updated);
          }}
          onDelete={id => setCosts(cs => cs.filter(c => c.id !== id))}
          onClose={() => setSelectedCost(null)}
        />
      )}

      {planModal}
    </div>
  );
}

// ── BTW HELPERS ───────────────────────────────────────────────
const BTW_NL_MONTHS = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];

function generatePeriodeOpties(type) {
  const now = new Date();
  const opties = [];
  if (type === 'kwartaal') {
    let q = Math.floor(now.getMonth() / 3);
    let year = now.getFullYear();
    for (let i = 0; i < 4; i++) {
      opties.push(`Q${q + 1} ${year}`);
      q--; if (q < 0) { q = 3; year--; }
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opties.push(`${BTW_NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`);
    }
  }
  return opties;
}

// Label ("Q3 2026" / "Augustus 2026") terug naar begin- en einddatum, zodat de
// eigen BTW-berekening weet welke periode hij moet optellen.
function generatePeriodeRange(label, type) {
  if (!label) return null;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (type === 'kwartaal') {
    const m = /^Q([1-4])\s+(\d{4})$/.exec(label);
    if (!m) return null;
    const q = Number(m[1]) - 1;
    const jaar = Number(m[2]);
    return { start: iso(new Date(jaar, q * 3, 1)), eind: iso(new Date(jaar, q * 3 + 3, 0)) };
  }
  const m = /^(\p{L}+)\s+(\d{4})$/u.exec(label);
  if (!m) return null;
  const maand = BTW_NL_MONTHS.findIndex(x => x.toLowerCase() === m[1].toLowerCase());
  if (maand < 0) return null;
  const jaar = Number(m[2]);
  return { start: iso(new Date(jaar, maand, 1)), eind: iso(new Date(jaar, maand + 1, 0)) };
}

// ── FINANCIËN ─────────────────────────────────────────────────
export function RevenuePage() {
  const toast = useToast();
  const { refreshKey } = useProfile();
  // BTW-overzicht is een feature uit de centrale matrix (Groei+).
  const btwPlan = usePlan();
  // Klanten, kosten, facturen en offertes komen uit de gedeelde dataset die de
  // app toch al ophaalt (DataContext). Deze pagina haalde ze apart op: vier
  // verzoeken per bezoek voor gegevens die al in het geheugen stonden.
  //
  // jobCosts uit de context zijn al gefilterd op boekingen (alleenGeboekt in
  // App.jsx) — precies wat hier nodig is: werkbonmateriaal staat in de
  // boekhouding al als inkoopfactuur, en meetellen zou dezelfde inkoop dubbel
  // tellen.
  const { customers = [], offertes = [], loading: gedeeldLaden } = useData();
  // Facturen en kosten zitten niet meer in de gedeelde dataset: ze werden op
  // élke pagina opgehaald terwijl alleen deze pagina en het dashboard ze tonen.
  // De tegels komen uit de database (bb_financien_kpi) en staan er dus al; deze
  // twee lijsten voeden de grafiek, de btw-kaart en de tabel per klant, die
  // daarna invullen.
  const [facturen, setFacturen] = useState([]);
  const [costsData, setCostsData] = useState([]);
  const [chartMode, setChartMode] = useState('gefactureerd');
  const [chartPeriod, setChartPeriod] = useState('maand');
  const [loading, setLoading] = useState(true);
  const [mbConnection, setMbConnection] = useState(null);
  const [btwPerioden, setBtwPerioden] = useState([]);
  const [btwPeriodeType, setBtwPeriodeType] = useState('kwartaal');
  const [btwLoading, setBtwLoading] = useState(false);
  // Eigen berekening uit facturen en kosten — werkt zonder boekhoudkoppeling.
  const [btwIndicatie, setBtwIndicatie] = useState(null);
  const [btwStelsel, setBtwStelsel] = useState('factuur');
  const [btwSyncing, setBtwSyncing] = useState(false);
  const [btwSelectedLabel, setBtwSelectedLabel] = useState(() => generatePeriodeOpties('kwartaal')[0] || '');
  const [kpiPeriode, setKpiPeriode] = useState('deze-maand');
  const [kpiVan, setKpiVan] = useState('');
  const [kpiTot, setKpiTot] = useState('');

  const TODAY = vandaagIso();

  // Laadfouten zichtbaar maken. Vroeger viel een mislukte lading terug op een
  // lege lijst (.catch(() => [])) en toonde Financiën overal € 0,00 zonder
  // melding — "ik heb niets openstaan" (audit M23).
  const [laadFoutFin, setLaadFoutFin] = useState(null);
  const [opnieuwFin, setOpnieuwFin] = useState(0);
  React.useEffect(() => {
    let leeft = true;
    setLoading(true);
    // Alles wat niet in de gedeelde dataset zit: facturen en kosten voor de
    // grafiek en de tabel, en de boekhoudkoppeling. (Hier werden ook álle
    // factuurregels van het bedrijf opgehaald, maar niets gebruikte ze; de
    // btw-indicatie haalt zelf wat ze nodig heeft — audit 2026-10-01, P5.)
    Promise.all([
      getFacturen(),
      listJobCosts().then(alleenGeboekt),
      getConnection(),
    ])
      .then(([facturenData, costData, mbConn]) => {
        if (!leeft) return;
        setLaadFoutFin(null);
        setFacturen(facturenData);
        setCostsData(costData);
        // Alleen Moneybird: dat is de enige koppeling die btw_periodes nog vult.
        // SnelStart stond hier als terugval, maar snelstart-sync-btw is eruit —
        // de scope btwaangiftes:read komt er niet. Een SnelStart-klant zag
        // daardoor een knop "Ophalen uit boekhouding" die niets kon ophalen.
        setMbConnection(mbConn);
      })
      .catch(err => { if (leeft) setLaadFoutFin(err); })
      .finally(() => { if (leeft) setLoading(false); });
    return () => { leeft = false; };
  }, [refreshKey, opnieuwFin]);

  React.useEffect(() => {
    setBtwSelectedLabel(generatePeriodeOpties(btwPeriodeType)[0] || '');
  }, [btwPeriodeType]);

  React.useEffect(() => {
    if (!mbConnection?.connected) return;
    setBtwLoading(true);
    getBtwPeriodes(btwPeriodeType)
      .then(setBtwPerioden)
      .catch(() => {})
      .finally(() => setBtwLoading(false));
  }, [mbConnection, btwPeriodeType]);

  // Stelsel ophalen: bepaalt of omzet op factuur- of betaaldatum telt.
  const [stelselBekend, setStelselBekend] = useState(false);
  React.useEffect(() => {
    getBedrijfsinstellingen()
      .then(s => { if (s?.btwStelsel) setBtwStelsel(s.btwStelsel); })
      .catch(() => {})
      .finally(() => setStelselBekend(true));
  }, [refreshKey]);

  // Eigen BTW-indicatie voor de gekozen periode. Hangt niet aan een koppeling.
  React.useEffect(() => {
    const p = generatePeriodeRange(btwSelectedLabel, btwPeriodeType);
    if (!p) { setBtwIndicatie(null); return; }
    // Pas rekenen als de pagina en het stelsel geladen zijn. Daarvoor draaide
    // deze berekening (drie queries) eerst op lege data en daarna nog eens —
    // de dubbele verzoeken op Financiën (audit 2026-10-01, P5).
    if (loading || !stelselBekend) return;
    let leeft = true;
    berekenBtwIndicatie({ start: p.start, eind: p.eind, stelsel: btwStelsel })
      .then(r => { if (leeft) setBtwIndicatie(r); })
      .catch(() => { if (leeft) setBtwIndicatie(null); });
    return () => { leeft = false; };
  }, [btwSelectedLabel, btwPeriodeType, btwStelsel, loading, stelselBekend]); // na een refreshKey gaat loading eerst aan en dan uit: dat ververst

  // ── KPI ──────────────────────────────────────────────────────
  const kpiRange = React.useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    if (kpiPeriode === 'deze-maand')  return { start: `${y}-${m}`, end: `${y}-${m}`, mode: 'month' };
    if (kpiPeriode === 'vorige-maand') {
      const p = new Date(y, now.getMonth() - 1, 1);
      const pm = String(p.getMonth() + 1).padStart(2, '0');
      return { start: `${p.getFullYear()}-${pm}`, end: `${p.getFullYear()}-${pm}`, mode: 'month' };
    }
    if (kpiPeriode === 'dit-jaar')   return { start: `${y}-01-01`, end: `${y}-12-31`, mode: 'range' };
    if (kpiPeriode === 'vorig-jaar') return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, mode: 'range' };
    if (kpiPeriode === 'aangepast')  return { start: kpiVan, end: kpiTot, mode: 'range' };
    return { start: `${y}-${m}`, end: `${y}-${m}`, mode: 'month' };
  }, [kpiPeriode, kpiVan, kpiTot]);

  const inPeriode = d => {
    if (!d) return false;
    if (kpiRange.mode === 'month') return d.startsWith(kpiRange.start);
    return kpiRange.start && kpiRange.end && d >= kpiRange.start && d <= kpiRange.end;
  };

  const PERIODE_LABEL = { 'deze-maand': 'deze maand', 'vorige-maand': 'vorige maand', 'dit-jaar': 'dit jaar', 'vorig-jaar': 'vorig jaar', 'aangepast': 'geselecteerde periode' };
  const periodeLabel = PERIODE_LABEL[kpiPeriode] || 'deze periode';

  // De tegels gebruiken exact dezelfde optellingen als de kolommen per klant
  // hieronder — alleen het tijdvak verschilt. Elke tegel houdt daarbij zijn
  // eigen datumveld: gefactureerd kijkt naar de factuurdatum, ontvangen naar de
  // betaaldatum, en openstaand is een momentopname zonder tijdvak (net als de
  // kolom Openstaand, die ook alles meetelt wat nog niet binnen is).
  // De tegels komen uit de database (bb_financien_kpi, migratie 20260919160000)
  // en niet meer uit vijf volledige tabellen die de browser optelt. Dezelfde
  // definities, dus dezelfde bedragen — alleen staan ze er nu binnen een
  // seconde in plaats van na zeven.
  //
  // kpiRange denkt in maandsleutels ("2026-09"); de database wil echte datums.
  const kpiDatums = React.useMemo(() => {
    if (kpiRange.mode === 'month') {
      const [j, m] = kpiRange.start.split('-').map(Number);
      const laatste = new Date(j, m, 0).getDate();
      return { van: `${kpiRange.start}-01`, tot: `${kpiRange.start}-${String(laatste).padStart(2, '0')}` };
    }
    return { van: kpiRange.start || '', tot: kpiRange.end || '' };
  }, [kpiRange]);

  const [kpi, setKpi] = useState(null);
  const [kpiFout, setKpiFout] = useState(null);
  React.useEffect(() => {
    if (!kpiDatums.van || !kpiDatums.tot) return undefined;
    let leeft = true;
    // Bewust géén setKpi(null) vooraf: bij het wisselen van periode blijven de
    // vorige bedragen staan tot de nieuwe binnen zijn. Dat leest rustiger dan
    // een tegel die even op nul springt.
    getFinancienKpi(kpiDatums)
      .then(r => { if (leeft) { setKpi(r); setKpiFout(null); } })
      .catch(err => { if (leeft) { setKpi(null); setKpiFout(err); } });
    return () => { leeft = false; };
  }, [kpiDatums.van, kpiDatums.tot, refreshKey, opnieuwFin]); // eslint-disable-line react-hooks/exhaustive-deps

  const omzetPeriode     = kpi?.gefactureerd ?? 0;
  const ontvangenPeriode = kpi?.ontvangen ?? 0;
  const openstaand       = kpi?.openstaand ?? 0;
  const teVerwachten     = kpi?.teVerwachten ?? 0;
  const kostenPeriode    = kpi?.kosten ?? 0;
  const netto            = ontvangenPeriode - kostenPeriode;

  // ── CHART DATA ────────────────────────────────────────────────
  const chartData = React.useMemo(() => {
    const now = new Date();
    const toIso = d => d.toISOString().slice(0, 10);
    const DAY_NL = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

    // Eén staaf. Gebruikt dezelfde optellingen als de tegels erboven en de
    // kolommen per klant eronder; alleen het tijdvak per staaf verschilt.
    // `raakt` krijgt losse datums en is null-safe.
    const staaf = (label, raakt) => ({
      label,
      gefactureerd: sumGefactureerd(facturen.filter(f => raakt(f.factuurdatum))),
      ontvangen:    sumBetaald(facturen.filter(f => raakt(f.betaaldOp))),
      kosten:       costsData.filter(c => raakt(c.date)).reduce((s, c) => s + c.amt, 0),
    });
    const opDag    = key => d => d === key;
    const inBereik = (start, end) => d => Boolean(d) && d >= start && d <= end;
    const inMaand  = key => d => Boolean(d) && d.startsWith(key);

    if (chartPeriod === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - 6 + i);
        return staaf(DAY_NL[d.getDay()], opDag(toIso(d)));
      });
    }

    if (chartPeriod === 'maand') {
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - 29 + i);
        return staaf(String(d.getDate()), opDag(toIso(d)));
      });
    }

    if (chartPeriod === 'kwartaal') {
      return Array.from({ length: 13 }, (_, i) => {
        const wEnd = new Date(now); wEnd.setDate(wEnd.getDate() - (12 - i) * 7);
        const wStart = new Date(wEnd); wStart.setDate(wEnd.getDate() - 6);
        const label = `${wStart.getDate()} ${wStart.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')}`;
        return staaf(label, inBereik(toIso(wStart), toIso(wEnd)));
      });
    }

    // jaar (default) — afgelopen 12 maanden
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return staaf(d.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', ''), inMaand(key));
    });
  }, [facturen, costsData, chartPeriod]);

  // ── PER KLANT ─────────────────────────────────────────────────
  // `total`, `paid` en `openstaand` komen NIET uit customerService — de
  // customers-tabel kent die kolommen niet. customerTotalsService leidt ze af
  // uit de facturen die deze pagina toch al inleest; de klantenlijst, de
  // klantkaart en de database-export gebruiken exact dezelfde definitie.
  //
  // De kosten per klant komen uit kostenOverzichtService, met dezelfde
  // toewijzing en hetzelfde rekenwerk als de klantkaart en het project:
  // materiaal op inkoopprijs + inkopen, uren als aantal zonder bedrag. Boekingen
  // tellen niet mee (dat is de boekhouding; het materiaal daarvan telt al via de
  // werkbon). Hier stond eerst een eigen som van de boekingen per klant, met de
  // winst op het betaalde bedrag incl. btw — een ander getal dan op de klantkaart.
  const [kostenPerKlant, setKostenPerKlant] = useState(null);
  const klantIdSleutel = customers.map(c => c.id).join(',');
  React.useEffect(() => {
    // Tijdens het laden null (de tabel toont dan "…"), nooit een lege map: die
    // liet €0 zien als echte uitkomst terwijl de kosten nog onderweg waren.
    if (!customers.length) { setKostenPerKlant(gedeeldLaden ? null : new Map()); return undefined; }
    let leeft = true;
    setKostenPerKlant(null);
    getKostenOverzichtPerKlant(customers.map(c => c.id))
      .then(m => { if (leeft) setKostenPerKlant(m); })
      .catch(() => { if (leeft) setKostenPerKlant(new Map()); });
    return () => { leeft = false; };
  }, [klantIdSleutel, refreshKey, gedeeldLaden]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = withCustomerTotals(customers, { facturen }).map(c => {
    const kosten = kostenPerKlant?.get(c.id) || LEEG_OVERZICHT;
    // Zelfde als de klantkaart: omzet excl. btw min kosten.
    const omzetExcl = sumOmzetExclBtw(facturen.filter(f => f.customerId === c.id));
    const profit = omzetExcl - kosten.totaal;
    const margin = omzetExcl > 0 ? Math.round((profit / omzetExcl) * 100) : 0;
    return { ...c, materiaal: kosten.materiaal.bedrag, inkopen: kosten.inkopen.bedrag, uren: kosten.uren.uren, omzetExcl, profit, margin };
  });
  const som = veld => Math.round(rows.reduce((s, r) => s + (Number(r[veld]) || 0), 0) * 100) / 100;
  const totaalRij = {
    total: som('total'), paid: som('paid'), openstaand: som('openstaand'),
    materiaal: som('materiaal'), inkopen: som('inkopen'), uren: som('uren'), profit: som('profit'),
  };
  const fmtUren = u => `${Number(u || 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur`;

  const handleSyncBtw = async () => {
    setBtwSyncing(true);
    try {
      await syncBtwData(btwPeriodeType);
      const data = await getBtwPeriodes(btwPeriodeType);
      setBtwPerioden(data);
      toast.success('BTW-gegevens opgehaald uit de boekhouding');
    } catch (err) {
      // Faalt bewust zacht: de eigen indicatie hieronder blijft gewoon staan,
      // die hangt niet aan een koppeling.
      toast.error(err.message || 'Ophalen uit de boekhouding is niet gelukt — de indicatie hieronder blijft werken');
    }
    finally { setBtwSyncing(false); }
  };

  // Exporteert de tabel "Per klant / opdracht" als Excel-bestand, met dezelfde
  // kolommen en dezelfde getallen als op het scherm. Hier stond een CSV-export
  // die nog r.costs las, een veld dat sinds de kostenherziening niet meer
  // bestaat: toFixed() op undefined gooide een fout en de knop deed niets.
  // Excel in plaats van CSV: een CSV met punten als decimaalteken komt in een
  // Nederlandse Excel in één kolom terecht, of met bedragen als tekst.
  const handleExport = async () => {
    if (rows.length === 0) { toast.info('Geen financiële data om te exporteren'); return; }
    if (!kostenPerKlant) { toast.info('De kosten per klant worden nog geladen. Probeer het zo opnieuw.'); return; }
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      // De tabel Per klant is cumulatief (alle periodes), niet de periode van de
      // tegels erboven. Dat staat in de bladnaam en de bestandsnaam.
      const ws = wb.addWorksheet('Per klant (alle periodes)');
      const euro = '"€" #,##0.00;[Red]-"€" #,##0.00';
      ws.columns = [
        { header: 'Klant', key: 'klant', width: 32 },
        { header: 'Plaats', key: 'plaats', width: 18 },
        { header: 'Gefactureerd', key: 'gefactureerd', width: 16, style: { numFmt: euro } },
        { header: 'Materiaal', key: 'materiaal', width: 14, style: { numFmt: euro } },
        { header: 'Inkopen', key: 'inkopen', width: 14, style: { numFmt: euro } },
        { header: 'Uren', key: 'uren', width: 10, style: { numFmt: '0.00' } },
        { header: 'Betaald', key: 'betaald', width: 14, style: { numFmt: euro } },
        { header: 'Openstaand', key: 'openstaand', width: 14, style: { numFmt: euro } },
        { header: 'Brutowinst vóór arbeid', key: 'brutowinst', width: 22, style: { numFmt: euro } },
        { header: 'Marge (%)', key: 'marge', width: 11 },
      ];
      ws.getRow(1).font = { bold: true };
      const getal = v => Math.round((Number(v) || 0) * 100) / 100;
      const totaalOmzetExcl = rows.reduce((t, r) => t + (Number(r.omzetExcl) || 0), 0);
      rows.forEach(r => ws.addRow({
        klant: r.name, plaats: r.city || '',
        gefactureerd: getal(r.total), materiaal: getal(r.materiaal), inkopen: getal(r.inkopen),
        uren: getal(r.uren), betaald: getal(r.paid), openstaand: getal(r.openstaand),
        brutowinst: getal(r.profit), marge: r.margin,
      }));
      const totaal = ws.addRow({
        klant: 'Totaal', plaats: '',
        gefactureerd: totaalRij.total, materiaal: totaalRij.materiaal, inkopen: totaalRij.inkopen,
        uren: totaalRij.uren, betaald: totaalRij.paid, openstaand: totaalRij.openstaand,
        brutowinst: totaalRij.profit,
        marge: totaalOmzetExcl > 0 ? Math.round((totaalRij.profit / totaalOmzetExcl) * 100) : 0,
      });
      totaal.font = { bold: true };
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `BossBase-financien-per-klant-alle-periodes-${vandaagIso()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Export gedownload');
    } catch (err) {
      toast.error('Exporteren mislukt: ' + (err.message || ''));
    }
  };

  const CHART_MODES = [
    { id: 'gefactureerd', label: 'Gefactureerd' },
    { id: 'ontvangen',    label: 'Ontvangen' },
    { id: 'kosten',       label: 'Kosten' },
  ];

  const CHART_PERIODS = [
    { id: 'week',     label: 'Week' },
    { id: 'maand',    label: 'Maand' },
    { id: 'kwartaal', label: 'Kwartaal' },
    { id: 'jaar',     label: 'Jaar' },
  ];

  const CHART_PERIOD_LABELS = { week: 'afgelopen 7 dagen', maand: 'afgelopen 30 dagen', kwartaal: 'afgelopen kwartaal', jaar: 'afgelopen 12 maanden' };

  const KPI = [
    { label: `Gefactureerd ${periodeLabel}`, val: fmt(omzetPeriode), sub: 'Min creditfacturen, incl. btw',    icon: I.chart   },
    { label: 'Ontvangen',              val: fmt(ontvangenPeriode), sub: `Betaalde facturen ${periodeLabel}`,  icon: I.check   },
    { label: 'Openstaand',             val: fmt(openstaand),       sub: 'Nog niet betaald, alle periodes',    icon: I.clock,  color: '#e8784a' },
    { label: 'Te verwachten',          val: fmt(teVerwachten),     sub: 'Geaccepteerde offertes',             icon: I.quotes  },
    { label: `Kosten ${periodeLabel}`, val: fmt(kostenPeriode),    sub: `Alle kostenregels ${periodeLabel}`,  icon: I.costs   },
    // Ontvangen is incl. btw, kosten excl. btw: geen nettoresultaat of marge,
    // dus ook niet zo noemen. De te betalen btw zit er nog in.
    { label: 'Ontvangen min kosten',   val: fmt(netto),            sub: `Ontvangen incl. btw, kosten excl. btw, ${periodeLabel}`, icon: I.revenue, color: netto >= 0 ? '#15A34A' : '#dc2626' },
  ];

  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Financiën</h1><p>Financieel overzicht</p></div>
        <div className="page-hd-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          <select value={kpiPeriode} data-rl="financien-periode" onChange={e => setKpiPeriode(e.target.value)} style={{ fontSize: '.82rem' }}>
            <option value="deze-maand">Deze maand</option>
            <option value="vorige-maand">Vorige maand</option>
            <option value="dit-jaar">Dit jaar</option>
            <option value="vorig-jaar">Vorig jaar</option>
            <option value="aangepast">Aangepast…</option>
          </select>
          {kpiPeriode === 'aangepast' && (<>
            <input type="date" value={kpiVan} onChange={e => setKpiVan(e.target.value)} style={{ fontSize: '.82rem' }} />
            <input type="date" value={kpiTot} onChange={e => setKpiTot(e.target.value)} style={{ fontSize: '.82rem' }} />
          </>)}
          <button className="btn btn-s btn-sm" data-rl="financien-export" onClick={handleExport}>Exporteren</button>
        </div>
      </div>

      {/* De tegels hangen niet meer aan dit laden: die komen uit één RPC en
          staan er als eerste. Deze melding gaat alleen nog over de grafiek, de
          btw-kaart en de tabel per klant, die op de gedeelde dataset wachten. */}
      {(kpiFout || laadFoutFin) && (
        <LaadFout fout={kpiFout || laadFoutFin} titel="Financiën laden is niet gelukt" onOpnieuw={() => setOpnieuwFin(n => n + 1)} />
      )}
      {!kpi && !kpiFout && !laadFoutFin && (loading || gedeeldLaden) && <div className="card card-p">Financiën laden...</div>}

      <div className="stats-row afu2" data-rl="financien-tegels" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {KPI.map((k, i) => (
          <div key={i} className="sc">
            <div className="sc-top"><div className="sc-icon">{k.icon}</div></div>
            <div className="sc-val" style={k.color && !kpiFout ? { color: k.color } : {}}>{kpiFout ? '—' : k.val}</div>
            <div className="sc-label">{k.label}</div>
            <div className="sc-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="tw afu3" style={{ marginBottom: 20 }}>
        <div className="tw-hd" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title" style={{ flex: '1 1 auto' }}>Omzetgrafiek — {CHART_PERIOD_LABELS[chartPeriod]}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="tabs">
              {CHART_PERIODS.map(p => (
                <button key={p.id} className={`tab${chartPeriod === p.id ? ' active' : ''}`} onClick={() => setChartPeriod(p.id)}>{p.label}</button>
              ))}
            </div>
            <div className="tabs">
              {CHART_MODES.map(m => (
                <button key={m.id} className={`tab${chartMode === m.id ? ' active' : ''}`} onClick={() => setChartMode(m.id)}>{m.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 480 }}>
            <Suspense fallback={<div style={{ height: 240 }} />}>
              <FinancienGrafiek
                chartData={chartData}
                chartMode={chartMode}
                chartPeriod={chartPeriod}
                modeLabel={CHART_MODES.find(m => m.id === chartMode)?.label}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* ── BTW ─────────────────────────────────────────────────────────────
           Bewust drie regels: btw ontvangen, btw betaald, en wat dat per saldo
           betekent. De uitsplitsing per aangifterubriek (1a, 1b, 1e, 5b …) werd
           na de SnelStart-koppeling onleesbaar en is weg; de berekening zelf
           (btwIndicatieService) is ongewijzigd en levert die rubrieken nog.

           Berekend uit de eigen facturen en kosten, dus ook zonder koppeling
           bruikbaar. De uitleg is één korte tip op het icoon. De
           Moneybird-vergelijking staat alleen in beeld bij een Moneybird-
           koppeling — alleen Moneybird levert die cijfers.
           Bewust GEEN aangifteknop of -export. */}
      {btwPlan.has('btw_overzicht') && (
      <div className="tw afu3" style={{ marginBottom: 20 }}>
        <div className="tw-hd">
          <div className="f-label-rij">
            <div className="card-title">BTW</div>
            <InfoTip tekst="Indicatie uit je facturen en kosten in BossBase, geen aangifte. Factuur- of kasstelsel kies je bij Instellingen." />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="tabs">
              <button className={`tab${btwPeriodeType === 'kwartaal' ? ' active' : ''}`} onClick={() => setBtwPeriodeType('kwartaal')}>Kwartaal</button>
              <button className={`tab${btwPeriodeType === 'maand' ? ' active' : ''}`} onClick={() => setBtwPeriodeType('maand')}>Maand</button>
            </div>
            <select value={btwSelectedLabel} onChange={e => setBtwSelectedLabel(e.target.value)} aria-label="Periode">
              {generatePeriodeOpties(btwPeriodeType).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="btw-body">
          {(() => {
            const eigen = btwIndicatie;
            if (!eigen) return <div className="btw-rij" style={{ color: 'var(--dl)', borderBottom: 'none' }}>Berekenen…</div>;
            // Het saldo uit de twee getoonde bedragen, zodat wat er staat altijd
            // precies optelt. Kan een paar cent afwijken van eigen.teBetalen, die
            // vanuit de regels rekent (zie btwIndicatieService).
            const saldo = Math.round((eigen.btwOntvangen - eigen.btwBetaald) * 100) / 100;
            const soort = saldo > 0 ? 'betalen' : saldo < 0 ? 'terug' : 'nul';
            return (
              <>
                <div className="btw-rij">
                  <span>BTW ontvangen</span>
                  <span className="btw-bedrag">{fmt(eigen.btwOntvangen)}</span>
                </div>
                <div className="btw-rij">
                  <span>BTW betaald</span>
                  <span className="btw-bedrag">{fmt(eigen.btwBetaald)}</span>
                </div>
                <div className={`btw-saldo ${soort}`}>
                  <div>
                    <div className="btw-saldo-label">
                      {soort === 'betalen' ? 'Je moet betalen' : soort === 'terug' ? 'Je krijgt terug' : 'Niets te betalen of terug te krijgen'}
                    </div>
                    <div className="btw-saldo-sub">Over {btwSelectedLabel}</div>
                  </div>
                  <div className="btw-saldo-val">{fmt(Math.abs(saldo))}</div>
                </div>
                {/* Alleen met een Moneybird-koppeling: die levert de cijfers van
                    de aangifte zelf. Klein, want het is de uitzondering. */}
                {mbConnection?.connected && (() => {
                  const bh = btwPerioden.find(x => x.periode_label === btwSelectedLabel);
                  const bhSaldo = bh
                    ? (bh.btw_ontvangen_21 || 0) + (bh.btw_ontvangen_9 || 0) - (bh.btw_betaald_21 || 0) - (bh.btw_betaald_9 || 0)
                    : null;
                  return (
                    <div className="btw-let-op" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>
                        {bhSaldo != null
                          ? <>Volgens je boekhouding: {bhSaldo >= 0 ? 'te betalen' : 'terug'} {fmt(Math.abs(bhSaldo))}</>
                          : 'Nog geen cijfers uit je boekhouding voor deze periode.'}
                      </span>
                      <button className="btn btn-s btn-sm" onClick={handleSyncBtw} disabled={btwSyncing}>
                        {btwSyncing ? 'Ophalen...' : 'Ophalen uit boekhouding'}
                      </button>
                    </div>
                  );
                })()}
                {/* Geen uitleg maar een waarschuwing dat het bedrag niet compleet
                    is, dus zichtbaar en niet achter het icoon (zie Uitleg.jsx). */}
                {eigen.waarschuwingen.length > 0 && (
                  <div className="btw-let-op">
                    <AlertTriangle size={14} aria-hidden="true" />
                    <span>Let op: {eigen.waarschuwingen.join(' ')}</span>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
      )}

      <div className="tw afu3">
        <div className="tw-hd"><div className="card-title">Per klant / opdracht <span style={{ fontWeight: 400, color: 'var(--dm)', fontSize: '.8rem' }}>· alle periodes</span></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Klant</th><th>Gefactureerd</th><th>Materiaal</th><th>Inkopen</th><th>Uren</th><th>Betaald</th><th>Openstaand</th><th>Brutowinst vóór arbeid</th><th>Marge</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Av name={r.name} size="sm" idx={r.av} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.84rem' }}>{r.name}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--dl)' }}>{r.city}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmt(r.total)}</td>
                  <td style={{ color: '#dc2626', fontWeight: 600 }}>{kostenPerKlant ? fmt(r.materiaal) : '…'}</td>
                  <td style={{ color: '#dc2626', fontWeight: 600 }}>{kostenPerKlant ? fmt(r.inkopen) : '…'}</td>
                  <td style={{ color: 'var(--dl)', whiteSpace: 'nowrap' }}>{kostenPerKlant ? fmtUren(r.uren) : '…'}</td>
                  <td style={{ color: '#15A34A', fontWeight: 700 }}>{fmt(r.paid)}</td>
                  <td style={{ fontWeight: 600, color: r.openstaand > 0 ? '#e8784a' : 'var(--dl)' }}>{fmt(r.openstaand)}</td>
                  <td style={{ fontWeight: 800, color: r.profit >= 0 ? '#15A34A' : '#dc2626' }}>{fmt(r.profit)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 40, height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(0, r.margin)}%`, background: r.margin >= 30 ? '#15A34A' : r.margin >= 15 ? '#e8784a' : '#dc2626', borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: '.78rem', fontWeight: 700 }}>{r.margin}%</span>
                    </div>
                  </td>
                  <td><StatusBadge status={r.stage === 'completed' || r.stage === 'paid' ? 'completed' : 'in_progress'} /></td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--dl)', padding: 24 }}>Nog geen klantdata beschikbaar.</td></tr>
              )}
            </tbody>
            {/* De som van de rijen hierboven. Uren staan erbij als aantal: er is
                geen kostprijs per uur, dus ze tellen niet mee in de brutowinst. */}
            {rows.length > 0 && kostenPerKlant && (
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--br)' }}>
                  <td style={{ fontWeight: 700 }}>Totaal</td>
                  <td style={{ fontWeight: 700 }}>{fmt(totaalRij.total)}</td>
                  <td style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(totaalRij.materiaal)}</td>
                  <td style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(totaalRij.inkopen)}</td>
                  <td style={{ color: 'var(--dl)', whiteSpace: 'nowrap' }}>{fmtUren(totaalRij.uren)}</td>
                  <td style={{ color: '#15A34A', fontWeight: 700 }}>{fmt(totaalRij.paid)}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(totaalRij.openstaand)}</td>
                  <td style={{ fontWeight: 800, color: totaalRij.profit >= 0 ? '#15A34A' : '#dc2626' }}>{fmt(totaalRij.profit)}</td>
                  <td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}

// ── TEAM ─────────────────────────────────────────────────────
export function TeamPage() {
  return (
    <div>
      <div className="page-hd afu">
        <div><h1>Team</h1><p>Medewerkers, rollen en werklast</p></div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm">{I.plus} Medewerker uitnodigen</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="afu2">
        {TEAM_DATA.map(m => (
          <div key={m.id} className="card card-p">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <Av name={m.name} size="xl" idx={m.id - 1} />
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-.015em' }}>{m.name}</div>
                <span className={`badge ${m.role === 'Admin' ? 'b-orange' : 'b-blue'}`}>{m.role}</span>
              </div>
            </div>
            {[
              { label: 'E-mail',            val: m.email },
              { label: 'Telefoon',          val: m.phone },
              { label: 'Uren (week)',        val: m.hoursWeek + ' uur' },
              { label: 'Toegewezen jobs',   val: m.assignedJobs },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: '.84rem' }}>
                <span style={{ color: 'var(--dl)' }}>{r.label}</span>
                <span style={{ fontWeight: 600 }}>{r.val}</span>
              </div>
            ))}
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button className="btn btn-s btn-sm" style={{ flex: 1, justifyContent: 'center' }}>{I.edit} Bewerken</button>
              {m.role !== 'Admin' && <button className="btn btn-ghost btn-sm">{I.trash}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
