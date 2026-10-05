// ── Terug van Moneybird (OAuth) ────────────────────────────────────────────
// Moneybird stuurt de browser na het inloggen naar /dashboard/koppelen/moneybird
// met ?code=&state= (die URL staat zo geregistreerd bij de app op moneybird.com).
// Die pagina bestaat niet als scherm: App.jsx bewaart code en state en zet de URL
// om naar het tabblad Integraties, waar InstellingenPage de koppeling afrondt.
// sessionStorage, zodat het ook een tussentijdse inlog overleeft.

const SLEUTEL = 'bb.moneybirdTerug';
export const MONEYBIRD_TERUG_PARAM = 'moneybird';

/** Draait bij het laden van de app, vóórdat de router de URL leest. */
export function vangMoneybirdTerug(basispad) {
  try {
    if (window.location.pathname !== `${basispad}/koppelen/moneybird`) return;
    const q = new URLSearchParams(window.location.search);
    sessionStorage.setItem(SLEUTEL, JSON.stringify({
      code: q.get('code') || '', state: q.get('state') || '', fout: q.get('error') || '',
    }));
    window.history.replaceState(window.history.state, '',
      `${basispad}/instellingen?tab=integraties&${MONEYBIRD_TERUG_PARAM}=terug`);
  } catch { /* geen sessionStorage of history: dan landt de klant gewoon op het dashboard */ }
}

/** Geeft de bewaarde terugkeer één keer terug en wist hem. */
export function neemMoneybirdTerug() {
  try {
    const ruw = sessionStorage.getItem(SLEUTEL);
    sessionStorage.removeItem(SLEUTEL);
    return ruw ? JSON.parse(ruw) : null;
  } catch {
    return null;
  }
}
