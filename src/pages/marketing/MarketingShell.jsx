import { useEffect, useState } from 'react';
import './marketing.css';

/* ─── Brand mark + wordmark (custom for marketing, paper-ink palette) ─── */
function MktBrand({ onClick }) {
  return (
    <button className="mkt-brand" onClick={onClick} aria-label="BossBase home">
      <span className="mkt-brand-mark" aria-hidden="true" />
      <span><b>Boss</b><em>Base</em></span>
    </button>
  );
}

const NAV = [
  { id: 'home',       label: 'Home',        href: '/'         },
  { id: 'functies',   label: 'Functies',    href: '/functies' },
  { id: 'prijzen',    label: 'Prijzen',     href: '/prijzen'  },
  { id: 'voor-wie',   label: 'Voor wie',    href: '/voor-wie' },
  { id: 'over-ons',   label: 'Over',        href: '/over-ons' },
  { id: 'contact',    label: 'Contact',     href: '/contact'  },
];

export default function MarketingShell({ navigate, active, children, isAuthenticated = false, scrollLine = null }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Scroll reveal — observes anything with .mkt-rev within the shell.
  // Failsafe: any element still hidden after 1.4s is force-revealed, so
  // headless screenshots and unusual viewport sizes never leave a gap.
  useEffect(() => {
    const els = document.querySelectorAll('.mkt-rev');
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.08, rootMargin: '0px 0px -10% 0px' }
    );
    els.forEach(el => io.observe(el));
    const fallback = setTimeout(() => {
      document.querySelectorAll('.mkt-rev:not(.is-in)').forEach(el => el.classList.add('is-in'));
    }, 1400);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, [children]);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  const go = path => {
    setMobileOpen(false);
    navigate(path);
  };

  return (
    <div className="mkt">
      <div className="mkt-shell">
        {scrollLine}
        {/* ── NAV ────────────────────────────────────────────── */}
        <nav className="mkt-nav">
          <div className="mkt-nav-in">
            <MktBrand onClick={() => go('/')} />

            <div className="mkt-nav-links">
              {NAV.map(n => (
                <button
                  key={n.id}
                  className={`mkt-nav-link${active === n.id ? ' is-active' : ''}`}
                  onClick={() => go(n.href)}
                >
                  {n.label}
                </button>
              ))}
            </div>

            <div className="mkt-nav-right">
              {isAuthenticated ? (
                <button className="mkt-nav-login" onClick={() => navigate('/dashboard')}>
                  Dashboard →
                </button>
              ) : (
                <button className="mkt-nav-login" onClick={() => navigate('/login')}>
                  Inloggen
                </button>
              )}
              <button className="mkt-btn mkt-btn--primary mkt-btn--sm" onClick={() => navigate('/register')}>
                <span className="mkt-btn-dot" aria-hidden="true" />
                Start gratis
              </button>
              <button className="mkt-burger" onClick={() => setMobileOpen(v => !v)} aria-label="Menu">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {mobileOpen
                    ? <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                    : <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />}
                </svg>
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile menu lives OUTSIDE the nav — the nav has `backdrop-filter`
            which makes it a containing block for position:fixed children,
            collapsing the full-height overlay. As a sibling it positions
            relative to the viewport as intended. */}
        {mobileOpen && (
          <div className="mkt-mobile-menu" role="dialog" aria-label="Navigatie">
            {NAV.map(n => (
              <button key={n.id} onClick={() => go(n.href)}>
                {n.label}
              </button>
            ))}
            <button className="mkt-btn mkt-btn--primary" onClick={() => go('/register')}>
              <span className="mkt-btn-dot" />
              Start gratis
            </button>
            <button className="mkt-btn mkt-btn--ghost" onClick={() => go('/login')}>
              Inloggen
            </button>
          </div>
        )}

        {/* ── PAGE CONTENT ──────────────────────────────────── */}
        <main>{children}</main>

        {/* ── FOOTER ────────────────────────────────────────── */}
        <footer className="mkt-foot">
          <div className="mkt-c">
            <div className="mkt-foot-grid">
              <div className="mkt-foot-brand">
                <MktBrand onClick={() => go('/')} />
                <p>
                  De rustige plek waar je leads, offertes, planning en facturen
                  bij elkaar komen. Gebouwd in Nederland voor vakmensen.
                </p>
              </div>

              <div className="mkt-foot-col">
                <h5>Product</h5>
                <ul>
                  <li><button onClick={() => go('/functies')}>Functies</button></li>
                  <li><button onClick={() => go('/prijzen')}>Prijzen</button></li>
                  <li><button onClick={() => go('/voor-wie')}>Voor wie</button></li>
                  <li><button onClick={() => go('/demo')}>Demo</button></li>
                </ul>
              </div>

              <div className="mkt-foot-col">
                <h5>Bedrijf</h5>
                <ul>
                  <li><button onClick={() => go('/over-ons')}>Over BossBase</button></li>
                  <li><button onClick={() => go('/contact')}>Contact</button></li>
                  <li><button onClick={() => go('/register')}>Aanmelden</button></li>
                  <li><button onClick={() => go('/login')}>Inloggen</button></li>
                </ul>
              </div>

              <div className="mkt-foot-col">
                <h5>Juridisch</h5>
                <ul>
                  <li><a href="#">Privacy</a></li>
                  <li><a href="#">Voorwaarden</a></li>
                  <li><a href="#">Cookies</a></li>
                  <li><a href="#">Verwerking</a></li>
                </ul>
              </div>
            </div>

            <div className="mkt-foot-rule" />

            <div className="mkt-foot-bot">
              <span>© {new Date().getFullYear()} BossBase B.V. — Gemaakt in Nederland.</span>
              <div className="mkt-foot-social">
                <a href="#" aria-label="LinkedIn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14zM8 17v-7H6v7h2zM7 9a1 1 0 100-2 1 1 0 000 2zm11 8v-4c0-1.7-1.3-3-3-3-.8 0-1.5.4-2 1V10h-2v7h2v-3.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5V17h2z"/>
                  </svg>
                </a>
                <a href="#" aria-label="X">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231z"/>
                  </svg>
                </a>
                <a href="#" aria-label="Instagram">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="5"/>
                    <circle cx="12" cy="12" r="4"/>
                    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
