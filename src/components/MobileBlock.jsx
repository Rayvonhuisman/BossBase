import { Logo } from '../bb-shared.jsx';

// Wordt getoond i.p.v. het dashboard op smalle (mobiele) schermen. Het
// dashboard is verplaatst naar een aparte app; op de telefoon sturen we de
// gebruiker daarheen. Login/registratie, de ondertekenpagina en de
// marketingsite blijven mobiel gewoon werken (zie App.jsx).
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

        <div className="auth-title" style={{ marginBottom: 8 }}>Download de BossBase app</div>
        <div className="auth-sub" style={{ marginBottom: 22 }}>
          BossBase werkt het beste in onze app. Download de app om verder te gaan op je telefoon.
        </div>

        <a href="#" className="auth-submit" style={{ display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
          Download de app
        </a>

        <div style={{ marginTop: 18, fontSize: '.82rem', color: 'var(--dmu)', lineHeight: 1.5 }}>
          Of gebruik BossBase op je computer.
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
