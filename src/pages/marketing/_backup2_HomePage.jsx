import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import './bossbase-mkt.css';

/* ─── Icons ─── */
const Ic = ({ d, size = 20, strokeWidth = 2, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {d ? d.split('|').map((p, i) => <path key={i} d={p} />) : null}
    {children}
  </svg>
);
const BI = {
  check: p => <Ic d="M20 6 9 17l-5-5" {...p} />,
  checkCircle: p => <Ic d="M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3" {...p} />,
  arrowRight: p => <Ic d="M5 12h14|m12 5 7 7-7 7" {...p} />,
  chevronDown: p => <Ic d="m6 9 6 6 6-6" {...p} />,
  menu: p => <Ic d="M4 6h16|M4 12h16|M4 18h16" {...p} />,
  x: p => <Ic d="M18 6 6 18|m6 6 12 12" {...p} />,
  play: p => <Ic d="m6 4 14 8-14 8V4z" {...p} />,
  mail: p => <Ic d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" {...p}><rect x="2" y="4" width="20" height="16" rx="2" /></Ic>,
  message: p => <Ic d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" {...p} />,
  fileText: p => <Ic d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z|M14 2v4a2 2 0 0 0 2 2h4|M16 13H8|M16 17H8|M10 9H8" {...p} />,
  calendar: p => <Ic d="M8 2v4|M16 2v4|M3 10h18" {...p}><rect x="3" y="4" width="18" height="18" rx="2" /></Ic>,
  notebook: p => <Ic d="M2 6h4|M2 10h4|M2 14h4|M2 18h4|M9.5 8h5|M9.5 12h5" {...p}><rect x="4" y="2" width="16" height="20" rx="2" /></Ic>,
  table: p => <Ic d="M3 9h18|M3 15h18|M9 3v18|M15 3v18" {...p}><rect x="3" y="3" width="18" height="18" rx="2" /></Ic>,
  users: p => <Ic d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75" {...p}><circle cx="9" cy="7" r="4" /></Ic>,
  kanban: p => <Ic d="M5 3v14|M12 3v8|M19 3v18" {...p} strokeWidth={2.4} />,
  signature: p => <Ic d="m21.7 6.3-3-3a1 1 0 0 0-1.4 0L7 13.6V17h3.4L20.7 6.7a1 1 0 0 0 0-1.4Z|M3 21h18" {...p} />,
  clock: p => <Ic d="M12 6v6l4 2" {...p}><circle cx="12" cy="12" r="10" /></Ic>,
  chart: p => <Ic d="M3 3v16a2 2 0 0 0 2 2h16|M7 14l4-4 4 3 5-6" {...p} />,
  euro: p => <Ic d="M4 10h12|M4 14h9|M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2" {...p} />,
  bell: p => <Ic d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9|M10.3 21a1.94 1.94 0 0 0 3.4 0" {...p} />,
  bolt: p => <Ic d="M13 2 3 14h7l-1 8 11-13h-7l1-7z" {...p} />,
  shield: p => <Ic d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z|m9 12 2 2 4-4" {...p} />,
  smartphone: p => <Ic d="M12 18h.01" {...p}><rect x="5" y="2" width="14" height="20" rx="2" /></Ic>,
  sparkles: p => <Ic d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z|M5 3v4|M19 17v4|M3 5h4|M17 19h4" {...p} />,
  paintRoller: p => <Ic d="M10 14v-3a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2" {...p}><rect x="2" y="2" width="16" height="6" rx="2" /><rect x="8" y="14" width="4" height="8" rx="1" /></Ic>,
  leaf: p => <Ic d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z|M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" {...p} />,
  hammer: p => <Ic d="m15 12-8.37 8.37a2.12 2.12 0 1 1-3-3L12 9|M17.64 15 22 10.64|m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" {...p} />,
  wrench: p => <Ic d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" {...p} />,
  roof: p => <Ic d="m3 11 9-8 9 8|M5 9.5V21h14V9.5|M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6" {...p} />,
  trowel: p => <Ic d="M14 14 4.5 4.5a2.12 2.12 0 0 0-3 3L11 17|m13.5 13.5 7.2-3.4a1 1 0 0 0 .27-1.6l-5.47-5.47a1 1 0 0 0-1.6.27L10.5 10.5|M16 16l5 5" {...p} />,
  droplet: p => <Ic d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" {...p} />,
  dashboard: p => <Ic {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Ic>,
  truck: p => <Ic d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2|M15 18H9|M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35a1 1 0 0 0-.78-.38H14" {...p}><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></Ic>,
};

/* ─── Hooks ─── */
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = e => setReduced(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduced;
}

function useScrollY(enabled) {
  const [y, setY] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; setY(window.scrollY); });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [enabled]);
  return y;
}

/* ─── Scroll-getekende groene lijn ─── */
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
    <div className="scroll-line" aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 1000 10000" preserveAspectRatio="none" focusable="false">
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

/* ─── Wordmark ─── */
function Wordmark({ onDark, onClick }) {
  return (
    <button className={'wordmark' + (onDark ? ' on-dark' : '')} onClick={onClick} type="button">
      <span className="b1">Boss</span>Base
    </button>
  );
}

/* ─── Reveal on scroll ─── */
function Reveal({ children, delay = 0, as: Tag = 'div', className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={('reveal ' + className).trim()} style={delay ? { transitionDelay: delay + 'ms' } : undefined}>
      {children}
    </Tag>
  );
}

/* ─── Navigatie ─── */
const NAV_LINKS = [
  ['Home', '#home', null],
  ['Functies', '#functies', null],
  ['Prijzen', '/prijzen', '/prijzen'],
  ['Voor wie', '#voor-wie', null],
  ['Over', '/over-ons', '/over-ons'],
  ['Contact', '/contact', '/contact'],
];

