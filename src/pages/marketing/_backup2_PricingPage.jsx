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
  x: p => <Ic d="M18 6 6 18|m6 6 12 12" {...p} />,
  chevronDown: p => <Ic d="m6 9 6 6 6-6" {...p} />,
  menu: p => <Ic d="M4 6h16|M4 12h16|M4 18h16" {...p} />,
  sparkles: p => <Ic d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z|M5 3v4|M19 17v4|M3 5h4|M17 19h4" {...p} />,
  bolt: p => <Ic d="M13 2 3 14h7l-1 8 11-13h-7l1-7z" {...p} />,
  arrowRight: p => <Ic d="M5 12h14|m12 5 7 7-7 7" {...p} />,
  mail: p => <Ic d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" {...p}><rect x="2" y="4" width="20" height="16" rx="2" /></Ic>,
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
          pathLength="1" fill="none" stroke="#1DDB62" strokeWidth="2"
          vectorEffect="non-scaling-stroke" strokeLinecap="round"
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

/* ─── Nav ─── */
const NAV_LINKS = [
  ['Home', '/', '/'],
  ['Functies', '/#functies', null],
  ['Prijzen', '/prijzen', '/prijzen'],
  ['Voor wie', '/#voor-wie', null],
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
    else { navigate('/'); }
  }, [navigate]);

  return (
    <Fragment>
      <div className={'nav' + (scrolled || open ? ' scrolled' : '')}>
        <div className="container nav-inner">
          <Wordmark onClick={() => navigate('/')} />
          <ul className="nav-links">
            {NAV_LINKS.map(([label, href, route]) => (
              <li key={label}>
                <button onClick={() => go(href, route)} aria-current={label === 'Prijzen' ? 'page' : undefined}>{label}</button>
              </li>
            ))}
          </ul>
          <div className="nav-right">
            {isAuthenticated
              ? <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Dashboard</button>
              : <button className="btn btn-ghost" onClick={() => navigate('/login')}>Inloggen</button>
            }
            <button className="btn btn-p" onClick={() => navigate('/register')}>Start gratis</button>
            <button className="hamburger" aria-label={open ? 'Menu sluiten' : 'Menu openen'} aria-expanded={open} onClick={() => setOpen(v => !v)}>
              {open ? <BI.x size={22} /> : <BI.menu size={22} />}
            </button>
          </div>
        </div>
      </div>
      <nav className={'mobile-menu' + (open ? ' open' : '')} aria-label="Mobiel menu">
        {NAV_LINKS.map(([label, , route]) => (
          <button key={label} onClick={() => { setOpen(false); if (route) navigate(route); else navigate('/'); }}>{label}</button>
        ))}
        {isAuthenticated
          ? <button onClick={() => { setOpen(false); navigate('/dashboard'); }}>Dashboard</button>
          : <button onClick={() => { setOpen(false); navigate('/login'); }}>Inloggen</button>
        }
        <button className="btn btn-p mobile-menu-cta" onClick={() => { setOpen(false); navigate('/register'); }}>Start gratis proefperiode</button>
      </nav>
    </Fragment>
  );
}

/* ─── Prijzen hero ─── */
function PriceHero() {
  return (
    <section className="price-hero">
      <div className="container" style={{ textAlign: 'center' }}>
        <span className="hero-badge" style={{ display: 'inline-flex', marginBottom: 20 }}><BI.bolt size={14} /> Eerlijke, transparante prijzen</span>
        <h1>Eerlijke prijs,<br />geen verrassingen</h1>
        <p style={{ fontSize: 18, color: 'var(--dmu)', maxWidth: 520, margin: '16px auto 0' }}>Begin gratis. Groei wanneer jij groeit. Altijd maandelijks opzegbaar.</p>
      </div>
    </section>
  );
}

