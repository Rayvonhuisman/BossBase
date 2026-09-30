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
export function CookieBanner() {
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

  // Eerlijk over wat er gebeurt: er is geen tracking en niets dat een
  // toestemming aan- of uitzet. Alleen noodzakelijke opslag (inlogsessie) en
  // voorkeuren. Daarom informeren, geen schijnkeuze. Komt er ooit analytics die
  // toestemming vraagt, zet dan hier weer een keuze en gebruik hasConsent().
  // Geen link naar /cookieverklaring zolang die pagina geen inhoud heeft.
  return (
    <div className="cookie-banner" role="dialog" aria-label="Opslag in je browser" aria-live="polite">
      <div className="cookie-banner-inner">
        <div className="cookie-banner-txt">
          BossBase gebruikt geen tracking- of advertentiecookies. In je browser bewaren we alleen wat nodig is:
          je inlogsessie en je voorkeuren, zoals hoe je lijsten wilt zien.
        </div>
        <div className="cookie-banner-actions">
          <button type="button" className="btn btn-p" onClick={() => choose('necessary')}>
            Begrepen
          </button>
        </div>
      </div>
    </div>
  );
}
