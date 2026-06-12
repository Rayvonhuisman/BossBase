import { useEffect, useRef, useState } from 'react';
import MarketingShell from './MarketingShell.jsx';

/* ── Scroll-driven groene lijn — tekent zich progressief uit terwijl
   je scrolt. Gebruikt stroke-dasharray/-offset met pathLength="1" zodat
   het animatiebereik altijd 0→1 is, ongeacht schaalgrootte of viewport. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = e => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function ScrollLine() {
  const reduced = useReducedMotion();
  const pathRef = useRef(null);

  useEffect(() => {
    if (reduced) return;
    const path = pathRef.current;
    if (!path) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      path.style.strokeDashoffset = String(1 - p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div className="mkt-scroll-line" aria-hidden="true">
      <svg
        width="100%" height="100%"
        viewBox="0 0 1000 10000"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          ref={pathRef}
          d="M 620 0 C 620 620, 180 900, 180 1620 C 180 2340, 820 2560, 820 3320 C 820 4120, 160 4320, 160 5120 C 160 5920, 840 6120, 840 6920 C 840 7720, 200 7920, 200 8720 C 200 9340, 600 9520, 600 10000"
          pathLength="1"
          fill="none"
          stroke="#1DDB62"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          style={{
            opacity: reduced ? 0.15 : 0.35,
            strokeDasharray: reduced ? 'none' : '1',
            strokeDashoffset: reduced ? '0' : '1',
            filter: 'drop-shadow(0 0 6px rgba(29,219,98,0.4))',
          }}
        />
      </svg>
    </div>
  );
}

/* ── Inline duotone icons (kept here to avoid pulling lucide-react and
   keep the marketing CSS truly scoped). All use currentColor where it
   matters so they pick up the green or paper depending on context. */
const Icon = {
  inbox: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M22 12h-6l-2 3h-4l-2-3H2"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>
    </svg>
  ),
  pipe: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="5" height="12" rx="1.5" fill="currentColor" opacity=".4"/>
      <rect x="9.5" y="6" width="5" height="9" rx="1.5" fill="currentColor" opacity=".7"/>
      <rect x="17" y="6" width="5" height="6" rx="1.5" fill="currentColor"/>
    </svg>
  ),
  quote: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6M8 13h8M8 17h5"/>
    </svg>
  ),
  invoice: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 4h18v16l-3-2-3 2-3-2-3 2-3-2-3 2V4z"/>
      <path d="M7 8h10M7 12h10M7 16h6"/>
    </svg>
  ),
  cal: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="16" rx="2"/>
      <path d="M8 3v4M16 3v4M3 10h18"/>
    </svg>
  ),
  wo: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  hours: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  ),
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 6-6"/>
    </svg>
  ),
  shield: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  ),
  bolt: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>
    </svg>
  ),
};

const BENEFITS = [
  {
    n: '01',
    icon: Icon.bolt,
    h: 'Alles op één plek',
    p: 'Klanten, leads, planning, offertes en uren — geen losse Excels of WhatsApp meer.',
  },
  {
    n: '02',
    icon: Icon.chart,
    h: 'Grip op je omzet',
    p: 'Zie direct wat openstaat, wat binnenkomt en wat een klus oplevert.',
  },
  {
    n: '03',
    icon: Icon.shield,
    h: 'Geen klus vergeten',
    p: 'Slimme opvolging zorgt dat élke aanvraag en élke offerte tijd krijgt.',
  },
];

