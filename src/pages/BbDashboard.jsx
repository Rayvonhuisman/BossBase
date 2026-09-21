import { useEffect, useMemo, useRef, useState } from 'react';
import { I, PIPELINE_STAGES, fmt, Av, ModalX, stageBadgeStyle } from '../bb-shared.jsx';
import { listDeals, listPipelineStages, updateDealStage, markDealLost, updateDeal, zetDealAfgerond } from '../services/dealService.js';
import { getLostReasons } from '../services/lostReasonService.js';
import { listActivities } from '../services/activityService.js';
import { listCustomers } from '../services/customerService.js';
import { createProject } from '../services/projectsService.js';
import { useProfile, displayName } from '../lib/profileContext.jsx';
import { useToast } from '../lib/toast.jsx';
import { ActivityEditModal, NewLeadModal } from '../components/SharedModals.jsx';
import { usePlanGuard } from '../components/PlanUpgradeModal.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { statusInfo } from '../utils/statusColors.js';
import { buildStageIndex, dealStatus, isAfgerond } from '../utils/pipeline.js';
import { getTeamMembers } from '../services/notificatieService.js';

// Subtiele prioriteit-badge voor aanvragen/deals. Normaal (med) toont niets
// om ruis in de lijst te voorkomen; Hoog = opvallend, Laag = rustig/neutraal.
// Kleur via de centrale statusColors-mapping (geen hardcoded kleuren).
function PriorityBadge({ priority, style }) {
  if (priority !== 'high' && priority !== 'low') return null;
  const s = statusInfo(priority, 'priority');
  return <span className={s.className} style={{ fontSize: '.66rem', ...style }}>{s.label}</span>;
}

// De oude DashboardHome stond hier. Vervangen door
// src/pages/dashboard/DashboardHome.jsx; deze kopie werd nergens meer
// gerenderd en is verwijderd.