function Nav({ navigate, isAuthenticated }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const go = useCallback((href, route) => {
    setOpen(false);
    if (route) { navigate(route); }
    else { window.location.hash = href; }
  }, [navigate]);

  return (
    <Fragment>
      <div className={'nav' + (scrolled || open ? ' scrolled' : '')}>
        <div className="container nav-inner">
          <Wordmark onClick={() => navigate('/')} />
          <ul className="nav-links">
            {NAV_LINKS.map(([label, href, route]) => (
              <li key={label}>
                <button onClick={() => go(href, route)}>{label}</button>
              </li>
            ))}
          </ul>
          <div className="nav-right">
            {isAuthenticated ? (
              <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Dashboard</button>
            ) : (
              <button className="btn btn-ghost" onClick={() => navigate('/login')}>Inloggen</button>
            )}
            <button className="btn btn-p" onClick={() => navigate('/register')}>Start gratis</button>
            <button className="hamburger" aria-label={open ? 'Menu sluiten' : 'Menu openen'} aria-expanded={open} onClick={() => setOpen(v => !v)}>
              {open ? <BI.x size={22} /> : <BI.menu size={22} />}
            </button>
          </div>
        </div>
      </div>
      <nav className={'mobile-menu' + (open ? ' open' : '')} aria-label="Mobiel menu">
        {NAV_LINKS.map(([label, href, route]) => (
          <button key={label} onClick={() => go(href, route)}>{label}</button>
        ))}
        {isAuthenticated
          ? <button onClick={() => { setOpen(false); navigate('/dashboard'); }}>Dashboard</button>
          : <button onClick={() => { setOpen(false); navigate('/login'); }}>Inloggen</button>
        }
        <button className="btn btn-p mobile-menu-cta" onClick={() => { setOpen(false); navigate('/register'); }}>
          Start gratis proefperiode
        </button>
      </nav>
    </Fragment>
  );
}

/* ─── Hero: float-kaarten (variant D) ─── */
function CardOfferte() {
  return (
    <div>
      <div className="fc-label">Offerte #2026-118</div>
      <div className="fc-title">Badkamer renovatie — Fam. Bakker</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <span className="fc-amount">€ 4.850</span>
        <span className="badge badge-accepted"><BI.check size={12} strokeWidth={3} /> Geaccepteerd</span>
      </div>
    </div>
  );
}
function CardPipeline() {
  return (
    <div style={{ width: 188 }}>
      <div className="fc-label" style={{ marginBottom: 8 }}>Pipeline · Offerte fase</div>
      {[['Dakkapel — Visser', '€ 7.200'], ['Kozijnen — De Wit', '€ 2.150']].map(([t, m]) => (
        <div key={t} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', marginBottom: 7, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--dk)' }}>{t}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--pd)', marginTop: 2 }}>{m}</div>
        </div>
      ))}
    </div>
  );
}
function CardAgenda() {
  return (
    <div style={{ width: 196 }}>
      <div className="fc-label" style={{ marginBottom: 8 }}>Vandaag · di 10 jun</div>
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: 'var(--p)' }} />
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--dmu)', fontWeight: 500 }}>09:00 – 12:30</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dk)' }}>Buitenschilderwerk — De Lange</div>
        </div>
      </div>
    </div>
  );
}
function CardOmzet() {
  return (
    <div style={{ width: 204 }}>
      <div className="fc-label">Omzet deze maand</div>
      <div className="fc-amount" style={{ fontSize: 19 }}>€ 12.400</div>
      <svg width="168" height="44" viewBox="0 0 168 44" fill="none" aria-hidden="true" style={{ display: 'block', marginTop: 6 }}>
        <path d="M2 38 32 30 62 33 92 20 122 23 152 8 166 10" stroke="#1DDB62" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 38 32 30 62 33 92 20 122 23 152 8 166 10 166 44 2 44Z" fill="rgba(29,219,98,0.12)" />
      </svg>
    </div>
  );
}
function CardLead() {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--pl)', color: 'var(--pd)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <BI.bell size={17} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dk)' }}>Nieuwe lead</div>
        <div style={{ fontSize: 12.5, color: 'var(--dmu)' }}>Dakkapel plaatsen · Utrecht</div>
      </div>
    </div>
  );
}

const FLOAT_CARDS = [
  [CardOfferte,   { top: '8%',  left: '6%',  zIndex: 4 }, 0.16, -7,  3,  false],
  [CardOmzet,    { top: '44%', left: '0%',  zIndex: 3 }, 0.10,  6, -2,  false],
  [CardPipeline, { top: '2%',  right: '2%', zIndex: 2 }, 0.06,  9,  4,  true],
  [CardAgenda,   { top: '56%', right: '8%', zIndex: 4 }, 0.20, -5, -3,  true],
  [CardLead,     { top: '33%', left: '36%', zIndex: 5 }, 0.26,  4,  2,  false],
];

function HeroStageD({ reduced }) {
  const y = useScrollY(!reduced);
  return (
    <div className="hero-stage" aria-hidden="true">
      {FLOAT_CARDS.map(([Comp, pos, depth, ry, rx, hideM], i) => {
        const t = reduced
          ? `rotateY(${ry * 0.5}deg) rotateX(${rx * 0.5}deg)`
          : `translateY(${-y * depth}px) rotateY(${ry + y * 0.012 * (i % 2 ? 1 : -1)}deg) rotateX(${rx + y * 0.008}deg)`;
        return (
          <div key={i} className={'float-card' + (hideM ? ' fc-hide-m' : '')}
            style={{ ...pos, transform: t, transformStyle: 'preserve-3d' }}>
            <Comp />
          </div>
        );
      })}
    </div>
  );
}