const FEATURES = [
  { icon: Icon.inbox,   t: 'Leadbeheer',          d: 'Aanvragen uit je website, mail of WhatsApp landen in één heldere inbox.' },
  { icon: Icon.pipe,    t: 'Sales pipeline',       d: 'Sleep deals door duidelijke fases — van nieuwe aanvraag tot afgerond.' },
  { icon: Icon.quote,   t: 'Slimme offertes',      d: 'Offertes met materialen, uren en marges. Inclusief online akkoord van de klant.' },
  { icon: Icon.cal,     t: 'Planning & agenda',    d: 'Plan klussen, wijs ploegen toe en synchroniseer met Google Calendar.' },
  { icon: Icon.wo,      t: 'Werkbonnen mobiel',    d: 'Het team werkt vanaf de telefoon — foto’s, taken, handtekening, klaar.' },
  { icon: Icon.invoice, t: 'Facturatie',           d: 'Van geaccepteerde offerte naar factuur in één klik. Met btw, kosten, marges.' },
  { icon: Icon.hours,   t: 'Uren & materiaal',     d: 'Registreer uren en kosten per project. Job costing zonder rekenwerk.' },
  { icon: Icon.chart,   t: 'Rapportages',          d: 'Omzet, marge per branche, conversie — in heldere weekgrafieken.' },
];

const FLOW = [
  { n: '1', t: 'Vang elke aanvraag',  d: 'Leads landen automatisch in BossBase — vanuit je site, mail of telefoon.' },
  { n: '2', t: 'Stuur de offerte',     d: 'Bouw in minuten een offerte met je standaard regels, materialen en uren.' },
  { n: '3', t: 'Plan en voer uit',     d: 'Geaccepteerde offertes worden ploeg, agenda en werkbon — onderweg te zien.' },
  { n: '4', t: 'Factureer & meet',     d: 'Eén klik naar factuur. Marge, conversie en omzet zie je direct terug.' },
];

const AUDIENCES = [
  { eye: 'Schilders',    h: 'Strakke planning voor binnen- en buitenwerk', p: 'Van opname tot oplevering. Inclusief foto’s per kamer en m²-staat.', meta: '14 dagen gratis · vanaf €19/mnd' },
  { eye: 'Hoveniers',    h: 'Houd onderhoudsklussen en aanleg uit elkaar',  p: 'Plan vaste rondes en losse projecten in dezelfde agenda — en factureer ze automatisch.', meta: 'Inclusief abonnementen' },
  { eye: 'Klusbedrijven',h: 'Eén plek voor de hele werkbak',                 p: 'Van keukens tot dakkapellen — uren, kosten en winst per klus zichtbaar.', meta: 'Voor 1 tot 25 medewerkers' },
];

const FAQ = [
  ['Hoe snel kan ik beginnen?', 'In minder dan vijf minuten heb je een account en kun je je eerste offerte versturen. De eerste 14 dagen zijn gratis, zonder creditcard.'],
  ['Werkt BossBase ook voor mijn vakgebied?', 'BossBase is gebouwd voor schilders, hoveniers, klusbedrijven, stukadoors, loodgieters en installatiebedrijven. Templates kun je per branche aanpassen.'],
  ['Kan mijn team meewerken?', 'Vanaf het Pro-pakket voeg je medewerkers toe, wijs je rollen toe en werken jullie samen vanuit één dashboard — telefoon of laptop.'],
  ['Hoe zit het met facturen en btw?', 'BossBase rekent btw automatisch door naar factuur. Je kunt elke regel aanpassen en exporteren naar je boekhouder.'],
  ['Wat als ik wil stoppen?', 'Maandabonnementen zeg je op wanneer je wilt. Je houdt toegang tot het einde van de periode. Data kun je altijd exporteren.'],
  ['Waar staat mijn data?', 'EU-datacenters, versleuteld, dagelijks geback-upt. AVG/GDPR-proof. We delen niets met derden.'],
];

const TIERS = [
  { name: 'Starter',  desc: "Voor zzp'ers die net beginnen met digitaal werken.", m: 19, y: 15,
    feats: ['Tot 25 leads per maand', 'Onbeperkt offertes maken', 'Online offerte-akkoord', 'Klantprofielen & historie', 'E-mailondersteuning'],
    cta: 'Start gratis', },
  { name: 'Pro',      desc: 'Voor groeiende vakbedrijven met team en planning.', m: 49, y: 39, hot: true,
    feats: ['Alles uit Starter', 'Onbeperkte leads & jobs', 'Sales pipeline + automatisering', 'Planning & Google Calendar sync', 'Mobiele werkbonnen', 'Tot 5 teamleden'],
    cta: 'Probeer 14 dagen gratis', },
  { name: 'Business', desc: 'Voor grotere ploegen die op meerdere klussen tegelijk draaien.', m: 99, y: 79,
    feats: ['Alles uit Pro', 'Onbeperkte teamleden', 'Geavanceerde rapportages', 'Job costing & winstanalyse', 'API & integraties', 'Persoonlijke onboarding'],
    cta: 'Plan een gesprek', },
];

