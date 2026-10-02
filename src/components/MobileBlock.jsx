import { Logo } from '../bb-shared.jsx';

// Wordt getoond i.p.v. het dashboard op smalle (mobiele) schermen. Er is geen
// app: het dashboard werkt vanaf een tablet of computer. Login/registratie, de
// ondertekenpagina en de marketingsite blijven mobiel gewoon werken (zie App.jsx).
// De oude tekst beloofde een app met een downloadknop die nergens heen ging
// (audit 2026-10-01, M36).
export default function MobileBlock({ onLogout }) {
  return (
    <div className="auth-shell" style={{ minHeight: '100dvh' }}>
      <div className="auth-card afu" style={{ textAlign: 'center' }}>
        <div className="auth-logo" style={{ justifyContent: 'center', marginBottom: 22 }}><Logo /></div>

        <div
          style={{
            display: 'inline-flex', width: 64, height: 64, borderRadius: 18,
            background: 'var(--pll, #f0fdf4)', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--p)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2.5" />
            <path d="M12 18h.01" />
          </svg>
        </div>

        <div className="auth-title" style={{ marginBottom: 8 }}>Open BossBase op een groter scherm</div>
        <div className="auth-sub" style={{ marginBottom: 22 }}>
          Het dashboard is gemaakt voor een tablet, laptop of computer. Op een telefoon is het scherm te smal; log daar in om verder te werken.
        </div>

        <div style={{ marginTop: 6, fontSize: '.82rem', color: 'var(--dmu)', lineHeight: 1.5 }}>
          Offertes en werkbonnen ondertekenen kan je klant wel gewoon op zijn telefoon.
        </div>

        {onLogout && (
          <div className="auth-link" style={{ textAlign: 'center', marginTop: 14 }}>
            <a href="#" onClick={e => { e.preventDefault(); onLogout(); }}>Uitloggen</a>
          </div>
        )}
      </div>
    </div>
  );
}
