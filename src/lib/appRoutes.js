// Welke paden horen bij de app (dashboard, inloggen, klantlinks) en welke bij
// de openbare website?
//
// Eén lijst, gebruikt door drie plekken die het eens moeten zijn:
//   - src/main.jsx kiest hiermee welke bundle hij laadt;
//   - scripts/prerender.mjs controleert dat vercel.json precies deze paden naar
//     app.html stuurt (en dus niet naar een 404);
//   - App.jsx stuurt alles wat hier níet in staat terug naar de website.
//
// Alles wat niet in deze lijst staat is website: een gerenderde pagina, of een
// echte 404. Voeg je een route toe aan App.jsx, zet hem dan hier én in de
// rewrites en headers van vercel.json.

// Exacte paden.
export const APP_PATHS = [
  '/login',
  '/register',
  '/reset-password',
  '/betaald',
  '/betaling-geannuleerd',
  '/superadmin',
  '/cookieverklaring',
];

// Paden met alles eronder. '/dashboard' matcht '/dashboard' en
// '/dashboard/facturen', maar niet '/dashboardje'.
export const APP_PREFIXES = [
  '/dashboard',
  '/demo',
  '/uitnodiging',
  '/offerte',
  '/werkbon',
  '/betaal',
];

export function isAppPath(pathname) {
  const pad = (pathname || '/').replace(/\/+$/, '') || '/';
  if (APP_PATHS.includes(pad)) return true;
  return APP_PREFIXES.some(p => pad === p || pad.startsWith(p + '/'));
}