/* ─── Hero product viewport (in-page pipeline ribbon) ──────────────── */
function HeroViewport() {
  return (
    <div className="mkt-viewport" aria-hidden="true">
      <div className="mkt-vp-bar">
        <span className="mkt-vp-dots"><span/><span/><span/></span>
        <span className="mkt-vp-url">app.bossbase.nl / pipeline</span>
        <span style={{ width: 16 }} />
      </div>
      <div className="mkt-vp-body">
        <div className="mkt-vp-head">
          <div>
            <h4>Sales pipeline — week 22</h4>
            <p>14 actieve trajecten · €48.250 in offertes</p>
          </div>
          <span className="mkt-vp-pill"><span className="mkt-live-dot" style={{ marginRight: 6 }} /> Live</span>
        </div>
        <div className="mkt-vp-kpis">
          <div className="mkt-vp-kpi">
            <div className="mkt-vp-kpi-lbl">Open offertes</div>
            <div className="mkt-vp-kpi-val">€18.420</div>
            <div className="mkt-vp-kpi-trend">↑ 12%</div>
          </div>
          <div className="mkt-vp-kpi">
            <div className="mkt-vp-kpi-lbl">Geaccepteerd</div>
            <div className="mkt-vp-kpi-val">€29.830</div>
            <div className="mkt-vp-kpi-trend">↑ 8%</div>
          </div>
          <div className="mkt-vp-kpi">
            <div className="mkt-vp-kpi-lbl">Conversie</div>
            <div className="mkt-vp-kpi-val">62%</div>
            <div className="mkt-vp-kpi-trend">↑ 4%</div>
          </div>
        </div>
        <div className="mkt-vp-pipe">
          <Col title="Nieuw" count={3}>
            <Card name="J. de Vries"  job="Schilderwerk gevel"   amt="€2.450" />
            <Card name="A. Bakker"    job="Tuinaanleg achter"     amt="€4.200" />
            <Card name="P. Smits"     job="Verbouwing keuken"     amt="€8.900" />
          </Col>
          <Col title="Contact" count={2}>
            <Card name="M. Kuipers"   job="Schuur schilderen"     amt="€1.180" />
            <Card name="L. Janssen"   job="Hekwerk plaatsen"      amt="€3.450" />
          </Col>
          <Col title="Offerte" count={4}>
            <Card hot name="R. de Boer" job="Buitenschilderwerk" amt="€5.620" tag="warm" />
            <Card name="K. Hendriks"  job="Kozijnen vervangen"    amt="€7.800" />
            <Card name="S. Visser"    job="Houten vloer"          amt="€2.940" />
          </Col>
          <Col title="Akkoord" count={3}>
            <Card name="T. Mulder"    job="Dakkapel plaatsen"     amt="€6.300" />
            <Card name="E. Dijkstra"  job="Tuinaanleg voor"        amt="€3.150" />
          </Col>
        </div>
      </div>
    </div>
  );
}
function Col({ title, count, children }) {
  return (
    <div className="mkt-vp-col">
      <div className="mkt-vp-col-hd">{title} <b>{count}</b></div>
      {children}
    </div>
  );
}
function Card({ name, job, amt, hot, tag }) {
  return (
    <div className={`mkt-vp-card${hot ? ' is-hot' : ''}`}>
      <div className="mkt-vp-card-title">{name}</div>
      <div className="mkt-vp-card-meta">{job}</div>
      <div className="mkt-vp-card-amt">
        <span style={tag ? {} : { visibility: 'hidden' }}>{tag || '—'}</span>
        <b>{amt}</b>
      </div>
    </div>
  );
}