// ── MOBILE PIPELINE (swipeable carousel) ─────────────────────
function MobilePipeline({ stages, dealsInStage, openDeal, moveDeal, markLost, lostStageId, setNewStage, setShowNew, customers, geenVervolg }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const tabsRef = useRef(null);

  const idx = Math.min(activeIdx, stages.length - 1);

  useEffect(() => {
    const el = tabsRef.current?.children[idx];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [idx]);

  const handleTouchStart = e => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = e => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > dy && Math.abs(dx) > 40) {
      if (dx < 0 && idx < stages.length - 1) setActiveIdx(i => i + 1);
      if (dx > 0 && idx > 0) setActiveIdx(i => i - 1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const stage = stages[idx];
  if (!stage) return null;
  const stageDeals = dealsInStage(stage.id);
  const stageTotal = stageDeals.reduce((s, d) => s + d.value, 0);

  return (
    <div className="pipe-mob afu2">
      {/* ── Stage tab pills ── */}
      <div className="pipe-mob-tabs" ref={tabsRef}>
        {stages.map((s, i) => {
          const cnt = dealsInStage(s.id).length;
          return (
            <button key={s.id} className={`pipe-mob-tab${i === idx ? ' active' : ''}`} onClick={() => setActiveIdx(i)}>
              {s.label}
              {cnt > 0 && <span className="pipe-mob-tab-cnt">{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Swipeable stage panel ── */}
      <div className="pipe-mob-panel" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Header */}
        <div className="pipe-mob-stage-hd">
          <div>
            <span className="badge" style={stageBadgeStyle(stage.col)}>{stage.label}</span>
            <div className="pipe-mob-stage-meta">
              {stageDeals.length} {stageDeals.length === 1 ? 'lead' : 'leads'}
              {stageTotal > 0 && ` · ${fmt(stageTotal)}`}
            </div>
          </div>
          <div className="pipe-mob-nav">
            <button className="pipe-mob-arrow" disabled={idx === 0} onClick={() => setActiveIdx(i => i - 1)}>‹</button>
            <span className="pipe-mob-pos">{idx + 1} / {stages.length}</span>
            <button className="pipe-mob-arrow" disabled={idx === stages.length - 1} onClick={() => setActiveIdx(i => i + 1)}>›</button>
          </div>
        </div>

        {/* Dots indicator */}
        <div className="pipe-mob-dots">
          {stages.map((_, i) => (
            <span key={i} className={`pipe-mob-dot${i === idx ? ' active' : ''}`} onClick={() => setActiveIdx(i)} />
          ))}
        </div>

        {/* Deal cards */}
        <div className="pipe-mob-cards">
          {stageDeals.length === 0 && (
            <div className="pipe-mob-empty">
              <div>Geen leads in deze fase</div>
              {/* setShowNew komt niet binnen zonder 'verkoop' — zelfde patroon
                  als markLost hieronder. */}
              {setShowNew && (
                <button className="btn btn-p btn-sm" style={{ marginTop: 14 }}
                  onClick={() => { setNewStage(stage.id); setShowNew(true); }}>
                  {I.plus} Lead toevoegen
                </button>
              )}
            </div>
          )}
          {stageDeals.map(deal => {
            const cust = customers?.find(c => c.id === deal.custId);
            return (
              <div key={deal.id} className="pipe-mob-card" style={{ cursor: 'pointer', position: 'relative' }} onClick={() => openDeal(deal.id)}>
                {stage.id !== lostStageId && markLost && (
                  <button
                    className="btn-icon pc-menu-btn"
                    title="Markeer als verloren"
                    aria-label="Markeer als verloren"
                    onClick={e => { e.stopPropagation(); markLost(deal); }}
                  >{I.flag}</button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingRight: 20 }}>
                  {geenVervolg?.(deal) && (
                    <span
                      title="Geen vervolgactiviteit gepland"
                      aria-label="Geen vervolgactiviteit gepland"
                      style={{ width: 7, height: 7, borderRadius: '50%', background: '#e8784a', flexShrink: 0 }}
                    />
                  )}
                  <span style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--dk)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {deal.customerName || 'Klant'}
                  </span>
                </div>
                {deal.title && (
                  <div style={{ fontSize: '.78rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {deal.title}
                  </div>
                )}
                {cust?.email && (
                  <div style={{ fontSize: '.73rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cust.email}
                  </div>
                )}
                {cust?.phone && (
                  <div style={{ fontSize: '.73rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cust.phone}
                  </div>
                )}
                {deal.value > 0 && (
                  <div style={{ marginTop: 6, fontSize: '.82rem', fontWeight: 700, color: '#0F7A3F' }}>
                    {fmt(deal.value)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add lead to this stage */}
        {setShowNew && (
          <button className="pipe-mob-add" onClick={() => { setNewStage(stage.id); setShowNew(true); }}>
            {I.plus} Lead toevoegen aan {stage.label}
          </button>
        )}
      </div>

    </div>
  );
}

// ── MAAK PROJECT MODAL ───────────────────────────────────────
function MaakProjectModal({ deal, customers, onClose, setPage }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: deal.title || '',
    customer_id: deal.custId || '',
    project_value: deal.value || 0,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Projectnaam is verplicht'); return; }
    setSaving(true);
    try {
      const created = await createProject({
        name: form.name.trim(),
        customer_id: form.customer_id || null,
        deal_id: deal.id,
        project_value: Number(form.project_value || 0),
      });
      toast.success('Project aangemaakt');
      onClose();
      setPage?.('projecten', { id: created.id });
    } catch (e) {
      toast.error(e.message || 'Aanmaken mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Project aanmaken</div>
            <div className="modal-sub">{deal.customerName} — {deal.title}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Projectnaam *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          </div>
          <div className="f s2">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Geen —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Projectwaarde (€)</label>
            <input type="number" min="0" step="0.01" value={form.project_value} onChange={e => set('project_value', e.target.value)} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving || !form.name.trim()}>
            {saving ? 'Aanmaken...' : 'Project aanmaken'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PIPELINE ─────────────────────────────────────────────────
export function Pipeline({ openDeal, setPage }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const { guardSchrijven, planModal } = usePlanGuard();
  // guardSchrijven kijkt alleen naar plan.readonly — dat is een abonnements-
  // wachter, geen rechtenwachter. Sinds de gedeelde werkruimte kan een
  // medewerker zónder 'verkoop' deze pagina openen (can('verkoop') geeft daar
  // true voor inzage), en dan stonden hier knoppen die de database stil
  // weigert: deals_insert en deals_update eisen nog altijd dat recht.
  //
  // Zien mag, wijzigen niet. Dit dekt aanmaken, slepen, prioriteit en
  // verloren markeren.
  const { magBewerken } = usePermissions();
  const magDealsBeheren = magBewerken('verkoop');
  const [deals, setDeals] = useState([]);
  const [stages, setStages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showLostModal, setShowLostModal] = useState(false);
  const [lostDeal, setLostDeal] = useState(null);
  const [lostReason, setLostReason] = useState('');
  const [lostNote, setLostNote] = useState('');
  const [lostSaving, setLostSaving] = useState(false);
  const [lostReasons, setLostReasons] = useState([]);
  const [cardMenu, setCardMenu] = useState(null); // { dealId, x, y } — open kaart-menu

  const [showFilter, setShowFilter] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState({ stage: 'all', status: 'open', priority: 'all', text: '', persoon: 'all' });

  const [showNew, setShowNew] = useState(false);
  const [newStage, setNewStage] = useState(null);
  const [maakProjectDeal, setMaakProjectDeal] = useState(null);
  const [hideLost, setHideLost] = useState(() => localStorage.getItem('pipeline_hide_lost') === 'true');

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 767);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 767);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Sluit het kaart-menu bij scrollen/resizen — de fixed positie zou anders
  // los van de knop komen te zweven.
  useEffect(() => {
    if (!cardMenu) return;
    const close = () => setCardMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [cardMenu]);

  // "03 — Ghost" scroll control (from the Scrollbar Designs handoff): a thin
  // rail + proportional thumb that is dormant (track hidden, thumb ~35%) and
  // fades to full presence on hover. Native scrollbar hidden; pointer-drag the
  // thumb/track to scrub. Trackpad/mouse/touch scroll still works everywhere.
  const pipeWrapRef = useRef(null);
  const trackRef = useRef(null);
  const rafRef = useRef(0);
  const [pipeScrollable, setPipeScrollable] = useState(false);
  const [scrollPct, setScrollPct] = useState(0); // 0..1
  const [thumbPct, setThumbPct] = useState(0.2); // visible/total ratio
  const [ghostHover, setGhostHover] = useState(false);

  const syncPipeScroll = () => {
    if (rafRef.current) return; // coalesce — no setState spam per pixel
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = pipeWrapRef.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      setPipeScrollable(max > 4);
      setScrollPct(max > 0 ? el.scrollLeft / max : 0);
      setThumbPct(el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1);
    });
  };
  const scrubToPct = (pct, smooth) => {
    const el = pipeWrapRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: Math.max(0, Math.min(1, pct)) * max, behavior: smooth ? 'smooth' : 'auto' });
  };
  // Pointer maps to the thumb CENTRE so the rail tracks the cursor naturally.
  const onTrackPointerDown = e => {
    const r = trackRef.current.getBoundingClientRect();
    const tw = Math.max(thumbPct, 0.08);
    const pctFromX = cx => {
      const raw = (cx - r.left) / r.width; // 0..1 across the rail
      return (raw - tw / 2) / (1 - tw);     // account for thumb width
    };
    scrubToPct(pctFromX(e.clientX), false);
    const move = ev => scrubToPct(pctFromX(ev.clientX), false);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const nudgePipe = dx => pipeWrapRef.current?.scrollBy({ left: dx, behavior: 'smooth' });

  // Verloren-redenen komen uit de company-scoped lijst (Instellingen → Pipeline).
  // Fallback als een bedrijf de lijst leeg heeft gemaakt, zodat de modal nooit
  // zonder keuzes staat.
  const LOST_REASONS_FALLBACK = ['Te duur', 'Gekozen voor concurrent', 'Geen reactie', 'Timing niet goed', 'Anders'];
  const lostReasonOptions = lostReasons.length ? lostReasons.map(r => r.label) : LOST_REASONS_FALLBACK;

  const reload = () => {
    setLoading(true);
    Promise.all([
      listDeals(), listPipelineStages(), listCustomers(),
      getLostReasons().catch(() => []),
      getTeamMembers().catch(() => []),
      listActivities().catch(() => []),
    ])
      .then(([dealData, stageData, customerData, reasonData, teamData, activityData]) => {
        setDeals(dealData);
        setStages(stageData.length ? stageData : PIPELINE_STAGES);
        setCustomers(customerData);
        setLostReasons(reasonData);
        setTeamMembers(teamData);
        setActivities(activityData);
        setError('');
      })
      .catch(err => setError(err.message || 'Pipeline laden is mislukt.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [refreshKey]);

  const stageIndex = useMemo(() => buildStageIndex(stages), [stages]);

  // Het statusfilter vergeleek d.stage met slugs ('lost', 'completed',
  // 'approved', 'in_progress', …) terwijl d.stage een uuid is. Geen van die
  // regels matchte ooit, dus het filter deed niets: "Open trajecten" toonde
  // alle 110 deals inclusief verloren en betaald, en Gewonnen, Verloren en
  // Afgerond gaven een leeg bord. Nu op deals.status, net als het dashboard.
  const filteredDeals = useMemo(() => {
    const text = filter.text.trim().toLowerCase();
    return deals.filter(d => {
      const st = dealStatus(d, stageIndex);
      // Een afgeronde aanvraag is van het bord af: dat is de hele reden dat
      // afronden bestaat. Te zien via het filter Afgerond, en op de klantkaart.
      if (isAfgerond(d) !== (filter.status === 'done')) return false;
      if (filter.stage !== 'all' && d.stage !== filter.stage) return false;
      if (filter.priority !== 'all' && d.priority !== filter.priority) return false;
      // Behandeld door: de aanvraag kan aan meerdere mensen hangen.
      if (filter.persoon !== 'all' && !(d.assignedToIds || []).includes(filter.persoon)) return false;
      // "Open trajecten" betekent LOPEND: alles behalve verloren (afgerond is
      // een regel hierboven al van het bord). Bewust niet strikt status='open'.
      //
      // Het bord toont de hele klus, van Nieuwe aanvraag tot Betaald/Gesloten.
      // Kolommen als Gepland, In uitvoering en Betaald/Gesloten kunnen alleen
      // gewonnen werk bevatten, dus een filter op status='open' haalde precies
      // die kolommen leeg — het bord sprak zichzelf tegen. Bij een bedrijf dat
      // zijn verkoop rond heeft bleef er niets over: Dakdekker Niels had 14
      // aanvragen, 12 gewonnen, 1 verloren, 1 afgerond, en dus een leeg bord
      // terwijl er tien klussen in uitvoering waren. Tot 5b45879 viel dat niet
      // op omdat het statusfilter stage-uuid's met tekstslugs vergeleek en
      // daardoor nooit iets deed.
      if (filter.status === 'open' && st === 'lost') return false;
      if (filter.status === 'won'  && st !== 'won') return false;
      if (filter.status === 'lost' && st !== 'lost') return false;
      // 'done' hoeft hier niets meer te toetsen: afgerond is een eigen veld,
      // hierboven al afgehandeld. Het stond eerder op de fasenaam ("Afgerond",
      // "Betaald"), en bedrijven die hun fasen anders noemen hadden dus niets.
      if (text) {
        const hay = `${d.title || ''} ${d.customerName || ''} ${d.city || ''}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
  }, [deals, filter, stageIndex]);

  // Show every stage as a column — the board scrolls horizontally so all
  // fases stay reachable (previously capped at 8, hiding later stages).
  //
  // Eén uitzondering: "Afgerond". Afronden is sinds migratie 20260920100000 een
  // eigen kenmerk van de aanvraag (afgerond_op) en geen fase meer. De kolom was
  // daardoor een dubbelganger: een aanvraag kon erin staan zonder afgerond te
  // zijn, en een afgeronde aanvraag stond er juist niet in. De fase zelf blijft
  // bestaan, zodat van oudere aanvragen te zien blijft waar ze stonden.
  const afgerondStageId = stages.find(s => /afgerond/i.test(s.label || ''))?.id;
  // Bij het filter "Afgerond" komt die kolom wél terug, net als Verloren: ook
  // die is verborgen tot je hem opvraagt. Zonder dit belandde een afgeronde
  // aanvraag in de eerste kolom ("Nieuwe aanvraag"), omdat zijn eigen fase geen
  // kolom meer heeft — dat leest als het tegenovergestelde van wat er speelt.
  // Ook als je in de fase-keuzelijst bewust "Afgerond" kiest: die lijst toont
  // alle fasen van het bedrijf, dus zonder dit hield visibleStages niets over
  // en keek je naar een leeg bord zonder uitleg.
  const toonAfgerondKolom = filter.status === 'done' || filter.stage === afgerondStageId;
  const SHOWN_STAGE_IDS = stages
    .filter(s => s.id !== afgerondStageId || toonAfgerondKolom)
    .map(s => s.id);
  const lostStageId = (stages.find(s => /verlor/i.test(s.label || '')) || stages.find(s => /\blost\b/i.test(s.label || '')))?.id;
  const toggleHideLost = () => setHideLost(v => {
    const next = !v;
    localStorage.setItem('pipeline_hide_lost', String(next));
    return next;
  });
  const visibleStages = (filter.stage === 'all'
    ? SHOWN_STAGE_IDS
    : SHOWN_STAGE_IDS.filter(id => id === filter.stage)
  );

  // Deals whose stage_id is NULL or points to a stage that no longer exists
  // must not silently disappear — funnel them into the first column so they
  // stay visible and can be dragged to a real stage.
  // Bewust de GETOONDE fasen en niet alle fasen: een aanvraag in een fase
  // zonder kolom ("Afgerond") zou anders nergens staan en dus onvindbaar zijn.
  // Zo komt hij in de eerste kolom terecht en kun je hem verslepen.
  const stageIdSet = new Set(SHOWN_STAGE_IDS);
  const firstStageId = SHOWN_STAGE_IDS[0];
  const dealsInStage = stageId => filteredDeals.filter(d => {
    if (d.stage === stageId) return true;
    if (stageId === firstStageId && (!d.stage || !stageIdSet.has(d.stage))) return true;
    return false;
  });

  // Staat er nog iets gepland voor deze deal? Een activiteit die al over datum
  // is telt niet mee: juist dan wil je de waarschuwing zien. 'open' = datum in
  // de toekomst, 'today' = vandaag; 'overdue' en 'completed' vallen af.
  const dealsMetVervolg = useMemo(() => {
    const set = new Set();
    activities.forEach(a => {
      if (a.status !== 'open' && a.status !== 'today') return;
      if (a.dealId) set.add(`d:${a.dealId}`);
      if (a.custId) set.add(`k:${a.custId}`);
    });
    return set;
  }, [activities]);
  const geenVervolg = deal =>
    !dealsMetVervolg.has(`d:${deal.id}`) && !dealsMetVervolg.has(`k:${deal.custId}`);

  const totalShown = filteredDeals.length;
  // Ook hier stond een slugvergelijking (d.stage !== 'lost'), waardoor verloren
  // werk gewoon meetelde in het totaal boven het bord.
  //
  // Verloren werk telt niet mee in de waarde van de pipeline — tenzij je er
  // expliciet op filtert, want dan is het juist het onderwerp. Zonder die
  // uitzondering zei de kop "11 trajecten · € 0,00 totaal".
  const totalValue = filteredDeals
    .filter(d => filter.status === 'lost' || dealStatus(d, stageIndex) !== 'lost')
    .reduce((s, d) => s + d.value, 0);

  // deals.stage_id is a UUID column — resolve the real "Verloren" stage object
  // for use in confirmLost (lostStageId is already derived above for filtering).
  const lostStage = stages.find(s => s.id === lostStageId);

  const closeLostModal = () => {
    setShowLostModal(false); setLostDeal(null); setLostReason(''); setLostNote('');
  };
  // Open het kaart-menu (⋮). Positie wordt vast (fixed) berekend uit de knop,
  // zodat het niet wordt afgekapt door de horizontale scroll van het bord.
  const openCardMenu = (e, deal) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCardMenu(cur => cur?.dealId === deal.id ? null : { dealId: deal.id, x: r.right, y: r.bottom + 4 });
  };
  const markLost = deal => { setCardMenu(null); setLostReason(''); setLostNote(''); setLostDeal(deal); setShowLostModal(true); };
  // Afronden haalt de aanvraag van het bord; op de klantkaart blijft hij staan
  // met de status Afgerond, en daar kun je hem ook weer heropenen. Fase en
  // status blijven wat ze waren: afgerond zegt alleen dat deze aanvraag klaar
  // is, niet hoe hij afliep.
  const markAfgerond = async deal => {
    setCardMenu(null);
    try {
      const updated = await zetDealAfgerond(deal.id, true);
      setDeals(ds => ds.map(d => d.id === deal.id ? updated : d));
      toast.success('Aanvraag afgerond');
    } catch (err) {
      console.error('[bb:pipeline] aanvraag afronden mislukt', err);
      toast.error(err.message || 'Afronden mislukt');
    }
  };
  const setDealPriority = async (deal, priority) => {
    setCardMenu(null);
    if ((deal.priority || 'med') === priority) return;
    try {
      const updated = await updateDeal(deal.id, { priority });
      setDeals(ds => ds.map(d => d.id === deal.id ? updated : d));
      toast.success('Prioriteit bijgewerkt');
    } catch (err) {
      console.error('[bb:pipeline] prioriteit wijzigen mislukt', err);
      toast.error(err.message || 'Prioriteit bijwerken mislukt');
    }
  };
  const confirmLost = async () => {
    if (!lostStage) {
      toast.error('Geen "Verloren"-fase gevonden in de pipeline');
      closeLostModal();
      return;
    }
    if (!lostReason) { toast.error('Kies een reden'); return; }
    setLostSaving(true);
    try {
      const updated = await markDealLost(lostDeal.id, lostStage.id, lostReason, lostNote);
      setDeals(ds => ds.map(d => d.id === lostDeal.id ? updated : d));
      toast.success('Lead gemarkeerd als verloren');
      closeLostModal();
    } catch (err) {
      console.error('[bb:pipeline] markeer verloren mislukt', err);
      toast.error(err.message || 'Status bijwerken mislukt');
    } finally {
      setLostSaving(false);
    }
  };
  const moveDeal = async (deal, stageId) => {
    try {
      const updated = await updateDealStage(deal.id, stageId);
      setDeals(ds => ds.map(d => d.id === deal.id ? updated : d));
    } catch (err) {
      console.error('[bb:pipeline] deal verplaatsen mislukt', err);
      toast.error(err.message || 'Verplaatsen mislukt');
    }
  };

  // ── Drag & drop (native HTML5, no library) ───────────────────────────────
  // The browser suppresses the click that follows a real drag, so plain
  // clicks on a card (open deal/customer) keep working while a drag moves it.
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const dragDealRef = useRef(null);

  const onCardDragStart = (e, deal) => {
    // Don't hijack drags that start on the inline controls (stage select,
    // open/lost icon buttons) — those must stay clickable.
    if (e.target.closest('button, select, input, a, .btn-icon')) {
      e.preventDefault();
      return;
    }
    dragDealRef.current = deal;
    setDraggingId(deal.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', deal.id); } catch { /* Safari */ }
  };
  const onCardDragEnd = () => {
    dragDealRef.current = null;
    setDraggingId(null);
    setDragOverStage(null);
  };
  const onColDragOver = (e, stageId) => {
    if (!dragDealRef.current) return;
    e.preventDefault(); // required so onDrop can fire
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) setDragOverStage(stageId);
  };
  const onColDragLeave = (e, stageId) => {
    // Ignore leave events caused by moving onto a child element.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverStage(s => (s === stageId ? null : s));
  };
  const onColDrop = async (e, targetStageId) => {
    e.preventDefault();
    const deal = dragDealRef.current;
    dragDealRef.current = null;
    setDraggingId(null);
    setDragOverStage(null);
    if (!deal || !targetStageId) return;
    if (deal.stage === targetStageId) return; // dropped in same stage → no-op
    // Naar de "Verloren"-fase slepen vraagt óók om een reden — open dezelfde
    // modal i.p.v. de deal stil te verplaatsen.
    if (targetStageId === lostStageId) { markLost(deal); return; }
    const prevStage = deal.stage;
    // Optimistic: move the card immediately, reconcile/rollback after the API.
    setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: targetStageId } : d));
    try {
      const updated = await updateDealStage(deal.id, targetStageId);
      setDeals(ds => ds.map(d => d.id === deal.id ? updated : d));
    } catch (err) {
      console.error('[bb:pipeline] drag-verplaatsen mislukt', err);
      toast.error(err.message || 'Verplaatsen mislukt');
      setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: prevStage } : d));
    }
  };

  const resetFilter = () => setFilter({ stage: 'all', status: 'open', priority: 'all', text: '', persoon: 'all' });
  const filterActive = filter.stage !== 'all' || filter.status !== 'open' || filter.priority !== 'all' || filter.text || filter.persoon !== 'all';

  const onSaved = () => {
    bumpRefresh?.();
    reload();
  };

  // Re-measure the scroll range whenever the rendered board can change.
  useEffect(() => {
    const id = requestAnimationFrame(syncPipeScroll);
    window.addEventListener('resize', syncPipeScroll);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', syncPipeScroll); };
  }, [deals, stages, filter, isMobile, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ height: '100%' }}>
      <div className="page-hd afu">
        <div>
          <h1>Pipeline</h1>
          <p>{totalShown} {totalShown === 1 ? 'traject' : 'trajecten'} · {fmt(totalValue)} totaal</p>
        </div>
        <div className="page-hd-actions">
          <button className={`btn btn-s btn-sm${showFilter ? ' active' : ''}`} onClick={() => setShowFilter(s => !s)}>
            {I.flag} Filter{filterActive ? ' (actief)' : ''}
          </button>
          {magDealsBeheren && (
            <button className="btn btn-p btn-sm" onClick={guardSchrijven('Een aanvraag toevoegen', () => { setNewStage(null); setShowNew(true); })}>{I.plus} Nieuwe aanvraag</button>
          )}
        </div>
      </div>

      {showFilter && (
        <div className="pipe-filter afu2">
          <div className="pf-group">
            <label>Pipeline fase</label>
            <select value={filter.stage} onChange={e => setFilter(f => ({ ...f, stage: e.target.value }))}>
              <option value="all">Alle fases</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="pf-group">
            <label>Status</label>
            <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
              <option value="open">Open trajecten</option>
              <option value="won">Gewonnen</option>
              <option value="done">Afgerond</option>
              <option value="lost">Verloren</option>
              <option value="any">Alles tonen</option>
            </select>
          </div>
          <div className="pf-group">
            <label>Behandeld door</label>
            <select value={filter.persoon} onChange={e => setFilter(f => ({ ...f, persoon: e.target.value }))}>
              <option value="all">Iedereen</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.fullName || m.email || 'Teamlid'}</option>
              ))}
            </select>
          </div>
          <div className="pf-group">
            <label>Prioriteit</label>
            <select value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}>
              <option value="all">Alle</option>
              <option value="high">Hoog</option>
              <option value="med">Normaal</option>
              <option value="low">Laag</option>
            </select>
          </div>
          <div className="pf-group" style={{ minWidth: 200, flex: 1 }}>
            <label>Zoeken (titel / klant / plaats)</label>
            <input value={filter.text} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} placeholder="bv. badkamer, Jansen..." />
          </div>
          <div className="pf-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={resetFilter}>Reset filters</button>
        </div>
      )}

      {loading && <div className="card card-p">Pipeline laden...</div>}
      {error && <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>}

      {!loading && !error && totalShown === 0 && (
        <div className="pipe-empty afu3">
          <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--dk)' }}>Geen trajecten gevonden</div>
          <div style={{ fontSize: '.86rem', marginBottom: 14 }}>
            {filterActive ? 'Pas je filter aan of voeg een nieuwe aanvraag toe.' : 'Begin met je eerste aanvraag.'}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {filterActive && <button className="btn btn-s btn-sm" onClick={resetFilter}>Reset filter</button>}
            {magDealsBeheren && (
              <button className="btn btn-p btn-sm" onClick={guardSchrijven('Een aanvraag toevoegen', () => { setNewStage(null); setShowNew(true); })}>{I.plus} Nieuwe aanvraag</button>
            )}
          </div>
        </div>
      )}

      {!loading && !error && totalShown > 0 && isMobile && (
        <MobilePipeline
          stages={stages.filter(s => SHOWN_STAGE_IDS.includes(s.id) && (filter.stage === 'all' || s.id === filter.stage))}
          dealsInStage={dealsInStage}
          geenVervolg={geenVervolg}
          openDeal={openDeal}
          moveDeal={magDealsBeheren ? moveDeal : null}
          markLost={magDealsBeheren ? markLost : null}
          lostStageId={lostStageId}
          setNewStage={setNewStage}
          setShowNew={magDealsBeheren ? guardSchrijven('Een lead toevoegen', setShowNew) : null}
          customers={customers}
        />
      )}

      {!loading && !error && totalShown > 0 && !isMobile && (
        <div
          className={`pipe-ghost-zone${ghostHover ? ' is-hover' : ''}`}
          onMouseEnter={() => setGhostHover(true)}
          onMouseLeave={() => setGhostHover(false)}
        >
        {pipeScrollable && (
          <div className="pipe-ghost afu2">
            <div
              ref={trackRef}
              className="pipe-ghost-track"
              onPointerDown={onTrackPointerDown}
              role="scrollbar"
              aria-orientation="horizontal"
              aria-label="Pipeline horizontaal scrollen"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(scrollPct * 100)}
              tabIndex={0}
              onFocus={() => setGhostHover(true)}
              onBlur={() => setGhostHover(false)}
              onKeyDown={e => {
                if (e.key === 'ArrowRight') { e.preventDefault(); nudgePipe(320); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); nudgePipe(-320); }
                else if (e.key === 'Home') { e.preventDefault(); scrubToPct(0, true); }
                else if (e.key === 'End') { e.preventDefault(); scrubToPct(1, true); }
              }}
            >
              <div
                className="pipe-ghost-thumb"
                style={{
                  width: `${Math.max(thumbPct * 100, 8)}%`,
                  left: `${scrollPct * (100 - Math.max(thumbPct * 100, 8))}%`,
                }}
              />
            </div>
          </div>
        )}
        <div className="pipe-wrap afu2" ref={pipeWrapRef} onScroll={syncPipeScroll}>
        <div className="pipe-board">
        {visibleStages.map(stageId => {
          const stage = stages.find(s => s.id === stageId) || PIPELINE_STAGES.find(s => s.id === stageId) || { id: stageId, label: stageId, col: 'b-gray' };
          const stageDeals = dealsInStage(stageId);
          if (hideLost && stageId === lostStageId) {
            return (
              <div key={stageId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', width: 36, minWidth: 36, flexShrink: 0, paddingTop: 10, cursor: 'pointer', opacity: 0.5 }}
                title="Verloren tonen"
                onClick={toggleHideLost}>
                {I.eye_off}
                <span style={{ writingMode: 'vertical-rl', fontSize: '.7rem', color: 'var(--dl)', marginTop: 8, letterSpacing: 1 }}>Verloren</span>
              </div>
            );
          }
          return (
            <div key={stageId}
              className={`pipe-col${dragOverStage === stageId ? ' pipe-col-drop' : ''}`}
              onDragOver={magDealsBeheren ? (e => onColDragOver(e, stageId)) : undefined}
              onDragLeave={magDealsBeheren ? (e => onColDragLeave(e, stageId)) : undefined}
              onDrop={magDealsBeheren ? (e => onColDrop(e, stageId)) : undefined}>
              <div className="pipe-col-hd">
                <div>
                  <span className="badge" style={{ ...stageBadgeStyle(stage.col), marginBottom: 2 }}>{stage.label}</span>
                  <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginTop: 3 }}>
                    {fmt(stageDeals.reduce((s, d) => s + d.value, 0))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pipe-col-cnt">{stageDeals.length}</span>
                  {stageId === lostStageId && (
                    <button
                      className="btn-icon"
                      style={{ opacity: 0.5, lineHeight: 1 }}
                      title="Verloren kolom verbergen"
                      onClick={e => { e.stopPropagation(); toggleHideLost(); }}
                    >{I.eye}</button>
                  )}
                </div>
              </div>
              <div className="pipe-cards">
                {stageDeals.map(deal => {
                  const cust = customers.find(c => c.id === deal.custId);
                  return (
                    <div key={deal.id}
                      className={`pc${draggingId === deal.id ? ' pc-dragging' : ''}`}
                      style={{ cursor: 'pointer', position: 'relative' }}
                      draggable={magDealsBeheren}
                      onDragStart={magDealsBeheren ? (e => onCardDragStart(e, deal)) : undefined}
                      onDragEnd={magDealsBeheren ? onCardDragEnd : undefined}
                      onClick={() => openDeal(deal.id)}>
                      {/* Het ⋮-menu bevat prioriteit (updateDeal) en "markeer
                          als verloren" (markDealLost). Beide vragen 'verkoop',
                          dus één toets op de opener dekt ze allebei. */}
                      {deal.stage !== lostStageId && magDealsBeheren && (
                        <button
                          className="btn-icon pc-menu-btn"
                          title="Meer acties"
                          aria-label="Meer acties"
                          onClick={e => { e.stopPropagation(); openCardMenu(e, deal); }}
                        >{I.meer}</button>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingRight: 20 }}>
                        {geenVervolg(deal) && (
                          <span
                            title="Geen vervolgactiviteit gepland"
                            aria-label="Geen vervolgactiviteit gepland"
                            style={{ width: 7, height: 7, borderRadius: '50%', background: '#e8784a', flexShrink: 0 }}
                          />
                        )}
                        <span style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--dk)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {deal.customerName || 'Klant'}
                        </span>
                      </div>
                      {deal.title && (
                        <div style={{ fontSize: '.78rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                          {deal.title}
                        </div>
                      )}
                      {cust?.email && (
                        <div style={{ fontSize: '.73rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cust.email}
                        </div>
                      )}
                      {cust?.phone && (
                        <div style={{ fontSize: '.73rem', color: 'var(--dl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cust.phone}
                        </div>
                      )}
                      {(deal.value > 0 || deal.priority === 'high' || deal.priority === 'low') && (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {deal.value > 0 && (
                            <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#0F7A3F' }}>{fmt(deal.value)}</span>
                          )}
                          <PriorityBadge priority={deal.priority} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {stageDeals.length === 0 && (
                  <div style={{ fontSize: '.74rem', color: 'var(--dl)', textAlign: 'center', padding: '12px 6px' }}>Geen items</div>
                )}
              </div>
              {magDealsBeheren && (
                <button className="pipe-add" onClick={guardSchrijven('Een lead toevoegen', () => { setNewStage(stageId); setShowNew(true); })}>{I.plus} Lead toevoegen</button>
              )}
            </div>
          );
        })}
        </div>
        </div>
        </div>
      )}

      {cardMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 60 }}
            onClick={() => setCardMenu(null)}
          />
          <div
            className="card-menu"
            style={{ position: 'fixed', top: cardMenu.y, left: cardMenu.x, transform: 'translateX(-100%)', zIndex: 61 }}
          >
            {(() => {
              const menuDeal = deals.find(x => x.id === cardMenu.dealId);
              const curPrio = menuDeal?.priority || 'med';
              return (
                <>
                  <div className="card-menu-label">Prioriteit</div>
                  {[['high', 'Hoog'], ['med', 'Normaal'], ['low', 'Laag']].map(([val, label]) => (
                    <button
                      key={val}
                      className="card-menu-item"
                      onClick={() => menuDeal && setDealPriority(menuDeal, val)}
                    >
                      {val === 'med'
                        ? <span style={{ fontSize: '.72rem', color: 'var(--dl)' }}>Normaal</span>
                        : <PriorityBadge priority={val} />}
                      {curPrio === val && <span style={{ marginLeft: 'auto', display: 'flex', color: 'var(--p)' }}>{I.check}</span>}
                    </button>
                  ))}
                  <div className="card-menu-sep" />
                  <button
                    className="card-menu-item"
                    onClick={() => menuDeal && markAfgerond(menuDeal)}
                  >
                    {I.check} Markeer als afgerond
                  </button>
                  <button
                    className="card-menu-item card-menu-item-danger"
                    onClick={() => menuDeal && markLost(menuDeal)}
                  >
                    {I.flag} Markeer als verloren
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {showLostModal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && closeLostModal()}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-hd">
              <div>
                <div className="modal-title">Markeer als verloren</div>
                <div className="modal-sub">{lostDeal?.customerName || 'Klant'}{lostDeal?.title ? ` — ${lostDeal.title}` : ''}</div>
              </div>
              <ModalX onClose={closeLostModal} />
            </div>
            <div className="f" style={{ marginBottom: 14 }}>
              <label>Reden van verlies</label>
              <select value={lostReason} onChange={e => setLostReason(e.target.value)}>
                <option value="">Kies een reden...</option>
                {lostReasonOptions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="f">
              <label>Toelichting (optioneel)</label>
              <textarea value={lostNote} onChange={e => setLostNote(e.target.value)} placeholder="Eventuele extra informatie..." style={{ height: 60 }} />
            </div>
            <div className="fa">
              <button className="btn btn-s" onClick={closeLostModal}>Annuleren</button>
              <button className="btn btn-danger" onClick={confirmLost} disabled={lostSaving || !lostReason}>
                {lostSaving ? 'Bezig...' : 'Markeer verloren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <NewLeadModal
          onClose={() => setShowNew(false)}
          customers={customers}
          stages={stages}
          defaultStage={newStage || ''}
          onSaved={onSaved}
        />
      )}
      {maakProjectDeal && (
        <MaakProjectModal
          deal={maakProjectDeal}
          customers={customers}
          onClose={() => setMaakProjectDeal(null)}
          setPage={setPage}
        />
      )}

      {planModal}
    </div>
  );
}