/* ─── Prijskaarten ─── */
const TIERS = [
  {
    tier: 'Starter', price: 29,
    who: "De startende eenpitter",
    extra: '1 gebruiker inbegrepen',
    items: ['CRM-pipeline: leads & klanten', 'Offertes maken & versturen als PDF', 'Agenda & planning', '1 gebruiker'],
    inherit: null, hot: false, btn: 'btn-s',
  },
  {
    tier: 'Vakman', price: 39,
    who: "De ZZP'er of een bedrijf van 2",
    extra: '+ € 10 per extra gebruiker',
    items: ['Digitaal ondertekenen', 'Calculatie: m² / uren / materiaal', 'Urenregistratie', 'Omzetdashboard', "Foto's bij de klus", 'Automatische afspraakherinneringen'],
    inherit: 'Alles van Starter, plus:', hot: true, btn: 'btn-p glow',
  },
  {
    tier: 'Onderneming', price: 59,
    who: 'Grotere bedrijven met meerdere busjes',
    extra: '+ € 10 per gebruiker (ook de eerste)',
    items: ['Team & rollen', 'Meerdere teams / busjes plannen', 'Beschikbaarheid & verlof', 'Nacalculatie: begroot vs. werkelijk'],
    inherit: 'Alles van Vakman, plus:', hot: false, btn: 'btn-s',
  },
];
function PriceCards({ navigate }) {
  const [yearly, setYearly] = useState(false);
  const [showAll, setShowAll] = useState({});
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 40 }}>
          <div className="bill-toggle" role="group" aria-label="Betaalperiode">
            <button className={!yearly ? 'on' : ''} onClick={() => setYearly(false)} aria-pressed={!yearly}>Maandelijks</button>
            <button className={yearly ? 'on' : ''} onClick={() => setYearly(true)} aria-pressed={yearly}>Jaarlijks</button>
          </div>
          <span className={'bill-hook' + (yearly ? ' pop' : '')} style={{ visibility: yearly ? 'visible' : 'hidden' }}>
            <BI.sparkles size={14} /> Bij jaarlijks: gratis website erbij
          </span>
        </div>
        <div className="price-grid">
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
        </div>
        <p className="price-foot">Alle abonnementen 14 dagen gratis te proberen, geen creditcard nodig. Maandelijks opzegbaar.</p>
      </div>
    </section>
  );
}

/* ─── Vergelijkingstabel ─── */
const CK = { yes: 'yes', no: 'no', text: 'text' };
const COMPARE_CATS = [
  {
    cat: 'CRM & Leads',
    rows: [
      ['Lead-pipeline (Nieuw · Offerte · Akkoord · Afgerond)',  true,    true,    true],
      ['Leads automatisch verwerken vanuit mail of website',    true,    true,    true],
      ['Klantdossier met volledige klus-/offertegeschiedenis',  true,    true,    true],
      ['Seintje bij een offerte die blijft liggen',             true,    true,    true],
    ],
  },
  {
    cat: 'Offertes & Facturen',
    rows: [
      ['Offertes maken & versturen als PDF',                    true,    true,    true],
      ['Eigen logo & huisstijl op offerte & factuur',          true,    true,    true],
      ['Digitaal ondertekenen (rechtsgeldig)',                  false,   true,    true],
      ['Calculatie op m², uren of materiaal',                   false,   true,    true],
      ['Nacalculatie: begroot vs. werkelijk',                   false,   false,   true],
    ],
  },
  {
    cat: 'Planning & Agenda',
    rows: [
      ['Agenda & klus-planning',                               true,    true,    true],
      ['Werkbonnen op de telefoon (monteur)',                   true,    true,    true],
      ["Foto's bij de klus",                                   false,   true,    true],
      ['Automatische afspraakherinnering (sms/mail)',           false,   true,    true],
    ],
  },
  {
    cat: 'Financieel',
    rows: [
      ['Urenregistratie per klus',                             false,   true,    true],
      ['Materiaalregistratie per klus',                        false,   true,    true],
      ['Omzetdashboard (binnen / openstaand / verwacht)',       false,   true,    true],
    ],
  },
  {
    cat: 'Team',
    rows: [
      ['Aantal gebruikers',                                     '1',     '2+',    '2+'],
      ['Rollen & rechten per medewerker',                       false,   false,   true],
      ['Meerdere teams / busjes plannen',                       false,   false,   true],
      ['Beschikbaarheid & verlof bijhouden',                    false,   false,   true],
    ],
  },
  {
    cat: 'Integraties & Extra',
    rows: [
      ['Gratis website bij jaarabonnement',                     true,    true,    true],
      ['Offerteformulier koppelen aan je website',              true,    true,    true],
      ['API-koppeling (boekhoudpakket enz.)',                   false,   false,   true],
      ['Prioriteit bij support',                                false,   false,   true],
    ],
  },
];