/* ─── Trade marquee ─────────────────────────────────────────────────── */
function TradeMarquee() {
  const TRADES = ['Schilders', 'Hoveniers', 'Klusbedrijven', 'Stukadoors', 'Loodgieters', 'Installateurs', 'Aannemers', 'Dakdekkers', 'Elektriciens'];
  const row = (
    <span>
      {TRADES.map(t => <span key={t}>{t}</span>)}
    </span>
  );
  return (
    <div className="mkt-marquee">
      <div className="mkt-marquee-label">Gebouwd voor de mensen die het echte werk doen</div>
      <div className="mkt-marquee-track">{row}{row}</div>
    </div>
  );
}

/* ─── Mini mocks for the "Hoe het werkt" section ────────────────────── */
function MiniInbox() {
  return (
    <div className="mkt-mini">
      <div className="mkt-mini-hd"><span>Inbox · vandaag</span><span>3 nieuw</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">JV</span><span><b>J. de Vries</b><small>Schilderwerk gevel · via website</small></span><span className="mkt-mini-amt">±€2.450</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">AB</span><span><b>A. Bakker</b><small>Tuinaanleg · WhatsApp</small></span><span className="mkt-mini-amt">±€4.200</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">PS</span><span><b>P. Smits</b><small>Verbouwing keuken · e-mail</small></span><span className="mkt-mini-amt">±€8.900</span></div>
    </div>
  );
}
function MiniQuote() {
  return (
    <div className="mkt-mini">
      <div className="mkt-mini-hd"><span>Offerte BB-024</span><span>Concept</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">m²</span><span><b>Voorbereiding gevel</b><small>32 m² · €18/m²</small></span><span className="mkt-mini-amt">€576</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">u</span><span><b>Schilderen 2 lagen</b><small>14 u · €52/u</small></span><span className="mkt-mini-amt">€728</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">€</span><span><b>Materialen</b><small>verf, plamuur, doek</small></span><span className="mkt-mini-amt">€340</span></div>
      <div className="mkt-mini-row" style={{ borderTop: '1px solid var(--line-strong)' }}>
        <span className="mkt-mini-av" style={{ background: 'var(--brand)', color: 'var(--atelier)' }}>✓</span>
        <span><b>Totaal incl. btw</b><small>21% btw</small></span><span className="mkt-mini-amt">€2.450</span>
      </div>
    </div>
  );
}
function MiniSchedule() {
  return (
    <div className="mkt-mini">
      <div className="mkt-mini-hd"><span>Planning · week 22</span><span>4 ploegen</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">MA</span><span><b>De Vries · gevel</b><small>Marco & Remco · 08:00–16:30</small></span><span className="mkt-mini-amt">8u</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">DI</span><span><b>Bakker · tuinaanleg</b><small>Tim & Sander · hele dag</small></span><span className="mkt-mini-amt">9u</span></div>
      <div className="mkt-mini-row"><span className="mkt-mini-av">WO</span><span><b>Smits · keuken oplevering</b><small>Marco · 10:00–12:00</small></span><span className="mkt-mini-amt">2u</span></div>
    </div>
  );
}

