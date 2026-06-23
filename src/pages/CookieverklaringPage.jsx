import { Logo } from '../bb-shared.jsx';

// Placeholder zodat de link in de cookiebanner niet naar een 404 gaat.
export function CookieverklaringPage({ navigate }) {
  return (
    <div className="auth-shell">
      <div className="auth-card afu" style={{ textAlign: 'center' }}>
        <div className="auth-logo"><Logo /></div>
        <div className="auth-title" style={{ marginTop: 8 }}>Cookieverklaring</div>
        <div className="auth-sub" style={{ marginTop: 6 }}>
          Cookieverklaring volgt binnenkort.
        </div>
        <button
          className="btn btn-s btn-sm"
          style={{ marginTop: 20 }}
          onClick={() => (navigate ? navigate('/') : window.history.back())}
        >
          ← Terug
        </button>
      </div>
    </div>
  );
}
