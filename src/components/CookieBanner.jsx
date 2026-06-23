import { useEffect, useState } from 'react';

// ── Consent-opslag ───────────────────────────────────────────────────────────
// localStorage key 'cookie_consent' = 'all' | 'necessary'.
const KEY = 'cookie_consent';
const OPEN_EVENT = 'bb:open-cookie-banner';

function readConsent() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

// Helper voor later gebruik (bijv. analytics): hasConsent('all') / hasConsent('necessary').
// Noodzakelijke cookies zijn altijd actief, dus 'necessary' is true zodra er een keuze is.
export function hasConsent(type) {
  const v = readConsent();
  if (type === 'necessary') return v === 'all' || v === 'necessary';
  if (type === 'all') return v === 'all';
  return false;
}

export function getConsent() {
  return readConsent();
}

// Heropent de banner (gebruikt door "Cookievoorkeuren" in Instellingen).
export function openCookieBanner() {
  try { window.dispatchEvent(new Event(OPEN_EVENT)); } catch { /* ignore */ }
}

// ── Banner-component ─────────────────────────────────────────────────────────
export function CookieBanner({ navigate }) {
  const [open, setOpen] = useState(() => !readConsent());

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const choose = (value) => {
    try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  const goVerklaring = (e) => {
    if (navigate) {
      e.preventDefault();
      navigate('/cookieverklaring');
    }
  };

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookievoorkeuren" aria-live="polite">
      <div className="cookie-banner-inner">
        <div className="cookie-banner-txt">
          We gebruiken cookies om BossBase goed te laten werken en je ervaring te
          verbeteren. Functionele cookies zijn altijd actief.{' '}
          <a href="/cookieverklaring" onClick={goVerklaring}>Lees meer in onze cookieverklaring</a>.
        </div>
        <div className="cookie-banner-actions">
          <button type="button" className="btn btn-s" onClick={() => choose('necessary')}>
            Alleen noodzakelijk
          </button>
          <button type="button" className="btn btn-p" onClick={() => choose('all')}>
            Alles accepteren
          </button>
        </div>
      </div>
    </div>
  );
}