function Hero({ navigate }) {
  const reduced = useReducedMotion();
  return (
    <header className="hero" id="home">
      <div className="container hero-grid">
        <div>
          <span className="hero-badge"><BI.bolt size={14} /> Jij de baas, wij de basis.</span>
          <h1>Eén rustige plek voor je hele bedrijf — <span className="accent2">van lead tot <span className="accent">factuur.</span></span></h1>
          <p className="hero-sub">BossBase brengt klanten, leads, planning, offertes, werkbonnen en omzet samen in één scherp dashboard. Gebouwd voor vakbedrijven die overzicht willen, zonder gedoe.</p>
          <div className="hero-ctas">
            <a className="btn btn-p btn-lg glow" href="#prijzen">Start 14 dagen gratis</a>
            <a className="btn btn-s btn-lg" href="#demo">Bekijk demo <BI.arrowRight size={16} /></a>
          </div>
          <div className="hero-trust">
            <BI.checkCircle size={16} />
            <span>Geen creditcard nodig · binnen 5 minuten klaar · maandelijks opzegbaar</span>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="num">200+</span>
              <span className="lbl">vakbedrijven<br />gebruiken BossBase</span>
            </div>
            <div className="hero-stat" style={{ borderLeft: '1px solid var(--bstrong)', paddingLeft: 24 }}>
              <span className="num">4.9 <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DDB62" aria-hidden="true"><path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.58l-5.9 3.1 1.13-6.58L2.45 9.44l6.6-.96L12 2.5z" /></svg></span>
              <span className="lbl">gemiddelde<br />beoordeling</span>
            </div>
          </div>
        </div>
        <HeroStageD reduced={reduced} />
      </div>
    </header>
  );
}