export default function HomePage({ navigate, isAuthenticated }) {
  const [yearly, setYearly] = useState(true);
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <MarketingShell navigate={navigate} active="home" isAuthenticated={isAuthenticated} scrollLine={<ScrollLine />}>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="mkt-hero">
        <div className="mkt-c">
          <div className="mkt-hero-grid">
            <div className="mkt-hero-left mkt-rev">
              <span className="mkt-hero-tag">
                <span className="mkt-hero-tag-pill">Nieuw</span>
                Online offerte-akkoord · Google Calendar sync
              </span>
              <h1>
                Eén rustige plek<br />
                voor je hele bedrijf —<br />
                <em>van lead tot factuur.</em>
              </h1>
              <p className="mkt-hero-sub">
                BossBase brengt klanten, leads, planning, offertes, werkbonnen
                en omzet samen in één scherp dashboard. Gebouwd voor vakbedrijven
                die overzicht willen, zonder gedoe.
              </p>
              <div className="mkt-hero-ctas">
                <button className="mkt-btn mkt-btn--primary mkt-btn--lg" onClick={() => navigate('/register')}>
                  <span className="mkt-btn-dot" /> Start 14 dagen gratis
                </button>
                <button className="mkt-btn mkt-btn--ghost mkt-btn--lg" onClick={() => navigate('/demo')}>
                  Bekijk demo →
                </button>
              </div>
              <div className="mkt-hero-proof">
                <span className="mkt-hero-proof-num">200+</span>
                <span>vakbedrijven<br />gebruiken BossBase</span>
                <span className="mkt-hero-proof-divide" />
                <span className="mkt-hero-proof-num">4.9<span style={{ color: 'var(--brand-deep)' }}>★</span></span>
                <span>gemiddelde<br />beoordeling</span>
              </div>
            </div>

            <div className="mkt-hero-right mkt-rev">
              <HeroViewport />
            </div>
          </div>
        </div>
      </section>

      {/* ── TRADE MARQUEE ───────────────────────────────────── */}
      <TradeMarquee />

      {/* ── BENEFITS ─────────────────────────────────────────── */}
      <section className="mkt-sec mkt-sec--first" id="voordelen">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-sec-head--wide mkt-rev">
            <div>
              <div className="mkt-sec-num">Waarom BossBase</div>
              <h2>Meer rust, meer grip, meer omzet.</h2>
            </div>
            <p>
              Geen zoekplaatje van losse tools. Geen post-its op de keukentafel.
              Eén plek waar je werk klopt — en je hoofd weer ruimte heeft.
            </p>
          </div>

          <div className="mkt-benefits mkt-rev">
            {BENEFITS.map(b => (
              <article key={b.n} className="mkt-benefit">
                <div className="mkt-benefit-num">— {b.n}</div>
                <div className="mkt-benefit-icon">{b.icon}</div>
                <h3>{b.h}</h3>
                <p>{b.p}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS — DARK SECTION ─────────────────────── */}
      <section className="mkt-sec mkt-sec--ink mkt-sec--airy" id="hoe">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num mkt-sec-num--light">Workflow</div>
              <h2>Van losse aanvraag<br /><em>naar betaalde factuur.</em></h2>
            </div>
            <p>
              Vier stappen — en BossBase pakt elke overdracht. Geen handmatige
              kopieerklussen tussen tools. Geen werk dat tussen wal en schip valt.
            </p>
          </div>
          <div className="mkt-flow mkt-rev">
            {FLOW.map(s => (
              <div key={s.n} className="mkt-flow-step">
                <div className="mkt-flow-num">{s.n}</div>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE BIG SPLITS ──────────────────────────────── */}
      <section className="mkt-sec" id="functies">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num">Functies in beeld</div>
              <h2>Alles om je vakbedrijf<br />draaiend te <em>houden.</em></h2>
            </div>
            <p>
              Drie kernfuncties uitgelicht — voor de volledige rondleiding
              ga je naar de <button className="mkt-link" onClick={() => navigate('/functies')}>functies-pagina →</button>.
            </p>
          </div>

          <article className="mkt-fbig mkt-rev">
            <div>
              <div className="mkt-fbig-num">Lead naar deal</div>
              <h3>Elke aanvraag landt op <em>één heldere plek.</em></h3>
              <p>
                Aanvragen vanuit je website, mail, telefoon of WhatsApp komen
                automatisch binnen in BossBase. Geen losse mappen, geen verloren
                post-its. Je geeft elke lead in seconden de juiste fase.
              </p>
              <ul>
                <li>Automatische import vanuit je formulier</li>
                <li>Verrijking met klantgegevens en historie</li>
                <li>Opvolgingsregels: niemand vergeten</li>
              </ul>
            </div>
            <div className="mkt-fbig-art"><MiniInbox /></div>
          </article>

          <article className="mkt-fbig is-rev mkt-rev">
            <div className="mkt-fbig-art"><MiniQuote /></div>
            <div>
              <div className="mkt-fbig-num">Slimme offertes</div>
              <h3>Maak een offerte zoals je <em>denkt over werk.</em></h3>
              <p>
                Regels in uren, m² en materialen. Marge per regel. Btw automatisch.
                De klant tekent online voor akkoord — en de offerte staat al
                klaar in de planning.
              </p>
              <ul>
                <li>Templates per branche en klustype</li>
                <li>Online akkoord met datum, IP en signatuur</li>
                <li>Eén klik naar werkbon, planning en factuur</li>
              </ul>
            </div>
          </article>

          <article className="mkt-fbig mkt-rev">
            <div>
              <div className="mkt-fbig-num">Planning & werkbonnen</div>
              <h3>Het juiste werk bij <em>de juiste ploeg.</em></h3>
              <p>
                Plan klussen per ploeg of medewerker, sleep door de week en
                synchroniseer met Google Calendar. Onderweg opent het team
                de werkbon op de telefoon — taken, foto’s, handtekening.
              </p>
              <ul>
                <li>Drag-and-drop planning per ploeg</li>
                <li>Mobiele werkbonnen met foto en notitie</li>
                <li>Uren rollen automatisch door naar de factuur</li>
              </ul>
            </div>
            <div className="mkt-fbig-art"><MiniSchedule /></div>
          </article>
        </div>
      </section>

      {/* ── ALL FEATURES GRID (compact) ─────────────────────── */}
      <section className="mkt-sec mkt-sec--cream mkt-sec--tight">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num">Functieoverzicht</div>
              <h2>Acht modules,<br /><em>één werkstroom.</em></h2>
            </div>
            <p>
              Geen losse abonnementen op aparte tools. BossBase is één pakket
              waarin alles met elkaar praat — van eerste klik tot laatste factuur.
            </p>
          </div>
          <div className="mkt-benefits mkt-benefits--compact mkt-rev">
            {FEATURES.map(f => (
              <article key={f.t} className="mkt-benefit">
                <div className="mkt-benefit-icon">{f.icon}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── AUDIENCES ───────────────────────────────────────── */}
      <section className="mkt-sec" id="voor-wie">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num">Voor wie</div>
              <h2>Gebouwd voor mensen<br /><em>die met hun handen werken.</em></h2>
            </div>
            <p>
              Of je nu in je eentje schilderwerk doet of met een ploeg keukens
              plaatst — BossBase past zich aan jouw werkwijze aan, niet andersom.
            </p>
          </div>
          <div className="mkt-aud mkt-rev">
            {AUDIENCES.map(a => (
              <button key={a.h} className="mkt-aud-card" onClick={() => navigate('/voor-wie')}>
                <span className="mkt-eye">{a.eye}</span>
                <h4>{a.h}</h4>
                <p>{a.p}</p>
                <div className="mkt-aud-foot">
                  <strong>{a.meta}</strong>
                  <span className="mkt-aud-arrow">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ──────────────────────────────────── */}
      <section className="mkt-sec mkt-sec--cream" id="prijzen">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num">Prijzen</div>
              <h2>Eerlijk geprijsd,<br /><em>maandelijks opzegbaar.</em></h2>
            </div>
            <p>
              Begin gratis, schaal mee als je groeit. Geen jaarcontracten als
              je dat niet wilt. Volledig vergelijken? Ga naar de{' '}
              <button className="mkt-link" onClick={() => navigate('/prijzen')}>prijzen-pagina →</button>
            </p>
          </div>

          <div style={{ textAlign: 'center' }} className="mkt-rev">
            <div className="mkt-billing">
              <button className={!yearly ? 'is-on' : ''} onClick={() => setYearly(false)}>Maandelijks</button>
              <button className={yearly ? 'is-on' : ''} onClick={() => setYearly(true)}>
                Jaarlijks <span className="mkt-billing-save">−20%</span>
              </button>
            </div>
          </div>

          <div className="mkt-tiers mkt-rev">
            {TIERS.map(t => {
              const price = yearly ? t.y : t.m;
              return (
                <article key={t.name} className={`mkt-tier${t.hot ? ' mkt-tier--hot' : ''}`}>
                  {t.hot && <div className="mkt-tier-tag">Meest gekozen</div>}
                  <h3>{t.name}</h3>
                  <p className="mkt-tier-desc">{t.desc}</p>
                  <div className="mkt-tier-price">
                    <span className="mkt-tier-cur">€</span>
                    <b>{price}</b>
                    <span className="mkt-tier-per">/maand</span>
                  </div>
                  <p className="mkt-tier-note">
                    {yearly ? `€${price * 12} per jaar · bespaar €${(t.m - t.y) * 12}` : 'Maandelijks opzegbaar'}
                  </p>
                  <button className={`mkt-btn mkt-tier-cta ${t.hot ? 'mkt-btn--brand' : 'mkt-btn--ghost'}`} onClick={() => navigate('/register')}>
                    {t.cta}
                  </button>
                  <ul className="mkt-tier-feat">
                    {t.feats.map(f => <li key={f}>{f}</li>)}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ─────────────────────────────────────── */}
      <section className="mkt-sec mkt-sec--tight">
        <div className="mkt-c">
          <div className="mkt-quote-wrap mkt-rev">
            <div className="mkt-quote-stamp">
              <div>
                <strong>Pieter J. · schilderbedrijf</strong>
                <b>+24%</b>
                conversie<br />in 3 maanden
              </div>
            </div>
            <div>
              <p className="mkt-quote-text">
                “Voor BossBase had ik vier <em>losse tools</em> en een schoenendoos.
                Nu zien wij vrijdag om 16:00 wat er volgende week klaarstaat,
                wat er <em>nog open</em> is en wat de week heeft opgeleverd.”
              </p>
              <div className="mkt-quote-attrib">
                <span className="mkt-quote-av">PJ</span>
                <div>
                  <div className="mkt-quote-name">Pieter Jansen</div>
                  <div className="mkt-quote-role">Eigenaar · Jansen Schilderwerken · Zwolle</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section className="mkt-sec mkt-sec--cream" id="faq">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num">Veelgestelde vragen</div>
              <h2>Vragen? <em>Antwoorden.</em></h2>
            </div>
            <p>
              Staat je vraag er niet bij? Stuur ons een mail op{' '}
              <button className="mkt-link" onClick={() => navigate('/contact')}>contact →</button>
              — we reageren binnen één werkdag.
            </p>
          </div>
          <div className="mkt-faq mkt-rev">
            {FAQ.map(([q, a], i) => (
              <div key={q} className={`mkt-faq-item${openFaq === i ? ' is-open' : ''}`}>
                <button className="mkt-faq-q" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                  <span>{q}</span>
                  <span>+</span>
                </button>
                <div className="mkt-faq-a"><p style={{ margin: 0 }}>{a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────── */}
      <section className="mkt-final">
        <div className="mkt-final-in mkt-rev">
          <div className="mkt-sec-num mkt-sec-num--light" style={{ justifyContent: 'center' }}>Klaar om te beginnen?</div>
          <h2>Jij de baas,<br /><em>wij de basis.</em></h2>
          <p>Begin vandaag gratis. Geen creditcard, geen verplichtingen — gewoon werk dat eindelijk klopt.</p>
          <div className="mkt-final-ctas">
            <button className="mkt-btn mkt-btn--brand mkt-btn--lg" onClick={() => navigate('/register')}>
              Start 14 dagen gratis
            </button>
            <button className="mkt-btn mkt-btn--inverse mkt-btn--lg" onClick={() => navigate('/demo')}>
              Bekijk demo →
            </button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