function CellVal({ v }) {
  if (v === true)  return <span className="cell-yes"  aria-label="Inbegrepen"><BI.check size={17} strokeWidth={3} /></span>;
  if (v === false) return <span className="cell-no"   aria-label="Niet inbegrepen"><BI.x size={16} strokeWidth={2.5} /></span>;
  return <span className="cell-txt">{v}</span>;
}
function CompareTable() {
  return (
    <section className="compare-section">
      <div className="container">
        <div className="section-head" style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2>Functies vergelijken</h2>
          <p style={{ color: 'var(--dmu)' }}>Een volledig overzicht per abonnement.</p>
        </div>
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                {TIERS.map(t => (
                  <th key={t.tier} className={t.hot ? 'hot-col' : ''}>
                    {t.hot && <span className="hot-badge" style={{ display: 'block', marginBottom: 4 }}>Meest gekozen</span>}
                    {t.tier}
                    <span>€ {t.price}/mnd</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_CATS.map(({ cat, rows }) => (
                <Fragment key={cat}>
                  <tr className="cat-row"><td colSpan={4}>{cat}</td></tr>
                  {rows.map(([label, ...vals]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      {vals.map((v, i) => <td key={i}><CellVal v={v} /></td>)}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
const FAQS_PRIJZEN = [
  ['Heb ik een creditcard nodig om te starten?',      'Nee. Je kunt 14 dagen gratis proberen zonder creditcard. Je betaalt pas als je tevreden bent en wilt doorgaan.'],
  ['Kan ik tussentijds upgraden of downgraden?',      'Ja. Je kunt op elk moment overstappen naar een hoger of lager abonnement. Het verschil wordt pro-rato verrekend.'],
  ['Hoeveel gebruikers kan ik toevoegen?',             'Bij Starter is 1 gebruiker inbegrepen. Bij Vakman en Onderneming betaal je € 10 per extra gebruiker per maand. Bij Onderneming telt ook de eerste gebruiker mee.'],
  ['Wat houdt de gratis website bij jaarabonnement in?','Wij bouwen een professionele website voor jouw bedrijf, inclusief een offerteformulier dat leads direct in je BossBase-pipeline zet. Voorwaarde: jaarabonnement.'],
  ['Zijn er installatiekosten of verborgen kosten?',   'Nee. De prijs die je ziet is wat je betaalt. Geen installatiekosten, geen contractkosten, geen verborgen tarieven.'],
  ['Wat als ik wil stoppen?',                          'Je kunt op elk moment per maand opzeggen. Je gegevens kun je altijd exporteren. Geen gedoe, geen kleine lettertjes.'],
];

function PrijzenFaq() {
  const [open, setOpen] = useState(-1);
  return (
    <section className="section" style={{ background: 'var(--bgs)', borderTop: '1px solid var(--border)' }}>
      <div className="container">
        <div className="section-head" style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2>Veelgestelde vragen over de prijs</h2>
        </div>
        <div className="faq-list">
          {FAQS_PRIJZEN.map(([q, a], i) => (
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

/* ─── Slot CTA ─── */
function SlotCta({ navigate }) {
  return (
    <section className="section" style={{ paddingBottom: 0 }}>
      <div className="container">
        <div className="final-cta">
          <h2>Klaar om de <span className="green">baas</span> te zijn over je bedrijf?</h2>
          <p>14 dagen gratis. Geen creditcard nodig. Binnen 5 minuten je eerste offerte.</p>
          <div className="hero-ctas" style={{ marginTop: 30, justifyContent: 'center' }}>
            <button className="btn btn-p btn-lg glow" onClick={() => navigate('/register')}>Start gratis proefperiode</button>
            <a className="btn btn-s btn-lg" href="mailto:hallo@bossbase.nl">
              <BI.mail size={16} /> Neem contact op
            </a>
          </div>
        </div>
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
              <li><button onClick={() => navigate('/')}>Functies</button></li>
              <li><button onClick={() => navigate('/prijzen')}>Prijzen</button></li>
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

/* ─── Hoofd-component ─── */
export default function PricingPage({ navigate, isAuthenticated }) {
  return (
    <div className="bm">
      <ScrollLine />
      <Nav navigate={navigate} isAuthenticated={isAuthenticated} />
      <main>
        <PriceHero />
        <PriceCards navigate={navigate} />
        <CompareTable />
        <PrijzenFaq />
        <SlotCta navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}