/* ─── Logobalk ─── */
const BRANCHES_MARQUEE = [
  'Schilders', 'Stukadoors', 'Loodgieters', 'Installateurs',
  'Aannemers', 'Dakdekkers', 'Hoveniers', 'Klusbedrijven',
  'Schoonmaak', 'Glazenwassers', 'Tegelzetters', 'Cv-monteurs',
];
function LogoBar() {
  const row = BRANCHES_MARQUEE.concat(BRANCHES_MARQUEE);
  return (
    <section className="logobar" aria-label="Branches">
      <p className="logobar-label">GEBOUWD VOOR DE MENSEN DIE HET ECHTE WERK DOEN</p>
      <div className="marquee choreo-body">
        <div className="marquee-track">
          {row.map((name, i) => (
            <span className="logo-item" key={i} aria-hidden={i >= BRANCHES_MARQUEE.length ? 'true' : undefined}>
              <span className="logo-dot" aria-hidden="true" />{name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Probleem → oplossing ─── */
const CHAOS_CHIPS = [
  ['message', '#15A34A', 'Mail: "Kun je morgen?"',         { top: '4%',  left: '8%',   transform: 'rotate(-4deg)' }],
  ['mail',    '#2563eb', '23 ongelezen mails',              { top: '24%', right: '4%',  transform: 'rotate(3deg)'  }],
  ['notebook','#f59e0b', 'Schriftje in de bus',             { top: '46%', left: '0%',   transform: 'rotate(2deg)'  }],
  ['table',   '#15A34A', 'Offertes_DEFINITIEF_v3.xlsx',     { top: '64%', right: '10%', transform: 'rotate(-3deg)' }],
  ['calendar','#dc2626', 'Dubbele afspraak?!',              { top: '86%', left: '16%',  transform: 'rotate(5deg)'  }],
];
function ProblemSolution() {
  return (
    <section className="section">
      <div className="container">
        <Reveal className="section-head choreo-head">
          <span className="section-kicker">Herkenbaar?</span>
          <h2>Nu spring je de hele dag tussen WhatsApp, je mailbox, een schriftje en Excel.</h2>
          <p>Met BossBase staat alles op één plek.</p>
        </Reveal>
        <Reveal className="chaos-solution choreo-body">
          <div className="chaos-pane" aria-hidden="true">
            {CHAOS_CHIPS.map(([icon, color, label, pos]) => {
              const Icon = BI[icon];
              return (
                <span className="chaos-chip" key={label} style={pos}>
                  <Icon size={16} style={{ color }} />{label}
                </span>
              );
            })}
          </div>
          <div className="solution-arrow" aria-hidden="true"><BI.arrowRight size={40} strokeWidth={2.5} /></div>
          <div className="solution-screen" aria-hidden="true">
            <div className="solution-screen-bar"><i /><i /><i />
              <span style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--dmu)' }}>BossBase — alles op één plek</span>
            </div>
            <div style={{ padding: 20, display: 'grid', gap: 11 }}>
              {[
                ['message', 'Lead uit Mail staat in je pipeline',  'badge-accepted', 'Opgevolgd'],
                ['fileText','Offerte Fam. Bakker — € 4.850',       'badge-accepted', 'Geaccepteerd'],
                ['calendar','Klus ingepland: ma 15 jun, 08:00',    'badge-concept',  'Herinnering staat'],
                ['euro',    'Factuur VvE Lindenhof',               'badge-paid',     'Betaald'],
              ].map(([icon, label, bcls, btxt]) => {
                const Icon = BI[icon];
                return (
                  <div className="mini-card" key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'var(--pd)', display: 'flex' }}><Icon size={17} /></span>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--dk)' }}>{label}</span>
                    <span className={'badge ' + bcls}>{btxt}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Functies ─── */
const FEATURES = [
  { icon: 'kanban',    title: 'CRM & pipeline',          body: 'Vang elke lead op uit je website en mail. Zie in één oogopslag welke klus in welke fase zit, en krijg een seintje als een offerte blijft liggen.',         points: ['Leads automatisch in je pipeline', 'Seintje bij offertes die blijven liggen', 'Hele klantgeschiedenis bij elke klus'],       visual: 'pipeline' },
  { icon: 'signature', title: 'Offertes & ondertekenen', body: 'Maak in minuten een professionele offerte als PDF met je eigen logo. Klant tekent digitaal online akkoord.',                                             points: ['Je eigen logo en huisstijl', 'Digitaal ondertekenen, rechtsgeldig', 'Calculatie op m², uren en materiaal'],               visual: 'offerte'  },
  { icon: 'calendar',  title: 'Planning & uitvoering',   body: 'Plan klussen in de agenda, je medewerkers zien hun werkbonnen op hun telefoon, klanten krijgen automatisch een afspraakherinnering.',                      points: ['Werkbonnen op de telefoon', 'Automatische afspraakherinnering', "Foto's bij de klus"],                                 visual: 'agenda'   },
  { icon: 'chart',     title: 'Uren, materialen & omzet',body: 'Registreer uren en materialen per klus. Je omzetdashboard laat zien wat binnen is, wat openstaat en wat eraan komt.',                                     points: ['Uren en materialen per klus', 'Binnen · openstaand · verwacht', 'Nacalculatie: begroot vs. werkelijk'],                 visual: 'omzet'    },
  { icon: 'users',     title: 'Team & rollen',            body: 'Werk je met meerdere busjes? Plan teams, beheer rollen en houd beschikbaarheid en verlof bij.',                                                           points: ['Meerdere teams en busjes plannen', 'Rollen en rechten per medewerker', 'Beschikbaarheid en verlof'],                  visual: 'team'     },
];
function FeatureVisual({ kind }) {
  if (kind === 'pipeline') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} aria-hidden="true">
      {[['Nieuwe lead', [['Dakkapel — Utrecht', '€ —'], ['Schutting — A\'foort', '€ —']]], ['Offerte', [['Visser — € 7.200', ''], ['De Wit — € 2.150', '']]]].map(([col, items]) => (
        <div key={col}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--dmu)', marginBottom: 8 }}>{col}</div>
          {items.map(([t]) => <div className="mini-card" key={t} style={{ marginBottom: 9, fontSize: 13, fontWeight: 600, color: 'var(--dk)' }}>{t}</div>)}
        </div>
      ))}
    </div>
  );
  if (kind === 'offerte') return (
    <div className="mini-card" style={{ maxWidth: 330, margin: '0 auto', padding: 20 }} aria-hidden="true">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em' }}><span style={{ color: 'var(--p)' }}>Boss</span>Base</span>
        <span className="badge badge-accepted"><BI.check size={12} strokeWidth={3} /> Ondertekend</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 13, color: 'var(--dmu)' }}>Offerte #2026-121 · Familie Bakker</div>
      {[['Badkamer slopen & afvoeren', '€ 980'], ['Leidingwerk & tegelen 14 m²', '€ 2.620'], ['Sanitair plaatsen', '€ 1.250']].map(([t, m]) => (
        <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span>{t}</span><strong style={{ color: 'var(--dk)' }}>{m}</strong>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontWeight: 800, color: 'var(--dk)' }}>
        <span>Totaal excl. btw</span><span>€ 4.850</span>
      </div>
      <div style={{ marginTop: 12, fontFamily: 'cursive', fontSize: 19, color: 'var(--dm)', borderTop: '1.5px solid var(--bstrong)', paddingTop: 6 }}>J. Bakker</div>
    </div>
  );
  if (kind === 'agenda') return (
    <div style={{ display: 'grid', gap: 10 }} aria-hidden="true">
      {[['Ma 08:00', 'Fam. Bakker — badkamer', 'green'], ['Di 13:30', 'Offerte opnemen — Utrecht', 'blue'], ['Wo 08:00', 'De Lange — schilderwerk', 'amber']].map(([tm, t, c]) => (
        <div className="mini-card" key={t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: c === 'green' ? 'var(--p)' : c === 'blue' ? 'var(--blue,#2563eb)' : 'var(--warning,#f59e0b)' }} />
          <span style={{ fontSize: 12.5, color: 'var(--dmu)', width: 64, flex: 'none' }}>{tm}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--dk)' }}>{t}</span>
        </div>
      ))}
      <div className="mini-card" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--pll)', borderColor: 'var(--pl)' }}>
        <BI.bell size={15} style={{ color: 'var(--pd)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--dm)' }}>Klant kreeg automatisch een herinnering 📅</span>
      </div>
    </div>
  );
  if (kind === 'omzet') return (
    <div style={{ display: 'grid', gap: 10 }} aria-hidden="true">
      {[['Binnen', '€ 41.900', 'var(--p)'], ['Openstaand', '€ 8.440', '#f59e0b'], ['Verwacht', '€ 14.050', 'var(--dl)']].map(([lbl, val, c]) => (
        <div className="mini-card" key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, flex: 'none' }} />
          <span style={{ flex: 1, fontSize: 13.5, color: 'var(--dmu)' }}>{lbl}</span>
          <strong style={{ color: 'var(--dk)', fontSize: 15 }}>{val}</strong>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 10 }} aria-hidden="true">
      {[['Bus 1 — Mark & Tim', 'Fam. Bakker — badkamer', 'badge-accepted', 'Onderweg'], ['Bus 2 — Sven', 'De Lange — schilderwerk', 'badge-sent', 'Gepland'], ['Jeroen', 'Verlof t/m vrijdag', 'badge-concept', 'Afwezig']].map(([who, what, bcls, btxt]) => (
        <div className="mini-card" key={who} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BI.truck size={17} style={{ color: 'var(--pd)', flex: 'none' }} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--dk)' }}>{who}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--dmu)' }}>{what}</span>
          </span>
          <span className={'badge ' + bcls}>{btxt}</span>
        </div>
      ))}
    </div>
  );
}
function Features() {
  return (
    <section className="section" id="functies" style={{ paddingTop: 60 }}>
      <div className="container">
        <Reveal className="section-head choreo-head">
          <span className="section-kicker">Functies</span>
          <h2>Alles wat je nodig hebt. Niks wat je niet snapt.</h2>
          <p>Van eerste appje tot betaalde factuur — BossBase regelt de basis.</p>
        </Reveal>
        <div className="feature-rows">
          {FEATURES.map((f, i) => {
            const Icon = BI[f.icon];
            return (
              <Reveal className={'feature-row choreo-body' + (i % 2 ? ' flip' : '')} key={f.title}>
                <div className="feature-copy">
                  <div className="feature-icon"><Icon size={22} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                  <ul className="feature-points">
                    {f.points.map(pt => <li key={pt}><BI.check size={15} strokeWidth={3} />{pt}</li>)}
                  </ul>
                </div>
                <div className="feature-frame-wrap">
                  <div className="feature-visual">
                    <div className="frame-bar"><i /><i /><i /><span>BossBase — {f.title}</span></div>
                    <div className="frame-body"><FeatureVisual kind={f.visual} /></div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Demo-sectie ─── */
const DEMO_SCREENS = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['pipeline',  'Pipeline',  'kanban'],
  ['offertes',  'Offertes',  'fileText'],
  ['agenda',    'Agenda',    'calendar'],
  ['klanten',   'Klanten',   'users'],
  ['omzet',     'Omzet',     'chart'],
];
const STATUS_BADGE = {
  concept:      ['badge-concept',  'Concept'],
  verstuurd:    ['badge-sent',     'Verstuurd'],
  geaccepteerd: ['badge-accepted', 'Geaccepteerd'],
  betaald:      ['badge-paid',     'Betaald'],
  'te laat':    ['badge-late',     'Te laat'],
};
function StatusBadge({ s }) {
  const [cls, label] = STATUS_BADGE[s];
  return <span className={'badge ' + cls}>{label}</span>;
}
const OFFERTES = [
  ['#2026-121', 'Familie Bakker — badkamer',    '€ 4.850', 'geaccepteerd'],
  ['#2026-120', 'Visser B.V. — dakkapel',       '€ 7.200', 'verstuurd'],
  ['#2026-119', 'De Wit — kozijnen schilderen', '€ 2.150', 'concept'],
  ['#2026-117', 'VvE Lindenhof — trappenhuis',  '€ 5.600', 'betaald'],
  ['#2026-112', 'Jansen — tuinrenovatie',       '€ 3.380', 'te laat'],
];
const PIPELINE = [
  ['Nieuwe lead', [['Dakkapel plaatsen', 'Utrecht · via website', '€ —'], ['Schutting vervangen', 'Amersfoort · via mail', '€ —']]],
  ['Offerte',     [['Visser B.V. — dakkapel', 'Verstuurd 3 dgn geleden', '€ 7.200'], ['De Wit — kozijnen', 'Concept', '€ 2.150']]],
  ['Akkoord',     [['Fam. Bakker — badkamer', 'Start ma 15 jun', '€ 4.850']]],
  ['Afgerond',    [['VvE Lindenhof', 'Factuur betaald', '€ 5.600'], ['Smit — gevelreiniging', 'Factuur verstuurd', '€ 1.240']]],
];
const AGENDA_DEMO = [
  ['Ma 8', [['08:00', 'Fam. Bakker — badkamer slopen', 'green'], ['13:30', 'Offerte opnemen — Dakkapel Utrecht', 'blue']]],
  ['Di 9', [['08:00', 'Fam. Bakker — leidingwerk', 'green'],     ['16:00', 'Materiaal halen — Bouwmaat', 'amber']]],
  ['Wo 10',[['08:00', 'Fam. Bakker — tegelen', 'green']]],
  ['Do 11',[['09:00', 'De Lange — buitenschilderwerk', 'blue'],  ['15:00', 'Nacalculatie VvE Lindenhof', 'amber']]],
  ['Vr 12',[['08:30', 'De Lange — buitenschilderwerk', 'blue']]],
];
const KLANTEN_DEMO = [
  ['Familie Bakker',      'Particulier · Amersfoort', '2 klussen',           '€ 6.950'],
  ['Visser B.V.',         'Bedrijf · Utrecht',         '1 offerte open',      '€ 7.200'],
  ['VvE Lindenhof',       'VvE · Amersfoort',          '3 klussen',           '€ 14.380'],
  ['De Wit',              'Particulier · Leusden',     '1 concept',           '€ 2.150'],
  ['Aannemer Kortenhoef', 'Aannemer · Hilversum',      'Vaste opdrachtgever', '€ 22.600'],
];
const OMZET_MAANDEN = [['jan',42],['feb',55],['mrt',48],['apr',70],['mei',86],['jun',64]];

function CountVal({ value }) {
  const ref = useRef(null);
  const [txt, setTxt] = useState(value);
  useEffect(() => {
    setTxt(value);
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const m = String(value).match(/^([^0-9]*)([\d.]+)(.*)$/);
    if (!m) return;
    const target = parseInt(m[2].replace(/\./g, ''), 10);
    if (!isFinite(target) || target === 0) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 900;
      const tick = now => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const n = Math.round(target * eased);
        setTxt(m[1] + n.toLocaleString('nl-NL') + m[3]);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [value]);
  return <span ref={ref}>{txt}</span>;
}
function DemoStats({ items }) {
  return (
    <div className="demo-stats-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 13, marginBottom: 18 }}>
      {items.map(([lbl, val, sub]) => (
        <div className="demo-card demo-stat" key={lbl}>
          <div className="lbl">{lbl}</div>
          <div className="val"><CountVal value={val} /></div>
          <div className="sub">{sub}</div>
        </div>
      ))}
    </div>
  );
}
function OfferteTable({ rows, toast }) {
  return (
    <div className="demo-card" style={{ overflow: 'hidden' }}>
      <table className="demo-table">
        <thead><tr><th>Nr.</th><th>Klus</th><th>Bedrag</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(([nr, klus, bedrag, status]) => (
            <tr key={nr} onClick={toast} style={{ cursor: 'pointer' }}>
              <td style={{ color: 'var(--dl)', fontWeight: 500 }}>{nr}</td>
              <td style={{ fontWeight: 600, color: 'var(--dk)' }}>{klus}</td>
              <td style={{ fontWeight: 700 }}>{bedrag}</td>
              <td><StatusBadge s={status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ScreenDashboard({ toast }) {
  return (
    <div>
      <div className="demo-h"><h3>Goedemorgen, Mark 👋</h3><button className="btn btn-p" onClick={toast}>+ Nieuwe klus</button></div>
      <DemoStats items={[['Openstaande offertes','€ 9.350','2 wachten op akkoord'],['Deze week gepland','4 klussen','Ma t/m vr'],['Omzet deze maand','€ 12.400','+18% t.o.v. mei']]} />
      <OfferteTable rows={OFFERTES.slice(0, 4)} toast={toast} />
    </div>
  );
}
function ScreenPipeline({ toast }) {
  return (
    <div>
      <div className="demo-h"><h3>Pipeline</h3><button className="btn btn-p" onClick={toast}>+ Nieuwe lead</button></div>
      <div className="pipeline-cols">
        {PIPELINE.map(([col, cards]) => (
          <div className="pipeline-col" key={col}>
            <h4><span>{col}</span><span>{cards.length}</span></h4>
            {cards.map(([t, s, m]) => (
              <div className="pipeline-card" key={t} onClick={toast}>
                <div className="t">{t}</div><div className="s">{s}</div><div className="m">{m}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
function ScreenOffertes({ toast }) {
  return (
    <div>
      <div className="demo-h"><h3>Offertes</h3><button className="btn btn-p" onClick={toast}>+ Nieuwe offerte</button></div>
      <DemoStats items={[['Geaccepteerd dit kwartaal','€ 18.230','7 offertes'],['Acceptatiegraad','68%','Boven gemiddeld']]} />
      <OfferteTable rows={OFFERTES} toast={toast} />
    </div>
  );
}
function ScreenAgenda({ toast }) {
  return (
    <div>
      <div className="demo-h"><h3>Agenda — week 24</h3><button className="btn btn-p" onClick={toast}>+ Afspraak</button></div>
      <div className="agenda-grid">
        {AGENDA_DEMO.map(([day, events]) => (
          <div className="agenda-day" key={day}>
            <h5>{day}</h5>
            {events.map(([tm, t, color]) => (
              <div className={'agenda-evt ' + color} key={t + tm} onClick={toast}>
                <span className="tm">{tm}</span>{t}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, color: 'var(--dl)', marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
        <BI.smartphone size={15} /> Je medewerkers zien hun werkbonnen automatisch op hun telefoon.
      </p>
    </div>
  );
}
function ScreenKlanten({ toast }) {
  return (
    <div>
      <div className="demo-h"><h3>Klanten</h3><button className="btn btn-p" onClick={toast}>+ Nieuwe klant</button></div>
      <div className="demo-card" style={{ overflow: 'hidden' }}>
        <table className="demo-table">
          <thead><tr><th>Naam</th><th>Type</th><th>Activiteit</th><th>Totaal</th></tr></thead>
          <tbody>
            {KLANTEN_DEMO.map(([nm, type, act, tot]) => (
              <tr key={nm} onClick={toast} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600, color: 'var(--dk)' }}>{nm}</td>
                <td style={{ color: 'var(--dmu)' }}>{type}</td>
                <td style={{ color: 'var(--dmu)' }}>{act}</td>
                <td style={{ fontWeight: 700 }}>{tot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function ScreenOmzet({ toast }) {
  const max = Math.max(...OMZET_MAANDEN.map(([, v]) => v));
  return (
    <div>
      <div className="demo-h"><h3>Omzet 2026</h3><button className="btn btn-s" onClick={toast} style={{ padding: '9px 16px', fontSize: 14 }}>Exporteren</button></div>
      <DemoStats items={[['Binnen','€ 41.900','Betaalde facturen'],['Openstaand','€ 8.440','3 facturen'],['Verwacht','€ 14.050','Geaccepteerde offertes']]} />
      <div className="demo-card">
        <div className="omzet-chart">
          {OMZET_MAANDEN.map(([m, v]) => (
            <div className="omzet-bar" key={m}>
              <i style={{ height: (v / max) * 100 + '%' }} className={m === 'mei' ? 'hot' : ''} />
              <span>{m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
const SCREEN_MAP = { dashboard: ScreenDashboard, pipeline: ScreenPipeline, offertes: ScreenOffertes, agenda: ScreenAgenda, klanten: ScreenKlanten, omzet: ScreenOmzet };

function DemoSection() {
  const [screen, setScreen] = useState('dashboard');
  const [toastOn, setToastOn] = useState(false);
  const timer = useRef(null);
  const toast = useCallback(() => {
    setToastOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastOn(false), 1800);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const Active = SCREEN_MAP[screen];
  return (
    <section className="section" id="demo" style={{ scrollMarginTop: 80 }}>
      <div className="container">
        <div className="section-head choreo-head">
          <span className="section-kicker">Probeer het zelf</span>
          <h2>Klik er zelf doorheen</h2>
          <p>Zo werkt BossBase van binnen. Navigeer vrij rond — dit voorbeeld slaat niets op.</p>
        </div>
        <div className="demo-wrap choreo-body">
          <span className="demo-tag">Voorbeeld</span>
          <nav className="demo-sidebar" aria-label="Demo navigatie">
            <span className="wordmark on-dark" style={{ fontSize: 18, padding: '6px 12px 18px', cursor: 'default' }}><span className="b1">Boss</span>Base</span>
            {DEMO_SCREENS.map(([key, label, icon]) => {
              const Icon = BI[icon];
              return (
                <button key={key} className={'demo-nav-item' + (screen === key ? ' active' : '')}
                  onClick={() => setScreen(key)} aria-current={screen === key ? 'page' : undefined}>
                  <Icon size={17} />{label}
                </button>
              );
            })}
          </nav>
          <div className="demo-main">
            <Active toast={toast} />
          </div>
          <div className={'demo-toast' + (toastOn ? ' show' : '')} role="status">Dit is een demo ✨</div>
        </div>
      </div>
    </section>
  );
}

/* ─── Voor wie ─── */
const BRANCHES = [
  ['paintRoller','Schilders'],['leaf','Hoveniers'],['hammer','Klusbedrijven'],['wrench','Installateurs'],
  ['roof','Dakdekkers'],['sparkles','Schoonmaak'],['trowel','Stukadoors'],['droplet','Loodgieters'],
];
function VoorWie() {
  return (
    <section className="section" id="voor-wie">
      <div className="container">
        <Reveal className="section-head choreo-head">
          <span className="section-kicker">Voor wie</span>
          <h2>Gemaakt voor mensen die met hun handen werken</h2>
        </Reveal>
        <Reveal className="branche-grid stagger choreo-body">
          {BRANCHES.map(([icon, label]) => {
            const Icon = BI[icon];
            return (
              <div className="branche-card" key={label}>
                <span className="ic"><Icon size={21} /></span>{label}
              </div>
            );
          })}
        </Reveal>
        <Reveal>
          <p className="branche-note">Werk je voor particulieren, bedrijven, VvE&apos;s of aannemers? BossBase past zich aan jouw manier van werken aan.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Prijzen ─── */
const TIERS = [
  { tier: 'Starter',    price: 29, who: "De startende eenpitter",                   extra: '1 gebruiker inbegrepen',               items: ['CRM-pipeline: leads & klanten','Offertes maken & versturen als PDF','Agenda & planning','1 gebruiker'],                                                                                     inherit: null,                       hot: false, btn: 'btn-s' },
  { tier: 'Vakman',     price: 39, who: "De ZZP'er of een bedrijf van 2",            extra: '+ € 10 per extra gebruiker',           items: ['Digitaal ondertekenen','Calculatie: m² / uren / materiaal','Urenregistratie','Omzetdashboard',"Foto's bij de klus",'Automatische afspraakherinneringen'],                              inherit: 'Alles van Starter, plus:', hot: true,  btn: 'btn-p glow' },
  { tier: 'Onderneming',price: 59, who: 'Grotere bedrijven met meerdere busjes',     extra: '+ € 10 per gebruiker (ook de eerste)', items: ['Team & rollen','Meerdere teams / busjes plannen','Beschikbaarheid & verlof','Nacalculatie: begroot vs. werkelijk'],                                                                    inherit: 'Alles van Vakman, plus:',  hot: false, btn: 'btn-s' },
];
function Pricing({ navigate }) {
  const [yearly, setYearly] = useState(false);
  const [showAll, setShowAll] = useState({});
  return (
    <section className="section pricing" id="prijzen" style={{ scrollMarginTop: 70 }}>
      <div className="container">
        <Reveal className="section-head choreo-head">
          <span className="section-kicker">Prijzen</span>
          <h2>Eerlijke prijs, geen verrassingen</h2>
          <p>Begin gratis. Groei wanneer jij groeit.</p>
        </Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div className="bill-toggle" role="group" aria-label="Betaalperiode">
            <button className={!yearly ? 'on' : ''} onClick={() => setYearly(false)} aria-pressed={!yearly}>Maandelijks</button>
            <button className={yearly ? 'on' : ''} onClick={() => setYearly(true)} aria-pressed={yearly}>Jaarlijks</button>
          </div>
          <span className={'bill-hook' + (yearly ? ' pop' : '')} style={{ visibility: yearly ? 'visible' : 'hidden' }}>
            <BI.sparkles size={14} /> Bij jaarlijks: gratis website erbij
          </span>
        </div>
        <Reveal className="price-grid stagger">
          {TIERS.map(t => {
            const expanded = !!showAll[t.tier];
            return (
              <div className={'price-card' + (t.hot ? ' hot' : '') + (expanded ? ' expanded' : '')} key={t.tier}>
                {t.hot && <span className="hot-badge">⭐ Meest gekozen</span>}
                <div className="tier">{t.tier}</div>
                <div className="who">{t.who}</div>
                <div className="amount"><strong>€ {t.price}</strong><span>/mnd</span></div>
                <div className="extra-user">{t.extra}</div>
                <ul>
                  {t.inherit && <li className="inherit">{t.inherit}</li>}
                  {t.items.map(it => <li key={it}><BI.check size={15} strokeWidth={3} />{it}</li>)}
                </ul>
                <button className="price-more" onClick={() => setShowAll({ ...showAll, [t.tier]: !expanded })} aria-expanded={expanded}>
                  {expanded ? 'Minder functies' : 'Bekijk alle functies'}
                  <BI.chevronDown size={15} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                </button>
                <button className={'btn ' + t.btn} onClick={() => navigate('/register')} style={{ width: '100%' }}>Start gratis</button>
              </div>
            );
          })}
        </Reveal>
        <Reveal>
          <p className="price-foot">Alle abonnementen 14 dagen gratis te proberen, geen creditcard nodig. Maandelijks opzegbaar.</p>
        </Reveal>
        <Reveal style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="btn btn-s" onClick={() => navigate('/prijzen')}>Vergelijk alle functies →</button>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Testimonials ─── */
const QUOTES = [
  ["Ik ben 's avonds geen uur meer kwijt aan administratie. Offerte maken doe ik nu in de bus, tussen twee klussen door.", 'Mark',   'Van Dijk Schilderwerken', 'MD'],
  ["Klanten tekenen 's avonds nog akkoord op hun telefoon. Vroeger wachtte ik soms weken op een handtekening.",           'Samira', 'Helder Schoonmaak',       'SH'],
  ["Mijn jongens zien 's ochtends gewoon op hun telefoon waar ze moeten zijn. Geen gebel meer om half zeven.",            'Erik',   'GroenRijk Hoveniers',     'EG'],
];
function Testimonials() {
  return (
    <section className="section">
      <div className="container">
        <Reveal className="section-head choreo-head">
          <span className="section-kicker">Vakmensen aan het woord</span>
          <h2>Minder gedoe, meer klussen</h2>
        </Reveal>
        <div className="quote-grid choreo-body">
          {QUOTES.map(([q, nm, co, init], i) => (
            <Reveal className="quote-card" key={nm} delay={i * 90}>
              <blockquote>&ldquo;{q}&rdquo;</blockquote>
              <div className="quote-who">
                <span className="quote-avatar" aria-hidden="true">{init}</span>
                <span><span className="nm" style={{ display: 'block' }}>{nm}</span><span className="co">{co}</span></span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
const FAQS = [
  ['Heb ik technische kennis nodig?',           'Nee. BossBase is gemaakt voor vakmensen, niet voor IT\'ers. Als je WhatsApp kunt gebruiken, kun je BossBase gebruiken. Je bent binnen 5 minuten klaar voor je eerste offerte.'],
  ['Kan ik mijn eigen logo op offertes zetten?', 'Ja. Je uploadt één keer je logo en bedrijfsgegevens, en elke offerte en factuur gaat automatisch in jouw huisstijl de deur uit.'],
  ['Werkt het op mijn telefoon?',                'Ja, BossBase werkt op telefoon, tablet en computer. Je medewerkers zien hun werkbonnen gewoon op hun telefoon — niks installeren.'],
  ['Kan ik maandelijks opzeggen?',               'Ja. Geen jaarcontract, geen kleine lettertjes. Je kunt elke maand opzeggen en je gegevens altijd meenemen.'],
  ['Wat krijg ik bij een jaarabonnement?',       'Bij een jaarabonnement bouwen we gratis een professionele website voor je bedrijf, met een offerteformulier dat direct in je BossBase-pipeline binnenkomt.'],
];
function Faq() {
  const [open, setOpen] = useState(-1);
  return (
    <section className="section" id="faq" style={{ background: 'var(--bgs)', borderTop: '1px solid var(--border)' }}>
      <div className="container">
        <Reveal className="section-head choreo-head">
          <span className="section-kicker">FAQ</span>
          <h2>Veelgestelde vragen</h2>
        </Reveal>
        <div className="faq-list choreo-body">
          {FAQS.map(([q, a], i) => (
            <div className="faq-item" data-open={open === i ? 'true' : 'false'} key={q}>
              <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                {q}<BI.chevronDown size={18} />
              </button>
              <div className="faq-a"><div><p>{a}</p></div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Slot-CTA ─── */
function FinalCta({ navigate }) {
  return (
    <section className="section" style={{ paddingBottom: 0 }}>
      <div className="container">
        <Reveal className="final-cta choreo-body">
          <h2>Klaar om de <span className="green">baas</span> te zijn over je bedrijf?</h2>
          <p>14 dagen gratis. Geen creditcard nodig. Binnen 5 minuten je eerste offerte.</p>
          <div className="hero-ctas" style={{ marginTop: 30, justifyContent: 'center' }}>
            <button className="btn btn-p btn-lg glow" onClick={() => navigate('/register')}>Start gratis proefperiode</button>
            <a className="btn btn-s btn-lg" href="#demo">Bekijk de demo</a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer({ navigate }) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Wordmark onDark onClick={() => navigate('/')} />
            <p className="footer-tag">Jij de baas, wij de basis. Het complete systeem voor startende vakmensen in Nederland.</p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><button onClick={() => { window.location.hash = '#functies'; }}>Functies</button></li>
              <li><button onClick={() => navigate('/prijzen')}>Prijzen</button></li>
              <li><button onClick={() => { window.location.hash = '#demo'; }}>Demo</button></li>
            </ul>
          </div>
          <div>
            <h4>Bedrijf</h4>
            <ul>
              <li><button onClick={() => navigate('/over-ons')}>Over</button></li>
              <li><button onClick={() => navigate('/contact')}>Contact</button></li>
            </ul>
          </div>
          <div>
            <h4>Juridisch</h4>
            <ul>
              <li><a href="#">Privacy</a></li>
              <li><a href="#">Voorwaarden</a></li>
              <li><a href="mailto:hallo@bossbase.nl">hallo@bossbase.nl</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 BossBase</span>
          <span>Gemaakt in Nederland 🇳🇱</span>
        </div>
      </div>
    </footer>
  );
}

/* ─── Choreo JS-fallback init ─── */
function useChoreoInit() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const PARAMS = {
      head:  { d: [0.62, 0.55, 95, -60, 0.70, 0.85, 0.30], m: [0.55, 0.50, 44, -28, 0.85, 0.92, 0.30] },
      body:  { d: [0.78, 0.40, 70, -30, 0.80, 0.94, 0.40], m: [0.68, 0.36, 36, -16, 0.90, 0.97, 0.40] },
      block: { d: [0.60, 0.45, 60, -40, 0.85, 0.92, 0.40], m: [0.55, 0.45, 30, -20, 0.93, 0.96, 0.40] },
    };
    const cl = v => v < 0 ? 0 : v > 1 ? 1 : v;

    const startJs = () => {
      const els = [];
      document.querySelectorAll('.bm .choreo, .bm .choreo-head, .bm .choreo-body').forEach(el => {
        const type = el.classList.contains('choreo-head') ? 'head' : el.classList.contains('choreo-body') ? 'body' : 'block';
        els.push([el, type]);
      });
      if (!els.length) return () => {};
      document.documentElement.classList.add('choreo-js');
      let raf = 0;
      const update = () => {
        raf = 0;
        const vh = window.innerHeight;
        const mobile = window.innerWidth <= 720;
        for (const [el, type] of els) {
          const p = PARAMS[type][mobile ? 'm' : 'd'];
          const r = el.getBoundingClientRect();
          if (r.bottom < -120 || r.top > vh + 120) continue;
          const e = 1 - Math.pow(1 - cl((vh - r.top) / (vh * p[0])), 3);
          const x = cl(1 - r.bottom / (vh * p[1]));
          const y = p[2] * (1 - e) + p[3] * x;
          const s = p[4] + (1 - p[4]) * e + (p[5] - 1) * x;
          const o = Math.min(e, 1 - (1 - p[6]) * x);
          el.style.transform = `perspective(1000px) translateY(${y.toFixed(2)}px) scale(${s.toFixed(4)})`;
          el.style.opacity = o.toFixed(3);
        }
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
      update();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (raf) cancelAnimationFrame(raf);
        document.documentElement.classList.remove('choreo-js');
        for (const [el] of els) { el.style.transform = ''; el.style.opacity = ''; }
      };
    };

    if (!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'))) {
      return startJs();
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:40%;left:0;width:2px;height:2px;pointer-events:none;opacity:0;animation:bm-choreo-flow linear both;animation-timeline:view();';
    document.body.appendChild(probe);
    let cleanup = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        let ok = false;
        try { ok = (probe.getAnimations?.() ?? []).some(a => a.currentTime !== null); } catch {}
        probe.remove();
        if (!ok) cleanup = startJs();
      });
    });
    return () => { if (cleanup) cleanup(); probe.remove(); };
  }, []);
}

/* ─── Hoofd-component ─── */
export default function HomePage({ navigate, isAuthenticated }) {
  useChoreoInit();
  return (
    <div className="bm">
      <ScrollLine />
      <Nav navigate={navigate} isAuthenticated={isAuthenticated} />
      <main>
        <Hero navigate={navigate} />
        <LogoBar />
        <ProblemSolution />
        <Features />
        <DemoSection />
        <VoorWie />
        <Pricing navigate={navigate} />
        <Testimonials />
        <Faq />
        <FinalCta navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}
